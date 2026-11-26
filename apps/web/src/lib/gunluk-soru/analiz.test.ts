import type { Hucre, Oneri } from '@kopru/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { bantMetni, birebirVarMi, seviyeBul, yuzdeSayisi } from './analiz';
import { testSatirlariniAyristir, tercihleriOku, tercihleriYaz } from './hatirla';

const hucre = (cozulen: number, dogru: number): Hucre => ({
  cozulen,
  dogru,
  yanlis: cozulen - dogru,
  bos: 0,
  basari: cozulen === 0 ? null : dogru / cozulen,
});

describe('isi haritasi seviyeleri', () => {
  it('basariyi iyi / orta / zayif / veri az / bos olarak ayirir', () => {
    expect(seviyeBul(hucre(20, 18))).toBe('iyi');
    expect(seviyeBul(hucre(20, 14))).toBe('iyi');
    expect(seviyeBul(hucre(20, 12))).toBe('orta');
    expect(seviyeBul(hucre(20, 10))).toBe('orta');
    expect(seviyeBul(hucre(20, 9))).toBe('zayif');
    expect(seviyeBul(hucre(9, 9))).toBe('veriAz');
    expect(seviyeBul(hucre(0, 0))).toBe('bos');
  });

  it('yuzdeyi yuvarlar', () => {
    expect(yuzdeSayisi(0.605)).toBe(61);
    expect(yuzdeSayisi(null)).toBe(0);
  });
});

describe('bant metni ve birebir isareti', () => {
  const bant = (durum: 'veri_az' | 'tespit_yok' | 'zorlaniyor', b: 'orta' | null) => ({
    bant: {
      durum,
      bant: b,
      bant_basarilari: { kolay: null, orta: null, zor: null },
    },
  });
  it('"orta seviyede zorlaniyor" ve "veri az" metinleri', () => {
    const k = (d: 'veri_az' | 'tespit_yok' | 'zorlaniyor', b: 'orta' | null) =>
      bantMetni(bant(d, b) as never);
    expect(k('zorlaniyor', 'orta')).toEqual({ metin: 'Orta seviyede zorlanıyor', ton: 'hata' });
    expect(k('veri_az', null).metin).toBe('Veri az');
    expect(k('tespit_yok', null).ton).toBe('basari');
  });

  it('birebir ders onerisi yalniz ilgili konuda isaretlenir', () => {
    const oneriler: Oneri[] = [
      {
        tur: 'birebir_ders',
        brans_kodu: 'matematik',
        konu_id: 'a',
        konu_ad: 'A',
        zor_basari: 0.2,
        onceki_hafta_basari: null,
        son_hafta_basari: null,
      },
    ];
    expect(birebirVarMi(oneriler, 'a')).toBe(true);
    expect(birebirVarMi(oneriler, 'b')).toBe(false);
    expect(birebirVarMi(undefined, 'a')).toBe(false);
  });
});

describe('kaynak kitap test satirlari', () => {
  it('ad ve soru sayisini ayristirir (virgul, noktali virgul, bos satir)', () => {
    expect(testSatirlariniAyristir('Test 1, 20\n\nTest 2; 25\nTest 3,15  ')).toEqual({
      testler: [
        { ad: 'Test 1', soru_sayisi: 20 },
        { ad: 'Test 2', soru_sayisi: 25 },
        { ad: 'Test 3', soru_sayisi: 15 },
      ],
    });
    expect(testSatirlariniAyristir('')).toEqual({ testler: [] });
  });

  it('hatali satirin numarasini verir', () => {
    expect(testSatirlariniAyristir('Test 1, 20\nTest 2\n')).toEqual({ hataliSatir: 2 });
    expect(testSatirlariniAyristir('Test 1, 0')).toEqual({ hataliSatir: 1 });
    expect(testSatirlariniAyristir('Test 1, 501')).toEqual({ hataliSatir: 1 });
    expect(testSatirlariniAyristir(', 20')).toEqual({ hataliSatir: 1 });
  });
});

describe('son secimlerin hatirlanmasi', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('ders basina konu, zorluk ve kaynagi saklar; kurumlar ayridir', () => {
    expect(tercihleriOku('k1')).toEqual({ dersler: {} });
    tercihleriYaz('k1', 'matematik', { konuId: 'x', zorluk: 'zor' });
    tercihleriYaz('k1', 'matematik', { kaynak: { tur: 'serbest', metin: 'Kitap' } });
    tercihleriYaz('k1', 'fizik', { zorluk: 'kolay' });
    const o = tercihleriOku('k1');
    expect(o.brans).toBe('fizik');
    expect(o.dersler.matematik).toEqual({
      konuId: 'x',
      zorluk: 'zor',
      kaynak: { tur: 'serbest', metin: 'Kitap' },
    });
    expect(tercihleriOku('k2')).toEqual({ dersler: {} });
  });

  it('bozuk depoda bos tercihle devam eder', () => {
    globalThis.localStorage.setItem('kopru.gunlukSoru.son.k1', '{bozuk');
    expect(tercihleriOku('k1')).toEqual({ dersler: {} });
  });
});
