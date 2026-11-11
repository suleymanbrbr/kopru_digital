import { createService, type Service } from '@kopru/service-kit';

import { serviceName, type Env } from './config.js';
import { depolamaOlustur, type Depolama } from './depolama.js';
import { yollariOlustur } from './yollar.js';

export interface BuildOptions {
  onClose?: () => Promise<void>;
  /** Testler icin; verilmezse ortamdan olusturulur (S3_ENDPOINT yoksa yukleme uclari 503 doner). */
  depolama?: Depolama | null;
  simdi?: () => Date;
}

export function buildService(env: Env, options: BuildOptions = {}): Service {
  const depolama = options.depolama === undefined ? depolamaOlustur(env) : options.depolama;
  return createService({
    name: serviceName,
    port: env.PORT,
    env,
    plugins: [
      yollariOlustur({
        depolama,
        varsayilanKotaBayt: env.VARSAYILAN_KOTA_BAYT,
        ...(options.simdi ? { simdi: options.simdi } : {}),
      }),
    ],
    onClose: async () => {
      depolama?.kapat();
      await options.onClose?.();
    },
  });
}

/** Gelistirmede kovayi ve CORS kuralini idempotent hazirlar; hata acilisi engellemez. */
export async function kovaYapilandir(
  env: Env,
  depolama: Depolama | null,
  log: { warn(o: object, m: string): void; info(o: object, m: string): void },
): Promise<void> {
  const aktif = env.S3_KOVA_YAPILANDIR ?? env.NODE_ENV !== 'production';
  if (!depolama || !aktif) return;
  try {
    await depolama.kovaHazirla(env.CORS_ORIGINS);
    log.info({ kova: depolama.kova, originler: env.CORS_ORIGINS }, 'kova ve CORS hazır');
  } catch (err) {
    log.warn({ err }, 'kova yapılandırılamadı');
  }
}
