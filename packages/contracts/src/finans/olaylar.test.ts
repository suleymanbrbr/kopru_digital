import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as olaylar from './olaylar.js';

/** Kisisel veri, odeyen bilgisi ve serbest metin olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
const YASAK_ALANLAR = [
  'telefon',
  'telefon_e164',
  'eposta',
  'email',
  'gorunen_ad',
  'ad',
  'ad_soyad',
  'odeyen',
  'odeyen_ad',
  'odeyen_telefon',
  'aciklama',
  'neden',
  'iptal_nedeni',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

function olayTanimiMi(deger: unknown): deger is OlayTanimi {
  return typeof deger === 'object' && deger !== null && 'subject' in deger && 'schema' in deger;
}

describe('finans olaylari', () => {
  const tanimlar = (Object.values(olaylar) as unknown[]).filter(olayTanimiMi);

  it('uc olay tanimli', () => {
    expect(tanimlar.map((t) => t.subject).sort()).toEqual([
      'evt.finans.kredi.azaldi.v1',
      'evt.finans.paket.satildi.v1',
      'evt.finans.tahsilat.alindi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri ve serbest metin alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      for (const yasak of YASAK_ALANLAR) expect(alanlar).not.toContain(yasak);
    },
  );
});
