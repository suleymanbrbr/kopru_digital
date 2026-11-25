import { createRequire } from 'node:module';

import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import type { BaseEnv } from './env.js';

const require = createRequire(import.meta.url);

const GIZLI_SORGU = /([?&](?:belirtec|token|code|kod|state)=)[^&#]*/gi;

/** Sorgu dizisindeki dogrulama/OAuth belirteclerini loga yazmadan once maskeler (ornek: e-posta dogrulama). */
export function urlTemizle(url: string): string {
  return url.replace(GIZLI_SORGU, '$1[gizli]');
}

interface IstekGorunumu {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}

/**
 * Kisisel veri ve sir alanlari: bu anahtarlar log nesnesinin kokunde, bir ve iki seviye altinda
 * (`*.x`, `*.*.x`) `[gizli]` olur. Dogrulayan test: `logger.test.ts` ("bilinen yollar").
 * Yeni alan eklerken Turkce ve Ingilizce yazimini birlikte ekleyin. Fastify istek govdesini zaten loglamaz;
 * bu liste yine de `log.info({ kisi }, ...)` gibi kazara yazimlara karsi son savunmadir.
 */
export const GIZLI_ALANLAR = [
  // Kisisel veri
  'ad',
  'adi',
  'soyad',
  'ad_soyad',
  'adSoyad',
  'gorunen_ad',
  'gorunenAd',
  'telefon',
  'telefon_no',
  'telefonNo',
  'eposta',
  'e_posta',
  'email',
  'phone',
  // Kimlik dogrulama / sir
  'otp',
  'otp_kodu',
  'otpKodu',
  'dogrulama_kodu',
  'dogrulamaKodu',
  'parola',
  'parola_hash',
  'sifre',
  'password',
  'belirtec',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'access_token',
  'refresh_token',
  'id_token',
  'push_belirteci',
  'pushBelirteci',
  'secret',
  'client_secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
] as const;

/** Yalniz baslik yollari pino `redact` ile (sabit, ucuz); alanlar `gizliTemizle` ile maskelenir. */
export const GIZLI_YOLLAR: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
];

const GIZLI_KUME: ReadonlySet<string> = new Set(GIZLI_ALANLAR);
const MAKS_DERINLIK = 4;

const duzNesneMi = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Log nesnesinde `GIZLI_ALANLAR` anahtarlarini her derinlikte (en cok 4 seviye) `[gizli]` yapar; yalniz
 * degisen dallar kopyalanir, girdi degistirilmez. Dizilere ve duz nesnelere girer; `Error`, Buffer vb. ozel
 * nesnelere girmez (`err` serilestiricisi ayrica isler). pino'nun joker karakterli `redact` yollari
 * (`*.*.x`) cok yavas oldugu icin (olculdu: ~180 us/log, bu islev ~6 us/log) bu islev kullanilir.
 */
export function gizliTemizle<T>(deger: T, derinlik = 0): T {
  if (derinlik > MAKS_DERINLIK) return deger;
  if (Array.isArray(deger)) {
    const kaynak = deger as unknown[];
    let kopya: unknown[] | undefined;
    for (const [i, oge] of kaynak.entries()) {
      const yeni = gizliTemizle(oge, derinlik + 1);
      if (yeni !== oge) (kopya ??= [...kaynak])[i] = yeni;
    }
    return (kopya ?? deger) as T;
  }
  if (!duzNesneMi(deger)) return deger;
  let kopya: Record<string, unknown> | undefined;
  for (const [anahtar, oge] of Object.entries(deger)) {
    const yeni = GIZLI_KUME.has(anahtar) ? '[gizli]' : gizliTemizle(oge, derinlik + 1);
    if (yeni !== oge) (kopya ??= { ...deger })[anahtar] = yeni;
  }
  return (kopya ?? deger) as T;
}

/** Yapisal JSON log; yalnizca development + TTY'de okunabilir cikti. */
export function createLogger(
  name: string,
  env: Pick<BaseEnv, 'LOG_LEVEL' | 'NODE_ENV'>,
  /** Testler icin hedef akis; verilmezse stdout. */
  hedef?: DestinationStream,
): Logger {
  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;
  const secenekler: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: name },
    redact: { paths: GIZLI_YOLLAR, censor: '[gizli]' },
    formatters: { log: (nesne) => gizliTemizle(nesne) },
    serializers: {
      // Fastify varsayilan `req` serilestiricisinin aynisi; yalnizca url sorgusu maskelenir.
      req: (req: IstekGorunumu) => ({
        method: req.method,
        url: req.url === undefined ? undefined : urlTemizle(req.url),
        version: req.headers?.['accept-version'],
        host: req.host,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
    },
    ...(pretty
      ? { transport: { target: require.resolve('pino-pretty'), options: { colorize: true } } }
      : {}),
  };
  return hedef ? pino(secenekler, hedef) : pino(secenekler);
}
