import { describe, expect, it } from 'vitest';

import { devamGecerliMi } from './devam';
import { trSirala } from './sirala';

import { topluSatirlariAyir } from '@/components/hesap/davetler/toplu-davet';
import { kodGecerliMi, kodNormalle } from '@/components/hesap/sinif-kodu-katil';
import { yolIzinliMi } from '@/sunucu/hesap-vekil';

describe('devam yolu', () => {
  it('yalniz uygulamanin kendi yollarini kabul eder', () => {
    expect(devamGecerliMi('/davet/abc_DEF-123')).toBe(true);
    expect(devamGecerliMi('//evil.com')).toBe(false);
    expect(devamGecerliMi('https://evil.com')).toBe(false);
    expect(devamGecerliMi('/a/../b')).toBe(false);
  });
});

describe('Turkce siralama', () => {
  it('ç, ğ, ı, ö, ş, ü harflerini dogru yerlestirir', () => {
    const sirali = trSirala(
      ['Zeynep', 'Şule', 'Çağlar', 'Ayşe', 'Ömer', 'İbrahim', 'Cem'],
      (x) => x,
    );
    expect(sirali).toEqual(['Ayşe', 'Cem', 'Çağlar', 'İbrahim', 'Ömer', 'Şule', 'Zeynep']);
  });
});

describe('sinif kodu', () => {
  it('bosluk, tire ve kucuk harfi yok sayar', () => {
    expect(kodNormalle(' k7mx-4pq2 ')).toBe('K7MX4PQ2');
    expect(kodGecerliMi('K7MX4PQ2')).toBe(true);
  });
  it('8 karakter olmayan ya da yasakli harf iceren kodu reddeder', () => {
    expect(kodGecerliMi('K7MX4PQ')).toBe(false);
    expect(kodGecerliMi('K7MX4PQ0')).toBe(false);
    expect(kodGecerliMi('K7MX4PQI')).toBe(false);
  });
});

describe('toplu davet satirlari', () => {
  it('ad ve telefonu ayirir, bos satirlari atlar', () => {
    expect(
      topluSatirlariAyir('Ayşe Demir, 532 123 45 67\n\n  Mehmet Kaya;533 765 43 21\n5551112233'),
    ).toEqual([
      { ad: 'Ayşe Demir', telefon: '532 123 45 67' },
      { ad: 'Mehmet Kaya', telefon: '533 765 43 21' },
      { ad: '', telefon: '5551112233' },
    ]);
  });
});

describe('BFF izinli yollar', () => {
  it('yalniz hesap uclarini gecirir', () => {
    expect(yolIzinliMi(['kurumlar', 'k1', 'gruplar'])).toBe(true);
    expect(yolIzinliMi(['kurumlar', 'k1', 'davetler', 'toplu'])).toBe(true);
    expect(yolIzinliMi(['davetler', 'kabul'])).toBe(true);
    expect(yolIzinliMi(['oturumlar', 'tumunu-kapat'])).toBe(true);
    expect(yolIzinliMi(['sinif-kodu', 'katil'])).toBe(true);
    expect(yolIzinliMi(['kurumlar', 'k1', 'modul-ayarlari'])).toBe(false);
    expect(yolIzinliMi(['ben'])).toBe(false);
    expect(yolIzinliMi(['kurumlar', '..', 'gruplar'])).toBe(false);
    expect(yolIzinliMi([])).toBe(false);
  });
});
