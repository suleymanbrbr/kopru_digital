import {
  errorCodes,
  mufredatEditorHataKodlari,
  mufredatHataKodlari,
  ogrenmeMufredatYayinlandiV1,
  type DegisiklikTuru,
  type KatalogKodu,
  type KonuSeviye,
  type PlatformFarkOzeti,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { konular, kurumlar, mufredatDegisiklikleri, mufredatSurumleri } from '../../db/schema.js';
import { bransVarMi, type KonuSatiri } from './mufredat-deposu.js';

/**
 * Platform mufredat editoru (docs/schema/api.md "Platform mufredat editoru"). Tum islemler `api_sistem`
 * islemi (`sistem/mufredat-editor.ts`) icinde, tek taslak surum uzerinde calisir.
 *
 * Model: konu kimligi surumler arasinda sabittir; bir konu `[gecerli_surum_baslangic, gecerli_surum_bitis)`
 * araligindaki surumlerde vardir. Taslak = yayinlanmamis surum `D`; taslak acmak satir kopyalamaz (onceki
 * yayinli surumun aktif konulari `D`de de aktiftir). Yayinli bir surumun gordugu agac degismesin diye:
 *  - ekle: yeni satir (baslangic = D);
 *  - adlandir / ust degistir (tasi): eski satir `bitis = D` + `yerine_gecen_id`, yeni satir ve alt agaci kopyalanir;
 *  - birlestir: kaynagin alt konulari hedefe baglanir, kaynak `bitis = D` + `yerine_gecen_id = hedef`;
 *  - kaldir: konu ve alt agaci `bitis = D`.
 * Taslakta dogan satirlar (baslangic = D) henuz hicbir yayinli surumde yoktur; yerinde degistirilir ve
 * bitis = baslangic (bos aralik) ile "hic var olmadi" olarak kaldirilir. Hicbir satir silinmez.
 */

export type SurumSatiri = typeof mufredatSurumleri.$inferSelect;
export type DegisiklikSatiri = typeof mufredatDegisiklikleri.$inferSelect;

const USTUN_SEVIYESI: Record<KonuSeviye, KonuSeviye | null> = {
  unite: null,
  konu: 'unite',
  alt_konu: 'konu',
};

const hata = (kod: string, mesaj: string, durum = 400) => new AppError(durum, kod, mesaj);

/** Surum `v`de gecerli global konular (siralamali). */
export async function surumKonulari(
  tx: Tx,
  katalog: KatalogKodu,
  surumNo: number,
): Promise<KonuSatiri[]> {
  return tx
    .select()
    .from(konular)
    .where(
      and(
        isNull(konular.kurum_id),
        eq(konular.katalog_kodu, katalog),
        sql`${konular.gecerli_surum_baslangic} <= ${surumNo}`,
        or(isNull(konular.gecerli_surum_bitis), sql`${konular.gecerli_surum_bitis} > ${surumNo}`),
      ),
    )
    .orderBy(asc(konular.brans_kodu), asc(konular.sira), asc(konular.id));
}

export async function surumBul(
  tx: Tx,
  katalog: KatalogKodu,
  surumNo: number,
): Promise<SurumSatiri> {
  const [s] = await tx
    .select()
    .from(mufredatSurumleri)
    .where(
      and(eq(mufredatSurumleri.katalog_kodu, katalog), eq(mufredatSurumleri.surum_no, surumNo)),
    );
  if (!s) throw hata(mufredatHataKodlari.surumBulunamadi, 'Sürüm bulunamadı.', 404);
  return s;
}

/** Katalogun taslak surumunu okur; `kilit` ile satiri kilitler (ayni taslaktaki islemler serilesir). */
export async function taslakBul(tx: Tx, katalog: KatalogKodu, kilit = true): Promise<SurumSatiri> {
  const sorgu = tx
    .select()
    .from(mufredatSurumleri)
    .where(
      and(eq(mufredatSurumleri.katalog_kodu, katalog), isNull(mufredatSurumleri.yayinlandi_at)),
    );
  const [s] = await (kilit ? sorgu.for('update') : sorgu);
  if (!s) throw hata(mufredatEditorHataKodlari.taslakYok, 'Bu katalogda açık taslak yok.', 404);
  return s;
}

export async function taslakAc(
  tx: Tx,
  katalog: KatalogKodu,
  girdi: { ad: string; aciklama?: string | undefined },
): Promise<SurumSatiri> {
  const [mevcut] = await tx
    .select({ surum_no: mufredatSurumleri.surum_no })
    .from(mufredatSurumleri)
    .where(
      and(eq(mufredatSurumleri.katalog_kodu, katalog), isNull(mufredatSurumleri.yayinlandi_at)),
    );
  if (mevcut) {
    throw hata(
      mufredatEditorHataKodlari.taslakVar,
      `Bu katalogda zaten açık bir taslak var (sürüm ${String(mevcut.surum_no)}).`,
      409,
    );
  }
  const [en] = await tx
    .select({ n: sql<number>`coalesce(max(${mufredatSurumleri.surum_no}), 0)::int` })
    .from(mufredatSurumleri)
    .where(eq(mufredatSurumleri.katalog_kodu, katalog));
  const [satir] = await tx
    .insert(mufredatSurumleri)
    .values({
      id: uuidv7(),
      katalog_kodu: katalog,
      surum_no: (en?.n ?? 0) + 1,
      ad: girdi.ad,
      aciklama: girdi.aciklama ?? null,
    })
    .returning();
  if (!satir) throw new Error('taslak yazilamadi');
  return satir;
}

interface Baglam {
  tx: Tx;
  katalog: KatalogKodu;
  taslak: SurumSatiri;
  aktorId: string;
}

async function degisiklikYaz(
  b: Baglam,
  d: {
    tur: DegisiklikTuru;
    konuId: string;
    hedefKonuId?: string | null;
    adOnce?: string | null;
    adSonra?: string | null;
    ayrinti?: Record<string, unknown>;
    not: string;
  },
): Promise<DegisiklikSatiri> {
  const [s] = await b.tx
    .insert(mufredatDegisiklikleri)
    .values({
      id: uuidv7(),
      katalog_kodu: b.katalog,
      surum_no: b.taslak.surum_no,
      tur: d.tur,
      konu_id: d.konuId,
      hedef_konu_id: d.hedefKonuId ?? null,
      ad_once: d.adOnce ?? null,
      ad_sonra: d.adSonra ?? null,
      ayrinti: d.ayrinti ?? {},
      not_metni: d.not,
      olusturan_id: b.aktorId,
    })
    .returning();
  if (!s) throw new Error('degisiklik yazilamadi');
  return s;
}

/** Taslakta aktif konu agaci (bellek ici anlik goruntu). */
class Agac {
  readonly kimlikle = new Map<string, KonuSatiri>();
  private readonly cocukHaritasi = new Map<string | null, KonuSatiri[]>();

  constructor(satirlar: KonuSatiri[]) {
    for (const k of satirlar) {
      this.kimlikle.set(k.id, k);
      const liste = this.cocukHaritasi.get(k.ust_id) ?? [];
      liste.push(k);
      this.cocukHaritasi.set(k.ust_id, liste);
    }
  }

  cocuklari(id: string | null): KonuSatiri[] {
    return this.cocukHaritasi.get(id) ?? [];
  }

  /** `id`, `ata`nin kendisi ya da soyu mu. */
  soyMu(id: string, ata: string): boolean {
    for (let k = this.kimlikle.get(id); k; k = k.ust_id ? this.kimlikle.get(k.ust_id) : undefined) {
      if (k.id === ata) return true;
    }
    return false;
  }

  altAgac(id: string): KonuSatiri[] {
    const cikti: KonuSatiri[] = [];
    const yigin = [...this.cocuklari(id)];
    for (let k = yigin.pop(); k; k = yigin.pop()) {
      cikti.push(k);
      yigin.push(...this.cocuklari(k.id));
    }
    return cikti;
  }

  sonSira(ustId: string | null, bransKodu: string): number {
    return this.cocuklari(ustId)
      .filter((k) => k.brans_kodu === bransKodu)
      .reduce((m, k) => Math.max(m, k.sira), 0);
  }
}

async function agacYukle(b: Baglam): Promise<Agac> {
  return new Agac(await surumKonulari(b.tx, b.katalog, b.taslak.surum_no));
}

function aktifKonu(agac: Agac, id: string): KonuSatiri {
  const k = agac.kimlikle.get(id);
  if (!k) throw hata(errorCodes.notFound, 'Konu bu taslakta bulunamadı.', 404);
  return k;
}

function ustKurali(
  agac: Agac,
  seviye: KonuSeviye,
  bransKodu: string,
  ustId: string | null | undefined,
  kendiId?: string,
): void {
  const gecersiz = (m: string) => hata(mufredatHataKodlari.konuUstGecersiz, m);
  const beklenen = USTUN_SEVIYESI[seviye];
  if (!ustId) {
    if (seviye === 'alt_konu') throw gecersiz('Alt konunun üst konusu olmalı.');
    return;
  }
  if (beklenen === null) throw gecersiz('Ünitenin üstü olamaz.');
  const ust = agac.kimlikle.get(ustId);
  if (!ust) throw gecersiz('Üst konu bu taslakta bulunamadı.');
  if (kendiId && agac.soyMu(ustId, kendiId)) {
    throw gecersiz('Konu kendisinin ya da alt konusunun altına taşınamaz.');
  }
  if (ust.seviye !== beklenen) throw gecersiz(`Üst konu "${beklenen}" seviyesinde olmalı.`);
  if (ust.brans_kodu !== bransKodu) throw gecersiz('Üst konu aynı branşta olmalı.');
}

interface Yama {
  ustId: string | null;
  ad?: string;
  sira?: number;
}

/** `x`i taslakta yeni satir olarak kopyalar, eskisini `bitis = D` ile kapatir. */
async function kopyala(b: Baglam, x: KonuSatiri, yama: Yama): Promise<KonuSatiri> {
  const yeniId = uuidv7();
  const [yeni] = await b.tx
    .insert(konular)
    .values({
      id: yeniId,
      kurum_id: null,
      katalog_kodu: b.katalog,
      brans_kodu: x.brans_kodu,
      ust_id: yama.ustId,
      seviye: x.seviye,
      ad: yama.ad ?? x.ad,
      kazanim_kodu: x.kazanim_kodu,
      sira: yama.sira ?? x.sira,
      sinif_seviyesi: x.sinif_seviyesi,
      gecerli_surum_baslangic: b.taslak.surum_no,
    })
    .returning();
  if (!yeni) throw new Error('konu kopyalanamadi');
  await b.tx
    .update(konular)
    .set({ gecerli_surum_bitis: b.taslak.surum_no, yerine_gecen_id: yeniId })
    .where(eq(konular.id, x.id));
  return yeni;
}

/**
 * `x`i (ve aktif alt agacini) yamadaki ust konunun altina baglar; yayinli surumlerin agaci bozulmasin diye
 * taslakta dogmamis satirlar kopyalanir. Donus: x'in yeni (ya da ayni) satiri ve kopyalanan satir sayisi.
 */
async function yenidenBagla(
  b: Baglam,
  agac: Agac,
  x: KonuSatiri,
  yama: Yama,
): Promise<{ konu: KonuSatiri; kopyalanan: number }> {
  if (x.gecerli_surum_baslangic === b.taslak.surum_no) {
    const [g] = await b.tx
      .update(konular)
      .set({
        ust_id: yama.ustId,
        ...(yama.ad !== undefined ? { ad: yama.ad } : {}),
        ...(yama.sira !== undefined ? { sira: yama.sira } : {}),
      })
      .where(eq(konular.id, x.id))
      .returning();
    if (!g) throw new Error('konu guncellenemedi');
    return { konu: g, kopyalanan: 0 };
  }
  const yeni = await kopyala(b, x, yama);
  let kopyalanan = 1;
  for (const c of agac.cocuklari(x.id)) {
    kopyalanan += (await yenidenBagla(b, agac, c, { ustId: yeni.id })).kopyalanan;
  }
  return { konu: yeni, kopyalanan };
}

export interface IslemSonucu {
  degisiklik: DegisiklikSatiri;
  konu: KonuSatiri;
}

export async function konuEkle(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
  g: {
    brans_kodu: string;
    ust_id?: string | undefined;
    seviye: KonuSeviye;
    ad: string;
    kazanim_kodu?: string | undefined;
    sira?: number | undefined;
    sinif_seviyesi?: number | undefined;
    not: string;
  },
): Promise<IslemSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const b: Baglam = { tx, katalog, taslak, aktorId };
  await bransVarMi(tx, g.brans_kodu);
  const agac = await agacYukle(b);
  ustKurali(agac, g.seviye, g.brans_kodu, g.ust_id);
  const [konu] = await tx
    .insert(konular)
    .values({
      id: uuidv7(),
      kurum_id: null,
      katalog_kodu: katalog,
      brans_kodu: g.brans_kodu,
      ust_id: g.ust_id ?? null,
      seviye: g.seviye,
      ad: g.ad,
      kazanim_kodu: g.kazanim_kodu ?? null,
      sira: g.sira ?? agac.sonSira(g.ust_id ?? null, g.brans_kodu) + 1,
      sinif_seviyesi: g.sinif_seviyesi ?? null,
      gecerli_surum_baslangic: taslak.surum_no,
    })
    .returning();
  if (!konu) throw new Error('konu eklenemedi');
  const degisiklik = await degisiklikYaz(b, {
    tur: 'ekle',
    konuId: konu.id,
    adSonra: konu.ad,
    ayrinti: { ust_id: konu.ust_id, brans_kodu: konu.brans_kodu, seviye: konu.seviye },
    not: g.not,
  });
  return { degisiklik, konu };
}

export async function konuAdlandir(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
  id: string,
  g: { ad: string; not: string },
): Promise<IslemSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const b: Baglam = { tx, katalog, taslak, aktorId };
  const agac = await agacYukle(b);
  const x = aktifKonu(agac, id);
  if (x.ad === g.ad) throw hata(errorCodes.validation, 'Yeni ad mevcut adla aynı.');
  const { konu, kopyalanan } = await yenidenBagla(b, agac, x, { ustId: x.ust_id, ad: g.ad });
  const degisiklik = await degisiklikYaz(b, {
    tur: 'adlandir',
    konuId: x.id,
    hedefKonuId: konu.id === x.id ? null : konu.id,
    adOnce: x.ad,
    adSonra: g.ad,
    ayrinti: { kopyalanan_konu: kopyalanan },
    not: g.not,
  });
  return { degisiklik, konu };
}

export async function konuTasi(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
  id: string,
  g: { ust_id: string | null; sira?: number | undefined; not: string },
): Promise<IslemSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const b: Baglam = { tx, katalog, taslak, aktorId };
  const agac = await agacYukle(b);
  const x = aktifKonu(agac, id);
  ustKurali(agac, x.seviye as KonuSeviye, x.brans_kodu, g.ust_id, x.id);
  const ustDegisti = g.ust_id !== x.ust_id;
  const yeniSira = g.sira ?? (ustDegisti ? agac.sonSira(g.ust_id, x.brans_kodu) + 1 : x.sira);
  if (!ustDegisti && yeniSira === x.sira) {
    throw hata(errorCodes.validation, 'Konu zaten bu konumda.');
  }
  let konu: KonuSatiri;
  let kopyalanan = 0;
  if (ustDegisti) {
    ({ konu, kopyalanan } = await yenidenBagla(b, agac, x, { ustId: g.ust_id, sira: yeniSira }));
  } else {
    // Yalniz sira: sunum bilgisi, surumler arasi paylasilir (konu kimligi ve gecerlilik degismez).
    const [guncel] = await tx
      .update(konular)
      .set({ sira: yeniSira })
      .where(eq(konular.id, x.id))
      .returning();
    if (!guncel) throw new Error('konu guncellenemedi');
    konu = guncel;
  }
  const degisiklik = await degisiklikYaz(b, {
    tur: 'tasi',
    konuId: x.id,
    hedefKonuId: konu.id === x.id ? null : konu.id,
    adOnce: x.ad,
    adSonra: x.ad,
    ayrinti: {
      eski_ust_id: x.ust_id,
      yeni_ust_id: g.ust_id,
      eski_sira: x.sira,
      yeni_sira: yeniSira,
      yalniz_sira: !ustDegisti,
      kopyalanan_konu: kopyalanan,
    },
    not: g.not,
  });
  return { degisiklik, konu };
}

export async function konuBirlestir(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
  id: string,
  g: { hedef_id: string; not: string },
): Promise<IslemSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const b: Baglam = { tx, katalog, taslak, aktorId };
  const agac = await agacYukle(b);
  const kaynak = aktifKonu(agac, id);
  const hedef = aktifKonu(agac, g.hedef_id);
  const gecersiz = (m: string) => hata(mufredatEditorHataKodlari.birlestirmeGecersiz, m);
  if (kaynak.id === hedef.id) throw gecersiz('Konu kendisiyle birleştirilemez.');
  if (kaynak.brans_kodu !== hedef.brans_kodu) throw gecersiz('Konular aynı branşta olmalı.');
  if (kaynak.seviye !== hedef.seviye) throw gecersiz('Konular aynı seviyede olmalı.');
  if (agac.soyMu(hedef.id, kaynak.id)) throw gecersiz('Hedef, kaynağın alt konusu olamaz.');
  let tasinan = 0;
  for (const c of agac.cocuklari(kaynak.id)) {
    tasinan += (await yenidenBagla(b, agac, c, { ustId: hedef.id })).kopyalanan;
  }
  await tx
    .update(konular)
    .set({ gecerli_surum_bitis: taslak.surum_no, yerine_gecen_id: hedef.id })
    .where(eq(konular.id, kaynak.id));
  const degisiklik = await degisiklikYaz(b, {
    tur: 'birlestir',
    konuId: kaynak.id,
    hedefKonuId: hedef.id,
    adOnce: kaynak.ad,
    adSonra: hedef.ad,
    ayrinti: { tasinan_alt_konu: tasinan },
    not: g.not,
  });
  return { degisiklik, konu: hedef };
}

export async function konuKaldir(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
  id: string,
  g: { yerine_gecen_id?: string | undefined; not: string },
): Promise<IslemSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const b: Baglam = { tx, katalog, taslak, aktorId };
  const agac = await agacYukle(b);
  const x = aktifKonu(agac, id);
  const alt = agac.altAgac(x.id);
  if (g.yerine_gecen_id) {
    const yerine = aktifKonu(agac, g.yerine_gecen_id);
    if (yerine.id === x.id || agac.soyMu(yerine.id, x.id) || yerine.brans_kodu !== x.brans_kodu) {
      throw hata(mufredatEditorHataKodlari.birlestirmeGecersiz, 'Önerilen konu geçersiz.');
    }
  }
  const [kapanan] = await tx
    .update(konular)
    .set({ gecerli_surum_bitis: taslak.surum_no, yerine_gecen_id: g.yerine_gecen_id ?? null })
    .where(eq(konular.id, x.id))
    .returning();
  if (!kapanan) throw new Error('konu guncellenemedi');
  if (alt.length > 0) {
    await tx
      .update(konular)
      .set({ gecerli_surum_bitis: taslak.surum_no })
      .where(
        inArray(
          konular.id,
          alt.map((k) => k.id),
        ),
      );
  }
  const degisiklik = await degisiklikYaz(b, {
    tur: 'kaldir',
    konuId: x.id,
    hedefKonuId: g.yerine_gecen_id ?? null,
    adOnce: x.ad,
    ayrinti: { kaldirilan_alt_konu: alt.length },
    not: g.not,
  });
  return { degisiklik, konu: kapanan };
}

export async function degisiklikleri(
  tx: Tx,
  katalog: KatalogKodu,
  surumNo: number,
): Promise<DegisiklikSatiri[]> {
  return tx
    .select()
    .from(mufredatDegisiklikleri)
    .where(
      and(
        eq(mufredatDegisiklikleri.katalog_kodu, katalog),
        eq(mufredatDegisiklikleri.surum_no, surumNo),
      ),
    )
    .orderBy(asc(mufredatDegisiklikleri.created_at), asc(mufredatDegisiklikleri.id));
}

export const TUR_ALANI = {
  ekle: 'eklenen',
  adlandir: 'yeniden_adlandirilan',
  tasi: 'tasinan',
  birlestir: 'birlesen',
  kaldir: 'kaldirilan',
} as const satisfies Record<DegisiklikTuru, keyof PlatformFarkOzeti>;

export function farkOzeti(liste: readonly DegisiklikSatiri[]): PlatformFarkOzeti {
  const ozet: PlatformFarkOzeti = {
    eklenen: 0,
    yeniden_adlandirilan: 0,
    tasinan: 0,
    birlesen: 0,
    kaldirilan: 0,
  };
  for (const d of liste) ozet[TUR_ALANI[d.tur as DegisiklikTuru]] += 1;
  return ozet;
}

export interface YayinSonucu {
  surum: SurumSatiri;
  ozet: PlatformFarkOzeti;
  bildirilenKurum: number;
  yenidenBaglanan: number;
}

/** Kapanan satirin (bitis = D) etkin halefini bulur; halef yoksa ya da kapaliysa null. */
function halef(
  kapanan: Map<string, KonuSatiri>,
  aktif: Map<string, KonuSatiri>,
  r: KonuSatiri,
): KonuSatiri | null {
  let simdiki: KonuSatiri = r;
  for (let adim = 0; adim < 50; adim++) {
    const h = simdiki.yerine_gecen_id;
    if (!h) return null;
    const a = aktif.get(h);
    if (a) return a;
    const k = kapanan.get(h);
    if (!k) return null;
    simdiki = k;
  }
  return null;
}

/**
 * Taslagi yayinlar: kurum alt konulari yeni ust konuya baglanir, surum yayinli isaretlenir (bundan sonra
 * degismez), aktif her kurum icin outbox olayi yazilir. Tek islemde calisir.
 */
export async function taslakYayinla(
  tx: Tx,
  katalog: KatalogKodu,
  aktorId: string,
): Promise<YayinSonucu> {
  const taslak = await taslakBul(tx, katalog);
  const liste = await degisiklikleri(tx, katalog, taslak.surum_no);
  if (liste.length === 0) {
    throw hata(mufredatEditorHataKodlari.degisiklikYok, 'Taslakta hiç değişiklik yok.', 409);
  }
  const ozet = farkOzeti(liste);

  // Bu taslakta kapanan ve halefi olan global konular: kurum alt konulari halefe baglanir.
  const kapananlar = await tx
    .select()
    .from(konular)
    .where(
      and(
        isNull(konular.kurum_id),
        eq(konular.katalog_kodu, katalog),
        eq(konular.gecerli_surum_bitis, taslak.surum_no),
        sql`${konular.yerine_gecen_id} is not null`,
      ),
    );
  const aktifler = new Map(
    (await surumKonulari(tx, katalog, taslak.surum_no)).map((k) => [k.id, k]),
  );
  const kapananHarita = new Map(kapananlar.map((k) => [k.id, k]));
  let yenidenBaglanan = 0;
  for (const r of kapananlar) {
    const h = halef(kapananHarita, aktifler, r);
    if (h?.seviye !== r.seviye || h.brans_kodu !== r.brans_kodu) continue;
    const guncel = await tx
      .update(konular)
      .set({ ust_id: h.id })
      .where(and(eq(konular.ust_id, r.id), sql`${konular.kurum_id} is not null`))
      .returning({ id: konular.id });
    yenidenBaglanan += guncel.length;
  }

  const [yayinli] = await tx
    .update(mufredatSurumleri)
    .set({ yayinlandi_at: sql`now()` })
    .where(eq(mufredatSurumleri.id, taslak.id))
    .returning();
  if (!yayinli) throw new Error('surum yayinlanamadi');

  const aktifKurumlar = await tx
    .select({ id: kurumlar.id })
    .from(kurumlar)
    .where(eq(kurumlar.durum, 'aktif'));
  for (const k of aktifKurumlar) {
    const olay = ogrenmeMufredatYayinlandiV1.create({
      kurumId: k.id,
      actor: { tur: 'kullanici', id: aktorId },
      correlationId: `mufredat-yayin:${katalog}:${String(yayinli.surum_no)}`,
      data: { katalog_kodu: katalog, surum_no: yayinli.surum_no, ...ozet },
    });
    await publishInTx(tx, olay, { table: 'ortak.outbox' });
  }
  return { surum: yayinli, ozet, bildirilenKurum: aktifKurumlar.length, yenidenBaglanan };
}
