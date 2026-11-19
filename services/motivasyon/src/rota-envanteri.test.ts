import { afterAll, describe, expect, it } from 'vitest';

import { dbYok, testServisi } from './test/yardimcilar.js';

interface Rota {
  method: string;
  url: string;
  config: Record<string, unknown>;
}

/**
 * Rota envanteri (guvenlik denetimi): kimliksiz erisilebilen her rota burada acikca listelenir; digerleri
 * kimliksiz istege 401 doner. Yeni rota `config.public` ile acilirsa ya da kimlik kancasi atlanirsa
 * bu test kirilir.
 */
const HERKESE_ACIK = new Set<string>(['GET /health', 'GET /ready', 'GET /openapi.json']);

describe.skipIf(dbYok())('guvenlik: motivasyon rota envanteri', () => {
  const service = testServisi();
  const { app } = service;
  const rotalar: Rota[] = [];
  app.addHook('onRoute', (r) => {
    const yontemler = Array.isArray(r.method) ? r.method : [r.method];
    for (const method of yontemler) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      rotalar.push({ method, url: r.url, config: (r.config ?? {}) as Record<string, unknown> });
    }
  });
  afterAll(() => service.stop());

  const anahtar = (r: Rota) => `${r.method} ${r.url}`;

  it("kimliksiz acik rota yalniz allowlist'te", async () => {
    await app.ready();
    expect(rotalar.length).toBeGreaterThan(5);
    const acik = rotalar.filter((r) => r.config.public === true).map(anahtar);
    expect(acik.filter((k) => !HERKESE_ACIK.has(k))).toEqual([]);
  });

  it('kimliksiz istek her korumali rotada 401 alir', async () => {
    await app.ready();
    const sorunlar: string[] = [];
    for (const r of rotalar) {
      if (r.config.public === true) continue;
      const url = r.url.replace(/:([a-z_]+)/g, '00000000-0000-7000-8000-000000000001');
      const yanit = await app.inject({
        method: r.method as 'GET',
        url,
        ...(r.method === 'GET' || r.method === 'DELETE' ? {} : { payload: {} }),
      });
      if (yanit.statusCode !== 401) sorunlar.push(`${anahtar(r)} -> ${String(yanit.statusCode)}`);
    }
    expect(sorunlar).toEqual([]);
  });

  it('bozuk ve alg=none belirteci 401 alir', async () => {
    await app.ready();
    const ilk = rotalar.find((r) => r.config.public !== true && r.method === 'GET');
    if (!ilk) return;
    const url = ilk.url.replace(/:([a-z_]+)/g, '00000000-0000-7000-8000-000000000001');
    for (const token of ['x', 'a.b.c', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.']) {
      const yanit = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
      expect(yanit.statusCode).toBe(401);
    }
  });
});
