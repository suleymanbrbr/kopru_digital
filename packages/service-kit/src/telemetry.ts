import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { metrikler } from './metrikler.js';

/** `OTEL_METRIC_EXPORT_INTERVAL` (ms); varsayilan 15 sn (alarm kurallari 1 dk'lik pencerelere gore secildi). */
function metrikAraligi(): number {
  const ham = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL);
  return Number.isFinite(ham) && ham >= 1000 ? ham : 15_000;
}

export interface Telemetry {
  enabled: boolean;
  shutdown: () => Promise<void>;
}

/**
 * OpenTelemetry'yi baslatir. `OTEL_EXPORTER_OTLP_ENDPOINT` tanimli degilse hicbir sey yapmaz.
 * Exporter'lar endpoint'i standart OTEL_* degiskenlerinden okur.
 * Otomatik enstrumantasyon (http, pg) sonraki adimdir: ESM icin `--import` ile yuklenmelidir.
 */
export function startTelemetry(
  serviceName: string,
  endpoint: string | undefined = process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
): Telemetry {
  if (!endpoint) {
    return { enabled: false, shutdown: () => Promise.resolve() };
  }
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: metrikAraligi(),
      }),
    ],
  });
  sdk.start();
  // Ortak metrikleri (metrikler.ts) kaydedilmis olcere bagla; oncesinde no-op'tular.
  metrikler.baglan(metrics.getMeter('kopru'));
  return { enabled: true, shutdown: () => sdk.shutdown() };
}
