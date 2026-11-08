import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { finansDunyasi, type FinansDunyasi } from './finans-test-yardimcilari.js';
import {
  dersIptalUygula,
  gecIptalSaatiBul,
  krediVeUcretiUygula,
  ozetDenetimiCalistir,
  sonKullanmaCalistir,
  type KrediVeUcretiUygulaGirdi,
} from './modules/finans/index.js';
import { bearer, dbYok, hataMetni, testDb, testServisi } from './test/yardimcilar.js';

/** Ham SQL (drizzle `sql.raw`) kisayolu. */
const sqlRaw = (metin: string) => sql.raw(metin);

const BUGUN = new Date().toISOString().slice(0, 10);

interface KrediSatiri {
  id: string;
  tur: string;
  miktar: number;
  paket_satisi_id: string | null;
  yoklama_surumu: string | null;
  ters_cevrilen_id: string | null;
}

describe.skipIf(dbYok())('finans: kredi/ucret uygulama ve defterler', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let appDb: Database;
  let sistemDb: Database;
  let d: FinansDunyasi;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 6 });
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
    d = await finansDunyasi(t, sistem);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
    await sistemDb.close();
  });

  const baglam = (x: FinansDunyasi = d) => ({
    kurumId: x.kurumId,
    kullaniciId: x.owner.kullaniciId,
  });

  const girdi = (
    x: FinansDunyasi,
    ogrenciId: string,
    ek: Partial<KrediVeUcretiUygulaGirdi> = {},
  ): KrediVeUcretiUygulaGirdi => ({
    kurumId: x.kurumId,
    dersId: uuidv7(),
    ogrenciId,
    yoklamaId: uuidv7(),
    yoklamaSurumu: 1,
    durum: 'geldi',
    dersYerelTarih: BUGUN,
    grupId: null,
    bransKodu: null,
    grupTuru: null,
    aktorKullaniciId: x.owner.kullaniciId,
    ...ek,
  });

  const uygula = (x: FinansDunyasi, g: KrediVeUcretiUygulaGirdi) =>
    withTenant(appDb, baglam(x), (tx) => krediVeUcretiUygula(tx, g));

  const krediSatirlari = (ogrenciId: string) =>
    sistem<
      KrediSatiri[]
    >`select id, tur, miktar, paket_satisi_id, yoklama_surumu::text as yoklama_surumu, ters_cevrilen_id
      from finans.kredi_hareketleri where ogrenci_id = ${ogrenciId} order by id`;
  const bakiyeSatirlari = (ogrenciId: string) =>
    sistem<
      {
        id: string;
        tur: string;
        tutar_kurus: string;
        kaynak_turu: string;
        ters_cevrilen_id: string | null;
      }[]
    >`
      select id, tur, tutar_kurus::text, kaynak_turu, ters_cevrilen_id from finans.bakiye_hareketleri
      where ogrenci_id = ${ogrenciId} order by id`;
  const kalan = async (ogrenciId: string) =>
    (
      await sistem<
        { bakiye: number }[]
      >`select bakiye from finans.kredi_bakiyeleri where ogrenci_id = ${ogrenciId}`
    )[0]?.bakiye ?? 0;
  const bakiye = async (ogrenciId: string) =>
    Number(
      (
        await sistem<
          { b: string }[]
        >`select bakiye_kurus::text b from finans.ogrenci_bakiyeleri where ogrenci_id = ${ogrenciId}`
      )[0]?.b ?? 0,
    );

  async function profilYaz(
    x: FinansDunyasi,
    ogrenciId: string,
    model: 'paket' | 'ders_basi' | 'yok',
  ) {
    await sistem`insert into finans.ogrenci_finans_profilleri (id, kurum_id, ogrenci_id, model)
      values (${uuidv7()}, ${x.kurumId}, ${ogrenciId}, ${model})
      on conflict (kurum_id, ogrenci_id) do update set model = ${model}`;
  }

  async function paketliOgrenci(x: FinansDunyasi, kredi = 8, ek: Record<string, unknown> = {}) {
    const o = await x.ogrenciEkle();
    const p = await x.paketOlustur({ kredi_adedi: kredi, ...ek });
    const sat = await x.paketSat(o.uyelikId, p.id);
    expect(sat.statusCode).toBe(201);
    return { ...o, paketId: p.id, satisId: sat.govde.satis.id };
  }

  const olaylar = (x: FinansDunyasi, subject: string) =>
    sistem<
      { payload: Record<string, unknown> }[]
    >`select payload from ortak.outbox where kurum_id = ${x.kurumId} and subject = ${subject} order by id`;

  describe('ADR 0007 yoklama senaryosu', () => {
    it('geldi -> izinli -> geldi: dusum, iade (ters kayit), yeni dusum; bakiye her adimda satirlarin toplami', async () => {
      const o = await paketliOgrenci(d);
      const yoklamaId = uuidv7();
      const dersId = uuidv7();
      const adim = (yoklamaSurumu: number, durum: 'geldi' | 'izinli') =>
        uygula(d, girdi(d, o.uyelikId, { yoklamaId, dersId, yoklamaSurumu, durum }));

      await adim(1, 'geldi');
      expect(await kalan(o.uyelikId)).toBe(7);
      await adim(2, 'izinli');
      expect(await kalan(o.uyelikId)).toBe(8);
      await adim(3, 'geldi');
      expect(await kalan(o.uyelikId)).toBe(7);
      await adim(4, 'geldi'); // durum degismedi: hicbir sey eklenmez
      expect(await kalan(o.uyelikId)).toBe(7);

      const s = await krediSatirlari(o.uyelikId);
      expect(s.map((r) => r.tur)).toEqual(['satin_alma', 'dusum', 'iade', 'dusum']);
      const [alis, dusum1, iade, dusum3] = s as unknown as [
        KrediSatiri,
        KrediSatiri,
        KrediSatiri,
        KrediSatiri,
      ];
      expect(dusum1.miktar).toBe(-1);
      expect(dusum1.yoklama_surumu).toBe('1');
      expect(iade.miktar).toBe(1);
      expect(iade.ters_cevrilen_id).toBe(dusum1.id);
      expect(dusum3.yoklama_surumu).toBe('3');
      expect(alis.miktar).toBe(8);
      // Ozet = SUM(defter)
      expect(s.reduce((t2, r) => t2 + r.miktar, 0)).toBe(await kalan(o.uyelikId));
    });

    it('ayni girdi iki kez: ikinci satir olusmaz, istisna firlamaz', async () => {
      const o = await paketliOgrenci(d);
      const g = girdi(d, o.uyelikId);
      await uygula(d, g);
      await expect(uygula(d, g)).resolves.toBeDefined();
      await uygula(d, g);
      const dusumler = (await krediSatirlari(o.uyelikId)).filter((r) => r.tur === 'dusum');
      expect(dusumler).toHaveLength(1);
      expect(await kalan(o.uyelikId)).toBe(7);
    });

    it('eski surumle gec gelen tekrar (surum 1 geldi, izinli, tekrar surum 1) ikinci dusum olusturmaz', async () => {
      const o = await paketliOgrenci(d);
      const yoklamaId = uuidv7();
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId, yoklamaSurumu: 1, durum: 'geldi' }));
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId, yoklamaSurumu: 2, durum: 'izinli' }));
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId, yoklamaSurumu: 1, durum: 'geldi' }));
      expect(await kalan(o.uyelikId)).toBe(8);
    });

    it('esanli iki cagri ayni yoklama surumu icin tek dusum', async () => {
      const o = await paketliOgrenci(d);
      const g = girdi(d, o.uyelikId);
      await Promise.all([uygula(d, g), uygula(d, g), uygula(d, g)]);
      expect((await krediSatirlari(o.uyelikId)).filter((r) => r.tur === 'dusum')).toHaveLength(1);
      expect(await kalan(o.uyelikId)).toBe(7);
    });

    it('yoklama silinirse (durum null) etkin dusum iade edilir', async () => {
      const o = await paketliOgrenci(d);
      const yoklamaId = uuidv7();
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId }));
      expect(await kalan(o.uyelikId)).toBe(7);
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId, yoklamaSurumu: 2, durum: null }));
      expect(await kalan(o.uyelikId)).toBe(8);
    });
  });

  describe('havuz secimi ve negatif bakiye', () => {
    it('havuz yoksa paket_satisi_id NULL ile negatif bakiye; yoklama reddedilmez', async () => {
      const o = await d.ogrenciEkle();
      await profilYaz(d, o.uyelikId, 'paket');
      await uygula(d, girdi(d, o.uyelikId));
      const [satir] = await krediSatirlari(o.uyelikId);
      expect(satir?.paket_satisi_id).toBeNull();
      expect(await kalan(o.uyelikId)).toBe(-1);
    });

    it('model yok veya profil yoksa etkisiz', async () => {
      const o = await d.ogrenciEkle();
      await uygula(d, girdi(d, o.uyelikId));
      const y = await d.ogrenciEkle();
      await profilYaz(d, y.uyelikId, 'yok');
      await uygula(d, girdi(d, y.uyelikId));
      expect(await krediSatirlari(o.uyelikId)).toHaveLength(0);
      expect(await krediSatirlari(y.uyelikId)).toHaveLength(0);
    });

    it('en yakin bitisli havuzdan duser, bitince siradakine gecer; NULL bitis en sona', async () => {
      const o = await d.ogrenciEkle();
      const suresiz = await d.paketOlustur({ ad: 'suresiz', kredi_adedi: 1, fiyat_kurus: 0 });
      const otuz = await d.paketOlustur({
        ad: '30 gun',
        kredi_adedi: 1,
        fiyat_kurus: 0,
        gecerlilik_gun: 30,
      });
      const on = await d.paketOlustur({
        ad: '10 gun',
        kredi_adedi: 1,
        fiyat_kurus: 0,
        gecerlilik_gun: 10,
      });
      const sSuresiz = (await d.paketSat(o.uyelikId, suresiz.id)).govde.satis.id;
      const sOtuz = (await d.paketSat(o.uyelikId, otuz.id)).govde.satis.id;
      const sOn = (await d.paketSat(o.uyelikId, on.id)).govde.satis.id;
      const kullanilan: (string | null)[] = [];
      for (let i = 0; i < 4; i++) {
        await uygula(d, girdi(d, o.uyelikId));
        const dusumler = (await krediSatirlari(o.uyelikId)).filter((r) => r.tur === 'dusum');
        kullanilan.push(dusumler.at(-1)?.paket_satisi_id ?? null);
      }
      expect(kullanilan).toEqual([sOn, sOtuz, sSuresiz, null]);
      expect(await kalan(o.uyelikId)).toBe(-1);
      const durumlar = await sistem<
        { durum: string }[]
      >`select durum from finans.paket_satislari where ogrenci_id = ${o.uyelikId}`;
      expect(durumlar.every((x) => x.durum === 'tukendi')).toBe(true);
    });

    it('iade havuza geri doner ve havuz tekrar aktif olur', async () => {
      const o = await paketliOgrenci(d, 1);
      const yoklamaId = uuidv7();
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId }));
      const [once] = await sistem<
        { durum: string }[]
      >`select durum from finans.paket_satislari where id = ${o.satisId}`;
      expect(once?.durum).toBe('tukendi');
      await uygula(d, girdi(d, o.uyelikId, { yoklamaId, yoklamaSurumu: 2, durum: 'izinli' }));
      const [sonra] = await sistem<
        { durum: string }[]
      >`select durum from finans.paket_satislari where id = ${o.satisId}`;
      expect(sonra?.durum).toBe('aktif');
    });

    it('paket grup turu ve brans filtreleri havuz uygunlugunu belirler', async () => {
      const o = await d.ogrenciEkle();
      const sadeceSinif = await d.paketOlustur({
        kredi_adedi: 5,
        fiyat_kurus: 0,
        grup_turu: 'sinif',
      });
      const sadeceFizik = await d.paketOlustur({
        kredi_adedi: 5,
        fiyat_kurus: 0,
        brans_kodu: 'fizik',
      });
      await d.paketSat(o.uyelikId, sadeceSinif.id);
      const fizikSatis = (await d.paketSat(o.uyelikId, sadeceFizik.id)).govde.satis.id;
      await uygula(d, girdi(d, o.uyelikId, { grupTuru: 'birebir', bransKodu: 'fizik' }));
      expect(
        (await krediSatirlari(o.uyelikId)).filter((r) => r.tur === 'dusum')[0]?.paket_satisi_id,
      ).toBe(fizikSatis);
      await uygula(d, girdi(d, o.uyelikId, { grupTuru: 'birebir', bransKodu: 'kimya' }));
      expect(
        (await krediSatirlari(o.uyelikId)).filter((r) => r.tur === 'dusum')[1]?.paket_satisi_id,
      ).toBeNull();
    });
  });

  describe('politika cozumu (paket > kurum > varsayilan)', () => {
    it('varsayilan: izinli dusurmez, gelmedi ve gec dusurur; gecIptalSaatiBul 24', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'izinli' }));
      expect(await kalan(o.uyelikId)).toBe(8);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'gelmedi' }));
      await uygula(x, girdi(x, o.uyelikId, { durum: 'gec' }));
      expect(await kalan(o.uyelikId)).toBe(6);
      expect(await withTenant(appDb, baglam(x), (tx) => gecIptalSaatiBul(tx, x.kurumId))).toBe(24);
    });

    it('kurum politikasi: gelmedi kapali, izinli acik, gec_iptal_saat 48', async () => {
      const x = await finansDunyasi(t, sistem);
      const put = await app.inject({
        method: 'PUT',
        url: x.api('/kredi-politikasi'),
        headers: bearer(x.owner.token),
        payload: { gelmedi_dusurur: false, izinli_dusurur: true, gec_iptal_saat: 48 },
      });
      expect(put.statusCode).toBe(200);
      const o = await paketliOgrenci(x);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'gelmedi' }));
      expect(await kalan(o.uyelikId)).toBe(8);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'izinli' }));
      expect(await kalan(o.uyelikId)).toBe(7);
      expect(await withTenant(appDb, baglam(x), (tx) => gecIptalSaatiBul(tx, x.kurumId))).toBe(48);
    });

    it('paket politikasi kurum politikasini alan alan gecersiz kilar', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x, 8, {
        kredi_politikasi: { gelmedi_dusurur: false, izinli_dusurur: true },
      });
      await uygula(x, girdi(x, o.uyelikId, { durum: 'gelmedi' }));
      expect(await kalan(o.uyelikId)).toBe(8);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'izinli' }));
      expect(await kalan(o.uyelikId)).toBe(7);
      await uygula(x, girdi(x, o.uyelikId, { durum: 'geldi' })); // belirtilmeyen alan kurumdan
      expect(await kalan(o.uyelikId)).toBe(6);
    });

    it('etkin dusum varken durum politikaya gore artik dusurmuyorsa iade edilir (paket politikasi)', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x, 8, { kredi_politikasi: { gelmedi_dusurur: false } });
      const yoklamaId = uuidv7();
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, durum: 'geldi' }));
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, yoklamaSurumu: 2, durum: 'gelmedi' }));
      expect(await kalan(o.uyelikId)).toBe(8);
    });
  });

  describe('dusuk kredi esigi olayi', () => {
    it('yalniz esigi gecen hareketle yayimlanir; iade ile yukari cikip tekrar inince yine yayimlanir', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x, 4);
      const [y0, y1, y2, y3] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()] as const;
      const yoklamalar = [y0, y1, y2];
      const s: (boolean | undefined)[] = [];
      for (const yoklamaId of yoklamalar) {
        const r = await uygula(x, girdi(x, o.uyelikId, { yoklamaId }));
        s.push(r.kredi_azaldi !== undefined);
      }
      // 4 -> 3 (yok), 3 -> 2 (esik: var), 2 -> 1 (yok)
      expect(s).toEqual([false, true, false]);
      expect(await olaylar(x, 'evt.finans.kredi.azaldi.v1')).toHaveLength(1);
      // iade ile 2'nin ustune cik, tekrar in
      await uygula(
        x,
        girdi(x, o.uyelikId, {
          yoklamaId: y1,
          yoklamaSurumu: 2,
          durum: 'izinli',
        }),
      );
      await uygula(
        x,
        girdi(x, o.uyelikId, {
          yoklamaId: y2,
          yoklamaSurumu: 2,
          durum: 'izinli',
        }),
      );
      expect(await kalan(o.uyelikId)).toBe(3);
      const r = await uygula(x, girdi(x, o.uyelikId, { yoklamaId: y3 }));
      expect(r.kredi_azaldi).toEqual({ kalan_kredi: 2, esik: 2 });
      const olay = await olaylar(x, 'evt.finans.kredi.azaldi.v1');
      expect(olay).toHaveLength(2);
      const veri = (olay[1]?.payload as { data: Record<string, unknown> }).data;
      expect(veri).toMatchObject({ ogrenci_id: o.uyelikId, kalan_kredi: 2, esik: 2 });
      expect(Object.keys(veri).sort()).toEqual(['esik', 'kalan_kredi', 'ogrenci_id', 'yoklama_id']);
    });
  });

  describe('ders basi ucret', () => {
    async function tarife(x: FinansDunyasi, govde: Record<string, unknown>) {
      const res = await app.inject({
        method: 'POST',
        url: x.api('/ucret-tarifeleri'),
        headers: bearer(x.owner.token),
        payload: { ucret_kurus: 100_000, gecerlilik_baslangic: '2020-01-01', ...govde },
      });
      expect(res.statusCode, res.body).toBe(201);
      return res.json<{ id: string }>();
    }

    it('tarife onceligi: ogrenci > grup > brans > kurum varsayilani; tutar defter satirina kopyalanir', async () => {
      const x = await finansDunyasi(t, sistem);
      const grupId = await x.grupAc();
      const [a, b, c, e] = await Promise.all([
        x.ogrenciEkle(),
        x.ogrenciEkle(),
        x.ogrenciEkle(),
        x.ogrenciEkle(),
      ]);
      for (const o of [a, b, c, e]) await profilYaz(x, o.uyelikId, 'ders_basi');
      await tarife(x, { ucret_kurus: 1_000 });
      await tarife(x, { ucret_kurus: 2_000, brans_kodu: 'matematik' });
      await tarife(x, { ucret_kurus: 3_000, grup_id: grupId });
      await tarife(x, { ucret_kurus: 4_000, ogrenci_id: a.uyelikId });

      await uygula(x, girdi(x, a.uyelikId, { grupId, bransKodu: 'matematik' }));
      await uygula(x, girdi(x, b.uyelikId, { grupId, bransKodu: 'matematik' }));
      await uygula(x, girdi(x, c.uyelikId, { bransKodu: 'matematik' }));
      await uygula(x, girdi(x, e.uyelikId, { bransKodu: 'fizik' }));
      expect(await bakiye(a.uyelikId)).toBe(-4_000);
      expect(await bakiye(b.uyelikId)).toBe(-3_000);
      expect(await bakiye(c.uyelikId)).toBe(-2_000);
      expect(await bakiye(e.uyelikId)).toBe(-1_000);

      // Tarife sonradan degisse gecmis etkilenmez.
      const sonradan = await app.inject({
        method: 'PATCH',
        url: x.api(
          `/ucret-tarifeleri/${(await sistem<{ id: string }[]>`select id from finans.ucret_tarifeleri where kurum_id = ${x.kurumId} and ogrenci_id = ${a.uyelikId}`)[0]?.id ?? ''}`,
        ),
        headers: bearer(x.owner.token),
        payload: { ucret_kurus: 9_999 },
      });
      expect(sonradan.statusCode).toBe(200);
      expect(await bakiye(a.uyelikId)).toBe(-4_000);
    });

    it('ayni ozgullukte en yeni baslangic, tarih araligi disinda tarife yok sayilir, tarife yoksa uyari ve satir yok', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      await profilYaz(x, o.uyelikId, 'ders_basi');
      const bos = await uygula(x, girdi(x, o.uyelikId));
      expect(bos.uyari).toBe('ucret_tarifesi_yok');
      expect(await bakiyeSatirlari(o.uyelikId)).toHaveLength(0);

      // Cakisan araligi uygulama engeller...
      await tarife(x, { ucret_kurus: 1_000, gecerlilik_baslangic: '2020-01-01' });
      const cakisan = await app.inject({
        method: 'POST',
        url: x.api('/ucret-tarifeleri'),
        headers: bearer(x.owner.token),
        payload: { ucret_kurus: 5, gecerlilik_baslangic: '2021-01-01' },
      });
      expect(cakisan.statusCode).toBe(409);
      expect(cakisan.json<{ error: { code: string } }>().error.code).toBe('tarife_cakisiyor');
      // ...ama dogrudan yazilmis cakisan satirlarda en yeni baslangic kazanir.
      await sistem`insert into finans.ucret_tarifeleri (id, kurum_id, ucret_kurus, gecerlilik_baslangic)
        values (${uuidv7()}, ${x.kurumId}, 7000, '2024-01-01')`;
      await uygula(x, girdi(x, o.uyelikId, { dersYerelTarih: '2025-05-05' }));
      expect(await bakiye(o.uyelikId)).toBe(-7_000);
      // 2019'da hicbir tarife gecerli degil
      const eski = await uygula(x, girdi(x, o.uyelikId, { dersYerelTarih: '2019-05-05' }));
      expect(eski.uyari).toBe('ucret_tarifesi_yok');
    });

    it('ders basi: izinli dusurmez; gelmediyi geldiye cevirince ters kayit + yeni ucret; ucret 0 satir yazmaz', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      await profilYaz(x, o.uyelikId, 'ders_basi');
      await tarife(x, { ucret_kurus: 2_500 });
      const yoklamaId = uuidv7();
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, durum: 'izinli' }));
      expect(await bakiye(o.uyelikId)).toBe(0);
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, yoklamaSurumu: 2, durum: 'geldi' }));
      expect(await bakiye(o.uyelikId)).toBe(-2_500);
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, yoklamaSurumu: 3, durum: 'izinli' }));
      expect(await bakiye(o.uyelikId)).toBe(0);
      await uygula(x, girdi(x, o.uyelikId, { yoklamaId, yoklamaSurumu: 4, durum: 'geldi' }));
      expect(await bakiye(o.uyelikId)).toBe(-2_500);
      expect((await bakiyeSatirlari(o.uyelikId)).map((r) => r.tur)).toEqual([
        'ders_ucreti',
        'ters_kayit',
        'ders_ucreti',
      ]);

      const y = await finansDunyasi(t, sistem);
      const o2 = await y.ogrenciEkle();
      await profilYaz(y, o2.uyelikId, 'ders_basi');
      await tarife(y, { ucret_kurus: 0 });
      const r = await uygula(y, girdi(y, o2.uyelikId));
      expect(r.uyari).toBeUndefined();
      expect(await bakiyeSatirlari(o2.uyelikId)).toHaveLength(0);
    });
  });

  describe('ders iptali', () => {
    const iptalGirdi = (
      x: FinansDunyasi,
      ogrenciId: string,
      iptalKaynagi: 'ogretmen' | 'yonetici' | 'ogrenci',
      gecIptal: boolean,
      dersId: string,
    ) => ({
      kurumId: x.kurumId,
      dersId,
      ogrenciId,
      iptalKaynagi,
      gecIptal,
      dersYerelTarih: BUGUN,
      grupId: null,
      bransKodu: null,
      grupTuru: null,
      aktorKullaniciId: x.owner.kullaniciId,
    });
    const iptal = (x: FinansDunyasi, g: ReturnType<typeof iptalGirdi>) =>
      withTenant(appDb, baglam(x), (tx) => dersIptalUygula(tx, g));

    it('ogretmen/yonetici iptali: hicbir kosulda dusmez ve etkin dusum iade edilir', async () => {
      const o = await paketliOgrenci(d);
      const dersId = uuidv7();
      await uygula(d, girdi(d, o.uyelikId, { dersId }));
      expect(await kalan(o.uyelikId)).toBe(7);
      await iptal(d, iptalGirdi(d, o.uyelikId, 'ogretmen', true, dersId));
      expect(await kalan(o.uyelikId)).toBe(8);
      const dersId2 = uuidv7();
      await iptal(d, iptalGirdi(d, o.uyelikId, 'yonetici', true, dersId2));
      expect(await kalan(o.uyelikId)).toBe(8);
    });

    it('ogrenci iptali: gec degilse dusmez; gec ise tek iptal_dusum (tekrar cagri ikinci satir olusturmaz)', async () => {
      const o = await paketliOgrenci(d);
      const dersA = uuidv7();
      await iptal(d, iptalGirdi(d, o.uyelikId, 'ogrenci', false, dersA));
      expect(await kalan(o.uyelikId)).toBe(8);
      const dersB = uuidv7();
      const r = await iptal(d, iptalGirdi(d, o.uyelikId, 'ogrenci', true, dersB));
      expect(r.kalan_kredi).toBe(7);
      await iptal(d, iptalGirdi(d, o.uyelikId, 'ogrenci', true, dersB));
      expect(
        (await krediSatirlari(o.uyelikId)).filter((s) => s.tur === 'iptal_dusum'),
      ).toHaveLength(1);
      expect(await kalan(o.uyelikId)).toBe(7);
      // sonradan yonetici iptale cevirirse (gecIptal true olsa bile) iptal dusumu iade edilir
      await iptal(d, iptalGirdi(d, o.uyelikId, 'yonetici', true, dersB));
      expect(await kalan(o.uyelikId)).toBe(8);
    });

    it('politika ogrenci_gec_iptal_dusurur kapaliysa gec iptal dusmez', async () => {
      const x = await finansDunyasi(t, sistem);
      await app.inject({
        method: 'PUT',
        url: x.api('/kredi-politikasi'),
        headers: bearer(x.owner.token),
        payload: { ogrenci_gec_iptal_dusurur: false },
      });
      const o = await paketliOgrenci(x);
      await iptal(x, iptalGirdi(x, o.uyelikId, 'ogrenci', true, uuidv7()));
      expect(await kalan(o.uyelikId)).toBe(8);
    });

    it('ders basi modelinde gec ogrenci iptali ucret yazar, tarife yoksa uyari; ogretmen iptali ters cevirir', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      await profilYaz(x, o.uyelikId, 'ders_basi');
      const dersId = uuidv7();
      const uyari = await iptal(x, iptalGirdi(x, o.uyelikId, 'ogrenci', true, dersId));
      expect(uyari.uyari).toBe('ucret_tarifesi_yok');
      await app.inject({
        method: 'POST',
        url: x.api('/ucret-tarifeleri'),
        headers: bearer(x.owner.token),
        payload: { ucret_kurus: 3_000, gecerlilik_baslangic: '2020-01-01' },
      });
      await iptal(x, iptalGirdi(x, o.uyelikId, 'ogrenci', true, dersId));
      expect(await bakiye(o.uyelikId)).toBe(-3_000);
      await iptal(x, iptalGirdi(x, o.uyelikId, 'ogrenci', true, dersId));
      expect(await bakiye(o.uyelikId)).toBe(-3_000);
      await iptal(x, iptalGirdi(x, o.uyelikId, 'ogretmen', true, dersId));
      expect(await bakiye(o.uyelikId)).toBe(0);
      // yoklama ucreti de ders iptalinde ters cevrilir
      const yoklamaDers = uuidv7();
      await uygula(x, girdi(x, o.uyelikId, { dersId: yoklamaDers }));
      expect(await bakiye(o.uyelikId)).toBe(-3_000);
      await iptal(x, iptalGirdi(x, o.uyelikId, 'ogretmen', false, yoklamaDers));
      expect(await bakiye(o.uyelikId)).toBe(0);
    });
  });

  describe('finans modulu kapaliyken', () => {
    it('krediVeUcretiUygula ve dersIptalUygula etkisizdir; uclar modul_kapali doner', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x);
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${x.kurumId}, 'finans', 'kurum', ${x.kurumId}, false)`;
      const r = await uygula(x, girdi(x, o.uyelikId));
      expect(r).toEqual({});
      const ri = await withTenant(appDb, baglam(x), (tx) =>
        dersIptalUygula(tx, {
          kurumId: x.kurumId,
          dersId: uuidv7(),
          ogrenciId: o.uyelikId,
          iptalKaynagi: 'ogrenci',
          gecIptal: true,
          dersYerelTarih: BUGUN,
          grupId: null,
          bransKodu: null,
          grupTuru: null,
          aktorKullaniciId: null,
        }),
      );
      expect(ri).toEqual({});
      expect(await kalan(o.uyelikId)).toBe(8);
      const res = await app.inject({ url: x.api('/paketler'), headers: bearer(x.owner.token) });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('modul_kapali');
    });
  });

  describe('olay yuku', () => {
    it('finans olaylarinda ad, telefon, e-posta, odeyen ve serbest metin yok (makbuz_no haric)', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle('Ayşe Yılmaz');
      const p = await x.paketOlustur({
        ad: 'Gizli Paket Adı',
        kredi_adedi: 3,
        fiyat_kurus: 30_000,
      });
      const profil = await app.inject({
        method: 'PUT',
        url: x.api(`/ogrenciler/${o.uyelikId}/finans-profili`),
        headers: bearer(x.owner.token),
        payload: { model: 'paket', odeyen_ad: 'Mehmet Odeyen', odeyen_telefon: '+905551112233' },
      });
      expect(profil.statusCode).toBe(200);
      const sat = await x.paketSat(o.uyelikId, p.id, {
        tur: 'kismi',
        tutar_kurus: 10_000,
        yontem: 'nakit',
        makbuz_no: 'MKB-1',
      });
      expect(sat.statusCode).toBe(201);
      await uygula(x, girdi(x, o.uyelikId));
      await uygula(x, girdi(x, o.uyelikId));

      const tum = await sistem<{ subject: string; payload: { data: Record<string, unknown> } }[]>`
        select subject, payload from ortak.outbox where kurum_id = ${x.kurumId} and subject like 'evt.finans.%'`;
      expect(new Set(tum.map((r) => r.subject))).toEqual(
        new Set([
          'evt.finans.paket.satildi.v1',
          'evt.finans.tahsilat.alindi.v1',
          'evt.finans.kredi.azaldi.v1',
        ]),
      );
      const metin = JSON.stringify(tum);
      for (const yasak of [
        'Ayşe',
        'Mehmet',
        '905551112233',
        'Gizli Paket',
        'odeyen',
        'telefon',
        'eposta',
      ]) {
        expect(metin).not.toContain(yasak);
      }
      const tahsilat = tum.find((r) => r.subject === 'evt.finans.tahsilat.alindi.v1');
      expect(tahsilat?.payload.data.makbuz_no).toBe('MKB-1');
      // Denetim kaydi odeyen degerlerini de tasimaz.
      const denetim = await sistem<
        { s: string }[]
      >`select coalesce(sonra::text, '') as s from hesap.denetim_kayitlari where kurum_id = ${x.kurumId}`;
      expect(denetim.map((r) => r.s).join('')).not.toContain('Mehmet');
      expect(denetim.map((r) => r.s).join('')).not.toContain('905551112233');
    });
  });

  describe('defter degismezligi ve izolasyon', () => {
    it('api_app UPDATE/DELETE reddedilir; sahip ve api_sistem rolunde de tetikleyici/yetki reddeder', async () => {
      const o = await paketliOgrenci(d);
      await uygula(d, girdi(d, o.uyelikId));
      for (const tablo of ['kredi_hareketleri', 'bakiye_hareketleri']) {
        const upd = await hataMetni(
          withTenant(appDb, baglam(), (tx) =>
            tx.execute(sqlRaw(`update finans.${tablo} set kurum_id = kurum_id`)),
          ),
        );
        expect(upd).toContain('permission denied');
        const del = await hataMetni(
          withTenant(appDb, baglam(), (tx) => tx.execute(sqlRaw(`delete from finans.${tablo}`))),
        );
        expect(del).toContain('permission denied');
        // api_sistem de UPDATE/DELETE alamaz
        const sis = await hataMetni(sistem.unsafe(`delete from finans.${tablo}`));
        expect(sis).toContain('permission denied');
        // Veritabani sahibi/superuser: tetikleyici reddeder.
        const sahip = postgres(urls?.ownerUrl ?? '', { max: 1, onnotice: () => undefined });
        try {
          expect(
            await hataMetni(sahip.unsafe(`update finans.${tablo} set kurum_id = kurum_id`)),
          ).toContain('defter_degistirilemez');
          expect(await hataMetni(sahip.unsafe(`delete from finans.${tablo}`))).toContain(
            'defter_degistirilemez',
          );
        } finally {
          await sahip.end();
        }
      }
    });

    it('A kurumu B kurumunun finans satirlarini goremez ve yazamaz (10 tablo)', async () => {
      const a = await finansDunyasi(t, sistem);
      const b = await finansDunyasi(t, sistem);
      // A kurumunda her tabloda en az bir satir olustur.
      const o = await a.ogrenciEkle();
      const p = await a.paketOlustur({ gecerlilik_gun: 30 });
      await a.paketSat(o.uyelikId, p.id, { tur: 'kismi', tutar_kurus: 1000, yontem: 'nakit' });
      await app.inject({
        method: 'PUT',
        url: a.api('/kredi-politikasi'),
        headers: bearer(a.owner.token),
        payload: { dusuk_kredi_esigi: 3 },
      });
      await app.inject({
        method: 'POST',
        url: a.api('/ucret-tarifeleri'),
        headers: bearer(a.owner.token),
        payload: { ucret_kurus: 5, gecerlilik_baslangic: '2020-01-01' },
      });
      await profilYaz(a, o.uyelikId, 'paket');
      const ders = await a.ogrenciEkle();
      await profilYaz(a, ders.uyelikId, 'ders_basi');
      await uygula(a, girdi(a, o.uyelikId));

      const tablolar = [
        'kredi_politikalari',
        'ogrenci_finans_profilleri',
        'paketler',
        'paket_satislari',
        'kredi_hareketleri',
        'kredi_bakiyeleri',
        'ucret_tarifeleri',
        'tahsilatlar',
        'bakiye_hareketleri',
        'ogrenci_bakiyeleri',
      ];
      for (const tablo of tablolar) {
        const [sahip] = await sistem.unsafe(
          `select count(*)::int n from finans.${tablo} where kurum_id = '${a.kurumId}'`,
        );
        expect(Number(sahip?.n), `A kurumunda ${tablo} satiri olmali`).toBeGreaterThan(0);
        const goren = await withTenant(appDb, baglam(b), (tx) =>
          tx.execute<{ n: number }>(
            sqlRaw(`select count(*)::int n from finans.${tablo} where kurum_id = '${a.kurumId}'`),
          ),
        );
        expect(goren[0]?.n, `${tablo}: B, A satirini gormemeli`).toBe(0);
      }
      // B baglamindan A kurumuna yazma (WITH CHECK)
      const uid = (): string => uuidv7();
      const eklemeler: Record<string, string> = {
        kredi_politikalari: `insert into finans.kredi_politikalari (id, kurum_id) values ('${uid()}', '${a.kurumId}')`,
        ogrenci_finans_profilleri: `insert into finans.ogrenci_finans_profilleri (id, kurum_id, ogrenci_id) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}')`,
        paketler: `insert into finans.paketler (id, kurum_id, ad, kredi_adedi, fiyat_kurus) values ('${uid()}', '${a.kurumId}', 'x', 1, 0)`,
        paket_satislari: `insert into finans.paket_satislari (id, kurum_id, ogrenci_id, ad, toplam_kredi, fiyat_kurus, satan_id) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}', 'x', 1, 0, '${a.owner.uyelikId}')`,
        kredi_hareketleri: `insert into finans.kredi_hareketleri (id, kurum_id, ogrenci_id, tur, miktar) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}', 'duzeltme', 1)`,
        kredi_bakiyeleri: `insert into finans.kredi_bakiyeleri (id, kurum_id, ogrenci_id) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}')`,
        ucret_tarifeleri: `insert into finans.ucret_tarifeleri (id, kurum_id, ucret_kurus, gecerlilik_baslangic) values ('${uid()}', '${a.kurumId}', 1, '2020-01-01')`,
        tahsilatlar: `insert into finans.tahsilatlar (id, kurum_id, ogrenci_id, tutar_kurus, yontem, alan_id) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}', 1, 'nakit', '${a.owner.uyelikId}')`,
        bakiye_hareketleri: `insert into finans.bakiye_hareketleri (id, kurum_id, ogrenci_id, tur, tutar_kurus, kaynak_turu) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}', 'duzeltme', 1, 'elle')`,
        ogrenci_bakiyeleri: `insert into finans.ogrenci_bakiyeleri (id, kurum_id, ogrenci_id) values ('${uid()}', '${a.kurumId}', '${ders.uyelikId}')`,
      };
      for (const tablo of tablolar) {
        const metin = await hataMetni(
          withTenant(appDb, baglam(b), (tx) => tx.execute(sqlRaw(eklemeler[tablo] ?? ''))),
        );
        // Rol tetikleyicisi RLS kontrolunden once calisabilir; ikisi de yazmayi reddeder.
        expect(metin, `${tablo}: B baglami A'ya yazamamali`).toMatch(
          /row-level security|uyelik_rolu_uygun_degil/,
        );
      }
      // B baglamindan A satirlarini guncelleme/silme etkisiz (satir gorunmez)
      for (const tablo of ['paketler', 'tahsilatlar', 'kredi_bakiyeleri']) {
        const etkilenen = await withTenant(appDb, baglam(b), (tx) =>
          tx.execute(
            sqlRaw(`delete from finans.${tablo} where kurum_id = '${a.kurumId}' returning 1`),
          ),
        );
        expect(etkilenen).toHaveLength(0);
      }
      // Baglam yokken (fail-closed) hicbir satir gorunmez.
      for (const tablo of tablolar) {
        const rows = await appDb.orm.execute<{ n: number }>(
          sqlRaw(`select count(*)::int n from finans.${tablo}`),
        );
        expect(rows[0]?.n, `${tablo}: baglam yokken satir gorunmemeli`).toBe(0);
      }
    });
  });

  describe('degismezlik: rastgele islem dizisi', () => {
    // Tekrarlanabilir sahte rastgelelik (mulberry32).
    const rastgele = (tohum: number) => () => {
      tohum = (tohum + 0x6d2b79f5) | 0;
      let t2 = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum);
      t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
      return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
    };

    it('satis, dusum, iade, tahsilat ve iptaller sonrasi ozet == SUM(defter); bakiye defterden yeniden hesaplanir', async () => {
      const x = await finansDunyasi(t, sistem);
      const r = rastgele(20261108);
      const sec = <T>(liste: readonly T[]): T => liste[Math.floor(r() * liste.length)] as T;
      const ogrenciler = [await x.ogrenciEkle(), await x.ogrenciEkle(), await x.ogrenciEkle()];
      const paketler = [
        await x.paketOlustur({ kredi_adedi: 3, fiyat_kurus: 99_999 }),
        await x.paketOlustur({ kredi_adedi: 5, fiyat_kurus: 123_457, gecerlilik_gun: 20 }),
        await x.paketOlustur({ kredi_adedi: 1, fiyat_kurus: 3 }),
      ];
      await profilYaz(x, (ogrenciler[2] as { uyelikId: string }).uyelikId, 'ders_basi');
      await app.inject({
        method: 'POST',
        url: x.api('/ucret-tarifeleri'),
        headers: bearer(x.owner.token),
        payload: { ucret_kurus: 33_333, gecerlilik_baslangic: '2020-01-01' },
      });
      const yoklamalar: { id: string; ogrenci: string; surum: number; dersId: string }[] = [];
      const tahsilatlar: string[] = [];
      const satislar: string[] = [];
      const durumlar = ['geldi', 'gelmedi', 'izinli', 'gec', null] as const;

      for (let i = 0; i < 70; i++) {
        const op = r();
        const ogr = sec(ogrenciler);
        if (op < 0.15) {
          const s = await x.paketSat(
            ogr.uyelikId,
            sec(paketler).id,
            sec([{ tur: 'sonra' }, { tur: 'tamami', yontem: 'nakit' }]),
          );
          if (s.statusCode === 201) satislar.push(s.govde.satis.id);
        } else if (op < 0.55) {
          const mevcut = r() < 0.5 && yoklamalar.length > 0 ? sec(yoklamalar) : null;
          const y = mevcut ?? { id: uuidv7(), ogrenci: ogr.uyelikId, surum: 0, dersId: uuidv7() };
          if (!mevcut) yoklamalar.push(y);
          y.surum += 1;
          await uygula(
            x,
            girdi(x, y.ogrenci, {
              yoklamaId: y.id,
              dersId: y.dersId,
              yoklamaSurumu: y.surum,
              durum: sec(durumlar),
            }),
          );
        } else if (op < 0.8) {
          const res = await app.inject({
            method: 'POST',
            url: x.api('/tahsilatlar'),
            headers: bearer(x.owner.token),
            payload: {
              ogrenci_id: ogr.uyelikId,
              tutar_kurus: 1 + Math.floor(r() * 50_000),
              yontem: 'havale',
            },
          });
          if (res.statusCode === 201) tahsilatlar.push(res.json<{ id: string }>().id);
        } else if (op < 0.9 && tahsilatlar.length > 0) {
          const id = sec(tahsilatlar);
          await app.inject({
            method: 'POST',
            url: x.api(`/tahsilatlar/${id}/iptal`),
            headers: bearer(x.owner.token),
            payload: { neden: 'hatali giris' },
          });
        } else if (satislar.length > 0) {
          await app.inject({
            method: 'POST',
            url: x.api(`/paket-satislari/${sec(satislar)}/iptal`),
            headers: bearer(x.owner.token),
            payload: { neden: 'vazgecti' },
          });
        }
      }

      for (const o of ogrenciler) {
        const defterKredi = Number(
          (
            await sistem<
              { n: string }[]
            >`select coalesce(sum(miktar),0)::text n from finans.kredi_hareketleri where ogrenci_id = ${o.uyelikId}`
          )[0]?.n,
        );
        const defterBakiye = Number(
          (
            await sistem<
              { n: string }[]
            >`select coalesce(sum(tutar_kurus),0)::text n from finans.bakiye_hareketleri where ogrenci_id = ${o.uyelikId}`
          )[0]?.n,
        );
        expect(await kalan(o.uyelikId)).toBe(defterKredi);
        expect(await bakiye(o.uyelikId)).toBe(defterBakiye);
      }
      // Havuz toplamlari: pool bazli toplam <= toplam_kredi ve ters kayitlar en fazla bir kez cevrilmis
      const cift = await sistem<{ n: number }[]>`select count(*)::int n from (
        select ters_cevrilen_id from finans.kredi_hareketleri where kurum_id = ${x.kurumId} and ters_cevrilen_id is not null
        group by 1 having count(*) > 1) q`;
      expect(cift[0]?.n).toBe(0);
      // Gece denetimi uyusmazlik bulmaz (yalniz bu kurum icin sonuc suzulur).
      const log = { error: vi.fn(), info: vi.fn() };
      const bulunan = await ozetDenetimiCalistir(sistemDb, log);
      expect(bulunan.filter((u) => u.kurum_id === x.kurumId)).toHaveLength(0);
    });
  });

  describe('gece isleri', () => {
    it('ozet ile defter farki error olarak raporlanir', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x);
      await sistem`update finans.kredi_bakiyeleri set bakiye = bakiye + 5 where ogrenci_id = ${o.uyelikId}`;
      await sistem`update finans.ogrenci_bakiyeleri set bakiye_kurus = bakiye_kurus + 7 where ogrenci_id = ${o.uyelikId}`;
      const log = { error: vi.fn(), info: vi.fn() };
      const bulunan = (await ozetDenetimiCalistir(sistemDb, log)).filter(
        (u) => u.kurum_id === x.kurumId,
      );
      expect(bulunan.map((u) => [u.tur, u.ozet - u.defter]).sort()).toEqual([
        ['bakiye', 7],
        ['kredi', 5],
      ]);
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ ogrenci_id: o.uyelikId }),
        'finans_ozet_uyusmazligi',
      );
      // Denetim kaydi nedenle yazilir
      const kayit = await sistem<
        { n: number }[]
      >`select count(*)::int n from hesap.denetim_kayitlari where eylem = 'sistem.finans_ozet_denetimi' and neden is not null`;
      expect(kayit[0]?.n).toBeGreaterThan(0);
    });

    it('suresi dolan paket: son_kullanma satiri ve durum suresi_doldu; tekrar calistirma idempotent', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await paketliOgrenci(x, 5, { gecerlilik_gun: 30 });
      await uygula(x, girdi(x, o.uyelikId));
      await sistem`update finans.paket_satislari set baslangic_tarihi = '2020-01-01', bitis_tarihi = '2020-01-31' where id = ${o.satisId}`;
      expect(await sonKullanmaCalistir(sistemDb, '2026-11-08')).toBeGreaterThanOrEqual(1);
      const satirlar = await krediSatirlari(o.uyelikId);
      const sk = satirlar.filter((s) => s.tur === 'son_kullanma');
      expect(sk).toHaveLength(1);
      expect(sk[0]?.miktar).toBe(-4);
      expect(await kalan(o.uyelikId)).toBe(0);
      const [durum] = await sistem<
        { durum: string }[]
      >`select durum from finans.paket_satislari where id = ${o.satisId}`;
      expect(durum?.durum).toBe('suresi_doldu');
      await sonKullanmaCalistir(sistemDb, '2026-11-08');
      expect(
        (await krediSatirlari(o.uyelikId)).filter((s) => s.tur === 'son_kullanma'),
      ).toHaveLength(1);
    });
  });
});
