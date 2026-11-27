import { randomInt } from 'node:crypto';

import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { haftaBaslangici, planBugunu } from './modules/ogrenme/index.js';
import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { sahteMedya } from './test/sahte-medya.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface Ek {
  medya_dosya_id: string;
  sira: number;
  mime_tipi: string;
  boyut_bayt: number;
  adres: { asil_url: string } | null;
}
interface EkListesi {
  ekler: Ek[];
  adresler_alinamadi: boolean;
}

const MEDYA_PORT = 40_000 + randomInt(0, 20_000);
const BU_HAFTA = haftaBaslangici(planBugunu());

describe.skipIf(dbYok())('odev ve plan ek dosyalari API', { timeout: 90_000 }, () => {
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
  const outbox = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject}
      order by created_at, id`;

  async function kopya(
    kurumId: string,
    kullaniciId: string,
    tur: string,
    mime = 'application/pdf',
    durum = 'hazir',
  ) {
    const id = uuidv7();
    await sistem`
      insert into ortak.medya_dosya_kopyalari
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
      values (${id}, ${kurumId}, ${kullaniciId}, ${tur}, ${durum}, ${mime}, 2048, ${uuidv7()})`;
    return id;
  }

  interface Ortam {
    s: Kurulum;
    ogrenci: Uye;
    ogrenci2: Uye;
    hoca2: Uye;
  }
  async function ortamKur(): Promise<Ortam> {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const ogrenci = await y.davetliUye(s.k, 'ogrenci');
    const ogrenci2 = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId, ogrenci2.uyelikId]);
    const hoca2 = await y.davetliUye(s.k, 'ogretmen'); // gruba atanmamis baska ogretmen
    return { s, ogrenci, ogrenci2, hoca2 };
  }
  const odevGovde = (o: Ortam, ek: Record<string, unknown> = {}) => ({
    baslik: 'Türev föyü',
    brans_kodu: 'matematik',
    tur: 'serbest',
    hedef_turu: 'grup',
    hedef_id: o.s.grup.id,
    son_teslim_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...ek,
  });
  const odevAc = async (o: Ortam, ek: Record<string, unknown> = {}) => {
    const res = await istek('POST', o.s.k.kurumId, o.s.hoca.token, '/odevler', odevGovde(o, ek));
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>();
  };
  const yayinla = async (o: Ortam, odevId: string) => {
    const res = await istek(
      'POST',
      o.s.k.kurumId,
      o.s.hoca.token,
      `/odevler/${odevId}/yayinla`,
      {},
    );
    expect(res.statusCode, res.body).toBe(200);
  };
  const ogrenciSatiri = async (o: Ortam, ogrenci: Uye, odevId: string) => {
    const res = await istek('GET', o.s.k.kurumId, ogrenci.token, '/odevlerim');
    expect(res.statusCode, res.body).toBe(200);
    const satir = res
      .json<{ odevler: { id: string; odev_id: string }[] }>()
      .odevler.find((x) => x.odev_id === odevId);
    if (!satir) throw new Error('ogrenci odev satiri yok');
    return satir.id;
  };
  const ekPut = (o: Ortam, token: string, yol: string, idler: string[]) =>
    istek('PUT', o.s.k.kurumId, token, yol, { medya_dosya_idleri: idler });

  describe('odev ekleri', () => {
    it('olusturmada baglanir; ogretmen ve ogrenci sirali listeyi adresleriyle okur; baglandi olayi', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const f1 = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki');
      const f2 = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki', 'image/jpeg');
      const odev = await odevAc(o, { ek_dosya_idleri: [f2, f1] });

      const ogretmen = await istek('GET', k.kurumId, hoca.token, `/odevler/${odev.id}/ekler`);
      expect(ogretmen.statusCode, ogretmen.body).toBe(200);
      const l = ogretmen.json<EkListesi>();
      expect(l.adresler_alinamadi).toBe(false);
      expect(l.ekler.map((e) => [e.medya_dosya_id, e.sira, e.mime_tipi, e.boyut_bayt])).toEqual([
        [f2, 0, 'image/jpeg', 2048],
        [f1, 1, 'application/pdf', 2048],
      ]);
      expect(l.ekler[0]?.adres?.asil_url).toMatch(/^https?:/);

      const baglama = (await outbox(k.kurumId, 'evt.ortak.dosya.baglandi.v1')).map(
        (e) => e.payload.data,
      );
      expect(baglama).toEqual(
        expect.arrayContaining([
          { dosya_id: f1, bagli_tur: 'odev_eki', bagli_id: odev.id },
          { dosya_id: f2, bagli_tur: 'odev_eki', bagli_id: odev.id },
        ]),
      );

      // Taslak odev: ogrenci henuz goremez (satiri yok). Yayindan sonra gorur.
      await yayinla(o, odev.id);
      const satir = await ogrenciSatiri(o, o.ogrenci, odev.id);
      const liste = await istek('GET', k.kurumId, o.ogrenci.token, '/odevlerim');
      expect(
        liste
          .json<{ odevler: { id: string; ek_sayisi: number }[] }>()
          .odevler.find((x) => x.id === satir)?.ek_sayisi,
      ).toBe(2);
      const ogr = await istek(
        'GET',
        k.kurumId,
        o.ogrenci.token,
        `/ogrenci-odevleri/${satir}/ekler`,
      );
      expect(ogr.statusCode, ogr.body).toBe(200);
      expect(ogr.json<EkListesi>().ekler.map((e) => e.medya_dosya_id)).toEqual([f2, f1]);
      // Baska ogrencinin satiri 404; ogretmen bu ogrenci ucunu kullanamaz.
      const o2 = await istek(
        'GET',
        k.kurumId,
        o.ogrenci2.token,
        `/ogrenci-odevleri/${satir}/ekler`,
      );
      expect(o2.statusCode).toBe(404);
      const hocaYanit = await istek(
        'GET',
        k.kurumId,
        hoca.token,
        `/ogrenci-odevleri/${satir}/ekler`,
      );
      expect(hocaYanit.statusCode).toBe(403);
      // Ek icermeyen odev: bos liste.
      const bos = await odevAc(o);
      const bosList = await istek('GET', k.kurumId, hoca.token, `/odevler/${bos.id}/ekler`);
      expect(bosList.json<EkListesi>()).toEqual({ ekler: [], adresler_alinamadi: false });
    });

    it('PUT: kume esitleme, siralama, cikarilan dosya birakilir (hemen_sil), ayni liste olay uretmez', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const [f1, f2, f3] = await Promise.all(
        [1, 2, 3].map(() => kopya(k.kurumId, hoca.kullaniciId, 'odev_eki')),
      );
      if (!f1 || !f2 || !f3) throw new Error('kopya');
      const odev = await odevAc(o);
      const yol = `/odevler/${odev.id}/ekler`;

      const ilk = await ekPut(o, hoca.token, yol, [f1, f2]);
      expect(ilk.statusCode, ilk.body).toBe(200);
      expect(ilk.json<EkListesi>().ekler.map((e) => e.medya_dosya_id)).toEqual([f1, f2]);

      const bagSayisi = (await outbox(k.kurumId, 'evt.ortak.dosya.baglandi.v1')).length;
      const ayni = await ekPut(o, hoca.token, yol, [f1, f2]);
      expect(ayni.statusCode).toBe(200);
      expect((await outbox(k.kurumId, 'evt.ortak.dosya.baglandi.v1')).length).toBe(bagSayisi);

      // f1 cikar, f3 ekle, sirayi degistir.
      const guncel = await ekPut(o, hoca.token, yol, [f3, f2]);
      expect(guncel.statusCode, guncel.body).toBe(200);
      expect(guncel.json<EkListesi>().ekler.map((e) => [e.medya_dosya_id, e.sira])).toEqual([
        [f3, 0],
        [f2, 1],
      ]);
      const birakildi = (await outbox(k.kurumId, 'evt.ortak.dosya.birakildi.v1')).map(
        (e) => e.payload.data,
      );
      expect(birakildi).toEqual([
        { dosya_id: f1, bagli_tur: 'odev_eki', bagli_id: odev.id, hemen_sil: true },
      ]);
      // Cikarilan dosya baska odeve verilebilir; hepsini kaldirmak bos liste yapar.
      const bos = await ekPut(o, hoca.token, yol, []);
      expect(bos.json<EkListesi>().ekler).toEqual([]);
      const denetim = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.denetim_kayitlari
         where kurum_id = ${k.kurumId} and eylem = 'odev.ek_guncelle' and hedef_id = ${odev.id}`;
      expect(denetim[0]?.n).toBe(3);
    });

    it('dosya dogrulamasi: baskasinin/yanlis tur/hazir degil/baska kurum/zaten bagli/yinelenen/11 dosya', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const odev = await odevAc(o);
      const yol = `/odevler/${odev.id}/ekler`;
      const dene = (idler: string[]) => ekPut(o, hoca.token, yol, idler);

      const baskasi = await kopya(k.kurumId, o.hoca2.kullaniciId, 'odev_eki');
      expect(hataKodu(await dene([baskasi]))).toBe('dosya_gecersiz');
      const yanlisTur = await kopya(k.kurumId, hoca.kullaniciId, 'plan_eki');
      expect(hataKodu(await dene([yanlisTur]))).toBe('dosya_gecersiz');
      expect(hataKodu(await dene([uuidv7()]))).toBe('dosya_hazir_degil');
      const digerKurum = await y.kur({ ogrenciSayisi: 0 });
      const baskaKurumDosyasi = await kopya(
        digerKurum.k.kurumId,
        digerKurum.hoca.kullaniciId,
        'odev_eki',
      );
      expect(hataKodu(await dene([baskaKurumDosyasi]))).toBe('dosya_hazir_degil');
      const islenemedi = await kopya(
        k.kurumId,
        hoca.kullaniciId,
        'odev_eki',
        'application/pdf',
        'islenemedi',
      );
      expect(hataKodu(await dene([islenemedi]))).toBe('dosya_islenemedi');
      const f = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki');
      expect(hataKodu(await dene([f, f]))).toBe('dosya_gecersiz');
      const digerOdev = await odevAc(o, { ek_dosya_idleri: [f] });
      expect(digerOdev.id).toBeTruthy();
      expect(hataKodu(await dene([f]))).toBe('dosya_zaten_bagli');
      const fazla = Array.from({ length: 11 }, () => uuidv7());
      expect((await dene(fazla)).statusCode).toBe(400);
      // Hicbiri baglanmadi.
      const l = await istek('GET', k.kurumId, hoca.token, yol);
      expect(l.json<EkListesi>().ekler).toEqual([]);
    });

    it('yetki: ogrenci yazamaz, baska ogretmen degistiremez, kapali odevde 409, taslakta ogrenci goremez', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const odev = await odevAc(o);
      const yol = `/odevler/${odev.id}/ekler`;
      const f = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki');

      expect((await ekPut(o, o.ogrenci.token, yol, [f])).statusCode).toBe(403);
      expect((await istek('GET', k.kurumId, o.ogrenci.token, yol)).statusCode).toBe(403);
      // Atanmamis ogretmen kapsam disi (404) ya da baskasinin odevi (403): yazamaz, okuyamaz.
      const f2 = await kopya(k.kurumId, o.hoca2.kullaniciId, 'odev_eki');
      expect([403, 404]).toContain((await ekPut(o, o.hoca2.token, yol, [f2])).statusCode);
      expect([403, 404]).toContain((await istek('GET', k.kurumId, o.hoca2.token, yol)).statusCode);
      // Kimliksiz
      const anon = await y.app.inject({
        method: 'GET',
        url: `/v1/ogrenme/kurumlar/${k.kurumId}${yol}`,
      });
      expect(anon.statusCode).toBe(401);

      await yayinla(o, odev.id);
      expect((await ekPut(o, hoca.token, yol, [f])).statusCode).toBe(200); // yayindaki odevde yazilir
      const kapat = await istek('POST', k.kurumId, hoca.token, `/odevler/${odev.id}/kapat`, {});
      expect(kapat.statusCode).toBe(200);
      const kapali = await ekPut(o, hoca.token, yol, []);
      expect(kapali.statusCode).toBe(409);
      expect(hataKodu(kapali)).toBe('odev_kapali');
    });

    it('medya yanit vermezse liste gelir, adresler bos ve isaretli', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const f = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki');
      const odev = await odevAc(o, { ek_dosya_idleri: [f] });
      medya.durum.mod = 'hata';
      try {
        const res = await istek('GET', k.kurumId, hoca.token, `/odevler/${odev.id}/ekler`);
        expect(res.statusCode).toBe(200);
        const l = res.json<EkListesi>();
        expect(l.adresler_alinamadi).toBe(true);
        expect(l.ekler).toHaveLength(1);
        expect(l.ekler[0]?.adres).toBeNull();
      } finally {
        medya.durum.mod = 'tamam';
      }
    });
  });

  describe('plan ekleri', () => {
    async function planAc(o: Ortam, ogrenci: Uye) {
      const res = await istek('POST', o.s.k.kurumId, o.s.hoca.token, '/planlar', {
        ogrenci_id: ogrenci.uyelikId,
        hafta_baslangic: BU_HAFTA,
      });
      expect(res.statusCode, res.body).toBe(201);
      return res.json<{ plan: { id: string } }>().plan.id;
    }

    it('hazir plan dosyasi baglanir; taslakta ogrenci goremez, yayindan sonra yalniz kendi plani', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const planId = await planAc(o, o.ogrenci);
      const f1 = await kopya(k.kurumId, hoca.kullaniciId, 'plan_eki');
      const f2 = await kopya(k.kurumId, hoca.kullaniciId, 'plan_eki', 'image/png');
      const yol = `/planlar/${planId}/ekler`;

      const put = await ekPut(o, hoca.token, yol, [f1, f2]);
      expect(put.statusCode, put.body).toBe(200);
      expect(put.json<EkListesi>().ekler.map((e) => [e.medya_dosya_id, e.mime_tipi])).toEqual([
        [f1, 'application/pdf'],
        [f2, 'image/png'],
      ]);
      const baglama = (await outbox(k.kurumId, 'evt.ortak.dosya.baglandi.v1')).map(
        (e) => e.payload.data,
      );
      expect(baglama).toEqual(
        expect.arrayContaining([
          { dosya_id: f1, bagli_tur: 'plan_eki', bagli_id: planId },
          { dosya_id: f2, bagli_tur: 'plan_eki', bagli_id: planId },
        ]),
      );

      const ogrYol = `/planim/${planId}/ekler`;
      expect((await istek('GET', k.kurumId, o.ogrenci.token, ogrYol)).statusCode).toBe(404); // taslak
      const yayin = await istek('POST', k.kurumId, hoca.token, `/planlar/${planId}/yayinla`, {});
      expect(yayin.statusCode, yayin.body).toBe(200);
      const ogr = await istek('GET', k.kurumId, o.ogrenci.token, ogrYol);
      expect(ogr.statusCode, ogr.body).toBe(200);
      expect(ogr.json<EkListesi>().ekler.map((e) => e.medya_dosya_id)).toEqual([f1, f2]);
      expect(ogr.json<EkListesi>().ekler[0]?.adres?.asil_url).toMatch(/^https?:/);
      expect((await istek('GET', k.kurumId, o.ogrenci2.token, ogrYol)).statusCode).toBe(404);
      expect((await istek('GET', k.kurumId, hoca.token, ogrYol)).statusCode).toBe(403);

      // Yayindaki planda degistirme: biri cikar -> birakildi.
      const degis = await ekPut(o, hoca.token, yol, [f2]);
      expect(degis.statusCode).toBe(200);
      const birakildi = (await outbox(k.kurumId, 'evt.ortak.dosya.birakildi.v1')).map(
        (e) => e.payload.data,
      );
      expect(birakildi).toEqual([
        { dosya_id: f1, bagli_tur: 'plan_eki', bagli_id: planId, hemen_sil: true },
      ]);
    });

    it('yetki ve dosya kurallari: ogrenci yazamaz, odev_eki plana verilemez, kapsam disi ogretmen', async () => {
      const o = await ortamKur();
      const { k, hoca } = o.s;
      const planId = await planAc(o, o.ogrenci);
      const yol = `/planlar/${planId}/ekler`;
      const f = await kopya(k.kurumId, hoca.kullaniciId, 'plan_eki');
      expect((await ekPut(o, o.ogrenci.token, yol, [f])).statusCode).toBe(403);
      expect([403, 404]).toContain((await ekPut(o, o.hoca2.token, yol, [f])).statusCode);
      expect([403, 404]).toContain((await istek('GET', k.kurumId, o.hoca2.token, yol)).statusCode);
      const odevEki = await kopya(k.kurumId, hoca.kullaniciId, 'odev_eki');
      expect(hataKodu(await ekPut(o, hoca.token, yol, [odevEki]))).toBe('dosya_gecersiz');
      expect(hataKodu(await ekPut(o, hoca.token, yol, [uuidv7()]))).toBe('dosya_hazir_degil');
      expect((await ekPut(o, hoca.token, yol, [f])).statusCode).toBe(200);
      // Ayni dosya baska plana (ayni ogrencinin farkli haftasi) baglanamaz.
      const sonraki = await istek('POST', k.kurumId, hoca.token, '/planlar', {
        ogrenci_id: o.ogrenci.uyelikId,
        hafta_baslangic: new Date(
          Date.UTC(
            Number(BU_HAFTA.slice(0, 4)),
            Number(BU_HAFTA.slice(5, 7)) - 1,
            Number(BU_HAFTA.slice(8, 10)) + 7,
          ),
        )
          .toISOString()
          .slice(0, 10),
      });
      expect(sonraki.statusCode, sonraki.body).toBe(201);
      const digerPlan = sonraki.json<{ plan: { id: string } }>().plan.id;
      expect(hataKodu(await ekPut(o, hoca.token, `/planlar/${digerPlan}/ekler`, [f]))).toBe(
        'dosya_zaten_bagli',
      );
    });
  });
});
