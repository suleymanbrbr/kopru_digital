import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `ogrenme` deneme HTTP sozlesmeleri ve olayi (docs/schema/api.md "Deneme sinavi", olaylar.md
 * `ogrenme.deneme.girildi.v1`). Alanlar `snake_case`. Net, sistemde tam sayi olmayan TEK degerdir:
 * veritabani uretilmis sutunu esastir; API net degerlerini `number` (2 ondalik) doner.
 * Olay yalniz kimlik, kural kodu, tarih ve toplam net tasir: ad, telefon, e-posta, deneme adi, not ASLA girmez.
 */

export const denemeHataKodlari = {
  globalKuralYazilamaz: 'global_kural_yazilamaz',
  kuralKullanimda: 'kural_kullanimda',
  kuralKoduVar: 'kural_kodu_var',
  bolumGecersiz: 'deneme_bolum_gecersiz',
  ogrenciGirisiKapali: 'ogrenci_deneme_girisi_kapali',
  onayDurumuGecersiz: 'deneme_onay_durumu_gecersiz',
  denemeZatenVar: 'deneme_zaten_var',
  topluGirisHatali: 'toplu_giris_hatali',
  surumCakismasi: 'surum_cakismasi',
  excelGecersiz: 'excel_gecersiz',
  kuralGerekli: 'deneme_kurali_gerekli',
} as const;

/** Toplu giris ve Excel yuklemede en fazla satir (ogrenci) sayisi. */
export const DENEME_TOPLU_SATIR_SINIRI = 500;
/** Excel yukleme govde siniri (bayt). */
export const DENEME_EXCEL_BOYUT_SINIRI = 2 * 1024 * 1024;

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });

export const DenemeOnayDurumuSema = z.enum(['bekliyor', 'onaylandi', 'reddedildi']);
export type DenemeOnayDurumu = z.infer<typeof DenemeOnayDurumuSema>;
export const DenemeKaynagiSema = z.enum(['ogrenci', 'ogretmen']);

// --- Olay ------------------------------------------------------------------------------------

/**
 * Yalniz ONAYLANMIS sonucta: ogretmen/yonetici girisinde kayit aninda, ogrenci girisinde onay aninda.
 * Duzeltme (PATCH) olayi tekrarlamaz (XP ayni sonuc icin ikinci kez verilmesin).
 */
export const ogrenmeDenemeGirildiV1 = defineEvent(
  'ogrenme.deneme.girildi',
  1,
  z.object({
    deneme_id: z.uuid(),
    ogrenci_id: z.uuid(),
    kural_kodu: z.string(),
    sinav_tarihi: tarih,
    toplam_net: z.number(),
  }),
);

// --- Kurallar --------------------------------------------------------------------------------

const bolumKodu = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,59}$/, 'Bölüm kodu küçük harf, rakam ve alt çizgiden oluşmalı.');
const bransKodu = z
  .string()
  .regex(/^[a-z_]+$/)
  .max(60);

export const DenemeKuraliBolumuSema = z.object({
  bolum_kodu: bolumKodu.describe(
    'Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür).',
  ),
  brans_kodu: bransKodu,
  ad: z.string().trim().min(1).max(200),
  soru_sayisi: z.number().int().min(1).max(200),
});

const bolumlerSema = z
  .array(DenemeKuraliBolumuSema)
  .min(1)
  .max(40)
  .refine(
    (b) => new Set(b.map((x) => x.bolum_kodu)).size === b.length,
    'Bölüm kodları tekil olmalı.',
  );

const katsayi = z
  .number()
  .min(0)
  .max(1)
  .describe('Yanlışın doğruyu götürme oranı (LGS 0.3333, TYT/AYT/YDT 0.25). En çok 4 ondalık.');

export const DenemeKuraliSema = z.object({
  id: z.uuid(),
  kurum_id: z.uuid().nullable().describe('null = global kural (yalnız okunur).'),
  global: z.boolean(),
  kod: z.string(),
  ad: z.string(),
  yanlis_katsayisi: z.number(),
  bolumler: z.array(DenemeKuraliBolumuSema),
  toplam_soru_sayisi: z.number().int(),
  toplam_sure_dk: z.number().int().nullable(),
  gecerli_yil: z.number().int().nullable(),
  aktif: z.boolean(),
  surum: z.number().int(),
});
export type DenemeKuraliTipi = z.infer<typeof DenemeKuraliSema>;

export const DenemeKuraliListeSorguSema = z.object({
  aktif: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const DenemeKuraliListeYanitSema = z.object({ kurallar: z.array(DenemeKuraliSema) });

export const DenemeKuraliOlusturGirdiSema = z.object({
  kod: z.string().regex(/^ozel_[a-z0-9_]{1,54}$/, 'Kurum kuralı kodu `ozel_` ile başlamalı.'),
  ad: z.string().trim().min(1).max(200),
  yanlis_katsayisi: katsayi,
  bolumler: bolumlerSema,
  toplam_sure_dk: z.number().int().min(1).max(1000).nullable().optional(),
  gecerli_yil: z.number().int().min(2000).max(2100).nullable().optional(),
  aktif: z.boolean().default(true),
});

export const DenemeKuraliGuncelleGirdiSema = z
  .object({
    surum: z.number().int().min(1),
    ad: z.string().trim().min(1).max(200),
    yanlis_katsayisi: katsayi,
    bolumler: bolumlerSema,
    toplam_sure_dk: z.number().int().min(1).max(1000).nullable(),
    gecerli_yil: z.number().int().min(2000).max(2100).nullable(),
    aktif: z.boolean(),
  })
  .partial({
    ad: true,
    yanlis_katsayisi: true,
    bolumler: true,
    toplam_sure_dk: true,
    gecerli_yil: true,
    aktif: true,
  });

// --- Deneme ----------------------------------------------------------------------------------

const sayac = z.number().int().min(0).max(1000);

export const DenemeBolumGirdiSema = z.object({
  bolum_kodu: bolumKodu,
  dogru: sayac,
  yanlis: sayac,
  bos: sayac
    .optional()
    .describe('Verilmezse `soru_sayisi - dogru - yanlis` hesaplanır; verilirse toplamı tutmalı.'),
});
export type DenemeBolumGirdisi = z.infer<typeof DenemeBolumGirdiSema>;

const bolumGirdileri = z
  .array(DenemeBolumGirdiSema)
  .min(1)
  .max(40)
  .refine(
    (b) => new Set(b.map((x) => x.bolum_kodu)).size === b.length,
    'Bölüm kodları tekil olmalı.',
  );

const denemeAd = z.string().trim().min(1).max(200);
const yayinevi = z.string().trim().min(1).max(200);
const denemeNotu = z.string().trim().min(1).max(2000);
const sureDk = z.number().int().min(1).max(1000);

const kuralSecimi = {
  kural_id: z
    .uuid()
    .optional()
    .describe('Belirli kural sürümü. Yoksa `kural_kodu`nun en yeni aktif sürümü.'),
  kural_kodu: z.string().min(1).max(60).optional(),
};
const kuralGerekli = (v: { kural_id?: string | undefined; kural_kodu?: string | undefined }) =>
  v.kural_id !== undefined || v.kural_kodu !== undefined;

export const DenemeOlusturGirdiSema = z
  .object({
    ...kuralSecimi,
    ogrenci_id: z
      .uuid()
      .optional()
      .describe('Öğretmen/yönetici için zorunlu; öğrencide yok sayılır (kendisi).'),
    ad: denemeAd,
    yayinevi: yayinevi.optional(),
    sinav_tarihi: tarih,
    sure_dk: sureDk.optional(),
    not: denemeNotu.optional(),
    bolumler: bolumGirdileri,
  })
  .refine(kuralGerekli, { message: 'kural_id veya kural_kodu gerekli.' });

export const DenemeGuncelleGirdiSema = z.object({
  surum: z.number().int().min(1),
  ad: denemeAd.optional(),
  yayinevi: yayinevi.nullable().optional(),
  sinav_tarihi: tarih.optional(),
  sure_dk: sureDk.nullable().optional(),
  not: denemeNotu.nullable().optional(),
  bolumler: bolumGirdileri
    .optional()
    .describe('Verilirse tüm bölümler bu liste ile değişir (tek işlemde).'),
});

export const DenemeBolumuSema = z.object({
  bolum_kodu: z.string(),
  brans_kodu: z.string(),
  soru_sayisi: z.number().int(),
  dogru: z.number().int(),
  yanlis: z.number().int(),
  bos: z.number().int(),
  net: z.number().describe('Veritabanı üretilmiş değeri, 2 ondalık.'),
});

export const DenemeSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable().describe('Yalnız öğretmen/yönetici yanıtlarında.'),
  kural_id: z.uuid(),
  kural_kodu: z.string(),
  yanlis_katsayisi: z.number(),
  ad: z.string(),
  yayinevi: z.string().nullable(),
  sinav_tarihi: tarih,
  toplam_net: z.number(),
  giren_id: z.uuid(),
  kaynak: DenemeKaynagiSema,
  sure_dk: z.number().int().nullable(),
  not: z.string().nullable(),
  onay_durumu: DenemeOnayDurumuSema,
  onaylayan_id: z.uuid().nullable(),
  onay_at: zaman.nullable(),
  red_nedeni: z.string().nullable(),
  surum: z.number().int(),
  created_at: zaman,
  bolumler: z.array(DenemeBolumuSema),
});
export type DenemeTipi = z.infer<typeof DenemeSema>;

export const DenemeListeSorguSema = z.object({
  onay: DenemeOnayDurumuSema.optional(),
  ogrenci_id: z.uuid().optional(),
  kural: z.string().max(60).optional().describe('Kural kodu.'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(200).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const DenemeListeYanitSema = z.object({
  denemeler: z.array(DenemeSema),
  sonraki_imlec: z.string().nullable(),
});

export const DenemelerimSorguSema = z.object({
  kural: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(200).optional(),
});

export const DenemeRedGirdiSema = z.object({
  red_nedeni: z.string().trim().min(1).max(500),
});

// --- Toplu giris / Excel ---------------------------------------------------------------------

export const DenemeTopluSatirSema = z.object({
  ogrenci_id: z.uuid(),
  bolumler: bolumGirdileri,
  not: denemeNotu.optional(),
});

export const DenemeTopluGirdiSema = z
  .object({
    ...kuralSecimi,
    ad: denemeAd,
    yayinevi: yayinevi.optional(),
    sinav_tarihi: tarih,
    sure_dk: sureDk.optional(),
    satirlar: z.array(DenemeTopluSatirSema).min(1).max(DENEME_TOPLU_SATIR_SINIRI),
  })
  .refine(kuralGerekli, { message: 'kural_id veya kural_kodu gerekli.' });

export const DenemeTopluYanitSema = z.object({
  olusturulan_sayisi: z.number().int(),
  atlanan_satir_sayisi: z
    .number()
    .int()
    .describe(
      'Excel yüklemede öğrenci kimliği olup hiç puan girilmemiş (atlanan) satırlar; toplu girişte 0.',
    ),
  denemeler: z.array(
    z.object({ deneme_id: z.uuid(), ogrenci_id: z.uuid(), toplam_net: z.number() }),
  ),
});

export const DenemeSatirHatasiSema = z.object({
  satir: z
    .number()
    .int()
    .describe('Toplu girişte 0 tabanlı dizi sırası; Excel’de sayfadaki satır numarası (başlık 1).'),
  ogrenci_id: z.uuid().nullable(),
  kod: z.string(),
  mesaj: z.string(),
});
export type DenemeSatirHatasi = z.infer<typeof DenemeSatirHatasiSema>;

export const DenemeSablonSorguSema = z.object({
  kural: z.string().min(1).max(60).describe('Kural kodu (en yeni aktif sürüm).'),
  grup_id: z.uuid().optional().describe('Verilirse şablon bu grubun öğrencileriyle ön doldurulur.'),
});

export const DenemeExcelSorguSema = z.object({
  kural: z.string().min(1).max(60),
  ad: denemeAd,
  sinav_tarihi: tarih,
  yayinevi: yayinevi.optional(),
  sure_dk: z.coerce.number().int().min(1).max(1000).optional(),
  grup_id: z.uuid().optional().describe('Verilirse satırdaki öğrenciler bu grubun üyesi olmalı.'),
});

// --- Gelisim ve ozet -------------------------------------------------------------------------

export const DenemeGelisimSorguSema = z.object({
  kural: z.string().min(1).max(60).describe('Kural kodu (ör. tyt).'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const bolumNeti = z.object({ bolum_kodu: z.string(), brans_kodu: z.string(), net: z.number() });

export const DenemeGelisimSema = z.object({
  ogrenci_id: z.uuid(),
  kural_kodu: z.string(),
  deneme_sayisi: z.number().int().describe('Onaylı deneme sayısı (limit uygulanmadan).'),
  noktalar: z
    .array(
      z.object({
        deneme_id: z.uuid(),
        ad: z.string(),
        sinav_tarihi: tarih,
        toplam_net: z.number(),
        bolumler: z.array(bolumNeti),
      }),
    )
    .describe('Eskiden yeniye; son `limit` onaylı deneme.'),
  son5_sayisi: z.number().int(),
  son5_ortalama: z.number().nullable(),
  onceki5_sayisi: z.number().int(),
  onceki5_ortalama: z.number().nullable(),
  degisim: z.number().nullable().describe('son5_ortalama - onceki5_ortalama; önceki yoksa null.'),
  bolum_gelisimi: z.array(
    z.object({
      bolum_kodu: z.string(),
      brans_kodu: z.string(),
      son5_ortalama: z.number().nullable(),
      onceki5_ortalama: z.number().nullable(),
      degisim: z.number().nullable(),
    }),
  ),
});

export const DenemeGrupOzetSorguSema = z.object({ kural: z.string().min(1).max(60) });

export const DenemeGrupOzetSema = z.object({
  grup_id: z.uuid(),
  kural_kodu: z.string(),
  ogrenci_sayisi: z.number().int(),
  denemesi_olan_sayisi: z.number().int(),
  sinif_ortalamasi: z
    .number()
    .nullable()
    .describe('Öğrencilerin son 5 onaylı deneme ortalamalarının ortalaması.'),
  bolum_ortalamalari: z.array(
    z.object({ bolum_kodu: z.string(), brans_kodu: z.string(), ortalama: z.number() }),
  ),
  ogrenciler: z.array(
    z.object({
      ogrenci_id: z.uuid(),
      gorunen_ad: z.string().nullable(),
      deneme_sayisi: z.number().int(),
      son_net: z.number().nullable(),
      son5_ortalama: z.number().nullable(),
    }),
  ),
});

// --- Ayar ------------------------------------------------------------------------------------

export const DenemeAyarlariSema = z.object({
  ogrenci_deneme_girisi: z
    .boolean()
    .describe(
      'Öğrenci kendi deneme sonucunu girebilsin mi (varsayılan true; girişler öğretmen onayına düşer).',
    ),
});
