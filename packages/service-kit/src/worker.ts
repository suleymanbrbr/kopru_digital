import { connect, type NatsConnection } from 'nats';
import type { Logger } from 'pino';

import { createDb, type Database } from './db.js';
import type { BaseEnv } from './env.js';
import { createLogger } from './logger.js';
import { ensureEventStream, startOutboxRelay } from './outbox.js';
import { installShutdownHandlers } from './shutdown.js';

export interface WorkerContext {
  name: string;
  env: BaseEnv;
  log: Logger;
  db: Database | null;
  nats: NatsConnection | null;
}

export interface WorkerOptions {
  name: string;
  env: BaseEnv;
  /** Servise ozel is/consumer baslatici; kapanista cagrilacak bir temizleyici dondurebilir. */
  setup?: (context: WorkerContext) => Promise<(() => Promise<void>) | undefined>;
  /** Kapanista (kaynaklar kapandiktan sonra) calisir; ornek: telemetry.shutdown */
  onClose?: () => Promise<void>;
}

/**
 * Worker sureci: servisle ayni imajdan, ayri bir surec olarak calisir (`node dist/worker.js`).
 * DB ve NATS ikisi de tanimliysa outbox relay'i baslatir. SIGTERM/SIGINT ile temiz kapanir.
 * Kapanis tamamlaninca process.exit cagrilir.
 */
export async function runWorker(options: WorkerOptions): Promise<{ stop(): Promise<void> }> {
  const { name, env } = options;
  const log = createLogger(`${name}-worker`, env);
  const db = env.DATABASE_URL
    ? createDb({ url: env.DATABASE_URL, max: env.DATABASE_POOL_MAX })
    : null;
  const nats = env.NATS_URL
    ? await connect({ servers: env.NATS_URL, name: `${name}-worker` })
    : null;

  const cleanups: (() => Promise<void>)[] = [];

  if (db && nats) {
    await ensureEventStream(nats);
    const relay = startOutboxRelay({ db, nats, logger: log });
    cleanups.push(() => relay.stop());
  } else {
    log.info('outbox relay devre dışı (DATABASE_URL ve NATS_URL gerekli)');
  }

  const cleanup = await options.setup?.({ name, env, log, db, nats });
  if (cleanup) cleanups.push(cleanup);

  log.info('worker hazır');

  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= (async () => {
      for (const run of cleanups.reverse()) await run();
      if (nats && !nats.isClosed()) await nats.drain();
      await db?.close();
      await options.onClose?.();
      log.info('worker durduruldu');
    })();
    return stopping;
  };

  installShutdownHandlers(stop, log);
  return { stop };
}
