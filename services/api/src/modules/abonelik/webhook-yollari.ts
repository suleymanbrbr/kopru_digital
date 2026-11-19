import { WebhookYanitSema, abonelikHataKodlari, errorCodes } from '@kopru/contracts';
import { AppError, metrikler, type ServiceApp, type ServicePlugin } from '@kopru/service-kit';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { odemeOturumlari, planlar } from '../../db/schema.js';
import { olayAl } from '../../sistem/abonelik-odeme-sistem.js';
import { faturalariKes } from './fatura-isi.js';
import { olayiIsle } from './odeme-isleme.js';
import type { OdemeKanallari } from './odeme-kanallari.js';
import { sistemVeritabani } from './ortak.js';
import {
  webhookJsonYap,
  type OdemeKaynagi,
  type OdemeSaglayici,
  type WebhookBasliklari,
} from './saglayici.js';

/** Webhook govdesi ust siniri (bayt): imza dogrulanmadan once saklanmaz, yine de sinirlanir. */
const WEBHOOK_GOVDE_SINIRI = 256 * 1024;

const kapaliHatasi = () =>
  new AppError(503, abonelikHataKodlari.odemeKanaliKapali, 'Bu ödeme kanalı yapılandırılmamış.');

function basliklar(request: FastifyRequest): WebhookBasliklari {
  const sonuc: WebhookBasliklari = {};
  for (const [ad, deger] of Object.entries(request.headers)) {
    sonuc[ad.toLowerCase()] = Array.isArray(deger) ? deger[0] : deger;
  }
  return sonuc;
}

/** Ham govde: webhook kapsaminda JSON/form ayristirilmaz, metin olarak gelir (imza ham govde uzerindendir). */
const hamGovde = (request: FastifyRequest): string =>
  typeof request.body === 'string' ? request.body : '';

/** Imza dogrulanmis olay icin hemen isleme denemesi (yanit beklemez); basarisizsa zamanlayici tekrar dener. */
function hemenIsle(app: ServiceApp, kanallar: OdemeKanallari, olayId: string): void {
  const db = app.kimlik.sistemDb;
  if (!db) return;
  void olayiIsle(db, kanallar, olayId, app.log)
    .then(() => faturalariKes(db, kanallar.eArsiv, app.log))
    .catch((err: unknown) => {
      metrikler.abonelikAlarm('webhook_isleme');
      app.log.error({ err: String(err), olayId }, 'abonelik_webhook_aninda_isleme_hatasi');
    });
}

/**
 * Saglayici uclari (kimliksiz, imza/sir ile korunur): iyzico ve RevenueCat webhook'lari ile iyzico odeme
 * sayfasi donusu. Akis: imza dogrula -> ham govdeyi `abonelik_olaylari`na yaz (`ON CONFLICT DO NOTHING`) -> hemen
 * 200 -> isleme arka planda (hemen deneme + 5 sn'lik zamanlayici). Imzasi gecersiz istek saklanmaz (401).
 */
export const webhookYollari: ServicePlugin = (app) => {
  // Bu kapsamda JSON dahil tum govdeler ham metin olarak alinir (imza ham govde uzerinden hesaplanir).
  for (const tip of ['application/json', 'application/x-www-form-urlencoded', 'text/plain']) {
    if (app.hasContentTypeParser(tip)) app.removeContentTypeParser(tip);
    app.addContentTypeParser(
      tip,
      { parseAs: 'string', bodyLimit: WEBHOOK_GOVDE_SINIRI },
      (_r, govde, bitti) => {
        bitti(null, govde);
      },
    );
  }
  const tags = ['abonelik'];
  const genel = { public: true, rateLimit: { max: 600, timeWindow: '1 minute' } } as const;

  async function webhookAl(
    request: FastifyRequest,
    saglayici: OdemeSaglayici | null,
    magaza: boolean,
  ): Promise<{ durum: 'alindi' | 'tekrar' | 'yoksayildi' }> {
    if (!saglayici) throw kapaliHatasi();
    const ham = hamGovde(request);
    const b = basliklar(request);
    if (!saglayici.webhookDogrula(ham, b)) {
      metrikler.abonelikAlarm('webhook_imza');
      request.log.warn({ kaynak: saglayici.kaynak }, 'abonelik_webhook_imza_gecersiz');
      throw new AppError(401, errorCodes.unauthorized, 'Webhook doğrulanamadı.');
    }
    let ozet: ReturnType<OdemeSaglayici['webhookOzeti']>;
    try {
      ozet = saglayici.webhookOzeti(ham);
    } catch {
      throw new AppError(400, errorCodes.validation, 'Webhook gövdesi geçersiz.');
    }
    const kaynak: OdemeKaynagi | undefined = ozet.kaynak ?? (magaza ? undefined : saglayici.kaynak);
    if (!kaynak || ozet.disOlayId === '') return { durum: 'yoksayildi' }; // desteklenmeyen magaza
    const db = sistemVeritabani(app.kimlik.sistemDb);
    const id = await olayAl(db, {
      kaynak,
      disOlayId: ozet.disOlayId,
      tur: ozet.tur,
      hamGovde: ham,
      basliklar: saglayici.saklanacakBasliklar(b),
      imzaDogrulandi: true,
    });
    if (!id) return { durum: 'tekrar' };
    hemenIsle(app, app.abonelikOdeme, id);
    return { durum: 'alindi' };
  }

  app.post(
    '/webhook/iyzico',
    {
      config: genel,
      schema: {
        tags,
        summary:
          'iyzico abonelik webhook (kimliksiz; imza basligi dogrulanir). Ham govde saklanir, hemen 200 doner, isleme arka planda yapilir. Imza gecersizse 401; kanal kapaliysa 503.',
        response: { 200: WebhookYanitSema },
      },
    },
    (request) => webhookAl(request, app.abonelikOdeme.iyzico, false),
  );

  app.post(
    '/webhook/revenuecat',
    {
      config: genel,
      schema: {
        tags,
        summary:
          'RevenueCat (App Store / Google Play) webhook (kimliksiz; Authorization basligi paylasilan sirla dogrulanir). `app_user_id` kurum kimligidir. Ham govde saklanir, hemen 200 doner.',
        response: { 200: WebhookYanitSema },
      },
    },
    (request) => webhookAl(request, app.abonelikOdeme.revenuecat, true),
  );

  /** iyzico odeme sayfasi donusu: oturum sonucunu saglayicidan sorgular, isler ve web uygulamasina yonlendirir. */
  async function donus(token: string | undefined): Promise<string> {
    const kanallar = app.abonelikOdeme;
    const web = (sonuc: string) => `${kanallar.webUrl}/abonelik?odeme=${sonuc}`;
    const saglayici = kanallar.iyzico;
    if (!saglayici?.donusCoz || !token) return web('hata');
    const db = sistemVeritabani(app.kimlik.sistemDb);
    const oturumuOku = async () => {
      const [o] = await db.orm
        .select({ oturum: odemeOturumlari, planKodu: planlar.kod })
        .from(odemeOturumlari)
        .innerJoin(planlar, eq(planlar.id, odemeOturumlari.plan_id))
        .where(and(eq(odemeOturumlari.kaynak, 'iyzico'), eq(odemeOturumlari.dis_islem_id, token)));
      return o;
    };
    const o = await oturumuOku();
    if (!o) return web('bulunamadi');
    try {
      const ayri = await saglayici.donusCoz({
        token,
        oturum: {
          id: o.oturum.id,
          kurumId: o.oturum.kurum_id,
          planKodu: o.planKodu,
          periyot: o.oturum.periyot as 'aylik',
          tutarKurus: o.oturum.tutar_kurus,
          kdvKurus: o.oturum.kdv_kurus,
        },
      });
      const id = await olayAl(db, {
        kaynak: 'iyzico',
        disOlayId: ayri.disOlayId,
        tur: 'donus',
        hamGovde: webhookJsonYap(ayri),
        basliklar: {},
        imzaDogrulandi: true,
      });
      if (id) {
        await olayiIsle(db, kanallar, id, app.log);
        void faturalariKes(db, kanallar.eArsiv, app.log).catch((err: unknown) => {
          app.log.error({ err: String(err) }, 'abonelik_donus_fatura_hatasi');
        });
      }
    } catch (err) {
      app.log.error({ err: String(err) }, 'abonelik_donus_hatasi');
      return web('hata');
    }
    const son = await oturumuOku();
    return web(
      son?.oturum.durum === 'tamamlandi'
        ? 'basarili'
        : son?.oturum.durum === 'basarisiz'
          ? 'basarisiz'
          : 'bekliyor',
    );
  }

  app.post(
    '/odeme/iyzico/donus',
    {
      config: { public: true },
      schema: {
        tags,
        summary:
          'iyzico odeme sayfasi donusu (callback; form govdesinde `token`). Sonucu isler ve web uygulamasina 303 ile yonlendirir (`/abonelik?odeme=basarili|basarisiz|bekliyor|hata`).',
      },
    },
    async (request, reply) => {
      const ham = hamGovde(request);
      let token: string | undefined;
      if (ham.trimStart().startsWith('{')) {
        try {
          token = (JSON.parse(ham) as { token?: string }).token;
        } catch {
          token = undefined;
        }
      } else {
        token = new URLSearchParams(ham).get('token') ?? undefined;
      }
      return reply.redirect(await donus(token), 303);
    },
  );

  // Gelistirme (sahte saglayici): odeme sayfasi yerine tarayici GET ile doner.
  if ((app.abonelikOdeme.iyzico as { sahte?: boolean } | null)?.sahte === true) {
    app.get(
      '/odeme/iyzico/donus',
      {
        config: { public: true },
        schema: {
          tags,
          summary: 'Yalniz sahte saglayicida (gelistirme): `POST` donusunun GET esdegeri.',
        },
      },
      async (request, reply) => {
        const token = (request.query as { token?: string }).token;
        return reply.redirect(await donus(token), 303);
      },
    );
  }

  return Promise.resolve();
};
