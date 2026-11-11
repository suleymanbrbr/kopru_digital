import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as soru from './soru.js';

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
  'ogrenci_adi',
  'yazar_adi',
  'baslik',
  'metin',
  'metin_onizleme',
  'aciklama',
  'not',
  'kapatma_notu',
  'cizim_verisi',
  'belirtec',
];

interface OlayTanimi {
  subject: string;
  schema: z.ZodObject<{ data: z.ZodObject }>;
}

const olayTanimiMi = (d: unknown): d is OlayTanimi =>
  typeof d === 'object' && d !== null && 'subject' in d && 'schema' in d;

describe('ogrenme soru olaylari', () => {
  const tanimlar = (Object.values(soru) as unknown[]).filter(olayTanimiMi);

  it('olay tanimlari bulunuyor', () => {
    expect(tanimlar.map((t) => t.subject).sort()).toEqual([
      'evt.ogrenme.soru.cozuldu.v1',
      'evt.ogrenme.soru.sorildi.v1',
      'evt.ogrenme.soru.yeniden_acildi.v1',
      'evt.ogrenme.soru_mesaji.eklendi.v1',
    ]);
  });

  it.each(tanimlar.map((t) => [t.subject, t] as const))(
    '%s yukunde kisisel veri ve serbest metin alani yok',
    (_konu, tanim) => {
      const alanlar = Object.keys(tanim.schema.shape.data.shape);
      expect(alanlar.filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
    },
  );

  it('cozuldu: silinecek_at ve dosya_idleri zorunlu, mesaj turu yalniz cevap/takip', () => {
    const baz = { soru_id: crypto.randomUUID(), ogrenci_id: crypto.randomUUID() };
    expect(
      soru.ogrenmeSoruCozulduV1.schema.shape.data.safeParse({
        ...baz,
        brans_kodu: 'matematik',
        cozuldu_at: '2026-11-11T10:00:00Z',
        dosya_idleri: [],
        silinecek_at: '2026-12-11T10:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      soru.ogrenmeSoruCozulduV1.schema.shape.data.safeParse({
        ...baz,
        brans_kodu: 'matematik',
        cozuldu_at: '2026-11-11T10:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      soru.ogrenmeSoruMesajiEklendiV1.schema.shape.data.safeParse({
        ...baz,
        mesaj_id: crypto.randomUUID(),
        tur: 'soru',
        yazar_id: crypto.randomUUID(),
        alici_idleri: [],
      }).success,
    ).toBe(false);
  });
});

describe('soru girdi sozlesmeleri', () => {
  const id = () => crypto.randomUUID();

  it('soru olusturma: 1-3 fotograf, metin 4000 ile sinirli', () => {
    const baz = { brans_kodu: 'matematik' };
    expect(soru.SoruOlusturGirdiSema.safeParse({ ...baz, fotograflar: [] }).success).toBe(false);
    expect(
      soru.SoruOlusturGirdiSema.safeParse({ ...baz, fotograflar: [id(), id(), id(), id()] })
        .success,
    ).toBe(false);
    expect(soru.SoruOlusturGirdiSema.safeParse({ ...baz, fotograflar: [id()] }).success).toBe(true);
    expect(
      soru.SoruOlusturGirdiSema.safeParse({
        ...baz,
        fotograflar: [id()],
        metin: 'a'.repeat(4001),
      }).success,
    ).toBe(false);
  });

  it('cevap: en cok 4 ek, ses 180 sn ustu reddedilir, cizimli fotograf kaynak ister', () => {
    const foto = { tur: 'fotograf', medya_dosya_id: id() };
    expect(
      soru.SoruCevapGirdiSema.safeParse({ ekler: [foto, foto, foto, foto, foto] }).success,
    ).toBe(false);
    expect(
      soru.SoruCevapGirdiSema.safeParse({
        ekler: [{ tur: 'ses', medya_dosya_id: id(), sure_sn: 181 }],
      }).success,
    ).toBe(false);
    expect(
      soru.SoruCevapGirdiSema.safeParse({
        ekler: [{ tur: 'ses', medya_dosya_id: id(), sure_sn: 180 }],
      }).success,
    ).toBe(true);
    expect(
      soru.SoruCevapGirdiSema.safeParse({
        ekler: [{ tur: 'cizimli_fotograf', medya_dosya_id: id() }],
      }).success,
    ).toBe(false);
    expect(soru.SoruCevapGirdiSema.parse({ metin: 'x' }).derste_konusalim).toBe(false);
  });

  it('ayarlar: ses en cok 180 sn, gunluk limit null (sinirsiz) kabul edilir', () => {
    expect(soru.SoruAyarlariGuncelleGirdiSema.safeParse({ ses_azami_sn: 181 }).success).toBe(false);
    expect(soru.SoruAyarlariGuncelleGirdiSema.safeParse({ gunluk_soru_limiti: null }).success).toBe(
      true,
    );
    expect(soru.SoruAyarlariGuncelleGirdiSema.safeParse({ gunluk_soru_limiti: 0 }).success).toBe(
      false,
    );
  });

  it('varsayilanlar: gunde 3 soru, ses 180 sn, 3 fotograf', () => {
    expect(soru.SORU_VARSAYILAN_GUNLUK_LIMIT).toBe(3);
    expect(soru.SORU_SES_EN_FAZLA_SN).toBe(180);
    expect(soru.SORU_EN_FAZLA_FOTOGRAF).toBe(3);
  });
});
