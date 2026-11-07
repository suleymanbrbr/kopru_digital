import { createService, type Service } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { modulesPlugin } from './modules/index.js';

export function buildService(env: Env, options: { onClose?: () => Promise<void> } = {}): Service {
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    plugins: [modulesPlugin],
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
}
