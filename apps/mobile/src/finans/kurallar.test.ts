import { kurusBicimle } from '@kopru/i18n';

import { rozetDurumu, trSirala, tutarCoz, whatsappBaglantisi, whatsappNumarasi } from './kurallar';

describe('kalan ders rozeti esigi', () => {
  it('esik 2: 3 -> yok, 2 -> sari, 1 -> sari, 0 ve alti -> kirmizi', () => {
    expect(rozetDurumu(3, 2)).toBe('yok');
    expect(rozetDurumu(2, 2)).toBe('dusuk');
    expect(rozetDurumu(1, 2)).toBe('dusuk');
    expect(rozetDurumu(0, 2)).toBe('bitti');
    expect(rozetDurumu(-1, 2)).toBe('bitti');
  });
  it('esik 0 ise yalniz bitenler uyarilir', () => {
    expect(rozetDurumu(1, 0)).toBe('yok');
    expect(rozetDurumu(0, 0)).toBe('bitti');
  });
});

describe('para girisi', () => {
  it('gecerli girisleri kurusa cevirir (kayan nokta yok)', () => {
    expect(tutarCoz('1.500,50')).toEqual({ ok: true, kurus: 150050 });
    expect(tutarCoz('600')).toEqual({ ok: true, kurus: 60000 });
    expect(tutarCoz('₺ 0,10')).toEqual({ ok: true, kurus: 10 });
    expect(tutarCoz('19,99')).toEqual({ ok: true, kurus: 1999 });
  });
  it('bos, sifir ve gecersiz girisler alan hatasi verir', () => {
    expect(tutarCoz('')).toEqual({ ok: false, hata: 'bos' });
    expect(tutarCoz('0')).toEqual({ ok: false, hata: 'gecersiz' });
    expect(tutarCoz('abc')).toEqual({ ok: false, hata: 'gecersiz' });
    expect(tutarCoz('6.5')).toEqual({ ok: false, hata: 'gecersiz' });
    expect(tutarCoz('-5')).toEqual({ ok: false, hata: 'gecersiz' });
  });
  it('kurusBicimle tutari TL olarak gosterir', () => {
    expect(kurusBicimle(150050).replace(/\s/g, ' ')).toContain('1.500,50');
  });
});

describe('whatsapp', () => {
  it('Turkiye numaralarini wa.me icin normallestirir', () => {
    expect(whatsappNumarasi('+905321112233')).toBe('905321112233');
    expect(whatsappNumarasi('0532 111 22 33')).toBe('905321112233');
    expect(whatsappNumarasi('532 111 22 33')).toBe('905321112233');
    expect(whatsappNumarasi(null)).toBeNull();
    expect(whatsappNumarasi('123')).toBeNull();
  });
  it('metin kodlanir', () => {
    expect(whatsappBaglantisi('+905321112233', 'Merhaba, ders kaldı')).toBe(
      'https://wa.me/905321112233?text=Merhaba%2C%20ders%20kald%C4%B1',
    );
    expect(whatsappBaglantisi(null, 'x')).toBeNull();
  });
});

describe('Turkce siralama', () => {
  it('I, İ, Ç, Ş, Ö, Ü dogru sirada', () => {
    const adlar = ['Zeynep', 'Şule', 'Ömer', 'Çağla', 'İlker', 'Irmak', 'Can', 'Ahmet'];
    expect(trSirala(adlar, (x) => x)).toEqual([
      'Ahmet',
      'Can',
      'Çağla',
      'Irmak',
      'İlker',
      'Ömer',
      'Şule',
      'Zeynep',
    ]);
  });
});
