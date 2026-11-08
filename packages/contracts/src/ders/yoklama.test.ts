import { describe, expect, it } from 'vitest';

import { YoklamaGirdiSatiriSema, YoklamaTopluGirdiSema } from './yoklama.js';

const id = crypto.randomUUID();
const satir = { ogrenci_id: id, durum: 'geldi', isaretlenme_at: '2026-11-07T10:00:00.000Z' };

describe('yoklama girdisi', () => {
  it('dort durumu kabul eder, gec_geldi gibi eski degerleri reddeder', () => {
    for (const durum of ['geldi', 'gelmedi', 'izinli']) {
      expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, durum }).success).toBe(true);
    }
    expect(
      YoklamaGirdiSatiriSema.safeParse({ ...satir, durum: 'gec', gec_dakika: 5 }).success,
    ).toBe(true);
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, durum: 'gec_geldi' }).success).toBe(false);
  });

  it('gec_dakika yalniz gec durumunda ve 1-240 araliginda', () => {
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, durum: 'gec' }).success).toBe(false);
    expect(
      YoklamaGirdiSatiriSema.safeParse({ ...satir, durum: 'gec', gec_dakika: 0 }).success,
    ).toBe(false);
    expect(
      YoklamaGirdiSatiriSema.safeParse({ ...satir, durum: 'gec', gec_dakika: 241 }).success,
    ).toBe(false);
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, gec_dakika: 5 }).success).toBe(false);
  });

  it('not 500 karakterle sinirli, gorunurluk iki degerden biri', () => {
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, not: 'x'.repeat(500) }).success).toBe(true);
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, not: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(YoklamaGirdiSatiriSema.safeParse({ ...satir, not_gorunurluk: 'herkese' }).success).toBe(
      false,
    );
    expect(
      YoklamaGirdiSatiriSema.safeParse({ ...satir, not_gorunurluk: 'ogrenciye' }).success,
    ).toBe(true);
  });

  it('toplu govde: bos ve tekrarlayan ogrenci reddedilir', () => {
    expect(YoklamaTopluGirdiSema.safeParse({ yoklamalar: [] }).success).toBe(false);
    expect(YoklamaTopluGirdiSema.safeParse({ yoklamalar: [satir, satir] }).success).toBe(false);
    expect(YoklamaTopluGirdiSema.safeParse({ yoklamalar: [satir] }).success).toBe(true);
  });
});
