import { errorCodes } from '@kopru/contracts';
import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

import { AppError } from './errors.js';
import type { IptalDeposu } from './iptal.js';

/** Dogrulanmis istek kimligi. Token claim'leri: `sub`, `kurum_id`, `roller` (dizi veya bosluklu string). */
export interface AuthContext {
  kullaniciId: string;
  /** Kurum secilmemis (ilk giris, uyeligi olmayan kullanici) belirtecte `null`. */
  kurumId: string | null;
  uyelikId: string | null;
  /** Etkin uyelik rolu (`rol` claim'i). */
  rol: string | null;
  sessionId: string | null;
  roller: string[];
  claims: JWTPayload;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** `AUTH_ENABLED=false` iken veya public rotalarda `null`. */
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** true ise JWT istenmez (health, ready, openapi). */
    public?: boolean;
  }
}

export type VerifyJwt = (token: string) => Promise<AuthContext>;

export interface JwtVerifierOptions {
  jwksUrl?: string;
  /** Testler / ozel anahtar kaynaklari icin `jwksUrl` yerine verilebilir. */
  keySet?: JWTVerifyGetKey;
  issuer?: string;
  audience?: string;
  /** true ise `kurum_id` claim'i olmayan belirtec de gecerlidir (varsayilan: false). */
  allowNoKurum?: boolean;
}

const unauthorized = () =>
  new AppError(401, errorCodes.unauthorized, 'Oturumunuz geçersiz veya süresi dolmuş.');

function toRoles(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return value.split(/\s+/).filter((item) => item.length > 0);
  return [];
}

export function createJwtVerifier(options: JwtVerifierOptions): VerifyJwt {
  const keySet =
    options.keySet ?? (options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined);
  if (!keySet) throw new Error('JWT doğrulaması için jwksUrl veya keySet gerekli');

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        ...(options.issuer ? { issuer: options.issuer } : {}),
        ...(options.audience ? { audience: options.audience } : {}),
      });
      const str = (value: unknown) => (typeof value === 'string' ? value : null);
      const kurumId = str(payload.kurum_id);
      if (!payload.sub || (kurumId === null && !options.allowNoKurum)) throw unauthorized();
      return {
        kullaniciId: payload.sub,
        kurumId,
        uyelikId: str(payload.uyelik_id),
        rol: str(payload.rol),
        sessionId: str(payload.sid),
        roller: toRoles(payload.roller),
        claims: payload,
      };
    } catch (err) {
      throw err instanceof AppError ? err : unauthorized();
    }
  };
}

/**
 * `request.auth` alanini doldurur. `enabled` false ise hicbir sey dogrulanmaz (auth = null).
 * `config.public === true` olan rotalar (health, ready, openapi) her zaman acik kalir.
 */
export function installAuth(
  app: FastifyInstance,
  options: { enabled: boolean; verify?: VerifyJwt; iptal?: IptalDeposu },
): void {
  app.decorateRequest('auth', null);
  if (!options.enabled) return;
  const { verify, iptal } = options;
  if (!verify) throw new Error('AUTH_ENABLED iken verifyJwt sağlanmalı');

  app.addHook('onRequest', async (request) => {
    const config = request.routeOptions.config;
    // `/ic/*` (servisScope) rotalari kullanici JWT'si degil servis JWT'si ister (`installServisAuth`).
    if (config.public === true || config.servisScope !== undefined) return;
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw unauthorized();
    const auth = await verify(token);
    // Kontrol sirasi 1 (ADR 0004/0008): imza/exp/aud'dan sonra `sid` iptal listesinde mi.
    if (iptal && auth.sessionId && (await iptal.iptalEdildiMi(auth.sessionId))) {
      throw unauthorized();
    }
    request.auth = auth;
    request.log = request.log.child({ kurumId: request.auth.kurumId ?? undefined });
  });
}
