import type { Database } from '@kopru/service-kit';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import type { FastifyBaseLogger } from 'fastify';
import { uuidv7 } from 'uuidv7';

import type { Env } from '../../config.js';
import { dogrulamalar, hesaplar, kullanicilar, oturumlar } from '../../db/schema.js';
import type { EpostaGonderici } from './eposta.js';
import type { SmsGonderici } from './sms.js';
import { telefonuNormallestir } from './telefon.js';

export const OTP_UZUNLUK = 6;
export const OTP_GECERLILIK_SN = 300;
export const OTP_EN_COK_DENEME = 5;
const OTURUM_OMRU_SN = 30 * 86_400;

/** Telefonla kayitta Better Auth zorunlu e-posta ister; bu alan veritabanina yazilmadan once bosaltilir. */
const GECICI_EPOSTA_ALANI = 'telefon.invalid';

export interface BetterAuthGirdisi {
  env: Env;
  db: Database;
  sms: SmsGonderici;
  eposta: EpostaGonderici;
  log: Pick<FastifyBaseLogger, 'error'>;
}

/**
 * Better Auth yapilandirmasi (ADR 0004): telefon OTP + e-posta/parola, bearer (mobil).
 * Tablolar `hesap` semasindaki Turkce adlara esler. Apple/Google yalnizca ortam degiskenleri
 * tanimliysa acilir. Hiz siniri uygulama katmanindadir (`otp-hiz-siniri.ts`), burada kapali.
 */
export function createBetterAuth({ env, db, sms, eposta, log }: BetterAuthGirdisi) {
  const sosyal = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET } }
      : {}),
  };

  return betterAuth({
    appName: 'kopru',
    baseURL: env.PUBLIC_URL,
    basePath: '/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.CORS_ORIGINS,
    telemetry: { enabled: false },
    database: drizzleAdapter(db.orm, {
      provider: 'pg',
      schema: { kullanicilar, oturumlar, hesaplar, dogrulamalar },
    }),
    user: {
      modelName: 'kullanicilar',
      fields: {
        name: 'gorunen_ad',
        email: 'eposta',
        emailVerified: 'eposta_dogrulandi_at',
        image: 'avatar_url',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      modelName: 'oturumlar',
      expiresIn: OTURUM_OMRU_SN,
      updateAge: 86_400,
      fields: {
        userId: 'kullanici_id',
        token: 'belirtec',
        expiresAt: 'expires_at',
        ipAddress: 'ip',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      modelName: 'hesaplar',
      encryptOAuthTokens: true,
      fields: {
        userId: 'kullanici_id',
        accountId: 'saglayici_hesap_id',
        providerId: 'saglayici',
        accessToken: 'erisim_belirteci',
        refreshToken: 'yenileme_belirteci',
        idToken: 'kimlik_belirteci',
        accessTokenExpiresAt: 'erisim_belirteci_expires_at',
        refreshTokenExpiresAt: 'yenileme_belirteci_expires_at',
        scope: 'kapsam',
        password: 'parola_hash',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'dogrulamalar',
      fields: {
        identifier: 'tanimlayici',
        value: 'deger',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      // Dogrulama ayri `GET /auth/eposta/dogrula?belirtec=` ucundadir; BA'nin `url`i kullanilmaz.
      // Gonderim hatasi kaydi/istegi bozmaz; kisisel veri ve belirtec loga yazilmaz.
      sendVerificationEmail: async ({ user, token }) => {
        if (user.email.endsWith(`@${GECICI_EPOSTA_ALANI}`)) return;
        const baglanti = `${env.PUBLIC_URL}/auth/eposta/dogrula?belirtec=${encodeURIComponent(token)}`;
        try {
          await eposta.gonder({
            alici: user.email,
            konu: 'Köprü e-posta adresinizi doğrulayın',
            metin: `Köprü hesabınızın e-posta adresini doğrulamak için bağlantıya tıklayın: ${baglanti}\n\nBağlantı 1 saat geçerlidir. Bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
            baglamId: user.id,
          });
        } catch (err) {
          log.error(
            { kullanici_id: user.id, hata: err instanceof Error ? err.name : 'bilinmiyor' },
            'doğrulama e-postası gönderilemedi',
          );
        }
      },
    },
    socialProviders: sosyal,
    rateLimit: { enabled: false },
    advanced: {
      database: { generateId: () => uuidv7() },
      useSecureCookies: env.NODE_ENV === 'production',
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            const eposta = user.email;
            return Promise.resolve({
              data: {
                ...user,
                email: eposta.endsWith(`@${GECICI_EPOSTA_ALANI}`) ? undefined : eposta,
                // gorunen_ad bos birakilir: telefon numarasi ad olarak yazilmasin
                name: user.name.startsWith('+') ? undefined : user.name,
              },
            });
          },
        },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: OTP_UZUNLUK,
        expiresIn: OTP_GECERLILIK_SN,
        allowedAttempts: OTP_EN_COK_DENEME,
        phoneNumberValidator: (numara) => telefonuNormallestir(numara) === numara,
        sendOTP: async ({ phoneNumber: telefon, code }) => {
          await sms.gonder({
            telefon,
            kod: code,
            metin: `Köprü doğrulama kodunuz: ${code}. 5 dakika geçerlidir, kimseyle paylaşmayın.`,
          });
        },
        signUpOnVerification: {
          getTempEmail: (telefon) => `${telefon.replace('+', '')}@${GECICI_EPOSTA_ALANI}`,
          getTempName: (telefon) => telefon,
        },
        schema: {
          user: {
            fields: {
              phoneNumber: 'telefon_e164',
              phoneNumberVerified: 'telefon_dogrulandi_at',
            },
          },
        },
      }),
      bearer(),
    ],
  });
}

export type KimlikDogrulama = ReturnType<typeof createBetterAuth>;
