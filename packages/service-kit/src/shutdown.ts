import type { FastifyBaseLogger } from 'fastify';

/**
 * SIGTERM/SIGINT icin temiz kapanis. `stop` bir kez calistirilir; takilirsa zorla cikilir.
 * Donen fonksiyon dinleyicileri kaldirir (testler icin).
 */
export function installShutdownHandlers(
  stop: () => Promise<void>,
  log: Pick<FastifyBaseLogger, 'info' | 'error'>,
  forceExitAfterMs = 10_000,
): () => void {
  let shuttingDown = false;

  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'kapanış sinyali alındı');
    const timer = setTimeout(() => {
      log.error('kapanış zaman aşımına uğradı, zorla çıkılıyor');
      process.exit(1);
    }, forceExitAfterMs);
    timer.unref();
    stop().then(
      () => {
        process.exit(0);
      },
      (err: unknown) => {
        log.error({ err }, 'kapanış sırasında hata');
        process.exit(1);
      },
    );
  };

  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
  return () => {
    process.off('SIGTERM', handler);
    process.off('SIGINT', handler);
  };
}
