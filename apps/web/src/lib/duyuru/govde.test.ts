import { describe, expect, it } from 'vitest';

import { govdeyiParcala } from './govde';

describe('govdeyiParcala', () => {
  it('bagli metni metin ve baglanti parcalarina boler; sondaki noktalama baglantiya girmez', () => {
    expect(govdeyiParcala('Bak: https://ornek.test/a/b?x=1. Sonra devam.')).toEqual([
      { tur: 'metin', metin: 'Bak: ' },
      { tur: 'baglanti', metin: 'https://ornek.test/a/b?x=1', href: 'https://ornek.test/a/b?x=1' },
      { tur: 'metin', metin: '. Sonra devam.' },
    ]);
  });

  it('http de baglanti olur; buyuk harfli sema normallesir', () => {
    const p = govdeyiParcala('http://a.test ve HTTPS://B.TEST/x');
    const adresler = p.flatMap((x) => (x.tur === 'baglanti' ? [x.href] : []));
    expect(adresler).toEqual(['http://a.test/', 'https://b.test/x']);
  });

  it('javascript, data, ftp ve mailto baglanti olmaz (duz metin kalir)', () => {
    for (const metin of [
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
      'ftp://x.test/dosya',
      'mailto:a@b.test',
      'vbscript:x',
    ]) {
      expect(govdeyiParcala(metin)).toEqual([{ tur: 'metin', metin }]);
    }
  });

  it('https adresine gomulu javascript: sema degil baglanti olarak kalir, tehlikeli deger uretmez', () => {
    const p = govdeyiParcala('https://ornek.test/?u=javascript:alert(1)');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      tur: 'baglanti',
      href: 'https://ornek.test/?u=javascript:alert(1)',
    });
  });

  it('parantezli baglantida eslesen parantez korunur, eslesmeyen kirpilir', () => {
    const a = govdeyiParcala('(bkz https://ornek.test/x)');
    expect(a[1]).toMatchObject({ tur: 'baglanti', metin: 'https://ornek.test/x' });
    expect(a[2]).toEqual({ tur: 'metin', metin: ')' });
    const b = govdeyiParcala('https://tr.wikipedia.test/wiki/Kurs_(egitim)');
    expect(b).toEqual([
      {
        tur: 'baglanti',
        metin: 'https://tr.wikipedia.test/wiki/Kurs_(egitim)',
        href: 'https://tr.wikipedia.test/wiki/Kurs_(egitim)',
      },
    ]);
  });

  it('bos metin ve baglantisiz metin ayni kalir; HTML etiketi baglanti uretmez', () => {
    expect(govdeyiParcala('')).toEqual([]);
    expect(govdeyiParcala('<a href="https://x.test">x</a>')).toEqual([
      { tur: 'metin', metin: '<a href="' },
      { tur: 'baglanti', metin: 'https://x.test', href: 'https://x.test/' },
      { tur: 'metin', metin: '">x</a>' },
    ]);
  });

  it('gecersiz adres (host yok) duz metin kalir', () => {
    expect(govdeyiParcala('https://')).toEqual([{ tur: 'metin', metin: 'https://' }]);
  });
});
