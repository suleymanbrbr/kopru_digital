import { describe, expect, it } from 'vitest';

import { dersYoklamaKaydedildiV1 } from './ders/olaylar.js';
import { errorResponseSchema } from './error.js';
import { eventSubject } from './event.js';

const uuid = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';

const input: Parameters<typeof dersYoklamaKaydedildiV1.create>[0] = {
  kurumId: uuid,
  actor: { tur: 'kullanici', id: 'u-1' },
  correlationId: 'corr-1',
  data: {
    yoklama_id: uuid,
    ders_id: uuid,
    grup_id: uuid,
    ogrenci_id: uuid,
    brans_kodu: 'matematik',
    durum: 'geldi',
    onceki_durum: null,
    gec_dakika: null,
    isaretlenme_at: '2026-11-07T10:00:00.000Z',
    yoklama_surumu: 1,
  },
};

describe('defineEvent', () => {
  it('uuidv7 id ile gecerli zarf olusturur', () => {
    const event = dersYoklamaKaydedildiV1.create(input);
    expect(event.type).toBe('ders.yoklama.kaydedildi');
    expect(event.version).toBe(1);
    expect(event.id[14]).toBe('7');
    expect(dersYoklamaKaydedildiV1.subject).toBe('evt.ders.yoklama.kaydedildi.v1');
    expect(eventSubject(event)).toBe(dersYoklamaKaydedildiV1.subject);
  });

  it('gecersiz veriyi reddeder', () => {
    expect(() =>
      dersYoklamaKaydedildiV1.create({
        ...input,
        data: { ...input.data, durum: 'gec_geldi' as never },
      }),
    ).toThrow();
  });

  it('baska tip veya surumu parse etmez', () => {
    const event = dersYoklamaKaydedildiV1.create(input);
    expect(() => dersYoklamaKaydedildiV1.parse({ ...event, version: 2 })).toThrow();
    expect(() => dersYoklamaKaydedildiV1.parse({ ...event, type: 'baska.olay' })).toThrow();
  });
});

describe('errorResponseSchema', () => {
  it('standart hata govdesini dogrular', () => {
    expect(
      errorResponseSchema.safeParse({ error: { code: 'bulunamadi', message: 'Kayit bulunamadi' } })
        .success,
    ).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: '' } }).success).toBe(false);
  });
});
