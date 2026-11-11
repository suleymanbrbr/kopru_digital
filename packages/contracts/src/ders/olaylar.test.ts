import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as olaylar from './olaylar.js';

/** Kisisel veri ve gizli icerik olay yukune giremez (CLAUDE.md, ADR 0002 kural 6). */
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
  'ogretmen_ad',
  'online_baglanti',
  'yer',
  'baslik',
  'not',
  'ders_notu',
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

describe('ders olaylari', () => {
  const tanimlar = (Object.values(olaylar) as unknown[]).filter(olayTanimiMi);

  it('olay tanimlari bulunuyor', () => {
    expect(tanimlar.map((t) => t.subject)).toEqual([
      'evt.ders.ders.degisti.v1',
      'evt.ders.yoklama.kaydedildi.v1',
      'evt.ders.geri_bildirim.verildi.v1',
      'evt.ders.kaynak.eklendi.v1',
      'evt.ders.kaynak.izlendi.v1',
      'evt.ders.kaynak.sorun_bildirildi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );

  it('ogrenci_idleri 200 ogeyle sinirli', () => {
    const veri = {
      ders_id: crypto.randomUUID(),
      degisim_turu: 'planlandi',
      seri_id: null,
      grup_id: crypto.randomUUID(),
      ogretmen_id: crypto.randomUUID(),
      brans_kodu: 'matematik',
      baslangic_at: '2026-01-05T07:00:00.000Z',
      bitis_at: '2026-01-05T08:00:00.000Z',
      onceki_baslangic_at: null,
      durum: 'planli',
      telafi: false,
      online: false,
      parca_no: 1,
      parca_sayisi: 1,
      iptal_nedeni: null,
      iptal_kaynagi: null,
      gec_iptal: false,
    };
    const sema = olaylar.dersDersDegistiV1.schema.shape.data;
    const uuidler = (n: number) => Array.from({ length: n }, () => crypto.randomUUID());
    expect(sema.safeParse({ ...veri, ogrenci_idleri: uuidler(200) }).success).toBe(true);
    expect(sema.safeParse({ ...veri, ogrenci_idleri: uuidler(201) }).success).toBe(false);
  });
});
