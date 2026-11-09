import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface KonuJson {
  id: string;
  kurum_id: string | null;
  ad: string;
  kullanimdan_kalkti: boolean;
  arsivlendi_at: string | null;
}
interface ListeJson {
  konular: KonuJson[];
  surumler: { katalog_kodu: string; surum_no: number }[];
  sonraki_imlec: string | null;
}

describe.skipIf(dbYok())('mufredat kutuphanesi API', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;

  const u1 = uuidv7(); // unite, v1+
  const k2 = uuidv7(); // v1 var, v2'de kullanimdan kalkti
  const k3 = uuidv7(); // v2'den itibaren

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
    await sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad, yayinlandi_at)
      values (${uuidv7()}, 'tyt', 1, 'TYT 1', now()), (${uuidv7()}, 'tyt', 2, 'TYT 2', now()), (${uuidv7()}, 'tyt', 3, 'TYT 3 taslak', null)`;
    const ekle = (
      id: string,
      ad: string,
      seviye: string,
      ust: string | null,
      bas: number,
      bitis: number | null,
      sira: number,
      yerine: string | null = null,
    ) => sistem`insert into ogrenme.konular
      (id, katalog_kodu, brans_kodu, ust_id, seviye, ad, sira, gecerli_surum_baslangic, gecerli_surum_bitis, yerine_gecen_id)
      values (${id}, 'tyt', 'matematik', ${ust}, ${seviye}, ${ad}, ${sira}, ${bas}, ${bitis}, ${yerine})`;
    await ekle(u1, 'Üslü Sayılar', 'unite', null, 1, null, 1);
    await ekle(k3, 'Köklü Sayılar', 'konu', u1, 2, null, 3);
    await ekle(k2, 'Kareköklü İfadeler', 'konu', u1, 1, 2, 2, k3);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const url = (kurumId: string, yol: string) => `/v1/ogrenme/kurumlar/${kurumId}${yol}`;
  const liste = async (kurumId: string, token: string, sorgu = '') => {
    const res = await y.app.inject({
      url: url(kurumId, `/konular?katalog_kodu=tyt${sorgu}`),
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    return res.json<ListeJson>();
  };
  const adlar = (l: ListeJson) => l.konular.map((k) => k.ad);

  it('surum cozumu: varsayilan en yuksek yayinlanmis; kullanimdan kalkan gizli, tumu=1 ile rozetli', async () => {
    const k = await y.kurumluKullanici();
    const v2 = await liste(k.kurumId, k.token);
    expect(v2.surumler).toEqual([{ katalog_kodu: 'tyt', surum_no: 2 }]);
    expect(adlar(v2)).toEqual(['Üslü Sayılar', 'Köklü Sayılar']);

    const v1 = await liste(k.kurumId, k.token, '&surum_no=1');
    expect(adlar(v1)).toEqual(['Üslü Sayılar', 'Kareköklü İfadeler']);

    const tumu = await liste(k.kurumId, k.token, '&tumu=1');
    const kalkan = tumu.konular.find((x) => x.id === k2);
    expect(kalkan?.kullanimdan_kalkti).toBe(true);
    expect(tumu.konular.find((x) => x.id === k3)?.kullanimdan_kalkti).toBe(false);

    // Katalog verilmezse yayinlanmis kataloglarin hepsi gelir (taslak surum sayilmaz).
    const hepsi = await y.app.inject({ url: url(k.kurumId, '/konular'), headers: bearer(k.token) });
    expect(hepsi.json<ListeJson>().surumler).toContainEqual({ katalog_kodu: 'tyt', surum_no: 2 });
  });

  it('kurum atamasi sabit surumu belirler; taslak sürüm atanamaz; yalniz yonetici atar', async () => {
    const s = await y.kur();
    const put = (token: string, govde: object) =>
      y.app.inject({
        method: 'PUT',
        url: url(s.k.kurumId, '/mufredat-atamalari'),
        headers: bearer(token),
        payload: govde,
      });
    const govde = { kapsam: 'kurum', kapsam_id: s.k.kurumId, katalog_kodu: 'tyt', surum_no: 1 };
    expect((await put(s.hoca.token, govde)).statusCode).toBe(403);
    expect((await put(s.k.token, { ...govde, surum_no: 3 })).statusCode).toBe(409);
    expect((await put(s.k.token, { ...govde, surum_no: 9 })).statusCode).toBe(404);
    expect((await put(s.k.token, { ...govde, kapsam_id: uuidv7() })).statusCode).toBe(400);
    expect((await put(s.k.token, govde)).statusCode).toBe(200);
    // upsert: ayni kapsam ikinci kez satir cogaltmaz
    expect((await put(s.k.token, { ...govde, surum_no: 2 })).statusCode).toBe(200);
    expect((await put(s.k.token, { ...govde, surum_no: 1 })).statusCode).toBe(200);

    const atamalar = await y.app.inject({
      url: url(s.k.kurumId, '/mufredat-atamalari'),
      headers: bearer(s.hoca.token),
    });
    expect(atamalar.json<{ atamalar: { surum_no: number }[] }>().atamalar).toHaveLength(1);

    const v = await liste(s.k.kurumId, s.hoca.token);
    expect(v.surumler).toEqual([{ katalog_kodu: 'tyt', surum_no: 1 }]);
    expect(adlar(v)).toContain('Kareköklü İfadeler');

    const grup = await y.grupAc(s.k, 'grup', 'Atamali');
    const g = await put(s.k.token, { ...govde, kapsam: 'grup', kapsam_id: grup.id, surum_no: 2 });
    expect(g.statusCode).toBe(200);
    const gListe = await liste(s.k.kurumId, s.k.token, `&kapsam=grup&kapsam_id=${grup.id}`);
    expect(gListe.surumler[0]?.surum_no).toBe(2);

    const kat = await y.app.inject({
      url: url(s.k.kurumId, '/kataloglar'),
      headers: bearer(s.k.token),
    });
    const tyt = kat
      .json<{
        kataloglar: {
          katalog_kodu: string;
          surumler: unknown[];
          kurum_surumu: number | null;
          en_yuksek_yayinlanmis: number;
        }[];
      }>()
      .kataloglar.find((x) => x.katalog_kodu === 'tyt');
    expect(tyt).toMatchObject({ kurum_surumu: 1, en_yuksek_yayinlanmis: 2 });
    expect(tyt?.surumler).toHaveLength(2);

    const denetim = await sistem<
      { n: number }[]
    >`select count(*)::int n from hesap.denetim_kayitlari
      where kurum_id = ${s.k.kurumId} and eylem = 'mufredat.ata'`;
    expect(denetim[0]?.n).toBe(4);
  });

  it('arama Turkce harf duyarsiz: "üslü" ve "ÜSLÜ" ayni sonuc; I/ı/İ katlanir', async () => {
    const k = await y.kurumluKullanici();
    const kucuk = await liste(k.kurumId, k.token, `&q=${encodeURIComponent('üslü')}`);
    const buyuk = await liste(k.kurumId, k.token, `&q=${encodeURIComponent('ÜSLÜ')}`);
    expect(adlar(kucuk)).toEqual(['Üslü Sayılar']);
    expect(adlar(buyuk)).toEqual(['Üslü Sayılar']);
    const noktali = await liste(k.kurumId, k.token, `&q=${encodeURIComponent('SAYILAR')}`);
    expect(adlar(noktali)).toEqual(['Üslü Sayılar', 'Köklü Sayılar']);
    const nokta = await liste(k.kurumId, k.token, `&q=${encodeURIComponent('İFADELER')}&tumu=1`);
    expect(adlar(nokta)).toEqual(['Kareköklü İfadeler']);
    const yuzde = await liste(k.kurumId, k.token, `&q=${encodeURIComponent('%')}`);
    expect(yuzde.konular).toHaveLength(0);
  });

  it('sayfalama: limit ve imlec siralamayi korur, tekrar yok', async () => {
    const k = await y.kurumluKullanici();
    const ilk = await liste(k.kurumId, k.token, '&tumu=1&limit=2');
    expect(ilk.konular).toHaveLength(2);
    expect(ilk.sonraki_imlec).not.toBeNull();
    const ikinci = await liste(
      k.kurumId,
      k.token,
      `&tumu=1&limit=2&imlec=${String(ilk.sonraki_imlec)}`,
    );
    expect(ikinci.konular).toHaveLength(1);
    expect(ikinci.sonraki_imlec).toBeNull();
    expect([...ilk.konular, ...ikinci.konular].map((x) => x.id)).toEqual([u1, k2, k3]);
  });

  it('kurum konusu: sahip ve ogretmen ekler, ogrenci okur ama yazamaz; global satir 403', async () => {
    const s = await y.kur();
    const ogr = await y.davetliUye(s.k, 'ogrenci');
    const post = (token: string, govde: object) =>
      y.app.inject({
        method: 'POST',
        url: url(s.k.kurumId, '/konular'),
        headers: bearer(token),
        payload: govde,
      });
    const unite = { brans_kodu: 'matematik', seviye: 'unite', ad: 'Okul Ünitesi' };
    expect((await post(ogr.token, unite)).statusCode).toBe(403);
    const ekle = await post(s.hoca.token, unite);
    expect(ekle.statusCode).toBe(201);
    const uniteId = ekle.json<KonuJson>().id;
    expect(ekle.json<KonuJson>().kurum_id).toBe(s.k.kurumId);

    // seviye kurali: konu ustu unite olmali, alt konu ustu konu
    const gecersiz = await post(s.k.token, {
      brans_kodu: 'matematik',
      seviye: 'alt_konu',
      ad: 'X',
      ust_id: uniteId,
    });
    expect(gecersiz.statusCode).toBe(400);
    expect(gecersiz.json<{ error: { code: string } }>().error.code).toBe('konu_ust_gecersiz');
    const bransYok = await post(s.k.token, { ...unite, brans_kodu: 'yok_brans' });
    expect(bransYok.statusCode).toBe(400);
    // global unite altina kurum konusu eklenebilir
    const globalAlti = await post(s.k.token, {
      brans_kodu: 'matematik',
      seviye: 'konu',
      ad: 'Kurum Konusu',
      ust_id: u1,
    });
    expect(globalAlti.statusCode).toBe(201);
    const konuId = globalAlti.json<KonuJson>().id;

    const patch = (token: string, id: string, govde: object) =>
      y.app.inject({
        method: 'PATCH',
        url: url(s.k.kurumId, `/konular/${id}`),
        headers: bearer(token),
        payload: govde,
      });
    const globalYaz = await patch(s.k.token, u1, { ad: 'Ele geçirildi' });
    expect(globalYaz.statusCode).toBe(403);
    expect(globalYaz.json<{ error: { code: string } }>().error.code).toBe('global_konu_yazilamaz');
    const globalArsiv = await y.app.inject({
      method: 'POST',
      url: url(s.k.kurumId, `/konular/${u1}/arsivle`),
      headers: bearer(s.k.token),
    });
    expect(globalArsiv.statusCode).toBe(403);

    const guncel = await patch(s.hoca.token, konuId, { ad: 'Kurum Konusu 2', sira: 5 });
    expect(guncel.statusCode).toBe(200);
    expect(guncel.json<KonuJson>().ad).toBe('Kurum Konusu 2');

    const arsivle = () =>
      y.app.inject({
        method: 'POST',
        url: url(s.k.kurumId, `/konular/${konuId}/arsivle`),
        headers: bearer(s.k.token),
      });
    expect((await arsivle()).statusCode).toBe(200);
    expect((await arsivle()).json<KonuJson>().arsivlendi_at).not.toBeNull(); // idempotent
    const gizli = await liste(s.k.kurumId, s.hoca.token, '&kaynak=kurum');
    expect(adlar(gizli)).toEqual(['Okul Ünitesi']);
    const rozetli = await liste(s.k.kurumId, s.hoca.token, '&kaynak=kurum&tumu=1');
    expect(rozetli.konular.find((x) => x.id === konuId)?.kullanimdan_kalkti).toBe(true);

    const detay = await y.app.inject({
      url: url(s.k.kurumId, `/konular/${konuId}`),
      headers: bearer(ogr.token),
    });
    expect(detay.statusCode).toBe(200);
    expect(detay.json<{ ust_zinciri: { id: string }[] }>().ust_zinciri.map((z) => z.id)).toEqual([
      u1,
    ]);

    const denetim = await sistem<{ eylem: string }[]>`select eylem from hesap.denetim_kayitlari
      where kurum_id = ${s.k.kurumId} and eylem like 'konu.%' order by created_at, id`;
    expect(denetim.map((d) => d.eylem)).toEqual([
      'konu.olustur',
      'konu.olustur',
      'konu.guncelle',
      'konu.arsivle',
    ]);
  });

  it('baska kurumun konusu gorunmez ve yazilamaz', async () => {
    const a = await y.kurumluKullanici();
    const b = await y.kurumluKullanici();
    const ekle = await y.app.inject({
      method: 'POST',
      url: url(a.kurumId, '/konular'),
      headers: bearer(a.token),
      payload: { brans_kodu: 'fizik', seviye: 'unite', ad: 'Sadece A' },
    });
    const id = ekle.json<KonuJson>().id;
    const bListe = await liste(b.kurumId, b.token, '&kaynak=kurum&tumu=1');
    expect(bListe.konular).toHaveLength(0);
    const bDetay = await y.app.inject({
      url: url(b.kurumId, `/konular/${id}`),
      headers: bearer(b.token),
    });
    expect(bDetay.statusCode).toBe(404);
    const bYaz = await y.app.inject({
      method: 'PATCH',
      url: url(b.kurumId, `/konular/${id}`),
      headers: bearer(b.token),
      payload: { ad: 'Ele geçirildi' },
    });
    expect(bYaz.statusCode).toBe(404);
    // B, A'nin konusunu ust olarak da kullanamaz
    const bAlt = await y.app.inject({
      method: 'POST',
      url: url(b.kurumId, '/konular'),
      headers: bearer(b.token),
      payload: { brans_kodu: 'fizik', seviye: 'konu', ad: 'Alt', ust_id: id },
    });
    expect(bAlt.statusCode).toBe(400);
    // kurum yolu baska kurumla uyusmazsa yetkisiz
    const capraz = await y.app.inject({
      url: url(a.kurumId, '/konular'),
      headers: bearer(b.token),
    });
    expect(capraz.statusCode).toBe(403);
  });
});
