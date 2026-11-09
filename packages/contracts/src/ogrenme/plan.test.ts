import { describe, expect, it } from 'vitest';

import * as plan from './plan.js';

/** Kisisel veri ve serbest metin olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
const YASAK_ALANLAR = [
  'telefon',
  'telefon_e164',
  'eposta',
  'email',
  'gorunen_ad',
  'ad',
  'soyad',
  'ogrenci_ad',
  'baslik',
  'not',
  'aciklama',
  'belirtec',
];

describe('ogrenme plan olayi', () => {
  it('olay adi ve yukunde kisisel veri / serbest metin alani yok', () => {
    expect(plan.ogrenmePlanGoreviGuncellendiV1.subject).toBe(
      'evt.ogrenme.plan_gorevi.guncellendi.v1',
    );
    const alanlar = Object.keys(plan.ogrenmePlanGoreviGuncellendiV1.schema.shape.data.shape);
    expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    expect(alanlar).toEqual(
      expect.arrayContaining(['gorev_id', 'plan_id', 'ogrenci_id', 'onceki_durum', 'durum']),
    );
  });
});

describe('plan girdileri', () => {
  it('gorev: miktar >= 1, hedef turu soru|dakika', () => {
    const temel = { gun: '2030-01-07', brans_kodu: 'matematik', hedef_turu: 'soru' };
    expect(plan.GorevGirdiSema.safeParse({ ...temel, hedef_miktar: 0 }).success).toBe(false);
    expect(plan.GorevGirdiSema.safeParse({ ...temel, hedef_miktar: 20 }).success).toBe(true);
    expect(
      plan.GorevGirdiSema.safeParse({ ...temel, hedef_turu: 'sayfa', hedef_miktar: 5 }).success,
    ).toBe(false);
  });

  it('gerceklesen negatif olamaz, 0 gecerlidir', () => {
    expect(plan.GerceklesenGirdiSema.safeParse({ gerceklesen_miktar: -1 }).success).toBe(false);
    expect(plan.GerceklesenGirdiSema.safeParse({ gerceklesen_miktar: 0 }).success).toBe(true);
  });

  it('toplu plan: sablon_id ya da gorevler, ikisi birden degil', () => {
    const temel = { grup_id: crypto.randomUUID(), hafta_baslangic: '2030-01-07' };
    const gorev = { gun_sirasi: 0, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 10 };
    expect(plan.TopluPlanGirdiSema.safeParse(temel).success).toBe(false);
    expect(
      plan.TopluPlanGirdiSema.safeParse({ ...temel, sablon_id: crypto.randomUUID() }).success,
    ).toBe(true);
    expect(plan.TopluPlanGirdiSema.safeParse({ ...temel, gorevler: [gorev] }).success).toBe(true);
    expect(
      plan.TopluPlanGirdiSema.safeParse({
        ...temel,
        sablon_id: crypto.randomUUID(),
        gorevler: [gorev],
      }).success,
    ).toBe(false);
  });
});
