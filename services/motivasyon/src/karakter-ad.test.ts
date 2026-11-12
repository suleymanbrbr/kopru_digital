import { describe, expect, it } from 'vitest';

import { adiIndirge, karakterAdiniDegerlendir } from './karakter-ad.js';

describe('karakter adi suzgeci', () => {
  it.each(['Pırıl', 'Mavi Şimşek', 'Dinamo 7', 'Ali', 'Öykü', 'ÇAĞLAR', 'Sedir Baba', 'a'])(
    'uygun: %s',
    (ad) => {
      expect(karakterAdiniDegerlendir(ad)).toMatchObject({ uygun: true });
    },
  );

  it('kirpar ve ic bosluklari tek bosluga indirir', () => {
    expect(karakterAdiniDegerlendir('  Mavi    Şimşek ')).toEqual({
      uygun: true,
      ad: 'Mavi Şimşek',
    });
  });

  it.each([
    'Siktir',
    'SİKTİR',
    'orospu',
    'o r o s p u',
    'am1na',
    'amk',
    'A M K',
    'xxorospuxx',
    'Hitler',
    'f u c k',
    'S1kt1r',
  ])('yasakli: %s', (ad) => {
    expect(karakterAdiniDegerlendir(ad)).toEqual({ uygun: false, neden: 'yasakli' });
  });

  it.each(['', '   ', 'a!b', 'ali_veli', '😀', 'Ali-Veli', 'a'.repeat(25), '<b>x</b>'])(
    'bicim hatasi: %j',
    (ad) => {
      expect(karakterAdiniDegerlendir(ad)).toEqual({ uygun: false, neden: 'bicim' });
    },
  );

  it('kisa yasakli kelimeler yalniz tam kelime: masum adlar reddedilmez', () => {
    for (const ad of ['Basik', 'Kamkat', 'Sikke', 'Pickup', 'Bokeh', 'Gotham', 'Ocak', 'Aqua']) {
      expect(karakterAdiniDegerlendir(ad).uygun, ad).toBe(true);
    }
  });

  it('24 karakter sinirinda uygun', () => {
    expect(karakterAdiniDegerlendir('a'.repeat(24)).uygun).toBe(true);
  });

  it('indirgeme: Turkce buyuk/kucuk harf, aksan ve leet', () => {
    expect(adiIndirge('İĞNE')).toBe('igne');
    expect(adiIndirge('SIK')).toBe('sik');
    expect(adiIndirge('Ş1ş3')).toBe('sise');
  });
});
