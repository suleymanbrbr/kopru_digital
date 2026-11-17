import { describe, expect, it } from 'vitest';

import { seviyeIlerlemesi, xpFarki, xpOlasiMi, yuzde } from './xp';

const an = (toplam_xp: number, seviye: number, asama?: number) => ({
  toplam_xp,
  seviye,
  ...(asama === undefined ? {} : { karakter: { asama } }),
});

describe('xpFarki', () => {
  it('onceki durum yoksa ya da fark yoksa null doner', () => {
    expect(xpFarki(undefined, an(100, 3))).toBeNull();
    expect(xpFarki(an(100, 3), an(100, 3))).toBeNull();
  });

  it('kazanilan XP farkini verir', () => {
    expect(xpFarki(an(100, 3), an(115, 3))).toEqual({
      xp: 15,
      seviyeAtladi: false,
      yeniSeviye: 3,
      evrim: false,
      yeniAsama: null,
    });
  });

  it('seviye atlamayi ve evrimi (asama artisi) bildirir', () => {
    const f = xpFarki(an(375, 4, 1), an(385, 5, 2));
    expect(f).toMatchObject({
      xp: 10,
      seviyeAtladi: true,
      yeniSeviye: 5,
      evrim: true,
      yeniAsama: 2,
    });
  });

  it('ters kayit (XP azalmasi) kutlama uretmez', () => {
    expect(xpFarki(an(120, 3), an(100, 3))).toBeNull();
  });

  it('XP ayni kalsa da seviye artmissa farki doner (xp 0)', () => {
    expect(xpFarki(an(100, 3), an(100, 4))).toMatchObject({ xp: 0, seviyeAtladi: true });
  });
});

describe('seviyeIlerlemesi', () => {
  it('yuzde ve kalan XP hesaplar', () => {
    expect(
      seviyeIlerlemesi({
        toplam_xp: 1700,
        seviye_baslangic_xp: 1480,
        sonraki_seviye_xp: 1910,
        sonraki_seviyeye_kalan: 210,
      }),
    ).toEqual({ yuzde: 51, kalan: 210, tamam: false });
  });

  it('son seviyede tamam ve yuzde 100', () => {
    expect(
      seviyeIlerlemesi({
        toplam_xp: 57_300,
        seviye_baslangic_xp: 57_210,
        sonraki_seviye_xp: null,
        sonraki_seviyeye_kalan: null,
      }),
    ).toEqual({ yuzde: 100, kalan: null, tamam: true });
  });

  it('yuzde 0-100 araligina sikistirilir', () => {
    expect(yuzde(5, 0)).toBe(0);
    expect(yuzde(30, 20)).toBe(100);
    expect(yuzde(-3, 20)).toBe(0);
  });
});

describe('xpOlasiMi', () => {
  const k = 'kurumlar/k1';
  it('XP kazandiran ogrenci eylemlerini taniyor', () => {
    expect(xpOlasiMi('ogrenme', 'PUT', `${k}/gorevler/g1/gerceklesen`)).toBe(true);
    expect(xpOlasiMi('ogrenme', 'POST', `${k}/ogrenci-odevleri/o1/teslim`)).toBe(true);
    expect(xpOlasiMi('ogrenme', 'POST', `${k}/sorular`)).toBe(true);
    expect(xpOlasiMi('ogrenme', 'POST', `${k}/sorular/s1/anladim`)).toBe(true);
    expect(xpOlasiMi('ders', 'PUT', `${k}/dersler/d1/geri-bildirim`)).toBe(true);
    expect(xpOlasiMi('ders', 'POST', `${k}/kayitlarim/r1/izledim`)).toBe(true);
    expect(xpOlasiMi('motivasyon', 'POST', `${k}/odak-oturumlari/i1/bitir`)).toBe(true);
  });

  it('okuma, baska servis ve ilgisiz yazimlari tanimiyor', () => {
    expect(xpOlasiMi('ogrenme', 'GET', `${k}/sorular`)).toBe(false);
    expect(xpOlasiMi('ogrenme', 'POST', `${k}/sorular/s1/takip`)).toBe(false);
    expect(xpOlasiMi('hesap', 'POST', `${k}/sorular`)).toBe(false);
    expect(xpOlasiMi('motivasyon', 'POST', `${k}/odak-oturumlari`)).toBe(false);
    expect(xpOlasiMi('ogrenme', 'POST', `${k}/odevler/o1/yayinla`)).toBe(false);
  });
});
