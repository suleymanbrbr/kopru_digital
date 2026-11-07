import { createService, type Service } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { createKimlik, type SmsGonderici } from './modules/hesap/index.js';
import { modulesPlugin } from './modules/index.js';

export interface BuildOptions {
  onClose?: () => Promise<void>;
  /** Testler ve bildirim servisi entegrasyonu icin SMS gondericisi (varsayilan: log). */
  sms?: SmsGonderici;
}

export function buildService(env: Env, options: BuildOptions = {}): Service {
  const kimlik = createKimlik(env, options.sms ? { sms: options.sms } : {});
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    verifyJwt: kimlik.verifyJwt,
    plugins: [kimlik.plugin, modulesPlugin],
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
