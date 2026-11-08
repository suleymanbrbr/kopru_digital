import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { tarihEkle, utcdenYerel } from './modules/ders/index.js';
import { dersSerileriniUret } from './sistem/ders-seri-uret.js';
import {
  BUGUN,
  dersYardimcilari,
  gunSonra,
  pazartesi,
  type DersJson,
  type Hata,
  type IslemYaniti,
  type Kurulum,
} from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

describe.skipIf(dbYok())('ders takvimi API', () => {
  const urls = testDb();
  // Cok sayida istek atan senaryolar icin IP basina genel hiz sinirini kaldirir.
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let appDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 3 });
    appDb = createDb({ url: urls.appUrl, max: 3 });
    y = dersYardimcilari({ t, sistem });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await sistemDb.close();
    await appDb.close();
  });

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;

  describe('tekil ders', () => {
    it('olusturur: UTC cevrimi, donmus katilimcilar, olay (kisisel veri yok) ve denetim', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const tarih = pazartesi(1);
      const ders = await y.dersAc(s, { tarih, online_baglanti: 'https://meet.example/abc' });
      expect(ders.baslangic_at).toBe(`${tarih}T13:00:00.000Z`);
      expect(ders.bitis_at).toBe(`${tarih}T14:00:00.000Z`);
      expect(ders.katilimci_sayisi).toBe(3);
      expect(ders.brans_kodu).toBe('matematik'); // atamadan
      expect(ders.seri_id).toBeNull();
      expect(ders.surum).toBe(1);
      expect(ders.katilimcilar?.map((x) => x.ogrenci_id).sort()).toEqual([...s.ogrenciler].sort());
      expect(ders.katilimcilar?.every((x) => x.gorunen_ad?.startsWith('Ogrenci'))).toBe(true);

      const olaylar = await sistem<{ payload: { data: Record<string, unknown> } }[]>`
        select payload from ortak.outbox
        where kurum_id = ${s.k.kurumId} and subject = 'evt.ders.ders.degisti.v1'`;
      expect(olaylar).toHaveLength(1);
      const veri = olaylar[0]?.payload.data;
      expect(veri).toMatchObject({
        ders_id: ders.id,
        degisim_turu: 'planlandi',
        online: true,
        parca_no: 1,
        parca_sayisi: 1,
      });
      expect((veri?.ogrenci_idleri as string[]).sort()).toEqual([...s.ogrenciler].sort());
      const metin = JSON.stringify(olaylar[0]?.payload);
      expect(metin).not.toMatch(/Ogrenci \d|telefon|eposta|meet\.example/);

      const denetim = await sistem<{ eylem: string; hedef_id: string }[]>`
        select eylem, hedef_id from hesap.denetim_kayitlari
        where kurum_id = ${s.k.kurumId} and eylem like 'ders.%'`;
      expect(denetim).toEqual([{ eylem: 'ders.olustur', hedef_id: ders.id }]);
    });

    it('ogretmen_id cozumu: sahip token ogretmensiz 422, ogretmen kendi adina, baskasi adina 403', async () => {
      const s = await y.kur();
      const govde = y.dersGovdesi(s.grup.id, { brans_kodu: 'matematik' });
      const sahip = await y.post(s.k, s.k.token, '/dersler', govde);
      expect(sahip.statusCode).toBe(422);
      expect(hataKodu(sahip)).toBe('ogretmen_gerekli');

      const kendi = await y.post(s.k, s.hoca.token, '/dersler', govde);
      expect(kendi.statusCode).toBe(201);
      expect(kendi.json<{ ders: DersJson }>().ders.ogretmen_id).toBe(s.hoca.uyelikId);

      const baska = await y.post(s.k, s.hoca.token, '/dersler', {
        ...govde,
        tarih: pazartesi(2),
        ogretmen_id: s.ogrenciler[0],
      });
      expect(baska.statusCode).toBe(403);

      // Gecersiz ogretmen (ogrenci uyeligi) yonetici icin 422
      const gecersiz = await y.post(s.k, s.k.token, '/dersler', {
        ...govde,
        ogretmen_id: s.ogrenciler[0],
      });
      expect(gecersiz.statusCode).toBe(422);
      expect(hataKodu(gecersiz)).toBe('ogretmen_gecersiz');

      // Atamasi/brans bilgisi olmayan ogretmen icin brans zorunlu
      const g2 = await y.grupAc(s.k, 'grup', 'Atamasiz');
      const bransYok = await y.post(s.k, s.k.token, '/dersler', {
        grup_id: g2.id,
        tarih: pazartesi(1),
        baslangic_saati: '10:00',
        sure_dk: 60,
        ogretmen_id: s.hoca.uyelikId,
      });
      expect(bransYok.statusCode).toBe(422);
      expect(hataKodu(bransYok)).toBe('brans_gerekli');
    });

    it('bireysel kurum: hoca iki uyelik tasir; sahip token ile ogretmen uyeligi otomatik cozulur', async () => {
      const k = await y.kurumluKullanici('bireysel');
      const uyelikler = await sistem<{ id: string; rol: string }[]>`
        select id, rol from hesap.uyelikler where kurum_id = ${k.kurumId} and kullanici_id = ${k.kullaniciId}`;
      expect(uyelikler.map((u) => u.rol).sort()).toEqual(['ogretmen', 'sahip']);
      const ogretmenUyelik = uyelikler.find((u) => u.rol === 'ogretmen')?.id ?? '';
      const sahipUyelik = uyelikler.find((u) => u.rol === 'sahip')?.id ?? '';
      const sahipToken = (await y.tokenAl(k.oturum, { uyelik_id: sahipUyelik })).accessToken;

      const grup = await y.grupAc({ ...k, token: sahipToken }, 'birebir', 'Birebir');
      const [ogrenci] = await y.topluOgrenci(k.kurumId, 1);
      await y.gruba(k, grup.id, [ogrenci ?? '']);
      const res = await y.post(k, sahipToken, '/dersler', {
        grup_id: grup.id,
        tarih: pazartesi(1),
        baslangic_saati: '15:00',
        sure_dk: 45,
        brans_kodu: 'matematik',
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json<{ ders: DersJson }>().ders.ogretmen_id).toBe(ogretmenUyelik);
    });

    it('ogretmen cakismasi: 409 + liste; onayla yazilir; yaris (5 es zamanli) 500 degil 409', async () => {
      const s = await y.kur();
      const ilk = await y.dersAc(s);
      const cakisan = await y.post(
        s.k,
        s.k.token,
        '/dersler',
        y.dersGovdesi(s.grup.id, { ogretmen_id: s.hoca.uyelikId, baslangic_saati: '16:30' }),
      );
      expect(cakisan.statusCode).toBe(409);
      expect(hataKodu(cakisan)).toBe('ders_cakismasi');
      expect(cakisan.json<Hata>().error.details?.cakisanlar).toMatchObject([{ id: ilk.id }]);

      const onayli = await y.dersAc(s, { baslangic_saati: '16:30', cakisma_onayli: true });
      expect(onayli.cakisma_onayli).toBe(true);

      // Yaris: ayni anda bos bir saate 5 istek; veritabani kisiti tam bir yazima izin verir.
      const yarisGovdesi = y.dersGovdesi(s.grup.id, {
        ogretmen_id: s.hoca.uyelikId,
        tarih: pazartesi(3),
        baslangic_saati: '09:00',
      });
      const sonuclar = await Promise.all(
        Array.from({ length: 5 }, () => y.post(s.k, s.k.token, '/dersler', yarisGovdesi)),
      );
      const kodlar = sonuclar.map((r) => r.statusCode).sort();
      expect(kodlar, sonuclar.map((r) => r.body).join('\n')).toEqual([201, 409, 409, 409, 409]);
      for (const r of sonuclar.filter((x) => x.statusCode === 409)) {
        expect(hataKodu(r)).toBe('ders_cakismasi');
      }
    });

    it('belirleyici yaris: on sorgu cakismayi gormez, EXCLUDE ihlali (23P01) 500 degil 409 olur', async () => {
      const s = await y.kur();
      const tarih = pazartesi(4);
      let birak!: () => void;
      let yazildi!: () => void;
      const yazildiSoz = new Promise<void>((r) => (yazildi = r));
      const tutan = withTenant(
        appDb,
        { kurumId: s.k.kurumId, kullaniciId: s.k.kullaniciId },
        async (tx) => {
          // Baska bir islem ayni ogretmen/saate yazdi ama henuz commit etmedi (istegin on sorgusu gormez).
          await tx.execute(sql`
            insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at)
            values (${uuidv7()}, ${s.k.kurumId}, ${s.grup.id}, ${s.hoca.uyelikId}, 'matematik',
                    ${`${tarih}T07:00:00Z`}::timestamptz, ${`${tarih}T08:00:00Z`}::timestamptz, ${`${tarih}T07:00:00Z`}::timestamptz)`);
          yazildi();
          await new Promise<void>((r) => (birak = r));
        },
      );
      await yazildiSoz;
      const istek = y.post(
        s.k,
        s.k.token,
        '/dersler',
        y.dersGovdesi(s.grup.id, { ogretmen_id: s.hoca.uyelikId, tarih, baslangic_saati: '10:30' }),
      );
      await new Promise((r) => setTimeout(r, 400)); // istek EXCLUDE kilidinde bekliyor
      birak();
      await tutan;
      const res = await istek;
      expect(res.statusCode, res.body).toBe(409);
      expect(hataKodu(res)).toBe('ders_cakismasi');
      expect(res.json<Hata>().error.details?.cakisanlar).toHaveLength(1);
    });

    it('ogrenci cakismasi reddetmez, yanitta uyaridir', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      const g2 = await y.grupAc(s.k, 'grup', 'Grup B');
      await y.ata(s.k, g2.id, hoca2.uyelikId);
      await y.gruba(s.k, g2.id, [s.ogrenciler[0] ?? '']);
      const ilk = await y.dersAc(s);
      const res = await y.post(s.k, s.k.token, '/dersler', {
        grup_id: g2.id,
        ogretmen_id: hoca2.uyelikId,
        tarih: pazartesi(1),
        baslangic_saati: '16:00',
        sure_dk: 60,
      });
      expect(res.statusCode).toBe(201);
      const govde = res.json<IslemYaniti>();
      expect(govde.uyari).toEqual([
        {
          kod: 'ogrenci_cakismasi',
          ders_id: govde.ders.id,
          cakisan_ders_id: ilk.id,
          ogrenci_idleri: [s.ogrenciler[0]],
        },
      ]);
    });

    it('250 ogrencili grupta olay 200 luk parcalara bolunur', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const cok = await y.topluOgrenci(s.k.kurumId, 250);
      await y.gruba(s.k, s.grup.id, cok);
      const ders = await y.dersAc(s);
      expect(ders.katilimci_sayisi).toBe(250);
      const olaylar = await sistem<
        {
          payload: { data: { parca_no: number; parca_sayisi: number; ogrenci_idleri: string[] } };
        }[]
      >`
        select payload from ortak.outbox
        where kurum_id = ${s.k.kurumId} and subject = 'evt.ders.ders.degisti.v1'
        order by payload->'data'->>'parca_no'`;
      expect(olaylar.map((o) => [o.payload.data.parca_no, o.payload.data.parca_sayisi])).toEqual([
        [1, 2],
        [2, 2],
      ]);
      expect(olaylar.map((o) => o.payload.data.ogrenci_idleri.length)).toEqual([200, 50]);
    });
  });

  describe('seri', () => {
    it('haftalik MO,WE: 12 hafta ufku, sabit seri sirasi, katilimcilar ve olaylar', async () => {
      const s = await y.kur();
      const g = await y.seriAc(s, {
        tekrar_kurali: 'FREQ=WEEKLY;BYDAY=MO,WE',
        adet: 6,
        sure_dk: 90,
      });
      expect(g.dersler).toHaveLength(6);
      expect(g.dersler.map((d) => d.seri_sirasi)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(g.dersler.every((d) => d.katilimci_sayisi === 3 && !d.seri_istisna)).toBe(true);
      expect(g.atlanan).toEqual([]);
      expect(g.seri.durum).toBe('bitti');
      const olaylar = await sistem`
        select 1 from ortak.outbox where kurum_id = ${s.k.kurumId} and subject = 'evt.ders.ders.degisti.v1'`;
      expect(olaylar).toHaveLength(6);
      const denetim = await sistem`
        select 1 from hesap.denetim_kayitlari where kurum_id = ${s.k.kurumId} and eylem = 'ders.seri_olustur'`;
      expect(denetim).toHaveLength(1);
    });

    it('tekrar kurali dogrulanir (MONTHLY 400), bitis ve adet birlikte verilemez', async () => {
      const s = await y.kur();
      const temel = {
        grup_id: s.grup.id,
        ogretmen_id: s.hoca.uyelikId,
        baslangic_tarihi: pazartesi(1),
        baslangic_saati: '16:00',
        sure_dk: 60,
      };
      for (const ek of [
        { tekrar_kurali: 'FREQ=MONTHLY', adet: 3 },
        { tekrar_kurali: 'FREQ=WEEKLY;COUNT=3', adet: 3 },
        { tekrar_kurali: 'FREQ=WEEKLY', adet: 3, bitis_tarihi: pazartesi(5) },
      ]) {
        const res = await y.post(s.k, s.k.token, '/seriler', { ...temel, ...ek });
        expect(res.statusCode, JSON.stringify(ek)).toBe(400);
      }
    });

    it('DST: Europe/Berlin kurumunda yerel saat sabit, UTC ani gecis haftasinda kayar', async () => {
      const s = await y.kur();
      await sistem`update hesap.kurumlar set saat_dilimi = 'Europe/Berlin' where id = ${s.k.kurumId}`;
      const ileri = await y.seriAc(s, {
        baslangic_tarihi: '2026-03-23',
        adet: 3,
        baslangic_saati: '10:00',
      });
      expect(ileri.dersler.map((d) => d.baslangic_at)).toEqual([
        '2026-03-23T09:00:00.000Z',
        '2026-03-30T08:00:00.000Z',
        '2026-04-06T08:00:00.000Z',
      ]);
      const geri = await y.seriAc(s, {
        baslangic_tarihi: '2026-10-19',
        adet: 2,
        baslangic_saati: '10:00',
      });
      expect(geri.dersler.map((d) => d.baslangic_at)).toEqual([
        '2026-10-19T08:00:00.000Z',
        '2026-10-26T09:00:00.000Z',
      ]);
      expect(utcdenYerel(new Date(geri.dersler[1]?.baslangic_at ?? ''), 'Europe/Berlin').saat).toBe(
        '10:00',
      );
    });

    it('seri cakismasi: 409 (seri yazilmaz), onayla ile yazilir ve cakisanlar listelenir', async () => {
      const s = await y.kur();
      const var_ = await y.dersAc(s, { tarih: pazartesi(2) });
      const sayi = async () =>
        (
          await sistem<{ n: number }[]>`
          select count(*)::int n from ders.ders_serileri where kurum_id = ${s.k.kurumId}`
        )[0]?.n;
      const govde = {
        grup_id: s.grup.id,
        ogretmen_id: s.hoca.uyelikId,
        tekrar_kurali: 'FREQ=WEEKLY;BYDAY=MO',
        baslangic_tarihi: pazartesi(1),
        baslangic_saati: '16:00',
        sure_dk: 60,
        adet: 3,
      };
      const red = await y.post(s.k, s.k.token, '/seriler', govde);
      expect(red.statusCode).toBe(409);
      expect(hataKodu(red)).toBe('ders_cakismasi');
      expect(red.json<Hata>().error.details?.cakisanlar).toMatchObject([{ id: var_.id }]);
      expect(await sayi()).toBe(0);

      const ok = await y.post(s.k, s.k.token, '/seriler', { ...govde, cakisma_onayli: true });
      expect(ok.statusCode).toBe(201);
      const g = ok.json<{ dersler: DersJson[]; cakisanlar: { id: string }[] }>();
      expect(g.dersler.map((d) => d.cakisma_onayli)).toEqual([false, true, false]);
      expect(g.cakisanlar.map((c) => c.id)).toEqual([var_.id]);
    });

    it('seri uretimi idempotent: is iki kez calisinca yeni satir yok; cakisan ders atlanir, seri dusmez', async () => {
      const s = await y.kur();
      const baslangic = pazartesi(1);
      const g = await y.seriAc(s, { adet: undefined, baslangic_tarihi: baslangic });
      const ilkSayi = g.dersler.length;
      expect(ilkSayi).toBe(13); // baslangic + 84 gun dahil: 13 Pazartesi
      expect(g.seri.durum).toBe('aktif');
      // Ilk ufkun disinda, gece isinin uretecegi bir saate ayni ogretmenin tekil dersi
      const cakisanTarih = tarihEkle(baslangic, 91);
      await y.dersAc(s, { tarih: cakisanTarih });

      const simdi = new Date(Date.now() + 30 * 86_400_000);
      const say = async () =>
        (
          await sistem<{ n: number }[]>`
          select count(*)::int n from ders.dersler where seri_id = ${g.seri.id}`
        )[0]?.n ?? 0;
      const ozet1 = await dersSerileriniUret(sistemDb, { simdi });
      expect(ozet1.seri).toBeGreaterThanOrEqual(1);
      const sonra = await say();
      expect(sonra).toBeGreaterThan(ilkSayi);
      // baslangic + 91. gun cakistigi icin uretilmemis olmali (sira 13)
      const atlanan =
        await sistem`select 1 from ders.dersler where seri_id = ${g.seri.id} and seri_sirasi = 13`;
      expect(atlanan).toHaveLength(0);
      expect(ozet1.atlanan).toBeGreaterThanOrEqual(1);

      const ozet2 = await dersSerileriniUret(sistemDb, { simdi });
      expect(ozet2.uretilen).toBe(0);
      expect(await say()).toBe(sonra);

      const denetim = await sistem<{ neden: string }[]>`
        select neden from hesap.denetim_kayitlari
        where kurum_id = ${s.k.kurumId} and eylem = 'sistem.ders_seri_uret'`;
      expect(denetim).toHaveLength(1);
      expect(denetim[0]?.neden).toMatch(/Gece işi/);
      const olay = await sistem<{ payload: { actor: { tur: string } } }[]>`
        select payload from ortak.outbox where kurum_id = ${s.k.kurumId}
          and subject = 'evt.ders.ders.degisti.v1' order by created_at desc limit 1`;
      expect(olay[0]?.payload.actor.tur).toBe('sistem');
    });
  });

  describe('degisiklik: tasi, guncelle (yalniz_bu / bu_ve_sonrakiler)', () => {
    it('tasi: iyimser kilit, yalniz_bu seriden ayirir, bu_ve_sonrakiler istisnayi korur ve seri kuralini gunceller', async () => {
      const s = await y.kur();
      const { dersler, seri } = await y.seriAc(s, { adet: 5 });
      const [d0, d1, d2, d3, d4] = dersler as [DersJson, DersJson, DersJson, DersJson, DersJson];

      const eski = await y.post(s.k, s.k.token, `/dersler/${d1.id}/tasi`, {
        surum: 99,
        yeni_saat: '18:00',
      });
      expect(eski.statusCode).toBe(409);
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      expect(eski.json<Hata>().error.details?.guncel_surum).toBe(1);

      // yalniz_bu: Sali 18:00'e
      const sali = tarihEkle(d1.baslangic_at.slice(0, 10), 1);
      const tek = await y.post(s.k, s.k.token, `/dersler/${d1.id}/tasi`, {
        surum: 1,
        yeni_tarih: sali,
        yeni_saat: '18:00',
      });
      expect(tek.statusCode, tek.body).toBe(200);
      const t1 = tek.json<IslemYaniti>();
      expect(t1.etkilenen_ders_idleri).toEqual([d1.id]);
      expect(t1.ders).toMatchObject({
        seri_istisna: true,
        ertelendi_sayisi: 1,
        ilk_baslangic_at: d1.ilk_baslangic_at,
        baslangic_at: `${sali}T15:00:00.000Z`,
        surum: 2,
      });

      // bu_ve_sonrakiler: gun degisikligi yasak
      const gun = await y.post(s.k, s.k.token, `/dersler/${d0.id}/tasi`, {
        surum: 1,
        kapsam: 'bu_ve_sonrakiler',
        yeni_tarih: tarihEkle(d0.baslangic_at.slice(0, 10), 1),
      });
      expect(gun.statusCode).toBe(422);
      expect(hataKodu(gun)).toBe('tarih_degisikligi_yalniz_bu');

      // bu_ve_sonrakiler: saat 17:00; istisna (d1) korunur
      const toplu = await y.post(s.k, s.k.token, `/dersler/${d0.id}/tasi`, {
        surum: 1,
        kapsam: 'bu_ve_sonrakiler',
        yeni_saat: '17:00',
      });
      expect(toplu.statusCode, toplu.body).toBe(200);
      const t2 = toplu.json<IslemYaniti>();
      expect(t2.etkilenen_ders_idleri.sort()).toEqual([d0.id, d2.id, d3.id, d4.id].sort());
      const d1Son = await y.dersOku(s, d1.id);
      expect(d1Son.baslangic_at).toBe(`${sali}T15:00:00.000Z`); // dokunulmadi
      const d2Son = await y.dersOku(s, d2.id);
      expect(d2Son.baslangic_at).toBe(`${d2.baslangic_at.slice(0, 10)}T14:00:00.000Z`);
      expect(d2Son).toMatchObject({ seri_istisna: false, ertelendi_sayisi: 1 });
      const [kural] = await sistem<{ baslangic_saati: string }[]>`
        select baslangic_saati from ders.ders_serileri where id = ${seri.id}`;
      expect(kural?.baslangic_saati).toBe('17:00:00');

      // degisiklik yok
      const ayni = await y.post(s.k, s.k.token, `/dersler/${d0.id}/tasi`, {
        surum: t2.ders.surum,
        yeni_saat: '17:00',
      });
      expect(ayni.statusCode).toBe(422);
      expect(hataKodu(ayni)).toBe('degisiklik_yok');

      // tek dersli (seri disi) icin bu_ve_sonrakiler 422
      const tekil = await y.dersAc(s, { tarih: pazartesi(8), baslangic_saati: '08:00' });
      const seriDisi = await y.post(s.k, s.k.token, `/dersler/${tekil.id}/tasi`, {
        surum: 1,
        kapsam: 'bu_ve_sonrakiler',
        yeni_saat: '09:00',
      });
      expect(seriDisi.statusCode).toBe(422);
      expect(hataKodu(seriDisi)).toBe('ders_seride_degil');
    });

    it('guncelle: bu_ve_sonrakiler yalniz konu degisince seride yazacak alan yoksa da calisir', async () => {
      const s = await y.kur();
      const { dersler } = await y.seriAc(s, { adet: 2 });
      const [d0] = dersler as [DersJson, DersJson];
      const res = await y.patch(s.k, s.k.token, `/dersler/${d0.id}`, {
        surum: 1,
        kapsam: 'bu_ve_sonrakiler',
        konu_id: uuidv7(),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<IslemYaniti>().etkilenen_ders_idleri).toHaveLength(2);
    });

    it('ayni gruptaki baska ogretmen dersi goremez degil ama degistiremez; kendi dersini ve sahip her dersi degistirir', async () => {
      const s = await y.kur();
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, hoca2.uyelikId, 'fizik');
      const d = await y.dersAc(s);
      expect((await y.get(s.k, hoca2.token, `/dersler/${d.id}`)).statusCode).toBe(200);
      for (const [yol, govde] of [
        [`/dersler/${d.id}/tasi`, { surum: 1, yeni_saat: '18:00' }],
        [`/dersler/${d.id}/iptal`, { surum: 1, iptal_kaynagi: 'ogretmen' }],
        [`/dersler/${d.id}/katilimcilar`, { ogrenci_id: uuidv7(), tur: 'misafir' }],
      ] as const) {
        const r = await y.post(s.k, hoca2.token, yol, govde);
        expect(r.statusCode, r.body).toBe(403);
      }
      expect(
        (await y.patch(s.k, hoca2.token, `/dersler/${d.id}`, { surum: 1, yer: 'x' })).statusCode,
      ).toBe(403);
      expect(
        (await y.patch(s.k, s.hoca.token, `/dersler/${d.id}`, { surum: 1, yer: 'y' })).statusCode,
      ).toBe(200);
      expect(
        (await y.patch(s.k, s.k.token, `/dersler/${d.id}`, { surum: 2, yer: 'z' })).statusCode,
      ).toBe(200);
    });

    it('tasima cakismasi: 409 + liste, cakisma_onayli ile 200', async () => {
      const s = await y.kur();
      const a = await y.dersAc(s, { baslangic_saati: '10:00' });
      const b = await y.dersAc(s, { baslangic_saati: '14:00' });
      const res = await y.post(s.k, s.k.token, `/dersler/${b.id}/tasi`, {
        surum: 1,
        yeni_saat: '10:30',
      });
      expect(res.statusCode).toBe(409);
      expect(res.json<Hata>().error.details?.cakisanlar).toMatchObject([{ id: a.id }]);
      const onayli = await y.post(s.k, s.k.token, `/dersler/${b.id}/tasi`, {
        surum: 1,
        yeni_saat: '10:30',
        cakisma_onayli: true,
      });
      expect(onayli.statusCode).toBe(200);
      expect(onayli.json<IslemYaniti>().ders.cakisma_onayli).toBe(true);
    });

    it('guncelle: yalniz_bu seriden ayirir, bu_ve_sonrakiler istisnayi atlar ve seri kuralini gunceller', async () => {
      const s = await y.kur();
      const { dersler, seri } = await y.seriAc(s, { adet: 4 });
      const [d0, d1, d2, d3] = dersler as [DersJson, DersJson, DersJson, DersJson];

      const tek = await y.patch(s.k, s.k.token, `/dersler/${d1.id}`, { surum: 1, baslik: 'Ozel' });
      expect(tek.statusCode, tek.body).toBe(200);
      expect(tek.json<IslemYaniti>().ders).toMatchObject({
        baslik: 'Ozel',
        seri_istisna: true,
        surum: 2,
      });

      const toplu = await y.patch(s.k, s.k.token, `/dersler/${d0.id}`, {
        surum: 1,
        kapsam: 'bu_ve_sonrakiler',
        online_baglanti: 'https://meet.example/seri',
      });
      expect(toplu.statusCode, toplu.body).toBe(200);
      expect(toplu.json<IslemYaniti>().etkilenen_ders_idleri.sort()).toEqual(
        [d0.id, d2.id, d3.id].sort(),
      );
      expect((await y.dersOku(s, d1.id)).online_baglanti).toBeNull();
      expect((await y.dersOku(s, d3.id)).online_baglanti).toBe('https://meet.example/seri');
      const [kural] = await sistem<{ online_baglanti: string | null }[]>`
        select online_baglanti from ders.ders_serileri where id = ${seri.id}`;
      expect(kural?.online_baglanti).toBe('https://meet.example/seri');

      const eski = await y.patch(s.k, s.k.token, `/dersler/${d0.id}`, { surum: 1, yer: 'Oda 2' });
      expect(eski.statusCode).toBe(409);
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      const bos = await y.patch(s.k, s.k.token, `/dersler/${d0.id}`, { surum: 2 });
      expect(bos.statusCode).toBe(400);
    });
  });

  describe('iptal', () => {
    it('ogrenci kaynagi yalniz birebir grupta; gec_iptal sunucuda hesaplanir (24 saat)', async () => {
      const grup = await y.kur({ ogrenciSayisi: 2 });
      const red = await y.dersAc(grup);
      const r = await y.post(grup.k, grup.k.token, `/dersler/${red.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
      });
      expect(r.statusCode).toBe(422);
      expect(hataKodu(r)).toBe('iptal_kaynagi_gecersiz');

      const s = await y.kur({ ogrenciSayisi: 1, grupTur: 'birebir' });
      const erken = await y.dersAc(s, { tarih: gunSonra(10) });
      const gec = await y.dersAc(s, { tarih: gunSonra(0), baslangic_saati: '23:30' });
      const erkenSonuc = await y.post(s.k, s.k.token, `/dersler/${erken.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
        iptal_nedeni: 'Hasta',
      });
      expect(erkenSonuc.statusCode, erkenSonuc.body).toBe(200);
      expect(erkenSonuc.json<IslemYaniti>().ders).toMatchObject({
        durum: 'iptal',
        iptal_kaynagi: 'ogrenci',
        iptal_nedeni: 'Hasta',
        gec_iptal: false,
        iptal_eden_id: s.k.uyelikId,
      });
      const gecSonuc = await y.post(s.k, s.k.token, `/dersler/${gec.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
      });
      expect(gecSonuc.json<IslemYaniti>().ders.gec_iptal).toBe(true);
      // Ogretmen kaynakli iptal asla gec_iptal degildir
      const ogr = await y.dersAc(s, { tarih: gunSonra(0), baslangic_saati: '10:00' });
      const ogrSonuc = await y.post(s.k, s.k.token, `/dersler/${ogr.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
      });
      expect(ogrSonuc.json<IslemYaniti>().ders.gec_iptal).toBe(false);

      const tekrar = await y.post(s.k, s.k.token, `/dersler/${erken.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
      });
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('ders_planli_degil');
    });

    it('bu_ve_sonrakiler: istisna korunur, seri bu dersten itibaren biter; ilk dersten iptal seriyi kapatir', async () => {
      const s = await y.kur();
      const { dersler, seri } = await y.seriAc(s, { adet: 5 });
      const [d0, d1, d2, d3, d4] = dersler as [DersJson, DersJson, DersJson, DersJson, DersJson];
      // d2'yi istisna yap
      const tasi = await y.post(s.k, s.k.token, `/dersler/${d2.id}/tasi`, {
        surum: 1,
        yeni_saat: '19:00',
      });
      expect(tasi.statusCode).toBe(200);

      const res = await y.post(s.k, s.k.token, `/dersler/${d1.id}/iptal`, {
        kapsam: 'bu_ve_sonrakiler',
        iptal_kaynagi: 'ogretmen',
        iptal_nedeni: 'Donem sonu',
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<IslemYaniti>().etkilenen_ders_idleri.sort()).toEqual(
        [d1.id, d3.id, d4.id].sort(),
      );
      expect((await y.dersOku(s, d0.id)).durum).toBe('planli');
      expect((await y.dersOku(s, d2.id)).durum).toBe('planli');
      expect((await y.dersOku(s, d4.id)).durum).toBe('iptal');
      const [kural] = await sistem<{ bitis_tarihi: string; adet: number | null; durum: string }[]>`
        select bitis_tarihi::text, adet, durum from ders.ders_serileri where id = ${seri.id}`;
      expect(kural).toEqual({
        bitis_tarihi: tarihEkle(d1.baslangic_at.slice(0, 10), -1),
        adet: null,
        durum: 'bitti', // adet=5 ufuk icinde tamamlandigi icin seri olusurken 'bitti' olmustu
      });

      const ilk = await y.post(s.k, s.k.token, `/dersler/${d0.id}/iptal`, {
        kapsam: 'bu_ve_sonrakiler',
        iptal_kaynagi: 'yonetici',
      });
      expect(ilk.statusCode).toBe(200);
      const [son] = await sistem<
        { durum: string }[]
      >`select durum from ders.ders_serileri where id = ${seri.id}`;
      expect(son?.durum).toBe('iptal');
    });
  });

  describe('katilimcilar', () => {
    it('misafir/telafi eklenir, tekrar 409, gecersiz 404, cikarilir; olay ve denetim yazilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const [misafir] = await y.topluOgrenci(s.k.kurumId, 1, 'Misafir');
      const ders = await y.dersAc(s);
      const ekle = await y.post(s.k, s.k.token, `/dersler/${ders.id}/katilimcilar`, {
        ogrenci_id: misafir,
        tur: 'telafi',
      });
      expect(ekle.statusCode, ekle.body).toBe(201);
      const g = ekle.json<IslemYaniti>();
      expect(g.ders.katilimci_sayisi).toBe(2);
      expect(g.ders.katilimcilar?.find((k) => k.ogrenci_id === misafir)).toMatchObject({
        tur: 'telafi',
        gorunen_ad: 'Misafir 1',
      });
      const tekrar = await y.post(s.k, s.k.token, `/dersler/${ders.id}/katilimcilar`, {
        ogrenci_id: misafir,
      });
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('zaten_katilimci');
      const yok = await y.post(s.k, s.k.token, `/dersler/${ders.id}/katilimcilar`, {
        ogrenci_id: s.hoca.uyelikId, // ogrenci degil
      });
      expect(yok.statusCode).toBe(404);

      const sil = await y.app.inject({
        method: 'DELETE',
        url: y.api(s.k, `/dersler/${ders.id}/katilimcilar/${misafir}`),
        headers: bearer(s.k.token),
      });
      expect(sil.statusCode, sil.body).toBe(200);
      expect(sil.json<IslemYaniti>().ders.katilimci_sayisi).toBe(1);
      const yine = await y.app.inject({
        method: 'DELETE',
        url: y.api(s.k, `/dersler/${ders.id}/katilimcilar/${misafir}`),
        headers: bearer(s.k.token),
      });
      expect(yine.statusCode).toBe(404);

      const olaylar = await sistem<{ payload: { data: { degisim_turu: string } } }[]>`
        select payload from ortak.outbox where kurum_id = ${s.k.kurumId}
          and subject = 'evt.ders.ders.degisti.v1' order by created_at`;
      expect(olaylar.map((o) => o.payload.data.degisim_turu)).toEqual([
        'planlandi',
        'guncellendi',
        'guncellendi',
      ]);
      const denetim = await sistem<{ eylem: string }[]>`
        select eylem from hesap.denetim_kayitlari where kurum_id = ${s.k.kurumId}
          and eylem like 'ders.katilimci%' order by created_at`;
      expect(denetim.map((d) => d.eylem)).toEqual(['ders.katilimci_ekle', 'ders.katilimci_cikar']);
    });
  });

  describe('kapsam ve liste', () => {
    const aralik = (bas = pazartesi(0), bit = pazartesi(10)) =>
      `?baslangic=${bas}T00:00:00Z&bitis=${bit}T00:00:00Z`;

    it('ogretmen baska grubu goremez; ogrenci yalniz katilimcisi oldugu dersi gorur; online_baglanti katilimciya gorunur', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogrenci = await y.davetliUye(s.k, 'ogrenci');
      const diger = await y.davetliUye(s.k, 'ogrenci');
      await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId]);
      const g2 = await y.grupAc(s.k, 'grup', 'Grup B');
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, g2.id, hoca2.uyelikId);
      await y.gruba(s.k, g2.id, [diger.uyelikId]);

      const d1 = await y.dersAc(s, { online_baglanti: 'https://meet.example/g1' });
      const d2 = (
        await y.post(s.k, s.k.token, '/dersler', {
          grup_id: g2.id,
          ogretmen_id: hoca2.uyelikId,
          tarih: pazartesi(1),
          baslangic_saati: '10:00',
          sure_dk: 60,
        })
      ).json<{ ders: DersJson }>().ders;

      // Ogretmen 2 grup 1'i goremez
      const l2 = await y.get(s.k, hoca2.token, `/dersler${aralik()}`);
      expect(l2.json<{ dersler: DersJson[] }>().dersler.map((d) => d.id)).toEqual([d2.id]);
      expect((await y.get(s.k, hoca2.token, `/dersler/${d1.id}`)).statusCode).toBe(404);
      const yasak = await y.post(
        s.k,
        hoca2.token,
        '/dersler',
        y.dersGovdesi(s.grup.id, { brans_kodu: 'fizik' }),
      );
      expect(yasak.statusCode).toBe(404);
      expect(
        (await y.patch(s.k, hoca2.token, `/dersler/${d1.id}`, { surum: 1, yer: 'x' })).statusCode,
      ).toBe(404);

      // Ogrenci: yalniz kendi dersi; kapsam disi 404; yazma 403
      const lo = await y.get(s.k, ogrenci.token, `/dersler${aralik()}`);
      expect(lo.json<{ dersler: DersJson[] }>().dersler.map((d) => d.id)).toEqual([d1.id]);
      const det = await y.get(s.k, ogrenci.token, `/dersler/${d1.id}`);
      expect(det.statusCode).toBe(200);
      const detay = det.json<DersJson>();
      expect(detay.online_baglanti).toBe('https://meet.example/g1');
      expect(detay.katilimcilar?.map((k) => k.ogrenci_id)).toEqual([ogrenci.uyelikId]);
      expect((await y.get(s.k, ogrenci.token, `/dersler/${d2.id}`)).statusCode).toBe(404);
      expect(
        (await y.post(s.k, ogrenci.token, '/dersler', y.dersGovdesi(s.grup.id))).statusCode,
      ).toBe(403);
      expect(
        (await y.post(s.k, ogrenci.token, `/dersler/${d1.id}/iptal`, { iptal_kaynagi: 'ogrenci' }))
          .statusCode,
      ).toBe(403);

      // Yonetici hepsini gorur; filtreler
      const hepsi = await y.get(s.k, s.k.token, `/dersler${aralik()}`);
      expect(hepsi.json<{ dersler: DersJson[] }>().dersler).toHaveLength(2);
      const ogrFiltre = await y.get(
        s.k,
        s.k.token,
        `/dersler${aralik()}&ogrenci_id=${diger.uyelikId}`,
      );
      expect(ogrFiltre.json<{ dersler: DersJson[] }>().dersler.map((d) => d.id)).toEqual([d2.id]);
      const grupFiltre = await y.get(s.k, s.k.token, `/dersler${aralik()}&grup_id=${s.grup.id}`);
      expect(grupFiltre.json<{ dersler: DersJson[] }>().dersler.map((d) => d.id)).toEqual([d1.id]);
      const ogrtFiltre = await y.get(
        s.k,
        s.k.token,
        `/dersler${aralik()}&ogretmen_id=${hoca2.uyelikId}`,
      );
      expect(ogrtFiltre.json<{ dersler: DersJson[] }>().dersler.map((d) => d.id)).toEqual([d2.id]);
    });

    it('liste: anahtar tabanli sayfalama, aralik zorunlu ve en cok 100 gun, kapsam disi kurum 403', async () => {
      const s = await y.kur();
      const idler: string[] = [];
      for (let i = 0; i < 5; i++) {
        idler.push((await y.dersAc(s, { tarih: tarihEkle(pazartesi(1), i) })).id);
      }
      const sayfalar: string[][] = [];
      let imlec: string | null = null;
      do {
        const res: Awaited<ReturnType<typeof y.get>> = await y.get(
          s.k,
          s.k.token,
          `/dersler${aralik()}&limit=2${imlec ? `&imlec=${imlec}` : ''}`,
        );
        expect(res.statusCode).toBe(200);
        const j = res.json<{ dersler: DersJson[]; sonraki_imlec: string | null }>();
        sayfalar.push(j.dersler.map((d) => d.id));
        imlec = j.sonraki_imlec;
      } while (imlec);
      expect(sayfalar.map((p) => p.length)).toEqual([2, 2, 1]);
      expect(sayfalar.flat()).toEqual(idler);

      expect((await y.get(s.k, s.k.token, '/dersler')).statusCode).toBe(400);
      const uzun = await y.get(s.k, s.k.token, `/dersler${aralik('2026-01-01', '2026-06-01')}`);
      expect(uzun.statusCode).toBe(400);
      const bozukImlec = await y.get(s.k, s.k.token, `/dersler${aralik()}&imlec=bozuk`);
      expect(bozukImlec.statusCode).toBe(400);

      const baska = await y.kur();
      const yasak = await y.app.inject({
        url: `/v1/ders/kurumlar/${baska.k.kurumId}/dersler${aralik()}`,
        headers: bearer(s.k.token),
      });
      expect(yasak.statusCode).toBe(403);
    });

    it('takvim modulu kapaliyken uclar 403 modul_kapali', async () => {
      const s = await y.kur();
      const ders = await y.dersAc(s);
      const kapat = await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'takvim', kapsam: 'kurum', acik: false },
      });
      expect(kapat.statusCode, kapat.body).toBe(200);
      for (const res of [
        await y.get(s.k, s.k.token, `/dersler${aralik()}`),
        await y.get(s.k, s.k.token, `/dersler/${ders.id}`),
        await y.post(
          s.k,
          s.k.token,
          '/dersler',
          y.dersGovdesi(s.grup.id, { ogretmen_id: s.hoca.uyelikId }),
        ),
        await y.post(s.k, s.hoca.token, `/dersler/${ders.id}/iptal`, { iptal_kaynagi: 'ogretmen' }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(hataKodu(res)).toBe('modul_kapali');
      }
    });
  });

  it('yardimci: BUGUN gecerli bir tarih', () => {
    expect(BUGUN).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

export type { Kurulum };
