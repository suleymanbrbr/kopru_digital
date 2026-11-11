import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createJwtVerifier } from './auth.js';
import { createService, type Service, type ServicePlugin } from './service.js';
import { createServisJwtVerifier, SERVIS_BELIRTECI_OMRU_SN } from './servis-auth.js';
import { testEnv } from './test-support.js';

const ISSUER = 'https://api.test';
const KULLANICI_ID = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';

let imza: CryptoKey;
let yabanci: CryptoKey;
let yerelKeySet: ReturnType<typeof createLocalJWKSet>;
/** beforeAll'da hazirlanan anahtar kumesine tembel baglanir (describe govdeleri daha once calisir). */
const keySet: JWTVerifyGetKey = (baslik, jwt) => yerelKeySet(baslik, jwt);

beforeAll(async () => {
  const anahtar = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  imza = anahtar.privateKey;
  yerelKeySet = createLocalJWKSet({
    keys: [{ ...(await exportJWK(anahtar.publicKey)), kid: 'k1', alg: 'EdDSA', use: 'sig' }],
  });
  yabanci = (await generateKeyPair('EdDSA', { crv: 'Ed25519' })).privateKey;
});

interface TokenSecenekleri {
  sub?: string;
  aud?: string;
  scope?: string;
  exp?: string | number;
  iat?: number;
  anahtar?: CryptoKey;
  claims?: Record<string, unknown>;
}

async function token(o: TokenSecenekleri = {}): Promise<string> {
  const jwt = new SignJWT({
    ...(o.scope === undefined ? { scope: 'iletisim.oku' } : o.scope ? { scope: o.scope } : {}),
    ...o.claims,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject(o.sub ?? 'servis:bildirim')
    .setIssuer(ISSUER)
    .setAudience(o.aud ?? 'api')
    .setIssuedAt(o.iat)
    .setExpirationTime(o.exp ?? `${String(SERVIS_BELIRTECI_OMRU_SN)}s`);
  return jwt.sign(o.anahtar ?? imza);
}

/** Kullanici erisim belirteci (ADR 0004): aud=kopru, sub=kullanici UUID'si, kurum_id. */
const kullaniciToken = () =>
  new SignJWT({ kurum_id: KULLANICI_ID, sid: 'sid-1' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject(KULLANICI_ID)
    .setIssuer(ISSUER)
    .setAudience('kopru')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(imza);

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

const rotalar: ServicePlugin = (app) => {
  app.get('/ic/iletisim', { config: { servisScope: 'iletisim.oku' } }, (request) => ({
    servis: request.servis?.servis,
    scope: request.servis?.scope,
    auth: request.auth,
  }));
  app.get('/ic/cift', { config: { servisScope: ['a.oku', 'b.oku'] } }, () => ({ ok: true }));
  app.get('/ic/korumasiz', () => ({ ok: true }));
  app.get('/v1/kullanici', (request) => ({ kullanici: request.auth?.kullaniciId }));
  return Promise.resolve();
};

let service: Service | undefined;
afterEach(async () => {
  await service?.stop();
  service = undefined;
});

async function build(authEnabled = true) {
  service = createService({
    name: 'api',
    port: 0,
    env: testEnv(
      authEnabled
        ? { AUTH_ENABLED: 'true', JWKS_URL: 'http://localhost/.well-known/jwks.json' }
        : {},
    ),
    plugins: [rotalar],
    verifyJwt: createJwtVerifier({ keySet, issuer: ISSUER, audience: 'kopru' }),
    verifyServisJwt: createServisJwtVerifier({ keySet, issuer: ISSUER, audience: 'api' }),
  });
  await service.app.ready();
  return service.app;
}

describe('createServisJwtVerifier', () => {
  const dogrula = createServisJwtVerifier({ keySet, issuer: ISSUER, audience: 'api' });

  it('gecerli servis belirtecini kabul eder', async () => {
    const kimlik = await dogrula(await token({ scope: 'iletisim.oku medya.oku' }));
    expect(kimlik.servis).toBe('bildirim');
    expect(kimlik.scope).toEqual(['iletisim.oku', 'medya.oku']);
  });

  it.each([
    ['yanlis aud', () => token({ aud: 'medya' })],
    ['kullanici belirteci (aud=kopru, sub=UUID)', kullaniciToken],
    ['servis: oneki olmayan sub', () => token({ sub: KULLANICI_ID })],
    ['bos servis adi', () => token({ sub: 'servis:' })],
    [
      'suresi dolmus',
      () =>
        token({
          exp: Math.floor(Date.now() / 1000) - 60,
          iat: Math.floor(Date.now() / 1000) - 600,
        }),
    ],
    ['baska anahtarla imzali', () => token({ anahtar: yabanci })],
    ['omru 5 dakikadan uzun', () => token({ exp: Math.floor(Date.now() / 1000) + 3600 })],
    [
      'yanlis issuer',
      async () => {
        return new SignJWT({ scope: 'iletisim.oku' })
          .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
          .setSubject('servis:bildirim')
          .setIssuer('https://baska')
          .setAudience('api')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(imza);
      },
    ],
  ])('%s reddedilir', async (_ad, uret) => {
    await expect(dogrula(await uret())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('scope claim yoksa bos liste doner', async () => {
    const kimlik = await dogrula(await token({ scope: '' }));
    expect(kimlik.scope).toEqual([]);
  });
});

describe('installServisAuth (/ic/* rotalari)', () => {
  it('gecerli servis belirteci ve scope ile 200; kullanici auth alani bos', async () => {
    const app = await build();
    const res = await app.inject({ url: '/ic/iletisim', headers: bearer(await token()) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ servis: 'bildirim', scope: ['iletisim.oku'], auth: null });
  });

  it('yanlis aud -> 401', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/ic/iletisim',
      headers: bearer(await token({ aud: 'medya' })),
    });
    expect(res.statusCode).toBe(401);
  });

  it('eksik scope -> 403', async () => {
    const app = await build();
    const res = await app.inject({
      url: '/ic/iletisim',
      headers: bearer(await token({ scope: 'baska.oku' })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('yasak');
  });

  it('birden fazla scope: hepsi gerekir', async () => {
    const app = await build();
    const eksik = await app.inject({
      url: '/ic/cift',
      headers: bearer(await token({ scope: 'a.oku' })),
    });
    expect(eksik.statusCode).toBe(403);
    const tam = await app.inject({
      url: '/ic/cift',
      headers: bearer(await token({ scope: 'b.oku a.oku' })),
    });
    expect(tam.statusCode).toBe(200);
  });

  it("kullanici JWT'si /ic/* uc noktasinda 401", async () => {
    const app = await build();
    const res = await app.inject({ url: '/ic/iletisim', headers: bearer(await kullaniciToken()) });
    expect(res.statusCode).toBe(401);
  });

  it('belirtec yok -> 401', async () => {
    const app = await build();
    expect((await app.inject({ url: '/ic/iletisim' })).statusCode).toBe(401);
  });

  it('suresi dolmus servis belirteci -> 401', async () => {
    const app = await build();
    const simdi = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      url: '/ic/iletisim',
      headers: bearer(await token({ iat: simdi - 700, exp: simdi - 400 })),
    });
    expect(res.statusCode).toBe(401);
  });

  it('servis belirteci kullanici uc noktalarinda gecmez (aud=kopru degil)', async () => {
    const app = await build();
    const res = await app.inject({ url: '/v1/kullanici', headers: bearer(await token()) });
    expect(res.statusCode).toBe(401);
  });

  it("kullanici JWT'si kullanici uc noktalarinda calismaya devam eder", async () => {
    const app = await build();
    const res = await app.inject({ url: '/v1/kullanici', headers: bearer(await kullaniciToken()) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kullanici: KULLANICI_ID });
  });

  it("servisScope tanimsiz /ic/ rotasi kapali (kullanici JWT'si 403, servis belirteci 401)", async () => {
    const app = await build();
    const res = await app.inject({ url: '/ic/korumasiz', headers: bearer(await kullaniciToken()) });
    expect(res.statusCode).toBe(403);
    expect(
      (await app.inject({ url: '/ic/korumasiz', headers: bearer(await token()) })).statusCode,
    ).toBe(401);
  });

  it('AUTH_ENABLED=false iken (gelistirme) servis rotalari dogrulama istemez', async () => {
    const app = await build(false);
    const res = await app.inject({ url: '/ic/iletisim' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ servis?: string }>().servis).toBeUndefined();
  });
});
