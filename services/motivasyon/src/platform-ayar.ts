import type {
  PlatformAyarDegerleri,
  PlatformAyarGuncellemeIstegi,
  PlatformAyarSurumu,
  PlatformAyarUyarisi,
} from '@kopru/contracts';
import { AppError, type Database, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { DUZENLI_OGRENCI, haftalikXp, ilkGunXp, type KuralDegerleri } from './duzenli-ogrenci.js';
import { iso, yeniId } from './ortak.js';

/**
 * Platformdan yonetilen XP kurallari ve gunluk tavanlar (global, surumlu). Gecerli degerler `xp_kurallari` /
 * `xp_tavanlari` tablolarindadir: XP isleyicisi her islemde oradan okur (onbellek yok; degisiklik herhangi bir
 * worker'da bir sonraki olay isleminde etkilidir ve gecmis XP'ye dokunmaz). Her degisiklik
 * `platform_ayar_surumleri`ne tam kopya olarak ve `yapilandirma_gecmisi`ne anahtar bazinda yazilir.
 */

export const AYAR_GECERSIZ = 'ayar_gecersiz';
const KILIT = 727010;

export const SINIRLAR = {
  kuralXpEnCok: 500,
  olayBasiEnCok: 500,
  tavanEnCok: 2000,
} as const;

/** Yapisal (degistirilemeyen) kural bilgisi: tavan iliskisi dogrulamada kullanilir. */
export interface KuralYapisi {
  tavanGrubu: string | null;
  genelTavanaTabi: boolean;
  birim: string | null;
}

export interface MevcutAyar {
  degerler: PlatformAyarDegerleri;
  yapi: Record<string, KuralYapisi>;
}

export interface AyarHatasi {
  alan: string;
  mesaj: string;
}

type Orm = Pick<Tx, 'execute'>;

// --- Okuma -----------------------------------------------------------------------------------

export async function mevcutAyariOku(tx: Orm): Promise<MevcutAyar> {
  const kurallar = await tx.execute<{
    kod: string;
    xp: number;
    olay_basi_ust_sinir: number | null;
    gec_carpani: number;
    aktif: boolean;
    tavan_grubu: string | null;
    genel_tavana_tabi: boolean;
    birim: string | null;
  }>(sql`
    select kod, xp, olay_basi_ust_sinir, gec_carpani::float8 as gec_carpani, aktif, tavan_grubu,
           genel_tavana_tabi, birim
      from motivasyon.xp_kurallari order by kod`);
  const tavanlar = await tx.execute<{ kod: string; gunluk_ust_sinir: number }>(sql`
    select kod, gunluk_ust_sinir from motivasyon.xp_tavanlari order by kod`);
  const degerler: PlatformAyarDegerleri = { kurallar: {}, tavanlar: {} };
  const yapi: Record<string, KuralYapisi> = {};
  for (const k of kurallar) {
    degerler.kurallar[k.kod] = {
      xp: k.xp,
      olay_basi_ust_sinir: k.olay_basi_ust_sinir,
      gec_carpani: k.gec_carpani,
      aktif: k.aktif,
    };
    yapi[k.kod] = {
      tavanGrubu: k.tavan_grubu,
      genelTavanaTabi: k.genel_tavana_tabi,
      birim: k.birim,
    };
  }
  for (const t of tavanlar) degerler.tavanlar[t.kod] = t.gunluk_ust_sinir;
  return { degerler, yapi };
}

interface SurumSatiri {
  surum: number;
  degerler: PlatformAyarDegerleri;
  onceki_surum: number | null;
  geri_alinan_surum: number | null;
  degistiren_kullanici_id: string | null;
  neden: string;
  uyarilar: PlatformAyarUyarisi[];
  created_at: string;
}

const surumSecimi = sql`
  select surum, degerler, onceki_surum, geri_alinan_surum, degistiren_kullanici_id::text as degistiren_kullanici_id,
         neden, uyarilar, ${iso('created_at')} as created_at
    from motivasyon.platform_ayar_surumleri`;

export async function surumleriListele(tx: Orm, limit: number): Promise<PlatformAyarSurumu[]> {
  const satirlar = await tx.execute<SurumSatiri & Record<string, unknown>>(sql`
    ${surumSecimi} order by surum desc limit ${limit}`);
  return satirlar.map((s) => ({ ...s }));
}

export async function surumGetir(tx: Orm, surum: number): Promise<PlatformAyarSurumu | null> {
  const [s] = await tx.execute<SurumSatiri & Record<string, unknown>>(sql`
    ${surumSecimi} where surum = ${surum}`);
  return s ? { ...s } : null;
}

async function sonSurumNo(tx: Orm): Promise<number> {
  const [s] = await tx.execute<{ surum: number }>(sql`
    select coalesce(max(surum), 0)::int as surum from motivasyon.platform_ayar_surumleri`);
  return s?.surum ?? 0;
}

export async function gecerliAyar(
  tx: Orm,
): Promise<{ surum: number; degerler: PlatformAyarDegerleri }> {
  const [mevcut, surum] = await Promise.all([mevcutAyariOku(tx), sonSurumNo(tx)]);
  return { surum, degerler: mevcut.degerler };
}

// --- Birlestirme ve dogrulama ----------------------------------------------------------------

/** Kismi istegi mevcut degerlerin ustune uygular; bilinmeyen kod hata listesine eklenir. */
export function birlestir(
  mevcut: PlatformAyarDegerleri,
  istek: Pick<PlatformAyarGuncellemeIstegi, 'kurallar' | 'tavanlar'>,
  hatalar: AyarHatasi[],
): PlatformAyarDegerleri {
  const sonuc: PlatformAyarDegerleri = structuredClone(mevcut);
  for (const [kod, kismi] of Object.entries(istek.kurallar ?? {})) {
    const hedef = sonuc.kurallar[kod];
    if (!hedef) {
      hatalar.push({ alan: `kurallar.${kod}`, mesaj: 'Bilinmeyen XP kuralı.' });
      continue;
    }
    sonuc.kurallar[kod] = { ...hedef, ...kismi };
  }
  for (const [kod, deger] of Object.entries(istek.tavanlar ?? {})) {
    if (!(kod in sonuc.tavanlar)) {
      hatalar.push({ alan: `tavanlar.${kod}`, mesaj: 'Bilinmeyen tavan grubu.' });
      continue;
    }
    sonuc.tavanlar[kod] = deger;
  }
  return sonuc;
}

const tamSayiAraligi = (d: unknown, enAz: number, enCok: number): d is number =>
  typeof d === 'number' && Number.isInteger(d) && d >= enAz && d <= enCok;

/**
 * Aralik ve tutarlilik denetimi (reddeder). Kurallar:
 * - kural XP'si 0..500 tam sayi; olay basi ust sinir 1..500 ya da yok; gec carpani 0..1 (iki ondalik);
 * - gunluk tavan 1..2000 tam sayi, alt tavanlar (`plan`, `odak`, ...) `genel` tavanini asamaz;
 * - kuralin XP'si ve olay basi ust siniri, tabi oldugu tavanlarin en dar olanini asamaz (tavandan buyuk
 *   deger hicbir zaman tam verilemez); birimli kuralda birim XP'si olay basi ust sinirini asamaz.
 */
export function dogrula(
  degerler: PlatformAyarDegerleri,
  yapi: Record<string, KuralYapisi>,
): AyarHatasi[] {
  const h: AyarHatasi[] = [];
  const { kurallar, tavanlar } = degerler;

  for (const [kod, t] of Object.entries(tavanlar)) {
    if (!tamSayiAraligi(t, 1, SINIRLAR.tavanEnCok)) {
      h.push({
        alan: `tavanlar.${kod}`,
        mesaj: `Günlük tavan 1 ile ${String(SINIRLAR.tavanEnCok)} arasında tam sayı olmalı.`,
      });
    }
  }
  const genel = tavanlar.genel;
  if (typeof genel === 'number') {
    for (const [kod, t] of Object.entries(tavanlar)) {
      if (kod !== 'genel' && typeof t === 'number' && t > genel) {
        h.push({
          alan: `tavanlar.${kod}`,
          mesaj: `Alt tavan (${String(t)}) genel günlük tavanı (${String(genel)}) aşamaz.`,
        });
      }
    }
  }

  for (const [kod, k] of Object.entries(kurallar)) {
    if (!tamSayiAraligi(k.xp, 0, SINIRLAR.kuralXpEnCok)) {
      h.push({
        alan: `kurallar.${kod}.xp`,
        mesaj: `XP 0 ile ${String(SINIRLAR.kuralXpEnCok)} arasında tam sayı olmalı.`,
      });
    }
    if (
      k.olay_basi_ust_sinir !== null &&
      !tamSayiAraligi(k.olay_basi_ust_sinir, 1, SINIRLAR.olayBasiEnCok)
    ) {
      h.push({
        alan: `kurallar.${kod}.olay_basi_ust_sinir`,
        mesaj: `Olay başı üst sınır 1 ile ${String(SINIRLAR.olayBasiEnCok)} arasında tam sayı olmalı ya da boş olmalı.`,
      });
    }
    const c = k.gec_carpani;
    if (
      typeof c !== 'number' ||
      !(c >= 0 && c <= 1) ||
      Math.abs(Math.round(c * 100) - c * 100) > 1e-9
    ) {
      h.push({
        alan: `kurallar.${kod}.gec_carpani`,
        mesaj: 'Geç teslim çarpanı 0 ile 1 arasında, en çok iki ondalıklı olmalı.',
      });
    }

    const y = yapi[kod];
    if (!y) continue;
    const sinirlar: number[] = [];
    const grupTavani = y.tavanGrubu === null ? undefined : tavanlar[y.tavanGrubu];
    if (typeof grupTavani === 'number') sinirlar.push(grupTavani);
    if (y.genelTavanaTabi && typeof genel === 'number') sinirlar.push(genel);
    const tavan = sinirlar.length > 0 ? Math.min(...sinirlar) : null;
    if (tavan !== null) {
      if (y.birim === null && typeof k.xp === 'number' && k.xp > tavan) {
        h.push({
          alan: `kurallar.${kod}.xp`,
          mesaj: `Kuralın XP'si (${String(k.xp)}) bağlı olduğu günlük tavanı (${String(tavan)}) aşamaz.`,
        });
      }
      if (k.olay_basi_ust_sinir !== null && k.olay_basi_ust_sinir > tavan) {
        h.push({
          alan: `kurallar.${kod}.olay_basi_ust_sinir`,
          mesaj: `Olay başı üst sınır (${String(k.olay_basi_ust_sinir)}) günlük tavanı (${String(tavan)}) aşamaz.`,
        });
      }
    }
    if (y.birim !== null && k.olay_basi_ust_sinir !== null && k.xp > k.olay_basi_ust_sinir) {
      h.push({
        alan: `kurallar.${kod}.xp`,
        mesaj: `Birim XP'si (${String(k.xp)}) olay başı üst sınırını (${String(k.olay_basi_ust_sinir)}) aşamaz.`,
      });
    }
  }
  return h;
}

// --- Duzenli ogrenci uyarilari ---------------------------------------------------------------

/** Seviye hedefleri (duzenli-ogrenci tohumunda gun): ilk evrim, 3. asama, 4. asama, efsane. */
export const SEVIYE_HEDEFLERI: readonly { seviye: number; gun: number; ad: string }[] = [
  { seviye: 5, gun: 7, ad: 'ilk evrim (seviye 5)' },
  { seviye: 12, gun: 59, ad: '3. aşama (seviye 12)' },
  { seviye: 25, gun: 134, ad: '4. aşama (seviye 25)' },
  { seviye: 40, gun: 356, ad: 'efsane (seviye 40)' },
];
export const HAFTALIK_SAPMA_ESIGI = 0.1;
export const HEDEF_SAPMA_ESIGI = 0.25;
const ILK_GUN_SEVIYESI = 3;

/** Platform ayarlarini `duzenli-ogrenci.ts` modelinin girdisine cevirir (kapali kural 0 XP sayilir). */
export function kuralDegerleri(d: PlatformAyarDegerleri): KuralDegerleri {
  const xp = (kod: string) => {
    const k = d.kurallar[kod];
    return k?.aktif ? k.xp : 0;
  };
  const tavan = (kod: string) => d.tavanlar[kod] ?? Number.MAX_SAFE_INTEGER;
  return {
    yoklama: xp('yoklama_geldi'),
    geriBildirim: xp('geri_bildirim'),
    odevTeslim: xp('odev_teslim'),
    odevOnay: xp('odev_onay'),
    planGorevi: xp('plan_gorevi_tamam'),
    planTavan: tavan('plan'),
    odakDk: xp('odak_oturumu'),
    odakTavan: tavan('odak'),
    soruSorma: xp('soru_sorma'),
    soruAnladim: xp('soru_anladim'),
    soruTavan: tavan('soru'),
    gunlukSoru: xp('gunluk_soru'),
    gunlukSoruTavan: tavan('gunluk_soru'),
    kayit: xp('kayit_izledi'),
    kayitTavan: tavan('kayit'),
    denemeGirisi: xp('deneme_girisi'),
    netBasina: xp('deneme_net_artisi'),
    denemeNetTavan: d.kurallar.deneme_net_artisi?.olay_basi_ust_sinir ?? Number.MAX_SAFE_INTEGER,
    genelTavan: tavan('genel'),
  };
}

/**
 * Degisiklik "duzenli calisan ogrenci" varsayimlarini (docs/schema/motivasyon.md) bozuyor mu? Reddetmez,
 * uyari listesi doner. `seviyeler`: seviye -> gereken toplam XP.
 */
export function uyarilariHesapla(
  once: PlatformAyarDegerleri,
  sonra: PlatformAyarDegerleri,
  seviyeler: ReadonlyMap<number, number>,
): PlatformAyarUyarisi[] {
  const u: PlatformAyarUyarisi[] = [];
  const kSonra = kuralDegerleri(sonra);
  const haftalik = haftalikXp(kSonra);
  const gunluk = haftalik / 7;
  // Referans: tohum modelin kendisi (varsayimlarin yazildigi degerler), `once` degil.
  const referans = haftalikXp(kuralDegerleri(TOHUM_DEGERLER));
  const sapma = referans === 0 ? 0 : (haftalik - referans) / referans;
  const ozet = (n: number) => String(Math.round(n * 10) / 10);

  if (Math.abs(sapma) > HAFTALIK_SAPMA_ESIGI) {
    u.push({
      kod: 'haftalik_xp_degisti',
      mesaj:
        `Düzenli çalışan öğrencinin haftalık XP'si varsayımdaki ${ozet(referans)} yerine ${ozet(haftalik)} ` +
        `olur (%${ozet(Math.abs(sapma) * 100)} ${sapma < 0 ? 'azalır' : 'artar'}).`,
    });
  }

  const kayanlar: string[] = [];
  for (const hedef of SEVIYE_HEDEFLERI) {
    const esik = seviyeler.get(hedef.seviye);
    if (esik === undefined) continue;
    const gun = gunluk > 0 ? Math.ceil(esik / gunluk) : null;
    if (gun === null || Math.abs(gun - hedef.gun) / hedef.gun > HEDEF_SAPMA_ESIGI) {
      kayanlar.push(
        `${hedef.ad}: ${gun === null ? 'hiç' : `~${String(gun)}. gün`} (hedef ~${String(hedef.gun)}. gün)`,
      );
    }
  }
  if (kayanlar.length > 0) {
    u.push({
      kod: 'seviye_hedefi_kaydi',
      mesaj: `Düzenli öğrencide seviye hedefleri %25'ten fazla kayıyor: ${kayanlar.join('; ')}.`,
    });
  }

  const hamIlkGun = ilkGunXp({ ...kSonra, genelTavan: Number.MAX_SAFE_INTEGER }, DUZENLI_OGRENCI);
  const ilkGun = Math.min(hamIlkGun, kSonra.genelTavan);
  const ilkGunHedefi = seviyeler.get(ILK_GUN_SEVIYESI);
  if (ilkGunHedefi !== undefined && ilkGun < ilkGunHedefi) {
    u.push({
      kod: 'ilk_gun_hedefi',
      mesaj: `Tipik ilk gün XP'si ${String(ilkGun)}; ilk günde ${String(ILK_GUN_SEVIYESI - 1)} seviye atlama hedefi (seviye ${String(ILK_GUN_SEVIYESI)} = ${String(ilkGunHedefi)} XP) tutmaz.`,
    });
  }
  if (hamIlkGun > kSonra.genelTavan) {
    u.push({
      kod: 'genel_tavan_dar',
      mesaj: `Genel günlük tavan (${String(kSonra.genelTavan)}) düzenli öğrencinin tipik ders gününü (${String(hamIlkGun)} XP) kırpar.`,
    });
  }

  for (const [kod, k] of Object.entries(sonra.kurallar)) {
    const eski = once.kurallar[kod];
    if (eski && eski.aktif && (!k.aktif || (k.xp === 0 && eski.xp > 0))) {
      u.push({ kod: 'kural_kapatildi', mesaj: `"${kod}" kuralı artık XP vermiyor.` });
    }
  }
  return u;
}

/** Tohum degerleri (migration 0002 + 0008 ile ayni); uyari karsilastirmasinin referansi. */
export const TOHUM_DEGERLER: PlatformAyarDegerleri = {
  kurallar: {
    yoklama_geldi: { xp: 20, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    odev_teslim: { xp: 15, olay_basi_ust_sinir: null, gec_carpani: 0.5, aktif: true },
    odev_onay: { xp: 10, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    plan_gorevi_tamam: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    odak_oturumu: { xp: 1, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    deneme_girisi: { xp: 10, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    deneme_net_artisi: { xp: 5, olay_basi_ust_sinir: 50, gec_carpani: 1, aktif: true },
    soru_sorma: { xp: 3, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    soru_anladim: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    geri_bildirim: { xp: 2, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    kayit_izledi: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    gunluk_soru: { xp: 2, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    haftanin_yildizi: { xp: 50, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
  },
  tavanlar: { genel: 300, plan: 40, odak: 120, soru: 20, kayit: 15, gunluk_soru: 10 },
};

async function seviyeEsikleri(tx: Orm): Promise<Map<number, number>> {
  const s = await tx.execute<{ seviye: number; xp: number }>(sql`
    select seviye, gereken_toplam_xp::float8 as xp from motivasyon.seviyeler`);
  return new Map(s.map((r) => [r.seviye, r.xp]));
}

// --- Yazma -----------------------------------------------------------------------------------

export interface SurumIstegi {
  kullaniciId: string;
  neden: string;
  beklenenSurum?: number | undefined;
  /** Mevcut degerlerin ustune uygulanir (kismi). */
  degisiklik: Pick<PlatformAyarGuncellemeIstegi, 'kurallar' | 'tavanlar'>;
  /** Geri almada hedef surum numarasi (kayit icin; `degisiklik` hedef surumun tam degerleridir). */
  geriAlinan?: number;
}

const gecersiz = (hatalar: AyarHatasi[]) =>
  new AppError(422, AYAR_GECERSIZ, 'Motivasyon ayarları geçersiz.', { hatalar });

const jsonb = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const esit = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Yeni surum yazar ve degerleri uygular (tek islem, global advisory kilit: es zamanli iki degisiklik
 * siralanir). Gecersizse 422 `ayar_gecersiz`, degisiklik yoksa 422 `degisiklik_yok`, `beklenenSurum` eskiyse
 * 409 `surum_catismasi`.
 */
export async function yeniSurumYaz(
  db: Pick<Database, 'orm'>,
  istek: SurumIstegi,
): Promise<PlatformAyarSurumu> {
  return db.orm.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${KILIT})`);
    const sonNo = await sonSurumNo(tx);
    if (istek.beklenenSurum !== undefined && istek.beklenenSurum !== sonNo) {
      throw new AppError(
        409,
        'surum_catismasi',
        'Ayarlar siz bakarken değişti; sayfayı yenileyin.',
        {
          guncel_surum: sonNo,
        },
      );
    }
    const mevcut = await mevcutAyariOku(tx);
    const hatalar: AyarHatasi[] = [];
    const yeni = birlestir(mevcut.degerler, istek.degisiklik, hatalar);
    hatalar.push(...dogrula(yeni, mevcut.yapi));
    if (hatalar.length > 0) throw gecersiz(hatalar);
    if (esit(yeni, mevcut.degerler)) {
      throw new AppError(422, 'degisiklik_yok', 'Değer gerçekte değişmiyor.');
    }

    // Anahtar bazinda degisiklikler: tablolara uygula ve yapilandirma_gecmisi'ne yaz.
    for (const [kod, k] of Object.entries(yeni.kurallar)) {
      const eski = mevcut.degerler.kurallar[kod];
      if (esit(k, eski)) continue;
      await tx.execute(sql`
        update motivasyon.xp_kurallari
           set xp = ${k.xp}, olay_basi_ust_sinir = ${k.olay_basi_ust_sinir},
               gec_carpani = ${k.gec_carpani}, aktif = ${k.aktif}
         where kod = ${kod}`);
      await tx.execute(sql`
        insert into motivasyon.yapilandirma_gecmisi (id, tablo, anahtar, once, sonra, degistiren_kullanici_id, neden)
        values (${yeniId()}, 'xp_kurallari', ${kod}, ${jsonb(eski)}, ${jsonb(k)}, ${istek.kullaniciId}, ${istek.neden})`);
    }
    for (const [kod, t] of Object.entries(yeni.tavanlar)) {
      const eski = mevcut.degerler.tavanlar[kod];
      if (eski === t) continue;
      await tx.execute(
        sql`update motivasyon.xp_tavanlari set gunluk_ust_sinir = ${t} where kod = ${kod}`,
      );
      await tx.execute(sql`
        insert into motivasyon.yapilandirma_gecmisi (id, tablo, anahtar, once, sonra, degistiren_kullanici_id, neden)
        values (${yeniId()}, 'xp_tavanlari', ${kod}, ${jsonb(eski)}, ${jsonb(t)}, ${istek.kullaniciId}, ${istek.neden})`);
    }

    const uyarilar = uyarilariHesapla(mevcut.degerler, yeni, await seviyeEsikleri(tx));
    const surum = sonNo + 1;
    await tx.execute(sql`
      insert into motivasyon.platform_ayar_surumleri
        (id, surum, degerler, onceki_surum, geri_alinan_surum, degistiren_kullanici_id, neden, uyarilar)
      values (${yeniId()}, ${surum}, ${jsonb(yeni)}, ${sonNo === 0 ? null : sonNo}, ${istek.geriAlinan ?? null},
              ${istek.kullaniciId}, ${istek.neden}, ${jsonb(uyarilar)})`);
    const kayit = await surumGetir(tx, surum);
    if (!kayit) throw new Error('surum yazılamadı');
    return kayit;
  });
}
