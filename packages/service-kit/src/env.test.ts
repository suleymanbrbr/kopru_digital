import { describe, expect, it } from 'vitest';

import { createEnvSchema, EnvError, loadEnv } from './env.js';

const schema = createEnvSchema({ defaultPort: 4000 });

describe('loadEnv', () => {
  it('varsayilanlari uygular', () => {
    const env = loadEnv(schema, { source: {} });
    expect(env.PORT).toBe(4000);
    expect(env.AUTH_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('servis oneki olan degiskeni onceler ve bos degeri yok sayar', () => {
    const env = loadEnv(schema, {
      service: 'api',
      source: {
        PORT: '1',
        API_PORT: '4100',
        DATABASE_URL: 'postgres://genel',
        API_DATABASE_URL: 'postgres://api',
        MEDYA_DATABASE_URL: 'postgres://medya',
        JWKS_URL: '',
      },
    });
    expect(env.PORT).toBe(4100);
    expect(env.DATABASE_URL).toBe('postgres://api');
    expect(env.JWKS_URL).toBeUndefined();
  });

  it('gecersiz degerde okunabilir hata ile coker', () => {
    expect(() => loadEnv(schema, { source: { PORT: 'abc' } })).toThrow(EnvError);
    expect(() => loadEnv(schema, { source: { PORT: 'abc' } })).toThrow(/PORT/);
  });

  it('AUTH_ENABLED=true iken JWKS_URL ister', () => {
    expect(() => loadEnv(schema, { source: { AUTH_ENABLED: 'true' } })).toThrow(/JWKS_URL/);
    const env = loadEnv(schema, {
      source: { AUTH_ENABLED: 'true', JWKS_URL: 'https://auth.example.com/jwks.json' },
    });
    expect(env.AUTH_ENABLED).toBe(true);
  });
});
