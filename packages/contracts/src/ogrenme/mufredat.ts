import { z } from 'zod';

/**
 * Mufredat kutuphanesi HTTP sozlesmeleri (docs/schema/api.md "Mufredat kataloğu"). Alanlar `snake_case`.
 * Global katalog satirlari (`kurum_id: null`) salt okunurdur; kurum konulari kurumun kendisine aittir.
 */

export const mufredatHataKodlari = {
  globalKonuYazilamaz: 'global_konu_yazilamaz',
  konuUstGecersiz: 'konu_ust_gecersiz',
  bransGecersiz: 'brans_gecersiz',
  surumBulunamadi: 'surum_bulunamadi',
  surumYayinlanmamis: 'surum_yayinlanmamis',
  kapsamGecersiz: 'kapsam_gecersiz',
} as const;

export const KATALOG_KODLARI = ['lgs', 'tyt', 'ayt', 'ydt', 'okul'] as const;
export const KatalogKoduSema = z.enum(KATALOG_KODLARI);
export type KatalogKodu = z.infer<typeof KatalogKoduSema>;

export const KONU_SEVIYELERI = ['unite', 'konu', 'alt_konu'] as const;
export const KonuSeviyeSema = z.enum(KONU_SEVIYELERI);
export type KonuSeviye = z.infer<typeof KonuSeviyeSema>;

export const MUFREDAT_KAPSAMLARI = ['kurum', 'kademe', 'grup'] as const;
export const MufredatKapsamSema = z.enum(MUFREDAT_KAPSAMLARI);

const sinifSeviyesi = z.number().int().min(5).max(12);
const bransKodu = z.string().regex(/^[a-z_]+$/).max(50);
const bayrak = z
  .enum(['0', '1', 'true', 'false'])
  .transform((v) => v === '1' || v === 'true')
  .optional();

export const KonuSema = z.object({
  id: z.uuid(),
  kurum_id: z.uuid().nullable().describe('null: global katalog konusu (salt okunur).'),
  katalog_kodu: KatalogKoduSema.nullable(),
  brans_kodu: z.string(),
  ust_id: z.uuid().nullable(),
  seviye: KonuSeviyeSema,
  ad: z.string(),
  kazanim_kodu: z.string().nullable(),
  sira: z.number().int(),
  sinif_seviyesi: sinifSeviyesi.nullable(),
  gecerli_surum_baslangic: z.number().int().nullable(),
  gecerli_surum_bitis: z.number().int().nullable(),
  yerine_gecen_id: z.uuid().nullable(),
  arsivlendi_at: z.iso.datetime({ offset: true }).nullable(),
  kullanimdan_kalkti: z
    .boolean()
    .describe('Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için.'),
  surum: z.number().int().describe('Kayıt sürümü (iyimser kilit).'),
});
export type Konu = z.infer<typeof KonuSema>;

export const KonuListeSorguSema = z.object({
  katalog_kodu: KatalogKoduSema.optional().describe(
    'Verilmezse tüm kataloglar, her biri kendi çözülmüş sürümüyle.',
  ),
  surum_no: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe('Yalnız `katalog_kodu` ile. Varsayılan: kurumun atanmış sürümü, yoksa en yüksek yayınlanmış.'),
  kapsam: MufredatKapsamSema.optional().describe('Atama çözümü için kademe/grup bağlamı.'),
  kapsam_id: z.uuid().optional(),
  brans_kodu: bransKodu.optional(),
  ust_id: z.uuid().optional(),
  seviye: KonuSeviyeSema.optional(),
  sinif_seviyesi: z.coerce.number().int().min(5).max(12).optional(),
  kaynak: z.enum(['global', 'kurum']).optional(),
  q: z.string().trim().min(1).max(100).optional().describe('Ad araması (Türkçe harf duyarsız).'),
  tumu: bayrak.describe('1: kullanımdan kalkan ve arşivlenen konular da gelir (rozetli).'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  imlec: z.string().max(200).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});

export const KonuListeYanitSema = z.object({
  konular: z.array(KonuSema),
  surumler: z
    .array(z.object({ katalog_kodu: KatalogKoduSema, surum_no: z.number().int() }))
    .describe('Sorgunun çözdüğü katalog sürümleri.'),
  sonraki_imlec: z.string().nullable(),
});

export const KonuDetaySema = KonuSema.extend({
  ust_zinciri: z
    .array(z.object({ id: z.uuid(), ad: z.string(), seviye: KonuSeviyeSema }))
    .describe('Kökten yakın üste doğru.'),
});

export const KonuParamSema = z.object({ kurum_id: z.uuid(), id: z.uuid() });

export const KonuOlusturGirdiSema = z.object({
  brans_kodu: bransKodu,
  ust_id: z.uuid().optional(),
  seviye: KonuSeviyeSema,
  ad: z.string().trim().min(1).max(200),
  kazanim_kodu: z.string().trim().min(1).max(50).optional(),
  sira: z.number().int().min(0).max(100000).default(0),
  sinif_seviyesi: sinifSeviyesi.optional(),
});

export const KonuGuncelleGirdiSema = z
  .object({
    ad: z.string().trim().min(1).max(200),
    kazanim_kodu: z.string().trim().min(1).max(50).nullable(),
    sira: z.number().int().min(0).max(100000),
    sinif_seviyesi: sinifSeviyesi.nullable(),
    ust_id: z.uuid().nullable(),
    seviye: KonuSeviyeSema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'En az bir alan verilmeli.' });

export const KatalogSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surumler: z.array(
    z.object({
      surum_no: z.number().int(),
      ad: z.string(),
      aciklama: z.string().nullable(),
      yayinlandi_at: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
  en_yuksek_yayinlanmis: z.number().int().nullable(),
  kurum_surumu: z.number().int().nullable().describe('Kurum kapsamında atanmış sürüm.'),
});
export const KatalogListeYanitSema = z.object({ kataloglar: z.array(KatalogSema) });

export const MufredatAtamaSema = z.object({
  id: z.uuid(),
  kapsam: MufredatKapsamSema,
  kapsam_id: z.uuid(),
  katalog_kodu: KatalogKoduSema,
  surum_no: z.number().int(),
  surum: z.number().int(),
  updated_at: z.iso.datetime({ offset: true }),
});
export const MufredatAtamaListeYanitSema = z.object({ atamalar: z.array(MufredatAtamaSema) });
export const MufredatAtamaGirdiSema = z.object({
  kapsam: MufredatKapsamSema,
  kapsam_id: z.uuid().describe('`kurum` için kurum kimliği; `kademe`/`grup` için kendi kimliği.'),
  katalog_kodu: KatalogKoduSema,
  surum_no: z.number().int().positive(),
});
