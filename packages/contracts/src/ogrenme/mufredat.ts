import { z } from 'zod';

import { defineEvent } from '../event.js';

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
const bransKodu = z
  .string()
  .regex(/^[a-z_]+$/)
  .max(50);
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
    .describe(
      'Yalnız `katalog_kodu` ile. Varsayılan: kurumun atanmış sürümü, yoksa en yüksek yayınlanmış.',
    ),
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

// --- Platform müfredat editörü (`/platform/mufredat/...`) ------------------------------------------

export const mufredatEditorHataKodlari = {
  platformYetkisiYok: 'platform_yetkisi_yok',
  taslakVar: 'taslak_var',
  taslakYok: 'taslak_yok',
  surumYayinlandi: 'surum_yayinlandi',
  degisiklikYok: 'degisiklik_yok',
  birlestirmeGecersiz: 'birlestirme_gecersiz',
  konuTaslakta: 'konu_taslakta_degil',
} as const;

export const DEGISIKLIK_TURLERI = ['ekle', 'adlandir', 'tasi', 'birlestir', 'kaldir'] as const;
export const DegisiklikTuruSema = z.enum(DEGISIKLIK_TURLERI);
export type DegisiklikTuru = z.infer<typeof DegisiklikTuruSema>;

const degisiklikNotu = z.string().trim().min(1).max(1000).describe('Değişiklik notu (zorunlu).');
const zaman = z.iso.datetime({ offset: true });

export const PlatformKatalogParamSema = z.object({ katalog_kodu: KatalogKoduSema });
export const PlatformSurumParamSema = PlatformKatalogParamSema.extend({
  surum_no: z.coerce.number().int().positive(),
});
export const PlatformKonuParamSema = PlatformKatalogParamSema.extend({ id: z.uuid() });

export const PlatformSurumSema = z.object({
  surum_no: z.number().int(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  yayinlandi_at: zaman.nullable(),
  taslak: z.boolean(),
  degisiklik_sayisi: z.number().int(),
});
export const PlatformKatalogSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surumler: z.array(PlatformSurumSema),
  en_yuksek_yayinlanmis: z.number().int().nullable(),
  taslak_surum_no: z.number().int().nullable(),
});
export const PlatformKatalogListeYanitSema = z.object({ kataloglar: z.array(PlatformKatalogSema) });

export const PlatformTaslakAcGirdiSema = z.object({
  ad: z.string().trim().min(1).max(200),
  aciklama: z.string().trim().min(1).max(4000).optional(),
});
export const PlatformSurumYanitSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surum: PlatformSurumSema,
});

export const PlatformKonuSema = z.object({
  id: z.uuid(),
  ust_id: z.uuid().nullable(),
  brans_kodu: z.string(),
  seviye: KonuSeviyeSema,
  ad: z.string(),
  kazanim_kodu: z.string().nullable(),
  sira: z.number().int(),
  sinif_seviyesi: sinifSeviyesi.nullable(),
  gecerli_surum_baslangic: z.number().int(),
  gecerli_surum_bitis: z.number().int().nullable(),
  yerine_gecen_id: z.uuid().nullable(),
  yeni: z.boolean().describe('Bu sürümde eklendi (ya da eskinin yerine kopyalandı).'),
});
export const PlatformAgacYanitSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surum: PlatformSurumSema,
  konular: z.array(PlatformKonuSema),
});

export const PlatformKonuEkleGirdiSema = z.object({
  brans_kodu: bransKodu,
  ust_id: z.uuid().optional(),
  seviye: KonuSeviyeSema,
  ad: z.string().trim().min(1).max(200),
  kazanim_kodu: z.string().trim().min(1).max(50).optional(),
  sira: z.number().int().min(0).max(100000).optional(),
  sinif_seviyesi: sinifSeviyesi.optional(),
  not: degisiklikNotu,
});
export const PlatformAdlandirGirdiSema = z.object({
  ad: z.string().trim().min(1).max(200),
  not: degisiklikNotu,
});
export const PlatformTasiGirdiSema = z.object({
  ust_id: z.uuid().nullable().describe('Yeni üst konu (ünite için null).'),
  sira: z.number().int().min(0).max(100000).optional(),
  not: degisiklikNotu,
});
export const PlatformBirlestirGirdiSema = z.object({
  hedef_id: z.uuid().describe('Kaynağın yerine geçecek konu (aynı branş ve seviye).'),
  not: degisiklikNotu,
});
export const PlatformKaldirGirdiSema = z.object({
  yerine_gecen_id: z.uuid().optional().describe('Önerilen yeni konu (rozet için).'),
  not: degisiklikNotu,
});
export const PlatformYayinlaGirdiSema = z.object({
  not: z.string().trim().min(1).max(1000).optional(),
});

export const PlatformDegisiklikSema = z.object({
  id: z.uuid(),
  created_at: zaman,
  tur: DegisiklikTuruSema,
  konu_id: z.uuid(),
  hedef_konu_id: z.uuid().nullable(),
  ad_once: z.string().nullable(),
  ad_sonra: z.string().nullable(),
  ayrinti: z.record(z.string(), z.unknown()),
  not: z.string(),
});
export const PlatformIslemYanitSema = z.object({
  degisiklik: PlatformDegisiklikSema,
  konu: PlatformKonuSema.describe('İşlem sonrası konu (adlandırma/taşımada yeni kopya).'),
});

export const PlatformFarkYanitSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surum: PlatformSurumSema,
  ozet: z.object({
    eklenen: z.number().int(),
    yeniden_adlandirilan: z.number().int(),
    tasinan: z.number().int(),
    birlesen: z.number().int(),
    kaldirilan: z.number().int(),
  }),
  eklenen: z.array(PlatformDegisiklikSema),
  yeniden_adlandirilan: z.array(PlatformDegisiklikSema),
  tasinan: z.array(PlatformDegisiklikSema),
  birlesen: z.array(PlatformDegisiklikSema),
  kaldirilan: z.array(PlatformDegisiklikSema),
});
export type PlatformFarkOzeti = z.infer<typeof PlatformFarkYanitSema>['ozet'];

export const PlatformYayinYanitSema = z.object({
  katalog_kodu: KatalogKoduSema,
  surum: PlatformSurumSema,
  ozet: PlatformFarkYanitSema.shape.ozet,
  bildirilen_kurum_sayisi: z.number().int(),
  yeniden_baglanan_kurum_konusu: z
    .number()
    .int()
    .describe('Kurum alt konularından yeni üst konuya bağlananların sayısı.'),
});

/**
 * Platform yeni bir katalog sürümü yayınlayınca, aktif her kurum için bir olay (zarf `kurumId` zorunlu).
 * Yalnız katalog, sürüm numarası ve değişiklik sayıları taşınır: konu adı, not ve kişisel veri yok.
 */
export const ogrenmeMufredatYayinlandiV1 = defineEvent(
  'ogrenme.mufredat.yayinlandi',
  1,
  z.object({
    katalog_kodu: KatalogKoduSema,
    surum_no: z.number().int().positive(),
    eklenen: z.number().int().min(0),
    yeniden_adlandirilan: z.number().int().min(0),
    tasinan: z.number().int().min(0),
    birlesen: z.number().int().min(0),
    kaldirilan: z.number().int().min(0),
  }),
);
