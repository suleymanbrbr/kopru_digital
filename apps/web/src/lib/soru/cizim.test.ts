import { describe, expect, it } from 'vitest';

import {
  cizgiEkle,
  cizimBos,
  cizimGeriAl,
  cizimVarMi,
  cizimVerisiYap,
  cizimYinele,
  geriAlinabilir,
  noktalariSadelestir,
  veriBayti,
  yinelenebilir,
  type Cizgi,
} from './cizim';

const cizgi = (n: number, arac: Cizgi['arac'] = 'kalem'): Cizgi => ({
  arac,
  renk: '#dc2626',
  kalinlik: 0.006,
  noktalar: [n / 10, 0.1, n / 10, 0.9],
});

describe('geri al / yinele', () => {
  it('geri alinan cizgi yinelenir ve sirasi korunur', () => {
    let g = cizimBos();
    g = cizgiEkle(cizgiEkle(cizgiEkle(g, cizgi(1)), cizgi(2)), cizgi(3));
    expect(g.cizgiler).toHaveLength(3);

    g = cizimGeriAl(cizimGeriAl(g));
    expect(g.cizgiler.map((c) => c.noktalar[0])).toEqual([0.1]);
    expect(g.yinelenecek.map((c) => c.noktalar[0])).toEqual([0.3, 0.2]);
    expect(yinelenebilir(g)).toBe(true);

    g = cizimYinele(g);
    expect(g.cizgiler.map((c) => c.noktalar[0])).toEqual([0.1, 0.2]);
    expect(g.yinelenecek).toHaveLength(1);
  });

  it('yeni cizgi yinele gecmisini temizler', () => {
    let g = cizgiEkle(cizgiEkle(cizimBos(), cizgi(1)), cizgi(2));
    g = cizimGeriAl(g);
    expect(yinelenebilir(g)).toBe(true);
    g = cizgiEkle(g, cizgi(5));
    expect(yinelenebilir(g)).toBe(false);
    expect(g.cizgiler).toHaveLength(2);
  });

  it('bos gecmiste geri al / yinele ayni nesneyi doner', () => {
    const bos = cizimBos();
    expect(geriAlinabilir(bos)).toBe(false);
    expect(cizimGeriAl(bos)).toBe(bos);
    expect(cizimYinele(bos)).toBe(bos);
  });

  it('yalniz silgi cizgileri "cizim" sayilmaz', () => {
    expect(cizimVarMi(cizgiEkle(cizimBos(), cizgi(1, 'silgi')))).toBe(false);
    expect(cizimVarMi(cizgiEkle(cizimBos(), cizgi(1)))).toBe(true);
  });
});

describe('cizim verisi', () => {
  it('yakin noktalari atar, ilk ve son noktayi korur', () => {
    const noktalar = [0, 0, 0.0001, 0.0001, 0.5, 0.5, 0.5001, 0.5001, 1, 1];
    const s = noktalariSadelestir(noktalar, 0.01);
    expect(s).toEqual([0, 0, 0.5, 0.5, 1, 1]);
    expect(noktalariSadelestir([0.1, 0.1, 0.2, 0.2], 0.5)).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  it('boyutu vektor olarak yazar (surum, genislik, yukseklik, yuvarlanmis noktalar)', () => {
    const g = cizgiEkle(cizimBos(), {
      ...cizgi(1),
      noktalar: [0.123456789, 0.2, 0.6, 0.7],
    });
    const v = cizimVerisiYap(g, 800, 600);
    expect(v).toMatchObject({ surum: 1, genislik: 800, yukseklik: 600 });
    expect(v.cizgiler[0]?.noktalar[0]).toBe(0.1235);
  });

  it('JSON boyutu siniri asinca noktalari sadelestirerek sigdirir', () => {
    const cok = Array.from({ length: 6000 }, (_, i) => [
      Math.round(Math.abs(Math.sin(i)) * 1e4) / 1e4,
      Math.round(Math.abs(Math.cos(i * 1.3)) * 1e4) / 1e4,
    ]).flat();
    const g = cizgiEkle(cizimBos(), { ...cizgi(1), noktalar: cok });
    const sinir = 20_000;
    const v = cizimVerisiYap(g, 1000, 1000, sinir);
    expect(veriBayti(v)).toBeLessThanOrEqual(sinir);
    expect(v.cizgiler[0]?.noktalar.length).toBeLessThan(cok.length);
  });

  it('varsayilan sinir 256 KB: kucuk cizim oldugu gibi kalir', () => {
    const v = cizimVerisiYap(cizgiEkle(cizimBos(), cizgi(1)), 100, 100);
    expect(veriBayti(v)).toBeLessThan(256 * 1024);
    expect(v.cizgiler).toHaveLength(1);
  });
});
