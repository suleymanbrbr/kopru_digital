import { z } from 'zod';

import { defineEvent } from '../event.js';
import { medyaDosyaTuruSema } from '../ortak/dosya.js';

/**
 * `medya` servisinin olaylari (docs/schema/olaylar.md). Tuketici: `api.medya`
 * (`ortak.medya_dosya_kopyalari`). Yukte depolama anahtari, dosya adi, EXIF ya da kisisel veri yoktur.
 */

export const medyaIslemeHataKoduSema = z.enum([
  'mime_uyusmazligi',
  'boyut_uyusmazligi',
  'bozuk_dosya',
  'yukleme_zaman_asimi',
]);

export const medyaSilmeNedeniSema = z.enum([
  'yetim',
  'saklama_suresi',
  'soru_cozuldu',
  'kullanici_silindi',
  'kurum_kapandi',
  'birakildi',
  'yukleme_zaman_asimi',
]);

/** Isleme bitip `durum='hazir'` olunca. */
export const medyaDosyaHazirV1 = defineEvent(
  'medya.dosya.hazir',
  1,
  z.object({
    dosya_id: z.uuid(),
    sahip_kullanici_id: z.uuid(),
    sahip_uyelik_id: z.uuid(),
    tur: medyaDosyaTuruSema,
    mime_tipi: z.string().min(1),
    boyut_bayt: z.number().int().positive(),
    genislik: z.number().int().positive().nullable(),
    yukseklik: z.number().int().positive().nullable(),
    sure_sn: z.number().int().nonnegative().nullable(),
    kucuk_resim_var: z.boolean(),
  }),
);

/** Isleme `islenemedi` ile bitince. */
export const medyaDosyaIslenemediV1 = defineEvent(
  'medya.dosya.islenemedi',
  1,
  z.object({
    dosya_id: z.uuid(),
    sahip_kullanici_id: z.uuid(),
    tur: medyaDosyaTuruSema,
    hata_kodu: medyaIslemeHataKoduSema,
  }),
);

/** Fiziksel silme tamamlaninca. */
export const medyaDosyaSilindiV1 = defineEvent(
  'medya.dosya.silindi',
  1,
  z.object({
    dosya_id: z.uuid(),
    tur: medyaDosyaTuruSema,
    silme_nedeni: medyaSilmeNedeniSema,
    silindi_at: z.iso.datetime({ offset: true }),
  }),
);
