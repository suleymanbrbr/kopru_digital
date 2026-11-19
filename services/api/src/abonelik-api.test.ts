import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kurumsalAboneligiAktiflestir } from './modules/abonelik/index.js';
import {
  bearer,
  dbYok,
  otpIleGiris,
  rizaKabulEt,
  testDb,
  testServisi,
  yeniIp,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

/** Tek satir bekleyen sorgu sonucu (yoksa test hatasi). */
function tek<T>(satirlar: T[]): T {
  const satir = satirlar[0];
  if (satir === undefined) throw new Error('beklenen satır yok');
  return satir;
}

/** Ortak `tokenAl`, istek basina IP hiz sinirina takilir: burada her cagri ayri IP'den gelir. */
async function tokenAl(
  { service }: TestServisi,
  oturum: string,
  govde: { kurum_id?: string } = {},
) {
  const res = await service.app.inject({
    method: 'POST',
    url: '/auth/token',
    remoteAddress: yeniIp(),
    headers: bearer(oturum),
    payload: govde,
  });
  if (res.statusCode !== 200) throw new Error(`token: ${res.body}`);
  const j = res.json<{ access_token: string; uyelik_id: string | null }>();
  return { accessToken: j.access_token, uyelikId: j.uyelik_id ?? '' };
}

async function kurumluKullanici(
  t: TestServisi,
  tur: 'bireysel' | 'ekip' | 'kurum' = 'kurum',
): Promise<KurumluKullanici> {
  const giris = await otpIleGiris(t);
  const ilk = await tokenAl(t, giris.oturum);
  await rizaKabulEt(t, ilk.accessToken);
  const res = await t.service.app.inject({
    method: 'POST',
    url: '/v1/hesap/kurumlar',
    headers: bearer(ilk.accessToken),
    payload: { ad: 'Test Kurumu', tur },
  });
  if (res.statusCode !== 201) throw new Error(`kurum: ${res.body}`);
  const kurumId = res.json<{ kurum: { id: string } }>().kurum.id;
  const sonuc = await tokenAl(t, giris.oturum, { kurum_id: kurumId });
  return { ...giris, kurumId, token: sonuc.accessToken, uyelikId: sonuc.uyelikId };
}

interface Hata {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface AbonelikYaniti {
  abonelik: {
    id: string;
    kaynak: string;
    durum: string;
    plan: { kod: string };
    deneme_bitis_at: string | null;
    otomatik_yenileme: boolean;
    iptal_istendi_at: string | null;
    bekleyen_plan_kodu: string | null;
  } | null;
  ucretsiz: boolean;
  yazma_kilitli: boolean;
  limitler: Record<string, number>;
  kullanim: {
    ogrenci: { mevcut: number; ust_sinir: number | null };
    ogretmen: { mevcut: number; ust_sinir: number | null };
  };
}

describe.skipIf(dbYok())('abonelik: deneme, plan limiti, 402 ve sahip uc noktalari', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const ab = (k: { kurumId: string }, yol = '') => `/v1/abonelik/kurumlar/${k.kurumId}${yol}`;
  const hs = (k: { kurumId: string }, yol = '') => `/v1/hesap/kurumlar/${k.kurumId}${yol}`;

  const abonelikGetir = async (k: KurumluKullanici) => {
    const res = await app.inject({ url: ab(k, '/abonelik'), headers: bearer(k.token) });
    expect(res.statusCode).toBe(200);
    return res.json<AbonelikYaniti>();
  };

  /** Kurumun etkin aboneligini kucuk limitli bir test planina baglar. */
  async function sinirliPlan(k: KurumluKullanici, limitler: Record<string, number>) {
    const planId = uuidv7();
    await sistem`insert into abonelik.planlar (id, kod, surum, ad, kurum_turu, aylik_fiyat_kurus, limitler, moduller, aktif)
      values (${planId}, ${`test_${planId.slice(-8)}`}, 1, 'Test', 'kurum', 100,
              ${sistem.json({ max_ogrenci: -1, max_ogretmen: -1, max_sube: 1, medya_kota_bayt: 1, sms_aylik: 0, soru_aylik_ogrenci: -1, ...limitler })},
              ${['takvim', 'yoklama', 'finans']}::text[], false)`;
    await sistem`update abonelik.abonelikler set plan_id = ${planId} where kurum_id = ${k.kurumId} and durum = 'deneme'`;
    return planId;
  }

  const davetOlustur = async (k: KurumluKullanici, rol: 'ogrenci' | 'ogretmen') => {
    const res = await app.inject({
      method: 'POST',
      url: hs(k, '/davetler'),
      headers: bearer(k.token),
      payload: { kanal: 'baglanti', rol },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ belirtec: string }>().belirtec;
  };

  async function kullaniciHazirla() {
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(t, g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    return { ...g, token: ilk.accessToken };
  }

  const kabulEt = async (token: string, belirtec: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/hesap/davetler/kabul',
      remoteAddress: yeniIp(),
      headers: bearer(token),
      payload: { belirtec },
    });

  async function ogrenciKatil(k: KurumluKullanici) {
    const u = await kullaniciHazirla();
    return kabulEt(u.token, await davetOlustur(k, 'ogrenci'));
  }

  describe('deneme', () => {
    it('yeni kurum 14 gunluk kartsiz deneme ile baslar; plan kurum turune gore; olay outboxta', async () => {
      const k = await kurumluKullanici(t, 'bireysel');
      const y = await abonelikGetir(k);
      expect(y.abonelik).toMatchObject({
        kaynak: 'deneme',
        durum: 'deneme',
        otomatik_yenileme: false,
        iptal_istendi_at: null,
        plan: { kod: 'baslangic' },
      });
      expect(y.ucretsiz).toBe(false);
      expect(y.yazma_kilitli).toBe(false);
      expect(y.limitler).toMatchObject({ max_ogrenci: 15, max_ogretmen: 1 });
      // bireysel kurucu sahip + ogretmendir: 1 ogretmen, 0 ogrenci
      expect(y.kullanim).toEqual({
        ogrenci: { mevcut: 0, ust_sinir: 15 },
        ogretmen: { mevcut: 1, ust_sinir: 1 },
      });
      const gun = 24 * 60 * 60 * 1000;
      const kalan = new Date(y.abonelik?.deneme_bitis_at ?? 0).getTime() - Date.now();
      expect(kalan).toBeGreaterThan(13 * gun);
      expect(kalan).toBeLessThanOrEqual(14 * gun);

      const olaylar = await sistem<{ payload: { data: Record<string, unknown> } }[]>`
        select payload from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.abonelik.abonelik.degisti.v1'`;
      expect(olaylar).toHaveLength(1);
      expect(olaylar[0]?.payload.data).toMatchObject({
        kaynak: 'deneme',
        durum: 'deneme',
        plan_kodu: 'baslangic',
        limitler: { max_ogrenci: 15 },
      });
      expect(JSON.stringify(olaylar[0]?.payload)).not.toMatch(/unvan|vergi|eposta|telefon/);

      const ekip = await kurumluKullanici(t, 'ekip');
      expect((await abonelikGetir(ekip)).abonelik?.plan.kod).toBe('ekip');
      const kurum = await kurumluKullanici(t, 'kurum');
      expect((await abonelikGetir(kurum)).abonelik?.plan.kod).toBe('kurum');
    });

    it('kurum basina tek etkin abonelik (kismi benzersiz indeks); askida kayit etkin sayilmaz', async () => {
      const k = await kurumluKullanici(t);
      const [mevcut] = await sistem<{ plan_id: string }[]>`
        select plan_id from abonelik.abonelikler where kurum_id = ${k.kurumId}`;
      const ekle = (durum: string) => sistem`
        insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
        values (${uuidv7()}, ${k.kurumId}, ${mevcut?.plan_id ?? ''}, 'iyzico', ${durum}, now(), now() + interval '30 days', 100)`;
      await expect(ekle('aktif')).rejects.toThrow(/abonelikler_tek_etkin_uniq/);
      await expect(ekle('ek_sure')).rejects.toThrow(
        /abonelikler_tek_etkin_uniq|abonelikler_ek_sure_chk/,
      );
      // deneme etkindir; askidaya alinca yenisi eklenebilir
      await sistem`update abonelik.abonelikler set durum = 'askida' where kurum_id = ${k.kurumId}`;
      await ekle('aktif');
      await expect(ekle('odeme_bekliyor')).rejects.toThrow(/abonelikler_tek_etkin_uniq/);
      await ekle('iptal');
    });

    it('kisitlar: deneme kaynagi, kurumsal sozlesme no, donem sirasi', async () => {
      const k = await kurumluKullanici(t);
      const [mevcut] = await sistem<{ plan_id: string }[]>`
        select plan_id from abonelik.abonelikler where kurum_id = ${k.kurumId}`;
      const plan = mevcut?.plan_id ?? '';
      await sistem`update abonelik.abonelikler set durum = 'sona_erdi' where kurum_id = ${k.kurumId}`;
      await expect(
        sistem`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
          values (${uuidv7()}, ${k.kurumId}, ${plan}, 'kurumsal', 'aktif', now(), now() + interval '1 day', 1)`,
      ).rejects.toThrow(/abonelikler_kurumsal_chk/);
      await expect(
        sistem`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
          values (${uuidv7()}, ${k.kurumId}, ${plan}, 'iyzico', 'aktif', now(), now() - interval '1 day', 1)`,
      ).rejects.toThrow(/abonelikler_donem_chk/);
      await expect(
        sistem`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
          values (${uuidv7()}, ${k.kurumId}, ${plan}, 'iyzico', 'ek_sure', now(), now() + interval '1 day', 1)`,
      ).rejects.toThrow(/abonelikler_ek_sure_chk/);
    });
  });

  describe('plan limiti (402 plan_limiti)', () => {
    it('ogrenci limiti: davet kabulu dolunca 402, govdede limit/mevcut/ust_sinir; davet tuketilmez; veri silinmez', async () => {
      const k = await kurumluKullanici(t);
      await sinirliPlan(k, { max_ogrenci: 2 });
      expect((await ogrenciKatil(k)).statusCode).toBe(200);
      expect((await ogrenciKatil(k)).statusCode).toBe(200);

      const u = await kullaniciHazirla();
      const belirtec = await davetOlustur(k, 'ogrenci');
      const red = await kabulEt(u.token, belirtec);
      expect(red.statusCode).toBe(402);
      expect(red.json<Hata>().error).toMatchObject({
        code: 'plan_limiti',
        details: { limit: 'max_ogrenci', mevcut: 2, ust_sinir: 2 },
      });
      const [davet] = await sistem<{ durum: string; kullanim_sayisi: number }[]>`
        select durum, kullanim_sayisi from hesap.davetler where kurum_id = ${k.kurumId} order by created_at desc limit 1`;
      expect(davet).toEqual({ durum: 'bekliyor', kullanim_sayisi: 0 });
      const { n } = tek(
        await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.uyelikler where kurum_id = ${k.kurumId} and rol = 'ogrenci'`,
      );
      expect(n).toBe(2);

      // Limit yukselince ayni davet kabul edilir.
      await sistem`update abonelik.planlar set limitler = jsonb_set(limitler, '{max_ogrenci}', '3')
        where id = (select plan_id from abonelik.abonelikler where kurum_id = ${k.kurumId})`;
      expect((await kabulEt(u.token, belirtec)).statusCode).toBe(200);

      const y = await abonelikGetir(k);
      expect(y.kullanim.ogrenci).toEqual({ mevcut: 3, ust_sinir: 3 });
    });

    it('ogretmen limiti: bireysel Baslangic 1 ogretmen (sahip-ogretmen dolu) -> ogretmen daveti 402', async () => {
      const k = await kurumluKullanici(t, 'bireysel');
      const u = await kullaniciHazirla();
      const res = await kabulEt(u.token, await davetOlustur(k, 'ogretmen'));
      expect(res.statusCode).toBe(402);
      expect(res.json<Hata>().error).toMatchObject({
        code: 'plan_limiti',
        details: { limit: 'max_ogretmen', mevcut: 1, ust_sinir: 1 },
      });
    });

    it('-1 sinirsiz: limit uygulanmaz', async () => {
      const k = await kurumluKullanici(t);
      await sinirliPlan(k, { max_ogrenci: -1 });
      for (let i = 0; i < 3; i += 1) expect((await ogrenciKatil(k)).statusCode).toBe(200);
      expect((await abonelikGetir(k)).kullanim.ogrenci).toEqual({ mevcut: 3, ust_sinir: null });
    });

    it('es zamanli kabuller limiti asmaz (kurum basina advisory kilit)', async () => {
      const k = await kurumluKullanici(t);
      await sinirliPlan(k, { max_ogrenci: 2 });
      const kullanicilar = await Promise.all([1, 2, 3, 4].map(() => kullaniciHazirla()));
      const belirtecler = await Promise.all(kullanicilar.map(() => davetOlustur(k, 'ogrenci')));
      const sonuclar = await Promise.all(
        kullanicilar.map((u, i) => kabulEt(u.token, belirtecler[i] ?? '')),
      );
      expect(sonuclar.filter((r) => r.statusCode === 200)).toHaveLength(2);
      expect(sonuclar.filter((r) => r.statusCode === 402)).toHaveLength(2);
    });

    it('sinif kodu: katilim istegi dolu limitte 402; onay aninda da denetlenir', async () => {
      const k = await kurumluKullanici(t);
      const grup = (
        await app.inject({
          method: 'POST',
          url: hs(k, '/gruplar'),
          headers: bearer(k.token),
          payload: { tur: 'sinif', ad: '6-A' },
        })
      ).json<{ id: string }>();
      const kod = (
        await app.inject({
          method: 'POST',
          url: hs(k, `/gruplar/${grup.id}/katilim-kodu`),
          headers: bearer(k.token),
          payload: {},
        })
      ).json<{ kod: string }>().kod;
      await sinirliPlan(k, { max_ogrenci: 1 });

      const katil = (token: string) =>
        app.inject({
          method: 'POST',
          url: '/v1/hesap/sinif-kodu/katil',
          remoteAddress: yeniIp(),
          headers: bearer(token),
          payload: { kod },
        });
      // 1. ogrenci istek acar (bos kontenjan), onaylanmadan once limit baska yoldan dolar.
      const a = await kullaniciHazirla();
      const istek = await katil(a.token);
      expect(istek.statusCode).toBe(201);
      expect((await ogrenciKatil(k)).statusCode).toBe(200); // limit doldu (1/1)

      const b = await kullaniciHazirla();
      const red = await katil(b.token);
      expect(red.statusCode).toBe(402);
      expect(red.json<Hata>().error).toMatchObject({
        code: 'plan_limiti',
        details: { limit: 'max_ogrenci', mevcut: 1, ust_sinir: 1 },
      });

      const onay = await app.inject({
        method: 'POST',
        url: hs(
          k,
          `/gruplar/${grup.id}/katilim-istekleri/${istek.json<{ id: string }>().id}/onayla`,
        ),
        headers: bearer(k.token),
      });
      expect(onay.statusCode).toBe(402);
      expect(onay.json<Hata>().error.code).toBe('plan_limiti');
      const { durum } = tek(
        await sistem<{ durum: string }[]>`
        select durum from hesap.sinif_katilim_istekleri where id = ${istek.json<{ id: string }>().id}`,
      );
      expect(durum).toBe('bekliyor');
    });

    it('etkin abonelik yoksa ucretsiz katman (5 ogrenci); mevcut veri silinmez', async () => {
      const k = await kurumluKullanici(t);
      await sistem`update abonelik.abonelikler set durum = 'iptal' where kurum_id = ${k.kurumId}`;
      const y = await abonelikGetir(k);
      expect(y.ucretsiz).toBe(true);
      expect(y.yazma_kilitli).toBe(false);
      expect(y.limitler).toMatchObject({ max_ogrenci: 5, max_ogretmen: 1 });
      for (let i = 0; i < 5; i += 1) expect((await ogrenciKatil(k)).statusCode).toBe(200);
      expect((await ogrenciKatil(k)).statusCode).toBe(402);
    });
  });

  describe('abonelik durumu (402 abonelik_gerekli, kontrol sirasi adim 4)', () => {
    it('askida kurumda yazma 402, okuma ve abonelik uclari acik; kurumsal aktivasyonla yazma geri acilir', async () => {
      const k = await kurumluKullanici(t);
      // Askiya almadan once gecerli bir davet ve sinif kodu hazirlanir.
      const belirtec = await davetOlustur(k, 'ogrenci');
      const grup = (
        await app.inject({
          method: 'POST',
          url: hs(k, '/gruplar'),
          headers: bearer(k.token),
          payload: { tur: 'sinif', ad: '6-A' },
        })
      ).json<{ id: string }>();
      const kod = (
        await app.inject({
          method: 'POST',
          url: hs(k, `/gruplar/${grup.id}/katilim-kodu`),
          headers: bearer(k.token),
          payload: {},
        })
      ).json<{ kod: string }>().kod;
      await sistem`update abonelik.abonelikler set durum = 'askida' where kurum_id = ${k.kurumId}`;
      await sistem`update hesap.kurumlar set durum = 'askida' where id = ${k.kurumId}`;

      const yaz = await app.inject({
        method: 'PATCH',
        url: hs(k),
        headers: bearer(k.token),
        payload: { ad: 'Yeni Ad' },
      });
      expect(yaz.statusCode).toBe(402);
      expect(yaz.json<Hata>().error.code).toBe('abonelik_gerekli');

      const grupYaz = await app.inject({
        method: 'POST',
        url: hs(k, '/gruplar'),
        headers: bearer(k.token),
        payload: { tur: 'sinif', ad: '6-A' },
      });
      expect(grupYaz.statusCode).toBe(402);

      for (const url of [hs(k), hs(k, '/gruplar'), ab(k, '/abonelik'), ab(k, '/planlar')]) {
        const oku = await app.inject({ url, headers: bearer(k.token) });
        expect(oku.statusCode, url).toBe(200);
      }
      const y = await abonelikGetir(k);
      expect(y.yazma_kilitli).toBe(true);
      expect(y.abonelik?.durum).toBe('askida');
      // Abonelik uc noktalari (yazma dahil) acik: fatura bilgisi 402 olmaz.
      const fatura = await app.inject({
        method: 'PUT',
        url: ab(k, '/fatura-bilgileri'),
        headers: bearer(k.token),
        payload: {
          unvan: 'Askida Eğitim Ltd.',
          vergi_no: '1234567890',
          adres: { satir: 'Cad. 1', ilce: 'Çankaya', il: 'Ankara' },
          eposta: 'fatura@example.com',
        },
      });
      expect(fatura.statusCode).toBe(200);

      // Davet kabul ve sinif kodu katilimi da kapali
      const u = await kullaniciHazirla();
      const davet = await kabulEt(u.token, belirtec);
      expect(davet.statusCode).toBe(402);
      expect(davet.json<Hata>().error.code).toBe('abonelik_gerekli');
      const katil = await app.inject({
        method: 'POST',
        url: '/v1/hesap/sinif-kodu/katil',
        remoteAddress: yeniIp(),
        headers: bearer(u.token),
        payload: { kod },
      });
      expect(katil.statusCode).toBe(402);
      expect(katil.json<Hata>().error.code).toBe('abonelik_gerekli');

      // Kurumsal elle aktivasyon
      const sonuc = await kurumsalAboneligiAktiflestir(app.kimlik.sistemDb, {
        kurumId: k.kurumId,
        planKodu: 'kurum',
        sozlesmeNo: 'TKL-2026-001',
        aktorKullaniciId: k.kullaniciId,
        neden: 'Teklif ve fatura ile elle aktivasyon (test)',
      });
      expect(sonuc.abonelik).toMatchObject({ kaynak: 'kurumsal', durum: 'aktif' });
      const yeniden = await app.inject({
        method: 'PATCH',
        url: hs(k),
        headers: bearer(k.token),
        payload: { ad: 'Yeni Ad' },
      });
      expect(yeniden.statusCode).toBe(200);
      const [kurum] = await sistem<
        { durum: string }[]
      >`select durum from hesap.kurumlar where id = ${k.kurumId}`;
      expect(kurum?.durum).toBe('aktif');
      const { n } = tek(
        await sistem<{ n: number }[]>`
        select count(*)::int n from abonelik.abonelikler where kurum_id = ${k.kurumId} and durum in ('deneme','aktif','odeme_bekliyor','ek_sure')`,
      );
      expect(n).toBe(1);
      // askida kayit sona erdi
      const kalan = await sistem<{ durum: string }[]>`
        select durum from abonelik.abonelikler where kurum_id = ${k.kurumId} order by created_at`;
      expect(kalan.map((r) => r.durum).sort()).toEqual(['aktif', 'sona_erdi']);
    });

    it('sona_erdi kurumda da yazma 402; ek sure / odeme_bekliyor tam erisimdir', async () => {
      const k = await kurumluKullanici(t);
      const yaz = () =>
        app.inject({
          method: 'PATCH',
          url: hs(k),
          headers: bearer(k.token),
          payload: { ad: 'Ad' },
        });
      await sistem`update abonelik.abonelikler set durum = 'ek_sure', ek_sure_bitis_at = now() + interval '3 days' where kurum_id = ${k.kurumId}`;
      expect((await yaz()).statusCode).toBe(200);
      await sistem`update abonelik.abonelikler set durum = 'odeme_bekliyor', ek_sure_bitis_at = null where kurum_id = ${k.kurumId}`;
      expect((await yaz()).statusCode).toBe(200);
      await sistem`update abonelik.abonelikler set durum = 'sona_erdi' where kurum_id = ${k.kurumId}`;
      expect((await yaz()).statusCode).toBe(402);
    });

    it('askida sonra kurumsal olmayan kaynaktan aktif yeni kayit etkindir (kilit acilir)', async () => {
      const k = await kurumluKullanici(t);
      await sistem`update abonelik.abonelikler set durum = 'askida' where kurum_id = ${k.kurumId}`;
      expect((await abonelikGetir(k)).yazma_kilitli).toBe(true);
      const [mevcut] = await sistem<
        { plan_id: string }[]
      >`select plan_id from abonelik.abonelikler where kurum_id = ${k.kurumId}`;
      await sistem`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
        values (${uuidv7()}, ${k.kurumId}, ${mevcut?.plan_id ?? ''}, 'iyzico', 'aktif', now(), now() + interval '30 days', 100)`;
      const y = await abonelikGetir(k);
      expect(y.yazma_kilitli).toBe(false);
      expect(y.abonelik).toMatchObject({ kaynak: 'iyzico', durum: 'aktif' });
    });
  });

  describe('plan hakki (modul kopyasi plana baglidir)', () => {
    it('modul ayari satiri yoksa varsayilan plan modullerine baglidir; ayar plan hakkini asamaz', async () => {
      const k = await kurumluKullanici(t);
      const tumu = async () =>
        (
          await app.inject({ url: '/v1/hesap/modul-ayarlari/etkin-tumu', headers: bearer(k.token) })
        ).json<{ moduller: Record<string, boolean> }>().moduller;
      expect(Object.values(await tumu()).every(Boolean)).toBe(true);

      await sinirliPlan(k, {}); // moduller: takvim, yoklama, finans
      const m = await tumu();
      expect(m).toMatchObject({ takvim: true, yoklama: true, finans: true });
      expect(m).toMatchObject({
        odev: false,
        soru_sor: false,
        haftalik_plan: false,
        duyuru: false,
      });

      // Plan disi modulun ucu modul_kapali doner (izinden once).
      const odev = await app.inject({
        url: `/v1/ogrenme/kurumlar/${k.kurumId}/odevler`,
        headers: bearer(k.token),
      });
      expect(odev.statusCode).toBe(403);
      expect(odev.json<Hata>().error.code).toBe('modul_kapali');
      const finans = await app.inject({
        url: `/v1/finans/kurumlar/${k.kurumId}/paketler`,
        headers: bearer(k.token),
      });
      expect(finans.statusCode).toBe(200);

      // Kurum duzeyi ayar plan disi modulu acamaz; plan icindekini kapatabilir.
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${k.kurumId}, 'odev', 'kurum', ${k.kurumId}, true),
               (${uuidv7()}, ${k.kurumId}, 'finans', 'kurum', ${k.kurumId}, false)`;
      const m2 = await tumu();
      expect(m2).toMatchObject({ odev: false, finans: false, takvim: true });
    });
  });

  describe('sahip uc noktalari', () => {
    it('plan listesi kurum turune gore; abonelik + kullanim; yalniz sahip', async () => {
      const k = await kurumluKullanici(t, 'bireysel');
      const planlar = (
        await app.inject({ url: ab(k, '/planlar'), headers: bearer(k.token) })
      ).json<{ planlar: { kod: string; kurum_turu: string; aylik_fiyat_kurus: number }[] }>()
        .planlar;
      expect(planlar.map((p) => p.kod)).toEqual(['baslangic', 'koc']);
      expect(planlar.every((p) => p.kurum_turu === 'bireysel')).toBe(true);

      // magaza_urun_kodlari: tanimsizsa null; doldurulunca yalniz apple/google doner
      expect(
        (planlar as unknown as { magaza_urun_kodlari: unknown }[]).every(
          (p) => p.magaza_urun_kodlari === null,
        ),
      ).toBe(true);
      await sistem`update abonelik.planlar set magaza_urun_kodlari = ${sistem.json({ apple: 'kopru.baslangic.aylik', google: 'kopru_baslangic', diger: 'x' })} where kod = 'baslangic' and surum = 1`;
      const dolu = (await app.inject({ url: ab(k, '/planlar'), headers: bearer(k.token) })).json<{
        planlar: { kod: string; magaza_urun_kodlari: unknown }[];
      }>().planlar;
      expect(dolu.find((p) => p.kod === 'baslangic')?.magaza_urun_kodlari).toEqual({
        apple: 'kopru.baslangic.aylik',
        google: 'kopru_baslangic',
      });
      expect(dolu.find((p) => p.kod === 'koc')?.magaza_urun_kodlari).toBeNull();
      await sistem`update abonelik.planlar set magaza_urun_kodlari = null where kod = 'baslangic' and surum = 1`;

      // Sahip olmayan roller 403 izin_yok
      const u = await kullaniciHazirla();
      const kurum = await kurumluKullanici(t, 'kurum');
      const ogretmenDavet = await davetOlustur(kurum, 'ogretmen');
      const kabul = await kabulEt(u.token, ogretmenDavet);
      expect(kabul.statusCode).toBe(200);
      const tok = await tokenAl(t, u.oturum, { kurum_id: kurum.kurumId });
      for (const [yontem, yol] of [
        ['GET', '/abonelik'],
        ['GET', '/planlar'],
        ['GET', '/fatura-bilgileri'],
        ['POST', '/abonelik/iptal'],
      ] as const) {
        const r = await app.inject({
          method: yontem,
          url: ab(kurum, yol),
          headers: bearer(tok.accessToken),
        });
        expect(r.statusCode, yol).toBe(403);
        expect(r.json<Hata>().error.code).toBe('izin_yok');
      }
    });

    it('yonetici de abonelik goremez (yalniz sahip)', async () => {
      const k = await kurumluKullanici(t);
      const u = await kullaniciHazirla();
      const davet = await app.inject({
        method: 'POST',
        url: hs(k, '/davetler'),
        headers: bearer(k.token),
        payload: { kanal: 'baglanti', rol: 'yonetici' },
      });
      expect(davet.statusCode).toBe(201);
      const kabul = await kabulEt(u.token, davet.json<{ belirtec: string }>().belirtec);
      expect(kabul.statusCode).toBe(200);
      const tok = await tokenAl(t, u.oturum, { kurum_id: k.kurumId });
      const r = await app.inject({ url: ab(k, '/abonelik'), headers: bearer(tok.accessToken) });
      expect(r.statusCode).toBe(403);
    });

    it('fatura bilgisi: yoksa null; yaz (upsert); dogrulama; baska kuruma sizmaz', async () => {
      const k = await kurumluKullanici(t);
      const bos = await app.inject({ url: ab(k, '/fatura-bilgileri'), headers: bearer(k.token) });
      expect(bos.json()).toEqual({ fatura_bilgisi: null });

      const govde = {
        unvan: 'Köprü Eğitim Ltd. Şti.',
        vergi_no: '1234567890',
        vergi_dairesi: 'Kadıköy',
        adres: { satir: 'Bağdat Cad. 1', ilce: 'Kadıköy', il: 'İstanbul', posta_kodu: '34710' },
        eposta: 'fatura@example.com',
        e_fatura_mukellefi: true,
      };
      const yaz = await app.inject({
        method: 'PUT',
        url: ab(k, '/fatura-bilgileri'),
        headers: bearer(k.token),
        payload: govde,
      });
      expect(yaz.statusCode).toBe(200);
      expect(yaz.json<{ fatura_bilgisi: Record<string, unknown> }>().fatura_bilgisi).toMatchObject({
        ...govde,
        surum: 1,
      });
      const guncelle = await app.inject({
        method: 'PUT',
        url: ab(k, '/fatura-bilgileri'),
        headers: bearer(k.token),
        payload: { ...govde, unvan: 'Yeni Unvan', vergi_no: '12345678901' },
      });
      expect(guncelle.statusCode).toBe(200);
      expect(guncelle.json<{ fatura_bilgisi: { surum: number } }>().fatura_bilgisi.surum).toBe(2);
      const { n } = tek(
        await sistem<{ n: number }[]>`
        select count(*)::int n from abonelik.kurum_fatura_bilgileri where kurum_id = ${k.kurumId}`,
      );
      expect(n).toBe(1);

      for (const kotu of [
        { ...govde, vergi_no: '123' },
        { ...govde, vergi_no: 'abcdefghij' },
        { ...govde, eposta: 'gecersiz' },
        { ...govde, adres: { satir: '' } },
      ]) {
        const r = await app.inject({
          method: 'PUT',
          url: ab(k, '/fatura-bilgileri'),
          headers: bearer(k.token),
          payload: kotu,
        });
        expect(r.statusCode).toBe(400);
      }

      const baska = await kurumluKullanici(t);
      const goremez = await app.inject({
        url: ab(baska, '/fatura-bilgileri'),
        headers: bearer(baska.token),
      });
      expect(goremez.json()).toEqual({ fatura_bilgisi: null });
      // URL'deki kurum claim ile eslesmeli
      const capraz = await app.inject({
        url: ab(k, '/fatura-bilgileri'),
        headers: bearer(baska.token),
      });
      expect(capraz.statusCode).toBe(403);
      // Denetim kaydi kisisel veri icermez
      const denetim = await sistem<{ eylem: string; once: unknown; sonra: unknown }[]>`
        select eylem, once, sonra from hesap.denetim_kayitlari where kurum_id = ${k.kurumId} and eylem = 'abonelik.fatura_bilgisi_yaz'`;
      expect(denetim).toHaveLength(2);
      expect(JSON.stringify(denetim)).not.toMatch(/Köprü|1234567890|fatura@/);
    });

    it('otomatik yenileme iptali: donem sonunda sona erer, tam erisim surer, tekrar etkisiz; olay yazilir', async () => {
      const k = await kurumluKullanici(t);
      const once = await abonelikGetir(k);
      const r1 = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/iptal'),
        headers: bearer(k.token),
      });
      expect(r1.statusCode).toBe(200);
      const a1 = r1.json<{ abonelik: NonNullable<AbonelikYaniti['abonelik']> }>().abonelik;
      expect(a1).toMatchObject({
        id: once.abonelik?.id,
        durum: 'deneme',
        otomatik_yenileme: false,
      });
      expect(a1.iptal_istendi_at).not.toBeNull();
      const r2 = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/iptal'),
        headers: bearer(k.token),
      });
      expect(r2.json<{ abonelik: { iptal_istendi_at: string } }>().abonelik.iptal_istendi_at).toBe(
        a1.iptal_istendi_at,
      );
      const { n } = tek(
        await sistem<{ n: number }[]>`
        select count(*)::int n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.abonelik.abonelik.degisti.v1'`,
      );
      expect(n).toBe(2); // deneme baslangici + iptal istegi (tekrar yeni olay yazmaz)
      // denetim
      const [d] = await sistem<{ eylem: string; neden: string }[]>`
        select eylem, neden from hesap.denetim_kayitlari where kurum_id = ${k.kurumId} and eylem = 'sistem.abonelik_iptal_istegi' limit 1`;
      expect(d?.neden).toBeTruthy();
      // yazma hala acik
      const yaz = await app.inject({
        method: 'PATCH',
        url: hs(k),
        headers: bearer(k.token),
        payload: { ad: 'X' },
      });
      expect(yaz.statusCode).toBe(200);
    });

    it('iptal: etkin abonelik yoksa 409; magaza aboneligi 409', async () => {
      const k = await kurumluKullanici(t);
      await sistem`update abonelik.abonelikler set kaynak = 'apple', durum = 'aktif', dis_abonelik_id = ${uuidv7()}
        where kurum_id = ${k.kurumId}`;
      const magaza = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/iptal'),
        headers: bearer(k.token),
      });
      expect(magaza.statusCode).toBe(409);
      expect(magaza.json<Hata>().error.code).toBe('magaza_uzerinden_yonetilir');
      await sistem`update abonelik.abonelikler set durum = 'sona_erdi' where kurum_id = ${k.kurumId}`;
      const yok = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/iptal'),
        headers: bearer(k.token),
      });
      expect(yok.statusCode).toBe(409);
      expect(yok.json<Hata>().error.code).toBe('etkin_abonelik_yok');
    });

    it('plan degistirme: denemede hemen; ucretlide donem sonunda (bekleyen plan); tur uyumsuzsa 404; limit asimi bildirilir', async () => {
      const k = await kurumluKullanici(t, 'bireysel');
      const deneme = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/plan-degistir'),
        headers: bearer(k.token),
        payload: { plan_kodu: 'koc', periyot: 'yillik' },
      });
      expect(deneme.statusCode).toBe(200);
      expect(deneme.json()).toMatchObject({
        uygulama: 'hemen',
        abonelik: { plan: { kod: 'koc' }, periyot: 'yillik', bekleyen_plan_kodu: null },
        limit_asimlari: [],
      });

      for (const kod of ['kurum', 'yok_boyle_plan']) {
        const r = await app.inject({
          method: 'POST',
          url: ab(k, '/abonelik/plan-degistir'),
          headers: bearer(k.token),
          payload: { plan_kodu: kod },
        });
        expect(r.statusCode, kod).toBe(404);
        expect(r.json<Hata>().error.code).toBe('plan_bulunamadi');
      }

      // 3 ogrenci ekle, ucretli aboneligi simule et, 1 ogrencilik plana dusur
      for (let i = 0; i < 2; i += 1) expect((await ogrenciKatil(k)).statusCode).toBe(200);
      await sistem`update abonelik.abonelikler set kaynak = 'iyzico', durum = 'aktif', deneme_bitis_at = null
        where kurum_id = ${k.kurumId}`;
      const dusuk = uuidv7();
      await sistem`insert into abonelik.planlar (id, kod, surum, ad, kurum_turu, aylik_fiyat_kurus, limitler, moduller)
        values (${dusuk}, 'test_dusuk', 1, 'Düşük', 'bireysel', 1,
                ${sistem.json({ max_ogrenci: 1, max_ogretmen: 1, max_sube: 1, medya_kota_bayt: 1, sms_aylik: 0, soru_aylik_ogrenci: -1 })},
                ${['takvim']}::text[])`;
      const dusur = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/plan-degistir'),
        headers: bearer(k.token),
        payload: { plan_kodu: 'test_dusuk' },
      });
      expect(dusur.statusCode).toBe(200);
      expect(dusur.json()).toMatchObject({
        uygulama: 'donem_sonu',
        abonelik: { plan: { kod: 'koc' }, bekleyen_plan_kodu: 'test_dusuk' },
        limit_asimlari: [{ limit: 'max_ogrenci', mevcut: 2, ust_sinir: 1 }],
      });
      // mevcut plan hemen degismedi: limit hala koc'un
      expect((await abonelikGetir(k)).limitler.max_ogrenci).toBe(60);
      // ayni plana donmek istegi geri alir
      const geri = await app.inject({
        method: 'POST',
        url: ab(k, '/abonelik/plan-degistir'),
        headers: bearer(k.token),
        payload: { plan_kodu: 'koc' },
      });
      expect(
        geri.json<{ abonelik: { bekleyen_plan_kodu: string | null } }>().abonelik
          .bekleyen_plan_kodu,
      ).toBeNull();
    });
  });
});
