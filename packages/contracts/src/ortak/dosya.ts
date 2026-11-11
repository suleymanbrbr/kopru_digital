import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * Dosya turleri ve baglanti turleri tek kaynaktir (docs/schema/medya.md: `dosyalar.tur`,
 * `dosyalar.bagli_tur`). `medya` servisi, api'nin `ortak.medya_dosya_kopyalari` tablosu ve istemciler
 * bu listeleri kullanir; ikinci bir liste tutulmaz.
 */
export const MEDYA_DOSYA_TURLERI = [
  'soru_fotografi',
  'soru_cevap_fotografi',
  'soru_cizim',
  'soru_ses',
  'odev_eki',
  'odev_teslim_fotografi',
  'kurum_logosu',
  'avatar',
  'fatura_pdf',
] as const;
export const medyaDosyaTuruSema = z.enum(MEDYA_DOSYA_TURLERI);
export type MedyaDosyaTuru = z.infer<typeof medyaDosyaTuruSema>;

export const MEDYA_BAGLI_TURLERI = [
  'odev_teslimi',
  'odev_eki',
  'soru',
  'soru_mesaji',
  'kurum',
  'kullanici',
  'fatura',
] as const;
export const medyaBagliTurSema = z.enum(MEDYA_BAGLI_TURLERI);
export type MedyaBagliTur = z.infer<typeof medyaBagliTurSema>;

/**
 * `api` bir medya dosyasini is kaydina baglayinca (ayni islemde). Tuketici: `medya.baglama`.
 * Yuk yalniz kimlik tasir; dosya adi, depolama anahtari ve kisisel veri yoktur.
 */
export const ortakDosyaBaglandiV1 = defineEvent(
  'ortak.dosya.baglandi',
  1,
  z.object({
    dosya_id: z.uuid(),
    bagli_tur: medyaBagliTurSema,
    bagli_id: z.uuid(),
  }),
);

/** Bagli dosya kayittan ayrilinca (teslimden cikarma, avatar degisimi). Tuketici: `medya.baglama`. */
export const ortakDosyaBirakildiV1 = defineEvent(
  'ortak.dosya.birakildi',
  1,
  z.object({
    dosya_id: z.uuid(),
    bagli_tur: medyaBagliTurSema,
    bagli_id: z.uuid(),
    hemen_sil: z.boolean(),
  }),
);
