import { z } from 'zod';

import { RolSema, type Rol } from '../hesap/izinler.js';
import { medyaDosyaTuruSema, type MedyaDosyaTuru } from '../ortak/dosya.js';

/**
 * `medya` servisinin kullaniciya acik HTTP sozlesmesi (docs/schema/medya.md "Yukleme akisi").
 * Canlida istemciler medyaya `/v1/dosyalar*` yolu ile ayni alan adindan ulasir; gelistirmede medya ayri
 * portta calisir (4003). Alanlar `snake_case`.
 *
 * Tur kurallari (izinli MIME, azami boyut, rol) tek kaynaktir: hem servis hem istemciler (yuklemeden once
 * on kontrol) bunu kullanir. Veritabanindaki `medya.saklama_politikalari` tohumu testle bu sabitle birebir
 * ayni tutulur; saklama gunu/yetim suresi gibi isletme degerleri yalniz veritabanindadir.
 */

export const MEDYA_SES_AZAMI_SURE_SN = 180;
export const MEDYA_YUKLEME_ADRESI_OMRU_SN = 15 * 60;
/** Presigned GET adresi omru (`ic-api.ts` ile ayni deger). */
export const MEDYA_OKUMA_ADRESI_OMRU_KULLANICI_SN = 10 * 60;

const MB = 1024 * 1024;

/** HEIC/HEIF KABUL EDILMEZ: istemci yuklemeden once JPEG'e cevirir. SVG kabul edilmez. */
export const MEDYA_GORSEL_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MEDYA_SES_MIME = [
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/webm',
  'audio/ogg',
] as const;
export const MEDYA_PDF_MIME = ['application/pdf'] as const;

export interface MedyaTurKurali {
  /** Bu turu yukleyebilen uyelik rolleri. Bos liste: istemciden yuklenemez. */
  roller: readonly Rol[];
  izinli_mime: readonly string[];
  azami_boyut_bayt: number;
  /** Yalniz ses. */
  azami_sure_sn?: number;
}

const PERSONEL = ['sahip', 'yonetici', 'ogretmen'] as const satisfies readonly Rol[];

export const MEDYA_TUR_KURALLARI = {
  soru_fotografi: {
    roller: ['ogrenci'],
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 10 * MB,
  },
  soru_cevap_fotografi: {
    roller: PERSONEL,
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 10 * MB,
  },
  soru_cizim: {
    roller: ['ogrenci', ...PERSONEL],
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 10 * MB,
  },
  soru_ses: {
    roller: PERSONEL,
    izinli_mime: MEDYA_SES_MIME,
    azami_boyut_bayt: 5 * MB,
    azami_sure_sn: MEDYA_SES_AZAMI_SURE_SN,
  },
  odev_eki: {
    roller: PERSONEL,
    izinli_mime: [...MEDYA_GORSEL_MIME, ...MEDYA_PDF_MIME],
    azami_boyut_bayt: 20 * MB,
  },
  odev_teslim_fotografi: {
    roller: ['ogrenci'],
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 10 * MB,
  },
  kurum_logosu: {
    roller: ['sahip', 'yonetici'],
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 5 * MB,
  },
  avatar: {
    roller: RolSema.options,
    izinli_mime: MEDYA_GORSEL_MIME,
    azami_boyut_bayt: 5 * MB,
  },
  fatura_pdf: {
    roller: [],
    izinli_mime: MEDYA_PDF_MIME,
    azami_boyut_bayt: 20 * MB,
  },
} as const satisfies Record<MedyaDosyaTuru, MedyaTurKurali>;

export const medyaHataKodlari = {
  turYetkisiYok: 'dosya_turu_yetkisi_yok',
  mimeDesteklenmiyor: 'mime_desteklenmiyor',
  dosyaCokBuyuk: 'dosya_cok_buyuk',
  kotaAsildi: 'kota_asildi',
  kurumAskida: 'kurum_askida',
  istemciAnahtariCakisti: 'istemci_anahtari_cakisti',
  yuklemeSuresiDoldu: 'yukleme_suresi_doldu',
  yuklemeBulunamadi: 'yukleme_bulunamadi',
  boyutUyusmazligi: 'boyut_uyusmazligi',
  mimeUyusmazligi: 'mime_uyusmazligi',
  depolamaYapilandirilmamis: 'depolama_yapilandirilmamis',
} as const;

export const MEDYA_DOSYA_DURUMLARI = [
  'yukleme_bekliyor',
  'yuklendi',
  'isleniyor',
  'hazir',
  'islenemedi',
  'silindi',
] as const;
export const medyaDosyaDurumuSema = z.enum(MEDYA_DOSYA_DURUMLARI);
export type MedyaDosyaDurumu = z.infer<typeof medyaDosyaDurumuSema>;

/** `dosyalar.hata_kodu` degerleri. `sure_asimi` olayda `bozuk_dosya` olarak yayimlanir (olay enum'u dar). */
export const MEDYA_HATA_KODLARI = [
  'mime_uyusmazligi',
  'boyut_uyusmazligi',
  'bozuk_dosya',
  'sure_asimi',
  'yukleme_zaman_asimi',
] as const;
export const medyaHataKoduSema = z.enum(MEDYA_HATA_KODLARI);

// --- POST /v1/dosyalar -------------------------------------------------------------------------

export const medyaYuklemeIstegiSema = z.object({
  tur: medyaDosyaTuruSema,
  mime_tipi: z.string().min(3).max(100),
  boyut_bayt: z.number().int().positive(),
  /** Yuklenecek baytlarin SHA-256 ozeti (64 hane onaltilik). Sunucu isleme sirasinda dogrular. */
  sha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .transform((s) => s.toLowerCase()),
  /** Istemcinin urettigi UUID; ayni anahtar ayni kaydi dondurur (zayif baglantida guvenli yeniden deneme). */
  istemci_anahtari: z.uuid(),
});
export type MedyaYuklemeIstegi = z.input<typeof medyaYuklemeIstegiSema>;

export const medyaYuklemeAdresiSema = z.object({
  yontem: z.literal('PUT'),
  url: z.url(),
  /** PUT istegine AYNEN eklenecek basliklar (imzaya dahildir; farkli deger 403 `SignatureDoesNotMatch`). */
  basliklar: z.record(z.string(), z.string()),
  gecerlilik_bitis_at: z.iso.datetime({ offset: true }),
});

export const medyaDosyaOzetiSema = z.object({
  id: z.uuid(),
  tur: medyaDosyaTuruSema,
  mime_tipi: z.string(),
  boyut_bayt: z.number().int(),
  durum: medyaDosyaDurumuSema,
});

export const medyaYuklemeYanitiSema = z.object({
  dosya: medyaDosyaOzetiSema,
  /** Yalniz `yukleme_bekliyor` ve adres gecerliyken dolu. */
  yukleme: medyaYuklemeAdresiSema.nullable(),
});
export type MedyaYuklemeYaniti = z.infer<typeof medyaYuklemeYanitiSema>;

// --- POST /v1/dosyalar/{id}/tamam, GET /v1/dosyalar/{id} --------------------------------------

export const medyaOkumaAdresleriSema = z.object({
  asil_url: z.url(),
  kucuk_url: z.url().nullable(),
  orta_url: z.url().nullable(),
  gecerlilik_bitis_at: z.iso.datetime({ offset: true }),
});

export const medyaDosyaDurumYanitiSema = z.object({
  id: z.uuid(),
  tur: medyaDosyaTuruSema,
  durum: medyaDosyaDurumuSema,
  /** Isleme sonrasi gercek (yeniden kodlanmis) icerik turu; hazir degilse bildirilen deger. */
  mime_tipi: z.string(),
  boyut_bayt: z.number().int().nullable(),
  genislik: z.number().int().nullable(),
  yukseklik: z.number().int().nullable(),
  sure_sn: z.number().int().nullable(),
  hata_kodu: medyaHataKoduSema.nullable(),
  /** Yalniz `hazir` iken dolu. */
  adresler: medyaOkumaAdresleriSema.nullable(),
});
export type MedyaDosyaDurumYaniti = z.infer<typeof medyaDosyaDurumYanitiSema>;

export const medyaDosyaParamSema = z.object({ id: z.uuid() });

export function medyaTuruYuklenebilirMi(tur: MedyaDosyaTuru, rol: string | null): boolean {
  const kural: MedyaTurKurali = MEDYA_TUR_KURALLARI[tur];
  return rol !== null && (kural.roller as readonly string[]).includes(rol);
}
