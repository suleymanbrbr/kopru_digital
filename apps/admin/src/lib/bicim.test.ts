import { describe, expect, it } from 'vitest';

import { dakikaSaniye, kodAdi, sahipMetni, tarihSaat, uuidMi, yerelIso } from './bicim';

describe('bicim', () => {
  it('dakikaSaniye negatife düşmez ve sıfır doldurur', () => {
    expect(dakikaSaniye(65)).toEqual({ dk: '01', sn: '05' });
    expect(dakikaSaniye(-3)).toEqual({ dk: '00', sn: '00' });
    expect(dakikaSaniye(900)).toEqual({ dk: '15', sn: '00' });
  });

  it('yerelIso: Istanbul saatini (UTC+3) UTC ISO yapar', () => {
    expect(yerelIso('2031-01-01T10:00')).toBe('2031-01-01T07:00:00.000Z');
    expect(yerelIso('')).toBeUndefined();
    expect(yerelIso('geçersiz')).toBeUndefined();
  });

  it('uuidMi', () => {
    expect(uuidMi('0190a000-0000-7000-8000-000000000001')).toBe(true);
    expect(uuidMi(' 0190a000-0000-7000-8000-000000000001 ')).toBe(true);
    expect(uuidMi('değil')).toBe(false);
  });

  it('tarihSaat boş/geçersizde boş döner, Istanbul saatiyle yazar', () => {
    expect(tarihSaat(null)).toBe('');
    expect(tarihSaat('x')).toBe('');
    expect(tarihSaat('2026-11-18T09:00:00.000Z')).toMatch(/12:00/);
  });

  it('kodAdi', () => {
    expect(kodAdi('odev_teslim')).toBe('Odev teslim');
  });

  it('sahipMetni olmayan iletişim bilgisini atlar', () => {
    expect(sahipMetni({ telefon_maskeli: '+90 532 *** ** 12', eposta_maskeli: 'a***@b.com' })).toBe(
      '+90 532 *** ** 12 · a***@b.com',
    );
    expect(sahipMetni({ telefon_maskeli: null, eposta_maskeli: 'a***@b.com' })).toBe('a***@b.com');
    expect(sahipMetni({ telefon_maskeli: null, eposta_maskeli: null })).toBe('');
  });
});
