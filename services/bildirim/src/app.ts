import { createService, type Service } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';

export function buildService(env: Env, options: { onClose?: () => Promise<void> } = {}): Service {
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
