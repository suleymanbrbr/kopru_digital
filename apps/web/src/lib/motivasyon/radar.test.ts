import { describe, expect, it } from 'vitest';

import { radarHesapla, radarUstSiniri } from './radar';

const BECERILER = [
  { kod: 'sayisal', ad: 'Sayısal', puan: 400 },
  { kod: 'sozel', ad: 'Sözel', puan: 200 },
  { kod: 'fen', ad: 'Fen', puan: 0 },
  { kod: 'sosyal', ad: 'Sosyal', puan: 100 },
  { kod: 'dil', ad: 'Dil', puan: 50 },
];

describe('radarUstSiniri', () => {
  it('en yuksek puani kapsayan yuvarlak siniri secer', () => {
    expect(radarUstSiniri([0, 0])).toBe(50);
    expect(radarUstSiniri([49, 12])).toBe(50);
    expect(radarUstSiniri([51])).toBe(100);
    expect(radarUstSiniri([420, 260])).toBe(500);
    expect(radarUstSiniri([150_000])).toBe(150_000);
  });
});

describe('radarHesapla', () => {
  it('bes beceri icin bes nokta, bes eksen ve halka uretir', () => {
    const r = radarHesapla(BECERILER, 240);
    expect(r.noktalar).toHaveLength(5);
    expect(r.eksenler).toHaveLength(5);
    expect(r.halkalar).toHaveLength(4);
    expect(r.cokgen.split(' ')).toHaveLength(5);
    expect(r.ustSinir).toBe(500);
  });

  it('ilk eksen yukari bakar; oran puanla orantili', () => {
    const r = radarHesapla(BECERILER, 240);
    const ilk = r.noktalar[0];
    expect(ilk?.oran).toBeCloseTo(0.8);
    expect(ilk?.x).toBeCloseTo(120); // merkez x
    expect((ilk?.y ?? 0) < 120).toBe(true); // yukari
    // Puani 0 olan beceri merkezde
    const sifir = r.noktalar[2];
    expect(sifir?.x).toBeCloseTo(120);
    expect(sifir?.y).toBeCloseTo(120);
  });

  it('bos listeyi cokertmez', () => {
    const r = radarHesapla([], 240);
    expect(r.noktalar).toEqual([]);
    expect(r.cokgen).toBe('');
  });
});
