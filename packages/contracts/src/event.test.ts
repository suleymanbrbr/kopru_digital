import { describe, expect, it } from 'vitest';

import { errorResponseSchema } from './error.js';
import { eventSubject } from './event.js';
import { yoklamaAlindiV1 } from './events/yoklama-alindi.v1.js';

const uuid = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';

const input: Parameters<typeof yoklamaAlindiV1.create>[0] = {
  kurumId: uuid,
  actor: { tur: 'kullanici', id: 'u-1' },
  correlationId: 'corr-1',
  data: {
    yoklamaId: uuid,
    dersId: uuid,
    tarih: '2026-11-07',
    kayitlar: [{ ogrenciId: uuid, durum: 'geldi' }],
  },
};

describe('defineEvent', () => {
  it('uuidv7 id ile gecerli zarf olusturur', () => {
    const event = yoklamaAlindiV1.create(input);
    expect(event.type).toBe('yoklama.alindi');
    expect(event.version).toBe(1);
    expect(event.id[14]).toBe('7');
    expect(yoklamaAlindiV1.subject).toBe('evt.yoklama.alindi.v1');
    expect(eventSubject(event)).toBe(yoklamaAlindiV1.subject);
  });

  it('gecersiz veriyi reddeder', () => {
    expect(() =>
      yoklamaAlindiV1.create({ ...input, data: { ...input.data, kayitlar: [] } }),
    ).toThrow();
  });

  it('baska tip veya surumu parse etmez', () => {
    const event = yoklamaAlindiV1.create(input);
    expect(() => yoklamaAlindiV1.parse({ ...event, version: 2 })).toThrow();
    expect(() => yoklamaAlindiV1.parse({ ...event, type: 'baska.olay' })).toThrow();
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
