import {
  denemeHataKodlari,
  errorCodes,
  kurumAyarlariSema,
  ogrenmeDenemeGirildiV1,
  type DenemeBolumGirdisi,
  type DenemeKuraliTipi,
  type DenemeSatirHatasi,
  type DenemeTipi,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

import {
  bransler,
  denemeBolumleri,
  denemeKurallari,
  denemeler,
  denetimKayitlari,
  grupUyeleri,
  kurumlar,
  uyelikler,
  type DenemeKuraliBolumu,
} from '../../db/schema.js';
import {
  atananGruplar,
  gorunenAdlar,
  kapsamdakiGruplar,
  modulAcikMi,
  type YetkiBaglami,
} from '../hesap/index.js';
import { OUTBOX_TABLOSU, olayBaglami, type OdevOlayBaglami } from './odev-deposu.js';

export type DenemeSatiri = typeof denemeler.$inferSelect;
export type KuralSatiri = typeof denemeKurallari.$inferSelect;

const SIFIR_UUID = '00000000-0000-0000-0000-000000000000';

export const denemeBulunamadi = () => new AppError(404, errorCodes.notFound, 'Deneme bulunamadı.');
export const kuralBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Deneme kuralı bulunamadı.');
export const ogrenciBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');

/** Postgres benzersizlik ihlali (Drizzle sarmalayicisi dahil). */
export function benzersizlikIhlaliMi(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}

/** Postgres yabanci anahtar ihlali (silinen satira baglanan kayit). */
export function yabanciAnahtarIhlaliMi(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === '23503') return true;
  }
  return false;
}

// --- Yanit donusumleri -----------------------------------------------------------------------

/** `numeric` sutunlar surucuden string gelir; net degerleri API'de 2 ondalikli sayidir. */
export const sayi = (v: string): number => Number(v);

export function kuralYaniti(k: KuralSatiri): DenemeKuraliTipi {
  return {
    id: k.id,
    kurum_id: k.kurum_id,
    global: k.kurum_id === null,
    kod: k.kod,
    ad: k.ad,
    yanlis_katsayisi: sayi(k.yanlis_katsayisi),
    bolumler: k.bolumler,
    toplam_soru_sayisi: k.bolumler.reduce((t, b) => t + b.soru_sayisi, 0),
    toplam_sure_dk: k.toplam_sure_dk,
    gecerli_yil: k.gecerli_yil,
    aktif: k.aktif,
    surum: k.surum,
  };
}

/** Deneme satirlarini bolumleriyle birlikte yanita cevirir (tek ek sorgu). */
export async function denemeYanitlari(
  tx: Tx,
  satirlar: readonly DenemeSatiri[],
  adGoster: boolean,
): Promise<DenemeTipi[]> {
  if (satirlar.length === 0) return [];
  const idler = satirlar.map((s) => s.id);
  const bolumler = await tx
    .select()
    .from(denemeBolumleri)
    .where(inArray(denemeBolumleri.deneme_id, idler))
    .orderBy(asc(denemeBolumleri.id));
  const adlar = adGoster
    ? await gorunenAdlar(
        tx,
        satirlar.map((s) => s.ogrenci_id),
      )
    : new Map<string, string | null>();
  return satirlar.map((d) => ({
    id: d.id,
    ogrenci_id: d.ogrenci_id,
    gorunen_ad: adGoster ? (adlar.get(d.ogrenci_id) ?? null) : null,
    kural_id: d.kural_id,
    kural_kodu: d.kural_kodu,
    yanlis_katsayisi: sayi(d.yanlis_katsayisi),
    ad: d.ad,
    yayinevi: d.yayinevi,
    sinav_tarihi: d.sinav_tarihi,
    toplam_net: sayi(d.toplam_net),
    giren_id: d.giren_id,
    kaynak: d.kaynak as DenemeTipi['kaynak'],
    sure_dk: d.sure_dk,
    not: d.not_metni,
    onay_durumu: d.onay_durumu as DenemeTipi['onay_durumu'],
    onaylayan_id: d.onaylayan_id,
    onay_at: d.onay_at?.toISOString() ?? null,
    red_nedeni: d.red_nedeni,
    surum: d.surum,
    created_at: d.created_at.toISOString(),
    bolumler: bolumler
      .filter((b) => b.deneme_id === d.id)
      .map((b) => ({
        bolum_kodu: b.bolum_kodu,
        brans_kodu: b.brans_kodu,
        soru_sayisi: b.soru_sayisi,
        dogru: b.dogru,
        yanlis: b.yanlis,
        bos: b.bos,
        net: sayi(b.net),
      })),
  }));
}

// --- Kapsam ----------------------------------------------------------------------------------

/**
 * Ogrenci kolonu icin kapsam kosulu (ADR 0004). `kurum`: kosul yok; `sube`: subedeki ogrenciler ya da
 * subedeki gruplarin uyeleri; `grup`: ogretmenin atandigi gruplarin etkin uyeleri; `kendi`: yalniz kendisi.
 */
export function ogrenciKosulu(tx: Tx, y: YetkiBaglami, kolon: AnyPgColumn): SQL | undefined {
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return or(
        inArray(
          kolon,
          tx
            .select({ id: uyelikler.id })
            .from(uyelikler)
            .where(eq(uyelikler.sube_id, y.subeId ?? SIFIR_UUID)),
        ),
        inArray(
          kolon,
          tx
            .select({ id: grupUyeleri.ogrenci_id })
            .from(grupUyeleri)
            .where(
              and(
                isNull(grupUyeleri.bitis_tarihi),
                inArray(grupUyeleri.grup_id, kapsamdakiGruplar(tx, y)),
              ),
            ),
        ),
      );
    case 'grup':
      return inArray(
        kolon,
        tx
          .select({ id: grupUyeleri.ogrenci_id })
          .from(grupUyeleri)
          .where(
            and(
              isNull(grupUyeleri.bitis_tarihi),
              inArray(grupUyeleri.grup_id, atananGruplar(tx, y.uyelikId)),
            ),
          ),
      );
    case 'kendi':
      return eq(kolon, y.uyelikId);
  }
}

/** Kapsamdaki ogrenciler (yazma icin yalniz etkin uyelik). Kapsam disi/olmayan kimlikler listede yoktur. */
export async function kapsamdakiOgrenciler(
  tx: Tx,
  y: YetkiBaglami,
  idler: readonly string[],
  yalnizAktif = true,
): Promise<Map<string, { id: string; ogrenci_no: string | null; kademe_id: string | null }>> {
  const sonuc = new Map<
    string,
    { id: string; ogrenci_no: string | null; kademe_id: string | null }
  >();
  if (idler.length === 0) return sonuc;
  const satirlar = await tx
    .select({ id: uyelikler.id, ogrenci_no: uyelikler.ogrenci_no, kademe_id: uyelikler.kademe_id })
    .from(uyelikler)
    .where(
      and(
        inArray(uyelikler.id, [...idler]),
        eq(uyelikler.kurum_id, y.kurumId),
        eq(uyelikler.rol, 'ogrenci'),
        yalnizAktif ? eq(uyelikler.durum, 'aktif') : undefined,
        ogrenciKosulu(tx, y, uyelikler.id),
      ),
    );
  for (const s of satirlar) sonuc.set(s.id, s);
  return sonuc;
}

export async function ogrenciKapsamdaOlmali(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  yalnizAktif = true,
): Promise<void> {
  const harita = await kapsamdakiOgrenciler(tx, y, [ogrenciId], yalnizAktif);
  if (!harita.has(ogrenciId)) throw ogrenciBulunamadi();
}

/** Kapsamdaki tek deneme (kapsam disi = 404). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function denemeBul(tx: Tx, y: YetkiBaglami, id: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(denemeler)
    .where(
      and(
        eq(denemeler.id, id),
        eq(denemeler.kurum_id, y.kurumId),
        ogrenciKosulu(tx, y, denemeler.ogrenci_id),
      ),
    );
  const [d] = await (kilit ? sorgu.for('update') : sorgu);
  if (!d) throw denemeBulunamadi();
  return d;
}

// --- Modul ve ayar ---------------------------------------------------------------------------

/**
 * `deneme` modulu ogrencinin kademesinde ya da etkin gruplarinin HEPSINDE kapaliysa yazma 403
 * `modul_kapali` (kurum duzeyi `requirePermission` icinde zaten denetlenir). Grupsuz ogrenci yalniz kademeye bakar.
 */
export async function ogrencilerIcinModulKapali(
  tx: Tx,
  kurumId: string,
  ogrenciler: readonly { id: string; kademe_id: string | null }[],
): Promise<Set<string>> {
  const kapali = new Set<string>();
  if (ogrenciler.length === 0) return kapali;
  const idler = ogrenciler.map((o) => o.id);
  const uyeler = await tx
    .select({ ogrenci_id: grupUyeleri.ogrenci_id, grup_id: grupUyeleri.grup_id })
    .from(grupUyeleri)
    .where(and(isNull(grupUyeleri.bitis_tarihi), inArray(grupUyeleri.ogrenci_id, idler)));
  const kademeOnbellek = new Map<string, boolean>();
  const grupOnbellek = new Map<string, boolean>();
  for (const k of new Set(ogrenciler.flatMap((o) => (o.kademe_id ? [o.kademe_id] : [])))) {
    kademeOnbellek.set(k, await modulAcikMi(tx, kurumId, 'deneme', { kademeId: k }));
  }
  for (const g of new Set(uyeler.map((u) => u.grup_id))) {
    grupOnbellek.set(g, await modulAcikMi(tx, kurumId, 'deneme', { grupId: g }));
  }
  for (const o of ogrenciler) {
    if (o.kademe_id && kademeOnbellek.get(o.kademe_id) === false) {
      kapali.add(o.id);
      continue;
    }
    const gruplari = uyeler.filter((u) => u.ogrenci_id === o.id).map((u) => u.grup_id);
    if (gruplari.length > 0 && gruplari.every((g) => grupOnbellek.get(g) === false)) {
      kapali.add(o.id);
    }
  }
  return kapali;
}

export const modulKapaliHatasi = () =>
  new AppError(403, errorCodes.modulKapali, 'Deneme özelliği bu öğrenci için kapalı.');

export async function denemeModuluAcikOlmali(
  tx: Tx,
  kurumId: string,
  ogrenci: { id: string; kademe_id: string | null },
): Promise<void> {
  const kapali = await ogrencilerIcinModulKapali(tx, kurumId, [ogrenci]);
  if (kapali.has(ogrenci.id)) throw modulKapaliHatasi();
}

/** Kurum ayari `ogrenci_deneme_girisi` (varsayilan true). */
export async function ogrenciGirisiAcikMi(tx: Tx, kurumId: string): Promise<boolean> {
  const [k] = await tx
    .select({ ayarlar: kurumlar.ayarlar })
    .from(kurumlar)
    .where(eq(kurumlar.id, kurumId));
  const ayar = kurumAyarlariSema.safeParse(k?.ayarlar ?? {});
  return !ayar.success || ayar.data.ogrenci_deneme_girisi !== false;
}

export async function ogrenciGirisiAcikOlmali(tx: Tx, kurumId: string): Promise<void> {
  if (!(await ogrenciGirisiAcikMi(tx, kurumId))) {
    throw new AppError(
      403,
      denemeHataKodlari.ogrenciGirisiKapali,
      'Kurumunuzda öğrenci deneme girişi kapalı.',
    );
  }
}

// --- Kural -----------------------------------------------------------------------------------

/**
 * Kural cozumu: `kural_id` belirli surumu, `kural_kodu` ise en yeni aktif surumu (en yuksek `gecerli_yil`).
 * RLS global ve kendi kurumun kurallarini gorunur kilar; bulunamayan 404.
 */
export async function kuralCoz(
  tx: Tx,
  girdi: { kural_id?: string | undefined; kural_kodu?: string | undefined },
): Promise<KuralSatiri> {
  if (girdi.kural_id === undefined && girdi.kural_kodu === undefined) {
    throw new AppError(422, denemeHataKodlari.kuralGerekli, 'kural_id veya kural_kodu gerekli.');
  }
  const [k] = await tx
    .select()
    .from(denemeKurallari)
    .where(
      and(
        eq(denemeKurallari.aktif, true),
        girdi.kural_id !== undefined
          ? eq(denemeKurallari.id, girdi.kural_id)
          : eq(denemeKurallari.kod, girdi.kural_kodu ?? ''),
      ),
    )
    .orderBy(sql`${denemeKurallari.gecerli_yil} desc nulls last`, desc(denemeKurallari.id))
    .limit(1);
  if (!k) throw kuralBulunamadi();
  return k;
}

export async function bransKodlariGecerliOlmali(tx: Tx, kodlar: readonly string[]): Promise<void> {
  const benzersiz = [...new Set(kodlar)];
  const mevcut = await tx
    .select({ kod: bransler.kod })
    .from(bransler)
    .where(and(inArray(bransler.kod, benzersiz), eq(bransler.aktif, true)));
  const bulunan = new Set(mevcut.map((b) => b.kod));
  const eksik = benzersiz.filter((k) => !bulunan.has(k));
  if (eksik.length > 0) {
    throw new AppError(422, errorCodes.validation, 'Branş kodu geçersiz.', { gecersiz: eksik });
  }
}

// --- Bolum hazirlama (saf) -------------------------------------------------------------------

export interface HazirBolum {
  bolum_kodu: string;
  brans_kodu: string;
  soru_sayisi: number;
  dogru: number;
  yanlis: number;
  bos: number;
}

export interface BolumHatasi {
  kod: string;
  mesaj: string;
}

/**
 * Bolum girdilerini kuralin bolumleriyle eslestirir; `bos` yoksa `soru_sayisi - dogru - yanlis`.
 * Net HESAPLANMAZ (veritabani uretilmis sutunu esastir); burada yalniz `dogru+yanlis+bos = soru_sayisi` kosulu denenir.
 */
export function bolumleriHazirla(
  referans: ReadonlyMap<string, Pick<DenemeKuraliBolumu, 'brans_kodu' | 'soru_sayisi'>>,
  girdiler: readonly DenemeBolumGirdisi[],
): { bolumler: HazirBolum[]; hata: BolumHatasi | null } {
  const bolumler: HazirBolum[] = [];
  for (const g of girdiler) {
    const ref = referans.get(g.bolum_kodu);
    if (!ref) {
      return {
        bolumler: [],
        hata: {
          kod: denemeHataKodlari.bolumGecersiz,
          mesaj: `Kuralda "${g.bolum_kodu}" bölümü yok.`,
        },
      };
    }
    const bos = g.bos ?? ref.soru_sayisi - g.dogru - g.yanlis;
    if (bos < 0 || g.dogru + g.yanlis + bos !== ref.soru_sayisi) {
      return {
        bolumler: [],
        hata: {
          kod: denemeHataKodlari.bolumGecersiz,
          mesaj: `"${g.bolum_kodu}" bölümünde doğru + yanlış + boş ${String(ref.soru_sayisi)} olmalı.`,
        },
      };
    }
    bolumler.push({
      bolum_kodu: g.bolum_kodu,
      brans_kodu: ref.brans_kodu,
      soru_sayisi: ref.soru_sayisi,
      dogru: g.dogru,
      yanlis: g.yanlis,
      bos,
    });
  }
  return { bolumler, hata: null };
}

export const kuralReferansi = (k: KuralSatiri) => new Map(k.bolumler.map((b) => [b.bolum_kodu, b]));

// --- Yazma -----------------------------------------------------------------------------------

export interface DenemeBasligi {
  ogrenci_id: string;
  ad: string;
  yayinevi: string | null;
  sinav_tarihi: string;
  sure_dk: number | null;
  not_metni: string | null;
  bolumler: HazirBolum[];
}

export interface YazimBaglami {
  kural: KuralSatiri;
  kaynak: 'ogrenci' | 'ogretmen';
}

const PARCA = 500;

/**
 * Deneme basliklarini ve bolumlerini tek islemde yazar; `toplam_net` bolum yazimiyla ayni islemde
 * `SUM(net)` ile (veritabani uretilmis sutunundan) hesaplanir. Ogretmen girisi dogrudan `onaylandi`.
 */
export async function denemeleriYaz(
  tx: Tx,
  y: YetkiBaglami,
  { kural, kaynak }: YazimBaglami,
  basliklar: readonly DenemeBasligi[],
): Promise<DenemeSatiri[]> {
  const simdi = new Date();
  const onayli = kaynak === 'ogretmen';
  const yeniler = basliklar.map((b) => ({ id: uuidv7(), b }));
  const eklenen: DenemeSatiri[] = [];
  for (let i = 0; i < yeniler.length; i += PARCA) {
    const parca = yeniler.slice(i, i + PARCA);
    const satirlar = await tx
      .insert(denemeler)
      .values(
        parca.map(({ id, b }) => ({
          id,
          kurum_id: y.kurumId,
          created_by: y.kullaniciId,
          ogrenci_id: b.ogrenci_id,
          kural_id: kural.id,
          kural_kodu: kural.kod,
          yanlis_katsayisi: kural.yanlis_katsayisi,
          ad: b.ad,
          yayinevi: b.yayinevi,
          sinav_tarihi: b.sinav_tarihi,
          giren_id: y.uyelikId,
          kaynak,
          sure_dk: b.sure_dk,
          not_metni: b.not_metni,
          onay_durumu: onayli ? 'onaylandi' : 'bekliyor',
          onaylayan_id: onayli ? y.uyelikId : null,
          onay_at: onayli ? simdi : null,
        })),
      )
      .returning();
    eklenen.push(...satirlar);
  }
  await bolumSatirlariniYaz(
    tx,
    y,
    kural.yanlis_katsayisi,
    yeniler.map(({ id, b }) => ({ denemeId: id, bolumler: b.bolumler })),
  );
  return toplamNetiniGuncelle(
    tx,
    yeniler.map((x) => x.id),
  );
}

/** Bolum satirlarini yazar; `net` veritabaninca uretilir, burada gonderilmez. */
export async function bolumSatirlariniYaz(
  tx: Tx,
  y: YetkiBaglami,
  katsayi: string,
  gruplar: readonly { denemeId: string; bolumler: readonly HazirBolum[] }[],
): Promise<void> {
  const satirlar = gruplar.flatMap(({ denemeId, bolumler }) =>
    bolumler.map((x) => ({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      deneme_id: denemeId,
      bolum_kodu: x.bolum_kodu,
      brans_kodu: x.brans_kodu,
      soru_sayisi: x.soru_sayisi,
      dogru: x.dogru,
      yanlis: x.yanlis,
      bos: x.bos,
      katsayi,
    })),
  );
  for (let i = 0; i < satirlar.length; i += PARCA) {
    await tx.insert(denemeBolumleri).values(satirlar.slice(i, i + PARCA));
  }
}

/** `toplam_net = SUM(bolum net)` ifadesi (bolum yazan her yol bunu ayni islemde uygular). */
export const toplamNetSql = sql<string>`coalesce((select sum(b.net) from ogrenme.deneme_bolumleri b where b.deneme_id = ${denemeler.id}), 0)`;

/** Verilen denemelerin `toplam_net` degerini bolum netlerinin toplamina esitler. */
export async function toplamNetiniGuncelle(
  tx: Tx,
  idler: readonly string[],
): Promise<DenemeSatiri[]> {
  const guncel: DenemeSatiri[] = [];
  for (let i = 0; i < idler.length; i += PARCA) {
    const parca = idler.slice(i, i + PARCA);
    const satirlar = await tx
      .update(denemeler)
      .set({ toplam_net: toplamNetSql })
      .where(inArray(denemeler.id, parca))
      .returning();
    guncel.push(...satirlar);
  }
  const sira = new Map(idler.map((id, i) => [id, i]));
  return guncel.sort((a, b) => (sira.get(a.id) ?? 0) - (sira.get(b.id) ?? 0));
}

/** Olay yalniz onaylanmis sonucta; kisisel veri ve serbest metin yok. Ayni islemde outbox. */
export async function girildiOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  d: DenemeSatiri,
): Promise<void> {
  const olay = ogrenmeDenemeGirildiV1.create({
    ...baglam,
    data: {
      deneme_id: d.id,
      ogrenci_id: d.ogrenci_id,
      kural_kodu: d.kural_kodu,
      sinav_tarihi: d.sinav_tarihi,
      toplam_net: sayi(d.toplam_net),
    },
  });
  await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
}

export { OUTBOX_TABLOSU, olayBaglami };

// --- Toplu giris -----------------------------------------------------------------------------

export interface TopluSatir {
  /** Hata raporunda gosterilecek konum (toplu: 0 tabanli sira; Excel: sayfa satir numarasi). */
  satir: number;
  ogrenci_id: string;
  bolumler: DenemeBolumGirdisi[];
  not_metni: string | null;
}

export interface TopluMeta {
  ad: string;
  yayinevi: string | null;
  sinav_tarihi: string;
  sure_dk: number | null;
}

export const topluHatasi = (hatalar: DenemeSatirHatasi[]) =>
  new AppError(
    422,
    denemeHataKodlari.topluGirisHatali,
    `${String(hatalar.length)} satırda hata var; hiçbir deneme kaydedilmedi.`,
    { hatalar },
  );

/**
 * Bir deneme + N ogrenci, hepsi ya da hic: once butun satirlar dogrulanir (satir bazli hata listesi),
 * hata yoksa tek islemde yazilir ve ogretmen girisi oldugu icin her satir icin olay outbox'a eklenir.
 */
export async function topluYaz(
  tx: Tx,
  y: YetkiBaglami,
  baglam: OdevOlayBaglami,
  kural: KuralSatiri,
  meta: TopluMeta,
  satirlar: readonly TopluSatir[],
  onHatalar: DenemeSatirHatasi[] = [],
): Promise<DenemeSatiri[]> {
  const hatalar = [...onHatalar];
  const hata = (s: TopluSatir, kod: string, mesaj: string) =>
    hatalar.push({ satir: s.satir, ogrenci_id: s.ogrenci_id, kod, mesaj });
  const ogrenciler = await kapsamdakiOgrenciler(
    tx,
    y,
    satirlar.map((s) => s.ogrenci_id),
  );
  const kapali = await ogrencilerIcinModulKapali(tx, y.kurumId, [...ogrenciler.values()]);
  const mevcut = await tx
    .select({ ogrenci_id: denemeler.ogrenci_id })
    .from(denemeler)
    .where(
      and(
        eq(denemeler.kurum_id, y.kurumId),
        eq(denemeler.kural_id, kural.id),
        eq(denemeler.sinav_tarihi, meta.sinav_tarihi),
        eq(denemeler.ad, meta.ad),
        inArray(
          denemeler.ogrenci_id,
          satirlar.map((s) => s.ogrenci_id),
        ),
      ),
    );
  const varOlan = new Set(mevcut.map((m) => m.ogrenci_id));
  const gorulen = new Set<string>();
  const referans = kuralReferansi(kural);
  const basliklar: DenemeBasligi[] = [];
  for (const s of satirlar) {
    if (!ogrenciler.has(s.ogrenci_id)) {
      hata(s, 'ogrenci_bulunamadi', 'Öğrenci bulunamadı ya da kapsamınızda değil.');
      continue;
    }
    if (kapali.has(s.ogrenci_id)) {
      hata(s, errorCodes.modulKapali, 'Deneme özelliği bu öğrenci için kapalı.');
      continue;
    }
    if (gorulen.has(s.ogrenci_id)) {
      hata(s, 'ogrenci_tekrar', 'Aynı öğrenci birden fazla satırda.');
      continue;
    }
    gorulen.add(s.ogrenci_id);
    if (varOlan.has(s.ogrenci_id)) {
      hata(s, denemeHataKodlari.denemeZatenVar, 'Bu öğrenci için aynı deneme zaten girilmiş.');
      continue;
    }
    const h = bolumleriHazirla(referans, s.bolumler);
    if (h.hata) {
      hata(s, h.hata.kod, h.hata.mesaj);
      continue;
    }
    basliklar.push({
      ogrenci_id: s.ogrenci_id,
      ad: meta.ad,
      yayinevi: meta.yayinevi,
      sinav_tarihi: meta.sinav_tarihi,
      sure_dk: meta.sure_dk,
      not_metni: s.not_metni,
      bolumler: h.bolumler,
    });
  }
  if (hatalar.length > 0) {
    throw topluHatasi([...hatalar].sort((a, b) => a.satir - b.satir));
  }
  const yazilan = await denemeleriYaz(tx, y, { kural, kaynak: 'ogretmen' }, basliklar);
  for (const d of yazilan) await girildiOlayiYaz(tx, baglam, d);
  return yazilan;
}

// --- Denetim ---------------------------------------------------------------------------------

/** Yazma eylemi denetim kaydi (kisisel veri ve serbest metin yok: yalniz kimlik, sayi, durum). */
export async function denemeDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefTuru: 'deneme' | 'deneme_kurali' | 'kurum',
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
