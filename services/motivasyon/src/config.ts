import { createEnvSchema, loadEnv } from '@kopru/service-kit';

export const serviceName = 'motivasyon';

export const envSchema = createEnvSchema({ defaultPort: 4001 });

export type Env = ReturnType<typeof loadServiceEnv>;

/** Ortam degiskenlerini dogrular; gecersizse surec acik bir hata ile durur. */
export function loadServiceEnv(source?: Record<string, string | undefined>) {
  return loadEnv(envSchema, { service: serviceName, ...(source ? { source } : {}) });
}
