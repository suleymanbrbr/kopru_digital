import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  SahteOdemeSaglayici,
  bekleyenOlaylariIsle,
  faturalariKes,
  olayiIsle,
  type EArsivSaglayici,
} from './modules/abonelik/index.js';
import {
  bearer,
  dbYok,
  izoleVeritabani,
  kurumluKullanici,
  testDb,
  testServisi,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

const GUN = 86_400_000;
const SIR = 'sahte-sir';
const RC_SIR = 'rc-test-paylasilan-sir';

interface Hata {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface AbonelikYaniti {
  abonelik: {
    id: string;
    kaynak: string;
    durum: string;
    plan: { kod: string };
    donem_bitis_at: string;
    otomatik_yenileme: boolean;
    iptal_istendi_at: string | null;
    bekleyen_plan_kodu: string | null;
  } | null;
  yazma_kilitli: boolean;
}
interface OdemeYaniti {
  odemeler: {
    id: string;
    durum: string;
    kaynak: string;
    tutar_kurus: number;
    kdv_kurus: number;
    ters_cevrilen_id: string | null;
    hata_kodu: string | null;
  }[];
}
interface FaturaYaniti {
  faturalar: {
    id: string;
    odeme_id: string;
    tur: string;
    durum: string;
    fatura_no: string | null;
    matrah_kurus: number;
    kdv_kurus: number;
    toplam_kurus: number;
    kdv_orani: number;
    pdf_dosya_id: string | null;
  }[];
}

const FATURA_BILGISI = {
  unvan: 'Örnek Eğitim Hizmetleri Ltd. Şti.',
  vergi_no: '1234567890',
  vergi_dairesi: 'Kadıköy',
  adres: { satir: 'Moda Cd. No: 1', ilce: 'Kadıköy', il: 'İstanbul', posta_kodu: '34710' },
  eposta: 'fatura@ornek.test',
  e_fatura_mukellefi: false,
};

describe.skipIf(dbYok())('abonelik odeme: iyzico (sahte), RevenueCat, cift kanal, e-Arsiv', () => {
  // Ayri veritabani: odeme/fatura isleri tum kurumlarin bekleyen satirlarini isler; paylasilan test
  // veritabanindaki baska dosyalarin satirlarini etkilememeli.
  let iz: Awaited<ReturnType<typeof izoleVeritabani>> | null = null;
  let t: TestServisi;
  let app: TestServisi['service']['app'];
  const sahte = new SahteOdemeSaglayici(SIR);
  let sistem: postgres.Sql;
  let sistemDb: Database;

  beforeAll(async () => {
    if (!testDb()) return;
    iz = await izoleVeritabani();
    t = testServisi({ ODEME_IYZICO: 'sahte', REVENUECAT_WEBHOOK_SIRRI: RC_SIR }, iz.urls);
    app = t.service.app;
    sistem = postgres(iz.urls.sistemUrl, { max: 2, onnotice: () => undefined });
    sistemDb = createDb({ url: iz.urls.sistemUrl, max: 4 });
    await sistem`update abonelik.planlar set magaza_urun_kodlari = ${sistem.json({ apple: 'kopru.kurum.aylik', google: 'kopru_kurum' })}
      where kod = 'kurum' and surum = 1`;
    await sistem`update abonelik.planlar set magaza_urun_kodlari = ${sistem.json({ apple: 'kopru.ekip.yillik' })}
      where kod = 'ekip' and surum = 1`;
  });
  afterAll(async () => {
    await t.service.stop();
    await sistemDb.close();
    await sistem.end();
    await iz?.temizle();
  });

  const ab = (k: { kurumId: string }, yol = '') => `/v1/abonelik/kurumlar/${k.kurumId}${yol}`;
  const kurumAc = () => kurumluKullanici(t, 'kurum');

  const abonelik = async (k: KurumluKullanici) => {
    const res = await app.inject({ url: ab(k, '/abonelik'), headers: bearer(k.token) });
    expect(res.statusCode).toBe(200);
    return res.json<AbonelikYaniti>();
  };
  const odemeler = async (k: KurumluKullanici) => {
    const res = await app.inject({ url: ab(k, '/odemeler'), headers: bearer(k.token) });
    expect(res.statusCode).toBe(200);
    return res.json<OdemeYaniti>().odemeler;
  };
  const faturalar = async (k: KurumluKullanici) => {
    const res = await app.inject({ url: ab(k, '/faturalar'), headers: bearer(k.token) });
    expect(res.statusCode).toBe(200);
    return res.json<FaturaYaniti>().faturalar;
  };
  const faturaBilgisiYaz = async (k: KurumluKullanici) => {
    const res = await app.inject({
      method: 'PUT',
      url: ab(k, '/fatura-bilgileri'),
      headers: bearer(k.token),
      payload: FATURA_BILGISI,
    });
    expect(res.statusCode).toBe(200);
  };
  const baslat = (
    k: KurumluKullanici,
    plan_kodu = 'kurum',
    periyot: 'aylik' | 'yillik' = 'aylik',
  ) =>
    app.inject({
      method: 'POST',
      url: ab(k, '/odeme/baslat'),
      headers: bearer(k.token),
      payload: { plan_kodu, periyot },
    });

  /** Imzali sahte iyzico webhook'u. */
  const iyzicoGonder = (govde: Record<string, unknown>, imza?: string) => {
    const ham = JSON.stringify(govde);
    return app.inject({
      method: 'POST',
      url: '/v1/abonelik/webhook/iyzico',
      headers: { 'content-type': 'application/json', 'x-sahte-imza': imza ?? sahte.imzala(ham) },
      payload: ham,
    });
  };
  const rcGonder = (kurumId: string, ek: Record<string, unknown>, yetki = RC_SIR) => {
    const simdi = Date.now();
    const ham = JSON.stringify({
      api_version: '1.0',
      event: {
        id: uuidv7(),
        type: 'INITIAL_PURCHASE',
        app_user_id: kurumId,
        product_id: 'kopru.kurum.aylik',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
        purchased_at_ms: simdi,
        expiration_at_ms: simdi + 30 * GUN,
        transaction_id: `tx_${uuidv7()}`,
        original_transaction_id: `otx_${kurumId}`,
        currency: 'TRY',
        price_in_purchased_currency: 5998.8,
        ...ek,
      },
    });
    return app.inject({
      method: 'POST',
      url: '/v1/abonelik/webhook/revenuecat',
      headers: { 'content-type': 'application/json', authorization: yetki },
      payload: ham,
    });
  };

  async function bekle<T>(
    sorgu: () => Promise<T | null | undefined | false>,
    sureMs = 10_000,
  ): Promise<T> {
    const bitis = Date.now() + sureMs;
    for (;;) {
      const s = await sorgu();
      if (s) return s;
      if (Date.now() > bitis) throw new Error('beklenen durum olusmadi');
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  const olayDurumu = async (disOlayId: string) =>
    bekle(async () => {
      const [o] = await sistem<{ durum: string; hata: string | null; kurum_id: string | null }[]>`
        select durum, hata, kurum_id from abonelik.abonelik_olaylari where dis_olay_id = ${disOlayId}`;
      return o && o.durum !== 'alindi' ? o : null;
    });
  const durumBekle = (k: KurumluKullanici, durum: string, kaynak?: string) =>
    bekle(async () => {
      const a = (await abonelik(k)).abonelik;
      return a?.durum === durum && (!kaynak || a.kaynak === kaynak) ? a : null;
    });

  const odemeGovdesi = (ek: {
    id?: string;
    tur?: string;
    islem: string;
    abonelik?: string;
    oturumToken?: string;
    kurumId?: string;
    durum?: 'basarili' | 'basarisiz' | 'iade';
    tutar?: number;
    baslangicGun: number;
    bitisGun: number;
    iadeEdilen?: string;
    hata?: string;
  }) => ({
    id: ek.id ?? `evt_${uuidv7()}`,
    tur: ek.tur ?? `odeme.${ek.durum ?? 'basarili'}`,
    abonelik_id: ek.abonelik,
    islem_id: ek.islem,
    oturum_token: ek.oturumToken,
    kurum_id: ek.kurumId,
    odeme: {
      durum: ek.durum ?? 'basarili',
      tutar_kurus: ek.tutar ?? 599_880,
      donem_baslangic_at: new Date(Date.now() + ek.baslangicGun * GUN).toISOString(),
      donem_bitis_at: new Date(Date.now() + ek.bitisGun * GUN).toISOString(),
      ...(ek.hata ? { hata_kodu: ek.hata } : {}),
      ...(ek.iadeEdilen ? { iade_edilen_islem_id: ek.iadeEdilen } : {}),
    },
  });

  /** Fatura bilgisi + odeme baslat + imzali ilk odeme webhook'u -> `aktif`. */
  async function iyzicoAktif(k: KurumluKullanici) {
    await faturaBilgisiYaz(k);
    const b = await baslat(k);
    expect(b.statusCode).toBe(200);
    const oturumId = b.json<{ oturum_id: string }>().oturum_id;
    const abonelikRef = `sub_${k.kurumId}`;
    const islem = `ord_${k.kurumId}_1`;
    const w = await iyzicoGonder(
      odemeGovdesi({
        islem,
        abonelik: abonelikRef,
        oturumToken: `sahte_${oturumId}`,
        baslangicGun: 0,
        bitisGun: 30,
      }),
    );
    expect(w.statusCode).toBe(200);
    await durumBekle(k, 'aktif', 'iyzico');
    return { abonelikRef, islem, oturumId };
  }

  it('webhook imzasi: gecersiz imza 401 ve saklanmaz; gecerli 200; ayni olay tekrar -> tekrar', async () => {
    const govde = { id: 'evt_imza_1', tur: 'baska.olay' };
    const kotu = await iyzicoGonder(govde, 'a'.repeat(64));
    expect(kotu.statusCode).toBe(401);
    expect(kotu.json<Hata>().error.code).toBe('yetkisiz');
    const [yok] = await sistem<{ n: string }[]>`
      select count(*) as n from abonelik.abonelik_olaylari where dis_olay_id = 'evt_imza_1'`;
    expect(Number(yok?.n)).toBe(0);

    const ilk = await iyzicoGonder(govde);
    expect(ilk.statusCode).toBe(200);
    expect(ilk.json<{ durum: string }>().durum).toBe('alindi');
    const tekrar = await iyzicoGonder(govde);
    expect(tekrar.statusCode).toBe(200);
    expect(tekrar.json<{ durum: string }>().durum).toBe('tekrar');
    const [say] = await sistem<{ n: string }[]>`
      select count(*) as n from abonelik.abonelik_olaylari where dis_olay_id = 'evt_imza_1'`;
    expect(Number(say?.n)).toBe(1);
    // Bilinmeyen tur: hemen `yoksayildi` (hicbir etkisi yok).
    expect((await olayDurumu('evt_imza_1')).durum).toBe('yoksayildi');
  });

  it('RevenueCat Authorization: yanlis sir 401, dogru sir 200', async () => {
    const k = await kurumAc();
    expect((await rcGonder(k.kurumId, {}, 'yanlis')).statusCode).toBe(401);
    expect((await rcGonder(k.kurumId, { type: 'TEST' })).statusCode).toBe(200);
    expect((await rcGonder(k.kurumId, { type: 'TEST' }, `Bearer ${RC_SIR}`)).statusCode).toBe(200);
  });

  it('kanal kapaliysa (env eksik): odeme baslatma ve webhook 503 odeme_kanali_kapali', async () => {
    const kapali = testServisi({}, iz?.urls ?? null);
    try {
      const k = await kurumluKullanici(kapali, 'kurum');
      const res = await kapali.service.app.inject({
        method: 'POST',
        url: ab(k, '/odeme/baslat'),
        headers: bearer(k.token),
        payload: { plan_kodu: 'kurum' },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json<Hata>().error.code).toBe('odeme_kanali_kapali');
      for (const yol of ['iyzico', 'revenuecat']) {
        const w = await kapali.service.app.inject({
          method: 'POST',
          url: `/v1/abonelik/webhook/${yol}`,
          headers: { 'content-type': 'application/json' },
          payload: '{}',
        });
        expect(w.statusCode).toBe(503);
      }
    } finally {
      await kapali.service.stop();
    }
  });

  it('odeme baslatma: fatura bilgisi yoksa 422; plan yoksa 404; sonra yonlendirme + tutar (KDV dahil)', async () => {
    const k = await kurumAc();
    const yok = await baslat(k);
    expect(yok.statusCode).toBe(422);
    expect(yok.json<Hata>().error.code).toBe('fatura_bilgisi_gerekli');
    await faturaBilgisiYaz(k);
    expect((await baslat(k, 'yok_plan')).statusCode).toBe(404);
    expect((await baslat(k, 'koc')).statusCode).toBe(404); // bireysel plan, kurum turu uymaz
    const ok = await baslat(k);
    expect(ok.statusCode).toBe(200);
    const g = ok.json<{
      oturum_id: string;
      kaynak: string;
      yonlendirme_url: string | null;
      tutar_kurus: number;
      kdv_kurus: number;
    }>();
    expect(g.kaynak).toBe('iyzico');
    // kurum plani: 499.900 + %20 KDV = 599.880
    expect(g).toMatchObject({ tutar_kurus: 599_880, kdv_kurus: 99_980 });
    expect(g.yonlendirme_url).toContain('/v1/abonelik/odeme/iyzico/donus?token=sahte_');
    const [oturum] = await sistem<{ durum: string; dis_islem_id: string }[]>`
      select durum, dis_islem_id from abonelik.odeme_oturumlari where id = ${g.oturum_id}`;
    expect(oturum).toEqual({ durum: 'bekliyor', dis_islem_id: `sahte_${g.oturum_id}` });
    // Denemede ucretliye gecis cift abonelik sayilmaz: deneme hala etkin.
    expect((await abonelik(k)).abonelik?.durum).toBe('deneme');
  });

  it('uctan uca: odeme -> aktif (10 sn icinde) -> fatura kesildi (log) -> odeme/fatura gecmisi -> olaylar', async () => {
    const k = await kurumAc();
    await faturaBilgisiYaz(k);
    const oturumId = (await baslat(k)).json<{ oturum_id: string }>().oturum_id;
    const ham = odemeGovdesi({
      id: 'evt_uctan_uca_' + k.kurumId,
      islem: `ord_${k.kurumId}_1`,
      abonelik: `sub_${k.kurumId}`,
      oturumToken: `sahte_${oturumId}`,
      baslangicGun: 0,
      bitisGun: 30,
    });
    const t0 = Date.now();
    expect((await iyzicoGonder(ham)).statusCode).toBe(200);
    const a = await durumBekle(k, 'aktif', 'iyzico');
    const sureMs = Date.now() - t0;
    console.log(`[abonelik odeme] webhook -> aktif: ${String(sureMs)} ms`);
    expect(sureMs).toBeLessThan(10_000);
    expect(a.plan.kod).toBe('kurum');
    expect(a.otomatik_yenileme).toBe(true);

    const o = await odemeler(k);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({
      durum: 'basarili',
      kaynak: 'iyzico',
      tutar_kurus: 599_880,
      kdv_kurus: 99_980,
    });
    const [oturum] = await sistem<{ durum: string }[]>`
      select durum from abonelik.odeme_oturumlari where id = ${oturumId}`;
    expect(oturum?.durum).toBe('tamamlandi');

    // e-Arsiv: alici bilgisi kopyasi + KDV bolumu, log saglayici ile kesilir.
    const f = await bekle(async () => {
      const l = await faturalar(k);
      return l[0]?.durum === 'kesildi' ? l : null;
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      tur: 'e_arsiv',
      odeme_id: o[0]?.id,
      matrah_kurus: 499_900,
      kdv_kurus: 99_980,
      toplam_kurus: 599_880,
      kdv_orani: 20,
      pdf_dosya_id: null,
    });
    expect(f[0]?.fatura_no).toMatch(/^LOG\d{4}[0-9A-F]{9}$/);
    const [kopya] = await sistem<
      { alici_unvan: string; alici_vergi_no: string; entegrator: string }[]
    >`
      select alici_unvan, alici_vergi_no, entegrator from abonelik.faturalar where kurum_id = ${k.kurumId}`;
    expect(kopya).toEqual({
      alici_unvan: FATURA_BILGISI.unvan,
      alici_vergi_no: FATURA_BILGISI.vergi_no,
      entegrator: 'log',
    });

    // Olaylar (outbox): kisisel veri yok.
    const olaylar = await sistem<{ subject: string; payload: Record<string, unknown> }[]>`
      select subject, payload from ortak.outbox where kurum_id = ${k.kurumId}
        and subject in ('evt.abonelik.odeme.islendi.v1', 'evt.abonelik.fatura.kesildi.v1')`;
    expect(olaylar.map((e) => e.subject).sort()).toEqual([
      'evt.abonelik.fatura.kesildi.v1',
      'evt.abonelik.odeme.islendi.v1',
    ]);
    const metin = JSON.stringify(olaylar);
    for (const kisisel of [FATURA_BILGISI.unvan, FATURA_BILGISI.vergi_no, FATURA_BILGISI.eposta]) {
      expect(metin).not.toContain(kisisel);
    }
    // Sahibin olaylar tablosu: ham govde `islendi` ve kurum bagli.
    const [olay] = await sistem<{ durum: string; kurum_id: string | null }[]>`
      select durum, kurum_id from abonelik.abonelik_olaylari where dis_olay_id = ${'evt_uctan_uca_' + k.kurumId}`;
    expect(olay).toEqual({ durum: 'islendi', kurum_id: k.kurumId });
  });

  it('idempotent: ayni olay tekrar ve ayni odeme baska olay kimligiyle -> tek odeme, tek fatura', async () => {
    const k = await kurumAc();
    const { abonelikRef, islem } = await iyzicoAktif(k);
    // Ayni siparis, farkli olay kimligi (saglayici yeniden gonderimi / donus + webhook cakismasi).
    const yeniden = odemeGovdesi({ islem, abonelik: abonelikRef, baslangicGun: 0, bitisGun: 30 });
    expect((await iyzicoGonder(yeniden)).statusCode).toBe(200);
    expect((await olayDurumu(yeniden.id)).durum).toBe('islendi');
    expect(await odemeler(k)).toHaveLength(1);
    await bekle(async () => (await faturalar(k)).length === 1);
    expect(await faturalar(k)).toHaveLength(1);
    // Islenmis olay tekrar islenmez.
    const [o] = await sistem<{ id: string }[]>`
      select id from abonelik.abonelik_olaylari where dis_olay_id = ${yeniden.id}`;
    expect(await olayiIsle(sistemDb, app.abonelikOdeme, o?.id ?? '', app.log)).toBe('atlandi');
  });

  it('yenileme: basarisiz -> odeme_bekliyor; eski (sirasiz) olay etkisiz; basarili -> aktif', async () => {
    const k = await kurumAc();
    const { abonelikRef } = await iyzicoAktif(k);

    // Basarisiz yenileme (30..60. gun donemi).
    const basarisiz = odemeGovdesi({
      islem: `ord_${k.kurumId}_2`,
      abonelik: abonelikRef,
      durum: 'basarisiz',
      hata: 'kart_reddedildi',
      baslangicGun: 30,
      bitisGun: 60,
    });
    expect((await iyzicoGonder(basarisiz)).statusCode).toBe(200);
    await durumBekle(k, 'odeme_bekliyor', 'iyzico');
    const liste = await odemeler(k);
    expect(liste.find((o) => o.durum === 'basarisiz')).toMatchObject({
      hata_kodu: 'kart_reddedildi',
    });

    // Sirasiz: ilk doneme ait (daha eski) basarili odeme sonradan gelir -> durum degismez.
    const eski = odemeGovdesi({
      islem: `ord_${k.kurumId}_eski`,
      abonelik: abonelikRef,
      baslangicGun: -30,
      bitisGun: 0,
    });
    expect((await iyzicoGonder(eski)).statusCode).toBe(200);
    expect((await olayDurumu(eski.id)).durum).toBe('islendi');
    expect((await abonelik(k)).abonelik?.durum).toBe('odeme_bekliyor');

    // Basarili yenileme: aktif ve donem ilerler.
    const yenileme = odemeGovdesi({
      islem: `ord_${k.kurumId}_3`,
      abonelik: abonelikRef,
      baslangicGun: 30,
      bitisGun: 60,
    });
    expect((await iyzicoGonder(yenileme)).statusCode).toBe(200);
    const a = await durumBekle(k, 'aktif', 'iyzico');
    expect(new Date(a.donem_bitis_at).getTime()).toBeGreaterThan(Date.now() + 59 * GUN);
    await bekle(async () => (await faturalar(k)).length === 3); // ilk + eski + yenileme (eski de odendi)
  });

  it('iptal: sahip iptal -> yenileme kapanir (saglayici durdurulur); sona erme -> iptal; iptalsiz sona erme -> sona_erdi + askida', async () => {
    const k1 = await kurumAc();
    const r1 = await iyzicoAktif(k1);
    const durdur = vi.spyOn(app.abonelikOdeme.iyzico as SahteOdemeSaglayici, 'yenilemeyiDurdur');
    const res = await app.inject({
      method: 'POST',
      url: ab(k1, '/abonelik/iptal'),
      headers: bearer(k1.token),
    });
    expect(res.statusCode).toBe(200);
    expect(durdur).toHaveBeenCalledWith(r1.abonelikRef);
    durdur.mockRestore();
    const iptalli = (await abonelik(k1)).abonelik;
    expect(iptalli).toMatchObject({ durum: 'aktif', otomatik_yenileme: false });
    expect(iptalli?.iptal_istendi_at).not.toBeNull();
    const son = {
      id: `evt_son_${k1.kurumId}`,
      tur: 'abonelik.sona_erdi',
      abonelik_id: r1.abonelikRef,
    };
    await iyzicoGonder(son);
    await olayDurumu(son.id);
    expect((await abonelik(k1)).abonelik?.durum).toBe('iptal');

    // Iptal istemeden sona eren (odeme alinamadi, saglayici sonlandirdi): sona_erdi, kurum askida.
    const k2 = await kurumAc();
    const r2 = await iyzicoAktif(k2);
    await iyzicoGonder({
      id: `evt_son_${k2.kurumId}`,
      tur: 'abonelik.sona_erdi',
      abonelik_id: r2.abonelikRef,
    });
    await durumBekle(k2, 'sona_erdi', 'iyzico');
    expect((await abonelik(k2)).yazma_kilitli).toBe(true);
    const [kurum] = await sistem<
      { durum: string }[]
    >`select durum from hesap.kurumlar where id = ${k2.kurumId}`;
    expect(kurum?.durum).toBe('askida');

    // Saglayici tarafi iptal bildirimi: yenileme kapanir, erisim surer.
    const k3 = await kurumAc();
    const r3 = await iyzicoAktif(k3);
    await iyzicoGonder({
      id: `evt_iptal_${k3.kurumId}`,
      tur: 'abonelik.iptal',
      abonelik_id: r3.abonelikRef,
    });
    await bekle(async () => (await abonelik(k3)).abonelik?.otomatik_yenileme === false);
    expect((await abonelik(k3)).abonelik?.durum).toBe('aktif');
  });

  it('iade: iade satiri (ters_cevrilen_id), iade faturasi, erisim biter; tekrar iade etkisiz', async () => {
    const k = await kurumAc();
    const { abonelikRef, islem } = await iyzicoAktif(k);
    await bekle(async () => (await faturalar(k)).some((f) => f.durum === 'kesildi'));
    const iade = odemeGovdesi({
      islem: `iade_${k.kurumId}`,
      abonelik: abonelikRef,
      durum: 'iade',
      iadeEdilen: islem,
      baslangicGun: 0,
      bitisGun: 30,
    });
    expect((await iyzicoGonder(iade)).statusCode).toBe(200);
    await durumBekle(k, 'sona_erdi', 'iyzico');
    const liste = await odemeler(k);
    const basarili = liste.find((o) => o.durum === 'basarili');
    const iadeSatiri = liste.find((o) => o.durum === 'iade');
    expect(iadeSatiri?.ters_cevrilen_id).toBe(basarili?.id);
    expect(iadeSatiri?.tutar_kurus).toBe(599_880);
    const [kurum] = await sistem<
      { durum: string }[]
    >`select durum from hesap.kurumlar where id = ${k.kurumId}`;
    expect(kurum?.durum).toBe('askida');

    const f = await bekle(async () => {
      const l = await faturalar(k);
      return l.length === 2 && l.every((x) => x.durum === 'kesildi') ? l : null;
    });
    expect(f.find((x) => x.tur === 'iade')).toMatchObject({
      odeme_id: iadeSatiri?.id,
      matrah_kurus: 499_900,
      kdv_kurus: 99_980,
      toplam_kurus: 599_880,
    });
    // Ayni iade farkli olay kimligiyle tekrar: yeni satir yok.
    const tekrar = { ...iade, id: `evt_${uuidv7()}` };
    expect((await iyzicoGonder(tekrar)).statusCode).toBe(200);
    await olayDurumu(tekrar.id);
    expect((await odemeler(k)).filter((o) => o.durum === 'iade')).toHaveLength(1);
    // Askidaki kurum yeniden odeme baslatabilir (yeni abonelik).
    expect((await baslat(k)).statusCode).toBe(200);
  });

  it('iade, odemeden once gelirse (sirasiz) olay hata olur ve odeme gelince yeniden denenerek islenir', async () => {
    const k = await kurumAc();
    await faturaBilgisiYaz(k);
    const oturumId = (await baslat(k)).json<{ oturum_id: string }>().oturum_id;
    const abonelikRef = `sub_${k.kurumId}`;
    const islem = `ord_${k.kurumId}_1`;
    const iade = odemeGovdesi({
      islem: `iade_${k.kurumId}`,
      abonelik: abonelikRef,
      durum: 'iade',
      iadeEdilen: islem,
      baslangicGun: 0,
      bitisGun: 30,
    });
    await iyzicoGonder(iade);
    // Abonelik henuz bilinmiyor: kurum cozulemez -> hata (geri cekilmeli yeniden deneme).
    expect((await olayDurumu(iade.id)).durum).toBe('hata');
    await iyzicoGonder(
      odemeGovdesi({
        islem,
        abonelik: abonelikRef,
        oturumToken: `sahte_${oturumId}`,
        baslangicGun: 0,
        bitisGun: 30,
      }),
    );
    await durumBekle(k, 'aktif', 'iyzico');
    // Zamanlayici turu (zaman ileri alinmis): hata olan iade islenir.
    await bekleyenOlaylariIsle(
      sistemDb,
      app.abonelikOdeme,
      app.log,
      new Date(Date.now() + 3_600_000),
    );
    await durumBekle(k, 'sona_erdi', 'iyzico');
  });

  it('RevenueCat: satin alma, yenileme, iptal, geri alma, faturasiz odeme, urun degisimi, fatura sorunu, sona erme, iade', async () => {
    const k = await kurumAc();
    const ilk = await rcGonder(k.kurumId, {});
    expect(ilk.statusCode).toBe(200);
    // Denemeden ucretliye gecis: deneme sona erer, apple abonelik acilir (cift sayilmaz).
    const a = await durumBekle(k, 'aktif', 'apple');
    expect(a.plan.kod).toBe('kurum');
    const o = await odemeler(k);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ kaynak: 'apple', durum: 'basarili', tutar_kurus: 599_880 });
    // Magaza odemelerine fatura kesilmez.
    await new Promise((r) => setTimeout(r, 300));
    expect(await faturalar(k)).toHaveLength(0);

    // Yenileme (yeni donem)
    const bitis2 = Date.now() + 60 * GUN;
    const yenileme = await rcGonder(k.kurumId, {
      type: 'RENEWAL',
      purchased_at_ms: Date.now() + 30 * GUN,
      expiration_at_ms: bitis2,
    });
    expect(yenileme.statusCode).toBe(200);
    await bekle(async () => {
      const x = (await abonelik(k)).abonelik;
      return x && Math.abs(new Date(x.donem_bitis_at).getTime() - bitis2) < 2000;
    });

    // Iptal (kullanici yenilemeyi kapatti) ve geri alma
    await rcGonder(k.kurumId, {
      type: 'CANCELLATION',
      cancel_reason: 'UNSUBSCRIBE',
      expiration_at_ms: bitis2,
    });
    await bekle(async () => (await abonelik(k)).abonelik?.otomatik_yenileme === false);
    await rcGonder(k.kurumId, { type: 'UNCANCELLATION', expiration_at_ms: bitis2 });
    await bekle(async () => (await abonelik(k)).abonelik?.otomatik_yenileme === true);

    // Urun degisimi: sonraki donemde Ekip plani (bekleyen)
    await sistem`update abonelik.planlar set magaza_urun_kodlari = ${sistem.json({ apple: 'kopru.ekip.aylik' })}
      where kod = 'ekip' and surum = 1`;
    // Kurum turu farki: yalniz bekleyen kayit tutulur (plan eslemesi urun koduyla).
    await rcGonder(k.kurumId, {
      type: 'PRODUCT_CHANGE',
      new_product_id: 'kopru.ekip.aylik',
      expiration_at_ms: bitis2,
    });
    await bekle(async () => (await abonelik(k)).abonelik?.bekleyen_plan_kodu === 'ekip');

    // Fatura sorunu: odeme_bekliyor; ayni donemde eski (daha once biten) fatura sorunu yok sayilir
    await rcGonder(k.kurumId, { type: 'BILLING_ISSUE', expiration_at_ms: bitis2 });
    await durumBekle(k, 'odeme_bekliyor', 'apple');
    const eskiSorun = await rcGonder(k.kurumId, {
      type: 'BILLING_ISSUE',
      expiration_at_ms: bitis2 - 40 * GUN,
    });
    expect(eskiSorun.statusCode).toBe(200);

    // Yeniden basarili yenileme -> aktif (bekleyen plan temizlenir)
    await rcGonder(k.kurumId, {
      type: 'RENEWAL',
      purchased_at_ms: bitis2,
      expiration_at_ms: bitis2 + 30 * GUN,
    });
    await durumBekle(k, 'aktif', 'apple');

    // Sona erme (iptal istenmemis) -> sona_erdi, kurum askida
    await rcGonder(k.kurumId, { type: 'EXPIRATION', expiration_at_ms: bitis2 + 30 * GUN });
    await durumBekle(k, 'sona_erdi', 'apple');
    expect((await abonelik(k)).yazma_kilitli).toBe(true);
  });

  it('RevenueCat: iade (CANCELLATION + CUSTOMER_SUPPORT) erisimi bitirir; bilinmeyen kurum/urun/magaza/sandbox', async () => {
    const k = await kurumAc();
    const islem = `tx_iade_${k.kurumId}`;
    await rcGonder(k.kurumId, { transaction_id: islem });
    await durumBekle(k, 'aktif', 'apple');
    const bitis = (await abonelik(k)).abonelik?.donem_bitis_at;
    await rcGonder(k.kurumId, {
      type: 'CANCELLATION',
      cancel_reason: 'CUSTOMER_SUPPORT',
      transaction_id: islem,
      expiration_at_ms: new Date(bitis ?? '').getTime(),
    });
    await durumBekle(k, 'sona_erdi', 'apple');
    expect((await odemeler(k)).map((o) => o.durum).sort()).toEqual(['basarili', 'iade']);

    // Kurum yok: yoksayildi
    const yok = uuidv7();
    const r = await rcGonder(yok, { id: `evt_yok_${yok}` });
    expect(r.statusCode).toBe(200);
    expect((await olayDurumu(`evt_yok_${yok}`)).hata).toBe('kurum_bulunamadi');

    // Eslenmeyen urun: hata (yeniden denenir)
    const k2 = await kurumAc();
    await rcGonder(k2.kurumId, { id: `evt_urun_${k2.kurumId}`, product_id: 'bilinmeyen.urun' });
    const hata = await olayDurumu(`evt_urun_${k2.kurumId}`);
    expect(hata.durum).toBe('hata');
    // Desteklenmeyen magaza: saklanmaz
    const stripe = await rcGonder(k2.kurumId, { id: `evt_stripe_${k2.kurumId}`, store: 'STRIPE' });
    expect(stripe.json<{ durum: string }>().durum).toBe('yoksayildi');
    const [say] = await sistem<{ n: string }[]>`
      select count(*) as n from abonelik.abonelik_olaylari where dis_olay_id = ${`evt_stripe_${k2.kurumId}`}`;
    expect(Number(say?.n)).toBe(0);
  });

  it('cift kanal: iyzico aktifken magaza satin almasi abonelik acmaz (kayit + denetim + alarm); magaza aktifken iyzico 409', async () => {
    // (a) iyzico aktif, sonra Apple satin alma geldi.
    const k = await kurumAc();
    await iyzicoAktif(k);
    const evt = `evt_cift_${k.kurumId}`;
    await rcGonder(k.kurumId, { id: evt });
    const olay = await olayDurumu(evt);
    expect(olay).toMatchObject({ durum: 'yoksayildi', hata: 'cift_kanal', kurum_id: k.kurumId });
    const a = (await abonelik(k)).abonelik;
    expect(a).toMatchObject({ kaynak: 'iyzico', durum: 'aktif' });
    expect((await odemeler(k)).every((o) => o.kaynak === 'iyzico')).toBe(true);
    const [denetim] = await sistem<{ eylem: string; neden: string }[]>`
      select eylem, neden from hesap.denetim_kayitlari
       where kurum_id = ${k.kurumId} and eylem = 'sistem.abonelik_cift_kanal'`;
    expect(denetim?.neden).toContain('iade gerekebilir');
    // Ham olay kayitli (iade/inceleme icin).
    const [ham] = await sistem<{ ham_govde: string }[]>`
      select ham_govde from abonelik.abonelik_olaylari where dis_olay_id = ${evt}`;
    expect(ham?.ham_govde).toContain(k.kurumId);

    // (b) Apple aktif: iyzico odeme baslatma 409; iyzico webhook'u (sahte) abonelik degistirmez.
    const k2 = await kurumAc();
    await faturaBilgisiYaz(k2);
    await rcGonder(k2.kurumId, {});
    await durumBekle(k2, 'aktif', 'apple');
    const b = await baslat(k2);
    expect(b.statusCode).toBe(409);
    expect(b.json<Hata>().error).toMatchObject({
      code: 'abonelik_baska_kanalda',
      details: { kaynak: 'apple' },
    });
    const zorla = odemeGovdesi({
      islem: `ord_${k2.kurumId}_x`,
      abonelik: `sub_${k2.kurumId}`,
      kurumId: k2.kurumId,
      baslangicGun: 0,
      bitisGun: 30,
    });
    await iyzicoGonder(zorla);
    expect((await olayDurumu(zorla.id)).hata).toBe('cift_kanal');
    expect((await abonelik(k2)).abonelik).toMatchObject({ kaynak: 'apple', durum: 'aktif' });

    // (c) iyzico aktifken ikinci iyzico odemesi: 409 abonelik_zaten_aktif
    const k3 = await kurumAc();
    await iyzicoAktif(k3);
    const ikinci = await baslat(k3);
    expect(ikinci.statusCode).toBe(409);
    expect(ikinci.json<Hata>().error.code).toBe('abonelik_zaten_aktif');
    // ... ve ayni kurum icin farkli iyzico aboneligi gelirse (cift abonelik) abonelik degismez.
    const cift = odemeGovdesi({
      islem: `ord_${k3.kurumId}_cift`,
      abonelik: `sub_cift_${k3.kurumId}`,
      kurumId: k3.kurumId,
      baslangicGun: 0,
      bitisGun: 30,
    });
    await iyzicoGonder(cift);
    expect((await olayDurumu(cift.id)).hata).toBe('cift_kanal');
  });

  it('odeme/fatura gecmisi yalniz kendi kurumunu gosterir; yetkisiz roller 403', async () => {
    const a = await kurumAc();
    const b = await kurumAc();
    await iyzicoAktif(a);
    expect(await odemeler(b)).toHaveLength(0);
    expect(await faturalar(b)).toHaveLength(0);
    // Baska kurumun yolu: sahip degil -> reddedilir
    const res = await app.inject({ url: ab(a, '/odemeler'), headers: bearer(b.token) });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('e-Arsiv: 6 denemeden sonra hata + alarm; geri cekilme; basarili denemede kesildi + olay', async () => {
    // Odeme + fatura satirlari dogrudan (iyzico akisi gerekmez).
    const k = await kurumAc();
    const { islem } = await iyzicoAktif(k);
    await bekle(async () => (await faturalar(k))[0]?.durum === 'kesildi');
    const [odeme] = await sistem<{ id: string; abonelik_id: string }[]>`
      select id, abonelik_id from abonelik.abonelik_odemeleri where kurum_id = ${k.kurumId} and dis_islem_id = ${islem}`;
    const [ikinciOdeme] = await sistem<{ id: string }[]>`
      insert into abonelik.abonelik_odemeleri
        (id, kurum_id, abonelik_id, kaynak, dis_islem_id, durum, tutar_kurus, kdv_kurus, donem_baslangic_at, donem_bitis_at, odeme_at)
      values (${uuidv7()}, ${k.kurumId}, ${odeme?.abonelik_id ?? ''}, 'iyzico', ${`ord_${k.kurumId}_fatura`}, 'basarili',
              1000, 167, now(), now() + interval '30 days', now()) returning id`;
    const faturaId = uuidv7();
    await sistem`insert into abonelik.faturalar
      (id, kurum_id, odeme_id, alici_unvan, alici_vergi_no, alici_adres, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani)
      values (${faturaId}, ${k.kurumId}, ${ikinciOdeme?.id ?? ''}, 'Ünvan', '1234567890', '{}'::jsonb, 833, 167, 1000, 20)`;

    let denemeler = 0;
    const bozuk: EArsivSaglayici = {
      ad: 'bozuk',
      faturaKes: () => {
        denemeler += 1;
        return Promise.reject(new Error('entegratör yanıt vermedi'));
      },
    };
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const durum = async () => {
      const [f] = await sistem<{ durum: string; deneme_sayisi: number; hata: string | null }[]>`
        select durum, deneme_sayisi, hata from abonelik.faturalar where id = ${faturaId}`;
      return f;
    };
    // Gercek zamanin biraz ilerisi (DB updated_at'i gercek `now()`); her tur geri cekilmeyi asar.
    const ileri = (dk: number) => new Date(Date.now() + dk * 60_000);

    // 1. deneme hemen; ayni anda ikinci tur geri cekilme nedeniyle denemez.
    expect((await faturalariKes(sistemDb, bozuk, log, new Date(), 10, k.kurumId)).denenen).toBe(1);
    expect((await faturalariKes(sistemDb, bozuk, log, new Date(), 10, k.kurumId)).denenen).toBe(0);
    expect(denemeler).toBe(1);
    expect(await durum()).toMatchObject({
      durum: 'bekliyor',
      deneme_sayisi: 1,
      hata: 'entegratör yanıt vermedi',
    });

    // 2..5: 1 dk, 5 dk, 15 dk, 1 sa sonra
    for (const [dk, beklenen] of [
      [2, 2],
      [10, 3],
      [30, 4],
      [90, 5],
    ] as const) {
      await faturalariKes(sistemDb, bozuk, log, ileri(dk), 10, k.kurumId);
      expect((await durum())?.deneme_sayisi).toBe(beklenen);
    }
    expect(log.error).not.toHaveBeenCalled();
    // 6. deneme (6 saat sonra) basarisiz: durum 'hata' + alarm logu.
    const son = await faturalariKes(sistemDb, bozuk, log, ileri(7 * 60), 10, k.kurumId);
    expect(son.hata).toBe(1);
    expect(denemeler).toBe(6);
    expect(await durum()).toMatchObject({ durum: 'hata', deneme_sayisi: 6 });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ faturaId }),
      expect.stringContaining('abonelik_fatura_alarm'),
    );
    // Hata durumundaki fatura bir daha denenmez.
    expect((await faturalariKes(sistemDb, bozuk, log, ileri(24 * 60), 10, k.kurumId)).denenen).toBe(
      0,
    );

    // Basarili deneme: ikinci fatura (yeni) tek denemede kesilir ve olay yazilir.
    const faturaId2 = uuidv7();
    await sistem`insert into abonelik.faturalar
      (id, kurum_id, odeme_id, tur, alici_unvan, alici_vergi_no, alici_adres, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani)
      values (${faturaId2}, ${k.kurumId}, ${ikinciOdeme?.id ?? ''}, 'iade', 'Ünvan', '1234567890', '{}'::jsonb, 833, 167, 1000, 20)`;
    const iyi: EArsivSaglayici = {
      ad: 'test',
      faturaKes: (g) =>
        Promise.resolve({
          faturaNo: `T-${g.faturaId.slice(-6)}`,
          ettn: g.faturaId,
          entegratorRef: 'ref-1',
        }),
    };
    const sonuc = await faturalariKes(sistemDb, iyi, log, new Date(), 10, k.kurumId);
    expect(sonuc.kesilen).toBe(1);
    const [kesilen] = await sistem<
      { durum: string; fatura_no: string; entegrator: string; entegrator_ref: string }[]
    >`
      select durum, fatura_no, entegrator, entegrator_ref from abonelik.faturalar where id = ${faturaId2}`;
    expect(kesilen).toMatchObject({
      durum: 'kesildi',
      entegrator: 'test',
      entegrator_ref: 'ref-1',
    });
    const [olay] = await sistem<{ n: string }[]>`
      select count(*) as n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.abonelik.fatura.kesildi.v1'
        and payload->'data'->>'fatura_id' = ${faturaId2}`;
    expect(Number(olay?.n)).toBe(1);
  });

  it('donus (callback): sahte odeme sayfasi donusu isler ve web uygulamasina yonlendirir', async () => {
    const k = await kurumAc();
    await faturaBilgisiYaz(k);
    const b = (await baslat(k)).json<{ oturum_id: string; yonlendirme_url: string }>();
    const url = new URL(b.yonlendirme_url);
    const res = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('http://localhost:3000/abonelik?odeme=basarili');
    await durumBekle(k, 'aktif', 'iyzico');
    expect((await odemeler(k))[0]).toMatchObject({ durum: 'basarili', tutar_kurus: 599_880 });
    // Ayni donus tekrar: yeni odeme yok.
    const tekrar = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(tekrar.statusCode).toBe(303);
    expect(await odemeler(k)).toHaveLength(1);
    // Bilinmeyen belirtec
    const yok = await app.inject({
      method: 'GET',
      url: '/v1/abonelik/odeme/iyzico/donus?token=bilinmeyen',
    });
    expect(yok.headers.location).toBe('http://localhost:3000/abonelik?odeme=bulunamadi');
    // POST (iyzico bicimi: form govdesi)
    const post = await app.inject({
      method: 'POST',
      url: '/v1/abonelik/odeme/iyzico/donus',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'token=bilinmeyen',
    });
    expect(post.statusCode).toBe(303);
  });
});
