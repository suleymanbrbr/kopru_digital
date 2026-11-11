import { startTelemetry } from '@kopru/service-kit';

import { buildService, kovaYapilandir } from './app.js';
import { loadServiceEnv, serviceName } from './config.js';
import { depolamaOlustur } from './depolama.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(serviceName, env.OTEL_EXPORTER_OTLP_ENDPOINT);
const depolama = depolamaOlustur(env);
const service = buildService(env, { depolama, onClose: telemetry.shutdown });

await kovaYapilandir(env, depolama, service.app.log);
await service.start();
