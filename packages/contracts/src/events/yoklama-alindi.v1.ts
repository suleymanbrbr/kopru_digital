import { z } from 'zod';

import { defineEvent, type EventOf } from '../event.js';

export const yoklamaDurumSchema = z.enum(['geldi', 'gelmedi', 'gec_geldi', 'izinli']);

/** Bir derste yoklama alindiginda yayinlanir (yayinlayan: api/ders). */
export const yoklamaAlindiV1 = defineEvent(
  'yoklama.alindi',
  1,
  z.object({
    yoklamaId: z.uuid(),
    dersId: z.uuid(),
    /** Ders tarihi (YYYY-MM-DD) */
    tarih: z.iso.date(),
    kayitlar: z.array(z.object({ ogrenciId: z.uuid(), durum: yoklamaDurumSchema })).min(1),
  }),
);

export type YoklamaAlindiV1 = EventOf<typeof yoklamaAlindiV1>;
