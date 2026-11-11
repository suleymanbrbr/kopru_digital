import { createEnvSchema, loadEnv } from '@kopru/service-kit';
import { z } from 'zod';

export const serviceName = 'medya';

const base = createEnvSchema({ defaultPort: 4003 });

const GIB = 1024 * 1024 * 1024;

/**
 * medya'ya ozel ortam degiskenleri (taban: service-kit ortak semasi). `MEDYA_<ANAHTAR>` oneki ile de
 * okunur (ornek `MEDYA_S3_ENDPOINT`).
 */
export const envSchema = base.safeExtend({
  /** `medya_sistem` rolu baglantisi (BYPASSRLS): isleme, silme, zamanlanmis isler ve outbox relay. */
  DATABASE_SISTEM_URL: z.string().min(1).optional(),
  /** S3 uyumlu nesne depolamanin SERVIS ICI adresi (HEAD/GET/PUT/DELETE). Yoksa yukleme uclari 503 doner. */
  S3_ENDPOINT: z.url().optional(),
  /**
   * Istemciye verilen presigned adreslerin ana makinesi (simulator/tarayici icin, ornek
   * `http://localhost:9000`). Yoksa `S3_ENDPOINT` kullanilir.
   */
  S3_GENEL_ENDPOINT: z.url().optional(),
  S3_BUCKET: z.string().min(3).default('medya'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  /**
   * Acilista kovanin varligini ve CORS kuralini (`CORS_ORIGINS`) idempotent ayarlar. Gelistirmede
   * varsayilan acik; uretimde kapali (kova ve CORS altyapi tarafindan yonetilir).
   */
  S3_KOVA_YAPILANDIR: z.stringbool().optional(),
  /** Abonelik olayi gelene kadar kurum basina varsayilan depolama kotasi (bayt). */
  VARSAYILAN_KOTA_BAYT: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * GIB),
  /** Ayni anda islenen dosya sayisi (worker). */
  ISLEME_ESZAMANLILIK: z.coerce.number().int().min(1).max(16).default(2),
  /** Isleme kuyrugu bos iken yoklama araligi (ms). */
  ISLEME_ARALIK_MS: z.coerce.number().int().min(50).default(1000),
  /** Bakim turu (silme, yukleme zaman asimi, yetim kurali) araligi (ms); varsayilan 5 dakika. */
  BAKIM_ARALIK_MS: z.coerce
    .number()
    .int()
    .min(500)
    .default(5 * 60_000),
});

export type Env = z.output<typeof envSchema>;

/** Ortam degiskenlerini dogrular; gecersizse surec acik bir hata ile durur. */
export function loadServiceEnv(source?: Record<string, string | undefined>): Env {
  const env = loadEnv(envSchema, { service: serviceName, ...(source ? { source } : {}) });
  if (env.NODE_ENV === 'production' && !env.S3_ENDPOINT) {
    throw new Error('Üretimde S3_ENDPOINT tanımlanmalı.');
  }
  if (env.S3_ENDPOINT && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('S3_ENDPOINT iken S3_ACCESS_KEY_ID ve S3_SECRET_ACCESS_KEY tanımlanmalı.');
  }
  return env;
}
