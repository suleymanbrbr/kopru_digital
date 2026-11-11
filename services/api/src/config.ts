import { createEnvSchema, loadEnv } from '@kopru/service-kit';
import { z } from 'zod';

export const serviceName = 'api';

const base = createEnvSchema({ defaultPort: 4000 });

const devSecret = 'dev-only-secret-change-me-0123456789abcdef';

/** api'ye ozel ortam degiskenleri (taban: service-kit ortak semasi). */
export const envSchema = base.safeExtend({
  // api kimlik dogrulamasinin sahibidir: varsayilan acik.
  AUTH_ENABLED: z.stringbool().default(true),
  /** `api_sistem` rolu baglantisi (BYPASSRLS). Yalnizca withSistem() kullanir. */
  DATABASE_SISTEM_URL: z.string().min(1).optional(),
  /** Herkese acik taban adres (Better Auth baseURL, JWT iss varsayilani). */
  PUBLIC_URL: z.url().default('http://localhost:4000'),
  /** Web uygulamasinin taban adresi; davet baglantilari `${WEB_URL}/davet/<belirtec>` olur. */
  WEB_URL: z.url().default('http://localhost:3000'),
  /** Better Auth imza sirri ve JWKS ozel anahtar sifreleme anahtarinin kaynagi. */
  BETTER_AUTH_SECRET: z.string().min(32).default(devSecret),
  /** `log`: OTP kodu loga yazilir (yalnizca gelistirme). Gercek saglayici bildirim ile gelir. */
  SMS_SAGLAYICI: z.enum(['log']).default('log'),
  /** `log`: e-posta gonderilmez, yalnizca iliski kimligi loglanir. `smtp`: SMTP_HOST ile gonderir. */
  EPOSTA_SAGLAYICI: z.enum(['log', 'smtp']).default('log'),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  /** true: dogrudan TLS (465). false: STARTTLS varsa kullanilir. */
  SMTP_SECURE: z.stringbool().default(false),
  /** Gonderen adresi (From). */
  EPOSTA_GONDEREN: z.string().min(3).default('Köprü <no-reply@kopru.local>'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_CLIENT_SECRET: z.string().min(1).optional(),
  /**
   * Ders kaydi parolalarini AES-256-GCM ile sifreleyen anahtar: 32 bayt, base64
   * (`openssl rand -base64 32`). Yoksa api acilir, parola yazilirken/okunurken 503 doner.
   * Modul bunu `process.env`den okur (`API_KAYNAK_PAROLA_ANAHTARI` ya da `KAYNAK_PAROLA_ANAHTARI`).
   */
  KAYNAK_PAROLA_ANAHTARI: z.string().min(1).optional(),
  /**
   * `medya` servisinin taban adresi (ic uc `POST /ic/okuma-adresleri`, servis JWT'si). Tanimli degilse soru
   * ve mesaj ekleri adressiz doner (`adres_alinamadi: true`).
   */
  MEDYA_URL: z.url().optional(),
  /** `medya` ic cagrisinin zaman asimi (ms); asilirsa soru yine doner, ek adresleri `null` olur. */
  MEDYA_ZAMAN_ASIMI_MS: z.coerce.number().int().min(100).max(30_000).default(2000),
});

export type Env = z.output<typeof envSchema>;

/** Ortam degiskenlerini dogrular; gecersizse surec acik bir hata ile durur. */
export function loadServiceEnv(source?: Record<string, string | undefined>): Env {
  const env = loadEnv(envSchema, {
    service: serviceName,
    // api kendi anahtarlarini yerinde dogruladigi icin JWKS_URL zorunlu degil; tabandaki kontrolu karsilar.
    source: { JWKS_URL: 'http://localhost/.well-known/jwks.json', ...(source ?? process.env) },
  });
  if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET === devSecret) {
    throw new Error('Üretimde BETTER_AUTH_SECRET tanımlanmalı.');
  }
  if (
    env.KAYNAK_PAROLA_ANAHTARI &&
    Buffer.from(env.KAYNAK_PAROLA_ANAHTARI, 'base64').length !== 32
  ) {
    throw new Error('KAYNAK_PAROLA_ANAHTARI 32 bayt olmalı (base64: openssl rand -base64 32).');
  }
  if (env.EPOSTA_SAGLAYICI === 'smtp' && !env.SMTP_HOST) {
    throw new Error('EPOSTA_SAGLAYICI=smtp iken SMTP_HOST tanımlanmalı.');
  }
  return env;
}
