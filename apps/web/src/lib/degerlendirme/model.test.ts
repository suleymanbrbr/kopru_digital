import { describe, expect, it } from 'vitest';

import {
  buHafta,
  donemCoz,
  donemEtiketi,
  donemTuru,
  guvenliBaglanti,
  koclukYolu,
  olcekYuzdesi,
  oneriBasligi,
  oneridenKayitSorgusu,
  ortalamaYaz,
} from './model';

// 2026-11-26 Persembe
const BUGUN = '2026-11-26';

describe('donem', () => {
  it('bu hafta Pazartesi..Pazar', () => {
    expect(buHafta(BUGUN)).toEqual({ baslangic: '2026-11-23', bitis: '2026-11-29' });
    expect(buHafta('2026-11-29')).toEqual({ baslangic: '2026-11-23', bitis: '2026-11-29' });
    expect(buHafta('2026-11-23')).toEqual({ baslangic: '2026-11-23', bitis: '2026-11-29' });
  });

  it('etiket: tek gun ve aralik', () => {
    expect(donemEtiketi('2026-11-23', '2026-11-23')).toBe('23 Kas');
    expect(donemEtiketi('2026-11-23', '2026-11-29')).toBe('23 Kas – 29 Kas');
  });

  it('donem turu on secimi', () => {
    expect(donemTuru({ donem_baslangic: '2026-11-25', donem_bitis: '2026-11-25' }, BUGUN)).toBe(
      'gun',
    );
    expect(donemTuru({ donem_baslangic: '2026-11-23', donem_bitis: '2026-11-29' }, BUGUN)).toBe(
      'hafta',
    );
    expect(donemTuru({ donem_baslangic: '2026-11-16', donem_bitis: '2026-11-29' }, BUGUN)).toBe(
      'aralik',
    );
  });

  it('donemCoz: hafta, gun ve gecersizler', () => {
    expect(donemCoz({ tur: 'hafta', gun: '', bugun: BUGUN })).toEqual({
      tamam: true,
      baslangic: '2026-11-23',
      bitis: '2026-11-29',
    });
    expect(donemCoz({ tur: 'gun', gun: '2026-11-24', bugun: BUGUN })).toEqual({
      tamam: true,
      baslangic: '2026-11-24',
      bitis: '2026-11-24',
    });
    // Gelecek gun ve bos gun gecersiz.
    expect(donemCoz({ tur: 'gun', gun: '2026-11-27', bugun: BUGUN })).toEqual({
      tamam: false,
      hata: 'gun',
    });
    expect(donemCoz({ tur: 'gun', gun: '', bugun: BUGUN })).toEqual({ tamam: false, hata: 'gun' });
    // Aralik: 31 gun siniri ve ters aralik.
    expect(
      donemCoz({
        tur: 'aralik',
        gun: '',
        bugun: BUGUN,
        aralik: { baslangic: '2026-10-01', bitis: '2026-10-31' },
      }).tamam,
    ).toBe(true);
    expect(
      donemCoz({
        tur: 'aralik',
        gun: '',
        bugun: BUGUN,
        aralik: { baslangic: '2026-10-01', bitis: '2026-11-05' },
      }),
    ).toEqual({ tamam: false, hata: 'aralik' });
    expect(
      donemCoz({
        tur: 'aralik',
        gun: '',
        bugun: BUGUN,
        aralik: { baslangic: '2026-11-10', bitis: '2026-11-09' },
      }),
    ).toEqual({ tamam: false, hata: 'aralik' });
  });
});

describe('olcek gosterimi', () => {
  it('ortalama Turkce ondalik, yoksa tire', () => {
    expect(ortalamaYaz(3.5)).toBe('3,5');
    expect(ortalamaYaz(4)).toBe('4');
    expect(ortalamaYaz(3.33)).toBe('3,3');
    expect(ortalamaYaz(null)).toBe('-');
  });

  it('cubuk yuzdesi 0-100', () => {
    expect(olcekYuzdesi(null)).toBe(0);
    expect(olcekYuzdesi(5)).toBe(100);
    expect(olcekYuzdesi(2.5)).toBe(50);
    expect(olcekYuzdesi(9)).toBe(100);
  });
});

describe('oneri', () => {
  const temel = {
    kaynak_kitap_id: null,
    kaynak_test_id: null,
    kaynak_kitap_ad: null,
    kaynak_test_ad: null,
    baslik: null,
    brans_kodu: null,
    konu_id: null,
  };

  it('baslik: kitap, kitap + test, link/serbest basligi', () => {
    expect(oneriBasligi({ ...temel, tur: 'kaynak_kitap', kaynak_kitap_ad: 'Kitap A' })).toBe(
      'Kitap A',
    );
    expect(
      oneriBasligi({
        ...temel,
        tur: 'kaynak_kitap_testi',
        kaynak_kitap_ad: 'Kitap A',
        kaynak_test_ad: 'Test 2',
      }),
    ).toBe('Kitap A · Test 2');
    expect(oneriBasligi({ ...temel, tur: 'link', baslik: 'Konu anlatımı' })).toBe('Konu anlatımı');
    expect(oneriBasligi({ ...temel, tur: 'serbest', baslik: 'Fasikül' })).toBe('Fasikül');
  });

  it('guvenli baglanti yalniz http/https', () => {
    expect(guvenliBaglanti('https://ornek.com/a?b=1')).toBe('https://ornek.com/a?b=1');
    expect(guvenliBaglanti('http://ornek.com')).toBe('http://ornek.com/');
    expect(guvenliBaglanti('javascript:alert(1)')).toBeNull();
    expect(guvenliBaglanti('ftp://ornek.com')).toBeNull();
    expect(guvenliBaglanti('ornek')).toBeNull();
    expect(guvenliBaglanti(null)).toBeNull();
  });

  it('oneriden "Soru cozdum" sorgusu: kitap, test, serbest; link yok', () => {
    const kitap = oneridenKayitSorgusu({
      ...temel,
      tur: 'kaynak_kitap_testi',
      kaynak_kitap_id: 'k1',
      kaynak_test_id: 't1',
      brans_kodu: 'matematik',
      konu_id: 'c1',
    });
    expect(new URLSearchParams(kitap ?? '').toString()).toBe(
      'kitap=k1&test=t1&brans=matematik&konu=c1',
    );
    expect(
      oneridenKayitSorgusu({
        ...temel,
        tur: 'kaynak_kitap',
        kaynak_kitap_id: 'k1',
        brans_kodu: 'fizik',
      }),
    ).toBe('kitap=k1&brans=fizik');
    expect(oneridenKayitSorgusu({ ...temel, tur: 'serbest', baslik: 'Zor sorular' })).toBe(
      'metin=Zor+sorular',
    );
    expect(oneridenKayitSorgusu({ ...temel, tur: 'link', baslik: 'x' })).toBeNull();
    expect(oneridenKayitSorgusu({ ...temel, tur: 'kaynak_kitap' })).toBeNull();
  });
});

describe('kocluk yolu', () => {
  it('yazma penceresi parametresi', () => {
    expect(koclukYolu('k', 'o')).toBe('/k/ogrenciler/o?sekme=kocluk');
    expect(koclukYolu('k', 'o', true)).toBe('/k/ogrenciler/o?sekme=kocluk&yaz=1');
  });
});
