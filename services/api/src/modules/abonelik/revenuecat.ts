import type { Periyot } from '@kopru/contracts';

import {
  guvenliEsit,
  type AyristirilmisWebhook,
  type OdemeKaynagi,
  type OdemeSaglayici,
  type WebhookBasliklari,
  type WebhookIslemi,
} from './saglayici.js';

/**
 * RevenueCat (App Store / Google Play) webhook protokolu. Belge ayrintisindan emin olunmayan her sabit
 * burada TEK yerde toplanir; sandbox'ta dogrulanmalidir (rapora bakin):
 *  - yetki: dashboard'da tanimlanan "Authorization header value" ayni degerle gelir (cogu kurulumda `Bearer <sir>`);
 *  - gövde: `{ api_version, event: { id, type, app_user_id, original_app_user_id, aliases[], product_id,
 *    new_product_id, period_type, purchased_at_ms, expiration_at_ms, store, environment, transaction_id,
 *    original_transaction_id, price, currency, price_in_purchased_currency, cancel_reason } }`;
 *  - iade: ayri `REFUND` turu belgelerde yok, iade `CANCELLATION` + `cancel_reason = CUSTOMER_SUPPORT` ile gelir;
 *    her ikisi de iade sayilir.
 */
export const REVENUECAT_PROTOKOL = {
  yetkiBasligi: 'authorization',
  yetkiOnEki: 'Bearer ',
  turler: {
    ilkSatinAlma: 'INITIAL_PURCHASE',
    yenileme: 'RENEWAL',
    iptal: 'CANCELLATION',
    sonaErme: 'EXPIRATION',
    faturaSorunu: 'BILLING_ISSUE',
    urunDegisimi: 'PRODUCT_CHANGE',
    iade: 'REFUND',
    iptalGeriAlindi: 'UNCANCELLATION',
  },
  iadeIptalNedeni: 'CUSTOMER_SUPPORT',
  denemeDonemi: 'TRIAL',
  sandboxOrtami: 'SANDBOX',
  magazalar: { APP_STORE: 'apple', MAC_APP_STORE: 'apple', PLAY_STORE: 'google' } as Record<
    string,
    OdemeKaynagi
  >,
  paraBirimi: 'TRY',
  /** Donem uzunlugu bu gunden uzunsa `yillik`, degilse `aylik`. */
  yillikEsikGun: 300,
} as const;

interface RevenueCatOlayi {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  new_product_id?: string;
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  store?: string;
  environment?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  currency?: string;
  price_in_purchased_currency?: number;
  cancel_reason?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUN_MS = 86_400_000;

function olayOku(hamGovde: string): RevenueCatOlayi {
  const g = JSON.parse(hamGovde) as { event?: RevenueCatOlayi };
  if (!g.event || typeof g.event.id !== 'string' || typeof g.event.type !== 'string') {
    throw new Error('RevenueCat olayı geçersiz');
  }
  return g.event;
}

/** RevenueCat webhook saglayicisi: `app_user_id` = kurum kimligi (mobil uygulama `Purchases.logIn(kurumId)` yapar). */
export class RevenueCatSaglayici implements OdemeSaglayici {
  readonly kaynak: OdemeKaynagi = 'apple';

  constructor(private readonly sir: string) {}

  webhookDogrula(_hamGovde: string, basliklar: WebhookBasliklari): boolean {
    const gelen = basliklar[REVENUECAT_PROTOKOL.yetkiBasligi];
    if (!gelen) return false;
    return (
      guvenliEsit(gelen, this.sir) ||
      guvenliEsit(gelen, `${REVENUECAT_PROTOKOL.yetkiOnEki}${this.sir}`)
    );
  }

  webhookOzeti(hamGovde: string): { disOlayId: string; tur: string; kaynak?: OdemeKaynagi } {
    const o = olayOku(hamGovde);
    const kaynak = o.store ? REVENUECAT_PROTOKOL.magazalar[o.store] : undefined;
    return {
      disOlayId: o.id ?? '',
      tur: o.type ?? '',
      ...(kaynak ? { kaynak } : {}),
    };
  }

  /** Yetki degeri bir sirdir: veritabanina hicbir baslik yazilmaz. */
  saklanacakBasliklar(): Record<string, string> {
    return {};
  }

  webhookAyristir(hamGovde: string): AyristirilmisWebhook {
    const o = olayOku(hamGovde);
    const T = REVENUECAT_PROTOKOL.turler;
    const tur = o.type ?? '';
    const kurumId =
      [o.app_user_id, o.original_app_user_id, ...(o.aliases ?? [])].find(
        (k): k is string => typeof k === 'string' && UUID.test(k),
      ) ?? null;
    const baslangic = o.purchased_at_ms === undefined ? null : new Date(o.purchased_at_ms);
    const bitis = o.expiration_at_ms === undefined ? null : new Date(o.expiration_at_ms);
    const islemId = o.transaction_id ?? o.id ?? null;
    const periyot: Periyot | null =
      baslangic && bitis
        ? (bitis.getTime() - baslangic.getTime()) / GUN_MS > REVENUECAT_PROTOKOL.yillikEsikGun
          ? 'yillik'
          : 'aylik'
        : null;
    const tl =
      o.currency === REVENUECAT_PROTOKOL.paraBirimi &&
      typeof o.price_in_purchased_currency === 'number'
        ? Math.round(o.price_in_purchased_currency * 100)
        : null;

    const temel = {
      disOlayId: o.id ?? '',
      tur,
      disAbonelikId: o.original_transaction_id ?? o.transaction_id ?? null,
      disIslemId: islemId,
      kurumId,
      periyot,
      magazaUrunKodu: o.product_id ?? null,
      sandbox: o.environment === REVENUECAT_PROTOKOL.sandboxOrtami,
      ...(bitis ? { donemBitisAt: bitis } : {}),
    };
    const yoksay = (islem: WebhookIslemi = 'yoksay'): AyristirilmisWebhook => ({ ...temel, islem });
    const donemli = (): { baslangic: Date; bitis: Date } => {
      if (!bitis) throw new Error('RevenueCat olayında expiration_at_ms yok');
      // Baslangic eksikse bir gun oncesi: CHECK (donem_bitis_at > donem_baslangic_at) saglansin.
      return {
        baslangic:
          baslangic && baslangic.getTime() < bitis.getTime()
            ? baslangic
            : new Date(bitis.getTime() - GUN_MS),
        bitis,
      };
    };

    switch (tur) {
      case T.ilkSatinAlma:
      case T.yenileme: {
        const { baslangic: b, bitis: e } = donemli();
        const deneme = o.period_type === REVENUECAT_PROTOKOL.denemeDonemi;
        return {
          ...temel,
          islem: 'odeme',
          ...(deneme ? { ucretsizDeneme: true } : {}),
          odeme: {
            durum: 'basarili',
            tutarKurus: deneme ? 0 : (tl ?? 0),
            ...(tl === null && !deneme ? { tutarBelirsiz: true } : {}),
            donemBaslangicAt: b,
            donemBitisAt: e,
          },
        };
      }
      case T.iade:
      case T.iptal: {
        const iade = tur === T.iade || o.cancel_reason === REVENUECAT_PROTOKOL.iadeIptalNedeni;
        if (!iade) return { ...temel, islem: 'iptal' };
        const { baslangic: b, bitis: e } = donemli();
        return {
          ...temel,
          islem: 'odeme',
          odeme: {
            durum: 'iade',
            tutarKurus: tl ?? 0,
            ...(tl === null ? { tutarBelirsiz: true } : {}),
            donemBaslangicAt: b,
            donemBitisAt: e,
            ...(islemId ? { iadeEdilenIslemId: islemId } : {}),
          },
        };
      }
      case T.sonaErme:
        return yoksay('sona_erdi');
      case T.faturaSorunu: {
        const { baslangic: b, bitis: e } = donemli();
        return {
          ...temel,
          islem: 'odeme',
          odeme: {
            durum: 'basarisiz',
            tutarKurus: tl ?? 0,
            ...(tl === null ? { tutarBelirsiz: true } : {}),
            donemBaslangicAt: b,
            donemBitisAt: e,
            hataKodu: 'billing_issue',
          },
        };
      }
      case T.urunDegisimi:
        return { ...temel, islem: 'plan_degisti', yeniMagazaUrunKodu: o.new_product_id ?? null };
      case T.iptalGeriAlindi:
        return yoksay('iptal_geri_alindi');
      default:
        return yoksay();
    }
  }
}
