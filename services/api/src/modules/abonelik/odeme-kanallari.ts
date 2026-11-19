import type { ServicePlugin } from '@kopru/service-kit';
import fp from 'fastify-plugin';

import { LogEArsivSaglayici, type EArsivSaglayici } from './earsiv.js';
import { IyzicoSaglayici } from './iyzico.js';
import { RevenueCatSaglayici } from './revenuecat.js';
import { SahteOdemeSaglayici, type OdemeKaynagi, type OdemeSaglayici } from './saglayici.js';

/** Odeme kanallarinin ihtiyac duydugu ortam degiskenleri (config.ts `Env` alt kumesi). */
export interface OdemeEnv {
  NODE_ENV: string;
  ODEME_IYZICO: 'kapali' | 'sahte' | 'gercek';
  IYZICO_API_KEY?: string | undefined;
  IYZICO_SECRET_KEY?: string | undefined;
  IYZICO_BASE_URL: string;
  IYZICO_PLAN_KODLARI: Record<string, string>;
  SAHTE_ODEME_SIRRI: string;
  REVENUECAT_WEBHOOK_SIRRI?: string | undefined;
  REVENUECAT_SANDBOX_KABUL?: boolean | undefined;
  EARSIV_SAGLAYICI: 'log';
  PUBLIC_URL: string;
  WEB_URL: string;
}

export interface OdemeGunlugu {
  info(nesne: Record<string, unknown>, mesaj: string): void;
  warn(nesne: Record<string, unknown>, mesaj: string): void;
  error(nesne: Record<string, unknown>, mesaj: string): void;
}

export interface OdemeKanallari {
  /** `null`: kanal kapali (env eksik) -> uclar 503 `odeme_kanali_kapali`. */
  iyzico: OdemeSaglayici | null;
  /** RevenueCat (apple + google). */
  revenuecat: OdemeSaglayici | null;
  eArsiv: EArsivSaglayici;
  /** Magaza sandbox olaylari islenir mi? (uretimde hayir) */
  sandboxKabul: boolean;
  /** Odeme sayfasi donus (callback) adresi (saglayiciya verilir). */
  donusUrl: string;
  /** Donus sonrasi kullanicinin gonderildigi web sayfasi. */
  webUrl: string;
  saglayici(kaynak: OdemeKaynagi): OdemeSaglayici | null;
}

export const DONUS_YOLU = '/v1/abonelik/odeme/iyzico/donus';

/**
 * Env'den kanallari kurar; eksik yapilandirma o kanali kapatir (acilista `warn`). Sahte saglayici yalniz
 * gelistirme/testte (`ODEME_IYZICO=sahte`); uretimde config.ts reddeder.
 */
export function odemeKanallariOlustur(
  env: OdemeEnv,
  log: OdemeGunlugu,
  parcalar: { eArsiv?: EArsivSaglayici; fetch?: typeof fetch } = {},
): OdemeKanallari {
  let iyzico: OdemeSaglayici | null = null;
  if (env.ODEME_IYZICO === 'sahte') {
    iyzico = new SahteOdemeSaglayici(env.SAHTE_ODEME_SIRRI);
    log.warn(
      {},
      'abonelik_odeme_sahte_saglayici: iyzico yerine SAHTE saglayici (yalniz gelistirme)',
    );
  } else if (env.ODEME_IYZICO === 'gercek') {
    if (env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY) {
      iyzico = new IyzicoSaglayici({
        apiKey: env.IYZICO_API_KEY,
        secretKey: env.IYZICO_SECRET_KEY,
        tabanUrl: env.IYZICO_BASE_URL,
        planKodlari: env.IYZICO_PLAN_KODLARI,
        ...(parcalar.fetch ? { fetch: parcalar.fetch } : {}),
      });
    } else {
      log.warn({}, 'abonelik_iyzico_kapali: IYZICO_API_KEY / IYZICO_SECRET_KEY eksik');
    }
  } else {
    log.warn(
      {},
      'abonelik_iyzico_kapali: ODEME_IYZICO=kapali (web odemesi ve iyzico webhook kapali)',
    );
  }
  const revenuecat = env.REVENUECAT_WEBHOOK_SIRRI
    ? new RevenueCatSaglayici(env.REVENUECAT_WEBHOOK_SIRRI)
    : null;
  if (!revenuecat) {
    log.warn(
      {},
      'abonelik_revenuecat_kapali: REVENUECAT_WEBHOOK_SIRRI eksik (magaza webhook kapali)',
    );
  }
  const eArsiv = parcalar.eArsiv ?? new LogEArsivSaglayici(log);
  return {
    iyzico,
    revenuecat,
    eArsiv,
    sandboxKabul: env.REVENUECAT_SANDBOX_KABUL ?? env.NODE_ENV !== 'production',
    donusUrl: `${env.PUBLIC_URL.replace(/\/$/, '')}${DONUS_YOLU}`,
    webUrl: env.WEB_URL.replace(/\/$/, ''),
    saglayici(kaynak) {
      return kaynak === 'iyzico' ? iyzico : revenuecat;
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Odeme kanallari (iyzico, RevenueCat, e-Arsiv); `odemeKanallariPlugin` ekler. */
    abonelikOdeme: OdemeKanallari;
  }
}

/** `app.abonelikOdeme`yi (kapsul disina tasarak) tanimlar; `abonelikModule` bundan once kaydolmalidir. */
export function odemeKanallariPlugin(env: OdemeEnv, hazir?: OdemeKanallari): ServicePlugin {
  return fp(
    (app) => {
      app.decorate('abonelikOdeme', hazir ?? odemeKanallariOlustur(env, app.log));
      return Promise.resolve();
    },
    { name: 'abonelik-odeme-kanallari' },
  );
}
