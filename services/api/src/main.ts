import { startTelemetry } from '@kopru/service-kit';

import { buildService } from './app.js';
import { loadServiceEnv, serviceName } from './config.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(serviceName, env.OTEL_EXPORTER_OTLP_ENDPOINT);

await buildService(env, { onClose: telemetry.shutdown }).start();
