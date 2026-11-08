import { describe, expect, it } from 'vitest';

import { kurusBicimle, tlMetniniKurusaCevir } from './para.js';

describe('kurusBicimle', () => {
  it('Turk parasi bicimi; kurusu kaybetmez', () => {
    const b = (k: number) => kurusBicimle(k).replace(/\s/g, ' ');
    expect(b(600050)).toBe('₺6.000,50');
    expect(b(0)).toBe('₺0,00');
    expect(b(1)).toBe('₺0,01');
    expect(b(-350000)).toBe('-₺3.500,00');
  });
});

describe('tlMetniniKurusaCevir', () => {
  it.each([
    ['6000', 600000],
    ['6.000', 600000],
    ['6.000,50', 600050],
    ['6000,5', 600050],
    ['0,01', 1],
    ['₺ 1.234.567,89', 123456789],
    ['250 TL', 25000],
    ['19,99', 1999],
    ['1,10', 110],
  ])('%s -> %d', (metin, kurus) => {
    expect(tlMetniniKurusaCevir(metin)).toBe(kurus);
  });

  it.each(['', 'abc', '6.5', '6,505', '-100', '1.23.456', '1,2,3', '99999999999999999999'])(
    'gecersiz: %s',
    (metin) => {
      expect(tlMetniniKurusaCevir(metin)).toBeNull();
    },
  );
});
