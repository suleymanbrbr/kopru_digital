import { describe, expect, it } from 'vitest';

import {
  alanHataHaritasi,
  degisiklikleriBul,
  degisiklikSayisi,
  formaCevir,
  kuralAdi,
} from './motivasyon';
import type { AyarDegerleri } from './tipler';

const DEGERLER: AyarDegerleri = {
  kurallar: {
    yoklama_geldi: { xp: 20, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    deneme_net_artisi: { xp: 5, olay_basi_ust_sinir: 50, gec_carpani: 1, aktif: true },
  },
  tavanlar: { genel: 300, plan: 40 },
};

describe('degisiklikleriBul', () => {
  it('değişmeyen formda değişiklik yoktur', () => {
    const d = degisiklikleriBul(formaCevir(DEGERLER), DEGERLER);
    expect(degisiklikSayisi(d)).toBe(0);
    expect(d.gecersiz).toEqual([]);
  });

  it('yalnız değişen alanları döndürür', () => {
    const form = formaCevir(DEGERLER);
    form.kurallar.yoklama_geldi = { xp: '5', olay: '', carpan: '1', aktif: false };
    form.kurallar.deneme_net_artisi = { xp: '5', olay: '', carpan: '1', aktif: true };
    form.tavanlar.genel = '250';
    const d = degisiklikleriBul(form, DEGERLER);
    expect(d.kurallar).toEqual({
      yoklama_geldi: { xp: 5, aktif: false },
      // Olay başı sınır boşaltıldı: null.
      deneme_net_artisi: { olay_basi_ust_sinir: null },
    });
    expect(d.tavanlar).toEqual({ genel: 250 });
    expect(degisiklikSayisi(d)).toBe(4);
  });

  it('virgüllü ondalığı kabul eder, sayı olmayanı geçersiz işaretler', () => {
    const form = formaCevir(DEGERLER);
    form.kurallar.yoklama_geldi = { xp: 'abc', olay: '', carpan: '0,5', aktif: true };
    const d = degisiklikleriBul(form, DEGERLER);
    expect(d.gecersiz).toEqual(['kurallar.yoklama_geldi.xp']);
    expect(d.kurallar.yoklama_geldi).toEqual({ gec_carpani: 0.5 });
  });

  it('boş sayı alanı geçersizdir', () => {
    const form = formaCevir(DEGERLER);
    form.tavanlar.plan = '';
    expect(degisiklikleriBul(form, DEGERLER).gecersiz).toEqual(['tavanlar.plan']);
  });
});

describe('yardımcılar', () => {
  it('alanHataHaritasi: aynı alandaki mesajları birleştirir', () => {
    expect(
      alanHataHaritasi([
        { alan: 'tavanlar.genel', mesaj: 'a' },
        { alan: 'tavanlar.genel', mesaj: 'b' },
        { alan: 'kurallar.x.xp', mesaj: 'c' },
      ]),
    ).toEqual({ 'tavanlar.genel': 'a b', 'kurallar.x.xp': 'c' });
  });

  it('kuralAdi: bilinen kod Türkçe, bilinmeyen kod okunur hale gelir', () => {
    expect(kuralAdi('yoklama_geldi')).toBe('Yoklamada geldi');
    expect(kuralAdi('yeni_kural')).toBe('Yeni kural');
  });
});
