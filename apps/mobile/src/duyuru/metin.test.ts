import { duyuruOnizleme, duyuruParcalari, guvenliBaglantiMi } from './metin';

describe('duyuruParcalari', () => {
  it('duz metni tek parca verir', () => {
    expect(duyuruParcalari('Yarın ders var')).toEqual([{ tur: 'metin', metin: 'Yarın ders var' }]);
    expect(duyuruParcalari('')).toEqual([]);
  });

  it('http ve https baglantilarini ayirir, cumle sonu noktalamasini disarida birakir', () => {
    expect(duyuruParcalari('Bak https://ornek.com/a?b=1, sonra http://x.org. Bitti')).toEqual([
      { tur: 'metin', metin: 'Bak ' },
      { tur: 'baglanti', url: 'https://ornek.com/a?b=1' },
      { tur: 'metin', metin: ', sonra ' },
      { tur: 'baglanti', url: 'http://x.org' },
      { tur: 'metin', metin: '. Bitti' },
    ]);
  });

  it('http disi semalari baglanti yapmaz', () => {
    for (const x of [
      'javascript:alert(1)',
      'intent://x#Intent;end',
      'kopru://soru/1',
      'ftp://a.b',
    ]) {
      expect(duyuruParcalari(x).every((p) => p.tur === 'metin')).toBe(true);
    }
  });

  it('parantez icindeki baglantiyi kapanisla birlikte almaz', () => {
    expect(duyuruParcalari('(https://ornek.com/x)')).toEqual([
      { tur: 'metin', metin: '(' },
      { tur: 'baglanti', url: 'https://ornek.com/x' },
      { tur: 'metin', metin: ')' },
    ]);
  });
});

describe('guvenliBaglantiMi', () => {
  it('yalniz http/https kabul eder, kullanici bilgisini reddeder', () => {
    expect(guvenliBaglantiMi('https://ornek.com')).toBe(true);
    expect(guvenliBaglantiMi('http://ornek.com/x')).toBe(true);
    expect(guvenliBaglantiMi('https://kullanici:parola@ornek.com')).toBe(false);
    expect(guvenliBaglantiMi('javascript:alert(1)')).toBe(false);
    expect(guvenliBaglantiMi('https://')).toBe(false);
    expect(guvenliBaglantiMi('https://a b')).toBe(false);
  });
});

describe('duyuruOnizleme', () => {
  it('satirlari birlestirir ve uzun metni keser', () => {
    expect(duyuruOnizleme('a\n\nb   c')).toBe('a b c');
    const u = duyuruOnizleme('x'.repeat(300), 50);
    expect(u.length).toBe(50);
    expect(u.endsWith('…')).toBe(true);
  });
});
