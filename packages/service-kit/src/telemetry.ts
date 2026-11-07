import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

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
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
  });
  sdk.start();
  return { enabled: true, shutdown: () => sdk.shutdown() };
}
