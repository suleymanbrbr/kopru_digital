import { errorCodes } from '@kopru/contracts';
import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

import { AppError } from './errors.js';

/**
 * Servisler arasi ic cagri kimligi (ADR 0004 "Servisler arasi cagri kimligi"). `/ic/*` uc noktalari
 * kullanici JWT'sini kabul etmez; yalnizca `api`nin JWKS ile imzaladigi kisa omurlu (5 dk) servis JWT'si:
 * `sub=servis:<cagiran>`, `aud=<bu servis>`, `scope=<bosluklu liste>`.
 */

/** Servis belirteci `sub` on eki. Kullanici belirteclerinin `sub`'i UUID'dir, bu on eki tasiyamaz. */
export const SERVIS_SUB_ONEKI = 'servis:';
/** Servis belirteci omru (api imzalarken, dogrulayici da bundan uzun omurlu belirteci reddeder). */
export const SERVIS_BELIRTECI_OMRU_SN = 5 * 60;

export interface ServisKimligi {
  /** `sub` claim'indeki `servis:` onekinden sonrasi, ornek `bildirim`. */
  servis: string;
  scope: string[];
  claims: JWTPayload;
}

export type VerifyServisJwt = (token: string) => Promise<ServisKimligi>;

export interface ServisJwtDogrulayiciSecenekleri {
  jwksUrl?: string;
  /** Testler / yerinde dogrulama (api kendi anahtarlariyla) icin `jwksUrl` yerine. */
  keySet?: JWTVerifyGetKey;
  issuer?: string;
  /** Bu servisin adi (`aud`). Zorunlu: baska servise yazilmis belirtec kabul edilmez. */
  audience: string;
  /** Saat sapmasi payi (sn). Varsayilan 5. */
  saatPayiSn?: number;
}

const yetkisiz = () =>
  new AppError(401, errorCodes.unauthorized, 'Servis kimliği geçersiz veya süresi dolmuş.');

function scopeListesi(value: unknown): string[] {
  return typeof value === 'string' ? value.split(/\s+/).filter((s) => s.length > 0) : [];
}

/**
 * Servis JWT'sini dogrular: imza (EdDSA), `iss`, `aud` (bu servis), `exp`; `sub` `servis:` onekiyle
 * baslamali; belirtec omru en fazla `SERVIS_BELIRTECI_OMRU_SN` (+ saat payi) olmali.
 */
export function createServisJwtVerifier(options: ServisJwtDogrulayiciSecenekleri): VerifyServisJwt {
  const keySet =
    options.keySet ?? (options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined);
  if (!keySet) throw new Error('Servis JWT doğrulaması için jwksUrl veya keySet gerekli');
  const pay = options.saatPayiSn ?? 5;

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ['EdDSA'],
        audience: options.audience,
        clockTolerance: pay,
        ...(options.issuer ? { issuer: options.issuer } : {}),
      });
      const { sub, iat, exp } = payload;
      if (!sub?.startsWith(SERVIS_SUB_ONEKI) || sub.length === SERVIS_SUB_ONEKI.length) {
        throw yetkisiz();
      }
      // `exp` zorunlu (jwtVerify bos exp'i kabul eder); omru sinirsiz belirtec servis belirteci degildir.
      if (exp === undefined || iat === undefined || exp - iat > SERVIS_BELIRTECI_OMRU_SN + pay) {
        throw yetkisiz();
      }
      return {
        servis: sub.slice(SERVIS_SUB_ONEKI.length),
        scope: scopeListesi(payload.scope),
        claims: payload,
      };
    } catch (err) {
      throw err instanceof AppError ? err : yetkisiz();
    }
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Yalniz `config.servisScope` tanimli (`/ic/*`) rotalarda, dogrulama sonrasi dolu. */
    servis: ServisKimligi | null;
  }
  interface FastifyContextConfig {
    /**
     * Rota yalnizca servis JWT'si ile cagrilabilir ve bu scope(lar)in TAMAMI gerekir. Tanimliysa kullanici
     * JWT'si (`installAuth`) bu rotada aranmaz; kullanici belirteci reddedilir.
     */
    servisScope?: string | readonly string[];
  }
}

const IC_ON_EKI = '/ic/';

/**
 * `config.servisScope` tanimli rotalarda servis JWT'sini ister: belirtec yok/gecersiz/yanlis `aud` ya da
 * kullanici belirteci -> 401; gecerli ama scope eksik -> 403. `/ic/` altinda `servisScope` tanimsiz bir
 * rota **kapali** davranir (403): ic uc noktasi yanlislikla kullanici JWT'sine acik kalmaz.
 * `enabled=false` (AUTH_ENABLED=false, yalniz gelistirme) iken `installAuth` gibi dogrulama yapilmaz.
 */
export function installServisAuth(
  app: FastifyInstance,
  options: { enabled: boolean; verify?: VerifyServisJwt },
): void {
  app.decorateRequest('servis', null);
  const { enabled, verify } = options;
  if (enabled && !verify) throw new Error('AUTH_ENABLED iken verifyServisJwt sağlanmalı');

  app.addHook('onRequest', async (request) => {
    const gerekli = request.routeOptions.config.servisScope;
    if (gerekli === undefined) {
      if (request.routeOptions.url?.startsWith(IC_ON_EKI) && !request.routeOptions.config.public) {
        request.log.error(
          { url: request.routeOptions.url },
          '/ic/ rotasında servisScope tanımlı değil; istek reddedildi',
        );
        throw new AppError(403, errorCodes.forbidden, 'Bu işlem için yetkiniz yok.');
      }
      return;
    }
    if (!enabled || !verify) return;

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw yetkisiz();
    const servis = await verify(token);
    const istenen = typeof gerekli === 'string' ? [gerekli] : gerekli;
    const eksik = istenen.filter((s) => !servis.scope.includes(s));
    if (eksik.length > 0) {
      request.log.warn({ servis: servis.servis, eksik }, 'servis belirtecinde scope eksik');
      throw new AppError(403, errorCodes.forbidden, 'Bu işlem için yetkiniz yok.');
    }
    request.servis = servis;
    request.log = request.log.child({ servis: servis.servis });
  });
}
