import { createRequire } from 'node:module';

import { pino, type Logger } from 'pino';

import type { BaseEnv } from './env.js';

const require = createRequire(import.meta.url);

const GIZLI_SORGU = /([?&](?:belirtec|token|code|kod|state)=)[^&#]*/gi;

/** Sorgu dizisindeki dogrulama/OAuth belirteclerini loga yazmadan once maskeler (ornek: e-posta dogrulama). */
export function urlTemizle(url: string): string {
  return url.replace(GIZLI_SORGU, '$1[gizli]');
}

interface IstekGorunumu {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}

/** Yapisal JSON log; yalnizca development + TTY'de okunabilir cikti. */
export function createLogger(name: string, env: Pick<BaseEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;
  return pino({
    level: env.LOG_LEVEL,
    base: { service: name },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    serializers: {
      // Fastify varsayilan `req` serilestiricisinin aynisi; yalnizca url sorgusu maskelenir.
      req: (req: IstekGorunumu) => ({
        method: req.method,
        url: req.url === undefined ? undefined : urlTemizle(req.url),
        version: req.headers?.['accept-version'],
        host: req.host,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
    },
    ...(pretty
      ? { transport: { target: require.resolve('pino-pretty'), options: { colorize: true } } }
      : {}),
  });
}
