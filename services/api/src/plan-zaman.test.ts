import { describe, expect, it } from 'vitest';

import {
  gunFarki,
  haftaBaslangici,
  haftaKilitliMi,
  haftaninGunu,
  pazartesiMi,
  planBugunu,
} from './modules/ogrenme/index.js';

describe('plan takvimi (Europe/Istanbul, Pazartesi haftasi)', () => {
  it('hafta Pazartesi baslar: Pazar onceki haftaya, Pazartesi kendi haftasina aittir', () => {
    expect(haftaninGunu('2030-01-07')).toBe(0);
    expect(haftaninGunu('2030-01-13')).toBe(6);
    expect(pazartesiMi('2030-01-07')).toBe(true);
    expect(pazartesiMi('2030-01-08')).toBe(false);
    expect(haftaBaslangici('2030-01-13')).toBe('2030-01-07');
    expect(haftaBaslangici('2030-01-14')).toBe('2030-01-14');
    expect(haftaBaslangici('2030-03-01')).toBe('2030-02-25'); // ay sinirini asar
    expect(gunFarki('2030-01-07', '2030-01-14')).toBe(7);
  });

  it('bugun Istanbul takvimiyle cozulur: UTC 21:00 Istanbul gece yarisidir', () => {
    // Istanbul kalici UTC+3 (2016 sonrasi): 20:59:59Z hala ayni gun, 21:00Z ertesi gun.
    expect(planBugunu(new Date('2030-03-10T20:59:59Z'))).toBe('2030-03-10');
    expect(planBugunu(new Date('2030-03-10T21:00:00Z'))).toBe('2030-03-11');
    // Yil sonu: UTC'de 31 Aralik 22:00, Istanbul'da 1 Ocak.
    expect(planBugunu(new Date('2030-12-31T22:00:00Z'))).toBe('2031-01-01');
  });

  it('saat dilimi veritabani kullanilir: 2015 yaz saati (UTC+3) ve kis saati (UTC+2)', () => {
    // Turkiye 2015'te hala yaz/kis saati uyguluyordu; sabit +3 varsayan bir hesap burada yanilir.
    expect(planBugunu(new Date('2015-12-01T21:30:00Z'))).toBe('2015-12-01'); // kis: +2 -> 23:30
    expect(planBugunu(new Date('2015-07-01T21:30:00Z'))).toBe('2015-07-02'); // yaz: +3 -> 00:30
  });

  it('Pazar gecesi (Istanbul) yeni haftaya sayilir', () => {
    // 2030-01-13 Pazar 23:30 Istanbul = 20:30Z; 22:30Z ise Pazartesi 01:30.
    expect(haftaBaslangici(planBugunu(new Date('2030-01-13T20:30:00Z')))).toBe('2030-01-07');
    expect(haftaBaslangici(planBugunu(new Date('2030-01-13T21:30:00Z')))).toBe('2030-01-14');
  });

  it('kilit: hafta sonu (Pazar) + 14 gun sonra baslar', () => {
    const hafta = '2030-01-07'; // Pazar 2030-01-13; son yazilabilir gun 2030-01-27
    expect(haftaKilitliMi(hafta, '2030-01-13')).toBe(false);
    expect(haftaKilitliMi(hafta, '2030-01-27')).toBe(false);
    expect(haftaKilitliMi(hafta, '2030-01-28')).toBe(true);
    expect(haftaKilitliMi(hafta, '2030-01-01')).toBe(false); // gelecek hafta kilitli degil
  });
});
