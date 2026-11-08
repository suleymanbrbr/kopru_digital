import {
  EpostaDogrulaSorguSema,
  EpostaDogrulaYanitSema,
  EpostaDogrulamaGonderGirdiSema,
  EpostaDogrulamaGonderYanitSema,
  EpostaGirisGirdiSema,
  EpostaKayitGirdiSema,
  OtpDogrulaGirdiSema,
  OtpGonderGirdiSema,
  OtpGonderYanitSema,
  OturumYanitSema,
  TokenGirdiSema,
  TokenYanitSema,
  errorCodes,
  type TokenYanit,
} from '@kopru/contracts';
import { AppError, type ServicePlugin } from '@kopru/service-kit';
import { and, eq, gt, sql, type SQL } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { kullanicilar, oturumlar, otpIstekleri } from '../../db/schema.js';
import { baYaniti, webBasliklari } from './ba-yardimci.js';
import { OTP_GECERLILIK_SN } from './better-auth.js';
import { ERISIM_BELIRTECI_OMRU_SN, erisimBelirteciUret } from './erisim-belirteci.js';
import { telefonuNormallestir } from './telefon.js';
import { uyelikSec, uyelikleriGetir } from './uyelik-deposu.js';

const TELEFON_SAATLIK = 5;
const IP_SAATLIK = 20;
const SAAT_MS = 3_600_000;

const genel = { public: true } as const;

const kullaniciOzeti = (u: Record<string, unknown>) => ({
  id: String(u.id),
  gorunen_ad: typeof u.name === 'string' && u.name.length > 0 ? u.name : null,
  telefon_e164: typeof u.phoneNumber === 'string' ? u.phoneNumber : null,
  eposta: typeof u.email === 'string' && !u.email.endsWith('@telefon.invalid') ? u.email : null,
  dil: 'tr',
});

/** Giris oncesi uc noktalar (`/auth/*`) ve JWKS. Hepsi public; oturum gerekenler Better Auth ile dogrular. */
export const kimlikYollari: ServicePlugin = (app) => {
  const { kimlik } = app;
  const { auth, db } = kimlik;
  // Bu yollar yalnizca `app.kimlik` varken kaydedilir (modul eklentisi kontrol eder).

  app.get(
    '/.well-known/jwks.json',
    {
      config: { public: true, rizaMuaf: true },
      schema: {
        tags: ['kimlik'],
        summary: 'JWT dogrulama anahtarlari (JWKS)',
        response: { 200: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }) },
      },
    },
    async (_request, reply) => {
      void reply.header('cache-control', 'public, max-age=600');
      return kimlik.anahtarlar.jwks();
    },
  );

  /** OTP istek sayaci: telefon basina saatte 5, IP basina saatte 20 (ADR 0004). */
  async function otpHizKontrolu(telefon: string, ip: string): Promise<void> {
    const sinir = new Date(Date.now() - SAAT_MS);
    await db.orm.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${telefon}))`);
      const sayi = async (kosul: SQL | undefined): Promise<number> => {
        const [satir] = await tx
          .select({ n: sql<string>`count(*)` })
          .from(otpIstekleri)
          .where(and(kosul, gt(otpIstekleri.created_at, sinir)));
        return Number(satir?.n ?? 0);
      };
      if ((await sayi(eq(otpIstekleri.tanimlayici, telefon))) >= TELEFON_SAATLIK) {
        throw new AppError(
          429,
          errorCodes.rateLimited,
          'Bu numara için çok fazla kod istendi. Bir saat sonra tekrar deneyin.',
        );
      }
      if ((await sayi(sql`${otpIstekleri.ip} = ${ip}::inet`)) >= IP_SAATLIK) {
        throw new AppError(
          429,
          errorCodes.rateLimited,
          'Çok fazla kod istediniz. Bir saat sonra tekrar deneyin.',
        );
      }
      await tx.insert(otpIstekleri).values({ id: uuidv7(), tanimlayici: telefon, ip });
    });
  }

  const telefonuCoz = (girdi: string) => {
    const telefon = telefonuNormallestir(girdi);
    if (!telefon)
      throw new AppError(400, errorCodes.gecersizTelefon, 'Geçerli bir telefon numarası girin.');
    return telefon;
  };

  app.post(
    '/auth/otp/gonder',
    {
      config: genel,
      schema: {
        tags: ['kimlik'],
        summary: 'Telefona giris/kayit kodu (OTP) gonder',
        body: OtpGonderGirdiSema,
        response: { 200: OtpGonderYanitSema },
      },
    },
    async (request) => {
      const telefon = telefonuCoz(request.body.telefon);
      await otpHizKontrolu(telefon, request.ip);
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: telefon } });
      return { gonderildi: true as const, gecerlilik_sn: OTP_GECERLILIK_SN };
    },
  );

  app.post(
    '/auth/otp/dogrula',
    {
      config: { ...genel, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'OTP kodunu dogrula; oturum ac (kullanici yoksa olusturur)',
        body: OtpDogrulaGirdiSema,
        response: { 200: OturumYanitSema },
      },
    },
    async (request, reply) => {
      const telefon = telefonuCoz(request.body.telefon);
      const [onceki] = await db.orm
        .select({ id: kullanicilar.id })
        .from(kullanicilar)
        .where(eq(kullanicilar.telefon_e164, telefon));
      const yanit = await auth.api.verifyPhoneNumber({
        body: { phoneNumber: telefon, code: request.body.kod },
        headers: webBasliklari(request),
        asResponse: true,
      });
      const { govde, oturumBelirteci } = await baYaniti(yanit, reply);
      const user = (govde as { user?: Record<string, unknown> } | null)?.user;
      if (!user || !oturumBelirteci) {
        throw new AppError(401, errorCodes.unauthorized, 'Oturum açılamadı.');
      }
      await db.orm
        .update(kullanicilar)
        .set({ son_giris_at: new Date() })
        .where(eq(kullanicilar.id, String(user.id)));
      return {
        oturum_belirteci: oturumBelirteci,
        kullanici: kullaniciOzeti(user),
        yeni_kullanici: !onceki,
      };
    },
  );

  app.post(
    '/auth/eposta/kayit',
    {
      config: { ...genel, rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'E-posta ve parola ile kayit',
        body: EpostaKayitGirdiSema,
        response: { 200: OturumYanitSema },
      },
    },
    async (request, reply) => {
      const { eposta, parola, gorunen_ad } = request.body;
      const yanit = await auth.api.signUpEmail({
        body: {
          email: eposta,
          password: parola,
          name: gorunen_ad ?? eposta.split('@')[0] ?? eposta,
        },
        headers: webBasliklari(request),
        asResponse: true,
      });
      const { govde, oturumBelirteci } = await baYaniti(yanit, reply);
      const user = (govde as { user?: Record<string, unknown> } | null)?.user;
      if (!user || !oturumBelirteci)
        throw new AppError(401, errorCodes.unauthorized, 'Oturum açılamadı.');
      return {
        oturum_belirteci: oturumBelirteci,
        kullanici: kullaniciOzeti(user),
        yeni_kullanici: true,
      };
    },
  );

  app.post(
    '/auth/eposta/giris',
    {
      config: { ...genel, rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'E-posta ve parola ile giris',
        body: EpostaGirisGirdiSema,
        response: { 200: OturumYanitSema },
      },
    },
    async (request, reply) => {
      const yanit = await auth.api.signInEmail({
        body: { email: request.body.eposta, password: request.body.parola },
        headers: webBasliklari(request),
        asResponse: true,
      });
      const { govde, oturumBelirteci } = await baYaniti(yanit, reply);
      const user = (govde as { user?: Record<string, unknown> } | null)?.user;
      if (!user || !oturumBelirteci)
        throw new AppError(401, errorCodes.unauthorized, 'Oturum açılamadı.');
      await db.orm
        .update(kullanicilar)
        .set({ son_giris_at: new Date() })
        .where(eq(kullanicilar.id, String(user.id)));
      return {
        oturum_belirteci: oturumBelirteci,
        kullanici: kullaniciOzeti(user),
        yeni_kullanici: false,
      };
    },
  );

  app.post(
    '/auth/eposta/dogrulama-gonder',
    {
      config: { ...genel, rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'E-posta dogrulama baglantisini yeniden gonder',
        description:
          'Kullanici/dogrulama durumu ifsa edilmez: kayitli ve dogrulanmamis adres icin gonderilir, yanit her zaman aynidir.',
        body: EpostaDogrulamaGonderGirdiSema,
        response: { 200: EpostaDogrulamaGonderYanitSema },
      },
    },
    async (request) => {
      await auth.api.sendVerificationEmail({ body: { email: request.body.eposta } });
      return { gonderildi: true as const };
    },
  );

  app.get(
    '/auth/eposta/dogrula',
    {
      config: { ...genel, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'E-postadaki baglantidaki belirtecle e-posta adresini dogrula',
        querystring: EpostaDogrulaSorguSema,
        response: { 200: EpostaDogrulaYanitSema },
      },
    },
    async (request, reply) => {
      const yanit = await auth.api.verifyEmail({
        query: { token: request.query.belirtec },
        asResponse: true,
      });
      await baYaniti(yanit, reply);
      return { dogrulandi: true as const };
    },
  );

  app.post(
    '/auth/cikis',
    {
      config: genel,
      schema: {
        tags: ['kimlik'],
        summary: 'Oturumu kapat',
        response: { 200: z.object({ cikis: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      // Oturum satiri signOut ile silinir; once `sid`i al, sonra erisim belirteclerini iptal listesine yaz.
      const oturum = await auth.api.getSession({ headers: webBasliklari(request) });
      const yanit = await auth.api.signOut({ headers: webBasliklari(request), asResponse: true });
      await baYaniti(yanit, reply);
      if (oturum) {
        try {
          await app.iptal.iptalEt(oturum.session.id);
        } catch (err) {
          // Cikis basarili sayilir (oturum silindi, yenileme yok); kalan pencere <= 15 dk (ADR 0008).
          request.log.error({ err, sid: oturum.session.id }, 'erişim belirteci iptali yazılamadı');
        }
      }
      return { cikis: true as const };
    },
  );

  /**
   * Oturum belirteciyle (cerez veya Bearer) 15 dakikalik erisim JWT'si uretir. Kurum/uyelik
   * secimini icerir: istemci kurum degistirmek icin yeni belirtec alir (ADR 0004).
   */
  app.post(
    '/auth/token',
    {
      config: { ...genel, rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['kimlik'],
        summary: 'Erisim JWT uret / kurum-uyelik degistir',
        description: 'Authorization: Bearer <oturum_belirteci> (veya oturum çerezi) ile çağrılır.',
        body: TokenGirdiSema.default({}),
        response: { 200: TokenYanitSema },
      },
    },
    async (request) => {
      const oturum = await auth.api.getSession({ headers: webBasliklari(request) });
      if (!oturum)
        throw new AppError(401, errorCodes.unauthorized, 'Oturumunuz geçersiz veya süresi dolmuş.');
      const kullaniciId = oturum.user.id;
      const uyelikler = await uyelikleriGetir(db, kullaniciId);
      const [kayit] = await db.orm
        .select({ etkin_uyelik_id: oturumlar.etkin_uyelik_id })
        .from(oturumlar)
        .where(eq(oturumlar.id, oturum.session.id));
      const secim = uyelikSec(uyelikler, {
        uyelikId: request.body.uyelik_id,
        kurumId: request.body.kurum_id,
        tercihUyelikId: kayit?.etkin_uyelik_id ?? null,
      });
      if ((request.body.uyelik_id || request.body.kurum_id) && !secim) {
        throw new AppError(403, errorCodes.forbidden, 'Bu kurumda üyeliğiniz yok.');
      }
      if (secim && request.body.kurum_id && secim.kurum_id !== request.body.kurum_id) {
        throw new AppError(403, errorCodes.forbidden, 'Üyelik bu kuruma ait değil.');
      }
      const roller = secim
        ? [...new Set(uyelikler.filter((u) => u.kurum_id === secim.kurum_id).map((u) => u.rol))]
        : [];
      await db.orm
        .update(oturumlar)
        .set({
          etkin_kurum_id: secim?.kurum_id ?? null,
          etkin_uyelik_id: secim?.uyelik_id ?? null,
          son_kullanim_at: new Date(),
        })
        .where(eq(oturumlar.id, oturum.session.id));
      const accessToken = await erisimBelirteciUret(
        kimlik.anahtarlar,
        kimlik.issuer,
        kimlik.audience,
        {
          kullaniciId,
          sessionId: oturum.session.id,
          kurumId: secim?.kurum_id ?? null,
          uyelikId: secim?.uyelik_id ?? null,
          rol: secim?.rol ?? null,
          roller,
        },
      );
      const yanit: TokenYanit = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ERISIM_BELIRTECI_OMRU_SN,
        kurum_id: secim?.kurum_id ?? null,
        uyelik_id: secim?.uyelik_id ?? null,
        rol: secim?.rol ?? null,
        roller,
        uyelikler,
      };
      return yanit;
    },
  );

  // Apple/Google yalnizca ortam degiskenleri tanimliysa acilir (yonlendirmeli akis, Better Auth isleyicisi).
  const tanimli = (id?: string, sir?: string) => id !== undefined && sir !== undefined;
  const sosyalAcik =
    tanimli(kimlik.env.GOOGLE_CLIENT_ID, kimlik.env.GOOGLE_CLIENT_SECRET) ||
    tanimli(kimlik.env.APPLE_CLIENT_ID, kimlik.env.APPLE_CLIENT_SECRET);
  if (sosyalAcik) {
    const aktar = async (request: FastifyRequest, reply: FastifyReply) => {
      const url = new URL(request.url, kimlik.env.PUBLIC_URL);
      const govde = request.method === 'GET' ? undefined : JSON.stringify(request.body ?? {});
      const yanit = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: webBasliklari(request),
          ...(govde ? { body: govde } : {}),
        }),
      );
      for (const [ad, deger] of yanit.headers) {
        if (ad !== 'set-cookie') void reply.header(ad, deger);
      }
      const cerezler = yanit.headers.getSetCookie();
      if (cerezler.length > 0) void reply.header('set-cookie', cerezler);
      return reply.status(yanit.status).send(await yanit.text());
    };
    app.post('/auth/sign-in/social', { config: genel, schema: { hide: true } }, aktar);
    app.get('/auth/callback/:provider', { config: genel, schema: { hide: true } }, aktar);
  }
  return Promise.resolve();
};
