import { createEnvSchema, loadEnv } from '@kopru/service-kit';
import { z } from 'zod';

export const serviceName = 'motivasyon';

const base = createEnvSchema({ defaultPort: 4001 });

/**
 * motivasyon'a ozel ortam degiskenleri (taban: service-kit ortak semasi). `MOTIVASYON_<ANAHTAR>` oneki
 * ile de okunur (ornek `MOTIVASYON_DATABASE_SISTEM_URL`).
 */
export const envSchema = base.safeExtend({
  /** `motivasyon_sistem` rolu baglantisi (BYPASSRLS): zamanlanmis isler ve outbox relay. */
  DATABASE_SISTEM_URL: z.string().min(1).optional(),
  /** Haftalik `bu_hafta_xp` sifirlama kontrol araligi (ms); varsayilan 10 dakika. */
  HAFTALIK_ARALIK_MS: z.coerce
    .number()
    .int()
    .min(500)
    .default(10 * 60_000),
});

export type Env = z.output<typeof envSchema>;

/** Ortam degiskenlerini dogrular; gecersizse surec acik bir hata ile durur. */
export function loadServiceEnv(source?: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, { service: serviceName, ...(source ? { source } : {}) });
}
