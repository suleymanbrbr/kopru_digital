import { z } from 'zod';

/**
 * `medya` servisinin iç uç noktası sözleşmesi (ADR 0001 istisnası, ADR 0004 servis JWT'si).
 *
 * `POST /ic/okuma-adresleri` — yalnız servis JWT'si (`aud=medya`, `scope=medya.okuma`). Yetki kararını
 * çağıran `api` verir (öğretmen–öğrenci ilişkisi `api` verisidir); `medya` yalnız dosyanın istenen kuruma
 * ait ve okunabilir (`hazir`) olduğunu denetler. Kurumda olmayan, silinmiş ya da hazır olmayan dosyalar
 * yanıtta yer almaz (hata değildir; çağıran eksikleri "dosya artık yok" olarak gösterir).
 */

export const MEDYA_OKUMA_SCOPE = 'medya.okuma';
export const MEDYA_OKUMA_EN_FAZLA_DOSYA = 50;
/** Presigned GET adresinin ömrü (docs/schema/medya.md: 10 dk). */
export const MEDYA_OKUMA_ADRESI_OMRU_SN = 10 * 60;

export const medyaOkumaAdresleriIstegiSema = z.object({
  kurum_id: z.uuid(),
  dosya_idleri: z.array(z.uuid()).min(1).max(MEDYA_OKUMA_EN_FAZLA_DOSYA),
});
export type MedyaOkumaAdresleriIstegi = z.infer<typeof medyaOkumaAdresleriIstegiSema>;

export const medyaOkumaAdresiSema = z.object({
  dosya_id: z.uuid(),
  mime_tipi: z.string(),
  /** Özgün (yeniden kodlanmış) dosya. */
  asil_url: z.url(),
  /** 256 px küçük resim (yalnız görseller; yoksa null). */
  kucuk_url: z.url().nullable(),
  /** 1024 px orta boy (yalnız görseller; yoksa null). */
  orta_url: z.url().nullable(),
  genislik: z.number().int().nullable(),
  yukseklik: z.number().int().nullable(),
  sure_sn: z.number().int().nullable(),
  gecerlilik_bitis_at: z.iso.datetime({ offset: true }),
});
export type MedyaOkumaAdresi = z.infer<typeof medyaOkumaAdresiSema>;

export const medyaOkumaAdresleriYanitiSema = z.object({
  adresler: z.array(medyaOkumaAdresiSema),
});
export type MedyaOkumaAdresleriYaniti = z.infer<typeof medyaOkumaAdresleriYanitiSema>;
