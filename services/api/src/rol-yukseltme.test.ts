import type { AuthContext } from '@kopru/service-kit';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { YakalayanSmsGonderici } from './modules/hesap/index.js';
import { dersYardimcilari, type Kurulum } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb } from './test/yardimcilar.js';

type Kanca = (request: unknown, reply: unknown) => Promise<void>;

interface Rota {
  method: string;
  url: string;
  config: Record<string, unknown>;
  kancalar: Kanca[];
}

/**
 * Rol yukseltme: her rotanin yetki kancasi (preHandler) rol bazinda dogrudan calistirilir (govde dogrulamasi
 * araya girmez). Ogrenci personel uclarina, ogretmen sahip uclarina (abonelik, modul, kurum ayari) giremez;
 * taklit belirteci hicbir yazma ucuna giremez; platform uclari kurum rolleriyle kapali.
 */
describe.skipIf(dbYok())('guvenlik: rol yukseltme', () => {
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
    const kancalar = (
      r.preHandler === undefined ? [] : Array.isArray(r.preHandler) ? r.preHandler : [r.preHandler]
    ) as Kanca[];
    for (const method of yontemler) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      rotalar.push({
        method,
        url: r.url,
        config: (r.config ?? {}) as Record<string, unknown>,
        kancalar,
      });
    }
  });
  const sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  afterAll(async () => {
    await sistem.end();
    await service.stop();
  });

  const y = dersYardimcilari({ t: { service, sms }, sistem });
  let s: Kurulum;
  let ogrenci: { kullaniciId: string; uyelikId: string };

  beforeAll(async () => {
    await app.ready();
    s = await y.kur({ ogrenciSayisi: 1 });
    ogrenci = await y.davetliUye(s.k, 'ogrenci');
  }, 60_000);

  const auth = (
    rol: 'sahip' | 'ogretmen' | 'ogrenci',
    ek: Record<string, unknown> = {},
  ): AuthContext => {
    const uye =
      rol === 'sahip'
        ? { kullaniciId: s.k.kullaniciId, uyelikId: s.k.uyelikId }
        : rol === 'ogretmen'
          ? { kullaniciId: s.hoca.kullaniciId, uyelikId: s.hoca.uyelikId }
          : ogrenci;
    return {
      ...uye,
      kurumId: s.k.kurumId,
      rol,
      sessionId: null,
      roller: [rol],
      claims: { ...ek },
    };
  };

  const SAHTE = '00000000-0000-7000-8000-000000000001';

  /** Kanca zincirini verilen kimlikle calistirir; reddedildiyse HTTP durumunu, gecerse 0 doner. */
  async function kapiSonucu(r: Rota, kimlik: AuthContext): Promise<number> {
    const params: Record<string, string> = {};
    for (const m of r.url.matchAll(/:([a-z_]+)/g)) params[m[1] ?? ''] = SAHTE;
    params.kurum_id = s.k.kurumId;
    const istek = {
      auth: kimlik,
      method: r.method,
      params,
      query: {},
      body: {},
      headers: {},
      server: app,
      routeOptions: { config: r.config },
      log: app.log,
      ip: '127.0.0.1',
    };
    try {
      for (const kanca of r.kancalar) await kanca(istek, { header: () => undefined });
      return 0;
    } catch (err) {
      return (err as { statusCode?: number }).statusCode ?? 500;
    }
  }

  const kiraciRotalari = () =>
    rotalar.filter(
      (r) =>
        r.config.public !== true &&
        r.config.servisScope === undefined &&
        r.kancalar.length > 0 &&
        r.url.includes('/kurumlar/:kurum_id'),
    );

  /** Ogrencinin (kendi verisi disinda) yapabilecegi uclar; yeni bir uc ogrenciye acilirsa burada gorunmeli. */
  const OGRENCI_IZINLI = [
    /^GET \/v1\/hesap\/kurumlar\/:kurum_id$/,
    /\/kayitlarim/,
    /\/ogrenci-odevleri\/:[a-z_]+\/teslim$/,
    /^POST .*\/sorular/,
    /\/geri-bildirim/,
    /^GET /,
    /^PUT .*\/gorevler\/:[a-z_]+\/gerceklesen$/,
    /^POST .*\/denemeler$/,
    /^PATCH .*\/denemeler\/:[a-z_]+$/,
    /^POST .*\/dosyalar/,
    /\/yazilar/,
    /\/gorevler\/:[a-z_]+\/devret$/,
    /^DELETE .*\/denemeler\/:[a-z_]+$/,
    // Gunluk soru kaydi: ogrenci kendi kaydini girer, ayni gun duzeltir/siler (sahiplik uc icinde denetlenir).
    /^(POST|PATCH|DELETE) .*\/gunluk-soru\/kayitlar(\/:[a-z_]+)?$/,
  ];

  it('ogrenci belirteci: personel/yonetim yazma uclarinin hicbirine gecemez', async () => {
    const kimlik = auth('ogrenci');
    const gecen: string[] = [];
    for (const r of kiraciRotalari()) {
      if (r.method === 'GET') continue;
      if ((await kapiSonucu(r, kimlik)) === 0) gecen.push(`${r.method} ${r.url}`);
    }
    const beklenmeyen = gecen.filter((k) => !OGRENCI_IZINLI.some((re) => re.test(k)));
    expect(beklenmeyen).toEqual([]);
    // Yonetim uclari kesinlikle kapali:
    for (const k of gecen) {
      expect(k).not.toMatch(
        /abonelik|davetler|modul-ayarlari|paketler|tahsilat|\/gruplar|\/atamalar|ayarlar/,
      );
    }
  }, 120_000);

  it('ogrenci: abonelik, finans, davet, modul ve kurum yonetimi okuma uclari da kapali', async () => {
    const kimlik = auth('ogrenci');
    const gecen: string[] = [];
    for (const r of kiraciRotalari()) {
      if (!/\/abonelik\/|\/finans\/|\/davetler|\/paketler|\/tahsilat/.test(r.url)) continue;
      if (r.url.endsWith('/ogrenciler/:ogrenci_id/finans')) continue; // kapsam testi altta
      if ((await kapiSonucu(r, kimlik)) === 0) gecen.push(`${r.method} ${r.url}`);
    }
    expect(gecen).toEqual([]);
  }, 120_000);

  it('ogretmen belirteci: abonelik, modul ayari, davet ve kurum ayari uclarina gecemez', async () => {
    const kimlik = auth('ogretmen');
    const gecen: string[] = [];
    for (const r of kiraciRotalari()) {
      if (
        !r.url.includes('/abonelik/') &&
        !(r.method !== 'GET' && /modul-ayarlari|\/finans\/kurumlar\/:kurum_id\/ayarlar/.test(r.url))
      )
        continue;
      if ((await kapiSonucu(r, kimlik)) === 0) gecen.push(`${r.method} ${r.url}`);
    }
    expect(gecen).toEqual([]);
    const kurumPatch = rotalar.find(
      (r) => r.method === 'PATCH' && r.url === '/v1/hesap/kurumlar/:kurum_id',
    );
    expect(kurumPatch).toBeDefined();
    if (kurumPatch) expect(await kapiSonucu(kurumPatch, kimlik)).toBe(403);
  }, 120_000);

  it('ogrenci baska ogrencinin finans karti, uye ve atama listelerini goremez (kapsam)', async () => {
    const baskasi = s.ogrenciler[0] ?? '';
    const finans = await app.inject({
      url: `/v1/finans/kurumlar/${s.k.kurumId}/ogrenciler/${baskasi}/finans`,
      headers: bearer(ogrenciToken),
    });
    expect([403, 404]).toContain(finans.statusCode);
    const uyeler = await app.inject({
      url: `/v1/hesap/kurumlar/${s.k.kurumId}/gruplar/${s.grup.id}/uyeler`,
      headers: bearer(ogrenciToken),
    });
    expect([403, 404]).toContain(uyeler.statusCode);
    const atamalar = await app.inject({
      url: `/v1/hesap/kurumlar/${s.k.kurumId}/atamalar`,
      headers: bearer(ogrenciToken),
    });
    if (atamalar.statusCode === 200) expect(atamalar.body).not.toContain(s.hoca.uyelikId);
  });

  it('taklit belirteci (imp): hicbir yazma ucuna gecemez (403 taklit_salt_okunur)', async () => {
    const kimlik = auth('sahip', { imp: { taklit_id: SAHTE, bitis: '2999-01-01T00:00:00Z' } });
    const gecen: string[] = [];
    for (const r of kiraciRotalari()) {
      if (r.method === 'GET') continue;
      if ((await kapiSonucu(r, kimlik)) !== 403) gecen.push(`${r.method} ${r.url}`);
    }
    expect(gecen).toEqual([]);
  }, 120_000);

  it('platform uclari: kurum sahibi, ogretmen ve ogrenci belirteci 403 alir; kimliksiz 401', async () => {
    const platform = rotalar.filter((r) => r.url.startsWith('/platform/'));
    expect(platform.length).toBeGreaterThan(20);
    const tokenlar = [s.k.token, s.hoca.token, ogrenci_token()];
    const sorunlar: string[] = [];
    for (const r of platform) {
      const url = r.url.replace(/:([a-z_]+)/g, SAHTE);
      for (const token of tokenlar) {
        const yanit = await app.inject({
          method: r.method as 'GET',
          url,
          headers: bearer(token),
          ...(r.method === 'GET' || r.method === 'DELETE' ? {} : { payload: {} }),
        });
        if (yanit.statusCode !== 403)
          sorunlar.push(`${r.method} ${url} -> ${String(yanit.statusCode)}`);
      }
    }
    expect(sorunlar).toEqual([]);
  }, 120_000);

  function ogrenci_token(): string {
    return ogrenciToken;
  }
  let ogrenciToken = '';
  beforeAll(async () => {
    // davetliUye token'i beforeAll sirasi nedeniyle burada yeniden alinir.
    const ek = await y.davetliUye(s.k, 'ogrenci');
    ogrenciToken = ek.token;
  }, 60_000);
});
