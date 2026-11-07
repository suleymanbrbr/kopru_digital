import { describe, expect, it } from 'vitest';

import { telefonBicimle } from './telefon';

import { telefonSema } from '@/oturum/tipler';

describe('telefon', () => {
  it('yazarken bicimlendirir', () => {
    expect(telefonBicimle('5321234567')).toBe('532 123 45 67');
    expect(telefonBicimle('532')).toBe('532');
    expect(telefonBicimle('0532 123 45 67')).toBe('532 123 45 67');
    expect(telefonBicimle('+90 532 123 45 67')).toBe('532 123 45 67');
  });

  it('yalnizca 5 ile baslayan 10 haneli cep numarasini kabul eder', () => {
    expect(telefonSema.parse('532 123 45 67')).toBe('5321234567');
    expect(telefonSema.parse('0532 123 45 67')).toBe('5321234567');
    expect(telefonSema.safeParse('212 123 45 67').success).toBe(false);
    expect(telefonSema.safeParse('532 123').success).toBe(false);
  });
});
