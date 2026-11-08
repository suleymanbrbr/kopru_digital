import { describe, expect, it } from 'vitest';

import { BasarisizDenemeSiniri, katilimKoduNormallestir, katilimKoduUret } from './sinif-kodu.js';

describe('katilimKoduUret / katilimKoduNormallestir', () => {
  it('8 karakter, CHECK alfabesi; 0 1 I L O hic uretilmez', () => {
    for (let i = 0; i < 500; i++) expect(katilimKoduUret()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
  });

  it('bosluk/tire/kucuk harfi temizler, gecersiz karakterde null doner', () => {
    expect(katilimKoduNormallestir(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(katilimKoduNormallestir('ABCDEFG0')).toBeNull();
    expect(katilimKoduNormallestir('ABCDEFGI')).toBeNull();
    expect(katilimKoduNormallestir('ABC')).toBeNull();
  });
});

describe('BasarisizDenemeSiniri', () => {
  it('5. basarisiz denemede 15 dk bloklar, sure dolunca acar', () => {
    let an = 1_000_000;
    const sinir = new BasarisizDenemeSiniri(5, 15 * 60_000, () => an);
    for (let i = 0; i < 4; i++) {
      sinir.basarisiz('ip:1');
      expect(() => {
        sinir.denetle('ip:1');
      }).not.toThrow();
    }
    sinir.basarisiz('ip:1');
    expect(() => {
      sinir.denetle('ip:1');
    }).toThrow(/geçersiz kod/);
    expect(() => {
      sinir.denetle('ip:2');
    }).not.toThrow();
    an += 14 * 60_000;
    expect(() => {
      sinir.denetle('ip:1');
    }).toThrow();
    an += 61_000;
    expect(() => {
      sinir.denetle('ip:1');
    }).not.toThrow();
  });

  it('pencere dolunca sayac sifirlanir', () => {
    let an = 0;
    const sinir = new BasarisizDenemeSiniri(3, 1000, () => an);
    sinir.basarisiz('a');
    sinir.basarisiz('a');
    an += 2000;
    sinir.basarisiz('a');
    expect(() => {
      sinir.denetle('a');
    }).not.toThrow();
  });
});
