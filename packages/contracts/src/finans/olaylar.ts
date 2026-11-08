import { z } from 'zod';

import { defineEvent, type EventOf } from '../event.js';

/**
 * `finans` olaylari (docs/schema/olaylar.md `api / finans`). Yukler `snake_case`. Kisisel veri
 * (ad, telefon, e-posta, odeyen bilgisi) ve serbest metin tasimaz; tek istisna `makbuz_no`dur.
 * Tutarlar kurus tamsayisidir (ADR 0007).
 */

export const finansKrediAzaldiV1 = defineEvent(
  'finans.kredi.azaldi',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    kalan_kredi: z.number().int(),
    esik: z.number().int(),
    yoklama_id: z.uuid().nullable(),
  }),
);

export const finansTahsilatAlindiV1 = defineEvent(
  'finans.tahsilat.alindi',
  1,
  z.object({
    tahsilat_id: z.uuid(),
    ogrenci_id: z.uuid(),
    tutar_kurus: z.number().int().positive(),
    yontem: z.enum(['nakit', 'havale', 'kart', 'diger']),
    tahsilat_tarihi: z.iso.date(),
    makbuz_no: z.string().nullable(),
  }),
);

export const finansPaketSatildiV1 = defineEvent(
  'finans.paket.satildi',
  1,
  z.object({
    paket_satisi_id: z.uuid(),
    ogrenci_id: z.uuid(),
    paket_id: z.uuid().nullable(),
    toplam_kredi: z.number().int().positive(),
    bitis_tarihi: z.iso.date().nullable(),
  }),
);

export type FinansKrediAzaldiV1 = EventOf<typeof finansKrediAzaldiV1>;
export type FinansTahsilatAlindiV1 = EventOf<typeof finansTahsilatAlindiV1>;
export type FinansPaketSatildiV1 = EventOf<typeof finansPaketSatildiV1>;
