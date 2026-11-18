import { createJwtVerifier, createService, type Service, type VerifyJwt } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { platformYollari } from './platform-yollari.js';
import { yollariOlustur } from './yollar.js';

export interface BuildOptions {
  onClose?: () => Promise<void>;
  /** Testler icin JWKS yerine yerel dogrulayici. */
  verifyJwt?: VerifyJwt;
  /** Testler icin saat. */
  simdi?: () => Date;
}

/**
 * Kullanici JWT dogrulayicisi. Platform yoneticisi belirteci kurum secmemis olabilir (`kurum_id` yok);
 * `allowNoKurum` bunu kabul eder, kurum uclari (`kimlik`) kurumsuz belirteci zaten 403 ile reddeder.
 */
function jwtDogrulayici(env: Env): VerifyJwt | undefined {
  if (!env.AUTH_ENABLED) return undefined;
  return createJwtVerifier({
    ...(env.JWKS_URL ? { jwksUrl: env.JWKS_URL } : {}),
    ...(env.JWT_ISSUER ? { issuer: env.JWT_ISSUER } : {}),
    ...(env.JWT_AUDIENCE ? { audience: env.JWT_AUDIENCE } : {}),
    allowNoKurum: true,
  });
}

export function buildService(env: Env, options: BuildOptions = {}): Service {
  const verifyJwt = options.verifyJwt ?? jwtDogrulayici(env);
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    ...(verifyJwt ? { verifyJwt } : {}),
    plugins: [
      yollariOlustur({ ...(options.simdi ? { simdi: options.simdi } : {}) }),
      platformYollari({
        sistemUrl: env.DATABASE_SISTEM_URL,
        izinliIpler: env.PLATFORM_IP_IZINLI,
        uretim: env.NODE_ENV === 'production',
      }),
    ],
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
