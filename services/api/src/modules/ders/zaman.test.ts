import { describe, expect, it } from 'vitest';

import { gecIptalMi } from './kurallar.js';
import {
  bugunYerel,
  haftaninGunu,
  saatDilimiGecerliMi,
  tarihEkle,
  utcdenYerel,
  yerelDenUtc,
} from './zaman.js';

const utc = (tarih: string, saat: string, dilim: string) =>
  yerelDenUtc(tarih, saat, dilim).toISOString();

describe('yerelDenUtc', () => {
  it('Europe/Istanbul sabit UTC+3 (yaz saati yok)', () => {
    expect(utc('2026-01-05', '16:00', 'Europe/Istanbul')).toBe('2026-01-05T13:00:00.000Z');
    expect(utc('2026-07-06', '16:00', 'Europe/Istanbul')).toBe('2026-07-06T13:00:00.000Z');
    expect(utc('2026-03-29', '00:30', 'Europe/Istanbul')).toBe('2026-03-28T21:30:00.000Z');
  });

  it('Europe/Berlin ileri gecis gunu (2026-03-29): oncesi UTC+1, sonrasi UTC+2', () => {
    expect(utc('2026-03-28', '10:00', 'Europe/Berlin')).toBe('2026-03-28T09:00:00.000Z');
    expect(utc('2026-03-29', '01:30', 'Europe/Berlin')).toBe('2026-03-29T00:30:00.000Z');
    expect(utc('2026-03-29', '03:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
    expect(utc('2026-03-29', '10:00', 'Europe/Berlin')).toBe('2026-03-29T08:00:00.000Z');
    expect(utc('2026-03-30', '10:00', 'Europe/Berlin')).toBe('2026-03-30T08:00:00.000Z');
  });

  it('Berlin ileri gecis boslugu: var olmayan 02:30, gecisten sonraki saate (03:30) kayar', () => {
    const an = yerelDenUtc('2026-03-29', '02:30', 'Europe/Berlin');
    expect(an.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(utcdenYerel(an, 'Europe/Berlin')).toEqual({ tarih: '2026-03-29', saat: '03:30' });
  });

  it('Europe/Berlin geri gecis gunu (2026-10-25): oncesi UTC+2, sonrasi UTC+1', () => {
    expect(utc('2026-10-24', '10:00', 'Europe/Berlin')).toBe('2026-10-24T08:00:00.000Z');
    expect(utc('2026-10-25', '10:00', 'Europe/Berlin')).toBe('2026-10-25T09:00:00.000Z');
    expect(utc('2026-10-26', '10:00', 'Europe/Berlin')).toBe('2026-10-26T09:00:00.000Z');
  });

  it('Berlin geri gecis, iki kez yasanan 02:30: ilk yasanan an (yaz saati) secilir', () => {
    const an = yerelDenUtc('2026-10-25', '02:30', 'Europe/Berlin');
    expect(an.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(utcdenYerel(an, 'Europe/Berlin')).toEqual({ tarih: '2026-10-25', saat: '02:30' });
  });

  it('America/New_York ileri gecis (2026-03-08)', () => {
    expect(utc('2026-03-07', '12:00', 'America/New_York')).toBe('2026-03-07T17:00:00.000Z');
    expect(utc('2026-03-08', '12:00', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
  });

  it('gidis donus: yerel -> UTC -> yerel ayni degeri verir (yil boyunca, gunde 24 saat)', () => {
    for (const dilim of ['Europe/Istanbul', 'Europe/Berlin']) {
      for (let g = 0; g < 365; g += 7) {
        const tarih = tarihEkle('2026-01-01', g);
        const geri = utcdenYerel(yerelDenUtc(tarih, '16:00', dilim), dilim);
        expect(geri, `${dilim} ${tarih}`).toEqual({ tarih, saat: '16:00' });
      }
    }
  });

  it('gecersiz girdi hata verir', () => {
    expect(() => yerelDenUtc('2026-13', '10:00', 'Europe/Istanbul')).toThrow();
  });
});

describe('takvim yardimcilari', () => {
  it('tarihEkle ay ve yil sinirlarini gecer', () => {
    expect(tarihEkle('2026-12-30', 3)).toBe('2027-01-02');
    expect(tarihEkle('2028-02-28', 1)).toBe('2028-02-29');
    expect(tarihEkle('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('haftaninGunu: 0 = Pazartesi', () => {
    expect(haftaninGunu('2026-01-05')).toBe(0);
    expect(haftaninGunu('2026-01-11')).toBe(6);
  });

  it('bugunYerel saat dilimine gore gunu belirler', () => {
    const an = new Date('2026-01-05T22:30:00Z');
    expect(bugunYerel('Europe/Istanbul', an)).toBe('2026-01-06');
    expect(bugunYerel('Europe/Berlin', an)).toBe('2026-01-05');
  });

  it('saatDilimiGecerliMi', () => {
    expect(saatDilimiGecerliMi('Europe/Istanbul')).toBe(true);
    expect(saatDilimiGecerliMi('Mars/Olympus')).toBe(false);
  });
});

describe('gec iptal', () => {
  it('baslangica esik saatten az kala (veya sonra) gec, once degil', () => {
    const baslangic = new Date('2026-01-10T10:00:00Z');
    expect(gecIptalMi(baslangic, new Date('2026-01-08T09:59:00Z'), 24)).toBe(false);
    expect(gecIptalMi(baslangic, new Date('2026-01-09T10:01:00Z'), 24)).toBe(true);
    expect(gecIptalMi(baslangic, new Date('2026-01-10T11:00:00Z'), 24)).toBe(true);
  });

  it('esik kurum politikasindan gelir: 48 saatte 30 saat kala gec sayilir', () => {
    const baslangic = new Date('2026-01-10T10:00:00Z');
    const simdi = new Date('2026-01-09T04:00:00Z');
    expect(gecIptalMi(baslangic, simdi, 24)).toBe(false);
    expect(gecIptalMi(baslangic, simdi, 48)).toBe(true);
  });
});
