import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as odev from './odev.js';

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
  'aciklama',
  'kaynak',
  'not',
  'ogrenci_notu',
  'inceleme_notu',
  'belirtec',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

const olayTanimiMi = (d: unknown): d is OlayTanimi =>
  typeof d === 'object' && d !== null && 'subject' in d && 'schema' in d;

describe('ogrenme odev olaylari', () => {
  const tanimlar = (Object.values(odev) as unknown[]).filter(olayTanimiMi);

  it('olay tanimlari bulunuyor', () => {
    expect(tanimlar.map((t) => t.subject).sort()).toEqual([
      'evt.ogrenme.odev.incelendi.v1',
      'evt.ogrenme.odev.teslim_edildi.v1',
      'evt.ogrenme.odev.yayinlandi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri ve serbest metin alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );

  it('yayinlandi: ogrenci_idleri 200 ogeyle sinirli', () => {
    const veri = {
      odev_id: crypto.randomUUID(),
      brans_kodu: 'matematik',
      son_teslim_at: null,
      veren_id: crypto.randomUUID(),
      hedef_turu: 'grup',
      hedef_id: crypto.randomUUID(),
      parca_no: 1,
      parca_sayisi: 1,
    };
    const sema = odev.ogrenmeOdevYayinlandiV1.schema.shape.data;
    const uuidler = (n: number) => Array.from({ length: n }, () => crypto.randomUUID());
    expect(sema.safeParse({ ...veri, ogrenci_idleri: uuidler(200) }).success).toBe(true);
    expect(sema.safeParse({ ...veri, ogrenci_idleri: uuidler(201) }).success).toBe(false);
  });

  it('teslim girdisi: sayilar negatif olamaz', () => {
    expect(odev.TeslimGirdiSema.safeParse({ yapilan_soru_sayisi: -1 }).success).toBe(false);
    expect(
      odev.TeslimGirdiSema.safeParse({ yapilan_soru_sayisi: 5, dogru_sayisi: 4 }).success,
    ).toBe(true);
  });
});
