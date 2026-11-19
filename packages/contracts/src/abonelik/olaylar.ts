import { z } from 'zod';

import { defineEvent, type EventOf } from '../event.js';
import { AbonelikDurumSema, AbonelikKaynakSema, PeriyotSema, PlanLimitleriSema } from './api.js';

/**
 * `abonelik` olaylari (docs/schema/olaylar.md `api / abonelik`). Yukler `snake_case`; kisisel veri
 * (unvan, vergi no, e-posta) ve saglayici kimlikleri tasimaz.
 */

export const abonelikAbonelikDegistiV1 = defineEvent(
  'abonelik.abonelik.degisti',
  1,
  z.object({
    abonelik_id: z.uuid(),
    kaynak: AbonelikKaynakSema,
    durum: AbonelikDurumSema,
    periyot: PeriyotSema,
    plan_kodu: z.string(),
    plan_surumu: z.number().int(),
    donem_bitis_at: z.iso.datetime({ offset: true }),
    ek_sure_bitis_at: z.iso.datetime({ offset: true }).nullable(),
    iptal_istendi_at: z.iso.datetime({ offset: true }).nullable(),
    limitler: PlanLimitleriSema,
    moduller: z.array(z.string()),
  }),
);

export type AbonelikAbonelikDegistiV1 = EventOf<typeof abonelikAbonelikDegistiV1>;

/** Odeme sonuclandi (basarili, basarisiz, iade). Saglayici kimligi ve kisisel veri tasimaz. */
export const abonelikOdemeIslendiV1 = defineEvent(
  'abonelik.odeme.islendi',
  1,
  z.object({
    odeme_id: z.uuid(),
    abonelik_id: z.uuid(),
    durum: z.enum(['basarili', 'basarisiz', 'iade']),
    tutar_kurus: z.number().int().nonnegative(),
    donem_bitis_at: z.iso.datetime({ offset: true }),
    hata_kodu: z.string().nullable(),
  }),
);
export type AbonelikOdemeIslendiV1 = EventOf<typeof abonelikOdemeIslendiV1>;

/** e-Arsiv fatura (ya da iade faturasi) kesildi. */
export const abonelikFaturaKesildiV1 = defineEvent(
  'abonelik.fatura.kesildi',
  1,
  z.object({
    fatura_id: z.uuid(),
    odeme_id: z.uuid(),
    tur: z.enum(['e_arsiv', 'iade']),
    fatura_no: z.string(),
    toplam_kurus: z.number().int().nonnegative(),
    pdf_dosya_id: z.uuid().nullable(),
  }),
);
export type AbonelikFaturaKesildiV1 = EventOf<typeof abonelikFaturaKesildiV1>;
