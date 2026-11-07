import { errorCodes, type Kapsam, type Rol } from '@kopru/contracts';
import {
  AppError,
  createDb,
  createJwtVerifier,
  type Database,
  type ServicePlugin,
  type VerifyJwt,
} from '@kopru/service-kit';
import fp from 'fastify-plugin';

import type { Env } from '../../config.js';
import { AnahtarDeposu } from './anahtarlar.js';
import { createBetterAuth, type KimlikDogrulama } from './better-auth.js';
import { JWT_AUDIENCE } from './erisim-belirteci.js';
import { onayGerekliMi, rizaDurumu } from './riza.js';
import { LogSmsGonderici, type SmsGonderici } from './sms.js';

/** `requirePermission` sonrasi istege eklenen yetki baglami. */
export interface YetkiBaglami {
  kullaniciId: string;
  kurumId: string;
  uyelikId: string;
  rol: Rol;
  subeId: string | null;
  /** Etkin kapsam: rolun izin kapsami, uyeligin `sube_id` degeri ile daraltilmis. */
  kapsam: Kapsam;
}

export interface KimlikHizmeti {
  env: Env;
  issuer: string;
  db: Database;
  /** `api_sistem` havuzu; DATABASE_SISTEM_URL yoksa null. */
  sistemDb: Database | null;
  auth: KimlikDogrulama;
  anahtarlar: AnahtarDeposu;
  sms: SmsGonderici;
}

declare module 'fastify' {
  interface FastifyInstance {
    kimlik: KimlikHizmeti;
  }
  interface FastifyRequest {
    yetki: YetkiBaglami | null;
  }
  interface FastifyContextConfig {
    /** true ise KVKK riza kontrolu yapilmaz (riza uc noktalari, oturum, profil). */
    rizaMuaf?: boolean;
  }
}

export interface KimlikSecenekleri {
  /** Testler / bildirim servisi geldiginde gercek gonderici. */
  sms?: SmsGonderici;
}

/**
 * Kimlik katmani: Better Auth, JWT anahtar deposu, KVKK riza korumasi ve `app.kimlik`.
 * `verifyJwt` hizmetin kendi anahtarlariyla yerinde dogrulama yapar (self HTTP cagrisi yok);
 * diger servisler ayni anahtarlari `/.well-known/jwks.json` uzerinden alir.
 */
export function createKimlik(env: Env, options: KimlikSecenekleri = {}) {
  const issuer = env.JWT_ISSUER ?? env.PUBLIC_URL;
  const holder: { db: Database | null } = { db: null };
  const anahtarlar = new AnahtarDeposu(() => {
    if (!holder.db) throw new Error('DATABASE_URL tanımlı değil');
    return holder.db;
  }, env.BETTER_AUTH_SECRET);

  const verifyJwt: VerifyJwt = createJwtVerifier({
    keySet: anahtarlar.keySet,
    issuer,
    audience: env.JWT_AUDIENCE ?? JWT_AUDIENCE,
    allowNoKurum: true,
  });

  const plugin: ServicePlugin = fp(
    (app) => {
      const { db } = app;
      app.decorateRequest('yetki', null);
      if (!db) {
        app.log.warn('DATABASE_URL yok: hesap/kimlik uç noktaları devre dışı');
        return Promise.resolve();
      }
      holder.db = db;
      const sistemDb = env.DATABASE_SISTEM_URL
        ? createDb({ url: env.DATABASE_SISTEM_URL, max: 5 })
        : null;
      const sms = options.sms ?? new LogSmsGonderici(app.log);
      const hizmet: KimlikHizmeti = {
        env,
        issuer,
        db,
        sistemDb,
        sms,
        anahtarlar,
        auth: createBetterAuth({ env, db, sms }),
      };
      app.decorate('kimlik', hizmet);
      app.addHook('onClose', async () => {
        await sistemDb?.close();
      });

      // ADR 0004 kontrol sirasi 2: KVKK riza. Kimlik dogrulamasindan (service-kit onRequest) sonra calisir.
      app.addHook('onRequest', async (request) => {
        const config = request.routeOptions.config;
        if (config.public === true || config.rizaMuaf === true || !request.auth) return;
        const durum = await rizaDurumu(db, request.auth.kullaniciId, request.auth.roller);
        if (onayGerekliMi(durum)) {
          throw new AppError(
            403,
            errorCodes.rizaGerekli,
            'Devam etmek için güncel KVKK aydınlatma metnini onaylamanız gerekiyor.',
          );
        }
      });
      return Promise.resolve();
    },
    { name: 'kopru-kimlik' },
  );

  return { verifyJwt, plugin };
}
