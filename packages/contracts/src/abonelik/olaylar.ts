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
