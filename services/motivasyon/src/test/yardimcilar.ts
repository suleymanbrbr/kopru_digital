import type { Rol } from '@kopru/contracts';
import { createJwtVerifier, type Service, type VerifyJwt } from '@kopru/service-kit';
import { SignJWT, generateKeyPair } from 'jose';
import { uuidv7 } from 'uuidv7';
import { inject } from 'vitest';

import { buildService } from '../app.js';
import { loadServiceEnv } from '../config.js';

export const testDb = () => inject('testDb');
export const testNats = () => inject('testNats');

export const dbYok = () => {
  const yok = testDb() === null;
  if (yok) console.warn('[motivasyon testleri] DATABASE_URL tanımlı değil: DB testleri atlanıyor.');
  return yok;
};
export const natsYok = () => {
  const yok = testDb() === null || testNats() === null;
  if (yok) console.warn('[motivasyon testleri] NATS_URL tanımlı değil: olay testleri atlanıyor.');
  return yok;
};

// --- JWT -------------------------------------------------------------------------------------
const anahtar = await generateKeyPair('EdDSA');
const keySet = () => Promise.resolve(anahtar.publicKey);
export const kullaniciDogrulayici: VerifyJwt = createJwtVerifier({ keySet });

export interface Kimlik {
  kullaniciId: string;
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

export const yeniKimlik = (rol: Rol, kurumId: string = uuidv7()): Kimlik => ({
  kullaniciId: uuidv7(),
  kurumId,
  uyelikId: uuidv7(),
  rol,
});

export async function kullaniciTokeni(k: Kimlik): Promise<string> {
  return new SignJWT({ kurum_id: k.kurumId, uyelik_id: k.uyelikId, rol: k.rol, sid: uuidv7() })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(k.kullaniciId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(anahtar.privateKey);
}

export function yetki(token: string) {
  return { authorization: `Bearer ${token}` };
}

// --- Servis ----------------------------------------------------------------------------------
export function testServisi(
  ek: Record<string, string> = {},
  options: { simdi?: () => Date } = {},
): Service {
  const db = testDb();
  if (!db) throw new Error('testDb yok');
  const env = loadServiceEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTH_ENABLED: 'true',
    JWKS_URL: 'http://localhost/.well-known/jwks.json',
    DATABASE_URL: db.appUrl,
    ...ek,
  });
  return buildService(env, {
    verifyJwt: kullaniciDogrulayici,
    ...(options.simdi ? { simdi: options.simdi } : {}),
  });
}

/** drizzle hatayi sarar; veritabani mesaji `cause` icindedir. Hata beklenen istekler icin birlesik metin. */
export async function hataMetni(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as Error & { cause?: { message?: string } };
    return `${e.message} ${e.cause?.message ?? ''}`;
  }
  throw new Error('Hata bekleniyordu ama istek basarili oldu');
}
