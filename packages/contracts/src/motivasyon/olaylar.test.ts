import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as olaylar from './olaylar.js';

/** Kisisel veri ve gorunen adlar olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
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
  'karakter_adi',
  'rozet_adi',
  'kozmetik_adi',
  'baslik',
  'not',
  'belirtec',
  'parola',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

function olayTanimiMi(deger: unknown): deger is OlayTanimi {
  return typeof deger === 'object' && deger !== null && 'subject' in deger && 'schema' in deger;
}

const uuid = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';
const ortak = {
  kurumId: uuid,
  actor: { tur: 'sistem', id: 'motivasyon' } as const,
  correlationId: 'c',
};

describe('motivasyon olaylari', () => {
  const tanimlar = (Object.values(olaylar) as unknown[]).filter(olayTanimiMi);

  it('alti olay tanimli', () => {
    expect(tanimlar.map((t) => t.subject).sort()).toEqual([
      'evt.motivasyon.karakter.evrildi.v1',
      'evt.motivasyon.rozet.kazanildi.v1',
      'evt.motivasyon.seri.bozuldu.v1',
      'evt.motivasyon.seri.kilometre_tasi.v1',
      'evt.motivasyon.seri.risk.v1',
      'evt.motivasyon.seviye.atladi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );

  it('yukler olaylar.md ile ayni alanlari tasir', () => {
    const alanlar = (t: { schema: z.ZodObject<{ data: z.ZodObject }> }) =>
      Object.keys(t.schema.shape.data.shape);
    expect(alanlar(olaylar.motivasyonSeviyeAtladiV1)).toEqual([
      'ogrenci_id',
      'eski_seviye',
      'yeni_seviye',
      'toplam_xp',
    ]);
    expect(alanlar(olaylar.motivasyonRozetKazanildiV1)).toEqual([
      'ogrenci_id',
      'rozet_kodu',
      'kazanildi_at',
    ]);
    expect(alanlar(olaylar.motivasyonKarakterEvrildiV1)).toEqual([
      'ogrenci_id',
      'tur_kodu',
      'eski_asama',
      'yeni_asama',
    ]);
    expect(alanlar(olaylar.motivasyonSeriBozuldiV1)).toEqual([
      'ogrenci_id',
      'onceki_seri',
      'onarilabilir',
      'onarim_son_gun',
    ]);
    expect(alanlar(olaylar.motivasyonSeriKilometreTasiV1)).toEqual(['ogrenci_id', 'seri']);
    expect(alanlar(olaylar.motivasyonSeriRiskV1)).toEqual([
      'ogrenci_id',
      'mevcut_seri',
      'gun_bitis_at',
      'dondurma_stogu',
    ]);
  });

  it('olaylar olusturulur ve dogrulanir', () => {
    const olay = olaylar.motivasyonSeviyeAtladiV1.create({
      ...ortak,
      data: { ogrenci_id: uuid, eski_seviye: 2, yeni_seviye: 3, toplam_xp: 60 },
    });
    expect(olaylar.motivasyonSeviyeAtladiV1.parse(olay).data.yeni_seviye).toBe(3);
    expect(
      olaylar.motivasyonSeriRiskV1.create({
        ...ortak,
        data: {
          ogrenci_id: uuid,
          mevcut_seri: 5,
          gun_bitis_at: '2026-11-13T01:00:00.000Z',
          dondurma_stogu: 1,
        },
      }).type,
    ).toBe('motivasyon.seri.risk');
  });

  it('gecersiz yukler reddedilir', () => {
    expect(
      olaylar.motivasyonSeviyeAtladiV1.schema.shape.data.safeParse({
        ogrenci_id: uuid,
        eski_seviye: 1,
        yeni_seviye: 1,
        toplam_xp: 10,
      }).success,
    ).toBe(false);
    expect(
      olaylar.motivasyonKarakterEvrildiV1.schema.shape.data.safeParse({
        ogrenci_id: uuid,
        tur_kodu: 'kivilcim',
        eski_asama: 1,
        yeni_asama: 6,
      }).success,
    ).toBe(false);
    expect(
      olaylar.motivasyonSeriRiskV1.schema.shape.data.safeParse({
        ogrenci_id: uuid,
        mevcut_seri: 2,
        gun_bitis_at: '2026-11-13T01:00:00.000Z',
        dondurma_stogu: 0,
      }).success,
    ).toBe(false);
  });
});
