import { z } from 'zod';

import { medyaOkumaAdresiSema } from '../medya/ic-api.js';

/**
 * Odev ve haftalik plan ek dosyalari (`ogrenme.odev_ekleri`, `ogrenme.plan_ekleri`). Dosya baytlari
 * `medya` servisindedir; burada yalniz kimlik, sira ve kisa omurlu okuma adresi vardir (dosya,
 * `ortak.dosya.baglandi.v1` ile baglanir). Alanlar `snake_case`.
 */

/** Odev ve plan basina en cok ek sayisi. */
export const EK_EN_FAZLA_DOSYA = 10;

/** Ek kumesi esitleme: verilen liste (sirasiyla) yeni kume olur; yeni dosyalar baglanir, eksikler birakilir. */
export const EkKumesiGirdiSema = z.object({
  medya_dosya_idleri: z
    .array(z.uuid())
    .max(EK_EN_FAZLA_DOSYA)
    .describe('Hazır `odev_eki` / `plan_eki` dosyaları (çağıranın kendi yüklemeleri), sıralı.'),
});

export const EkSema = z.object({
  medya_dosya_id: z.uuid(),
  sira: z.number().int(),
  mime_tipi: z.string(),
  boyut_bayt: z.number().int(),
  /** Medya servisi yanit vermediyse `null` (`adresler_alinamadi`). */
  adres: medyaOkumaAdresiSema.nullable(),
});
export type EkTipi = z.infer<typeof EkSema>;

export const EkListesiSema = z.object({
  ekler: z.array(EkSema),
  /** Medya servisi yanit vermedi: adresler bos (yeniden denenebilir). */
  adresler_alinamadi: z.boolean(),
});
export type EkListesi = z.infer<typeof EkListesiSema>;
