import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { IYZICO_PROTOKOL, IyzicoSaglayici } from './iyzico.js';
import { kdvAyir, kdvEkle } from './kdv.js';
import { REVENUECAT_PROTOKOL, RevenueCatSaglayici } from './revenuecat.js';
import { webhookJsondanOku, webhookJsonYap, type AyristirilmisWebhook } from './saglayici.js';

describe('kdv hesabi (kurus, yariyi yukari)', () => {
  it('KDV dahil toplam bolunur; matrah + kdv = toplam', () => {
    expect(kdvAyir(120_00, 20)).toEqual({
      matrahKurus: 100_00,
      kdvKurus: 20_00,
      toplamKurus: 120_00,
    });
    // 599880 / 1,2 = 499900 (tam)
    expect(kdvAyir(599_880, 20)).toMatchObject({ matrahKurus: 499_900, kdvKurus: 99_980 });
    // 1001 / 1,2 = 834,1666 -> 834; kdv 167
    expect(kdvAyir(1001, 20)).toEqual({ matrahKurus: 834, kdvKurus: 167, toplamKurus: 1001 });
    // yariyi yukari: 5 / 1,2 = 4,1666 -> 4; 7 / 1,2 = 5,8333 -> 6
    expect(kdvAyir(7, 20).matrahKurus).toBe(6);
    // tam yari: 3 kurus %100 KDV: matrah 1,5 -> 2
    expect(kdvAyir(3, 100).matrahKurus).toBe(2);
  });

  it('matrahtan KDV eklenir (yariyi yukari)', () => {
    expect(kdvEkle(499_900, 20)).toEqual({
      matrahKurus: 499_900,
      kdvKurus: 99_980,
      toplamKurus: 599_880,
    });
    // 1 kurus * %20 = 0,2 -> 0; 3 kurus * %20 = 0,6 -> 1; 5 kurus * %10 = 0,5 -> 1
    expect(kdvEkle(1, 20).kdvKurus).toBe(0);
    expect(kdvEkle(3, 20).kdvKurus).toBe(1);
    expect(kdvEkle(5, 10).kdvKurus).toBe(1);
  });

  it('sifir ve KDV orani 0', () => {
    expect(kdvAyir(0, 20)).toEqual({ matrahKurus: 0, kdvKurus: 0, toplamKurus: 0 });
    expect(kdvAyir(1234, 0)).toEqual({ matrahKurus: 1234, kdvKurus: 0, toplamKurus: 1234 });
  });
});

describe('IyzicoSaglayici (protokol sabitleri tek yerde)', () => {
  const sirlar = { apiKey: 'api-anahtari', secretKey: 'gizli-anahtar' };
  const planKodlari = { 'kurum:aylik': 'plan-ref-1' };
  const govde = {
    iyziEventType: IYZICO_PROTOKOL.olayTurleri.siparisBasarili,
    subscriptionReferenceCode: 'sub-1',
    orderReferenceCode: 'ord-1',
    customerReferenceCode: 'cus-1',
    iyziReferenceCode: 'iyzi-1',
  };

  const sahteFetch = (yanitlar: Record<string, unknown>) => {
    const cagrilar: { url: string; init?: RequestInit | undefined }[] = [];
    const fn = ((url: string, init?: RequestInit) => {
      cagrilar.push({ url, init });
      const yol = new URL(url).pathname;
      const g = yanitlar[yol];
      return Promise.resolve(
        new Response(JSON.stringify(g ?? { status: 'failure', errorCode: '404' }), {
          status: g ? 200 : 404,
        }),
      );
    }) as typeof fetch;
    return { fn, cagrilar };
  };

  it('webhook imzasi: gecerli, gecersiz ve eksik baslik', () => {
    const s = new IyzicoSaglayici({ ...sirlar, tabanUrl: 'http://x', planKodlari });
    const ham = JSON.stringify(govde);
    const beklenen = createHmac('sha256', sirlar.secretKey)
      .update(sirlar.secretKey + 'subscription.order.success' + 'sub-1' + 'ord-1' + 'cus-1')
      .digest('hex');
    expect(s.webhookDogrula(ham, { [IYZICO_PROTOKOL.imzaBasligi]: beklenen })).toBe(true);
    expect(s.webhookDogrula(ham, { [IYZICO_PROTOKOL.imzaBasligi]: '0'.repeat(64) })).toBe(false);
    // govde degisirse imza tutmaz
    const kurcalanmis = JSON.stringify({ ...govde, orderReferenceCode: 'ord-2' });
    expect(s.webhookDogrula(kurcalanmis, { [IYZICO_PROTOKOL.imzaBasligi]: beklenen })).toBe(false);
    expect(s.webhookDogrula(ham, {})).toBe(false);
    expect(s.webhookDogrula('json-degil', { [IYZICO_PROTOKOL.imzaBasligi]: beklenen })).toBe(false);
  });

  it('IYZWSv2 kimlik basligi: HMAC(randomKey + yol + govde)', () => {
    const s = new IyzicoSaglayici({ ...sirlar, tabanUrl: 'http://x', planKodlari });
    const b = s.yetkiBasliklari('/v2/x', '{"a":1}', 'rnd-1');
    const imza = createHmac('sha256', sirlar.secretKey).update('rnd-1/v2/x{"a":1}').digest('hex');
    const cozulen = Buffer.from(b.authorization.replace('IYZWSv2 ', ''), 'base64').toString();
    expect(cozulen).toBe(`apiKey:api-anahtari&randomKey:rnd-1&signature:${imza}`);
    expect(b['x-iyzi-rnd']).toBe('rnd-1');
  });

  it('siparis webhook: abonelik detayindan tutar/donem ve plan eslemesi', async () => {
    const f = sahteFetch({
      '/v2/subscription/subscriptions/sub-1': {
        status: 'success',
        data: {
          referenceCode: 'sub-1',
          pricingPlanReferenceCode: 'plan-ref-1',
          orders: [
            {
              referenceCode: 'ord-1',
              price: 5998.8,
              orderStatus: 'SUCCESS',
              startPeriod: Date.UTC(2026, 11, 1),
              endPeriod: Date.UTC(2027, 0, 1),
            },
          ],
        },
      },
    });
    const s = new IyzicoSaglayici({ ...sirlar, tabanUrl: 'http://api', planKodlari, fetch: f.fn });
    const a = await s.webhookAyristir(JSON.stringify(govde));
    expect(a).toMatchObject({
      islem: 'odeme',
      disAbonelikId: 'sub-1',
      disIslemId: 'ord-1',
      planKodu: 'kurum',
      periyot: 'aylik',
    });
    expect(a.odeme).toMatchObject({ durum: 'basarili', tutarKurus: 599_880 });
    expect(a.odeme?.donemBitisAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(f.cagrilar[0]?.init?.method).toBe('GET');
  });

  it('basarisiz siparis ve bilinmeyen olay turu', async () => {
    const f = sahteFetch({
      '/v2/subscription/subscriptions/sub-1': {
        status: 'success',
        data: {
          orders: [
            {
              referenceCode: 'ord-1',
              price: 10,
              orderStatus: 'FAILED',
              startPeriod: Date.UTC(2026, 11, 1),
              endPeriod: Date.UTC(2027, 0, 1),
              paymentAttempts: [{ errorCode: '10051' }],
            },
          ],
        },
      },
    });
    const s = new IyzicoSaglayici({ ...sirlar, tabanUrl: 'http://api', planKodlari, fetch: f.fn });
    const a = await s.webhookAyristir(
      JSON.stringify({ ...govde, iyziEventType: IYZICO_PROTOKOL.olayTurleri.siparisBasarisiz }),
    );
    expect(a.odeme).toMatchObject({ durum: 'basarisiz', hataKodu: '10051' });
    const y = await s.webhookAyristir(JSON.stringify({ ...govde, iyziEventType: 'baska.olay' }));
    expect(y.islem).toBe('yoksay');
  });

  it('odeme baslatma: checkout form istegi ve token', async () => {
    const f = sahteFetch({
      [IYZICO_PROTOKOL.yollar.formBaslat]: {
        status: 'success',
        token: 'tok-1',
        checkoutFormContent: '<script>iyzi</script>',
      },
    });
    const s = new IyzicoSaglayici({ ...sirlar, tabanUrl: 'http://api', planKodlari, fetch: f.fn });
    const sonuc = await s.odemeBaslat({
      kurumId: 'k',
      oturumId: 'o-1',
      planKodu: 'kurum',
      periyot: 'aylik',
      tutarKurus: 599_880,
      donusUrl: 'http://api/donus',
      alici: {
        unvan: 'Örnek Eğitim Ltd',
        vergiNo: '1234567890',
        eposta: 'a@b.c',
        adres: { satir: 'Sk 1', ilce: 'Çankaya', il: 'Ankara' },
      },
    });
    expect(sonuc).toEqual({
      disIslemId: 'tok-1',
      yonlendirmeUrl: null,
      formIcerigi: '<script>iyzi</script>',
    });
    const istek = JSON.parse(f.cagrilar[0]?.init?.body as string) as Record<string, unknown>;
    expect(istek).toMatchObject({
      conversationId: 'o-1',
      callbackUrl: 'http://api/donus',
      pricingPlanReferenceCode: 'plan-ref-1',
    });
    await expect(
      s.odemeBaslat({
        kurumId: 'k',
        oturumId: 'o',
        planKodu: 'yok',
        periyot: 'aylik',
        tutarKurus: 1,
        donusUrl: 'x',
        alici: {
          unvan: 'A',
          vergiNo: '1234567890',
          eposta: 'a@b.c',
          adres: { satir: 's', ilce: 'i', il: 'l' },
        },
      }),
    ).rejects.toThrow('plan eşlemesi yok');
  });
});

describe('RevenueCatSaglayici (protokol sabitleri tek yerde)', () => {
  const s = new RevenueCatSaglayici('rc-paylasilan-sir');
  const kurum = '0198a0c2-7c1d-7000-8000-000000000001';
  const gun = 86_400_000;
  const t0 = Date.UTC(2026, 11, 1);
  const olay = (ek: Record<string, unknown>) =>
    JSON.stringify({
      api_version: '1.0',
      event: {
        id: 'evt-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: kurum,
        product_id: 'kopru.kurum.aylik',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
        purchased_at_ms: t0,
        expiration_at_ms: t0 + 30 * gun,
        transaction_id: 'tx-1',
        original_transaction_id: 'otx-1',
        currency: 'TRY',
        price_in_purchased_currency: 5998.8,
        ...ek,
      },
    });

  it('Authorization: ham sir ya da Bearer on ekli; baska deger reddedilir', () => {
    const ham = olay({});
    expect(s.webhookDogrula(ham, { authorization: 'rc-paylasilan-sir' })).toBe(true);
    expect(s.webhookDogrula(ham, { authorization: 'Bearer rc-paylasilan-sir' })).toBe(true);
    expect(s.webhookDogrula(ham, { authorization: 'Bearer yanlis' })).toBe(false);
    expect(s.webhookDogrula(ham, {})).toBe(false);
    expect(s.saklanacakBasliklar()).toEqual({});
  });

  it('kaynak magazadan: APP_STORE -> apple, PLAY_STORE -> google, bilinmeyen -> yok', () => {
    expect(s.webhookOzeti(olay({})).kaynak).toBe('apple');
    expect(s.webhookOzeti(olay({ store: 'PLAY_STORE' })).kaynak).toBe('google');
    expect(s.webhookOzeti(olay({ store: 'STRIPE' })).kaynak).toBeUndefined();
    expect(() => s.webhookOzeti('{}')).toThrow();
  });

  const T = REVENUECAT_PROTOKOL.turler;
  it('olay turleri', () => {
    const ilk = s.webhookAyristir(olay({}));
    expect(ilk).toMatchObject({
      islem: 'odeme',
      kurumId: kurum,
      periyot: 'aylik',
      disIslemId: 'tx-1',
      disAbonelikId: 'otx-1',
      magazaUrunKodu: 'kopru.kurum.aylik',
    });
    expect(ilk.odeme).toMatchObject({ durum: 'basarili', tutarKurus: 599_880 });
    expect(s.webhookAyristir(olay({ expiration_at_ms: t0 + 365 * gun })).periyot).toBe('yillik');
    expect(s.webhookAyristir(olay({ type: T.yenileme })).odeme?.durum).toBe('basarili');
    expect(s.webhookAyristir(olay({ type: T.iptal, cancel_reason: 'UNSUBSCRIBE' })).islem).toBe(
      'iptal',
    );
    const iade = s.webhookAyristir(olay({ type: T.iptal, cancel_reason: 'CUSTOMER_SUPPORT' }));
    expect(iade.odeme).toMatchObject({ durum: 'iade', iadeEdilenIslemId: 'tx-1' });
    expect(s.webhookAyristir(olay({ type: T.iade })).odeme?.durum).toBe('iade');
    expect(s.webhookAyristir(olay({ type: T.sonaErme })).islem).toBe('sona_erdi');
    const fatura = s.webhookAyristir(olay({ type: T.faturaSorunu }));
    expect(fatura.odeme).toMatchObject({ durum: 'basarisiz', hataKodu: 'billing_issue' });
    const urun = s.webhookAyristir(
      olay({ type: T.urunDegisimi, new_product_id: 'kopru.kurum.yillik' }),
    );
    expect(urun).toMatchObject({ islem: 'plan_degisti', yeniMagazaUrunKodu: 'kopru.kurum.yillik' });
    expect(s.webhookAyristir(olay({ type: T.iptalGeriAlindi })).islem).toBe('iptal_geri_alindi');
    expect(s.webhookAyristir(olay({ type: 'TEST' })).islem).toBe('yoksay');
  });

  it('magaza deneme donemi: ucretsiz, TL disi para birimi: tutar belirsiz, sandbox isareti', () => {
    const d = s.webhookAyristir(olay({ period_type: 'TRIAL' }));
    expect(d.ucretsizDeneme).toBe(true);
    expect(d.odeme?.tutarKurus).toBe(0);
    const usd = s.webhookAyristir(olay({ currency: 'USD', price_in_purchased_currency: 49.99 }));
    expect(usd.odeme?.tutarBelirsiz).toBe(true);
    expect(s.webhookAyristir(olay({ environment: 'SANDBOX' })).sandbox).toBe(true);
  });

  it('app_user_id UUID degilse takma adlardan kurum aranir; yoksa null', () => {
    expect(
      s.webhookAyristir(olay({ app_user_id: '$RCAnonymousID:x', aliases: ['x', kurum] })).kurumId,
    ).toBe(kurum);
    expect(s.webhookAyristir(olay({ app_user_id: '$RCAnonymousID:x' })).kurumId).toBeNull();
  });
});

describe('AyristirilmisWebhook JSON gidis-donus (donus olaylari)', () => {
  it('tarihler korunur', () => {
    const a: AyristirilmisWebhook = {
      disOlayId: 'donus:t',
      tur: 'donus',
      islem: 'odeme',
      disAbonelikId: 's',
      disIslemId: 'i',
      odeme: {
        durum: 'basarili',
        tutarKurus: 5,
        donemBaslangicAt: new Date('2026-12-01T00:00:00Z'),
        donemBitisAt: new Date('2027-01-01T00:00:00Z'),
      },
    };
    const geri = webhookJsondanOku(webhookJsonYap(a));
    expect(geri.odeme?.donemBitisAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(geri).toMatchObject({ disOlayId: 'donus:t', islem: 'odeme' });
  });
});
