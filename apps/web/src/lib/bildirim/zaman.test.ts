import { describe, expect, it } from 'vitest';

import { goreliZaman } from './zaman';

// 18 Kasim 2026 14:00 Istanbul (UTC+3) = 11:00Z
const SIMDI = Date.parse('2026-11-18T11:00:00Z');
const once = (ms: number) => new Date(SIMDI - ms).toISOString();

describe('goreliZaman', () => {
  it('dakika, saat, dun, gun ve tarih', () => {
    expect(goreliZaman(once(20_000), SIMDI)).toBe('Az önce');
    expect(goreliZaman(once(5 * 60_000), SIMDI)).toBe('5 dk önce');
    expect(goreliZaman(once(3 * 3_600_000), SIMDI)).toBe('3 sa önce');
    expect(goreliZaman('2026-11-17T20:00:00Z', SIMDI)).toBe('Dün');
    expect(goreliZaman('2026-11-15T10:00:00Z', SIMDI)).toBe('3 gün önce');
    expect(goreliZaman('2026-10-01T10:00:00Z', SIMDI)).toBe('1 Eki 2026');
  });

  it('gece yarisi gecince 1 saatten yeni olsa da dun degil, bugunun saati sayilir', () => {
    // simdi 00:30 yerel, olay 23:50 yerel (40 dk once): dakika gosterilir
    const s = Date.parse('2026-11-17T21:30:00Z'); // 00:30 (18 Kasim) yerel
    expect(goreliZaman('2026-11-17T20:50:00Z', s)).toBe('40 dk önce');
    // 2 saat once = 22:30 yerel (17 Kasim): dun
    expect(goreliZaman('2026-11-17T19:30:00Z', s)).toBe('Dün');
  });

  it('gecersiz zaman bos doner', () => {
    expect(goreliZaman('bozuk', SIMDI)).toBe('');
  });
});
