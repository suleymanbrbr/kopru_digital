import { describe, expect, it } from 'vitest';

import { SeriOlusturGirdiSema } from './api.js';
import { tekrarKuraliCoz, tekrarKuraliYaz } from './tekrar.js';

describe('tekrarKuraliCoz', () => {
  it('haftalik kurali cozer ve kanonik yazar', () => {
    const s = tekrarKuraliCoz('freq=weekly;byday=we,mo');
    expect(s).toEqual({ ok: true, kural: { freq: 'WEEKLY', interval: 1, byday: ['MO', 'WE'] } });
    if (s.ok) expect(tekrarKuraliYaz(s.kural)).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE');
  });

  it('gunluk kural ve aralik', () => {
    expect(tekrarKuraliCoz('FREQ=DAILY;INTERVAL=2')).toEqual({
      ok: true,
      kural: { freq: 'DAILY', interval: 2, byday: [] },
    });
  });

  it.each([
    'FREQ=MONTHLY',
    'FREQ=YEARLY;INTERVAL=1',
    'INTERVAL=2',
    'FREQ=WEEKLY;COUNT=5',
    'FREQ=WEEKLY;INTERVAL=0',
    'FREQ=WEEKLY;INTERVAL=53',
    'FREQ=WEEKLY;BYDAY=XX',
    'FREQ=WEEKLY;BYDAY=MO,MO',
    'FREQ=WEEKLY;FREQ=DAILY',
    'FREQ=WEEKLY;',
    '',
  ])('gecersiz kurali reddeder: %s', (metin) => {
    expect(tekrarKuraliCoz(metin).ok).toBe(false);
  });
});

describe('SeriOlusturGirdiSema', () => {
  const temel = {
    grup_id: crypto.randomUUID(),
    tekrar_kurali: 'FREQ=WEEKLY;BYDAY=MO',
    baslangic_tarihi: '2026-01-05',
    baslangic_saati: '16:00',
    sure_dk: 60,
  };

  it('bitis_tarihi ve adet birlikte verilemez', () => {
    const r = SeriOlusturGirdiSema.safeParse({ ...temel, bitis_tarihi: '2026-03-01', adet: 4 });
    expect(r.success).toBe(false);
    expect(SeriOlusturGirdiSema.safeParse({ ...temel, adet: 4 }).success).toBe(true);
  });

  it('gecersiz saat ve sure reddedilir', () => {
    expect(SeriOlusturGirdiSema.safeParse({ ...temel, baslangic_saati: '25:00' }).success).toBe(
      false,
    );
    expect(SeriOlusturGirdiSema.safeParse({ ...temel, sure_dk: 5 }).success).toBe(false);
  });
});
