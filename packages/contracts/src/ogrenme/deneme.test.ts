import { describe, expect, it } from 'vitest';

import * as deneme from './deneme.js';

/** Kisisel veri ve serbest metin olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
const YASAK_ALANLAR = [
  'telefon',
  'telefon_e164',
  'eposta',
  'email',
  'gorunen_ad',
  'ad',
  'soyad',
  'ad_soyad',
  'ogrenci_ad',
  'baslik',
  'yayinevi',
  'not',
  'not_metni',
  'red_nedeni',
  'aciklama',
  'belirtec',
];

describe('ogrenme deneme olayi', () => {
  const sema = deneme.ogrenmeDenemeGirildiV1.schema.shape.data;

  it('olay konusu ve alanlari dokumanla ayni', () => {
    expect(deneme.ogrenmeDenemeGirildiV1.subject).toBe('evt.ogrenme.deneme.girildi.v1');
    expect(Object.keys(sema.shape).sort()).toEqual([
      'deneme_id',
      'kural_kodu',
      'ogrenci_id',
      'sinav_tarihi',
      'toplam_net',
    ]);
  });

  it('yukte kisisel veri ve serbest metin alani yok', () => {
    expect(Object.keys(sema.shape).filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
  });

  it('toplam_net sayi, sinav_tarihi gun biciminde', () => {
    const veri = {
      deneme_id: crypto.randomUUID(),
      ogrenci_id: crypto.randomUUID(),
      kural_kodu: 'tyt',
      sinav_tarihi: '2026-03-01',
      toplam_net: 39,
    };
    expect(sema.safeParse(veri).success).toBe(true);
    expect(sema.safeParse({ ...veri, toplam_net: '39.00' }).success).toBe(false);
    expect(sema.safeParse({ ...veri, sinav_tarihi: '01.03.2026' }).success).toBe(false);
  });
});

describe('deneme girdileri', () => {
  const bolumler = [{ bolum_kodu: 'turkce', dogru: 10, yanlis: 2 }];
  const temel = { ad: 'D1', sinav_tarihi: '2026-03-01', bolumler };

  it('kural_id ya da kural_kodu gerekli', () => {
    expect(deneme.DenemeOlusturGirdiSema.safeParse(temel).success).toBe(false);
    expect(deneme.DenemeOlusturGirdiSema.safeParse({ ...temel, kural_kodu: 'tyt' }).success).toBe(
      true,
    );
  });

  it('bolum kodlari tekil olmali; sayilar negatif olamaz', () => {
    expect(
      deneme.DenemeOlusturGirdiSema.safeParse({
        ...temel,
        kural_kodu: 'tyt',
        bolumler: [...bolumler, ...bolumler],
      }).success,
    ).toBe(false);
    expect(
      deneme.DenemeOlusturGirdiSema.safeParse({
        ...temel,
        kural_kodu: 'tyt',
        bolumler: [{ bolum_kodu: 'turkce', dogru: -1, yanlis: 0 }],
      }).success,
    ).toBe(false);
  });

  it('kurum kurali kodu `ozel_` ile baslamali; katsayi 0..1', () => {
    const kural = {
      kod: 'ozel_a',
      ad: 'A',
      yanlis_katsayisi: 0.25,
      bolumler: [{ bolum_kodu: 'a', brans_kodu: 'matematik', ad: 'A', soru_sayisi: 10 }],
    };
    expect(deneme.DenemeKuraliOlusturGirdiSema.safeParse(kural).success).toBe(true);
    expect(deneme.DenemeKuraliOlusturGirdiSema.safeParse({ ...kural, kod: 'tyt' }).success).toBe(
      false,
    );
    expect(
      deneme.DenemeKuraliOlusturGirdiSema.safeParse({ ...kural, yanlis_katsayisi: 1.5 }).success,
    ).toBe(false);
  });
});
