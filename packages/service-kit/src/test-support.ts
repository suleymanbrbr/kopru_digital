import { createEnvSchema, loadEnv, type BaseEnv } from './env.js';

/** Testler icin gecerli, sessiz bir env uretir. */
export function testEnv(overrides: Record<string, string> = {}): BaseEnv {
  return loadEnv(createEnvSchema({ defaultPort: 0 }), {
    source: { NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides },
  });
}
