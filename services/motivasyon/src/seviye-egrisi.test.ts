import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { DUZENLI_OGRENCI, TOHUM_KURALLAR, haftalikXp, ilkGunXp } from './duzenli-ogrenci.js';
import { SEVIYE_SINIRI, seviyeEgrisi, seviyeHesapla } from './seviye-egrisi.js';
import { dbYok, testDb } from './test/yardimcilar.js';

const egri = seviyeEgrisi();
const gunlukXp = haftalikXp() / 7;
/** Duzenli ogrencinin `gun` gununde (surekli birikimle) ulastigi seviye. */
const seviyeGun = (gun: number) => seviyeHesapla(egri, Math.floor(gunlukXp * gun));

describe('seviye egrisi hedefleri (duzenli ogrenci modeli)', () => {
  it('varsayimlar: haftalik ~393 XP, gunluk ~56, ilk gun 75', () => {
    expect(haftalikXp()).toBe(393);
    expect(ilkGunXp()).toBe(75);
    expect(DUZENLI_OGRENCI.ders).toBe(3);
  });

  it('1..60, kesin artan, ilk seviye 0 XP', () => {
    expect(egri).toHaveLength(SEVIYE_SINIRI);
    expect(egri[0]).toEqual({ seviye: 1, gereken_toplam_xp: 0 });
    for (let i = 1; i < egri.length; i++) {
      expect(egri[i]?.gereken_toplam_xp).toBeGreaterThan(egri[i - 1]?.gereken_toplam_xp ?? 0);
    }
  });

  it('ilk gun seviye 3', () => {
    expect(seviyeHesapla(egri, ilkGunXp())).toBe(3);
  });

  it('ilk hafta ilk evrim (seviye 5)', () => {
    expect(seviyeGun(7)).toBeGreaterThanOrEqual(5);
    expect(seviyeGun(3)).toBeLessThan(5);
  });

  it('~2 ayda 3. asama (seviye 12)', () => {
    expect(seviyeGun(60)).toBeGreaterThanOrEqual(12);
    expect(seviyeGun(45)).toBeLessThan(12);
  });

  it('donem sonunda (~4,5 ay = 135 gun) 4. asama (seviye 25)', () => {
    expect(seviyeGun(135)).toBeGreaterThanOrEqual(25);
    expect(seviyeGun(110)).toBeLessThan(25);
  });

  it('efsane (seviye 40) bir yil duzenli calismayla; 9 ayda degil', () => {
    expect(seviyeGun(365)).toBeGreaterThanOrEqual(40);
    expect(seviyeGun(270)).toBeLessThan(40);
  });

  it('tohum kurallari migration ile ayni (hesap tohum degerlerine dayanir)', () => {
    expect(TOHUM_KURALLAR.genelTavan).toBe(300);
  });
});

describe.skipIf(dbYok())('seviye egrisi migration tohumu', () => {
  it('seviyeler tablosu fonksiyonla uretilen egriyle birebir ayni; kural tohumu model degerleriyle ayni', async () => {
    const urls = testDb();
    if (!urls) return;
    const sql = postgres(urls.sistemUrl, { max: 1, onnotice: () => undefined });
    try {
      const satirlar = await sql<{ seviye: number; gereken_toplam_xp: number }[]>`
        select seviye, gereken_toplam_xp::int from motivasyon.seviyeler order by seviye`;
      expect(satirlar.map((s) => ({ ...s }))).toEqual(egri);
      const kurallar = await sql<{ kod: string; xp: number }[]>`
        select kod, xp from motivasyon.xp_kurallari`;
      const xp = Object.fromEntries(kurallar.map((k) => [k.kod, k.xp]));
      expect(xp).toMatchObject({
        yoklama_geldi: TOHUM_KURALLAR.yoklama,
        geri_bildirim: TOHUM_KURALLAR.geriBildirim,
        odev_teslim: TOHUM_KURALLAR.odevTeslim,
        odev_onay: TOHUM_KURALLAR.odevOnay,
        plan_gorevi_tamam: TOHUM_KURALLAR.planGorevi,
        odak_oturumu: TOHUM_KURALLAR.odakDk,
        soru_sorma: TOHUM_KURALLAR.soruSorma,
        soru_anladim: TOHUM_KURALLAR.soruAnladim,
        kayit_izledi: TOHUM_KURALLAR.kayit,
        deneme_girisi: TOHUM_KURALLAR.denemeGirisi,
        deneme_net_artisi: TOHUM_KURALLAR.netBasina,
        haftanin_yildizi: 50,
      });
      const tavan = await sql<{ kod: string; gunluk_ust_sinir: number }[]>`
        select kod, gunluk_ust_sinir from motivasyon.xp_tavanlari`;
      expect(Object.fromEntries(tavan.map((t) => [t.kod, t.gunluk_ust_sinir]))).toEqual({
        genel: TOHUM_KURALLAR.genelTavan,
        plan: TOHUM_KURALLAR.planTavan,
        odak: TOHUM_KURALLAR.odakTavan,
        soru: TOHUM_KURALLAR.soruTavan,
        kayit: TOHUM_KURALLAR.kayitTavan,
      });
    } finally {
      await sql.end();
    }
  });
});
