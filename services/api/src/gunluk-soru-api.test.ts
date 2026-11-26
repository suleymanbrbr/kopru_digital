import { randomInt } from 'node:crypto';

import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { haftaBaslangici, planBugunu, tarihEkle } from './modules/ogrenme/index.js';
import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { sahteMedya } from './test/sahte-medya.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface Kayit {
  id: string;
  ogrenci_id: string;
  gun: string;
  brans_kodu: string;
  konu_id: string;
  konu_ad: string | null;
  zorluk: string;
  kaynak_test_id: string | null;
  kaynak_kitap_id: string | null;
  kaynak_metin: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  toplam: number;
  plan_gorev_id: string | null;
  dosyalar: { medya_dosya_id: string; sira: number }[];
  duzenlenebilir: boolean;
  surum: number;
}
interface Hucre {
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
  basari: number | null;
}
interface KonuAnalizi {
  konu_id: string;
  konu_ad: string | null;
  hucreler: Record<'kolay' | 'orta' | 'zor' | 'belirtilmemis', Hucre>;
  toplam: Hucre;
  bant: { durum: string; bant: string | null };
}
interface Analiz {
  konular: KonuAnalizi[];
  toplam: Hucre;
  oneriler?: { tur: string; konu_id: string; zorluk?: string; soru_sayisi?: number }[];
}
interface Kitap {
  id: string;
  ad: string;
  test_sayisi: number;
  toplam_soru: number;
  sahip_uyelik_id: string | null;
  ilerleme: { cozulen_test: number; toplam_test: number } | null;
  surum: number;
  testler: { id: string; sira: number; cozuldu_gun?: string | null }[];
}

const MEDYA_PORT = 40_000 + randomInt(0, 20_000);
const BUGUN = planBugunu();
const BU_HAFTA = haftaBaslangici(BUGUN);
const KISISEL_ALANLAR = ['ad', 'gorunen_ad', 'telefon', 'eposta', 'kaynak_metin', 'baslik', 'not'];

describe.skipIf(dbYok())('gunluk soru takibi API', { timeout: 90_000 }, () => {
  const urls = testDb();
  const t = testServisi({
    RATE_LIMIT_MAX: '100000',
    LOG_LEVEL: 'error',
    MEDYA_URL: `http://127.0.0.1:${String(MEDYA_PORT)}`,
    MEDYA_ZAMAN_ASIMI_MS: '5000',
  });
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;
  let medya: Awaited<ReturnType<typeof sahteMedya>>;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
    medya = await sahteMedya(
      async () =>
        (await t.service.app.inject({ url: '/.well-known/jwks.json' })).json<{ keys: never[] }>(),
      () => t.service.app.kimlik.issuer,
      MEDYA_PORT,
    );
  });
  afterAll(async () => {
    await medya.kapat();
    await t.service.stop();
    await sistem.end();
  });

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;
  const istek = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    kurumId: string,
    token: string,
    yol: string,
    payload?: unknown,
  ) =>
    y.app.inject({
      method,
      url: `/v1/ogrenme/kurumlar/${kurumId}${yol}`,
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  interface Ortam {
    s: Kurulum;
    ogrenci: Uye;
    hoca2: Uye;
    konu: string; // biyoloji / genetik
    konu2: string; // biyoloji / hucre
    matKonu: string;
  }

  /**
   * Konu (kurumun kendi konusu): global konu acmak paylasilan test veritabaninda mufredat testlerini bozar.
   * Sistem rolu yazar.
   */
  async function konuAc(kurumId: string, brans: string, ad: string, ust: string | null = null) {
    const id = uuidv7();
    await sistem`
      insert into ogrenme.konular (id, kurum_id, brans_kodu, ust_id, seviye, ad)
      values (${id}, ${kurumId}, ${brans}, ${ust}, ${ust ? 'konu' : 'unite'}, ${ad})`;
    return id;
  }

  async function ortamKur(): Promise<Ortam> {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const ogrenci = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId]);
    const hoca2 = await y.davetliUye(s.k, 'ogretmen'); // gruba atanmamis baska ogretmen
    const unite = await konuAc(s.k.kurumId, 'biyoloji', 'Kalıtım');
    return {
      s,
      ogrenci,
      hoca2,
      konu: await konuAc(s.k.kurumId, 'biyoloji', 'Genetik', unite),
      konu2: await konuAc(s.k.kurumId, 'biyoloji', 'Hücre'),
      matKonu: await konuAc(s.k.kurumId, 'matematik', 'Türev'),
    };
  }

  const govde = (o: Ortam, ek: Record<string, unknown> = {}) => ({
    brans_kodu: 'biyoloji',
    konu_id: o.konu,
    zorluk: 'orta',
    dogru: 8,
    yanlis: 2,
    bos: 0,
    ...ek,
  });
  const kayitAc = async (o: Ortam, ek: Record<string, unknown> = {}, token = o.ogrenci.token) => {
    const res = await istek('POST', o.s.k.kurumId, token, '/gunluk-soru/kayitlar', govde(o, ek));
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Kayit>();
  };
  /** Hizli tohum (sistem rolu): analiz ve performans verisi. */
  async function tohum(
    o: Ortam,
    konuId: string,
    zorluk: string,
    dogru: number,
    yanlis: number,
    bos: number,
    gunOnce: number,
    brans = 'biyoloji',
    ogrenciId = o.ogrenci.uyelikId,
  ) {
    await sistem`
      insert into ogrenme.gunluk_soru_kayitlari
        (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, yanlis, bos)
      values (${uuidv7()}, ${o.s.k.kurumId}, ${ogrenciId}, ${tarihEkle(BUGUN, -gunOnce)}, ${brans},
              ${konuId}, ${zorluk}, ${dogru}, ${yanlis}, ${bos})`;
  }
  const analizAl = (o: Ortam, token: string, yol: string, sorgu = '') =>
    istek('GET', o.s.k.kurumId, token, `${yol}/analiz?brans_kodu=biyoloji${sorgu}`);
  const hocaYolu = (o: Ortam) => `/ogrenciler/${o.ogrenci.uyelikId}/gunluk-soru`;

  const outbox = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject}
      order by created_at, id`;
  const xpOlaylari = (kurumId: string) =>
    outbox(kurumId, 'evt.ogrenme.gunluk_soru.kaydedildi.v1').then((r) =>
      r.map((x) => x.payload.data),
    );

  async function kopya(kurumId: string, kullaniciId: string, tur = 'gunluk_soru_fotografi') {
    const id = uuidv7();
    await sistem`
      insert into ortak.medya_dosya_kopyalari
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
      values (${id}, ${kurumId}, ${kullaniciId}, ${tur}, 'hazir', 'image/jpeg', 1000, ${uuidv7()})`;
    return id;
  }

  describe('kaynak kitap', () => {
    it('ogretmen kitap tanimlar, ogrenci okur ama yazamaz, baska ogretmen baskasinin kitabini degistiremez', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const r = await istek('POST', k.kurumId, o.s.hoca.token, '/kaynak-kitaplar', {
        ad: 'Biyoloji Soru Bankası',
        yayinevi: 'X Yayınları',
        brans_kodu: 'biyoloji',
        testler: [
          { ad: 'Test 1', soru_sayisi: 20 },
          { ad: 'Test 2', soru_sayisi: 15, konu_id: o.konu },
        ],
      });
      expect(r.statusCode, r.body).toBe(201);
      const kitap = r.json<Kitap>();
      expect(kitap).toMatchObject({
        test_sayisi: 2,
        toplam_soru: 35,
        sahip_uyelik_id: o.s.hoca.uyelikId,
      });
      expect(kitap.testler.map((x) => x.sira)).toEqual([1, 2]);

      const yazOgrenci = await istek('POST', k.kurumId, o.ogrenci.token, '/kaynak-kitaplar', {
        ad: 'X',
        brans_kodu: 'biyoloji',
      });
      expect(yazOgrenci.statusCode).toBe(403);
      const liste = await istek('GET', k.kurumId, o.ogrenci.token, '/kaynak-kitaplar');
      expect(liste.statusCode).toBe(200);
      expect(liste.json<{ kitaplar: Kitap[] }>().kitaplar.map((x) => x.id)).toContain(kitap.id);

      const baskasi = await istek(
        'PATCH',
        k.kurumId,
        o.hoca2.token,
        `/kaynak-kitaplar/${kitap.id}`,
        { ad: 'Ele geçirildi' },
      );
      expect(baskasi.statusCode).toBe(403);
      // yonetici (sahip) kurum olarak degistirebilir; pasiflestirince ogrenci listesinden duser
      const pasif = await istek('PATCH', k.kurumId, k.token, `/kaynak-kitaplar/${kitap.id}`, {
        aktif: false,
      });
      expect(pasif.statusCode, pasif.body).toBe(200);
      const liste2 = await istek('GET', k.kurumId, o.ogrenci.token, '/kaynak-kitaplar');
      expect(liste2.json<{ kitaplar: Kitap[] }>().kitaplar.map((x) => x.id)).not.toContain(
        kitap.id,
      );
      const detay = await istek('GET', k.kurumId, o.ogrenci.token, `/kaynak-kitaplar/${kitap.id}`);
      expect(detay.statusCode).toBe(404);
    });

    it('test ekleme/guncelleme/silme; kullanilan test silinemez; ogrenci ilerlemesi', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const kitap = (
        await istek('POST', k.kurumId, o.s.hoca.token, '/kaynak-kitaplar', {
          ad: 'Kitap',
          brans_kodu: 'biyoloji',
          testler: [{ ad: 'T1', soru_sayisi: 10 }],
        })
      ).json<Kitap>();
      const ek = await istek(
        'POST',
        k.kurumId,
        o.s.hoca.token,
        `/kaynak-kitaplar/${kitap.id}/testler`,
        {
          testler: [
            { ad: 'T2', soru_sayisi: 12 },
            { ad: 'T3', soru_sayisi: 8 },
          ],
        },
      );
      expect(ek.statusCode, ek.body).toBe(201);
      const testler = ek.json<Kitap>().testler;
      expect(testler.map((x) => x.sira)).toEqual([1, 2, 3]);
      const [t1, t2, t3] = testler;
      if (!t1 || !t2 || !t3) throw new Error('testler');

      const guncel = await istek(
        'PATCH',
        k.kurumId,
        o.s.hoca.token,
        `/kaynak-kitaplar/${kitap.id}/testler/${t3.id}`,
        { soru_sayisi: 9 },
      );
      expect(guncel.statusCode).toBe(200);

      // Ogrenci T1'i kaynak olarak kullanir -> T1 silinemez, ilerleme 1/3
      await kayitAc(o, { kaynak_test_id: t1.id });
      const sil = await istek(
        'DELETE',
        k.kurumId,
        o.s.hoca.token,
        `/kaynak-kitaplar/${kitap.id}/testler/${t1.id}`,
      );
      expect(sil.statusCode).toBe(409);
      expect(hataKodu(sil)).toBe('kaynak_testi_kullanimda');
      const silT2 = await istek(
        'DELETE',
        k.kurumId,
        o.s.hoca.token,
        `/kaynak-kitaplar/${kitap.id}/testler/${t2.id}`,
      );
      expect(silT2.statusCode).toBe(204);

      const detay = await istek('GET', k.kurumId, o.ogrenci.token, `/kaynak-kitaplar/${kitap.id}`);
      const d = detay.json<Kitap>();
      expect(d.ilerleme).toEqual({ cozulen_test: 1, toplam_test: 2 });
      expect(d.testler.find((x) => x.id === t1.id)?.cozuldu_gun).toBe(BUGUN);
      expect(d.testler.find((x) => x.id === t3.id)?.cozuldu_gun).toBeNull();
      // Ogretmen ogrenci_id ile ilerlemeyi gorur; kapsam disi ogretmen goremez (404)
      const h = await istek(
        'GET',
        k.kurumId,
        o.s.hoca.token,
        `/kaynak-kitaplar?ogrenci_id=${o.ogrenci.uyelikId}`,
      );
      expect(h.json<{ kitaplar: Kitap[] }>().kitaplar[0]?.ilerleme).toEqual({
        cozulen_test: 1,
        toplam_test: 2,
      });
      const kapsamDisi = await istek(
        'GET',
        k.kurumId,
        o.hoca2.token,
        `/kaynak-kitaplar?ogrenci_id=${o.ogrenci.uyelikId}`,
      );
      expect(kapsamDisi.statusCode).toBe(404);
    });
  });

  describe('kayit olusturma, duzeltme, silme', () => {
    it('3 zorlukta kayit; kitap testi ya da serbest metin; liste ve son kullanilanlar', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const kitap = (
        await istek('POST', k.kurumId, o.s.hoca.token, '/kaynak-kitaplar', {
          ad: 'Bank',
          brans_kodu: 'biyoloji',
          testler: [{ ad: 'Test 4', soru_sayisi: 20 }],
        })
      ).json<Kitap>();
      const testId = kitap.testler[0]?.id ?? '';
      const kolay = await kayitAc(o, { zorluk: 'kolay', dogru: 9, yanlis: 1 });
      const orta = await kayitAc(o, { zorluk: 'orta', kaynak_test_id: testId });
      const zor = await kayitAc(o, {
        zorluk: 'zor',
        kaynak_metin: 'Deneme föyü',
        konu_id: o.konu2,
      });
      expect(kolay).toMatchObject({
        toplam: 10,
        zorluk: 'kolay',
        duzenlenebilir: true,
        konu_ad: 'Genetik',
      });
      expect(orta).toMatchObject({ kaynak_test_id: testId, kaynak_kitap_id: kitap.id });
      expect(zor).toMatchObject({ kaynak_metin: 'Deneme föyü', konu_ad: 'Hücre' });

      const liste = await istek('GET', k.kurumId, o.ogrenci.token, '/gunluk-soru/kayitlar');
      const l = liste.json<{ kayitlar: Kayit[]; sonraki_imlec: string | null }>();
      expect(l.kayitlar.map((x) => x.id)).toEqual([zor.id, orta.id, kolay.id]);
      const sayfa = await istek('GET', k.kurumId, o.ogrenci.token, '/gunluk-soru/kayitlar?limit=2');
      const s1 = sayfa.json<{ kayitlar: Kayit[]; sonraki_imlec: string | null }>();
      expect(s1.kayitlar).toHaveLength(2);
      const s2 = await istek(
        'GET',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar?limit=2&imlec=${s1.sonraki_imlec ?? ''}`,
      );
      expect(s2.json<{ kayitlar: Kayit[] }>().kayitlar.map((x) => x.id)).toEqual([kolay.id]);

      const son = await istek('GET', k.kurumId, o.ogrenci.token, '/gunluk-soru/son-kullanilanlar');
      const sk = son.json<{
        dersler: {
          brans_kodu: string;
          konular: { konu_id: string; son_zorluk: string }[];
          kaynaklar: {
            kitap_ad: string | null;
            test_ad: string | null;
            kaynak_metin: string | null;
          }[];
        }[];
      }>();
      expect(sk.dersler).toHaveLength(1);
      expect(sk.dersler[0]?.konular.map((x) => x.konu_id)).toEqual([o.konu2, o.konu]);
      expect(sk.dersler[0]?.kaynaklar).toEqual([
        {
          kaynak_test_id: null,
          kaynak_kitap_id: null,
          kitap_ad: null,
          test_ad: null,
          kaynak_metin: 'Deneme föyü',
        },
        {
          kaynak_test_id: testId,
          kaynak_kitap_id: kitap.id,
          kitap_ad: 'Bank',
          test_ad: 'Test 4',
          kaynak_metin: null,
        },
      ]);
      // personel bu uclari kullanamaz
      const hoca = await istek('GET', k.kurumId, o.s.hoca.token, '/gunluk-soru/kayitlar');
      expect(hoca.statusCode).toBe(403);
    });

    it('istek_id idempotent: tekrar gonderim ayni kaydi 200 ile doner, tek kayit ve tek XP olayi', async () => {
      const o = await ortamKur();
      const istekId = uuidv7();
      const ilk = await istek(
        'POST',
        o.s.k.kurumId,
        o.ogrenci.token,
        '/gunluk-soru/kayitlar',
        govde(o, { istek_id: istekId }),
      );
      expect(ilk.statusCode).toBe(201);
      const tekrar = await istek(
        'POST',
        o.s.k.kurumId,
        o.ogrenci.token,
        '/gunluk-soru/kayitlar',
        govde(o, { istek_id: istekId }),
      );
      expect(tekrar.statusCode).toBe(200);
      expect(tekrar.json<Kayit>().id).toBe(ilk.json<Kayit>().id);
      const [n] = await sistem<{ n: number }[]>`
        select count(*)::int n from ogrenme.gunluk_soru_kayitlari where kurum_id = ${o.s.k.kurumId}`;
      expect(n?.n).toBe(1);
      expect(await xpOlaylari(o.s.k.kurumId)).toHaveLength(1);
    });

    it('dogrulamalar: gun, konu/brans uyumu, kaynak cakismasi, toplam, kapsam ve plan gorevi', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const post = (ek: Record<string, unknown>) =>
        istek('POST', k.kurumId, o.ogrenci.token, '/gunluk-soru/kayitlar', govde(o, ek));
      const dun = tarihEkle(BUGUN, -1);
      expect((await post({ gun: dun })).statusCode).toBe(201);
      const gelecek = await post({ gun: tarihEkle(BUGUN, 1) });
      expect(gelecek.statusCode).toBe(422);
      expect(hataKodu(gelecek)).toBe('gun_gecersiz');
      expect(hataKodu(await post({ gun: tarihEkle(BUGUN, -7) }))).toBe('gun_gecersiz');
      expect((await post({ gun: tarihEkle(BUGUN, -6) })).statusCode).toBe(201);
      // konu matematik konusu ama brans biyoloji
      expect(hataKodu(await post({ konu_id: o.matKonu }))).toBe('konu_gecersiz');
      expect(hataKodu(await post({ konu_id: uuidv7() }))).toBe('konu_gecersiz');
      expect((await post({ brans_kodu: 'yok_brans' })).statusCode).toBe(422);
      // sifir soru, cok soru, kaynak ikisi birden: dogrulama hatasi
      expect((await post({ dogru: 0, yanlis: 0, bos: 0 })).statusCode).toBe(400);
      expect((await post({ dogru: 400, yanlis: 101 })).statusCode).toBe(400);
      expect((await post({ kaynak_test_id: uuidv7(), kaynak_metin: 'x' })).statusCode).toBe(400);
      expect(hataKodu(await post({ kaynak_test_id: uuidv7() }))).toBe('kaynak_testi_gecersiz');
      expect(hataKodu(await post({ plan_gorev_id: uuidv7() }))).toBe('plan_gorevi_gecersiz');
      // ogretmen kayit yazamaz
      const hoca = await istek(
        'POST',
        k.kurumId,
        o.s.hoca.token,
        '/gunluk-soru/kayitlar',
        govde(o),
      );
      expect(hoca.statusCode).toBe(403);
    });

    it('ayni gun duzelt ve sil; baska ogrencinin kaydi 404; gun sonra 409; XP olaylari surumlu', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const diger = await y.davetliUye(k, 'ogrenci');
      await y.gruba(k, o.s.grup.id, [diger.uyelikId]);
      const kayit = await kayitAc(o);

      const duz = await istek(
        'PATCH',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${kayit.id}`,
        {
          dogru: 12,
          zorluk: 'zor',
          surum: kayit.surum,
        },
      );
      expect(duz.statusCode, duz.body).toBe(200);
      const guncel = duz.json<Kayit>();
      expect(guncel).toMatchObject({ dogru: 12, yanlis: 2, toplam: 14, zorluk: 'zor' });
      expect(guncel.surum).toBeGreaterThan(kayit.surum);
      const eski = await istek(
        'PATCH',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${kayit.id}`,
        {
          dogru: 1,
          surum: kayit.surum,
        },
      );
      expect(eski.statusCode).toBe(409);
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      expect(
        (
          await istek('PATCH', k.kurumId, o.ogrenci.token, `/gunluk-soru/kayitlar/${kayit.id}`, {
            dogru: 0,
            yanlis: 0,
            bos: 0,
          })
        ).statusCode,
      ).toBe(422);
      // baska ogrenci ve ogretmen
      expect(
        (
          await istek('PATCH', k.kurumId, diger.token, `/gunluk-soru/kayitlar/${kayit.id}`, {
            dogru: 3,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await istek('DELETE', k.kurumId, diger.token, `/gunluk-soru/kayitlar/${kayit.id}`))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await istek('PATCH', k.kurumId, o.s.hoca.token, `/gunluk-soru/kayitlar/${kayit.id}`, {
            dogru: 3,
          })
        ).statusCode,
      ).toBe(403);

      const sil = await istek(
        'DELETE',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${kayit.id}`,
      );
      expect(sil.statusCode).toBe(204);
      const olaylar = await xpOlaylari(k.kurumId);
      expect(olaylar.map((e) => [e.kayit_surumu, e.silindi, e.toplam, e.onceki_toplam])).toEqual([
        [1, false, 10, 0],
        [2, false, 14, 10],
        [3, true, 0, 14],
      ]);
      for (const e of olaylar) {
        expect(Object.keys(e).filter((a) => KISISEL_ALANLAR.includes(a))).toEqual([]);
      }

      // Gun gecmis: olusturulma gunu dune alinirsa duzeltme/silme 409
      const eskiKayit = await kayitAc(o);
      await sistem`update ogrenme.gunluk_soru_kayitlari
        set created_at = now() - interval '2 days' where id = ${eskiKayit.id}`;
      const pat = await istek(
        'PATCH',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${eskiKayit.id}`,
        { dogru: 1 },
      );
      expect(pat.statusCode).toBe(409);
      expect(hataKodu(pat)).toBe('kayit_duzenlenemez');
      const del = await istek(
        'DELETE',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${eskiKayit.id}`,
      );
      expect(hataKodu(del)).toBe('kayit_duzenlenemez');
      const liste = await istek('GET', k.kurumId, o.ogrenci.token, '/gunluk-soru/kayitlar');
      expect(liste.json<{ kayitlar: Kayit[] }>().kayitlar[0]?.duzenlenebilir).toBe(false);
    });

    it('fotograf: baglama ve birakma olaylari, baskasinin ve zaten bagli dosya reddi, hazir degil 409', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const f1 = await kopya(k.kurumId, o.ogrenci.kullaniciId);
      const f2 = await kopya(k.kurumId, o.ogrenci.kullaniciId);
      const baskasi = await kopya(k.kurumId, o.s.hoca.kullaniciId);
      const yanlisTur = await kopya(k.kurumId, o.ogrenci.kullaniciId, 'soru_fotografi');

      const kayit = await kayitAc(o, { dosya_idleri: [f1, f2] });
      expect(kayit.dosyalar.map((d) => d.medya_dosya_id)).toEqual([f1, f2]);
      const baglama = (await outbox(k.kurumId, 'evt.ortak.dosya.baglandi.v1')).map(
        (e) => e.payload.data,
      );
      expect(baglama).toHaveLength(2);
      expect(baglama[0]).toMatchObject({ bagli_tur: 'gunluk_soru_kaydi', bagli_id: kayit.id });

      const post = (ek: Record<string, unknown>) =>
        istek('POST', k.kurumId, o.ogrenci.token, '/gunluk-soru/kayitlar', govde(o, ek));
      expect(hataKodu(await post({ dosya_idleri: [baskasi] }))).toBe('dosya_gecersiz');
      expect(hataKodu(await post({ dosya_idleri: [yanlisTur] }))).toBe('dosya_gecersiz');
      expect(hataKodu(await post({ dosya_idleri: [uuidv7()] }))).toBe('dosya_hazir_degil');
      // zaten bagli (ilk kayda) dosya baska kayda verilemez
      expect(hataKodu(await post({ dosya_idleri: [f1] }))).toBe('dosya_zaten_bagli');

      // Duzeltme: f1 cikar, yeni f3 ekle
      const f3 = await kopya(k.kurumId, o.ogrenci.kullaniciId);
      const duz = await istek(
        'PATCH',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/kayitlar/${kayit.id}`,
        {
          dosya_idleri: [f2, f3],
        },
      );
      expect(duz.statusCode, duz.body).toBe(200);
      expect(duz.json<Kayit>().dosyalar).toEqual([
        { medya_dosya_id: f2, sira: 0 },
        { medya_dosya_id: f3, sira: 1 },
      ]);
      const birakildi = (await outbox(k.kurumId, 'evt.ortak.dosya.birakildi.v1')).map(
        (e) => e.payload.data,
      );
      expect(birakildi).toEqual([
        { dosya_id: f1, bagli_tur: 'gunluk_soru_kaydi', bagli_id: kayit.id, hemen_sil: true },
      ]);
      // Silme: kalan iki dosya birakilir
      expect(
        (await istek('DELETE', k.kurumId, o.ogrenci.token, `/gunluk-soru/kayitlar/${kayit.id}`))
          .statusCode,
      ).toBe(204);
      const birakildi2 = (await outbox(k.kurumId, 'evt.ortak.dosya.birakildi.v1')).map(
        (e) => e.payload.data.dosya_id,
      );
      expect(new Set(birakildi2)).toEqual(new Set([f1, f2, f3]));
      // En fazla 5 fotograf
      const alti = await Promise.all(
        Array.from({ length: 6 }, () => kopya(k.kurumId, o.ogrenci.kullaniciId)),
      );
      expect((await post({ dosya_idleri: alti })).statusCode).toBe(400);
    });

    it('plan gorevine bagli kayit gorevin gerceklesenini doldurur; duzeltme ve silme geri alir', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const plan = await istek('POST', k.kurumId, o.s.hoca.token, '/planlar', {
        ogrenci_id: o.ogrenci.uyelikId,
        hafta_baslangic: BU_HAFTA,
      });
      expect(plan.statusCode, plan.body).toBe(201);
      const planId = plan.json<{ plan: { id: string } }>().plan.id;
      const gorev = await istek('POST', k.kurumId, o.s.hoca.token, `/planlar/${planId}/gorevler`, {
        gun: BU_HAFTA,
        brans_kodu: 'biyoloji',
        hedef_turu: 'soru',
        hedef_miktar: 20,
      });
      expect(gorev.statusCode, gorev.body).toBe(201);
      const gorevId = gorev.json<{ id: string }>().id;
      // Taslak planin gorevi baglanamaz
      const taslak = await istek(
        'POST',
        k.kurumId,
        o.ogrenci.token,
        '/gunluk-soru/kayitlar',
        govde(o, { plan_gorev_id: gorevId }),
      );
      expect(hataKodu(taslak)).toBe('plan_gorevi_gecersiz');
      expect(
        (await istek('POST', k.kurumId, o.s.hoca.token, `/planlar/${planId}/yayinla`, {}))
          .statusCode,
      ).toBe(200);

      const okuGorev = async () =>
        (
          await sistem<{ gerceklesen_miktar: number | null; durum: string }[]>`
            select gerceklesen_miktar, durum from ogrenme.plan_gorevleri where id = ${gorevId}`
        )[0];
      const a = await kayitAc(o, { plan_gorev_id: gorevId, dogru: 8, yanlis: 2 });
      expect(await okuGorev()).toEqual({ gerceklesen_miktar: 10, durum: 'kismen' });
      const b = await kayitAc(o, { plan_gorev_id: gorevId, dogru: 8, yanlis: 2 });
      expect(await okuGorev()).toEqual({ gerceklesen_miktar: 20, durum: 'tamam' });
      await istek('PATCH', k.kurumId, o.ogrenci.token, `/gunluk-soru/kayitlar/${b.id}`, {
        dogru: 3,
        yanlis: 2,
      });
      expect(await okuGorev()).toEqual({ gerceklesen_miktar: 15, durum: 'kismen' });
      await istek('DELETE', k.kurumId, o.ogrenci.token, `/gunluk-soru/kayitlar/${a.id}`);
      expect(await okuGorev()).toEqual({ gerceklesen_miktar: 5, durum: 'kismen' });
      const olaylar = (await outbox(k.kurumId, 'evt.ogrenme.plan_gorevi.guncellendi.v1')).map(
        (e) => e.payload.data.durum,
      );
      expect(olaylar).toEqual(['kismen', 'tamam', 'kismen', 'kismen']);
    });
  });

  describe('konu analizi, oneriler ve kapsam', () => {
    it('sartname ornegi: kolay %90, orta %60, zor %25 -> orta zorlaniyor; gorev oner; ogrenci yanitinda oneri yok', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      await tohum(o, o.konu, 'kolay', 18, 2, 0, 1);
      await tohum(o, o.konu, 'orta', 12, 6, 2, 2);
      await tohum(o, o.konu, 'zor', 5, 10, 5, 3);
      // ikinci konu: yalniz az veri
      await tohum(o, o.konu2, 'orta', 3, 2, 0, 1);

      const res = await analizAl(o, o.s.hoca.token, hocaYolu(o));
      expect(res.statusCode, res.body).toBe(200);
      const a = res.json<Analiz>();
      const genetik = a.konular.find((x) => x.konu_id === o.konu);
      expect(genetik).toMatchObject({
        konu_ad: 'Genetik',
        bant: { durum: 'zorlaniyor', bant: 'orta' },
      });
      expect(genetik?.hucreler.kolay).toEqual({
        cozulen: 20,
        dogru: 18,
        yanlis: 2,
        bos: 0,
        basari: 0.9,
      });
      expect(genetik?.hucreler.orta).toMatchObject({ cozulen: 20, basari: 0.6 });
      expect(genetik?.hucreler.zor).toMatchObject({ cozulen: 20, basari: 0.25 });
      expect(a.konular.find((x) => x.konu_id === o.konu2)?.bant.durum).toBe('veri_az');
      expect(a.toplam.cozulen).toBe(65);
      expect(a.oneriler).toContainEqual({
        tur: 'gorev_oner',
        brans_kodu: 'biyoloji',
        konu_id: o.konu,
        konu_ad: 'Genetik',
        zorluk: 'orta',
        soru_sayisi: 20,
        basari: 0.6,
      });

      // ogrenci kendi analizini gorur, oneri alani YOK
      const kendi = await analizAl(o, o.ogrenci.token, '/gunluk-soru');
      expect(kendi.statusCode, kendi.body).toBe(200);
      const ka = kendi.json<Analiz>();
      expect(ka.oneriler).toBeUndefined();
      expect(JSON.stringify(ka)).not.toMatch(/oneri|gorev_oner|birebir/);
      expect(ka.konular.find((x) => x.konu_id === o.konu)?.hucreler.orta.cozulen).toBe(20);
      // yonetici/sahip kurumu gorur
      expect((await analizAl(o, k.token, hocaYolu(o))).statusCode).toBe(200);
      // atanmamis ogretmen goremez; baska ogrenci kendi yolundan baskasini goremez
      expect((await analizAl(o, o.hoca2.token, hocaYolu(o))).statusCode).toBe(404);
      // ogrenci personel ucunu kullanamaz
      expect((await analizAl(o, o.ogrenci.token, hocaYolu(o))).statusCode).toBe(403);
      // personel ogrenci ucunu kullanamaz
      expect((await analizAl(o, o.s.hoca.token, '/gunluk-soru')).statusCode).toBe(403);
    });

    it('birebir ders: son 2 haftada zor bantta %30 alti ve duzelmiyorsa isaret; duzeliyorsa yok', async () => {
      const o = await ortamKur();
      // Kotu konu: onceki hafta 3/10, son hafta 2/10 (toplam 25%)
      await tohum(o, o.konu, 'zor', 3, 7, 0, 10);
      await tohum(o, o.konu, 'zor', 2, 8, 0, 2);
      // Duzelen konu: onceki hafta 1/10, son hafta 4/10 -> toplam %25 ama +30 puan duzelme
      await tohum(o, o.konu2, 'zor', 1, 9, 0, 10);
      await tohum(o, o.konu2, 'zor', 4, 6, 0, 2);
      const a = (await analizAl(o, o.s.hoca.token, hocaYolu(o))).json<Analiz>();
      const birebir = (a.oneriler ?? []).filter((x) => x.tur === 'birebir_ders');
      expect(birebir.map((x) => x.konu_id)).toEqual([o.konu]);
      expect(a.oneriler?.[0]?.tur).toBe('birebir_ders');
    });

    it('odev teslimi (konu var, D/Y/B girilmis) "belirtilmemis" sutununa akar; D/Y/B\'siz teslim girmez', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const odev = async (dogru: number | null, yanlis: number | null) => {
        const id = uuidv7();
        await sistem`
          insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, konu_id, hedef_turu, hedef_id, durum, yayin_at)
          values (${id}, ${k.kurumId}, ${o.s.hoca.uyelikId}, 'Ödev', 'biyoloji', ${o.konu}, 'ogrenci', ${o.ogrenci.uyelikId}, 'yayinda', now())`;
        await sistem`
          insert into ogrenme.ogrenci_odevleri
            (id, kurum_id, odev_id, ogrenci_id, durum, yapilan_soru_sayisi, dogru_sayisi, yanlis_sayisi, teslim_at)
          values (${uuidv7()}, ${k.kurumId}, ${id}, ${o.ogrenci.uyelikId}, 'teslim_edildi', 20, ${dogru}, ${yanlis}, now())`;
      };
      await odev(15, 5);
      await odev(null, null);
      await tohum(o, o.konu, 'kolay', 9, 1, 0, 1);
      const a = (await analizAl(o, o.s.hoca.token, hocaYolu(o))).json<Analiz>();
      const g = a.konular.find((x) => x.konu_id === o.konu);
      expect(g?.hucreler.belirtilmemis).toEqual({
        cozulen: 20,
        dogru: 15,
        yanlis: 5,
        bos: 0,
        basari: 0.75,
      });
      expect(g?.toplam.cozulen).toBe(30);
    });

    it('tarih araligi: 7 gun disindaki kayit 7 gunluk analizde yok, 30 gunlukte var; bas/bit onceliklidir', async () => {
      const o = await ortamKur();
      await tohum(o, o.konu, 'kolay', 5, 0, 0, 2);
      await tohum(o, o.konu, 'kolay', 7, 0, 0, 20);
      const al = async (sorgu: string) =>
        (await analizAl(o, o.s.hoca.token, hocaYolu(o), sorgu)).json<Analiz>().toplam.cozulen;
      expect(await al('&donem=7')).toBe(5);
      expect(await al('&donem=30')).toBe(12);
      expect(await al('&donem=donem')).toBe(12);
      expect(await al(`&bas=${tarihEkle(BUGUN, -25)}&bit=${tarihEkle(BUGUN, -15)}`)).toBe(7);
      const ters = await analizAl(
        o,
        o.s.hoca.token,
        hocaYolu(o),
        `&bas=${BUGUN}&bit=${tarihEkle(BUGUN, -3)}`,
      );
      expect(ters.statusCode).toBe(422);
    });

    it('hucre ayrintisi: kayitlar, kaynak adi ve fotograf okuma adresleri; medya yoksa isaretlenir', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const kitap = (
        await istek('POST', k.kurumId, o.s.hoca.token, '/kaynak-kitaplar', {
          ad: 'Bank',
          brans_kodu: 'biyoloji',
          testler: [{ ad: 'Test 4', soru_sayisi: 20 }],
        })
      ).json<Kitap>();
      const f = await kopya(k.kurumId, o.ogrenci.kullaniciId);
      const kayit = await kayitAc(o, {
        zorluk: 'orta',
        kaynak_test_id: kitap.testler[0]?.id,
        dosya_idleri: [f],
      });
      await kayitAc(o, { zorluk: 'kolay' });
      const sorgu = `?brans_kodu=biyoloji&konu_id=${o.konu}&zorluk=orta`;
      const res = await istek(
        'GET',
        k.kurumId,
        o.s.hoca.token,
        `${hocaYolu(o)}/analiz/hucre${sorgu}`,
      );
      expect(res.statusCode, res.body).toBe(200);
      const d = res.json<{
        kayitlar: {
          id: string;
          kaynak: string;
          kaynak_adi: string | null;
          dosyalar: { adres: { asil_url: string } | null }[];
        }[];
        fotograf_adresleri_alinamadi: boolean;
      }>();
      expect(d.kayitlar).toHaveLength(1);
      expect(d.kayitlar[0]).toMatchObject({
        id: kayit.id,
        kaynak: 'gunluk',
        kaynak_adi: 'Bank · Test 4',
      });
      expect(d.kayitlar[0]?.dosyalar[0]?.adres?.asil_url).toMatch(/^https?:/);
      expect(d.fotograf_adresleri_alinamadi).toBe(false);
      // ogrenci kendi hucresini, ogretmen kapsam disi 404
      const kendi = await istek(
        'GET',
        k.kurumId,
        o.ogrenci.token,
        `/gunluk-soru/analiz/hucre${sorgu}`,
      );
      expect(kendi.statusCode).toBe(200);
      const dis = await istek(
        'GET',
        k.kurumId,
        o.hoca2.token,
        `${hocaYolu(o)}/analiz/hucre${sorgu}`,
      );
      expect(dis.statusCode).toBe(404);
      // tum zorluklar
      const hepsi = await istek(
        'GET',
        k.kurumId,
        o.s.hoca.token,
        `${hocaYolu(o)}/analiz/hucre?brans_kodu=biyoloji&konu_id=${o.konu}`,
      );
      expect(hepsi.json<{ kayitlar: unknown[] }>().kayitlar).toHaveLength(2);
      // medya kapali: kayitlar gelir, adresler bos ve isaretli
      medya.durum.mod = 'hata';
      try {
        const kapali = await istek(
          'GET',
          k.kurumId,
          o.s.hoca.token,
          `${hocaYolu(o)}/analiz/hucre${sorgu}`,
        );
        expect(kapali.statusCode).toBe(200);
        const kd = kapali.json<{
          fotograf_adresleri_alinamadi: boolean;
          kayitlar: { dosyalar: { adres: unknown }[] }[];
        }>();
        expect(kd.fotograf_adresleri_alinamadi).toBe(true);
        expect(kd.kayitlar[0]?.dosyalar[0]?.adres).toBeNull();
      } finally {
        medya.durum.mod = 'tamam';
      }
    });

    it('sinif gorunumu: konu bazinda toplam, zorlanan ogrenci, en cok zorlanilan konular; kapsam', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const ogrenciler = await y.topluOgrenci(k.kurumId, 4);
      await y.gruba(k, o.s.grup.id, ogrenciler);
      // Genetik: 4 ogrenci x 10 soru; ikisi %20, ikisi %60 -> sinif %40, 2 zorlanan
      for (const [i, id] of ogrenciler.entries()) {
        await tohum(o, o.konu, 'orta', i < 2 ? 2 : 6, i < 2 ? 8 : 4, 0, 1, 'biyoloji', id);
      }
      // Hucre: iyi (%90)
      await tohum(o, o.konu2, 'kolay', 18, 2, 0, 1, 'biyoloji', ogrenciler[0]);
      const sorgu = `?grup_id=${o.s.grup.id}&brans_kodu=biyoloji`;
      const res = await istek(
        'GET',
        k.kurumId,
        o.s.hoca.token,
        `/gunluk-soru/sinif-analizi${sorgu}`,
      );
      expect(res.statusCode, res.body).toBe(200);
      const s = res.json<{
        ogrenci_sayisi: number;
        konular: {
          konu_id: string;
          ogrenci_sayisi: number;
          zorlanan_ogrenci_sayisi: number;
          toplam: Hucre;
        }[];
        en_cok_zorlanilan: { konu_id: string }[];
      }>();
      expect(s.ogrenci_sayisi).toBe(5);
      const g = s.konular.find((x) => x.konu_id === o.konu);
      expect(g).toMatchObject({ ogrenci_sayisi: 4, zorlanan_ogrenci_sayisi: 2 });
      expect(g?.toplam).toMatchObject({ cozulen: 40, dogru: 16, basari: 0.4 });
      expect(s.en_cok_zorlanilan.map((x) => x.konu_id)).toEqual([o.konu]);
      expect(
        (await istek('GET', k.kurumId, k.token, `/gunluk-soru/sinif-analizi${sorgu}`)).statusCode,
      ).toBe(200);
      expect(
        (await istek('GET', k.kurumId, o.hoca2.token, `/gunluk-soru/sinif-analizi${sorgu}`))
          .statusCode,
      ).toBe(404);
      expect(
        (await istek('GET', k.kurumId, o.ogrenci.token, `/gunluk-soru/sinif-analizi${sorgu}`))
          .statusCode,
      ).toBe(403);
    });

    it('haftalik ozet: cozulen, en zayif 3 konu ve bant degisimi', async () => {
      const o = await ortamKur();
      const gecenHafta = tarihEkle(BU_HAFTA, -7);
      // Bu hafta (bugun): 4 konu; en zayiflar Hucre(%20), Genetik(%50), Turev(%70)
      await tohum(o, o.konu, 'kolay', 5, 5, 0, 0);
      await tohum(o, o.konu2, 'kolay', 2, 8, 0, 0);
      await tohum(o, o.matKonu, 'kolay', 7, 3, 0, 0, 'matematik');
      await tohum(o, await konuAc(o.s.k.kurumId, 'biyoloji', 'Sinir'), 'kolay', 9, 1, 0, 0);
      // Gecen hafta: kolay %25 (kolay bantta zorlanma); bu hafta kolay %57 (tek bant, veri az) -> belirsiz
      await sistem`
        insert into ogrenme.gunluk_soru_kayitlari (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, yanlis)
        values (${uuidv7()}, ${o.s.k.kurumId}, ${o.ogrenci.uyelikId}, ${tarihEkle(gecenHafta, 1)}, 'biyoloji', ${o.konu}, 'kolay', 5, 15)`;
      const res = await istek('GET', o.s.k.kurumId, o.s.hoca.token, `${hocaYolu(o)}/haftalik-ozet`);
      expect(res.statusCode, res.body).toBe(200);
      const h = res.json<{
        hafta_baslangic: string;
        cozulen: number;
        dogru: number;
        en_zayif_konular: { konu_ad: string; basari: number }[];
        bant: { onceki: { durum: string }; simdiki: { durum: string }; degisim: string };
      }>();
      expect(h.hafta_baslangic).toBe(BU_HAFTA);
      expect(h.cozulen).toBe(40);
      expect(h.en_zayif_konular.map((x) => x.konu_ad)).toEqual(['Hücre', 'Genetik', 'Türev']);
      expect(h.bant.onceki.durum).toBe('zorlaniyor');
      expect(h.bant.simdiki.durum).toBe('veri_az');
      expect(h.bant.degisim).toBe('belirsiz');
      // gecen hafta ozeti ayri
      const gecen = await istek(
        'GET',
        o.s.k.kurumId,
        o.s.hoca.token,
        `${hocaYolu(o)}/haftalik-ozet?hafta=${gecenHafta}`,
      );
      expect(gecen.json<{ cozulen: number }>().cozulen).toBe(20);
      expect(
        (await istek('GET', o.s.k.kurumId, o.hoca2.token, `${hocaYolu(o)}/haftalik-ozet`))
          .statusCode,
      ).toBe(404);
    });
  });

  describe('gorev ver', () => {
    it('plan gorevi: plan yoksa yayinda acilir, gorev "konu: zorluk seviyeden N soru"; ayni haftada plana eklenir', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const gun = tarihEkle(BUGUN, 1);
      const g = {
        tur: 'plan_gorevi',
        brans_kodu: 'biyoloji',
        konu_id: o.konu,
        zorluk: 'orta',
        soru_sayisi: 20,
        gun,
      };
      const res = await istek('POST', k.kurumId, o.s.hoca.token, `${hocaYolu(o)}/gorev-ver`, g);
      expect(res.statusCode, res.body).toBe(201);
      const r = res.json<{
        plan_id: string;
        gorev_id: string;
        plan_durum: string;
        hafta_baslangic: string;
      }>();
      expect(r).toMatchObject({ plan_durum: 'yayinda', hafta_baslangic: haftaBaslangici(gun) });
      const [gr] = await sistem<
        { baslik: string; hedef_miktar: number; hedef_turu: string; konu_id: string }[]
      >`
        select baslik, hedef_miktar, hedef_turu, konu_id from ogrenme.plan_gorevleri where id = ${r.gorev_id}`;
      expect(gr).toEqual({
        baslik: 'Genetik: orta seviyeden 20 soru',
        hedef_miktar: 20,
        hedef_turu: 'soru',
        konu_id: o.konu,
      });
      // ogrenci gorevi bugun ekraninda gorur
      const gorevlerim = await istek('GET', k.kurumId, o.ogrenci.token, `/gorevlerim?gun=${gun}`);
      expect(gorevlerim.json<{ gorevler: { id: string }[] }>().gorevler.map((x) => x.id)).toContain(
        r.gorev_id,
      );
      const ikinci = await istek('POST', k.kurumId, o.s.hoca.token, `${hocaYolu(o)}/gorev-ver`, g);
      expect(ikinci.json<{ plan_id: string }>().plan_id).toBe(r.plan_id);
      // yetki ve kapsam
      expect(
        (await istek('POST', k.kurumId, o.hoca2.token, `${hocaYolu(o)}/gorev-ver`, g)).statusCode,
      ).toBe(404);
      expect(
        (await istek('POST', k.kurumId, o.ogrenci.token, `${hocaYolu(o)}/gorev-ver`, g)).statusCode,
      ).toBe(403);
      expect(
        hataKodu(
          await istek('POST', k.kurumId, o.s.hoca.token, `${hocaYolu(o)}/gorev-ver`, {
            ...g,
            konu_id: o.matKonu,
          }),
        ),
      ).toBe('konu_gecersiz');
    });

    it('odev: tek ogrencilik yayinda odev ve ogrenci satiri acilir', async () => {
      const o = await ortamKur();
      const { k } = o.s;
      const res = await istek('POST', k.kurumId, o.s.hoca.token, `${hocaYolu(o)}/gorev-ver`, {
        tur: 'odev',
        brans_kodu: 'biyoloji',
        konu_id: o.konu,
        zorluk: 'zor',
        soru_sayisi: 15,
      });
      expect(res.statusCode, res.body).toBe(201);
      const { odev_id } = res.json<{ odev_id: string }>();
      const [od] = await sistem<
        {
          baslik: string;
          durum: string;
          hedef_turu: string;
          hedef_soru_sayisi: number;
          atanan_sayisi: number;
          konu_id: string;
        }[]
      >`
        select baslik, durum, hedef_turu, hedef_soru_sayisi, atanan_sayisi, konu_id from ogrenme.odevler where id = ${odev_id}`;
      expect(od).toEqual({
        baslik: 'Genetik: zor seviyeden 15 soru',
        durum: 'yayinda',
        hedef_turu: 'ogrenci',
        hedef_soru_sayisi: 15,
        atanan_sayisi: 1,
        konu_id: o.konu,
      });
      const [satir] = await sistem<{ ogrenci_id: string }[]>`
        select ogrenci_id from ogrenme.ogrenci_odevleri where odev_id = ${odev_id}`;
      expect(satir?.ogrenci_id).toBe(o.ogrenci.uyelikId);
      const bildirim = await outbox(k.kurumId, 'evt.ogrenme.odev.yayinlandi.v1');
      expect(bildirim).toHaveLength(1);
    });
  });
});
