import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as medya from '../medya/olaylar.js';
import * as dosya from './dosya.js';

/** Kisisel veri, gizli icerik ve depolama ayrintisi olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
const YASAK_ALANLAR = [
  'telefon',
  'telefon_e164',
  'eposta',
  'email',
  'gorunen_ad',
  'ad_soyad',
  'ad',
  'dosya_adi',
  'ozgun_ad',
  'belirtec',
  'kod',
  'parola',
  'depolama_anahtari',
  'anahtar',
  'url',
  'adres',
  'sha256',
  'konum',
  'exif',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

function olayTanimiMi(deger: unknown): deger is OlayTanimi {
  return typeof deger === 'object' && deger !== null && 'subject' in deger && 'schema' in deger;
}

const tanimlar = ([...Object.values(dosya), ...Object.values(medya)] as unknown[]).filter(
  olayTanimiMi,
);
const uuid = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';
const ortak = {
  kurumId: uuid,
  actor: { tur: 'sistem', id: 'test' } as const,
  correlationId: 'c',
};

describe('dosya olaylari', () => {
  it('bes olay tanimli', () => {
    expect(tanimlar.map((t) => t.subject).sort()).toEqual([
      'evt.medya.dosya.hazir.v1',
      'evt.medya.dosya.islenemedi.v1',
      'evt.medya.dosya.silindi.v1',
      'evt.ortak.dosya.baglandi.v1',
      'evt.ortak.dosya.birakildi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri ya da depolama alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );

  it('tur ve bagli_tur tek kaynaktan: olaylar ayni sema nesnesini kullanir', () => {
    expect(dosya.medyaDosyaTuruSema.options).toEqual([...dosya.MEDYA_DOSYA_TURLERI]);
    expect(dosya.ortakDosyaBaglandiV1.schema.shape.data.shape.bagli_tur).toBe(
      dosya.medyaBagliTurSema,
    );
    expect(dosya.ortakDosyaBirakildiV1.schema.shape.data.shape.bagli_tur).toBe(
      dosya.medyaBagliTurSema,
    );
    expect(medya.medyaDosyaHazirV1.schema.shape.data.shape.tur).toBe(dosya.medyaDosyaTuruSema);
    expect(medya.medyaDosyaIslenemediV1.schema.shape.data.shape.tur).toBe(dosya.medyaDosyaTuruSema);
    expect(medya.medyaDosyaSilindiV1.schema.shape.data.shape.tur).toBe(dosya.medyaDosyaTuruSema);
  });

  it('medya.dosya.hazir ortak.medya_dosya_kopyalari alanlarini tasir', () => {
    expect(Object.keys(medya.medyaDosyaHazirV1.schema.shape.data.shape).sort()).toEqual(
      [
        'dosya_id',
        'sahip_kullanici_id',
        'sahip_uyelik_id',
        'tur',
        'mime_tipi',
        'boyut_bayt',
        'genislik',
        'yukseklik',
        'sure_sn',
        'kucuk_resim_var',
      ].sort(),
    );
  });

  it('gecerli yukler olusturulur, bilinmeyen tur ve bagli_tur reddedilir', () => {
    const hazir = medya.medyaDosyaHazirV1.create({
      ...ortak,
      data: {
        dosya_id: uuid,
        sahip_kullanici_id: uuid,
        sahip_uyelik_id: uuid,
        tur: 'soru_fotografi',
        mime_tipi: 'image/jpeg',
        boyut_bayt: 1234,
        genislik: 800,
        yukseklik: 600,
        sure_sn: null,
        kucuk_resim_var: true,
      },
    });
    expect(hazir.version).toBe(1);
    expect(() =>
      medya.medyaDosyaHazirV1.create({
        ...ortak,
        data: { ...hazir.data, tur: 'bilinmeyen' as never },
      }),
    ).toThrow();
    expect(() =>
      dosya.ortakDosyaBaglandiV1.create({
        ...ortak,
        data: { dosya_id: uuid, bagli_tur: 'yok' as never, bagli_id: uuid },
      }),
    ).toThrow();
    expect(
      dosya.ortakDosyaBirakildiV1.create({
        ...ortak,
        data: { dosya_id: uuid, bagli_tur: 'kullanici', bagli_id: uuid, hemen_sil: true },
      }).version,
    ).toBe(1);
  });
});
