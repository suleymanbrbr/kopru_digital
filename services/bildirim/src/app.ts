import { createService, type Service, type VerifyJwt } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { yollariOlustur } from './yollar.js';

export interface BuildOptions {
  onClose?: () => Promise<void>;
  /** Testler icin JWKS yerine yerel dogrulayici. */
  verifyJwt?: VerifyJwt;
  /** Testler icin saat. */
  simdi?: () => Date;
}

export function buildService(env: Env, options: BuildOptions = {}): Service {
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    ...(options.verifyJwt ? { verifyJwt: options.verifyJwt } : {}),
    plugins: [yollariOlustur({ ...(options.simdi ? { simdi: options.simdi } : {}) })],
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
