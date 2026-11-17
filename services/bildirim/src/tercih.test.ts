import { BILDIRIM_KANALLARI, BILDIRIM_KATEGORILERI } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  VARSAYILAN_AYARLAR,
  kanalAcikMi,
  kilitliMi,
  sessizSaatKarari,
  tercihMatrisi,
  varsayilanAcik,
  yerelParcalar,
  yerelden,
} from './tercih.js';

describe('varsayilan kanal matrisi (docs/schema/bildirim.md)', () => {
  it('kutu ve push her kategoride acik, sms kapali, eposta yalniz abonelik ve sistemde acik', () => {
    for (const k of BILDIRIM_KATEGORILERI) {
      expect(varsayilanAcik(k, 'kutu'), `${k}/kutu`).toBe(true);
      expect(varsayilanAcik(k, 'push'), `${k}/push`).toBe(true);
      expect(varsayilanAcik(k, 'eposta'), `${k}/eposta`).toBe(k === 'abonelik' || k === 'sistem');
      expect(varsayilanAcik(k, 'sms'), `${k}/sms`).toBe(k === 'sistem');
    }
  });

  it('sistem kategorisi ve kutu kanali kilitli; kaydedilmis tercih kilitliyi ezmez', () => {
    expect(kilitliMi('sistem', 'push')).toBe(true);
    expect(kilitliMi('odev', 'kutu')).toBe(true);
    expect(kilitliMi('odev', 'push')).toBe(false);
    const kayit = new Map([
      ['sistem|push', false],
      ['odev|kutu', false],
      ['odev|push', false],
    ]);
    expect(kanalAcikMi(kayit, 'sistem', 'push')).toBe(true);
    expect(kanalAcikMi(kayit, 'odev', 'kutu')).toBe(true);
    expect(kanalAcikMi(kayit, 'odev', 'push')).toBe(false);
    expect(kanalAcikMi(kayit, 'soru', 'push')).toBe(true);
  });

  it('matris 10 kategori x 4 kanal verir ve kilitli hucreleri isaretler', () => {
    const m = tercihMatrisi(new Map([['odev|push', false]]));
    expect(m).toHaveLength(BILDIRIM_KATEGORILERI.length * BILDIRIM_KANALLARI.length);
    expect(m.find((h) => h.kategori === 'odev' && h.kanal === 'push')).toEqual({
      kategori: 'odev',
      kanal: 'push',
      acik: false,
      kilitli: false,
    });
    expect(m.filter((h) => h.kilitli).length).toBe(4 + 9);
  });
});

describe('saat dilimi yardimcilari', () => {
  it('Istanbul yerel parcalari ve yerelden() ters cevrimi', () => {
    const p = yerelParcalar(new Date('2026-11-10T20:30:00Z'), 'Europe/Istanbul');
    expect(p).toMatchObject({ yil: 2026, ay: 11, gun: 10, saat: 23, dakika: 30, haftaGunu: 2 });
    expect(yerelden(2026, 11, 11, 8 * 60, 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-11T05:00:00.000Z',
    );
    // Ay sonu tasmasi
    expect(yerelden(2026, 11, 31, 0, 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-30T21:00:00.000Z',
    );
  });

  it('DST olan dilimde duvar saati dogru cevrilir (Berlin yaz/kis)', () => {
    expect(yerelden(2026, 7, 1, 8 * 60, 'Europe/Berlin').toISOString()).toBe(
      '2026-07-01T06:00:00.000Z',
    );
    expect(yerelden(2026, 12, 1, 8 * 60, 'Europe/Berlin').toISOString()).toBe(
      '2026-12-01T07:00:00.000Z',
    );
  });
});

describe('sessizSaatKarari (varsayilan 22:00-08:00, Europe/Istanbul)', () => {
  const ayar = VARSAYILAN_AYARLAR;
  // 10 Kasim 2026 Sali. Istanbul = UTC+3.
  const an = (yerelSaat: string, gun = 10) =>
    new Date(`2026-11-${String(gun).padStart(2, '0')}T${yerelSaat}:00+03:00`);

  it('gunduz sessiz degil', () => {
    expect(sessizSaatKarari(an('12:00'), ayar)).toEqual({ sessiz: false });
    expect(sessizSaatKarari(an('08:00'), ayar)).toEqual({ sessiz: false });
    expect(sessizSaatKarari(an('21:59'), ayar)).toEqual({ sessiz: false });
  });

  it('aksam 22:00 ve sonrasi ertesi gun 08:00e kadar sessiz', () => {
    const r = sessizSaatKarari(an('23:30'), ayar);
    expect(r).toEqual({ sessiz: true, bitisAt: an('08:00', 11) });
    expect(sessizSaatKarari(an('22:00'), ayar)).toEqual({ sessiz: true, bitisAt: an('08:00', 11) });
  });

  it('gece yarisindan sonra ayni gun 08:00e kadar sessiz', () => {
    expect(sessizSaatKarari(an('03:15'), ayar)).toEqual({ sessiz: true, bitisAt: an('08:00') });
    expect(sessizSaatKarari(an('07:59'), ayar)).toEqual({ sessiz: true, bitisAt: an('08:00') });
  });

  it('ay sonu gece yarisi asimi: 30 Kasim 23:00 -> 1 Aralik 08:00', () => {
    const r = sessizSaatKarari(new Date('2026-11-30T23:00:00+03:00'), ayar);
    expect(r).toEqual({ sessiz: true, bitisAt: new Date('2026-12-01T08:00:00+03:00') });
  });

  it('ayni gun icindeki aralik (13:00-15:00)', () => {
    const a = { ...ayar, sessiz_baslangic: '13:00', sessiz_bitis: '15:00' };
    expect(sessizSaatKarari(an('12:59'), a)).toEqual({ sessiz: false });
    expect(sessizSaatKarari(an('14:00'), a)).toEqual({ sessiz: true, bitisAt: an('15:00') });
    expect(sessizSaatKarari(an('15:00'), a)).toEqual({ sessiz: false });
  });

  it('sessiz_gunler araligin BASLADIGI gunu belirtir (Pazartesi=1)', () => {
    // Yalniz Sali (2) baslangicli aralik: Sali 23:00 sessiz, Carsamba 03:00 (baslangic Sali) sessiz,
    // Sali 03:00 (baslangic Pazartesi) sessiz degil.
    const a = { ...ayar, sessiz_gunler: [2] };
    expect(sessizSaatKarari(an('23:00', 10), a).sessiz).toBe(true);
    expect(sessizSaatKarari(an('03:00', 11), a).sessiz).toBe(true);
    expect(sessizSaatKarari(an('03:00', 10), a).sessiz).toBe(false);
    expect(sessizSaatKarari(an('23:00', 11), a).sessiz).toBe(false);
  });

  it('bos gun listesi ya da esit baslangic/bitis sessiz saati kapatir', () => {
    expect(sessizSaatKarari(an('23:30'), { ...ayar, sessiz_gunler: [] })).toEqual({
      sessiz: false,
    });
    expect(
      sessizSaatKarari(an('23:30'), { ...ayar, sessiz_baslangic: '22:00', sessiz_bitis: '22:00' }),
    ).toEqual({ sessiz: false });
  });

  it('kullanicinin saat dilimi kullanilir (Berlin 23:30 yerel)', () => {
    const a = { ...ayar, saat_dilimi: 'Europe/Berlin' };
    // 22:30Z = 23:30 Berlin (kis saati, UTC+1)
    const r = sessizSaatKarari(new Date('2026-11-10T22:30:00Z'), a);
    expect(r).toEqual({ sessiz: true, bitisAt: new Date('2026-11-11T07:00:00Z') });
  });
});
