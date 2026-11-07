import { runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

// Ayri surec: isler / olay tuketicileri buraya `setup` ile eklenir.
await runWorker({ name: serviceName, env, onClose: telemetry.shutdown });
