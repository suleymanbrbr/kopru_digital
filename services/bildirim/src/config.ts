import { createEnvSchema, loadEnv } from '@kopru/service-kit';
import { z } from 'zod';

export const serviceName = 'bildirim';

const base = createEnvSchema({ defaultPort: 4002 });

/**
 * bildirim'e ozel ortam degiskenleri (taban: service-kit ortak semasi). `BILDIRIM_<ANAHTAR>` oneki ile
 * de okunur (ornek `BILDIRIM_PUSH_SAGLAYICI`).
 */
export const envSchema = base.safeExtend({
  /** `bildirim_sistem` rolu baglantisi (BYPASSRLS): gonderim isi, bakim isleri ve outbox relay. */
  DATABASE_SISTEM_URL: z.string().min(1).optional(),
  /** Push saglayicisi: `log` (gelistirme; gonderimi loga yazar, basarili sayar) veya `expo`. */
  PUSH_SAGLAYICI: z.enum(['log', 'expo']).default('log'),
  /** Expo Push API adresi (testlerde sahte sunucu). */
  EXPO_PUSH_URL: z.url().default('https://exp.host/--/api/v2/push/send'),
  /** Expo "enhanced security" erisim belirteci (istege bagli). */
  EXPO_ERISIM_BELIRTECI: z.string().min(1).optional(),
  /**
   * `gonderim.isle` calisma araligi (ms). Hedef: olaydan push'a p95 < 30 sn; 5 sn arayla sorgu ucuzdur
   * (kismi indeks) ve en kotu durumda ~5 sn gecikme ekler.
   */
  GONDERIM_ARALIK_MS: z.coerce.number().int().min(100).default(5000),
});

export type Env = z.output<typeof envSchema>;

/** Ortam degiskenlerini dogrular; gecersizse surec acik bir hata ile durur. */
export function loadServiceEnv(source?: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, { service: serviceName, ...(source ? { source } : {}) });
}
