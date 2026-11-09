import { describe, expect, it } from 'vitest';

import {
  haftaAraligi,
  haftaBasi,
  haftaGunleri,
  haftaninGunu,
  tarihEkle,
  yerelSaat,
  yerelTarih,
  yerelUtc,
} from './saat';

const IST = 'Europe/Istanbul';

describe('hafta', () => {
  it('Pazartesi baslangicli hafta bulur', () => {
    expect(haftaBasi('2026-11-09')).toBe('2026-11-09'); // Pazartesi
    expect(haftaBasi('2026-11-15')).toBe('2026-11-09'); // Pazar
    expect(haftaBasi('2026-11-10')).toBe('2026-11-09');
    expect(haftaninGunu('2026-11-15')).toBe(6);
    expect(haftaGunleri('2026-11-09')).toHaveLength(7);
    expect(haftaGunleri('2026-11-09')[6]).toBe('2026-11-15');
  });
  it('ay ve yil sinirlarini asar', () => {
    expect(tarihEkle('2026-12-31', 1)).toBe('2027-01-01');
    expect(haftaBasi('2027-01-01')).toBe('2026-12-28');
  });
});

describe('saat dilimi', () => {
  it('UTC aninin kurum yerel tarih ve saatini verir (tarayici saatinden bagimsiz)', () => {
    expect(yerelSaat('2026-11-09T13:00:00Z', IST)).toBe('16:00');
    expect(yerelTarih('2026-11-09T22:30:00Z', IST)).toBe('2026-11-10');
    expect(yerelSaat('2026-11-09T13:00:00Z', 'America/New_York')).toBe('08:00');
  });
  it('yerel tarih ve saati UTC ye cevirir', () => {
    expect(yerelUtc('2026-11-09', '16:00', IST)).toBe('2026-11-09T13:00:00.000Z');
    expect(yerelUtc('2026-11-09', '00:30', IST)).toBe('2026-11-08T21:30:00.000Z');
    // Yaz saati olan dilimde ofset tarihe gore degisir.
    expect(yerelUtc('2026-07-01', '12:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00.000Z');
    expect(yerelUtc('2026-01-01', '12:00', 'Europe/Berlin')).toBe('2026-01-01T11:00:00.000Z');
  });
  it('hafta araligi yerel gece yarisindan baslar', () => {
    expect(haftaAraligi('2026-11-09', IST)).toEqual({
      baslangic: '2026-11-08T21:00:00.000Z',
      bitis: '2026-11-15T21:00:00.000Z',
    });
  });
});
