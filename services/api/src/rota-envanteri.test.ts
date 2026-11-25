import { afterAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { dbYok, testDb } from './test/yardimcilar.js';

interface Rota {
  method: string;
  url: string;
  config: Record<string, unknown>;
  korumali: boolean;
}

describe.skipIf(dbYok())('guvenlik: api rota envanteri (korumasiz rota birakmaz)', () => {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const service = buildService(
    loadServiceEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urls.appUrl,
      DATABASE_SISTEM_URL: urls.sistemUrl,
      PUBLIC_URL: 'http://api.test',
      WEB_URL: 'http://web.test',
    }),
  );
  const { app } = service;
  const rotalar: Rota[] = [];
  app.addHook('onRoute', (r) => {
    const yontemler = Array.isArray(r.method) ? r.method : [r.method];
    for (const method of yontemler) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      rotalar.push({
        method,
        url: r.url,
        config: (r.config ?? {}) as Record<string, unknown>,
        korumali: r.preHandler !== undefined,
      });
    }
  });
  afterAll(() => service.stop());

  /**
   * Geçerli kimlik ister ama izin kancası (`requirePermission`) taşımaz: kurum bağlamı gerekmeyen
   * hesap uçları. Her biri kendi kaydına (`kullanici_id`) göre süzer; yenisi eklenirse bilinçli karar gerekir.
   */
  const YALNIZ_KIMLIK_ALLOWLIST = new Set<string>([
    'GET /v1/hesap/ben',
    'GET /v1/hesap/rizalar/guncel',
    'POST /v1/hesap/rizalar',
    'GET /v1/hesap/uyeliklerim',
    'POST /v1/hesap/kurumlar',
    'POST /v1/hesap/davetler/kabul',
    'GET /v1/hesap/oturumlar',
    'POST /v1/hesap/oturumlar/tumunu-kapat',
    'DELETE /v1/hesap/oturumlar/:oturum_id',
    'POST /v1/hesap/sinif-kodu/katil',
    'GET /v1/hesap/sinif-kodu/istekler',
    'POST /v1/hesap/sinif-kodu/istekler/:istek_id/iptal',
    // KVKK (hesap düzeyi; yalnız kendi kaydı, taklit oturumu yazamaz): docs/schema/kvkk-silme.md
    'PATCH /v1/hesap/ben',
    'GET /v1/hesap/ben/silme-talebi',
    'POST /v1/hesap/ben/silme-talebi/kod-gonder',
    'POST /v1/hesap/ben/silme-talebi',
    'DELETE /v1/hesap/ben/silme-talebi',
    'GET /v1/hesap/ben/verilerim',
  ]);
  /**
   * Kimliksiz erişilebilen rotalar. Giriş uçları kendi hız sınırlarını ve oturum belirteci denetimini taşır;
   * webhook'lar imza/paylaşılan sır ile doğrulanır.
   */
  const HERKESE_ACIK_ALLOWLIST = new Set<string>([
    'GET /.well-known/jwks.json',
    'POST /auth/otp/gonder',
    'POST /auth/otp/dogrula',
    'POST /auth/eposta/kayit',
    'POST /auth/eposta/giris',
    'POST /auth/eposta/dogrulama-gonder',
    'GET /auth/eposta/dogrula',
    'POST /auth/cikis',
    'POST /auth/token',
    'GET /v1/platform-mesaji',
    'POST /v1/abonelik/webhook/iyzico',
    'POST /v1/abonelik/webhook/revenuecat',
    'POST /v1/abonelik/odeme/iyzico/donus',
  ]);

  const anahtar = (r: Rota) => `${r.method} ${r.url}`;

  it('her rota yetki kancasi, platform kapisi, servis belirteci tasir ya da allowlist icinde', async () => {
    await app.ready();
    const ihlal: string[] = [];
    for (const r of rotalar) {
      if (r.config.public === true) {
        if (!HERKESE_ACIK_ALLOWLIST.has(anahtar(r)))
          ihlal.push(`acik ama allowlist disi: ${anahtar(r)}`);
        continue;
      }
      if (r.config.servisScope !== undefined) continue;
      if (r.url.startsWith('/platform/')) continue;
      if (r.korumali) continue;
      if (!YALNIZ_KIMLIK_ALLOWLIST.has(anahtar(r))) ihlal.push(`kancasiz: ${anahtar(r)}`);
    }
    expect(ihlal).toEqual([]);
  });

  it('kimliksiz istek her korumali rotada 401 alir (yeni rota korumasiz kalirsa kirilir)', async () => {
    await app.ready();
    expect(rotalar.length).toBeGreaterThan(100);
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

  it("herkese acik allowlist'te olup artik var olmayan rota yok (liste guncel kalir)", async () => {
    await app.ready();
    const mevcut = new Set(rotalar.map(anahtar));
    const eksik = [...HERKESE_ACIK_ALLOWLIST, ...YALNIZ_KIMLIK_ALLOWLIST].filter(
      (k) => !mevcut.has(k),
    );
    expect(eksik).toEqual([]);
  });
});
