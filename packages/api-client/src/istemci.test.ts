import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';

import { idempotencyBasliklari, istekBasliklari } from './basliklar.js';
import { ApiHatasi } from './hata.js';
import { createServisIstemcileri, kimlikAraKatmani } from './istemci.js';

interface OrnekYollar {
  '/ping': {
    get: {
      responses: { 200: { content: { 'application/json': { ok: boolean } } } };
    };
  };
}

function yakalayici() {
  const istekler: Request[] = [];
  const fetch: typeof globalThis.fetch = (girdi, init) => {
    const istek = new Request(girdi, init);
    istekler.push(istek);
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { istekler, fetch };
}

describe('kimlikAraKatmani', () => {
  it('Bearer belirteci ve izleme basliklarini ekler', async () => {
    const { istekler, fetch } = yakalayici();
    const istemci = createClient<OrnekYollar>({ baseUrl: 'http://x.test', fetch });
    istemci.use(kimlikAraKatmani({ tokenAl: () => 'abc', istekIdUret: () => 'id-1' }));

    await istemci.GET('/ping');

    const baslik = istekler[0]?.headers;
    expect(baslik?.get('authorization')).toBe('Bearer abc');
    expect(baslik?.get('x-istek-id')).toBe('id-1');
    expect(baslik?.get('x-request-id')).toBe('id-1');
  });

  it('belirtec yoksa Authorization eklemez', async () => {
    const { istekler, fetch } = yakalayici();
    const istemci = createClient<OrnekYollar>({ baseUrl: 'http://x.test', fetch });
    istemci.use(kimlikAraKatmani({ tokenAl: () => null }));

    await istemci.GET('/ping');

    expect(istekler[0]?.headers.has('authorization')).toBe(false);
    expect(istekler[0]?.headers.get('x-istek-id')).toBeTruthy();
  });

  it('servis basina farkli taban adres kullanir', async () => {
    const { istekler, fetch } = yakalayici();
    const istemciler = createServisIstemcileri({
      adresler: { api: 'http://api.test', motivasyon: 'http://mot.test' },
      fetch,
    });
    // Sozlesmede henuz yol olmadigi icin yalnizca adresin dogru kuruldugunu sinariz.
    const ham = istemciler.motivasyon as unknown as {
      GET: (yol: string) => Promise<unknown>;
    };
    await ham.GET('/ping');
    expect(istekler[0]?.url).toBe('http://mot.test/ping');
  });
});

describe('baslik yardimcilari', () => {
  it('her istek icin ayni kimligi iki basliga yazar', () => {
    expect(istekBasliklari('a')).toEqual({ 'X-Istek-Id': 'a', 'X-Request-Id': 'a' });
  });

  it('Idempotency-Key anahtarini korur ya da uretir', () => {
    expect(idempotencyBasliklari('k1')).toEqual({ 'Idempotency-Key': 'k1' });
    expect(idempotencyBasliklari()['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ApiHatasi', () => {
  it('servis hata govdesini cozer', () => {
    const hata = ApiHatasi.from(
      403,
      { error: { code: 'riza_gerekli', message: 'Rıza gerekli.', requestId: 'r1' } },
      'yedek',
    );
    expect(hata).toMatchObject({ durum: 403, kod: 'riza_gerekli', istekId: 'r1' });
  });

  it('bilinmeyen govdede yedek mesaja duser', () => {
    const hata = ApiHatasi.from(401, '<html>', 'yedek');
    expect(hata).toMatchObject({ durum: 401, kod: 'yetkisiz', message: 'yedek' });
  });
});
