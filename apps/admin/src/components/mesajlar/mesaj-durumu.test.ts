import { describe, expect, it } from 'vitest';

import { mesajDurumu } from './mesajlar-sayfasi';

const SIMDI = Date.parse('2026-11-18T12:00:00Z');
const m = (bas: string, bit: string, iptal: string | null = null) => ({
  baslangic_at: bas,
  bitis_at: bit,
  iptal_at: iptal,
});

describe('mesajDurumu', () => {
  it('iptal her şeyin önünde', () => {
    expect(
      mesajDurumu(m('2026-11-18T10:00:00Z', '2026-11-19T10:00:00Z', '2026-11-18T11:00:00Z'), SIMDI),
    ).toBe('iptal');
  });
  it('bitmiş, planlı, yayında', () => {
    expect(mesajDurumu(m('2026-11-17T10:00:00Z', '2026-11-18T11:00:00Z'), SIMDI)).toBe('bitti');
    expect(mesajDurumu(m('2026-11-18T13:00:00Z', '2026-11-19T11:00:00Z'), SIMDI)).toBe('planli');
    expect(mesajDurumu(m('2026-11-18T10:00:00Z', '2026-11-19T11:00:00Z'), SIMDI)).toBe('yayinda');
  });
});
