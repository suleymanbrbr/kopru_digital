import { createHmac, randomUUID } from 'node:crypto';

import type { Periyot } from '@kopru/contracts';

import {
  guvenliEsit,
  type AyristirilmisWebhook,
  type DonusGirdisi,
  type OdemeBaslatGirdisi,
  type OdemeBaslatSonucu,
  type OdemeKaynagi,
  type OdemeSaglayici,
  type WebhookBasliklari,
} from './saglayici.js';

/**
 * iyzico Abonelik (yinelenen odeme) protokolu. Belge ayrintisindan emin olunmayan her sabit (baslik adi, yol,
 * alan adi, olay turu, imza kurali) burada TEK yerde toplanir; sandbox'ta dogrulanmalidir (rapora bakin).
 *
 *  - Kimlik: `Authorization: IYZWSv2 base64("apiKey:<k>&randomKey:<r>&signature:<s>")`, `s = HMAC-SHA256(secretKey,
 *    randomKey + istekYolu + govde)` (hex), `x-iyzi-rnd: <r>`.
 *  - Odeme: `POST /v2/subscription/checkoutform/initialize` (pricingPlanReferenceCode, customer, callbackUrl) ->
 *    `{ token, checkoutFormContent }`; kullanici donunce `POST <callbackUrl>` govdesinde `token`, sonuc
 *    `GET /v2/subscription/checkoutform/{token}`.
 *  - Webhook (abonelik): `{ iyziEventType, subscriptionReferenceCode, orderReferenceCode, customerReferenceCode,
 *    iyziReferenceCode, iyziEventTime }`; imza basligi `X-IYZ-SIGNATURE-V3` = HMAC-SHA256(secretKey,
 *    secretKey + iyziEventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode) (hex).
 *    Gövde tutar/donem tasimaz: abonelik detayindan (`GET /v2/subscription/subscriptions/{ref}`) siparis cekilir.
 */
export const IYZICO_PROTOKOL = {
  yetkiOnEki: 'IYZWSv2',
  rastgeleAnahtarBasligi: 'x-iyzi-rnd',
  imzaBasligi: 'x-iyz-signature-v3',
  yollar: {
    formBaslat: '/v2/subscription/checkoutform/initialize',
    formSonuc: (token: string) => `/v2/subscription/checkoutform/${encodeURIComponent(token)}`,
    abonelikDetay: (ref: string) => `/v2/subscription/subscriptions/${encodeURIComponent(ref)}`,
    abonelikIptal: (ref: string) =>
      `/v2/subscription/subscriptions/${encodeURIComponent(ref)}/cancel`,
  },
  olayTurleri: {
    siparisBasarili: 'subscription.order.success',
    siparisBasarisiz: 'subscription.order.failure',
    /** Belgede dogrulanamadi: olusursa islenir (sandbox'ta teyit edin). */
    siparisIade: 'subscription.order.refund',
    abonelikIptal: 'subscription.cancel',
  },
  siparisDurumlari: { basarili: 'SUCCESS', basarisiz: 'FAILED' },
  basariDurumu: 'success',
  abonelikAktifDurumu: 'ACTIVE',
  baslangicIstegi: 'ACTIVE',
  yerel: 'tr',
} as const;

export interface IyzicoYapilandirma {
  apiKey: string;
  secretKey: string;
  /** Ornek: `https://sandbox-api.iyzipay.com` */
  tabanUrl: string;
  /** `"<plan_kodu>:<periyot>"` -> iyzico pricingPlanReferenceCode. */
  planKodlari: Record<string, string>;
  fetch?: typeof fetch;
  /** Ag zaman asimi (ms). */
  zamanAsimiMs?: number;
}

interface IyzicoSiparis {
  referenceCode?: string;
  price?: number | string;
  orderStatus?: string;
  startPeriod?: number | string;
  endPeriod?: number | string;
  paymentAttempts?: { errorCode?: string; errorMessage?: string }[];
}
interface IyzicoAbonelik {
  referenceCode?: string;
  customerReferenceCode?: string;
  pricingPlanReferenceCode?: string;
  subscriptionStatus?: string;
  orders?: IyzicoSiparis[];
}
interface IyzicoYanit<T> {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  data?: T;
}

const zamanOku = (d: number | string | undefined): Date | null => {
  if (d === undefined) return null;
  const t = typeof d === 'number' ? d : Number.isNaN(Number(d)) ? Date.parse(d) : Number(d);
  return Number.isNaN(t) ? null : new Date(t);
};
const kurusOku = (fiyat: number | string | undefined): number =>
  Math.round(Number(fiyat ?? 0) * 100);

interface IyzicoWebhookGovdesi {
  iyziEventType?: string;
  subscriptionReferenceCode?: string;
  orderReferenceCode?: string;
  customerReferenceCode?: string;
  iyziReferenceCode?: string;
}

export class IyzicoSaglayici implements OdemeSaglayici {
  readonly kaynak: OdemeKaynagi = 'iyzico';
  private readonly istek: typeof fetch;

  constructor(private readonly y: IyzicoYapilandirma) {
    this.istek = y.fetch ?? fetch;
  }

  /** `IYZWSv2` kimlik basliklari (ayri metot: birim test icin). */
  yetkiBasliklari(yol: string, govde: string, rastgele: string = randomUUID()) {
    const imza = createHmac('sha256', this.y.secretKey)
      .update(rastgele + yol + govde)
      .digest('hex');
    const dizge = `apiKey:${this.y.apiKey}&randomKey:${rastgele}&signature:${imza}`;
    return {
      authorization: `${IYZICO_PROTOKOL.yetkiOnEki} ${Buffer.from(dizge).toString('base64')}`,
      [IYZICO_PROTOKOL.rastgeleAnahtarBasligi]: rastgele,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  private async cagir<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const ham = govde === undefined ? '' : JSON.stringify(govde);
    const yanit = await this.istek(`${this.y.tabanUrl}${yol}`, {
      method: yontem,
      headers: this.yetkiBasliklari(yol, ham),
      ...(govde === undefined ? {} : { body: ham }),
      signal: AbortSignal.timeout(this.y.zamanAsimiMs ?? 10_000),
    });
    const j = (await yanit.json()) as IyzicoYanit<T> & T;
    if (!yanit.ok || (j.status !== undefined && j.status !== IYZICO_PROTOKOL.basariDurumu)) {
      throw new Error(
        `iyzico ${yol} hatası: ${j.errorCode ?? String(yanit.status)} ${j.errorMessage ?? ''}`.trim(),
      );
    }
    return j;
  }

  private planReferansi(planKodu: string, periyot: Periyot): string {
    const ref = this.y.planKodlari[`${planKodu}:${periyot}`];
    if (!ref) throw new Error(`iyzico plan eşlemesi yok: ${planKodu}:${periyot}`);
    return ref;
  }

  private planCozumle(ref: string | undefined): { planKodu: string; periyot: Periyot } | null {
    if (!ref) return null;
    const bulunan = Object.entries(this.y.planKodlari).find(([, v]) => v === ref);
    if (!bulunan) return null;
    const [planKodu, periyot] = bulunan[0].split(':');
    return planKodu && (periyot === 'aylik' || periyot === 'yillik') ? { planKodu, periyot } : null;
  }

  async odemeBaslat(girdi: OdemeBaslatGirdisi): Promise<OdemeBaslatSonucu> {
    if (!girdi.alici || !girdi.donusUrl)
      throw new Error('iyzico ödeme başlatma: alıcı/donusUrl yok');
    const { alici } = girdi;
    const [ad = alici.unvan, ...soyad] = alici.unvan.split(/\s+/);
    const adres = {
      contactName: alici.unvan,
      city: alici.adres.il,
      country: 'Turkey',
      address: `${alici.adres.satir} ${alici.adres.ilce}`,
      ...(alici.adres.postaKodu ? { zipCode: alici.adres.postaKodu } : {}),
    };
    const j = await this.cagir<{ token?: string; checkoutFormContent?: string }>(
      'POST',
      IYZICO_PROTOKOL.yollar.formBaslat,
      {
        locale: IYZICO_PROTOKOL.yerel,
        conversationId: girdi.oturumId,
        callbackUrl: girdi.donusUrl,
        pricingPlanReferenceCode: this.planReferansi(girdi.planKodu, girdi.periyot),
        subscriptionInitialStatus: IYZICO_PROTOKOL.baslangicIstegi,
        customer: {
          name: ad,
          surname: soyad.join(' ') || '-',
          // VKN (10 hane) iyzico'da kimlik no yerine gecmez; TCKN yoksa sandbox'ta dogrulanacak yer tutucu.
          identityNumber: alici.vergiNo.length === 11 ? alici.vergiNo : '11111111111',
          email: alici.eposta,
          billingAddress: adres,
          shippingAddress: adres,
        },
      },
    );
    if (!j.token) throw new Error('iyzico ödeme başlatma: token dönmedi');
    return {
      disIslemId: j.token,
      yonlendirmeUrl: null,
      formIcerigi: j.checkoutFormContent ?? null,
    };
  }

  webhookDogrula(hamGovde: string, basliklar: WebhookBasliklari): boolean {
    const gelen = basliklar[IYZICO_PROTOKOL.imzaBasligi];
    if (!gelen) return false;
    let g: IyzicoWebhookGovdesi;
    try {
      g = JSON.parse(hamGovde) as IyzicoWebhookGovdesi;
    } catch {
      return false;
    }
    const mesaj =
      this.y.secretKey +
      (g.iyziEventType ?? '') +
      (g.subscriptionReferenceCode ?? '') +
      (g.orderReferenceCode ?? '') +
      (g.customerReferenceCode ?? '');
    const beklenen = createHmac('sha256', this.y.secretKey).update(mesaj).digest('hex');
    return guvenliEsit(beklenen, gelen);
  }

  /** Test yardimcisi: ayni kuralla imza uretir. */
  webhookImzala(g: IyzicoWebhookGovdesi): string {
    const mesaj =
      this.y.secretKey +
      (g.iyziEventType ?? '') +
      (g.subscriptionReferenceCode ?? '') +
      (g.orderReferenceCode ?? '') +
      (g.customerReferenceCode ?? '');
    return createHmac('sha256', this.y.secretKey).update(mesaj).digest('hex');
  }

  webhookOzeti(hamGovde: string): { disOlayId: string; tur: string } {
    const g = JSON.parse(hamGovde) as IyzicoWebhookGovdesi;
    if (!g.iyziEventType) throw new Error('iyzico olay türü yok');
    // Bildirimde ayri olay kimligi yok: tur + siparis + (varsa) iyzico referansi.
    return {
      disOlayId: [
        g.iyziEventType,
        g.orderReferenceCode ?? g.subscriptionReferenceCode ?? '',
        g.iyziReferenceCode ?? '',
      ].join(':'),
      tur: g.iyziEventType,
    };
  }

  saklanacakBasliklar(basliklar: WebhookBasliklari): Record<string, string> {
    const imza = basliklar[IYZICO_PROTOKOL.imzaBasligi];
    return imza ? { [IYZICO_PROTOKOL.imzaBasligi]: imza } : {};
  }

  private async abonelikDetayi(ref: string): Promise<IyzicoAbonelik> {
    const j = await this.cagir<{ data?: IyzicoAbonelik }>(
      'GET',
      IYZICO_PROTOKOL.yollar.abonelikDetay(ref),
    );
    if (!j.data) throw new Error('iyzico abonelik detayı boş');
    return j.data;
  }

  private siparistenOdeme(
    s: IyzicoSiparis,
    durum: 'basarili' | 'basarisiz' | 'iade',
  ): NonNullable<AyristirilmisWebhook['odeme']> {
    const baslangic = zamanOku(s.startPeriod);
    const bitis = zamanOku(s.endPeriod);
    if (!baslangic || !bitis) throw new Error('iyzico siparişinde dönem tarihi yok');
    const hata = s.paymentAttempts?.at(-1)?.errorCode;
    return {
      durum,
      tutarKurus: kurusOku(s.price),
      donemBaslangicAt: baslangic,
      donemBitisAt: bitis,
      ...(durum === 'basarisiz' ? { hataKodu: hata ?? 'odeme_basarisiz' } : {}),
    };
  }

  async webhookAyristir(hamGovde: string): Promise<AyristirilmisWebhook> {
    const g = JSON.parse(hamGovde) as IyzicoWebhookGovdesi;
    const ozet = this.webhookOzeti(hamGovde);
    const T = IYZICO_PROTOKOL.olayTurleri;
    const temel = {
      ...ozet,
      disAbonelikId: g.subscriptionReferenceCode ?? null,
      disIslemId: g.orderReferenceCode ?? null,
      disMusteriId: g.customerReferenceCode ?? null,
    };
    if (g.iyziEventType === T.abonelikIptal) return { ...temel, islem: 'iptal' };
    const odemeTuru =
      g.iyziEventType === T.siparisBasarili
        ? 'basarili'
        : g.iyziEventType === T.siparisBasarisiz
          ? 'basarisiz'
          : g.iyziEventType === T.siparisIade
            ? 'iade'
            : null;
    if (!odemeTuru || !g.subscriptionReferenceCode || !g.orderReferenceCode) {
      return { ...temel, islem: 'yoksay' };
    }
    const abonelik = await this.abonelikDetayi(g.subscriptionReferenceCode);
    const siparis = abonelik.orders?.find((s) => s.referenceCode === g.orderReferenceCode);
    if (!siparis) throw new Error('iyzico siparişi abonelik detayında bulunamadı');
    const plan = this.planCozumle(abonelik.pricingPlanReferenceCode);
    return {
      ...temel,
      islem: 'odeme',
      ...(plan ? { planKodu: plan.planKodu, periyot: plan.periyot } : {}),
      odeme: {
        ...this.siparistenOdeme(siparis, odemeTuru),
        ...(odemeTuru === 'iade' ? { iadeEdilenIslemId: g.orderReferenceCode } : {}),
      },
    };
  }

  /** Odeme sayfasindan donus: checkout form sonucu + ilk siparis. */
  async donusCoz(girdi: DonusGirdisi): Promise<AyristirilmisWebhook> {
    const sonuc = await this.cagir<{ data?: IyzicoAbonelik }>(
      'GET',
      IYZICO_PROTOKOL.yollar.formSonuc(girdi.token),
    );
    const temel = {
      disOlayId: `donus:${girdi.token}`,
      tur: 'donus',
      oturumToken: girdi.token,
      kurumId: girdi.oturum.kurumId,
      planKodu: girdi.oturum.planKodu,
      periyot: girdi.oturum.periyot,
    };
    const veri = sonuc.data;
    const abonelikRef = veri?.referenceCode;
    if (!abonelikRef || veri.subscriptionStatus !== IYZICO_PROTOKOL.abonelikAktifDurumu) {
      return {
        ...temel,
        islem: 'odeme',
        disAbonelikId: abonelikRef ?? null,
        disIslemId: `donus_${girdi.token}`,
        odeme: {
          durum: 'basarisiz',
          tutarKurus: girdi.oturum.tutarKurus,
          donemBaslangicAt: new Date(),
          donemBitisAt: new Date(Date.now() + 1000),
          hataKodu: veri?.subscriptionStatus ?? 'odeme_basarisiz',
        },
      };
    }
    const detay = await this.abonelikDetayi(abonelikRef);
    const siparis =
      detay.orders?.find((s) => s.orderStatus === IYZICO_PROTOKOL.siparisDurumlari.basarili) ??
      detay.orders?.[0];
    if (!siparis?.referenceCode) {
      // Ilk siparis henuz olusmadi: sonucu webhook tasir.
      return { ...temel, islem: 'yoksay', disAbonelikId: abonelikRef, disIslemId: null };
    }
    return {
      ...temel,
      islem: 'odeme',
      disAbonelikId: abonelikRef,
      disIslemId: siparis.referenceCode,
      disMusteriId: veri.customerReferenceCode ?? null,
      odeme: this.siparistenOdeme(
        siparis,
        siparis.orderStatus === IYZICO_PROTOKOL.siparisDurumlari.basarisiz
          ? 'basarisiz'
          : 'basarili',
      ),
    };
  }

  async yenilemeyiDurdur(disAbonelikId: string): Promise<void> {
    await this.cagir('POST', IYZICO_PROTOKOL.yollar.abonelikIptal(disAbonelikId), {});
  }
}
