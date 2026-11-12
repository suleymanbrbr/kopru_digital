import { motivasyonSeriBozuldiV1, motivasyonSeriKilometreTasiV1 } from '@kopru/contracts';
import { publishInTx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { OUTBOX_TABLOSU, SISTEM_AKTORU, yeniId, type IsBaglami, type Islem } from './ortak.js';
import { kozmetikleriAc, rozetleriDegerlendir, sayacArtir, sayacEnAz } from './xp-cekirdek.js';

/**
 * Seri (streak) cekirdegi (docs/schema/motivasyon.md "Seri"). Butun islemler cagiranin acik islemi
 * icindedir; cagiran `ogrenciKilitle` ile ogrenci kilidini almis olmalidir (olay tuketicisi `hazirla`,
 * gece/risk isleri kendi islemlerinde alir).
 *
 * Kurallar kisaca: gun, aktivite sayaclari esige ulasinca ilk kez `aktif` yazilir; `mevcut_seri`
 * `seri_gunleri`nden turetilir (aktif/onarim sayilir, dondurma/duraklatma zinciri kirmaz, kacirildi ve
 * kayit olmayan gun kirar); onarim kacirilan gunu izleyen gunde gunluk hedefin 2 katiyla olur.
 */

export const SERI_KILOMETRE_SAYACI = 'seri_kilometre_tasi';
export const SERI_RISK_SAYACI = 'seri_risk_gun';

export interface SeriAyarlari {
  planEsigi: number;
  odakDkEsigi: number;
  odevEsigi: number;
  soruEsigi: number;
  dondurmaHaftalik: number;
  dondurmaAzami: number;
  kilometreTaslari: number[];
  /** Yerel saat (4..23); `seri.risk_saati` ayari, yoksa 20 (sartname). */
  riskSaati: number;
}

export async function seriAyarlariOku(tx: Islem): Promise<SeriAyarlari> {
  const satirlar = await tx.execute<{ anahtar: string; deger: unknown }>(sql`
    select anahtar, deger from motivasyon.motivasyon_ayarlari
     where anahtar like 'seri.%'`);
  const m = new Map(satirlar.map((s) => [s.anahtar, s.deger]));
  const sayi = (anahtar: string, varsayilan: number) => {
    const d = m.get(anahtar);
    return typeof d === 'number' && Number.isFinite(d) ? d : varsayilan;
  };
  const taslar = m.get('seri.kilometre_taslari');
  const kilometreTaslari = (
    Array.isArray(taslar)
      ? taslar.filter((x): x is number => typeof x === 'number')
      : [3, 7, 14, 30, 60, 100, 365]
  ).sort((a, b) => a - b);
  return {
    planEsigi: Math.max(1, sayi('seri.plan_esigi', 1)),
    odakDkEsigi: Math.max(1, sayi('seri.odak_dk_esigi', 20)),
    odevEsigi: Math.max(1, sayi('seri.odev_esigi', 1)),
    soruEsigi: Math.max(1, sayi('seri.soru_esigi', 1)),
    dondurmaHaftalik: Math.max(0, sayi('seri.dondurma_haftalik', 1)),
    dondurmaAzami: Math.min(2, Math.max(0, sayi('seri.dondurma_azami', 2))),
    kilometreTaslari,
    riskSaati: Math.min(23, Math.max(4, Math.trunc(sayi('seri.risk_saati', 20)))),
  };
}

// --- Aktivite ve hedefler --------------------------------------------------------------------

export interface Aktivite {
  planGorevi: number;
  odakSn: number;
  odev: number;
  soru: number;
}

export async function aktiviteOku(tx: Islem, ogrenciId: string, gun: string): Promise<Aktivite> {
  const [a] = await tx.execute<{ plan_g: number; odak_sn: number; odev: number; soru: number }>(sql`
    select plan_gorevi_sayisi as plan_g, odak_sn, odev_teslim_sayisi as odev, soru_anladim_sayisi as soru
      from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${ogrenciId} and gun = ${gun}::date`);
  return {
    planGorevi: a?.plan_g ?? 0,
    odakSn: a?.odak_sn ?? 0,
    odev: a?.odev ?? 0,
    soru: a?.soru ?? 0,
  };
}

export interface SeriHedefi {
  tur: 'plan_gorevi' | 'odak_dk' | 'odev' | 'soru';
  yapilan: number;
  esik: number;
  kalan: number;
}

/** Gunluk hedefler (`carpan` 2: onarim hedefi). Herhangi biri tamamlaninca gun tamamdir. */
export function hedefler(a: Aktivite, ay: SeriAyarlari, carpan = 1): SeriHedefi[] {
  const h: Omit<SeriHedefi, 'kalan'>[] = [
    { tur: 'plan_gorevi', yapilan: a.planGorevi, esik: ay.planEsigi * carpan },
    { tur: 'odak_dk', yapilan: Math.floor(a.odakSn / 60), esik: ay.odakDkEsigi * carpan },
    { tur: 'odev', yapilan: a.odev, esik: ay.odevEsigi * carpan },
    { tur: 'soru', yapilan: a.soru, esik: ay.soruEsigi * carpan },
  ];
  return h.map((x) => ({ ...x, kalan: Math.max(0, x.esik - x.yapilan) }));
}

export const gunTamam = (a: Aktivite, ay: SeriAyarlari, carpan = 1): boolean =>
  hedefler(a, ay, carpan).some((h) => h.kalan === 0);

// --- Seri satiri -----------------------------------------------------------------------------

export interface SeriSatiri {
  mevcut_seri: number;
  en_uzun_seri: number;
  dondurma_stogu: number;
  onarim_hakki: number;
  bozulan_seri: number | null;
  bozulan_gun: string | null;
}

export async function seriOku(tx: Islem, ogrenciId: string): Promise<SeriSatiri | null> {
  const [s] = await tx.execute<SeriSatiri & Record<string, unknown>>(sql`
    select mevcut_seri, en_uzun_seri, dondurma_stogu::int as dondurma_stogu,
           onarim_hakki::int as onarim_hakki, bozulan_seri, bozulan_gun::text as bozulan_gun
      from motivasyon.seriler where ogrenci_id = ${ogrenciId}`);
  return s ?? null;
}

/** Seri satirini (yoksa) acar: ilk dondurma haftasi ve onarim ayi icinde bulunulan donemdir. */
export async function seriGarantile(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId' | 'gun'>,
): Promise<void> {
  await tx.execute(sql`
    insert into motivasyon.seriler (id, kurum_id, ogrenci_id, dondurma_son_hafta, onarim_son_ay)
    values (${yeniId()}, ${b.kurumId}, ${b.ogrenciId}, date_trunc('week', ${b.gun}::date)::date,
            date_trunc('month', ${b.gun}::date)::date)
    on conflict (kurum_id, ogrenci_id) do nothing`);
}

/**
 * Gunu yazar. Gun zaten varsa degismez; yalniz `kacirildi` gun `aktif` ile yukseltilir (sema kurali).
 * Yazildiysa (ya da yukseltildiyse) true.
 */
export async function seriGunuYaz(
  tx: Islem,
  b: Pick<IsBaglami, 'kurumId' | 'ogrenciId'>,
  gun: string,
  durum: 'aktif' | 'dondurma' | 'duraklatma' | 'kacirildi',
  kaynakOlayId: string | null,
): Promise<boolean> {
  const r = await tx.execute(sql`
    insert into motivasyon.seri_gunleri (ogrenci_id, gun, kurum_id, durum, kaynak_olay_id)
    values (${b.ogrenciId}, ${gun}::date, ${b.kurumId}, ${durum}, ${kaynakOlayId})
    on conflict (ogrenci_id, gun) do update
      set durum = excluded.durum, kaynak_olay_id = excluded.kaynak_olay_id
      where motivasyon.seri_gunleri.durum = 'kacirildi' and excluded.durum = 'aktif'
    returning durum`);
  return r.length > 0;
}

/**
 * Seri uzunlugu: `sonGun` verilirse o gune kadar (ve o gunde biten zincir; gun kaydi yoksa 0), verilmezse
 * en son kayitli gune kadar (degerlendirilmemis son gunler zinciri kirmaz).
 */
export async function zincirOlc(
  tx: Islem,
  ogrenciId: string,
  sonGun: string | null,
): Promise<{ mevcut: number; sonAktifGun: string | null }> {
  const sinir = sonGun === null ? sql`` : sql`and gun <= ${sonGun}::date`;
  const bitis = sonGun === null ? sql`son.gun` : sql`${sonGun}::date`;
  const [r] = await tx.execute<{ mevcut: number; son_aktif: string | null }>(sql`
    with r as (
      select gun, durum, gun - (row_number() over (order by gun))::int as grp
        from motivasyon.seri_gunleri
       where ogrenci_id = ${ogrenciId} and durum <> 'kacirildi' ${sinir}
    ), son as (
      select max(gun) as gun from motivasyon.seri_gunleri where ogrenci_id = ${ogrenciId} ${sinir}
    ), ada as (
      select max(gun) as bitis, (count(*) filter (where durum in ('aktif', 'onarim')))::int as n
        from r group by grp order by max(gun) desc limit 1
    )
    select coalesce(case when ada.bitis = ${bitis} then ada.n end, 0)::int as mevcut,
           (select max(gun)::text from motivasyon.seri_gunleri
             where ogrenci_id = ${ogrenciId} and durum = 'aktif' ${sinir}) as son_aktif
      from son left join ada on true`);
  return { mevcut: r?.mevcut ?? 0, sonAktifGun: r?.son_aktif ?? null };
}

/**
 * `seri_gunleri`nden `seriler`i yeniden turetir (mevcut, en uzun, son aktif gun; artik kacirildi olmayan
 * bozulma bilgisini temizler), rozet sayaclarini (`en_uzun_seri`) ve kozmetikleri gunceller, ilk kez
 * ulasilan kilometre taslari icin `seri.kilometre_tasi` yayimlar. Ayni islemde.
 */
export async function seriYenidenTuret(
  tx: Islem,
  b: IsBaglami,
  ay: SeriAyarlari,
): Promise<{ onceki: number; mevcut: number }> {
  const onceki = await seriOku(tx, b.ogrenciId);
  if (!onceki) return { onceki: 0, mevcut: 0 };
  const { mevcut, sonAktifGun } = await zincirOlc(tx, b.ogrenciId, null);
  const [g] = await tx.execute<{ en_uzun_seri: number }>(sql`
    update motivasyon.seriler set
      mevcut_seri = ${mevcut},
      en_uzun_seri = greatest(en_uzun_seri, ${mevcut}),
      son_aktif_gun = ${sonAktifGun}::date,
      bozulan_seri = case when bozulan_gun is not null and not exists (
          select 1 from motivasyon.seri_gunleri g
           where g.ogrenci_id = seriler.ogrenci_id and g.gun = seriler.bozulan_gun and g.durum = 'kacirildi')
        then null else bozulan_seri end,
      onarim_bitis_at = case when bozulan_gun is not null and not exists (
          select 1 from motivasyon.seri_gunleri g
           where g.ogrenci_id = seriler.ogrenci_id and g.gun = seriler.bozulan_gun and g.durum = 'kacirildi')
        then null else onarim_bitis_at end,
      bozulan_gun = case when bozulan_gun is not null and not exists (
          select 1 from motivasyon.seri_gunleri g
           where g.ogrenci_id = seriler.ogrenci_id and g.gun = seriler.bozulan_gun and g.durum = 'kacirildi')
        then null else bozulan_gun end
     where ogrenci_id = ${b.ogrenciId}
    returning en_uzun_seri`);
  const enUzun = g?.en_uzun_seri ?? mevcut;
  await sayacEnAz(tx, b, 'en_uzun_seri', enUzun);
  await kilometreTaslariniYayimla(tx, b, ay, mevcut);
  await rozetleriDegerlendir(tx, b, ['en_uzun_seri', 'toplam_aktif_gun']);
  await kozmetikleriAc(tx, b);
  return { onceki: onceki.mevcut_seri, mevcut };
}

/** Ilk kez ulasilan kilometre taslari (en yuksek ulasilan sayacta tutulur; seri bozulup yeniden olsa da tekrar yok). */
async function kilometreTaslariniYayimla(
  tx: Islem,
  b: IsBaglami,
  ay: SeriAyarlari,
  mevcut: number,
): Promise<void> {
  const [c] = await tx.execute<{ deger: number }>(sql`
    select deger::float8 as deger from motivasyon.ogrenci_sayaclari
     where ogrenci_id = ${b.ogrenciId} and sayac_kodu = ${SERI_KILOMETRE_SAYACI}`);
  const yeni = ay.kilometreTaslari.filter((m) => m <= mevcut && m > (c?.deger ?? 0));
  for (const m of yeni) {
    await publishInTx(
      tx,
      motivasyonSeriKilometreTasiV1.create({
        kurumId: b.kurumId,
        actor: SISTEM_AKTORU,
        correlationId: b.olayId,
        data: { ogrenci_id: b.ogrenciId, seri: m },
      }),
      { table: OUTBOX_TABLOSU },
    );
  }
  const enYuksek = yeni.at(-1);
  if (enYuksek !== undefined) await sayacEnAz(tx, b, SERI_KILOMETRE_SAYACI, enYuksek);
}

// --- Onarim ----------------------------------------------------------------------------------

/**
 * Kacirilan gunu izleyen gunde (`b.gun` = kacirilan + 1) aktivite gunluk hedefin 2 kati ise kacirilan gun
 * `onarim` olur ve hak 0'a iner. Pencere "gun" ile olculur: olay zamani pencere icindeyse (cevrimdisi gec
 * eslenen is dahil) kabul edilir. Onarildiysa true.
 */
async function onarimDene(
  tx: Islem,
  b: Pick<IsBaglami, 'ogrenciId'>,
  ay: SeriAyarlari,
  gun: string,
  a: Aktivite,
): Promise<boolean> {
  const s = await seriOku(tx, b.ogrenciId);
  if (s?.onarim_hakki !== 1 || !s.bozulan_gun) return false;
  const [p] = await tx.execute<{ uygun: boolean }>(sql`
    select (${s.bozulan_gun}::date + 1 = ${gun}::date) as uygun`);
  if (!p?.uygun || !gunTamam(a, ay, 2)) return false;
  const r = await tx.execute(sql`
    update motivasyon.seri_gunleri set durum = 'onarim'
     where ogrenci_id = ${b.ogrenciId} and gun = ${s.bozulan_gun}::date and durum = 'kacirildi'
    returning gun`);
  if (r.length === 0) return false;
  await tx.execute(
    sql`update motivasyon.seriler set onarim_hakki = 0 where ogrenci_id = ${b.ogrenciId}`,
  );
  return true;
}

// --- Aktif gun (olay yolu) -------------------------------------------------------------------

/**
 * Aktivite sayaci artinca cagrilir (XP tuketicisi, odak paketi): `b.gun` aktivitesi esige ulastiysa gunu
 * ilk kez `aktif` yazar, rozet sayaclarini gunceller, onarimi dener ve seriyi yeniden turetir. Gun
 * olayin olusma zamanindan hesaplanmistir; gec gelen gecmis gun de dogru gune yazilir ve seri
 * yeniden turetilir. Ayni gun icin tekrar cagri zararsizdir.
 */
export async function seriDegerlendir(tx: Islem, b: IsBaglami): Promise<void> {
  const ay = await seriAyarlariOku(tx);
  const a = await aktiviteOku(tx, b.ogrenciId, b.gun);
  if (!gunTamam(a, ay)) return;
  await seriGarantile(tx, b);
  const yazildi = await seriGunuYaz(tx, b, b.gun, 'aktif', b.olayId);
  if (yazildi) await sayacArtir(tx, b, 'toplam_aktif_gun', 1);
  const onarildi = await onarimDene(tx, b, ay, b.gun, a);
  if (!yazildi && !onarildi) return;
  await seriYenidenTuret(tx, b, ay);
}

// --- Bozulma (gece isi kullanir) ------------------------------------------------------------

/** Kacirilan gunu yazar, bozulma bilgisini isler ve (seri > 0 idi) `seri.bozuldu` yayimlar. */
export async function seriniBoz(
  tx: Islem,
  b: IsBaglami,
  ay: SeriAyarlari,
  gun: string,
  oncekiSeri: number,
  onarimHakki: number,
): Promise<void> {
  await seriGunuYaz(tx, b, gun, 'kacirildi', null);
  // Pencere sonu: kacirilan gunu izleyen gunun sonu = kacirilan + 2 gun, 04:00 (kurum saati).
  await tx.execute(sql`
    update motivasyon.seriler set bozulan_seri = ${oncekiSeri}, bozulan_gun = ${gun}::date,
           onarim_bitis_at = ((${gun}::date + 2)::timestamp + interval '4 hours') at time zone ${b.saatDilimi}
     where ogrenci_id = ${b.ogrenciId}`);
  await seriYenidenTuret(tx, b, ay);
  const [s] = await tx.execute<{ son_gun: string }>(
    sql`select (${gun}::date + 1)::text as son_gun`,
  );
  await publishInTx(
    tx,
    motivasyonSeriBozuldiV1.create({
      kurumId: b.kurumId,
      actor: SISTEM_AKTORU,
      correlationId: b.olayId,
      data: {
        ogrenci_id: b.ogrenciId,
        onceki_seri: oncekiSeri,
        onarilabilir: onarimHakki === 1,
        onarim_son_gun: onarimHakki === 1 ? (s?.son_gun ?? null) : null,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

/** Gece isinde, gun kacirilmadan once: ertesi gun zaten 2 kat hedefe ulasildiysa dogrudan onarim. */
export async function aninaOnar(
  tx: Islem,
  b: IsBaglami,
  ay: SeriAyarlari,
  gun: string,
  oncekiSeri: number,
): Promise<boolean> {
  const [n] = await tx.execute<{ sonraki: string }>(
    sql`select (${gun}::date + 1)::text as sonraki`,
  );
  if (!n) return false;
  const a = await aktiviteOku(tx, b.ogrenciId, n.sonraki);
  const s = await seriOku(tx, b.ogrenciId);
  if (s?.onarim_hakki !== 1 || !gunTamam(a, ay, 2)) return false;
  await seriGunuYaz(tx, b, gun, 'kacirildi', null);
  await tx.execute(sql`
    update motivasyon.seriler set bozulan_seri = ${oncekiSeri}, bozulan_gun = ${gun}::date
     where ogrenci_id = ${b.ogrenciId}`);
  const ok = await onarimDene(tx, b, ay, n.sonraki, a);
  if (ok) await seriYenidenTuret(tx, b, ay);
  return ok;
}
