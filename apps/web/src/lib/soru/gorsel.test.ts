import { describe, expect, it } from 'vitest';

import {
  GORSEL_KAYNAK_EN_FAZLA_BAYT,
  KIRPMA_EN_AZ,
  KIRPMA_YOK,
  dondurBoyut,
  dosyaSorunu,
  heicMi,
  hedefBoyut,
  kirpmaKenariAyarla,
  kirpmaPikseli,
  kirpmaVarMi,
  sonrakiDerece,
} from './gorsel';

describe('hedefBoyut', () => {
  it('uzun kenari 2000 pikselde sinirlar ve oran korur', () => {
    expect(hedefBoyut(4032, 3024)).toEqual({ genislik: 2000, yukseklik: 1500, olcek: 2000 / 4032 });
    expect(hedefBoyut(3024, 4032)).toMatchObject({ genislik: 1500, yukseklik: 2000 });
  });

  it('kucuk gorseli buyutmez', () => {
    expect(hedefBoyut(800, 600)).toEqual({ genislik: 800, yukseklik: 600, olcek: 1 });
  });

  it('sinirda tam boyut kalir ve en az 1 piksel uretir', () => {
    expect(hedefBoyut(2000, 1000).olcek).toBe(1);
    expect(hedefBoyut(10_000, 1, 2000)).toMatchObject({ genislik: 2000, yukseklik: 1 });
  });
});

describe('dondurme', () => {
  it('90 ve 270 derecede genislik ile yuksekligi takas eder', () => {
    expect(dondurBoyut(400, 300, 0)).toEqual({ genislik: 400, yukseklik: 300 });
    expect(dondurBoyut(400, 300, 90)).toEqual({ genislik: 300, yukseklik: 400 });
    expect(dondurBoyut(400, 300, 180)).toEqual({ genislik: 400, yukseklik: 300 });
    expect(dondurBoyut(400, 300, 270)).toEqual({ genislik: 300, yukseklik: 400 });
  });

  it('saat yonunde ve tersine 360 derece sarar', () => {
    expect(sonrakiDerece(0, 1)).toBe(90);
    expect(sonrakiDerece(270, 1)).toBe(0);
    expect(sonrakiDerece(0, -1)).toBe(270);
    expect(sonrakiDerece(90, -1)).toBe(0);
  });
});

describe('kirpma', () => {
  it('oranlari piksel dikdortgenine cevirir', () => {
    expect(kirpmaPikseli({ sol: 0.1, ust: 0.2, sag: 0.1, alt: 0.3 }, 1000, 500)).toEqual({
      x: 100,
      y: 100,
      genislik: 800,
      yukseklik: 250,
    });
  });

  it('kirpmasiz tum gorseli verir', () => {
    expect(kirpmaPikseli(KIRPMA_YOK, 640, 480)).toEqual({
      x: 0,
      y: 0,
      genislik: 640,
      yukseklik: 480,
    });
    expect(kirpmaVarMi(KIRPMA_YOK)).toBe(false);
    expect(kirpmaVarMi({ ...KIRPMA_YOK, alt: 0.1 })).toBe(true);
  });

  it('asiri kirpmada bile en az 1x1 piksel birakir', () => {
    const k = kirpmaPikseli({ sol: 0.9, ust: 0.9, sag: 0.9, alt: 0.9 }, 100, 100);
    expect(k.genislik).toBeGreaterThanOrEqual(1);
    expect(k.yukseklik).toBeGreaterThanOrEqual(1);
    expect(k.x).toBeLessThan(100);
  });

  it('cerceve her eksende en az KIRPMA_EN_AZ kalir; kenarlar birbirini gecemez', () => {
    const k = kirpmaKenariAyarla({ ...KIRPMA_YOK, sag: 0.5 }, 'sol', 0.9);
    expect(k.sol).toBeCloseTo(1 - KIRPMA_EN_AZ - 0.5);
    expect(1 - k.sol - k.sag).toBeGreaterThanOrEqual(KIRPMA_EN_AZ - 1e-9);
    expect(kirpmaKenariAyarla(KIRPMA_YOK, 'ust', -1).ust).toBe(0);
  });
});

describe('dosya suzgeci', () => {
  it('HEIC adini ve turunu tanir', () => {
    expect(heicMi({ type: 'image/heic', name: 'a.jpg' })).toBe(true);
    expect(heicMi({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(heicMi({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });

  it('resim olmayan, SVG ve cok buyuk dosyayi reddeder; HEIC ve JPEG gecer', () => {
    expect(dosyaSorunu({ type: 'application/pdf', name: 'a.pdf', size: 10 })).toBe('resim_degil');
    expect(dosyaSorunu({ type: 'image/svg+xml', name: 'a.svg', size: 10 })).toBe('resim_degil');
    expect(
      dosyaSorunu({ type: 'image/jpeg', name: 'a.jpg', size: GORSEL_KAYNAK_EN_FAZLA_BAYT + 1 }),
    ).toBe('cok_buyuk');
    expect(dosyaSorunu({ type: 'image/jpeg', name: 'a.jpg', size: 1000 })).toBeNull();
    expect(dosyaSorunu({ type: 'image/heic', name: 'a.heic', size: 1000 })).toBeNull();
  });
});
