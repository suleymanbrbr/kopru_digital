import { createDb, withTenant, withUser, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bearer,
  dbYok,
  hataMetni,
  otpIleGiris,
  rizaKabulEt,
  testDb,
  testServisi,
  yeniIp,
  type GirisSonucu,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

interface Kod {
  id: string;
  kod: string;
  aktif: boolean;
  max_kullanim: number | null;
  kullanim_sayisi: number;
}
interface Istek {
  id: string;
  durum: string;
  kurum_id?: string;
  grup_id: string;
}
interface Hata {
  error: { code: string; message: string };
}
interface Ogrenci extends GirisSonucu {
  token: string;
}

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

async function kurumluKullanici(t: TestServisi, ad = 'Test Kurumu'): Promise<KurumluKullanici> {
  const giris = await otpIleGiris(t);
  const ilk = await tokenAl(t, giris.oturum);
  await rizaKabulEt(t, ilk.accessToken);
  const res = await t.service.app.inject({
    method: 'POST',
    url: '/v1/hesap/kurumlar',
    headers: bearer(ilk.accessToken),
    payload: { ad, tur: 'kurum' },
  });
  if (res.statusCode !== 201) throw new Error(`kurum: ${res.body}`);
  const kurumId = res.json<{ kurum: { id: string } }>().kurum.id;
  const sonuc = await tokenAl(t, giris.oturum, { kurum_id: kurumId });
  return { ...giris, kurumId, token: sonuc.accessToken, uyelikId: sonuc.uyelikId };
}

describe.skipIf(dbYok())('hesap: sinif katilim kodu ve ogretmen onayi', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let appDb: Database;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 3 });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
  });

  const api = (k: { kurumId: string }, yol: string) => `/v1/hesap/kurumlar/${k.kurumId}${yol}`;

  async function grupAc(k: KurumluKullanici, ek: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: api(k, '/gruplar'),
      headers: bearer(k.token),
      payload: { tur: 'sinif', ad: '6-A', ...ek },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>();
  }

  async function kodOlustur(
    k: KurumluKullanici,
    grupId: string,
    payload: Record<string, unknown> = {},
    token = k.token,
  ) {
    return app.inject({
      method: 'POST',
      url: api(k, `/gruplar/${grupId}/katilim-kodu`),
      headers: bearer(token),
      payload,
    });
  }

  async function kodAl(k: KurumluKullanici, grupId: string, payload: Record<string, unknown> = {}) {
    const res = await kodOlustur(k, grupId, payload);
    expect(res.statusCode).toBe(201);
    return res.json<Kod>();
  }

  /** Giris + KVKK yapmis, henuz hicbir kurumda uye olmayan kullanici. */
  async function ogrenciHazirla(): Promise<Ogrenci> {
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(t, g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    return { ...g, token: ilk.accessToken };
  }

  const katil = (token: string, kod: string, remoteAddress = yeniIp()) =>
    app.inject({
      method: 'POST',
      url: '/v1/hesap/sinif-kodu/katil',
      remoteAddress,
      headers: bearer(token),
      payload: { kod },
    });

  const karar = (
    k: { kurumId: string },
    token: string,
    grupId: string,
    istekId: string,
    eylem: 'onayla' | 'reddet',
  ) =>
    app.inject({
      method: 'POST',
      url: api(k, `/gruplar/${grupId}/katilim-istekleri/${istekId}/${eylem}`),
      headers: bearer(token),
    });

  async function ogretmenEkle(k: KurumluKullanici, grupId?: string) {
    const d = (
      await app.inject({
        method: 'POST',
        url: api(k, '/davetler'),
        headers: bearer(k.token),
        payload: { kanal: 'baglanti', rol: 'ogretmen' },
      })
    ).json<{ belirtec: string }>();
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(t, g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    const kabul = await app.inject({
      method: 'POST',
      url: '/v1/hesap/davetler/kabul',
      headers: bearer(ilk.accessToken),
      payload: { belirtec: d.belirtec },
    });
    expect(kabul.statusCode).toBe(200);
    const uyelikId = kabul.json<{ uyelik_id: string }>().uyelik_id;
    if (grupId) {
      const ata = await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${grupId}/atamalar`),
        headers: bearer(k.token),
        payload: { ogretmen_id: uyelikId, brans_kodu: 'matematik' },
      });
      expect(ata.statusCode).toBe(201);
    }
    const tok = await tokenAl(t, g.oturum, { kurum_id: k.kurumId });
    return { token: tok.accessToken, uyelikId, oturum: g.oturum };
  }

  const uyeler = async (k: KurumluKullanici, grupId: string) =>
    (
      await app.inject({ url: api(k, `/gruplar/${grupId}/uyeler`), headers: bearer(k.token) })
    ).json<{ uyeler: { ogrenci_id: string; katilim_yolu: string }[] }>().uyeler;

  describe('kod yonetimi', () => {
    it('olustur / getir / yenile (eski kod kapanir) / kapat; kod deseni ve alfabe', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const bos = await app.inject({
        url: api(k, `/gruplar/${g.id}/katilim-kodu`),
        headers: bearer(k.token),
      });
      expect(bos.statusCode).toBe(404);

      const ilk = await kodAl(k, g.id, { gecerlilik_gun: 7, max_kullanim: 30 });
      expect(ilk.kod).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      expect(ilk.max_kullanim).toBe(30);
      const gor = await app.inject({
        url: api(k, `/gruplar/${g.id}/katilim-kodu`),
        headers: bearer(k.token),
      });
      expect(gor.json<Kod>().kod).toBe(ilk.kod);

      const yeni = await kodAl(k, g.id);
      expect(yeni.kod).not.toBe(ilk.kod);
      const [eski] = await sistem<{ aktif: boolean; iptal_at: Date | null }[]>`
        select aktif, iptal_at from hesap.sinif_katilim_kodlari where id = ${ilk.id}`;
      expect(eski?.aktif).toBe(false);
      expect(eski?.iptal_at).not.toBeNull();

      const kapat = await app.inject({
        method: 'DELETE',
        url: api(k, `/gruplar/${g.id}/katilim-kodu`),
        headers: bearer(k.token),
      });
      expect(kapat.statusCode).toBe(200);
      expect(kapat.json<Kod>().aktif).toBe(false);
      const tekrar = await app.inject({
        method: 'DELETE',
        url: api(k, `/gruplar/${g.id}/katilim-kodu`),
        headers: bearer(k.token),
      });
      expect(tekrar.statusCode).toBe(404);

      const denetim = await sistem<{ eylem: string }[]>`
        select eylem from hesap.denetim_kayitlari where kurum_id = ${k.kurumId}
          and eylem like 'hesap.sinif_kodu%' order by created_at`;
      expect(denetim.map((d) => d.eylem)).toEqual([
        'hesap.sinif_kodu_olustur',
        'hesap.sinif_kodu_olustur',
        'hesap.sinif_kodu_kapat',
      ]);
    });

    it('sinif olmayan grup 422, arsivli grup 409', async () => {
      const k = await kurumluKullanici(t);
      const etut = await grupAc(k, { tur: 'etut', ad: 'Etut' });
      const r = await kodOlustur(k, etut.id);
      expect(r.statusCode).toBe(422);
      expect(r.json<Hata>().error.code).toBe('grup_sinif_degil');

      const sinif = await grupAc(k);
      await app.inject({
        method: 'POST',
        url: api(k, `/gruplar/${sinif.id}/arsivle`),
        headers: bearer(k.token),
      });
      const r2 = await kodOlustur(k, sinif.id);
      expect(r2.statusCode).toBe(409);
      expect(r2.json<Hata>().error.code).toBe('grup_arsivde');
    });

    it('ogrenci kod yonetemez ve onaylayamaz (403); atanmamis ogretmen 404', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      const istek = (await katil(o.token, kod.kod)).json<Istek>();

      // Ogrenci uye olmadan kurum tokeni alamaz; uye ogrenci ile 403 dogrulanir.
      const d = (
        await app.inject({
          method: 'POST',
          url: api(k, '/davetler'),
          headers: bearer(k.token),
          payload: { kanal: 'baglanti', rol: 'ogrenci', grup_id: g.id },
        })
      ).json<{ belirtec: string }>();
      const uye = await ogrenciHazirla();
      const kabul = await app.inject({
        method: 'POST',
        url: '/v1/hesap/davetler/kabul',
        headers: bearer(uye.token),
        payload: { belirtec: d.belirtec },
      });
      expect(kabul.statusCode).toBe(200);
      const uyeToken = (await tokenAl(t, uye.oturum, { kurum_id: k.kurumId })).accessToken;

      expect((await kodOlustur(k, g.id, {}, uyeToken)).statusCode).toBe(403);
      expect((await karar(k, uyeToken, g.id, istek.id, 'onayla')).statusCode).toBe(403);
      expect(
        (
          await app.inject({
            url: api(k, `/gruplar/${g.id}/katilim-istekleri`),
            headers: bearer(uyeToken),
          })
        ).statusCode,
      ).toBe(403);

      const atanmamis = await ogretmenEkle(k);
      expect((await kodOlustur(k, g.id, {}, atanmamis.token)).statusCode).toBe(404);
      expect((await karar(k, atanmamis.token, g.id, istek.id, 'onayla')).statusCode).toBe(404);
      expect((await karar(k, atanmamis.token, g.id, istek.id, 'reddet')).statusCode).toBe(404);
      const liste = await app.inject({
        url: api(k, `/gruplar/${g.id}/katilim-istekleri`),
        headers: bearer(atanmamis.token),
      });
      expect(liste.statusCode).toBe(404);
      // Hicbiri istegi degistirmedi.
      const [satir] = await sistem<{ durum: string }[]>`
        select durum from hesap.sinif_katilim_istekleri where id = ${istek.id}`;
      expect(satir?.durum).toBe('bekliyor');
    });
  });

  describe('katilim ve onay', () => {
    it('uctan uca: katil -> bekleyen -> atanmis ogretmen onaylar -> gruba sinif_kodu ile eklenir', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const hoca = await ogretmenEkle(k, g.id);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();

      const r1 = await katil(o.token, kod.kod.toLowerCase());
      expect(r1.statusCode).toBe(201);
      const istek = r1.json<Istek & { kurum_ad: string; grup_ad: string }>();
      expect(istek.durum).toBe('bekliyor');
      expect(istek.kurum_ad).toBe('Test Kurumu');
      expect(istek.grup_ad).toBe('6-A');
      // Idempotent: ayni bekleyen istek.
      const r2 = await katil(o.token, kod.kod);
      expect(r2.statusCode).toBe(200);
      expect(r2.json<Istek>().id).toBe(istek.id);

      // Henuz uye degil.
      expect(await uyeler(k, g.id)).toHaveLength(0);

      // Liste: ad var, iletisim bilgisi yok.
      const liste = await app.inject({
        url: api(k, `/gruplar/${g.id}/katilim-istekleri?durum=bekliyor`),
        headers: bearer(hoca.token),
      });
      expect(liste.statusCode).toBe(200);
      const govde = liste.body;
      expect(liste.json<{ istekler: Istek[] }>().istekler).toHaveLength(1);
      expect(govde).not.toContain(o.telefon);
      expect(govde).not.toContain('telefon');
      expect(govde).not.toContain('eposta');

      // Kendi bekleyenlerim.
      const kendi = await app.inject({
        url: '/v1/hesap/sinif-kodu/istekler',
        headers: bearer(o.token),
      });
      expect(kendi.json<{ istekler: Istek[] }>().istekler.map((i) => i.id)).toEqual([istek.id]);

      const on = await karar(k, hoca.token, g.id, istek.id, 'onayla');
      expect(on.statusCode).toBe(200);
      const onay = on.json<{ istek: Istek; uyelik_id: string; grup_uyesi_id: string }>();
      expect(onay.istek.durum).toBe('onaylandi');
      const u = await uyeler(k, g.id);
      expect(u).toHaveLength(1);
      expect(u[0]?.katilim_yolu).toBe('sinif_kodu');
      expect(u[0]?.ogrenci_id).toBe(onay.uyelik_id);

      // Cift onay etkisiz: ayni sonuc, tek uyelik, sayac 1.
      const on2 = await karar(k, hoca.token, g.id, istek.id, 'onayla');
      expect(on2.statusCode).toBe(200);
      expect(on2.json<{ uyelik_id: string }>().uyelik_id).toBe(onay.uyelik_id);
      expect(await uyeler(k, g.id)).toHaveLength(1);
      const [kodSatir] = await sistem<{ kullanim_sayisi: number }[]>`
        select kullanim_sayisi from hesap.sinif_katilim_kodlari where id = ${kod.id}`;
      expect(kodSatir?.kullanim_sayisi).toBe(1);

      // Uye oldu: tekrar katilmak 409 zaten_uye; ogrenci kurum tokeni alabilir.
      const tekrar = await katil(o.token, kod.kod);
      expect(tekrar.statusCode).toBe(409);
      expect(tekrar.json<Hata>().error.code).toBe('zaten_uye');
      expect((await tokenAl(t, o.oturum, { kurum_id: k.kurumId })).uyelikId).toBe(onay.uyelik_id);

      // Onaylanmis istek iptal/reddedilemez.
      expect((await karar(k, hoca.token, g.id, istek.id, 'reddet')).statusCode).toBe(409);
      const iptal = await app.inject({
        method: 'POST',
        url: `/v1/hesap/sinif-kodu/istekler/${istek.id}/iptal`,
        headers: bearer(o.token),
      });
      expect(iptal.statusCode).toBe(409);
      expect(iptal.json<Hata>().error.code).toBe('istek_beklemiyor');

      // Olaylar: uyelik + grup_uyesi; kisisel veri yok; denetim kaydi var.
      const olaylar = await sistem<{ subject: string; p: string }[]>`
        select subject, payload::text p from ortak.outbox
        where kurum_id = ${k.kurumId}
          and subject in ('evt.hesap.uyelik.degisti.v1', 'evt.hesap.grup_uyesi.degisti.v1')
          and payload::text like ${'%' + onay.uyelik_id + '%'}`;
      expect(olaylar.map((x) => x.subject).sort()).toEqual([
        'evt.hesap.grup_uyesi.degisti.v1',
        'evt.hesap.uyelik.degisti.v1',
      ]);
      for (const o2 of olaylar) {
        expect(o2.p).not.toContain(o.telefon);
        expect(o2.p).not.toContain('@');
        expect(o2.p).not.toContain('gorunen_ad');
      }
      const [uyelikOlayi] = olaylar.filter((x) => x.subject === 'evt.hesap.uyelik.degisti.v1');
      expect(uyelikOlayi?.p).toContain('"rol": "ogrenci"');
      const denetim = await sistem<{ eylem: string; aktor_uyelik_id: string }[]>`
        select eylem, aktor_uyelik_id from hesap.denetim_kayitlari
        where kurum_id = ${k.kurumId} and hedef_id = ${istek.id}`;
      expect(denetim).toEqual([
        { eylem: 'hesap.sinif_katilim_onayla', aktor_uyelik_id: hoca.uyelikId },
      ]);
    });

    it('ret: ogrenci eklenmez, uyelik olusmaz; ret idempotent; sonra yeni istek acilabilir', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      const istek = (await katil(o.token, kod.kod)).json<Istek>();

      const red = await karar(k, k.token, g.id, istek.id, 'reddet');
      expect(red.statusCode).toBe(200);
      expect(red.json<{ istek: Istek }>().istek.durum).toBe('reddedildi');
      expect((await karar(k, k.token, g.id, istek.id, 'reddet')).statusCode).toBe(200);
      const on = await karar(k, k.token, g.id, istek.id, 'onayla');
      expect(on.statusCode).toBe(409);
      expect(on.json<Hata>().error.code).toBe('istek_beklemiyor');
      expect(await uyeler(k, g.id)).toHaveLength(0);
      const [sayi] = await sistem<{ n: string }[]>`
        select count(*) n from hesap.uyelikler where kurum_id = ${k.kurumId} and rol = 'ogrenci'`;
      expect(sayi?.n).toBe('0');
      const [kodSatir] = await sistem<{ kullanim_sayisi: number }[]>`
        select kullanim_sayisi from hesap.sinif_katilim_kodlari where id = ${kod.id}`;
      expect(kodSatir?.kullanim_sayisi).toBe(0);

      const yeni = await katil(o.token, kod.kod);
      expect(yeni.statusCode).toBe(201);
      expect(yeni.json<Istek>().id).not.toBe(istek.id);
    });

    it('kendi istegini iptal eder (idempotent); baskasinin istegi 404; iptal sonrasi onay 409', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      const baskasi = await ogrenciHazirla();
      const istek = (await katil(o.token, kod.kod)).json<Istek>();
      const iptalUrl = `/v1/hesap/sinif-kodu/istekler/${istek.id}/iptal`;

      expect(
        (await app.inject({ method: 'POST', url: iptalUrl, headers: bearer(baskasi.token) }))
          .statusCode,
      ).toBe(404);
      const iptal = await app.inject({ method: 'POST', url: iptalUrl, headers: bearer(o.token) });
      expect(iptal.statusCode).toBe(200);
      expect(iptal.json<Istek>().durum).toBe('iptal');
      expect(
        (await app.inject({ method: 'POST', url: iptalUrl, headers: bearer(o.token) })).statusCode,
      ).toBe(200);
      expect((await karar(k, k.token, g.id, istek.id, 'onayla')).statusCode).toBe(409);
      const kendi = await app.inject({
        url: '/v1/hesap/sinif-kodu/istekler',
        headers: bearer(o.token),
      });
      expect(kendi.json<{ istekler: unknown[] }>().istekler).toHaveLength(0);
    });

    it('kapasite dolu: onay 409 kapasite_dolu, istek bekler, sayac artmaz', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k, { kapasite: 1 });
      const kod = await kodAl(k, g.id);
      const a = await ogrenciHazirla();
      const b = await ogrenciHazirla();
      const ia = (await katil(a.token, kod.kod)).json<Istek>();
      const ib = (await katil(b.token, kod.kod)).json<Istek>();
      expect((await karar(k, k.token, g.id, ia.id, 'onayla')).statusCode).toBe(200);
      const dolu = await karar(k, k.token, g.id, ib.id, 'onayla');
      expect(dolu.statusCode).toBe(409);
      expect(dolu.json<Hata>().error.code).toBe('kapasite_dolu');
      const [satir] = await sistem<{ durum: string }[]>`
        select durum from hesap.sinif_katilim_istekleri where id = ${ib.id}`;
      expect(satir?.durum).toBe('bekliyor');
      // Geri alinan islemde ikinci ogrencinin uyeligi de olusmadi.
      const [sayi] = await sistem<{ n: string }[]>`
        select count(*) n from hesap.uyelikler where kurum_id = ${k.kurumId} and rol = 'ogrenci'`;
      expect(sayi?.n).toBe('1');
      const [kodSatir] = await sistem<{ kullanim_sayisi: number }[]>`
        select kullanim_sayisi from hesap.sinif_katilim_kodlari where id = ${kod.id}`;
      expect(kodSatir?.kullanim_sayisi).toBe(1);
    });

    it('max_kullanim onayda da denetlenir (409 kod_kullanim_doldu); dolu kod yeni istek almaz', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id, { max_kullanim: 1 });
      const a = await ogrenciHazirla();
      const b = await ogrenciHazirla();
      const ia = (await katil(a.token, kod.kod)).json<Istek>();
      const ib = (await katil(b.token, kod.kod)).json<Istek>();
      expect((await karar(k, k.token, g.id, ia.id, 'onayla')).statusCode).toBe(200);
      const dolu = await karar(k, k.token, g.id, ib.id, 'onayla');
      expect(dolu.statusCode).toBe(409);
      expect(dolu.json<Hata>().error.code).toBe('kod_kullanim_doldu');
      expect(await uyeler(k, g.id)).toHaveLength(1);
      const c = await ogrenciHazirla();
      expect((await katil(c.token, kod.kod)).statusCode).toBe(410);
    });

    it('eszamanli iki onay: tek uyelik, tek grup uyeligi, sayac 1, ikisi de 200', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const hoca = await ogretmenEkle(k, g.id);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      const istek = (await katil(o.token, kod.kod)).json<Istek>();
      const sonuclar = await Promise.all([
        karar(k, k.token, g.id, istek.id, 'onayla'),
        karar(k, hoca.token, g.id, istek.id, 'onayla'),
        karar(k, k.token, g.id, istek.id, 'onayla'),
      ]);
      expect(sonuclar.map((s) => s.statusCode)).toEqual([200, 200, 200]);
      const [uyelik] = await sistem<{ n: string }[]>`
        select count(*) n from hesap.uyelikler where kurum_id = ${k.kurumId} and rol = 'ogrenci'`;
      expect(uyelik?.n).toBe('1');
      expect(await uyeler(k, g.id)).toHaveLength(1);
      const [kodSatir] = await sistem<{ kullanim_sayisi: number }[]>`
        select kullanim_sayisi from hesap.sinif_katilim_kodlari where id = ${kod.id}`;
      expect(kodSatir?.kullanim_sayisi).toBe(1);
      const olay = await sistem<{ n: string }[]>`
        select count(*) n from ortak.outbox
        where kurum_id = ${k.kurumId} and subject = 'evt.hesap.grup_uyesi.degisti.v1'`;
      expect(olay[0]?.n).toBe('1');
    });
  });

  describe('gecersiz kod ve hiz siniri', () => {
    it('bulunamayan, kapatilan, suresi dolan, yenilenen eski kod: ayni 410 kod_gecersiz yaniti', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const gecerli = await kodAl(k, g.id);

      const bulunamayan = 'ABCDEFGH';
      const yenilenenEski = gecerli.kod;
      const yeni = await kodAl(k, g.id);
      const kapatilan = yeni.kod;
      await app.inject({
        method: 'DELETE',
        url: api(k, `/gruplar/${g.id}/katilim-kodu`),
        headers: bearer(k.token),
      });
      const sureli = await kodAl(k, g.id);
      await sistem`update hesap.sinif_katilim_kodlari set expires_at = now() - interval '1 minute'
                   where id = ${sureli.id}`;

      const yanitlar: { durum: number; hata: Hata['error'] }[] = [];
      for (const kod of [bulunamayan, yenilenenEski, kapatilan, sureli.kod, 'kisa', '!!!']) {
        const o = await ogrenciHazirla();
        const r = await katil(o.token, kod);
        yanitlar.push({ durum: r.statusCode, hata: r.json<Hata>().error });
      }
      for (const y of yanitlar) {
        expect(y.durum).toBe(410);
        expect(y.hata.code).toBe('kod_gecersiz');
        expect(y.hata.message).toBe(yanitlar[0]?.hata.message);
      }
      // Uyelik/istek yaratilmadi.
      const [n] = await sistem<{ n: string }[]>`
        select count(*) n from hesap.sinif_katilim_istekleri where kurum_id = ${k.kurumId}`;
      expect(n?.n).toBe('0');
    });

    it('IP basina dakikada 10 istek: 11. istek 429', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      const ip = yeniIp();
      const kodlar: number[] = [];
      for (let i = 0; i < 11; i++) kodlar.push((await katil(o.token, kod.kod, ip)).statusCode);
      expect(kodlar.slice(0, 10).every((c) => c === 201 || c === 200)).toBe(true);
      expect(kodlar[10]).toBe(429);
    });

    it('5 basarisiz denemeden sonra gecerli kod bile 429 (bekleme)', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      for (let i = 0; i < 5; i++) {
        expect((await katil(o.token, 'ABCDEFGH')).statusCode).toBe(410);
      }
      const bekle = await katil(o.token, kod.kod);
      expect(bekle.statusCode).toBe(429);
      expect(bekle.json<Hata>().error.code).toBe('rate_limited');
      // Baska kullanici + baska IP etkilenmez.
      const baska = await ogrenciHazirla();
      expect((await katil(baska.token, kod.kod)).statusCode).toBe(201);
    });
  });

  describe('kiraci izolasyonu', () => {
    it('B kurumu A kurumunun istegini goremez, onaylayamaz, reddedemez; kod yonetemez', async () => {
      const a = await kurumluKullanici(t, 'Kurum A');
      const b = await kurumluKullanici(t, 'Kurum B');
      const gA = await grupAc(a);
      const gB = await grupAc(b);
      const kodA = await kodAl(a, gA.id);
      const o = await ogrenciHazirla();
      const istek = (await katil(o.token, kodA.kod)).json<Istek>();

      // B tokeni A'nin URL'sine: 403; B tokeni kendi kurumunda A'nin grup/istek kimligiyle: 404.
      const capraz = await app.inject({
        url: api(a, `/gruplar/${gA.id}/katilim-istekleri`),
        headers: bearer(b.token),
      });
      expect(capraz.statusCode).toBe(403);
      for (const eylem of ['onayla', 'reddet'] as const) {
        expect((await karar(a, b.token, gA.id, istek.id, eylem)).statusCode).toBe(403);
        expect((await karar(b, b.token, gA.id, istek.id, eylem)).statusCode).toBe(404);
        expect((await karar(b, b.token, gB.id, istek.id, eylem)).statusCode).toBe(404);
      }
      expect(
        (
          await app.inject({
            url: api(b, `/gruplar/${gA.id}/katilim-istekleri`),
            headers: bearer(b.token),
          })
        ).statusCode,
      ).toBe(404);
      expect((await kodOlustur(b, gA.id)).statusCode).toBe(404);
      const [satir] = await sistem<{ durum: string }[]>`
        select durum from hesap.sinif_katilim_istekleri where id = ${istek.id}`;
      expect(satir?.durum).toBe('bekliyor');
    });

    it('api_app ile dogrudan RLS: yanlis kiraci okuyamaz/guncelleyemez/ekleyemez; kullanici yalniz kendisini gorur', async () => {
      const a = await kurumluKullanici(t, 'Kurum A');
      const b = await kurumluKullanici(t, 'Kurum B');
      const gA = await grupAc(a);
      const kodA = await kodAl(a, gA.id);
      const o = await ogrenciHazirla();
      const diger = await ogrenciHazirla();
      const istek = (await katil(o.token, kodA.kod)).json<Istek>();
      const ctxB = { kurumId: b.kurumId, kullaniciId: b.kullaniciId, roller: ['sahip'] };

      const okuma = await withTenant(appDb, ctxB, (tx) =>
        tx.execute(sql`select * from hesap.sinif_katilim_istekleri`),
      );
      expect(okuma).toHaveLength(0);
      const guncelle = await withTenant(appDb, ctxB, (tx) =>
        tx.execute(
          sql`update hesap.sinif_katilim_istekleri set durum = 'reddedildi' where id = ${istek.id} returning id`,
        ),
      );
      expect(guncelle).toHaveLength(0);
      const ekle = await hataMetni(
        withTenant(appDb, ctxB, (tx) =>
          tx.execute(sql`insert into hesap.sinif_katilim_istekleri
            (id, kurum_id, grup_id, kod_id, kullanici_id)
            values (${uuidv7()}, ${a.kurumId}, ${gA.id}, ${kodA.id}, ${diger.kullaniciId})`),
        ),
      );
      expect(ekle).toContain('row-level security');
      // Kiraci baglami olmadan satir yok.
      const baglamsiz = await appDb.orm.execute(sql`select * from hesap.sinif_katilim_istekleri`);
      expect(baglamsiz).toHaveLength(0);

      // Kullanici duzeyi: yalniz kendi satirini gorur ve iptal edebilir.
      const kendi = await withUser(appDb, { kullaniciId: o.kullaniciId }, (tx) =>
        tx.execute<{ id: string }>(sql`select id from hesap.sinif_katilim_istekleri`),
      );
      expect(kendi.map((r) => r.id)).toEqual([istek.id]);
      const baskasi = await withUser(appDb, { kullaniciId: diger.kullaniciId }, (tx) =>
        tx.execute(sql`select id from hesap.sinif_katilim_istekleri`),
      );
      expect(baskasi).toHaveLength(0);
      const baskasiIptal = await withUser(appDb, { kullaniciId: diger.kullaniciId }, (tx) =>
        tx.execute(
          sql`update hesap.sinif_katilim_istekleri set durum = 'iptal' where id = ${istek.id} returning id`,
        ),
      );
      expect(baskasiIptal).toHaveLength(0);
      // Kullanici duzeyi baglamla onaylanamaz (yalniz iptale izin var).
      const onay = await hataMetni(
        withUser(appDb, { kullaniciId: o.kullaniciId }, (tx) =>
          tx.execute(sql`update hesap.sinif_katilim_istekleri set durum = 'onaylandi',
            karar_veren_id = ${a.uyelikId}, karar_at = now() where id = ${istek.id}`),
        ),
      );
      expect(onay).toContain('row-level security');
    });

    it('katilim_kodu_coz yalniz kurum_id, grup_id, kod_id doner; api_app koda dogrudan erisemez', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const satir = await appDb.orm.execute(sql`select * from hesap.katilim_kodu_coz(${kod.kod})`);
      expect(satir).toHaveLength(1);
      expect(Object.keys(satir[0] ?? {}).sort()).toEqual(['grup_id', 'kod_id', 'kurum_id']);
      expect(satir[0]?.kod_id).toBe(kod.id);
      const dogrudan = await appDb.orm.execute(
        sql`select kod from hesap.sinif_katilim_kodlari where kod = ${kod.kod}`,
      );
      expect(dogrudan).toHaveLength(0);
    });
  });

  describe('veri butunlugu', () => {
    it('ayni kullanici icin grup basina tek bekleyen istek (kismi UNIQUE); karar alanlari tutarli', async () => {
      const k = await kurumluKullanici(t);
      const g = await grupAc(k);
      const kod = await kodAl(k, g.id);
      const o = await ogrenciHazirla();
      await katil(o.token, kod.kod);
      const cift = await hataMetni(
        sistem`insert into hesap.sinif_katilim_istekleri (id, kurum_id, grup_id, kod_id, kullanici_id)
               values (${uuidv7()}, ${k.kurumId}, ${g.id}, ${kod.id}, ${o.kullaniciId})`,
      );
      expect(cift).toContain('bekleyen_uniq');
      const tutarsiz = await hataMetni(
        sistem`update hesap.sinif_katilim_istekleri set durum = 'onaylandi'
               where kullanici_id = ${o.kullaniciId}`,
      );
      expect(tutarsiz).toContain('karar_chk');
    });

    it('OpenAPI: kod ve istek rotalari yayimlanir', async () => {
      const res = await app.inject({ url: '/openapi.json' });
      const paths = Object.keys(res.json<{ paths: Record<string, unknown> }>().paths);
      for (const yol of [
        '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-kodu',
        '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri',
        '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/onayla',
        '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/reddet',
        '/v1/hesap/sinif-kodu/katil',
        '/v1/hesap/sinif-kodu/istekler',
        '/v1/hesap/sinif-kodu/istekler/{istek_id}/iptal',
      ]) {
        expect(paths, yol).toContain(yol);
      }
    });
  });
});
