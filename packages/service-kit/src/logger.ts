import { createRequire } from 'node:module';

import { pino, type Logger } from 'pino';

import type { BaseEnv } from './env.js';

const require = createRequire(import.meta.url);

/** Yapisal JSON log; yalnizca development + TTY'de okunabilir cikti. */
export function createLogger(name: string, env: Pick<BaseEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;
  return pino({
    level: env.LOG_LEVEL,
    base: { service: name },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(pretty
      ? { transport: { target: require.resolve('pino-pretty'), options: { colorize: true } } }
      : {}),
  });
}
