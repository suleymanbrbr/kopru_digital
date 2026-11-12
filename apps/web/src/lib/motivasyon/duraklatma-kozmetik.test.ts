import { describe, expect, it } from 'vitest';

import { aralikMetni, duraklatmaDogrula, gunSayisi } from './duraklatma';
import { kilitMetni, yuvayaGoreGrupla } from './kozmetik';

describe('duraklatmaDogrula', () => {
  const bugun = '2026-11-12';
  it('gecerli araligi kabul eder (31 gun dahil)', () => {
    expect(duraklatmaDogrula('2026-11-12', '2026-11-12', bugun)).toBeNull();
    expect(duraklatmaDogrula('2026-11-12', '2026-12-12', bugun)).toBeNull(); // 31 gun
  });
  it('32 gun, ters aralik, gecmis baslangic ve eksik tarihi reddeder', () => {
    expect(gunSayisi('2026-11-12', '2026-12-12')).toBe(31);
    expect(duraklatmaDogrula('2026-11-12', '2026-12-13', bugun)).toBe('uzun');
    expect(duraklatmaDogrula('2026-11-15', '2026-11-14', bugun)).toBe('bitis_once');
    expect(duraklatmaDogrula('2026-11-11', '2026-11-20', bugun)).toBe('gecmis');
    expect(duraklatmaDogrula('', '2026-11-20', bugun)).toBe('eksik');
  });
  it('aralik metni tek gunde tek tarih yazar', () => {
    expect(aralikMetni('2026-11-12', '2026-11-12')).toBe('12 Kasım 2026');
    expect(aralikMetni('2026-11-12', '2026-11-20')).toContain('–');
  });
});

describe('kilitMetni', () => {
  it('acilma kosulunu i18n ile uretir (seri, seviye, rozet)', () => {
    expect(kilitMetni({ seri: 14 })).toBe('14 günlük seriye ulaşınca açılır.');
    expect(kilitMetni({ seviye: 10 })).toBe("Seviye 10'e ulaşınca açılır.");
    expect(kilitMetni({ rozet: 'odev_bronz', rozet_adi: 'İlk Ödevler' })).toBe(
      '"İlk Ödevler" rozetini kazanınca açılır.',
    );
    expect(kilitMetni({ rozet: 'odev_bronz' })).toBe('Belirli bir rozeti kazanınca açılır.');
    expect(kilitMetni({})).toBe('Çalıştıkça açılır.');
  });
});

describe('yuvayaGoreGrupla', () => {
  it('yuva sirasiyla gruplar; sahip olunanlar once, bos yuvalar atilir', () => {
    const g = yuvayaGoreGrupla([
      { slot: 'gozluk', sahip: false, ad: 'B' },
      { slot: 'sapka', sahip: false, ad: 'Z' },
      { slot: 'sapka', sahip: true, ad: 'Taç' },
    ] as const);
    expect(g.map((x) => x.slot)).toEqual(['sapka', 'gozluk']);
    expect(g[0]?.ogeler.map((o) => o.ad)).toEqual(['Taç', 'Z']);
  });
});
