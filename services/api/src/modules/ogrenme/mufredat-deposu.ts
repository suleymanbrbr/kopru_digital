import {
  errorCodes,
  mufredatHataKodlari,
  type KatalogKodu,
  type Konu,
  type KonuSeviye,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  bransler,
  denetimKayitlari,
  konular,
  mufredatAtamalari,
  mufredatSurumleri,
} from '../../db/schema.js';
import type { YetkiBaglami } from '../hesap/index.js';

export type KonuSatiri = typeof konular.$inferSelect;

/** Sorgulanan surumde kullanimdan kalkti mi (global) ya da arsivlendi mi (kurum). */
export function konuYaniti(k: KonuSatiri, surumNo: number | null): Konu {
  const global = k.kurum_id === null;
  const kalkti = global
    ? k.gecerli_surum_bitis !== null && surumNo !== null && k.gecerli_surum_bitis <= surumNo
    : k.arsivlendi_at !== null;
  return {
    id: k.id,
    kurum_id: k.kurum_id,
    katalog_kodu: k.katalog_kodu as KatalogKodu | null,
    brans_kodu: k.brans_kodu,
    ust_id: k.ust_id,
    seviye: k.seviye as KonuSeviye,
    ad: k.ad,
    kazanim_kodu: k.kazanim_kodu,
    sira: k.sira,
    sinif_seviyesi: k.sinif_seviyesi,
    gecerli_surum_baslangic: k.gecerli_surum_baslangic,
    gecerli_surum_bitis: k.gecerli_surum_bitis,
    yerine_gecen_id: k.yerine_gecen_id,
    arsivlendi_at: k.arsivlendi_at?.toISOString() ?? null,
    kullanimdan_kalkti: kalkti,
    surum: k.surum,
  };
}

/** Katalog icin cozulen surum: atama (kapsam, sonra kurum), yoksa en yuksek yayinlanmis. */
export async function surumCoz(
  tx: Tx,
  kurumId: string,
  katalog: KatalogKodu,
  kapsam?: { kapsam: 'kurum' | 'kademe' | 'grup'; kapsam_id: string },
): Promise<number | null> {
  const adaylar = [
    ...(kapsam && kapsam.kapsam !== 'kurum' ? [kapsam] : []),
    { kapsam: 'kurum' as const, kapsam_id: kurumId },
  ];
  for (const a of adaylar) {
    const [satir] = await tx
      .select({ surum_no: mufredatAtamalari.surum_no })
      .from(mufredatAtamalari)
      .where(
        and(
          eq(mufredatAtamalari.kurum_id, kurumId),
          eq(mufredatAtamalari.kapsam, a.kapsam),
          eq(mufredatAtamalari.kapsam_id, a.kapsam_id),
          eq(mufredatAtamalari.katalog_kodu, katalog),
        ),
      );
    if (satir) return satir.surum_no;
  }
  const [en] = await tx
    .select({ surum_no: mufredatSurumleri.surum_no })
    .from(mufredatSurumleri)
    .where(
      and(eq(mufredatSurumleri.katalog_kodu, katalog), isNotNull(mufredatSurumleri.yayinlandi_at)),
    )
    .orderBy(desc(mufredatSurumleri.surum_no))
    .limit(1);
  return en?.surum_no ?? null;
}

/** Yayinlanmis katalog kodlari (konu listesinde `katalog_kodu` verilmediginde). */
export async function yayinliKataloglar(tx: Tx): Promise<KatalogKodu[]> {
  const satirlar = await tx
    .selectDistinct({ k: mufredatSurumleri.katalog_kodu })
    .from(mufredatSurumleri)
    .where(isNotNull(mufredatSurumleri.yayinlandi_at));
  return satirlar.map((s) => s.k as KatalogKodu);
}

/** Konuyu getirir (RLS: global veya kendi kurumu); yoksa 404. */
export async function konuBul(tx: Tx, id: string): Promise<KonuSatiri> {
  const [k] = await tx.select().from(konular).where(eq(konular.id, id));
  if (!k) throw new AppError(404, errorCodes.notFound, 'Konu bulunamadı.');
  return k;
}

/** Yazma icin: yalniz kendi kurumunun konusu; global satir 403. */
export async function yazilabilirKonuBul(tx: Tx, y: YetkiBaglami, id: string): Promise<KonuSatiri> {
  const k = await konuBul(tx, id);
  if (k.kurum_id === null) {
    throw new AppError(
      403,
      mufredatHataKodlari.globalKonuYazilamaz,
      'Global katalog konusu değiştirilemez.',
    );
  }
  if (k.kurum_id !== y.kurumId) throw new AppError(404, errorCodes.notFound, 'Konu bulunamadı.');
  return k;
}

export async function bransVarMi(tx: Tx, kod: string): Promise<void> {
  const [b] = await tx.select({ kod: bransler.kod }).from(bransler).where(eq(bransler.kod, kod));
  if (!b) throw new AppError(400, mufredatHataKodlari.bransGecersiz, 'Branş geçersiz.');
}

const USTUN_SEVIYESI: Record<KonuSeviye, KonuSeviye | null> = {
  unite: null,
  konu: 'unite',
  alt_konu: 'konu',
};

/** Seviye ve ust kuralini (unite > konu > alt konu, ayni brans, ayni kapsam) uygular. */
export async function ustDogrula(
  tx: Tx,
  y: YetkiBaglami,
  seviye: KonuSeviye,
  bransKodu: string,
  ustId: string | null | undefined,
  kendiId?: string,
): Promise<void> {
  const gecersiz = (mesaj: string) => new AppError(400, mufredatHataKodlari.konuUstGecersiz, mesaj);
  const beklenen = USTUN_SEVIYESI[seviye];
  if (!ustId) {
    if (seviye === 'alt_konu') throw gecersiz('Alt konunun üst konusu olmalı.');
    return;
  }
  if (beklenen === null) throw gecersiz('Ünitenin üstü olamaz.');
  if (ustId === kendiId) throw gecersiz('Konu kendisinin üstü olamaz.');
  const [ust] = await tx.select().from(konular).where(eq(konular.id, ustId));
  if (!ust) throw gecersiz('Üst konu bulunamadı.');
  if (ust.kurum_id !== null && ust.kurum_id !== y.kurumId) throw gecersiz('Üst konu bulunamadı.');
  if (ust.seviye !== beklenen) throw gecersiz(`Üst konu "${beklenen}" seviyesinde olmalı.`);
  if (ust.brans_kodu !== bransKodu) throw gecersiz('Üst konu aynı branşta olmalı.');
}

export async function konuDenetimiYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefId: string,
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
  hedefTuru = 'konu',
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

/** Turkce harf duyarsiz karsilastirma ifadesi: I, İ, ı -> i; ILIKE gerisini (ü/Ü, ş/Ş...) katlar. */
export const adKatlanmis = sql`translate(${konular.ad}, 'İIı', 'iii')`;
export const aramaKatla = (q: string) =>
  q.replace(/[İIı]/g, 'i').replace(/[\\%_]/g, (c) => `\\${c}`);
