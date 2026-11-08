import { createService, type Service } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { createKimlik, type EpostaGonderici, type SmsGonderici } from './modules/hesap/index.js';
import { modulesPlugin } from './modules/index.js';

export interface BuildOptions {
  onClose?: () => Promise<void>;
  /** Testler ve bildirim servisi entegrasyonu icin SMS gondericisi (varsayilan: log). */
  sms?: SmsGonderici;
  /** Testler ve bildirim servisi entegrasyonu icin e-posta gondericisi (varsayilan: ortama gore log/SMTP). */
  eposta?: EpostaGonderici;
}

export function buildService(env: Env, options: BuildOptions = {}): Service {
  const kimlik = createKimlik(env, {
    ...(options.sms ? { sms: options.sms } : {}),
    ...(options.eposta ? { eposta: options.eposta } : {}),
  });
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    verifyJwt: kimlik.verifyJwt,
    plugins: [kimlik.plugin, modulesPlugin],
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
