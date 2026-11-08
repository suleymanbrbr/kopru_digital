import { afterEach, describe, expect, it } from 'vitest';

import { createEnvSchema, loadEnv } from './env.js';
import { createService, type Service, type ServicePlugin } from './service.js';
import { testEnv } from './test-support.js';

let service: Service | undefined;

afterEach(async () => {
  await service?.stop();
  service = undefined;
});

const ipPlugin: ServicePlugin = (app) => {
  app.get('/ip', (request) => ({ ip: request.ip }));
  return Promise.resolve();
};

async function build(env: Record<string, string>) {
  service = createService({ name: 'test', port: 0, env: testEnv(env), plugins: [ipPlugin] });
  await service.app.ready();
  return service.app;
}

type App = Awaited<ReturnType<typeof build>>;

const istek = (app: App, remoteAddress: string, xff?: string) =>
  app.inject({
    url: '/ip',
    remoteAddress,
    ...(xff ? { headers: { 'x-forwarded-for': xff } } : {}),
  });

const ipOku = async (app: App, remoteAddress: string, xff?: string) =>
  (await istek(app, remoteAddress, xff)).json<{ ip: string }>().ip;

describe('guvenilir proxy (TRUST_PROXY, ADR 0009)', () => {
  it('bos listede X-Forwarded-For yok sayilir', async () => {
    const app = await build({});
    expect(await ipOku(app, '10.0.0.5', '203.0.113.9')).toBe('10.0.0.5');
  });

  it('guvenilen proxy arkasinda istemci IP si okunur', async () => {
    const app = await build({ TRUST_PROXY: '10.0.0.0/24' });
    expect(await ipOku(app, '10.0.0.5', '203.0.113.9')).toBe('203.0.113.9');
  });

  it('guvenilmeyen kaynaktan gelen sahte X-Forwarded-For yok sayilir', async () => {
    const app = await build({ TRUST_PROXY: '10.0.0.0/24' });
    expect(await ipOku(app, '198.51.100.7', '203.0.113.9')).toBe('198.51.100.7');
  });

  it('sahte sol deger gercek IP yi bozmaz (en sagdaki guvenilmeyen adres)', async () => {
    const app = await build({ TRUST_PROXY: '10.0.0.0/24, 10.0.1.1' });
    expect(await ipOku(app, '10.0.0.5', '1.2.3.4, 203.0.113.9')).toBe('203.0.113.9');
    expect(await ipOku(app, '10.0.0.5', '1.2.3.4, 203.0.113.9, 10.0.1.1')).toBe('203.0.113.9');
  });

  it('API_ onekli degisken de calisir', () => {
    const env = loadEnv(createEnvSchema({ defaultPort: 0 }), {
      service: 'api',
      source: { API_TRUST_PROXY: '10.0.0.0/8' },
    });
    expect(env.TRUST_PROXY).toEqual(['10.0.0.0/8']);
  });

  it('farkli istemci IP leri ayri rate-limit anahtarina duser, ayni IP ayni anahtara', async () => {
    const app = await build({ TRUST_PROXY: '10.0.0.0/24', RATE_LIMIT_MAX: '2' });
    const durum = async (xff: string) => (await istek(app, '10.0.0.5', xff)).statusCode;
    expect(await durum('203.0.113.1')).toBe(200);
    expect(await durum('203.0.113.1')).toBe(200);
    expect(await durum('203.0.113.1')).toBe(429);
    expect(await durum('203.0.113.2')).toBe(200);
    expect(await durum('203.0.113.2')).toBe(200);
    expect(await durum('203.0.113.2')).toBe(429);
  });

  it('bos listede sahte X-Forwarded-For ile rate-limit asilamaz', async () => {
    const app = await build({ RATE_LIMIT_MAX: '1' });
    const durum = async (xff: string) => (await istek(app, '10.0.0.5', xff)).statusCode;
    expect(await durum('203.0.113.1')).toBe(200);
    expect(await durum('203.0.113.2')).toBe(429);
  });

  it.each(['*', 'true', 'loopback', '0.0.0.0/0', '10.0.0.0/33', 'abc', '10.0.0.1/8/8'])(
    '%s ile acilis reddedilir',
    (deger) => {
      expect(() => testEnv({ TRUST_PROXY: deger })).toThrow(/TRUST_PROXY/);
    },
  );

  it('gecerli IPv4/IPv6 girdileri kabul edilir', () => {
    expect(testEnv({ TRUST_PROXY: '10.0.0.0/8,fd00::/8, 172.16.0.4' }).TRUST_PROXY).toEqual([
      '10.0.0.0/8',
      'fd00::/8',
      '172.16.0.4',
    ]);
  });
});
