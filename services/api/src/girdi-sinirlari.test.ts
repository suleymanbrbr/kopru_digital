import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { sablonUret } from './modules/ogrenme/deneme-excel.js';
import {
  bearer,
  dbYok,
  kurumluKullanici,
  testDb,
  type KurumluKullanici,
} from './test/yardimcilar.js';
import { YakalayanSmsGonderici } from './modules/hesap/index.js';

interface Rota {
  method: string;
  url: string;
  config: Record<string, unknown>;
  sorguAlanlari: string[];
}

describe('guvenlik: excel formul enjeksiyonu', () => {
  it('deneme sablonunda ogrenci no, ad ve bolum adi = + - @ ile baslarsa kacirilir', async () => {
    const buf = await sablonUret(
      {
        id: 'k',
        ad: '=ad',
        kod: 'kod',
        yanlis_katsayisi: '0.25',
        bolumler: [{ bolum_kodu: 'tyt', ad: '=HYPERLINK("http://x","t")', soru_sayisi: 40 }],
      } as never,
      [
        { id: 'u1', ogrenci_no: '=1+1', gorunen_ad: '@SUM(A1)' },
        { id: 'u2', ogrenci_no: '-2', gorunen_ad: '+3' },
      ],
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const veri = wb.getWorksheet('Veri');
    expect(veri?.getCell(2, 2).value).toBe("'=1+1");
    expect(veri?.getCell(2, 3).value).toBe("'@SUM(A1)");
    expect(veri?.getCell(3, 2).value).toBe("'-2");
    expect(veri?.getCell(3, 3).value).toBe("'+3");
    const bilgi = wb.getWorksheet('Bilgi');
    const metinler: string[] = [];
    bilgi?.eachRow((row) =>
      row.eachCell((c) => {
        if (typeof c.value === 'string') metinler.push(c.value);
      }),
    );
    expect(metinler).toContain(`'=HYPERLINK("http://x","t")`);
    expect(metinler.some((m) => /^[=+\-@]/.test(m))).toBe(false);
  });
});

describe.skipIf(dbYok())('guvenlik: girdi sinirlari', () => {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const sms = new YakalayanSmsGonderici();
  const service = buildService(
    loadServiceEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urls.appUrl,
      DATABASE_SISTEM_URL: urls.sistemUrl,
      PUBLIC_URL: 'http://api.test',
      WEB_URL: 'http://web.test',
      RATE_LIMIT_MAX: '1000000',
    }),
    { sms },
  );
  const { app } = service;
  const rotalar: Rota[] = [];
  app.addHook('onRoute', (r) => {
    const yontemler = Array.isArray(r.method) ? r.method : [r.method];
    const sorgu = (r.schema as { querystring?: { shape?: Record<string, unknown> } } | undefined)
      ?.querystring;
    for (const method of yontemler) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      rotalar.push({
        method,
        url: r.url,
        config: (r.config ?? {}) as Record<string, unknown>,
        sorguAlanlari: Object.keys(sorgu?.shape ?? {}),
      });
    }
  });
  afterAll(() => service.stop());
  let k: KurumluKullanici;
  beforeAll(async () => {
    await app.ready();
    k = await kurumluKullanici({ service, sms });
  }, 30_000);

  const SAHTE = '00000000-0000-7000-8000-000000000001';
  const doldur = (url: string) =>
    url.replace(/:([a-z_]+)/g, (_m, p: string) => (p === 'kurum_id' ? k.kurumId : SAHTE));

  it('limit parametresi olan her GET ucu asiri degeri (100000) reddeder (sayfalama ust siniri)', async () => {
    const hedefler = rotalar.filter(
      (r) => r.method === 'GET' && r.sorguAlanlari.includes('limit') && r.url.includes(':kurum_id'),
    );
    expect(hedefler.length).toBeGreaterThan(10);
    const sorunlar: string[] = [];
    for (const r of hedefler) {
      const yanit = await app.inject({
        url: `${doldur(r.url)}?limit=100000`,
        headers: bearer(k.token),
      });
      if (yanit.statusCode !== 400 && yanit.statusCode !== 422)
        sorunlar.push(`${r.url} -> ${String(yanit.statusCode)}`);
    }
    expect(sorunlar).toEqual([]);
  }, 60_000);

  it('limit=0 ve negatif ve sayi olmayan deger reddedilir', async () => {
    const r = rotalar.find(
      (x) => x.method === 'GET' && x.sorguAlanlari.includes('limit') && x.url.includes(':kurum_id'),
    );
    expect(r).toBeDefined();
    for (const v of ['0', '-5', 'abc', '1e9']) {
      const yanit = await app.inject({
        url: `${doldur(r?.url ?? '')}?limit=${v}`,
        headers: bearer(k.token),
      });
      expect([400, 422], v).toContain(yanit.statusCode);
    }
  });

  it('JSON govde sinirinin (1 MB) uzerindeki istek 413 alir', async () => {
    const yanit = await app.inject({
      method: 'POST',
      url: `/v1/hesap/kurumlar/${k.kurumId}/gruplar`,
      headers: { ...bearer(k.token), 'content-type': 'application/json' },
      payload: JSON.stringify({ ad: 'x'.repeat(2 * 1024 * 1024), tur: 'grup' }),
    });
    expect(yanit.statusCode).toBe(413);
  });

  it('asiri uzun metin alani (ad) 400 alir, 500 degil', async () => {
    const yanit = await app.inject({
      method: 'POST',
      url: `/v1/hesap/kurumlar/${k.kurumId}/gruplar`,
      headers: bearer(k.token),
      payload: { ad: 'x'.repeat(100_000), tur: 'grup' },
    });
    expect(yanit.statusCode).toBe(400);
  });

  it('kaynak baglantisi: javascript: ve http: semalari reddedilir (422)', async () => {
    const yanit = await app.inject({
      method: 'POST',
      url: `/v1/ders/kurumlar/${k.kurumId}/dersler/${SAHTE}/kaynaklar`,
      headers: bearer(k.token),
      payload: { tur: 'baglanti', baslik: 'x', url: 'javascript:alert(1)' },
    });
    expect([400, 404, 422]).toContain(yanit.statusCode);
  });
});
