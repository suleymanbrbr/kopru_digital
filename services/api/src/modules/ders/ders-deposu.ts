import {
  DERS_OLAY_PARCA_BOYUTU,
  dersDersDegistiV1,
  errorCodes,
  type Actor,
  type DersTipi,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, asc, eq, exists, gt, inArray, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  denetimKayitlari,
  dersKatilimcilari,
  type dersSerileri,
  dersler,
} from '../../db/schema.js';
import { gorunenAdlar, kapsamdakiGruplar, type YetkiBaglami } from '../hesap/index.js';

export type DersSatiri = typeof dersler.$inferSelect;
export type SeriSatiri = typeof dersSerileri.$inferSelect;
export type DersDegisimTuru =
  'planlandi' | 'ertelendi' | 'iptal_edildi' | 'tamamlandi' | 'guncellendi';

export const OUTBOX_TABLOSU = 'ortak.outbox';

export interface DersOlayBaglami {
  kurumId: string;
  actor: Actor;
  correlationId: string;
}

export const dersBulunamadi = () => new AppError(404, errorCodes.notFound, 'Ders bulunamadı.');

// --- Yanit donusumleri -----------------------------------------------------------------------

export function dersYaniti(d: DersSatiri, katilimciSayisi: number): DersTipi {
  return {
    id: d.id,
    grup_id: d.grup_id,
    seri_id: d.seri_id,
    seri_sirasi: d.seri_sirasi,
    ogretmen_id: d.ogretmen_id,
    brans_kodu: d.brans_kodu,
    konu_id: d.konu_id,
    baslik: d.baslik,
    baslangic_at: d.baslangic_at.toISOString(),
    bitis_at: d.bitis_at.toISOString(),
    durum: d.durum as DersTipi['durum'],
    iptal_nedeni: d.iptal_nedeni,
    iptal_kaynagi: d.iptal_kaynagi as DersTipi['iptal_kaynagi'],
    iptal_eden_id: d.iptal_eden_id,
    iptal_at: d.iptal_at?.toISOString() ?? null,
    gec_iptal: d.gec_iptal,
    ilk_baslangic_at: d.ilk_baslangic_at.toISOString(),
    ertelendi_sayisi: d.ertelendi_sayisi,
    telafi: d.telafi,
    telafi_kaynak_ders_id: d.telafi_kaynak_ders_id,
    seri_istisna: d.seri_istisna,
    online_baglanti: d.online_baglanti,
    yer: d.yer,
    cakisma_onayli: d.cakisma_onayli,
    katilimci_sayisi: katilimciSayisi,
    surum: d.surum,
    created_at: d.created_at.toISOString(),
  };
}

export function seriYaniti(s: SeriSatiri) {
  return {
    id: s.id,
    grup_id: s.grup_id,
    ogretmen_id: s.ogretmen_id,
    brans_kodu: s.brans_kodu,
    baslik: s.baslik,
    tekrar_kurali: s.tekrar_kurali,
    baslangic_tarihi: s.baslangic_tarihi,
    bitis_tarihi: s.bitis_tarihi,
    adet: s.adet,
    baslangic_saati: s.baslangic_saati.slice(0, 5),
    sure_dk: s.sure_dk,
    saat_dilimi: s.saat_dilimi,
    online_baglanti: s.online_baglanti,
    yer: s.yer,
    uretildi_son_tarih: s.uretildi_son_tarih,
    durum: s.durum as 'aktif' | 'bitti' | 'iptal',
    surum: s.surum,
  };
}

export const cakisanYaniti = (d: DersSatiri) => ({
  id: d.id,
  grup_id: d.grup_id,
  baslik: d.baslik,
  baslangic_at: d.baslangic_at.toISOString(),
  bitis_at: d.bitis_at.toISOString(),
});

// --- Kapsam ----------------------------------------------------------------------------------

/**
 * `dersler` satirlari icin kapsam kosulu (ADR 0004). Liste ve tekil uclar ayni suzgeci kullanir;
 * kapsam disi kayit 404'tur.
 * - `kurum`: ek kosul yok; `sube`: grubu kendi subesinde olan dersler
 * - `grup` (ogretmen): atandigi gruplarin dersleri ya da kendi dersleri
 * - `kendi` (ogrenci): yalniz katilimcisi oldugu dersler
 */
export function dersKapsami(tx: Tx, y: YetkiBaglami): SQL | undefined {
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return inArray(dersler.grup_id, kapsamdakiGruplar(tx, y));
    case 'grup':
      return or(
        inArray(dersler.grup_id, kapsamdakiGruplar(tx, y)),
        eq(dersler.ogretmen_id, y.uyelikId),
      );
    case 'kendi':
      return exists(
        tx
          .select({ bir: sql`1` })
          .from(dersKatilimcilari)
          .where(
            and(
              eq(dersKatilimcilari.ders_id, dersler.id),
              eq(dersKatilimcilari.ogrenci_id, y.uyelikId),
            ),
          ),
      );
  }
}

/** Kapsamdaki tek ders (kapsam disi = yok). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function dersBul(tx: Tx, y: YetkiBaglami, dersId: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(dersler)
    .where(and(eq(dersler.id, dersId), eq(dersler.kurum_id, y.kurumId), dersKapsami(tx, y)));
  const [d] = await (kilit ? sorgu.for('update') : sorgu);
  if (!d) throw dersBulunamadi();
  return d;
}

// --- Katilimcilar ----------------------------------------------------------------------------

/** Birden cok dersin katilimci sayisi tek sorguda (N+1 yok). */
export async function katilimciSayilari(
  tx: Tx,
  dersIdleri: readonly string[],
): Promise<Map<string, number>> {
  if (dersIdleri.length === 0) return new Map();
  const satirlar = await tx
    .select({ ders_id: dersKatilimcilari.ders_id, n: sql<number>`count(*)::int` })
    .from(dersKatilimcilari)
    .where(inArray(dersKatilimcilari.ders_id, [...dersIdleri]))
    .groupBy(dersKatilimcilari.ders_id);
  return new Map(satirlar.map((s) => [s.ders_id, s.n]));
}

/** Tekil ders yaniti: katilimci listesi ve gorunen adlar (ogrenci rolunde yalniz kendisi). */
export async function dersDetayi(tx: Tx, y: YetkiBaglami, d: DersSatiri) {
  const satirlar = await tx
    .select({ ogrenci_id: dersKatilimcilari.ogrenci_id, tur: dersKatilimcilari.tur })
    .from(dersKatilimcilari)
    .where(eq(dersKatilimcilari.ders_id, d.id))
    .orderBy(asc(dersKatilimcilari.id));
  const gorunen =
    y.kapsam === 'kendi' ? satirlar.filter((s) => s.ogrenci_id === y.uyelikId) : satirlar;
  const adlar = await gorunenAdlar(
    tx,
    gorunen.map((s) => s.ogrenci_id),
  );
  return {
    ...dersYaniti(d, satirlar.length),
    katilimcilar: gorunen.map((s) => ({
      ogrenci_id: s.ogrenci_id,
      tur: s.tur as 'uye' | 'misafir' | 'telafi',
      gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
    })),
  };
}

/** Dersin katilimci kimlikleri (olay yuku icin). */
export async function katilimciIdleri(tx: Tx, dersId: string): Promise<string[]> {
  const satirlar = await tx
    .select({ ogrenci_id: dersKatilimcilari.ogrenci_id })
    .from(dersKatilimcilari)
    .where(eq(dersKatilimcilari.ders_id, dersId))
    .orderBy(asc(dersKatilimcilari.id));
  return satirlar.map((s) => s.ogrenci_id);
}

/** Birden cok dersin katilimci kimlikleri (olay yuku icin) tek sorguda. */
export async function katilimciHaritasi(
  tx: Tx,
  dersIdleri: readonly string[],
): Promise<Map<string, string[]>> {
  const harita = new Map<string, string[]>();
  if (dersIdleri.length === 0) return harita;
  const satirlar = await tx
    .select({ ders_id: dersKatilimcilari.ders_id, ogrenci_id: dersKatilimcilari.ogrenci_id })
    .from(dersKatilimcilari)
    .where(inArray(dersKatilimcilari.ders_id, [...dersIdleri]))
    .orderBy(asc(dersKatilimcilari.id));
  for (const s of satirlar) harita.set(s.ders_id, [...(harita.get(s.ders_id) ?? []), s.ogrenci_id]);
  return harita;
}

// --- Cakismalar ------------------------------------------------------------------------------

export interface Aralik {
  baslangic: Date;
  bitis: Date;
}

const kesisirMi = (a: Aralik, b: Aralik) => a.baslangic < b.bitis && a.bitis > b.baslangic;

/**
 * Ogretmenin ayni anlara denk gelen planli dersleri. `araliklar[i]` icin `cakismalar[i]` o araligin
 * cakistigi dersler; `hepsi` tekillestirilmis birlesimdir. `haricIdler`: degismekte olan dersler.
 */
export async function ogretmenCakismalari(
  tx: Tx,
  kurumId: string,
  ogretmenId: string,
  araliklar: readonly Aralik[],
  haricIdler: readonly string[] = [],
): Promise<{ cakismalar: DersSatiri[][]; hepsi: DersSatiri[] }> {
  if (araliklar.length === 0) return { cakismalar: [], hepsi: [] };
  const enErken = new Date(Math.min(...araliklar.map((a) => a.baslangic.getTime())));
  const enGec = new Date(Math.max(...araliklar.map((a) => a.bitis.getTime())));
  const satirlar = await tx
    .select()
    .from(dersler)
    .where(
      and(
        eq(dersler.kurum_id, kurumId),
        eq(dersler.ogretmen_id, ogretmenId),
        eq(dersler.durum, 'planli'),
        lt(dersler.baslangic_at, enGec),
        gt(dersler.bitis_at, enErken),
        haricIdler.length > 0 ? notInArray(dersler.id, [...haricIdler]) : undefined,
      ),
    )
    .orderBy(asc(dersler.baslangic_at), asc(dersler.id));
  const cakismalar = araliklar.map((a) =>
    satirlar.filter((s) => kesisirMi(a, { baslangic: s.baslangic_at, bitis: s.bitis_at })),
  );
  const hepsi = satirlar.filter((s) => cakismalar.some((c) => c.includes(s)));
  return { cakismalar, hepsi };
}

export interface OgrenciUyarisi {
  kod: 'ogrenci_cakismasi';
  ders_id: string;
  cakisan_ders_id: string;
  ogrenci_idleri: string[];
}

const UYARI_SINIRI = 100;

/** Ogrenci cakismasi reddetmez, yanitta uyaridir: ayni anda baska planli dersi olan ogrenciler. */
export async function ogrenciUyarilari(
  tx: Tx,
  kurumId: string,
  ogrenciIdleri: readonly string[],
  yeniDersler: readonly (Aralik & { id: string })[],
): Promise<OgrenciUyarisi[]> {
  if (ogrenciIdleri.length === 0 || yeniDersler.length === 0) return [];
  const enErken = new Date(Math.min(...yeniDersler.map((a) => a.baslangic.getTime())));
  const enGec = new Date(Math.max(...yeniDersler.map((a) => a.bitis.getTime())));
  const satirlar = await tx
    .select({
      ogrenci_id: dersKatilimcilari.ogrenci_id,
      ders_id: dersler.id,
      baslangic_at: dersler.baslangic_at,
      bitis_at: dersler.bitis_at,
    })
    .from(dersKatilimcilari)
    .innerJoin(dersler, eq(dersler.id, dersKatilimcilari.ders_id))
    .where(
      and(
        eq(dersKatilimcilari.kurum_id, kurumId),
        inArray(dersKatilimcilari.ogrenci_id, [...ogrenciIdleri]),
        eq(dersler.durum, 'planli'),
        lt(dersler.baslangic_at, enGec),
        gt(dersler.bitis_at, enErken),
        notInArray(
          dersler.id,
          yeniDersler.map((d) => d.id),
        ),
      ),
    );
  const uyarilar: OgrenciUyarisi[] = [];
  for (const yeni of yeniDersler) {
    const eslesen = new Map<string, string[]>();
    for (const s of satirlar) {
      if (!kesisirMi(yeni, { baslangic: s.baslangic_at, bitis: s.bitis_at })) continue;
      eslesen.set(s.ders_id, [...(eslesen.get(s.ders_id) ?? []), s.ogrenci_id]);
    }
    for (const [cakisanId, idler] of eslesen) {
      uyarilar.push({
        kod: 'ogrenci_cakismasi',
        ders_id: yeni.id,
        cakisan_ders_id: cakisanId,
        ogrenci_idleri: idler,
      });
      if (uyarilar.length >= UYARI_SINIRI) return uyarilar;
    }
  }
  return uyarilar;
}

// --- Olay ve denetim -------------------------------------------------------------------------

/**
 * `ders.ders.degisti.v1`i ayni islemde outbox'a yazar. Ogrenci listesi 200'luk parcalara bolunur
 * (ayni `ders_id`, `parca_no`/`parca_sayisi`). Yukte ad/telefon/e-posta yoktur.
 */
export async function dersOlayiYaz(
  tx: Tx,
  baglam: DersOlayBaglami,
  tur: DersDegisimTuru,
  d: DersSatiri,
  ogrenciIdleri: readonly string[],
  oncekiBaslangic: Date | null = null,
): Promise<void> {
  const parcalar: string[][] = [];
  for (let i = 0; i < ogrenciIdleri.length; i += DERS_OLAY_PARCA_BOYUTU) {
    parcalar.push(ogrenciIdleri.slice(i, i + DERS_OLAY_PARCA_BOYUTU));
  }
  if (parcalar.length === 0) parcalar.push([]);
  for (const [i, parca] of parcalar.entries()) {
    const olay = dersDersDegistiV1.create({
      ...baglam,
      data: {
        ders_id: d.id,
        degisim_turu: tur,
        seri_id: d.seri_id,
        grup_id: d.grup_id,
        ogretmen_id: d.ogretmen_id,
        brans_kodu: d.brans_kodu,
        baslangic_at: d.baslangic_at.toISOString(),
        bitis_at: d.bitis_at.toISOString(),
        onceki_baslangic_at: oncekiBaslangic?.toISOString() ?? null,
        durum: d.durum as DersTipi['durum'],
        telafi: d.telafi,
        online: d.online_baglanti !== null,
        ogrenci_idleri: parca,
        parca_no: i + 1,
        parca_sayisi: parcalar.length,
        iptal_nedeni: d.iptal_nedeni,
        iptal_kaynagi: d.iptal_kaynagi as DersTipi['iptal_kaynagi'],
        gec_iptal: d.gec_iptal,
      },
    });
    await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
  }
}

/** Yazma eylemi denetim kaydi (kisisel veri yok: yalniz kimlik, sayi ve alan adlari). */
export async function dersDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefTuru: 'ders' | 'ders_serisi' | 'ders_kaynagi',
  hedefId: string,
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
): Promise<void> {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem,
    hedef_turu: hedefTuru,
    hedef_id: hedefId,
    once,
    sonra,
    ip,
  });
}

// --- Hata yardimcilari -----------------------------------------------------------------------

/** Postgres hata kodu (Drizzle sarmalayicisi dahil). */
export function pgHataKodu(err: unknown): string | undefined {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const kod = (e as { code?: string }).code;
    if (typeof kod === 'string') return kod;
  }
  return undefined;
}

/** Exclusion constraint ihlali: ogretmen cakismasi yarisi (`dersler_ogretmen_id_cakisma_excl`). */
export const exclusionIhlaliMi = (err: unknown): boolean => pgHataKodu(err) === '23P01';
