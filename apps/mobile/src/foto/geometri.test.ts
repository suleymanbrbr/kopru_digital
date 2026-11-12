import {
  FOTO_EN_UZUN_KENAR,
  KIRPMA_EN_AZ,
  TUM_ALAN,
  dondurulmusBoyut,
  kaliteBul,
  kirpmaPikseli,
  koseyiTasi,
  kucultulmusBoyut,
  sigdir,
  tamAlanMi,
} from './geometri';

describe('kucultulmusBoyut', () => {
  it('uzun kenari 2000 px yapar, orani korur', () => {
    expect(kucultulmusBoyut({ genislik: 4032, yukseklik: 3024 })).toEqual({
      genislik: FOTO_EN_UZUN_KENAR,
      yukseklik: 1500,
    });
    expect(kucultulmusBoyut({ genislik: 3024, yukseklik: 4032 })).toEqual({
      genislik: 1500,
      yukseklik: FOTO_EN_UZUN_KENAR,
    });
  });
  it('kucuk goruntuyu buyutmez', () => {
    expect(kucultulmusBoyut({ genislik: 800, yukseklik: 600 })).toEqual({
      genislik: 800,
      yukseklik: 600,
    });
  });
});

describe('dondurulmusBoyut', () => {
  it('90/270 derecede en-boyu degistirir', () => {
    expect(dondurulmusBoyut({ genislik: 4, yukseklik: 3 }, 90)).toEqual({ genislik: 3, yukseklik: 4 });
    expect(dondurulmusBoyut({ genislik: 4, yukseklik: 3 }, -90)).toEqual({ genislik: 3, yukseklik: 4 });
    expect(dondurulmusBoyut({ genislik: 4, yukseklik: 3 }, 180)).toEqual({ genislik: 4, yukseklik: 3 });
  });
});

describe('kirpma', () => {
  it('kosesi tasinir, karsi kose sabit kalir', () => {
    const a = koseyiTasi(TUM_ALAN, 'ust-sol', 0.2, 0.3);
    expect(a).toEqual({ x: 0.2, y: 0.3, g: 0.8, y2: 0.7 });
    const b = koseyiTasi(a, 'alt-sag', 0.9, 0.8);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.g).toBeCloseTo(0.7);
    expect(b.y2).toBeCloseTo(0.5);
  });

  it('en az boyutun altina inmez ve sinirlarda kalir', () => {
    const a = koseyiTasi(TUM_ALAN, 'ust-sol', 5, 5);
    expect(a.g).toBeCloseTo(KIRPMA_EN_AZ);
    expect(a.y2).toBeCloseTo(KIRPMA_EN_AZ);
    const b = koseyiTasi(TUM_ALAN, 'alt-sag', -3, -3);
    expect(b.x).toBe(0);
    expect(b.g).toBeCloseTo(KIRPMA_EN_AZ);
  });

  it('piksele cevirir ve goruntu disina tasmaz', () => {
    const k = kirpmaPikseli({ x: 0.25, y: 0.1, g: 0.5, y2: 0.8 }, { genislik: 2000, yukseklik: 1000 });
    expect(k).toEqual({ originX: 500, originY: 100, width: 1000, height: 800 });
    const tasan = kirpmaPikseli({ x: 0.9, y: 0.9, g: 0.5, y2: 0.5 }, { genislik: 100, yukseklik: 100 });
    expect(tasan.originX + tasan.width).toBeLessThanOrEqual(100);
    expect(tasan.originY + tasan.height).toBeLessThanOrEqual(100);
  });

  it('tam alan tespiti', () => {
    expect(tamAlanMi(TUM_ALAN)).toBe(true);
    expect(tamAlanMi({ x: 0.1, y: 0, g: 0.9, y2: 1 })).toBe(false);
  });
});

describe('kaliteBul', () => {
  it('hedefin altina giren ilk (en yuksek) kaliteyi secer', async () => {
    const boyutlar: Record<number, number> = { 0.8: 520_000, 0.7: 430_000, 0.6: 380_000, 0.5: 300_000 };
    const denenen: number[] = [];
    const s = await kaliteBul((k) => {
      denenen.push(k);
      return Promise.resolve({ bayt: boyutlar[k] ?? 100_000 });
    });
    expect(s.kalite).toBe(0.6);
    expect(denenen).toEqual([0.8, 0.7, 0.6]);
    expect(s.bayt).toBeLessThanOrEqual(400 * 1024);
  });

  it('hicbiri girmezse en dusuk kaliteyi dondurur', async () => {
    const s = await kaliteBul(() => Promise.resolve({ bayt: 9_000_000 }));
    expect(s.kalite).toBe(0.4);
  });
});

describe('sigdir', () => {
  it('goruntuyu orta hizali sigdirir', () => {
    const r = sigdir({ genislik: 200, yukseklik: 100 }, { genislik: 100, yukseklik: 100 });
    expect(r).toEqual({ genislik: 100, yukseklik: 50, sol: 0, ust: 25 });
  });
});
