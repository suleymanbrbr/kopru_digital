import type { Env } from '../config.js';
import { expoSaglayici } from './expo.js';
import { logSaglayici } from './log.js';
import type { PushSaglayici } from './saglayici.js';

export type { PushMesaji, PushSaglayici, PushSonucu } from './saglayici.js';
export { expoSaglayici } from './expo.js';
export { logSaglayici } from './log.js';

/** `BILDIRIM_PUSH_SAGLAYICI=log|expo` (varsayilan `log`). */
export function saglayiciSec(
  env: Pick<Env, 'PUSH_SAGLAYICI' | 'EXPO_PUSH_URL' | 'EXPO_ERISIM_BELIRTECI'>,
  log: Parameters<typeof logSaglayici>[0],
): PushSaglayici {
  if (env.PUSH_SAGLAYICI === 'expo') {
    return expoSaglayici({
      url: env.EXPO_PUSH_URL,
      ...(env.EXPO_ERISIM_BELIRTECI ? { erisimBelirteci: env.EXPO_ERISIM_BELIRTECI } : {}),
    });
  }
  return logSaglayici(log);
}
