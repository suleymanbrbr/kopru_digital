import { z } from 'zod';

/**
 * Sinif katilim kodu ve ogretmen onayli katilim istegi HTTP sozlesmeleri (docs/schema/api.md).
 * Alanlar `snake_case`. Hata kodlari `hesapHataKodlari` icindedir.
 */

const zaman = z.iso.datetime({ offset: true });

/** Kod alfabesi: Crockford base32 buyuk harf, `0 1 I L O` haric (31 karakter). */
export const KATILIM_KODU_ALFABESI = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const KATILIM_KODU_UZUNLUK = 8;

// --- Kod yonetimi ---------------------------------------------------------------------------

export const KatilimKoduSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  kod: z.string().length(KATILIM_KODU_UZUNLUK),
  aktif: z.boolean(),
  expires_at: zaman.nullable(),
  max_kullanim: z.number().int().nullable(),
  kullanim_sayisi: z.number().int(),
  iptal_at: zaman.nullable(),
  created_at: zaman,
});

export const KatilimKoduOlusturGirdiSema = z.object({
  gecerlilik_gun: z.number().int().min(1).max(365).optional().describe('Bos = suresiz.'),
  max_kullanim: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .describe('Onaylanabilecek en cok katilim. Bos = sinirsiz.'),
});

// --- Katilim istekleri ----------------------------------------------------------------------

export const KatilimIstekDurumSema = z.enum(['bekliyor', 'onaylandi', 'reddedildi', 'iptal']);

export const KatilimIstegiSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  kullanici_id: z.uuid(),
  gorunen_ad: z.string().nullable().describe('Yalniz ad; telefon ve e-posta donmez.'),
  durum: KatilimIstekDurumSema,
  karar_veren_id: z.uuid().nullable().describe('Karar veren uyelik.'),
  karar_at: zaman.nullable(),
  created_at: zaman,
});

export const KatilimIstekListeSorguSema = z.object({
  durum: KatilimIstekDurumSema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const KatilimIstekListeYanitSema = z.object({
  istekler: z.array(KatilimIstegiSema),
  sonraki_imlec: z.uuid().nullable(),
});

export const KatilimOnayYanitSema = z.object({
  istek: KatilimIstegiSema,
  uyelik_id: z.uuid().nullable(),
  grup_uyesi_id: z.uuid().nullable(),
});

// --- Ogrenci tarafi -------------------------------------------------------------------------

export const SinifKoduKatilGirdiSema = z.object({
  kod: z.string().trim().min(1).max(32),
});

export const KendiKatilimIstegiSema = z.object({
  id: z.uuid(),
  kurum_id: z.uuid(),
  kurum_ad: z.string().nullable(),
  grup_id: z.uuid(),
  grup_ad: z.string().nullable(),
  durum: KatilimIstekDurumSema,
  karar_at: zaman.nullable(),
  created_at: zaman,
});
export const KendiKatilimIstekListeYanitSema = z.object({
  istekler: z.array(KendiKatilimIstegiSema),
});
export const KendiKatilimIstekSorguSema = z.object({
  durum: KatilimIstekDurumSema.default('bekliyor'),
});
