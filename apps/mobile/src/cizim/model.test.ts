import {
  BOS_CIZIM,
  CIZIM_EN_FAZLA_BAYT,
  CizimCokBuyukHatasi,
  cizgiEkle,
  cizimSuresiMs,
  cozumle,
  geriAl,
  geriAlinabilir,
  gorunenCizgiler,
  sadelestir,
  serilestir,
  sesSuresiSn,
  temizle,
  veriBayti,
  yinele,
  yinelenebilir,
  type Cizgi,
  type Nokta,
} from './model';

const cizgi = (arac: Cizgi['arac'], noktalar: Nokta[]): Cizgi => ({ arac, kalinlik: 45, noktalar });
const dogru = (n: number, t0 = 0): Nokta[] =>
  Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5, t: t0 + i * 16 }));

describe('geri al / yinele', () => {
  const a = cizgi('kirmizi', dogru(5));
  const b = cizgi('mavi', dogru(5));
  const c = cizgi('silgi', dogru(5));

  it('bos cizimde geri al/yinele etkisizdir', () => {
    expect(geriAl(BOS_CIZIM)).toBe(BOS_CIZIM);
    expect(yinele(BOS_CIZIM)).toBe(BOS_CIZIM);
    expect(geriAlinabilir(BOS_CIZIM)).toBe(false);
    expect(yinelenebilir(BOS_CIZIM)).toBe(false);
  });

  it('geri alinan cizgi yinele ile ayni sirada geri gelir', () => {
    let d = cizgiEkle(cizgiEkle(cizgiEkle(BOS_CIZIM, a), b), c);
    d = geriAl(geriAl(d));
    expect(d.cizgiler).toEqual([a]);
    expect(yinelenebilir(d)).toBe(true);
    d = yinele(d);
    expect(d.cizgiler).toEqual([a, b]);
    d = yinele(d);
    expect(d.cizgiler).toEqual([a, b, c]);
    expect(yinelenebilir(d)).toBe(false);
  });

  it('yeni cizgi yinele yiginini temizler', () => {
    let d = geriAl(cizgiEkle(cizgiEkle(BOS_CIZIM, a), b));
    expect(yinelenebilir(d)).toBe(true);
    d = cizgiEkle(d, c);
    expect(d.cizgiler).toEqual([a, c]);
    expect(yinelenebilir(d)).toBe(false);
  });

  it('noktasiz cizgi eklenmez; temizle her ikisini de bosaltir', () => {
    expect(cizgiEkle(BOS_CIZIM, cizgi('mavi', []))).toBe(BOS_CIZIM);
    const d = temizle(geriAl(cizgiEkle(cizgiEkle(BOS_CIZIM, a), b)));
    expect(d.cizgiler).toEqual([]);
    expect(d.yigin).toEqual([]);
  });
});

describe('sadelestir', () => {
  it('dogru uzerindeki ara noktalari atar, uclari ve zamanlarini korur', () => {
    const s = sadelestir(dogru(100), 0.001);
    expect(s).toHaveLength(2);
    expect(s[0]?.t).toBe(0);
    expect(s[1]?.t).toBe(99 * 16);
  });

  it('keskin donusu korur', () => {
    const n: Nokta[] = [
      { x: 0, y: 0, t: 0 },
      { x: 0.5, y: 0, t: 10 },
      { x: 0.5, y: 0.5, t: 20 },
    ];
    expect(sadelestir(n, 0.01)).toHaveLength(3);
  });
});

describe('serilestir / cozumle', () => {
  it('zamansiz bicimde (x, y) ikilileri yazar ve geri okur', () => {
    const v = serilestir([cizgi('kirmizi', dogru(10))], 1.3333);
    expect(v.v).toBe(1);
    expect(v.zamanli).toBe(false);
    expect(v.sure_ms).toBeUndefined();
    expect(v.oran).toBe(1.3333);
    const k = cozumle(JSON.parse(JSON.stringify(v)));
    expect(k?.zamanli).toBe(false);
    expect(k?.oran).toBe(1.3333);
    expect(k?.cizgiler[0]?.arac).toBe('kirmizi');
    // Dogru sadelesir: yalniz uclar.
    expect(k?.cizgiler[0]?.noktalar).toHaveLength(2);
  });

  it('zamanli bicimde (x, y, t) uclulerini ve sure_ms yazar', () => {
    const v = serilestir(
      [
        cizgi('mavi', [
          { x: 0.1, y: 0.2, t: 500 },
          { x: 0.3, y: 0.4, t: 900 },
        ]),
      ],
      0.75,
      { zamanli: true },
    );
    expect(v.zamanli).toBe(true);
    expect(v.sure_ms).toBe(900);
    expect(v.cizgiler[0]?.n).toEqual([1000, 2000, 500, 3000, 4000, 900]);
    const k = cozumle(v);
    expect(k?.cizgiler[0]?.noktalar[1]).toEqual({ x: 0.3, y: 0.4, t: 900 });
  });

  it('koordinatlari 0..10000 izgarasina sinirlar', () => {
    const v = serilestir([cizgi('siyah', [{ x: -1, y: 2, t: 0 }])], 1);
    expect(v.cizgiler[0]?.n).toEqual([0, 10000]);
  });

  it('gecersiz veriyi reddeder', () => {
    expect(cozumle(null)).toBeNull();
    expect(cozumle([])).toBeNull();
    expect(cozumle({ v: 9, cizgiler: [], oran: 1 })).toBeNull();
    const k = cozumle({ v: 1, oran: 1, zamanli: false, cizgiler: [{ a: 'yesil', k: 1, n: [1, 2] }] });
    expect(k?.cizgiler).toEqual([]);
  });

  it('256 KB sinirini sadelestirerek korur', () => {
    // Gurultulu 40 bin noktalik tek cizgi: ham hali sinirin cok ustunde.
    const gurultu: Nokta[] = Array.from({ length: 40_000 }, (_, i) => ({
      x: 0.5 + 0.3 * Math.sin(i / 50) + ((i * 7919) % 100) / 100_000,
      y: 0.5 + 0.3 * Math.cos(i / 70) + ((i * 104729) % 100) / 100_000,
      t: i * 16,
    }));
    const v = serilestir([cizgi('kirmizi', gurultu)], 1, { zamanli: true });
    expect(veriBayti(v)).toBeLessThanOrEqual(CIZIM_EN_FAZLA_BAYT);
    expect(v.cizgiler[0]?.n.length).toBeGreaterThan(60);
  });

  it('sinir asilamiyorsa CizimCokBuyukHatasi firlatir', () => {
    const rastgele: Nokta[] = Array.from({ length: 6000 }, (_, i) => ({
      x: ((i * 7919) % 1000) / 1000,
      y: ((i * 104729) % 1000) / 1000,
      t: i,
    }));
    expect(() => serilestir([cizgi('mavi', rastgele)], 1, { enFazlaBayt: 2000, zamanli: true })).toThrow(
      CizimCokBuyukHatasi,
    );
  });
});

describe('mini anlatim zaman eslemesi', () => {
  const ilk = cizgi('kirmizi', [
    { x: 0.1, y: 0.1, t: 1000 },
    { x: 0.2, y: 0.2, t: 1500 },
    { x: 0.3, y: 0.3, t: 2000 },
  ]);
  const ikinci = cizgi('mavi', [
    { x: 0.5, y: 0.5, t: 4000 },
    { x: 0.6, y: 0.6, t: 4500 },
  ]);

  it('henuz baslamamis cizgiyi gostermez', () => {
    expect(gorunenCizgiler([ilk, ikinci], 999)).toEqual([]);
  });

  it('suren cizgiyi kismi noktalarla gosterir', () => {
    const g = gorunenCizgiler([ilk, ikinci], 1600);
    expect(g).toHaveLength(1);
    expect(g[0]?.noktalar.map((n) => n.t)).toEqual([1000, 1500]);
  });

  it('biten cizgiyi tam gosterir; sonraki cizgi kendi zamaninda baslar', () => {
    expect(gorunenCizgiler([ilk, ikinci], 3000)).toEqual([ilk]);
    const g = gorunenCizgiler([ilk, ikinci], 4200);
    expect(g).toHaveLength(2);
    expect(g[1]?.noktalar).toHaveLength(1);
    expect(gorunenCizgiler([ilk, ikinci], 10_000)).toEqual([ilk, ikinci]);
  });

  it('seri hale getirilip okunan veri ayni zaman eslemesini verir', () => {
    const k = cozumle(serilestir([ilk, ikinci], 1, { zamanli: true }));
    expect(k).not.toBeNull();
    const g = gorunenCizgiler(k?.cizgiler ?? [], 1600);
    expect(g).toHaveLength(1);
    expect(g[0]?.noktalar.at(-1)?.t).toBeLessThanOrEqual(1600);
  });

  it('cizim suresi son noktanin zamanidir', () => {
    expect(cizimSuresiMs([ilk, ikinci])).toBe(4500);
    expect(cizimSuresiMs([])).toBe(0);
  });
});

describe('ses suresi', () => {
  it('180 sn ustunu keser, en az 1 sn verir', () => {
    expect(sesSuresiSn(400)).toBe(1);
    expect(sesSuresiSn(12_400)).toBe(12);
    expect(sesSuresiSn(500_000)).toBe(180);
  });
});
