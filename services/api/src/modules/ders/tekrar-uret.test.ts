import { tekrarKuraliCoz, type TekrarKurali } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import { tekrarOlusumlari } from './tekrar-uret.js';
import { yerelDenUtc } from './zaman.js';

const kural = (metin: string): TekrarKurali => {
  const s = tekrarKuraliCoz(metin);
  if (!s.ok) throw new Error(s.hata);
  return s.kural;
};

describe('tekrarOlusumlari', () => {
  it('haftalik: baslangic gunu varsayilan, 2026-01-05 Pazartesi', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY'),
      baslangicTarihi: '2026-01-05',
      bitisTarihi: null,
      adet: null,
      ufukTarihi: '2026-01-26',
    });
    expect(s.olusumlar.map((o) => o.tarih)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ]);
    expect(s.olusumlar.map((o) => o.sira)).toEqual([0, 1, 2, 3]);
    expect(s.bitti).toBe(false);
  });

  it('haftalik BYDAY: baslangictan onceki gunler atlanir (Carsamba baslangic, MO,WE,FR)', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY;BYDAY=MO,WE,FR'),
      baslangicTarihi: '2026-01-07',
      bitisTarihi: null,
      adet: 5,
      ufukTarihi: '2026-03-01',
    });
    expect(s.olusumlar.map((o) => o.tarih)).toEqual([
      '2026-01-07',
      '2026-01-09',
      '2026-01-12',
      '2026-01-14',
      '2026-01-16',
    ]);
    expect(s.bitti).toBe(true);
  });

  it('haftalik INTERVAL=2: iki haftada bir', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'),
      baslangicTarihi: '2026-01-06',
      bitisTarihi: null,
      adet: null,
      ufukTarihi: '2026-02-10',
    });
    expect(s.olusumlar.map((o) => o.tarih)).toEqual(['2026-01-06', '2026-01-20', '2026-02-03']);
  });

  it('bitis tarihi dahildir ve seri biter', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY'),
      baslangicTarihi: '2026-01-05',
      bitisTarihi: '2026-01-19',
      adet: null,
      ufukTarihi: '2026-06-01',
    });
    expect(s.olusumlar.map((o) => o.tarih)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
    expect(s.bitti).toBe(true);
  });

  it('gunluk, BYDAY suzgeci ve adet', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'),
      baslangicTarihi: '2026-01-09',
      bitisTarihi: null,
      adet: 4,
      ufukTarihi: '2026-03-01',
    });
    expect(s.olusumlar.map((o) => o.tarih)).toEqual([
      '2026-01-09',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
    ]);
  });

  it('ufuk degisse de sira ayni tarih icin ayni kalir (idempotentlik)', () => {
    const girdi = {
      kural: kural('FREQ=WEEKLY;BYDAY=MO,TH'),
      baslangicTarihi: '2026-01-05',
      bitisTarihi: null,
      adet: null,
    };
    const kisa = tekrarOlusumlari({ ...girdi, ufukTarihi: '2026-02-01' }).olusumlar;
    const uzun = tekrarOlusumlari({ ...girdi, ufukTarihi: '2026-03-01' }).olusumlar;
    expect(uzun.slice(0, kisa.length)).toEqual(kisa);
    expect(uzun.length).toBeGreaterThan(kisa.length);
  });

  it('baslangic ufuktan sonraysa bos doner', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY'),
      baslangicTarihi: '2026-06-01',
      bitisTarihi: null,
      adet: null,
      ufukTarihi: '2026-03-01',
    });
    expect(s).toEqual({ olusumlar: [], bitti: false });
  });

  it('DST: haftalik Berlin serisinde yerel saat sabit, UTC ani gecis haftasinda kayar', () => {
    const s = tekrarOlusumlari({
      kural: kural('FREQ=WEEKLY;BYDAY=SA'),
      baslangicTarihi: '2026-03-21',
      bitisTarihi: null,
      adet: 3,
      ufukTarihi: '2026-06-01',
    });
    const anlar = s.olusumlar.map((o) =>
      yerelDenUtc(o.tarih, '09:00', 'Europe/Berlin').toISOString(),
    );
    expect(s.olusumlar.map((o) => o.tarih)).toEqual(['2026-03-21', '2026-03-28', '2026-04-04']);
    expect(anlar).toEqual([
      '2026-03-21T08:00:00.000Z',
      '2026-03-28T08:00:00.000Z',
      '2026-04-04T07:00:00.000Z',
    ]);
  });
});
