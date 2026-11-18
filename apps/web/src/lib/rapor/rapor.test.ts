import type { DersRaporOzetSema, HesapRaporOzetSema, OgrenmeRaporOzetSema } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { satirlariBirlestir, sureYaz, yuzdeYaz } from './model';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const taban = {
  donem_gun: 7,
  baslangic: '2026-11-11',
  bitis: '2026-11-17',
  kapsam: 'kurum',
} as const;

const hesap: z.infer<typeof HesapRaporOzetSema> = {
  ...taban,
  kurum: { aktif_ogrenci: 30, grup_sayisi: 2, ogretmen_sayisi: 1 },
  gruplar: [
    { grup_id: G1, ad: 'Grup A', tur: 'grup', aktif_ogrenci: 20 },
    { grup_id: G2, ad: 'Grup B', tur: 'sinif', aktif_ogrenci: 10 },
  ],
  ogretmenler: [{ ogretmen_id: T1, gorunen_ad: 'Burcu Tekin', grup_sayisi: 2, aktif_ogrenci: 30 }],
};
const oran = (pay: number, payda: number) => ({ pay, payda, oran: pay / payda });
const ders: z.infer<typeof DersRaporOzetSema> = {
  ...taban,
  kurum: { devam: oran(9, 10), anladim: oran(1, 2) },
  gruplar: [{ grup_id: G1, devam: oran(9, 10), anladim: oran(1, 2) }],
  ogretmenler: [{ ogretmen_id: T1, devam: oran(9, 10), anladim: oran(1, 2) }],
};
const ogrenme: z.infer<typeof OgrenmeRaporOzetSema> = {
  ...taban,
  kurum: {
    odev: null,
    plan: oran(3, 4),
    soru: {
      soru_sayisi: 3,
      cevaplanan: 2,
      ortalama_ilk_cevap_sn: 1200,
      medyan_ilk_cevap_sn: 1100,
    },
    etkin_ogrenci: 25,
  },
  gruplar: [
    {
      grup_id: G1,
      odev: null,
      plan: oran(3, 4),
      soru: {
        soru_sayisi: 3,
        cevaplanan: 2,
        ortalama_ilk_cevap_sn: 1200,
        medyan_ilk_cevap_sn: 1100,
      },
      etkin_ogrenci: 18,
    },
  ],
  ogretmenler: [],
};

describe('panel modeli', () => {
  it('uc modulun yanitini grup ve ogretmen satirlarinda birlestirir', () => {
    const v = satirlariBirlestir(hesap, ders, ogrenme);
    expect(v.etkinOgrenci).toBe(25);
    const a = v.gruplar.find((g) => g.id === G1);
    expect(a).toMatchObject({ ad: 'Grup A', aktifOgrenci: 20, etkinOgrenci: 18 });
    expect(a?.devam).toEqual(oran(9, 10));
    expect(a?.plan).toEqual(oran(3, 4));
    expect(v.ogretmenler[0]).toMatchObject({ ad: 'Burcu Tekin', grupSayisi: 2 });
  });

  it('kapali modul null kalir; verisi olmayan satir 0 / 0 olur', () => {
    const v = satirlariBirlestir(hesap, ders, ogrenme);
    expect(v.kurum.odev).toBeNull();
    const b = v.gruplar.find((g) => g.id === G2);
    expect(b?.odev).toBeNull();
    expect(b?.devam).toEqual({ pay: 0, payda: 0, oran: null });
    expect(b?.soru).toMatchObject({ soru_sayisi: 0, ortalama_ilk_cevap_sn: null });
    expect(b?.etkinOgrenci).toBe(0);
  });

  it('yaniti gelmeyen modulun gostergeleri undefined (yukleniyor / hata) kalir', () => {
    const v = satirlariBirlestir(hesap, undefined, ogrenme);
    expect(v.kurum.devam).toBeUndefined();
    expect(v.gruplar[0]?.devam).toBeUndefined();
    expect(v.gruplar[0]?.plan).toEqual(oran(3, 4));
    const sadece = satirlariBirlestir(hesap);
    expect(sadece.etkinOgrenci).toBeUndefined();
    expect(sadece.gruplar[0]?.etkinOgrenci).toBeUndefined();
    expect(sadece.gruplar[0]?.soru).toBeUndefined();
  });
});

describe('gosterim yardimcilari', () => {
  it('yuzde yazar, veri yoksa uzun tire', () => {
    expect(yuzdeYaz(0.857)).toBe('%86');
    expect(yuzdeYaz(0)).toBe('%0');
    expect(yuzdeYaz(null)).toBe('—');
    expect(yuzdeYaz(undefined)).toBe('—');
  });

  it('sureyi saniye, dakika ve saat olarak yazar', () => {
    expect(sureYaz(45)).toBe('45 sn');
    expect(sureYaz(1260)).toBe('21 dk');
    expect(sureYaz(3900)).toBe('1 sa 5 dk');
    expect(sureYaz(null)).toBe('—');
  });
});
