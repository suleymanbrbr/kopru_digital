import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const csv = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** Tum servislerin ortak ortam degiskenleri. Servise ozel alanlar `extend` ile eklenir. */
export function createEnvSchema(options: { defaultPort: number }) {
  return z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      LOG_LEVEL: z.enum(logLevels).default('info'),
      HOST: z.string().min(1).default('0.0.0.0'),
      PORT: z.coerce.number().int().min(0).max(65535).default(options.defaultPort),
      DATABASE_URL: z.string().min(1).optional(),
      DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
      NATS_URL: z.string().min(1).optional(),
      AUTH_ENABLED: z.stringbool().default(false),
      JWKS_URL: z.url().optional(),
      JWT_ISSUER: z.string().min(1).optional(),
      JWT_AUDIENCE: z.string().min(1).optional(),
      CORS_ORIGINS: z.string().default('').transform(csv),
      RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
      OPENAPI_ENABLED: z.stringbool().optional(),
      OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    })
    .check((ctx) => {
      if (ctx.value.AUTH_ENABLED && !ctx.value.JWKS_URL) {
        ctx.issues.push({
          code: 'custom',
          message: 'AUTH_ENABLED=true iken JWKS_URL zorunludur',
          path: ['JWKS_URL'],
          input: ctx.value.JWKS_URL,
        });
      }
    });
}

export type BaseEnv = z.output<ReturnType<typeof createEnvSchema>>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Ortam değişkenleri geçersiz:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Ortam degiskenlerini dogrular; gecersizse EnvError firlatir (fail fast).
 *
 * `service` verilirse `<SERVIS>_<ANAHTAR>` degiskeni `<ANAHTAR>` degiskeninden once okunur
 * (ornek: API_DATABASE_URL). Bos string "tanimsiz" sayilir.
 */
export function loadEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  options: { service?: string; source?: Record<string, string | undefined> } = {},
): z.output<TSchema> {
  const source = options.source ?? process.env;
  const prefix = options.service ? `${options.service.toUpperCase()}_` : undefined;
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === '') continue;
    if (prefix && key.startsWith(prefix)) continue;
    merged[key] = value;
  }
  if (prefix) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== '' && key.startsWith(prefix)) {
        merged[key.slice(prefix.length)] = value;
      }
    }
  }

  const result = schema.safeParse(merged);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(kök)'}: ${issue.message}`),
    );
  }
  return result.data;
}
