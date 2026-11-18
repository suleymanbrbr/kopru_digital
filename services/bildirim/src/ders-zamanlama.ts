import { YenidenDene } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import type { Islem } from './ortak.js';
import { VARSAYILAN_SAAT_DILIMI } from './ortak.js';
import { VARSAYILAN_AYARLAR, yerelParcalar, yerelden } from './tercih.js';
import {
  KAYNAK_DERS,
  KAYNAK_OGRETMEN_GUN,
  iptalEt,
  turetilmisId,
  uretilmisiGizle,
  zamanla,
} from './zamanlama.js';

/**
 * Ders olaylarindan beslenen zamanlama mantigi (esleme `eslemeler/ders-degisti.ts` ve yoklama eslemesi kullanir):
 *
 * - `ders_planlari`: ders basina tek satir (kopya); sabah ozeti ve geri bildirim icin.
 * - `ders_hatirlatma`: ogrenci basina `gonderim_at = baslangic_at - ders_hatirlatma_dk` (0 = kapali).
 * - `ders_geri_bildirim`: ogrenci basina `bitis_at + 10 dk`; ders `tamamlandi` olunca uretilir (job kontrol eder).
 * - `ogretmen_sabah`: ogretmenin gunu icin tek satir, `gonderim_at = gunun ilk dersi - 30 dk`.
 */

export const SABLON_HATIRLATMA = 'ders_hatirlatma';
export const SABLON_GERI_BILDIRIM = 'ders_geri_bildirim';
export const SABLON_SABAH = 'ogretmen_sabah';
/** Ders bitisinden geri bildirim istegine kadar (sartname: 10 dk). */
export const GERI_BILDIRIM_GECIKME_DK = 10;
/** Geri bildirim istegi bu sureden sonra anlamsizdir (API guncelleme penceresi: dersten sonra 24 saat). */
export const GERI_BILDIRIM_PENCERE_SAAT = 24;
/** Sabah ozeti: gunun ilk dersinden bu kadar dakika once. */
export const SABAH_ONCESI_DK = 30;

const DK = 60_000;
const dkEkle = (t: Date, dakika: number) => new Date(t.getTime() + dakika * DK);

export interface DersZarfi {
  id: string;
  kurumId: string;
  occurredAt: string;
  data: {
    ders_id: string;
    degisim_turu: string;
    ogretmen_id: string;
    baslangic_at: string;
    bitis_at: string;
    onceki_baslangic_at: string | null;
    durum: 'planli' | 'tamamlandi' | 'iptal';
    ogrenci_idleri: string[];
    parca_no: number;
  };
}

export interface PlanSonucu {
  /** `false`: olay, kopyadaki daha yeni bir durumdan eski ve farkli (artik gecersiz); zamanlama yapilmaz. */
  uygulandi: boolean;
  onceki: { ogretmenId: string; baslangicAt: Date } | null;
}

interface PlanSatiri extends Record<string, unknown> {
  ogretmen_id: string;
  baslangic_at: string;
  bitis_at: string;
  durum: string;
  yeni_mi: boolean;
}

/**
 * Ders planini yazar. Sira (`occurredAt`, olay kimligi): daha eski olay yeni durumu ezmez. Ayni dersin
 * parcalari (ayni durum) her sirada uygulanir.
 */
export async function dersPlaniYaz(tx: Islem, olay: DersZarfi): Promise<PlanSonucu> {
  const d = olay.data;
  const [m] = await tx.execute<PlanSatiri>(sql`
    select ogretmen_id, baslangic_at::text as baslangic_at, bitis_at::text as bitis_at, durum,
           ((son_olay_at, son_olay_id) <= (${olay.occurredAt}::timestamptz, ${olay.id}::uuid)) as yeni_mi
      from bildirim.ders_planlari where ders_id = ${d.ders_id} for update`);
  if (!m) {
    await tx.execute(sql`
      insert into bildirim.ders_planlari
        (ders_id, kurum_id, ogretmen_id, baslangic_at, bitis_at, durum, son_olay_at, son_olay_id)
      values (${d.ders_id}, ${olay.kurumId}, ${d.ogretmen_id}, ${d.baslangic_at}::timestamptz,
              ${d.bitis_at}::timestamptz, ${d.durum}, ${olay.occurredAt}::timestamptz, ${olay.id})`);
    return { uygulandi: true, onceki: null };
  }
  const onceki = { ogretmenId: m.ogretmen_id, baslangicAt: new Date(m.baslangic_at) };
  const ayniDurum =
    m.durum === d.durum &&
    m.ogretmen_id === d.ogretmen_id &&
    new Date(m.baslangic_at).getTime() === new Date(d.baslangic_at).getTime() &&
    new Date(m.bitis_at).getTime() === new Date(d.bitis_at).getTime();
  if (!m.yeni_mi) return { uygulandi: ayniDurum, onceki };
  await tx.execute(sql`
    update bildirim.ders_planlari
       set ogretmen_id = ${d.ogretmen_id}, baslangic_at = ${d.baslangic_at}::timestamptz,
           bitis_at = ${d.bitis_at}::timestamptz, durum = ${d.durum},
           son_olay_at = ${olay.occurredAt}::timestamptz, son_olay_id = ${olay.id}
     where ders_id = ${d.ders_id}`);
  return { uygulandi: true, onceki };
}

// --- Alici bilgisi ------------------------------------------------------------------------------

export interface AliciAyari {
  uyelikId: string;
  kullaniciId: string;
  aktif: boolean;
  dersHatirlatmaDk: number;
  saatDilimi: string;
}

/** Uyeliklerin kullanici/durum/ayar bilgisi. Kopyasi henuz olmayan uyelik icin `YenidenDene` (sonra tekrar denenir). */
export async function aliciAyarlari(
  tx: Islem,
  kurumId: string,
  uyelikIdleri: readonly string[],
): Promise<Map<string, AliciAyari>> {
  const harita = new Map<string, AliciAyari>();
  if (uyelikIdleri.length === 0) return harita;
  const satirlar = await tx.execute<{
    uyelik_id: string;
    kullanici_id: string;
    durum: string;
    dk: number | null;
    saat_dilimi: string | null;
  }>(sql`
    select u.uyelik_id, u.kullanici_id, u.durum, a.ders_hatirlatma_dk::int as dk, a.saat_dilimi
      from bildirim.uyelik_kopyalari u
      left join bildirim.kullanici_ayarlari a on a.kullanici_id = u.kullanici_id and a.kurum_id = u.kurum_id
     where u.kurum_id = ${kurumId} and u.uyelik_id = any(${`{${[...new Set(uyelikIdleri)].join(',')}}`}::uuid[])`);
  for (const s of satirlar) {
    harita.set(s.uyelik_id, {
      uyelikId: s.uyelik_id,
      kullaniciId: s.kullanici_id,
      aktif: s.durum === 'aktif',
      dersHatirlatmaDk: s.dk ?? VARSAYILAN_AYARLAR.ders_hatirlatma_dk,
      saatDilimi: s.saat_dilimi ?? VARSAYILAN_SAAT_DILIMI,
    });
  }
  const eksik = uyelikIdleri.find((u) => !harita.has(u));
  if (eksik) throw new YenidenDene(`alıcı üyelik kopyası henüz yok (${eksik})`);
  return harita;
}

// --- Hatirlatma ve geri bildirim --------------------------------------------------------------

export const hatirlatmaTekilOnegi = (dersId: string) => `${SABLON_HATIRLATMA}:${dersId}:`;

/**
 * Planli ders icin ogrenci basina hatirlatma ve geri bildirim satirlarini ekler/gunceller (erteleme dahil).
 * Gecmise dusen hatirlatma uretilmez; kapali (`0`) ayar satiri iptal yazar.
 */
export async function ogrencileriZamanla(tx: Islem, olay: DersZarfi, simdi: Date): Promise<void> {
  const d = olay.data;
  if (d.durum === 'iptal' || d.ogrenci_idleri.length === 0) return;
  const baslangic = new Date(d.baslangic_at);
  const bitis = new Date(d.bitis_at);
  const alicilar = await aliciAyarlari(tx, olay.kurumId, d.ogrenci_idleri);
  for (const uyelikId of [...new Set(d.ogrenci_idleri)]) {
    const a = alicilar.get(uyelikId);
    if (!a?.aktif) continue;
    const temel = {
      kurumId: olay.kurumId,
      kaynakTuru: KAYNAK_DERS,
      kaynakId: d.ders_id,
      aliciId: uyelikId,
    };
    if (d.durum === 'planli') {
      await zamanla(
        tx,
        {
          ...temel,
          sablonKodu: SABLON_HATIRLATMA,
          gonderimAt: dkEkle(baslangic, -a.dersHatirlatmaDk),
          veri: { ders_id: d.ders_id, baslangic_at: d.baslangic_at, bitis_at: d.bitis_at },
        },
        simdi,
        { kapali: a.dersHatirlatmaDk === 0 },
      );
    }
    // Geri bildirim: gecmisi atlama yok (ders tamamlaninca zaten gecmis bir zamanda uretilir); pencere kontrolu job'da.
    const pencereBitisi = dkEkle(bitis, GERI_BILDIRIM_PENCERE_SAAT * 60);
    if (pencereBitisi.getTime() > simdi.getTime()) {
      await zamanla(
        tx,
        {
          ...temel,
          sablonKodu: SABLON_GERI_BILDIRIM,
          gonderimAt: dkEkle(bitis, GERI_BILDIRIM_GECIKME_DK),
          veri: { ders_id: d.ders_id, bitis_at: d.bitis_at },
        },
        simdi,
        { gecmisiAtla: false },
      );
    }
  }
}

/** Ders iptal edildi: bekleyen hatirlatma ve geri bildirim satirlari iptal, uretilmis hatirlatma gizlenir. */
export async function dersiIptalEt(
  tx: Islem,
  kurumId: string,
  dersId: string,
  simdi: Date,
): Promise<void> {
  await iptalEt(tx, { kurumId, kaynakTuru: KAYNAK_DERS, kaynakId: dersId, nedeni: 'ders' }, simdi);
  await uretilmisiGizle(
    tx,
    { kurumId, sablonKodu: SABLON_HATIRLATMA, tekilOnek: hatirlatmaTekilOnegi(dersId) },
    simdi,
  );
}

/** Erteleme: onceki zamanda uretilmis hatirlatma kutuda gizlenir (yeni zamanin hatirlatmasi ayri `tekil_anahtar`). */
export async function eskiHatirlatmayiGizle(
  tx: Islem,
  kurumId: string,
  dersId: string,
  simdi: Date,
  aliciIdleri: readonly string[],
): Promise<void> {
  if (aliciIdleri.length === 0) return;
  await uretilmisiGizle(
    tx,
    {
      kurumId,
      sablonKodu: SABLON_HATIRLATMA,
      tekilOnek: hatirlatmaTekilOnegi(dersId),
      aliciIdleri,
    },
    simdi,
  );
}

/**
 * Yoklama sonucu ders sonu geri bildirimine etki eder: `gelmedi`/`izinli` ogrenciye istek gitmez; sonradan
 * `geldi`/`gec`e duzeltilirse (yoklama nedeniyle iptal edilmisse) yeniden etkinlesir.
 */
export async function yoklamaGeriBildirimeEtki(
  tx: Islem,
  g: { kurumId: string; dersId: string; ogrenciId: string; katildi: boolean },
  simdi: Date,
): Promise<void> {
  if (!g.katildi) {
    await iptalEt(
      tx,
      {
        kurumId: g.kurumId,
        kaynakTuru: KAYNAK_DERS,
        kaynakId: g.dersId,
        nedeni: 'yoklama',
        aliciIdleri: [g.ogrenciId],
        sablonKodlari: [SABLON_GERI_BILDIRIM],
      },
      simdi,
    );
    return;
  }
  await tx.execute(sql`
    update bildirim.zamanlanmis_bildirimler set iptal_at = null, iptal_nedeni = null
     where kurum_id = ${g.kurumId} and kaynak_turu = ${KAYNAK_DERS} and kaynak_id = ${g.dersId}
       and alici_id = ${g.ogrenciId} and sablon_kodu = ${SABLON_GERI_BILDIRIM}
       and iptal_nedeni = 'yoklama' and uretildi_at is null`);
}

/**
 * Kullanici `ders_hatirlatma_dk` ayarini degistirdi: bekleyen hatirlatmalar yeni degerle yeniden hesaplanir
 * (0 = kapali: iptal; sonradan acilirsa yeniden etkinlesir; zamani gecmis olanlar iptal).
 */
export async function hatirlatmaAyariDegisti(
  tx: Islem,
  kurumId: string,
  kullaniciId: string,
  dakika: number,
  simdi: Date,
): Promise<void> {
  const satirlar = await tx.execute<{ id: string; baslangic_at: string | null }>(sql`
    select z.id, z.veri->>'baslangic_at' as baslangic_at
      from bildirim.zamanlanmis_bildirimler z
      join bildirim.uyelik_kopyalari u on u.uyelik_id = z.alici_id and u.kurum_id = z.kurum_id
     where z.kurum_id = ${kurumId} and u.kullanici_id = ${kullaniciId}
       and z.kaynak_turu = ${KAYNAK_DERS} and z.sablon_kodu = ${SABLON_HATIRLATMA}
       and z.uretildi_at is null and (z.iptal_at is null or z.iptal_nedeni in ('ayar', 'gecmis'))
     for update of z`);
  for (const s of satirlar) {
    if (!s.baslangic_at) continue;
    const yeniAt = dkEkle(new Date(s.baslangic_at), -dakika);
    const nedeni = dakika === 0 ? 'ayar' : yeniAt.getTime() <= simdi.getTime() ? 'gecmis' : null;
    await tx.execute(sql`
      update bildirim.zamanlanmis_bildirimler
         set gonderim_at = ${yeniAt.toISOString()}::timestamptz,
             iptal_at = ${nedeni ? simdi.toISOString() : null}::timestamptz,
             iptal_nedeni = ${nedeni}
       where id = ${s.id}`);
  }
}

// --- Ogretmen sabah ozeti -----------------------------------------------------------------------

async function ogretmenBilgisi(
  tx: Islem,
  kurumId: string,
  ogretmenId: string,
): Promise<AliciAyari | undefined> {
  const m = await aliciAyarlari(tx, kurumId, [ogretmenId]);
  return m.get(ogretmenId);
}

/**
 * Ogretmenin verilen anlarin yerel gunleri icin sabah ozeti satirlarini yeniden hesaplar: o gunku planli
 * ders sayisi ve ilk ders; ders kalmadiysa ya da zaman gectiyse satir iptal edilir.
 */
export async function sabahiYenile(
  tx: Islem,
  kurumId: string,
  ogretmenId: string,
  anlar: readonly Date[],
  simdi: Date,
): Promise<void> {
  const o = await ogretmenBilgisi(tx, kurumId, ogretmenId);
  if (!o?.aktif) return;
  // Ayni ogretmenin ders olaylari eszamanli islenirse (tuketici paralelligi) her islem digerinin henuz
  // islenmemis dersini goremez: ogretmen basina islem kilidi ve kilit sonrasi (yeni anlik goruntu) sayim.
  await tx.execute(sql`select pg_advisory_xact_lock(727005, hashtext(${ogretmenId}))`);
  const gunler = new Map<string, { yil: number; ay: number; gun: number }>();
  for (const an of anlar) {
    const y = yerelParcalar(an, o.saatDilimi);
    gunler.set(
      `${String(y.yil)}-${String(y.ay).padStart(2, '0')}-${String(y.gun).padStart(2, '0')}`,
      y,
    );
  }
  for (const [gunAnahtari, y] of gunler) {
    const gunBasi = yerelden(y.yil, y.ay, y.gun, 0, o.saatDilimi);
    const gunSonu = yerelden(y.yil, y.ay, y.gun + 1, 0, o.saatDilimi);
    const [ozet] = await tx.execute<{ n: number; ilk: string | null }>(sql`
      select count(*)::int as n, min(baslangic_at)::text as ilk
        from bildirim.ders_planlari
       where kurum_id = ${kurumId} and ogretmen_id = ${ogretmenId} and durum <> 'iptal'
         and baslangic_at >= ${gunBasi.toISOString()}::timestamptz
         and baslangic_at < ${gunSonu.toISOString()}::timestamptz`);
    const kaynakId = turetilmisId('ogretmen_gun', ogretmenId, gunAnahtari);
    if (!ozet?.n || !ozet.ilk) {
      await iptalEt(
        tx,
        { kurumId, kaynakTuru: KAYNAK_OGRETMEN_GUN, kaynakId, nedeni: 'gun' },
        simdi,
      );
      continue;
    }
    const ilk = new Date(ozet.ilk);
    await zamanla(
      tx,
      {
        kurumId,
        kaynakTuru: KAYNAK_OGRETMEN_GUN,
        kaynakId,
        aliciId: ogretmenId,
        sablonKodu: SABLON_SABAH,
        gonderimAt: dkEkle(ilk, -SABAH_ONCESI_DK),
        veri: {
          gun: gunAnahtari,
          ders_sayisi: ozet.n,
          ilk_baslangic_at: ilk.toISOString(),
          gun_bitis_at: gunSonu.toISOString(),
        },
      },
      simdi,
    );
  }
}
