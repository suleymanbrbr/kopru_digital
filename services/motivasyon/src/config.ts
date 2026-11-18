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
  /**
   * `/platform/*` uclarina izin verilen istemci IP'leri (virgullu IP ya da IP/onek). Bos: gelistirmede
   * herkese acik, uretimde (`NODE_ENV=production`) hepsi reddedilir.
   */
  PLATFORM_IP_IZINLI: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
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
