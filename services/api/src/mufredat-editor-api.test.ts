import { SignJWT } from 'jose';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari } from './test/ders-yardimcilar.js';
import {
  bearer,
  dbYok,
  hataMetni,
  izoleVeritabani,
  testServisi,
  type TestServisi,
} from './test/yardimcilar.js';

interface PKonu {
  id: string;
  ust_id: string | null;
  ad: string;
  sira: number;
  yeni: boolean;
  gecerli_surum_baslangic: number;
  gecerli_surum_bitis: number | null;
  yerine_gecen_id: string | null;
}
interface Islem {
  degisiklik: { hedef_konu_id: string | null; ayrinti: Record<string, unknown> };
  konu: PKonu;
}
interface Fark {
  ozet: Record<string, number>;
  eklenen: { not: string }[];
  yeniden_adlandirilan: { ad_once: string; ad_sonra: string }[];
  tasinan: { ayrinti: Record<string, unknown> }[];
  birlesen: { konu_id: string; hedef_konu_id: string }[];
  kaldirilan: { ad_once: string }[];
}
interface Kod {
  error: { code: string };
}

describe.skipIf(dbYok())('platform mufredat editoru API', () => {
  let temizle: () => Promise<void>;
  let t: TestServisi;
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;
  let platToken: string;
  let kurum: Awaited<ReturnType<ReturnType<typeof dersYardimcilari>['kur']>>;

  // v1 (yayinli): U > S, T, K, E ; U2 ayri unite. S altinda bir kurum alt konusu ve S'e bagli odev var.
  const U = uuidv7();
  const U2 = uuidv7();
  const S = uuidv7();
  const T = uuidv7();
  const K = uuidv7();
  const E = uuidv7();
  let kurumAltKonu = '';
  let odevId = '';
  // Taslakta uretilenler
  let M = '';
  let T2 = '';
  let K2 = '';

  async function jwt(plat: string | null, kullaniciId: string): Promise<string> {
    const { kimlik } = t.service.app;
    const { kid, key } = await kimlik.anahtarlar.imzaAnahtari();
    return new SignJWT(plat ? { plat } : {})
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setSubject(kullaniciId)
      .setIssuer(kimlik.issuer)
      .setAudience(kimlik.audience)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key);
  }

  beforeAll(async () => {
    const iz = await izoleVeritabani();
    temizle = iz.temizle;
    t = testServisi({ RATE_LIMIT_MAX: '100000' }, iz.urls);
    sistem = postgres(iz.urls.sistemUrl, { max: 2, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
    await sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad, yayinlandi_at)
      values (${uuidv7()}, 'okul', 1, 'Okul 2026', now())`;
    const ekle = (id: string, ad: string, seviye: string, ust: string | null, sira: number) =>
      sistem`insert into ogrenme.konular (id, katalog_kodu, brans_kodu, ust_id, seviye, ad, sira, gecerli_surum_baslangic)
        values (${id}, 'okul', 'matematik', ${ust}, ${seviye}, ${ad}, ${sira}, 1)`;
    await ekle(U, 'Sayılar', 'unite', null, 1);
    await ekle(U2, 'Geometri', 'unite', null, 2);
    await ekle(S, 'Kareköklü İfadeler', 'konu', U, 1);
    await ekle(T, 'Köklü Sayılar', 'konu', U, 2);
    await ekle(K, 'Taşınacak Konu', 'konu', U, 3);
    await ekle(E, 'Silinecek Konu', 'konu', U, 4);
    kurum = await y.kur();
    platToken = await jwt('yonetici', kurum.k.kullaniciId);

    // Kurum verisi: S altinda kurum alt konusu ve S konusuna bagli odev.
    const alt = await y.app.inject({
      method: 'POST',
      url: `/v1/ogrenme/kurumlar/${kurum.k.kurumId}/konular`,
      headers: bearer(kurum.k.token),
      payload: { brans_kodu: 'matematik', ust_id: S, seviye: 'alt_konu', ad: 'Kurum alt konusu' },
    });
    expect(alt.statusCode, alt.body).toBe(201);
    kurumAltKonu = alt.json<{ id: string }>().id;
    const odev = await y.app.inject({
      method: 'POST',
      url: `/v1/ogrenme/kurumlar/${kurum.k.kurumId}/odevler`,
      headers: bearer(kurum.hoca.token),
      payload: {
        baslik: 'Kök problemleri',
        brans_kodu: 'matematik',
        tur: 'soru',
        hedef_turu: 'grup',
        hedef_id: kurum.grup.id,
        konu_id: S,
      },
    });
    expect(odev.statusCode, odev.body).toBe(201);
    odevId = odev.json<{ id: string }>().id;
  });

  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await temizle();
  });

  const istek = (method: 'GET' | 'POST', yol: string, payload?: unknown, token = platToken) =>
    y.app.inject({
      method,
      url: `/platform/mufredat/kataloglar/okul${yol}`,
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const agac = async (no: number) => {
    const r = await istek('GET', `/surumler/${String(no)}/agac`);
    expect(r.statusCode, r.body).toBe(200);
    return r.json<{ konular: PKonu[] }>().konular;
  };
  const adlar = (l: PKonu[]) => l.map((k) => k.ad).sort();
  const kurumKonulari = async (sorgu = '') => {
    const r = await y.app.inject({
      url: `/v1/ogrenme/kurumlar/${kurum.k.kurumId}/konular?katalog_kodu=okul${sorgu}`,
      headers: bearer(kurum.k.token),
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json<{
      konular: {
        id: string;
        ad: string;
        ust_id: string | null;
        kullanimdan_kalkti: boolean;
        yerine_gecen_id: string | null;
      }[];
    }>().konular;
  };

  it('plat claim yoksa ya da yonetici degilse 403 (govde gecersiz olsa bile); belirtecsiz 401', async () => {
    const kurumTokeni = await y.app.inject({
      url: '/platform/mufredat/kataloglar',
      headers: bearer(kurum.k.token),
    });
    expect(kurumTokeni.statusCode).toBe(403);
    expect(kurumTokeni.json<Kod>().error.code).toBe('platform_yetkisi_yok');
    const destek = await jwt('destek', kurum.k.kullaniciId);
    expect((await istek('POST', '/taslak', { ad: 'x' }, destek)).statusCode).toBe(403);
    expect((await istek('POST', '/taslak/yayinla', {}, destek)).statusCode).toBe(403);
    expect((await istek('POST', '/taslak', {}, kurum.k.token)).statusCode).toBe(403);
    expect((await y.app.inject({ url: '/platform/mufredat/kataloglar' })).statusCode).toBe(401);
  });

  it('katalog listesi; taslak yokken islem 404', async () => {
    const r = await y.app.inject({
      url: '/platform/mufredat/kataloglar',
      headers: bearer(platToken),
    });
    expect(r.statusCode).toBe(200);
    const okul = r
      .json<{
        kataloglar: {
          katalog_kodu: string;
          en_yuksek_yayinlanmis: number | null;
          taslak_surum_no: number | null;
        }[];
      }>()
      .kataloglar.find((k) => k.katalog_kodu === 'okul');
    expect(okul).toMatchObject({ en_yuksek_yayinlanmis: 1, taslak_surum_no: null });
    const yok = await istek('POST', '/taslak/konular', {
      brans_kodu: 'matematik',
      seviye: 'unite',
      ad: 'X',
      not: 'n',
    });
    expect(yok.statusCode).toBe(404);
    expect(yok.json<Kod>().error.code).toBe('taslak_yok');
  });

  it('taslak acilir (katalogda tek taslak); bos taslak yayinlanamaz; v1 agaci taslakta da vardir', async () => {
    const ac = await istek('POST', '/taslak', { ad: 'Okul 2027', aciklama: 'Yeni yıl' });
    expect(ac.statusCode, ac.body).toBe(201);
    expect(ac.json<{ surum: { surum_no: number; taslak: boolean } }>().surum).toMatchObject({
      surum_no: 2,
      taslak: true,
    });
    const ikinci = await istek('POST', '/taslak', { ad: 'İkinci' });
    expect(ikinci.statusCode).toBe(409);
    expect(ikinci.json<Kod>().error.code).toBe('taslak_var');
    const bos = await istek('POST', '/taslak/yayinla', {});
    expect(bos.statusCode).toBe(409);
    expect(bos.json<Kod>().error.code).toBe('degisiklik_yok');
    expect((await agac(2)).map((k) => k.id).sort()).toEqual([U, U2, S, T, K, E].sort());
  });

  it('konu ekle, adlandir, tasi (ust + yalniz sira), birlestir, kaldir; her degisiklik notlu', async () => {
    const ekle = await istek('POST', '/taslak/konular', {
      brans_kodu: 'matematik',
      ust_id: U,
      seviye: 'konu',
      ad: 'Mutlak Değer',
      not: 'Yeni program: mutlak değer eklendi.',
    });
    expect(ekle.statusCode, ekle.body).toBe(201);
    M = ekle.json<Islem>().konu.id;
    expect(ekle.json<Islem>().konu).toMatchObject({
      yeni: true,
      gecerli_surum_baslangic: 2,
      sira: 5,
    });

    const gecersiz = await istek('POST', '/taslak/konular', {
      brans_kodu: 'matematik',
      ust_id: U,
      seviye: 'alt_konu',
      ad: 'Olmaz',
      not: 'n',
    });
    expect(gecersiz.statusCode).toBe(400);
    const notsuz = await istek('POST', '/taslak/konular', {
      brans_kodu: 'matematik',
      seviye: 'unite',
      ad: 'A',
    });
    expect(notsuz.statusCode).toBe(400);

    // adlandir: eski satir kapanir (yerine_gecen), yeni kopya gecer.
    const ad = await istek('POST', `/taslak/konular/${T}/adlandir`, {
      ad: 'Köklü İfadeler',
      not: 'MEB adı güncellendi.',
    });
    expect(ad.statusCode, ad.body).toBe(200);
    const adSonuc = ad.json<Islem>();
    T2 = adSonuc.konu.id;
    expect(T2).not.toBe(T);
    expect(adSonuc.konu).toMatchObject({ ad: 'Köklü İfadeler', ust_id: U, yeni: true });
    expect(adSonuc.degisiklik.hedef_konu_id).toBe(T2);
    const ayniAd = await istek('POST', `/taslak/konular/${T2}/adlandir`, {
      ad: 'Köklü İfadeler',
      not: 'n',
    });
    expect(ayniAd.statusCode).toBe(400);

    // tasi: K -> U2 altina (ust degisti: kopya). Alt konusu olan bir konunun alt agaci da kopyalanir.
    const tasi = await istek('POST', `/taslak/konular/${K}/tasi`, {
      ust_id: U2,
      not: 'Geometri altına alındı.',
    });
    expect(tasi.statusCode, tasi.body).toBe(200);
    K2 = tasi.json<Islem>().konu.id;
    expect(K2).not.toBe(K);
    expect(tasi.json<Islem>().konu).toMatchObject({ ust_id: U2, yeni: true });
    // Dongu/seviye: unite baska unitenin altina konamaz; konu kendi altina konamaz.
    expect(
      (await istek('POST', `/taslak/konular/${U}/tasi`, { ust_id: U2, not: 'n' })).statusCode,
    ).toBe(400);
    // Yalniz sira (taslakta dogan M): yerinde, ayni kimlik.
    const sira = await istek('POST', `/taslak/konular/${M}/tasi`, {
      ust_id: U,
      sira: 1,
      not: 'Öne alındı.',
    });
    expect(sira.statusCode, sira.body).toBe(200);
    expect(sira.json<Islem>().konu).toMatchObject({ id: M, sira: 1 });
    expect(sira.json<Islem>().degisiklik.ayrinti['yalniz_sira']).toBe(true);
    expect(
      (await istek('POST', `/taslak/konular/${M}/tasi`, { ust_id: U, sira: 1, not: 'n' }))
        .statusCode,
    ).toBe(400);

    // birlestir: S -> T2 (ayni brans/seviye). Gecersizler: kendisiyle, farkli seviye.
    expect(
      (await istek('POST', `/taslak/konular/${S}/birlestir`, { hedef_id: S, not: 'n' })).statusCode,
    ).toBe(400);
    expect(
      (
        await istek('POST', `/taslak/konular/${S}/birlestir`, { hedef_id: U2, not: 'n' })
      ).json<Kod>().error.code,
    ).toBe('birlestirme_gecersiz');
    const birlestir = await istek('POST', `/taslak/konular/${S}/birlestir`, {
      hedef_id: T2,
      not: 'Kareköklü ifadeler köklü ifadelerle birleştirildi.',
    });
    expect(birlestir.statusCode, birlestir.body).toBe(200);

    // kaldir
    const kaldir = await istek('POST', `/taslak/konular/${E}/kaldir`, { not: 'Programdan çıktı.' });
    expect(kaldir.statusCode, kaldir.body).toBe(200);
    // Kaldirilan artik taslakta yok
    expect((await istek('POST', `/taslak/konular/${E}/kaldir`, { not: 'n' })).statusCode).toBe(404);
  });

  it('surum farki, taslak agaci; yayinli v1 agaci degismez; kurum taslagi gormez', async () => {
    const fark = (await istek('GET', '/surumler/2/fark')).json<Fark>();
    expect(fark.ozet).toEqual({
      eklenen: 1,
      yeniden_adlandirilan: 1,
      tasinan: 2,
      birlesen: 1,
      kaldirilan: 1,
    });
    expect(fark.eklenen[0]?.not).toContain('mutlak');
    expect(fark.yeniden_adlandirilan[0]).toMatchObject({
      ad_once: 'Köklü Sayılar',
      ad_sonra: 'Köklü İfadeler',
    });
    expect(fark.birlesen[0]).toMatchObject({ konu_id: S, hedef_konu_id: T2 });
    expect(fark.kaldirilan[0]?.ad_once).toBe('Silinecek Konu');

    // v1: yayinli surumun gordugu agac aynen (eski adlar, S/T/K/E).
    expect(adlar(await agac(1))).toEqual(
      [
        'Geometri',
        'Kareköklü İfadeler',
        'Köklü Sayılar',
        'Sayılar',
        'Silinecek Konu',
        'Taşınacak Konu',
      ].sort(),
    );
    // v2 taslak: yeni gorunum.
    expect(adlar(await agac(2))).toEqual(
      ['Geometri', 'Köklü İfadeler', 'Mutlak Değer', 'Sayılar', 'Taşınacak Konu'].sort(),
    );
    // Kurum taslagi gormez (hala v1).
    const kurumAd = (await kurumKonulari('&tumu=1')).map((k) => k.ad);
    expect(kurumAd).not.toContain('Mutlak Değer');
    expect(kurumAd).toContain('Kareköklü İfadeler');
  });

  it('yayin: surum degismez olur, kurum verisi kopmaz, olay ve denetim yazilir', async () => {
    const yayin = await istek('POST', '/taslak/yayinla', { not: '2027 müfredatı yayında.' });
    expect(yayin.statusCode, yayin.body).toBe(200);
    const g = yayin.json<{
      surum: { taslak: boolean; yayinlandi_at: string };
      ozet: Record<string, number>;
      bildirilen_kurum_sayisi: number;
      yeniden_baglanan_kurum_konusu: number;
    }>();
    expect(g.surum.taslak).toBe(false);
    expect(g.bildirilen_kurum_sayisi).toBeGreaterThanOrEqual(1);
    expect(g.yeniden_baglanan_kurum_konusu).toBe(1);

    // Olay: kurum basina bir tane; yalniz sayilar, kisisel veri/ad yok.
    const olaylar = await sistem<
      { payload: { data: Record<string, unknown>; kurumId: string; actor: { tur: string } } }[]
    >`
      select payload from ortak.outbox
      where subject = 'evt.ogrenme.mufredat.yayinlandi.v1' and kurum_id = ${kurum.k.kurumId}`;
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]?.payload.data).toEqual({
      katalog_kodu: 'okul',
      surum_no: 2,
      eklenen: 1,
      yeniden_adlandirilan: 1,
      tasinan: 2,
      birlesen: 1,
      kaldirilan: 1,
    });
    const [sayi] = await sistem<{ n: number }[]>`
      select count(*)::int n from ortak.outbox where subject = 'evt.ogrenme.mufredat.yayinlandi.v1'`;
    expect(sayi?.n).toBe(g.bildirilen_kurum_sayisi);

    // Kurum verisi: odev eski konu kimligiyle okunur; kurum alt konusu yeni ust konuya (T2) baglandi.
    const odev = await y.app.inject({
      url: `/v1/ogrenme/kurumlar/${kurum.k.kurumId}/odevler/${odevId}`,
      headers: bearer(kurum.hoca.token),
    });
    expect(odev.statusCode, odev.body).toBe(200);
    expect(odev.json<{ konu_id: string | null }>().konu_id).toBe(S);
    const eski = await y.app.inject({
      url: `/v1/ogrenme/kurumlar/${kurum.k.kurumId}/konular/${S}`,
      headers: bearer(kurum.hoca.token),
    });
    expect(eski.statusCode, eski.body).toBe(200);
    expect(
      eski.json<{ kullanimdan_kalkti: boolean; yerine_gecen_id: string | null }>(),
    ).toMatchObject({
      kullanimdan_kalkti: true,
      yerine_gecen_id: T2,
    });
    const liste = await kurumKonulari('&tumu=1');
    expect(liste.find((k) => k.id === kurumAltKonu)?.ust_id).toBe(T2);
    const gorunen = (await kurumKonulari()).map((k) => k.ad);
    expect(gorunen).toContain('Mutlak Değer');
    expect(gorunen).not.toContain('Kareköklü İfadeler');

    // Yayinli surum degismez: surum satiri, gunluk ve editor islemleri.
    expect(
      await hataMetni(
        sistem`update ogrenme.mufredat_surumleri set ad = 'x' where katalog_kodu = 'okul' and surum_no = 2`,
      ),
    ).toContain('yayinli_surum_degismez');
    expect(
      await hataMetni(
        sistem`insert into ogrenme.mufredat_degisiklikleri (id, katalog_kodu, surum_no, tur, konu_id, not_metni)
          values (${uuidv7()}, 'okul', 2, 'ekle', ${M}, 'sonradan')`,
      ),
    ).toContain('yayinli_surum_degismez');
    const sonra = await istek('POST', `/taslak/konular/${M}/adlandir`, { ad: 'Başka', not: 'n' });
    expect(sonra.statusCode).toBe(404);
    expect(sonra.json<Kod>().error.code).toBe('taslak_yok');
    // Fark yayinli surum icin de okunur.
    expect((await istek('GET', '/surumler/2/fark')).json<Fark>().ozet.eklenen).toBe(1);

    const [denetim] = await sistem<{ n: number }[]>`
      select count(*)::int n from hesap.denetim_kayitlari
      where eylem like 'platform.mufredat.%' and aktor_kullanici_id = ${kurum.k.kullaniciId}`;
    expect(denetim?.n).toBeGreaterThanOrEqual(8);
    const [yayinDenetimi] = await sistem<{ neden: string }[]>`
      select neden from hesap.denetim_kayitlari where eylem = 'platform.mufredat.yayinla'`;
    expect(yayinDenetimi?.neden).toBe('2027 müfredatı yayında.');
  });
});
