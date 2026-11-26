import { describe, expect, it } from 'vitest';

import {
  DegerlendirmeGuncelleGirdiSema,
  DegerlendirmeOlusturGirdiSema,
  KaynakOnerisiOlusturGirdiSema,
  ogrenmeDegerlendirmeYayimlandiV1,
  ogrenmeKaynakOnerisiEklendiV1,
} from './degerlendirme.js';

const uuid = '0190f3a0-0000-7000-8000-000000000001';

describe('degerlendirme girdileri', () => {
  const temel = { donem_baslangic: '2026-11-23' };

  it('yorum ya da en az bir olcek gerekir; olcek 1-5; gorunurluk varsayilan kapali', () => {
    expect(DegerlendirmeOlusturGirdiSema.safeParse(temel).success).toBe(false);
    const g = DegerlendirmeOlusturGirdiSema.parse({ ...temel, calisma_duzeni: 3 });
    expect(g.ogrenci_gorur).toBe(false);
    expect(DegerlendirmeOlusturGirdiSema.parse({ ...temel, yorum: 'iyi' }).ogrenci_gorur).toBe(
      false,
    );
    for (const kotu of [0, 6, 2.5]) {
      expect(
        DegerlendirmeOlusturGirdiSema.safeParse({ ...temel, derse_katilim: kotu }).success,
      ).toBe(false);
    }
  });

  it('guncelleme: degisiklik yoksa reddedilir, null alani temizler', () => {
    expect(DegerlendirmeGuncelleGirdiSema.safeParse({ surum: 2 }).success).toBe(false);
    expect(DegerlendirmeGuncelleGirdiSema.parse({ yorum: null }).yorum).toBeNull();
  });
});

describe('kaynak onerisi girdisi', () => {
  it('link yalniz http/https; baslik zorunlu; konu icin ders gerekir (link/serbest)', () => {
    const link = (baglanti_url: string) =>
      KaynakOnerisiOlusturGirdiSema.safeParse({ tur: 'link', baglanti_url, baslik: 'x' }).success;
    expect(link('https://ornek.com/a')).toBe(true);
    expect(link('javascript:alert(1)')).toBe(false);
    expect(link('ftp://ornek.com')).toBe(false);
    expect(link('ornek.com')).toBe(false);
    expect(KaynakOnerisiOlusturGirdiSema.safeParse({ tur: 'serbest' }).success).toBe(false);
    expect(
      KaynakOnerisiOlusturGirdiSema.safeParse({ tur: 'serbest', baslik: 'x', konu_id: uuid })
        .success,
    ).toBe(false);
    expect(
      KaynakOnerisiOlusturGirdiSema.safeParse({
        tur: 'serbest',
        baslik: 'x',
        konu_id: uuid,
        brans_kodu: 'biyoloji',
      }).success,
    ).toBe(true);
    expect(
      KaynakOnerisiOlusturGirdiSema.safeParse({
        tur: 'kaynak_kitap',
        kaynak_kitap_id: uuid,
        konu_id: uuid,
      }).success,
    ).toBe(true);
  });
});

describe('olaylar', () => {
  const zarf = {
    kurumId: uuid,
    actor: { tur: 'kullanici', id: uuid } as const,
    correlationId: uuid,
  };

  it('yalniz kimlik tasir; yorum, baslik ve ad yuke giremez (fazla alan atilir)', () => {
    const a = ogrenmeDegerlendirmeYayimlandiV1.create({
      ...zarf,
      data: { degerlendirme_id: uuid, ogrenci_id: uuid, yazar_id: uuid },
    });
    expect(ogrenmeDegerlendirmeYayimlandiV1.subject).toBe(
      'evt.ogrenme.degerlendirme.yayimlandi.v1',
    );
    expect(Object.keys(a.data).sort()).toEqual(['degerlendirme_id', 'ogrenci_id', 'yazar_id']);
    const b = ogrenmeKaynakOnerisiEklendiV1.create({
      ...zarf,
      data: { oneri_id: uuid, ogrenci_id: uuid, oneren_id: uuid, tur: 'link' },
    });
    expect(ogrenmeKaynakOnerisiEklendiV1.subject).toBe('evt.ogrenme.kaynak_onerisi.eklendi.v1');
    expect(
      ogrenmeKaynakOnerisiEklendiV1.schema.safeParse({ ...b, data: { ...b.data, tur: 'baska' } })
        .success,
    ).toBe(false);
  });
});
