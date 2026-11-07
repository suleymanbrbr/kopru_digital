import { runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

// Ayri surec: isler / olay tuketicileri buraya `setup` ile eklenir.
// Outbox relay satirlari guncelledigi/sildigi icin `api_sistem` baglantisini kullanir (ADR 0003);
// `api_app` outbox'a yalnizca ekleme yapar.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: 'ortak.outbox',
  onClose: telemetry.shutdown,
});
