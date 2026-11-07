import { errorResponseSchema } from '@kopru/contracts';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createJwtVerifier } from './auth.js';
import { AppError } from './errors.js';
import { createService, type Service, type ServicePlugin } from './service.js';
import { testEnv } from './test-support.js';

let service: Service | undefined;

afterEach(async () => {
  await service?.stop();
  service = undefined;
});

const demoPlugin: ServicePlugin = (app) => {
  app.post(
    '/echo',
    {
      schema: {
        body: z.object({ ad: z.string().min(1) }),
        response: { 200: z.object({ ad: z.string() }) },
      },
    },
    (request) => ({ ad: request.body.ad }),
  );
  app.get('/app-error', () => {
    throw new AppError(409, 'cakisma', 'Bu kayıt zaten var.');
  });
  app.get('/boom', () => {
    throw new Error('gizli ayrinti');
  });
  app.get('/me', (request) => ({ auth: request.auth }));
  return Promise.resolve();
};

async function build(
  overrides: Record<string, string> = {},
  extra: Partial<Parameters<typeof createService>[0]> = {},
) {
  service = createService({
    name: 'test',
    port: 0,
    env: testEnv(overrides),
    plugins: [demoPlugin],
    ...extra,
  });
  await service.app.ready();
  return service.app;
}

describe('createService', () => {
  it('/health 200 doner ve istek kimliklerini yansitir', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/health',
      headers: { 'x-request-id': 'req-1', 'x-correlation-id': 'corr-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBe('req-1');
    expect(res.headers['x-correlation-id']).toBe('corr-1');
  });

  it('kimlik verilmezse uuidv7 uretir ve correlationId = requestId olur', async () => {
    const app = await build();
    const res = await app.inject({ url: '/health' });
    const id = res.headers['x-request-id'] as string;
    expect(id[14]).toBe('7');
    expect(res.headers['x-correlation-id']).toBe(id);
  });

  it('/ready bagimlilik yoksa hazirdir, kontrol basarisizsa 503 doner', async () => {
    const app = await build();
    expect((await app.inject({ url: '/ready' })).json()).toEqual({ status: 'ready', checks: {} });
    await service?.stop();

    const failing = await build(
      {},
      { readinessChecks: { ornek: () => Promise.reject(new Error('kapali')) } },
    );
    const res = await failing.inject({ url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not_ready', checks: { ornek: 'hata' } });
  });

  it('hatalari standart formata cevirir', async () => {
    const app = await build();

    const validation = await app.inject({ method: 'POST', url: '/echo', payload: { ad: '' } });
    expect(validation.statusCode).toBe(400);
    expect(errorResponseSchema.parse(validation.json()).error.code).toBe('dogrulama_hatasi');

    const appError = await app.inject({ url: '/app-error' });
    expect(appError.statusCode).toBe(409);
    expect(appError.json<{ error: { code: string } }>().error.code).toBe('cakisma');

    const notFound = await app.inject({ url: '/yok' });
    expect(notFound.statusCode).toBe(404);
    expect(errorResponseSchema.parse(notFound.json()).error.code).toBe('bulunamadi');

    const boom = await app.inject({ url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.body).not.toContain('gizli ayrinti');
    expect(errorResponseSchema.parse(boom.json()).error.code).toBe('sunucu_hatasi');
  });

  it('gecerli govdeyi calistirir', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { ad: 'Ayşe' } });
    expect(res.json()).toEqual({ ad: 'Ayşe' });
  });

  it('openapi dokumanini uretir', async () => {
    const app = await build();
    const res = await app.inject({ url: '/openapi.json' });
    const doc = res.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toContain('/echo');
  });

  it('rate limit asildiginda 429 ve standart hata doner; health muaf', async () => {
    const app = await build({ RATE_LIMIT_MAX: '2' });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ url: '/me' })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
  });
});

describe('auth', () => {
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keySet = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('kullanici-1')
        .setExpirationTime('5m')
        .sign(privateKey);
    const app = await build(
      { AUTH_ENABLED: 'true', JWKS_URL: 'https://auth.example.com/jwks.json' },
      { verifyJwt: createJwtVerifier({ keySet }) },
    );
    return { app, sign };
  }

  it('health acik kalir, diger rotalar token ister', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/ready' })).statusCode).toBe(200);
    const res = await app.inject({ url: '/me' });
    expect(res.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json()).error.code).toBe('yetkisiz');
  });

  it('gecerli token request.auth alanini doldurur', async () => {
    const { app, sign } = await setup();
    const kurumId = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';
    const token = await sign({ kurum_id: kurumId, roller: ['ogretmen', 'yonetici'] });
    const res = await app.inject({ url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ auth: { kurumId: string; roller: string[] } }>().auth).toMatchObject({
      kurumId,
      roller: ['ogretmen', 'yonetici'],
    });
  });

  it('kurum_id olmayan veya bozuk token reddedilir', async () => {
    const { app, sign } = await setup();
    const noTenant = await sign({});
    expect(
      (await app.inject({ url: '/me', headers: { authorization: `Bearer ${noTenant}` } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/me', headers: { authorization: 'Bearer bozuk' } })).statusCode,
    ).toBe(401);
  });
});
