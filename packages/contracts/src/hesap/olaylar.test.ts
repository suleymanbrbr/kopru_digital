import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as olaylar from './olaylar.js';

/** Kisisel veri ve gizli icerik olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
const YASAK_ALANLAR = [
  'telefon',
  'telefon_e164',
  'hedef_telefon_e164',
  'eposta',
  'email',
  'hedef_eposta',
  'gorunen_ad',
  'hedef_ad',
  'ad_soyad',
  'belirtec',
  'kod',
  'parola',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

function olayTanimiMi(deger: unknown): deger is OlayTanimi {
  return typeof deger === 'object' && deger !== null && 'subject' in deger && 'schema' in deger;
}

describe('hesap olaylari', () => {
  const tanimlar = (Object.values(olaylar) as unknown[]).filter(olayTanimiMi);

  it('olay tanimlari bulunuyor', () => {
    expect(tanimlar.length).toBeGreaterThanOrEqual(8);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );
});
