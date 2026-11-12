import type { SoruKota } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  bekliyorMu,
  goreliZaman,
  kotaHatasi,
  kotaOzeti,
  sonSecimiOku,
  sonSecimiYaz,
  sureKisa,
  sureMetni,
  yuzdeMetni,
} from './soru';

import { UygulamaHatasi } from '@/lib/api';

const kota = (ek: Partial<SoruKota> = {}): SoruKota => ({
  gunluk_limit: 3,
  gunluk_kullanilan: 1,
  gunluk_kalan: 2,
  gunluk_sifirlanma_at: '2026-11-12T21:00:00.000Z',
  aylik_limit: null,
  aylik_kullanilan: 4,
  aylik_kalan: null,
  aylik_sifirlanma_at: '2026-11-30T21:00:00.000Z',
  ...ek,
});

describe('kotaOzeti', () => {
  it('yalniz gunluk sinir varsa onu dondurur', () => {
    expect(kotaOzeti(kota())).toMatchObject({ tur: 'gunluk', kalan: 2, limit: 3 });
  });

  it('daha kisitli olan (az kalan) kotayi secer', () => {
    const o = kotaOzeti(kota({ aylik_limit: 10, aylik_kalan: 1 }));
    expect(o).toMatchObject({ tur: 'aylik', kalan: 1, sifirlanma: '2026-11-30T21:00:00.000Z' });
  });

  it('ikisi de sinirsizsa null', () => {
    expect(kotaOzeti(kota({ gunluk_limit: null, gunluk_kalan: null }))).toBeNull();
  });
});

describe('kotaHatasi', () => {
  it('429 kota_asildi detayindan kota turunu ve sifirlanma zamanini okur', () => {
    const hata = new UygulamaHatasi(429, 'kota_asildi', 'x', undefined, {
      kota: kota({ gunluk_kalan: 0 }),
      kota_turu: 'gunluk',
    });
    expect(kotaHatasi(hata)).toEqual({ tur: 'gunluk', sifirlanma: '2026-11-12T21:00:00.000Z' });
    const aylik = new UygulamaHatasi(429, 'kota_asildi', 'x', undefined, {
      kota: kota({ aylik_kalan: 0 }),
      kota_turu: 'aylik',
    });
    expect(kotaHatasi(aylik)?.sifirlanma).toBe('2026-11-30T21:00:00.000Z');
  });

  it('detay yoksa gunluk varsayar; baska hatada null', () => {
    expect(kotaHatasi(new UygulamaHatasi(429, 'kota_asildi', 'x'))).toEqual({
      tur: 'gunluk',
      sifirlanma: null,
    });
    expect(kotaHatasi(new UygulamaHatasi(500, 'baska', 'x'))).toBeNull();
    expect(kotaHatasi(new Error('x'))).toBeNull();
  });
});

describe('sure bicimleme', () => {
  it('tahmini sureyi dakika, saat, gun olarak verir', () => {
    expect(sureMetni(30)).toEqual({ birim: 'dakika', n: 1 });
    expect(sureMetni(1500)).toEqual({ birim: 'dakika', n: 25 });
    expect(sureMetni(3 * 3600)).toEqual({ birim: 'saat', n: 3 });
    expect(sureMetni(3 * 86_400)).toEqual({ birim: 'gun', n: 3 });
  });

  it('kisa metin ve yuzde', () => {
    expect(sureKisa(null)).toBeNull();
    expect(sureKisa(45 * 60)).toBe('45 dk');
    expect(sureKisa(2 * 3600 + 10 * 60)).toBe('2 sa 10 dk');
    expect(sureKisa(3 * 86_400)).toBe('3 gün');
    expect(yuzdeMetni(0.756)).toBe('%76');
    expect(yuzdeMetni(null)).toBeNull();
  });

  it('goreli zaman Turkce yazar', () => {
    const simdi = Date.parse('2026-11-12T12:00:00Z');
    expect(goreliZaman('2026-11-12T09:00:00Z', simdi)).toBe('3 saat önce');
    expect(goreliZaman('2026-11-12T11:30:00Z', simdi)).toBe('30 dakika önce');
    expect(goreliZaman('2026-11-11T12:00:00Z', simdi)).toBe('dün');
  });
});

describe('durum ve son secim', () => {
  it('yalniz acik ve takip_bekliyor cevap bekler', () => {
    expect(bekliyorMu('acik')).toBe(true);
    expect(bekliyorMu('takip_bekliyor')).toBe(true);
    expect(bekliyorMu('cevaplandi')).toBe(false);
    expect(bekliyorMu('cozuldu')).toBe(false);
  });

  it('son secilen brans ve konu kurum basina saklanir; bozuk veri yok sayilir', () => {
    expect(sonSecimiOku('k1')).toBeNull();
    sonSecimiYaz('k1', { brans: 'matematik', konuId: null });
    expect(sonSecimiOku('k1')).toEqual({ brans: 'matematik', konuId: null });
    expect(sonSecimiOku('k2')).toBeNull();
    window.localStorage.setItem('kopru.soru.son-secim.k3', '{bozuk');
    expect(sonSecimiOku('k3')).toBeNull();
  });
});
