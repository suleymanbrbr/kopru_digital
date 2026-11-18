import { createDb } from '@kopru/service-kit';
import { SignJWT } from 'jose';

import { loadServiceEnv } from '../src/config.js';
import { AnahtarDeposu, JWT_AUDIENCE } from '../src/modules/hesap/index.js';

/**
 * GELISTIRME/DENEME ARACI: `plat` claim'li kisa omurlu erisim belirteci basar (stdout).
 *
 * Platform kimlik paketi (P1: platform girisi, 2FA, IP izin listesi) birlestirilene kadar, platform
 * ucunu elle denemek icin tek yol budur. Gercek anahtarlar ve DB kullanilir (api'nin ortami: API_DATABASE_URL,
 * API_BETTER_AUTH_SECRET, API_PUBLIC_URL/JWT_ISSUER). URETIMDE KULLANILMAZ.
 *
 *   pnpm --filter @kopru/api exec tsx scripts/platform-belirteci.ts <kullanici_id> [yonetici|destek]
 */
const [kullaniciId, plat = 'yonetici'] = process.argv.slice(2);
if (!kullaniciId) {
  console.error('Kullanım: platform-belirteci.ts <kullanici_id> [yonetici|destek]');
  process.exit(2);
}
const env = loadServiceEnv();
if (env.NODE_ENV === 'production') throw new Error('Üretimde çalıştırılamaz.');
if (!env.DATABASE_URL) throw new Error('API_DATABASE_URL tanımlı değil');
const db = createDb({ url: env.DATABASE_URL, max: 1 });
try {
  const anahtarlar = new AnahtarDeposu(() => db, env.BETTER_AUTH_SECRET);
  const { kid, key } = await anahtarlar.imzaAnahtari();
  const belirtec = await new SignJWT({ plat })
    .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
    .setSubject(kullaniciId)
    .setIssuer(env.JWT_ISSUER ?? env.PUBLIC_URL)
    .setAudience(env.JWT_AUDIENCE ?? JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
  process.stdout.write(`${belirtec}\n`);
} finally {
  await db.close();
}
