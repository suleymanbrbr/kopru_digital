import { randomBytes } from 'node:crypto';

import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kaynakSuresiniDoldur } from './sistem/ders-kaynak-sure-sonu.js';
import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { kaynakYardimcilari } from './test/kaynak-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface KaynakJson {
  id: string;
  tur: string;
  ders_id: string | null;
  grup_id: string;
  baslik: string;
  saglayici: string;
  url: string;
  parola_var: boolean;
  parola?: string | null;
  durum: string;
  gorunurluk: string;
  ekleyen_id: string;
  izleyen_sayisi: number;
  acik_sorun_sayisi: number;
  ogrenci_idleri: string[] | null;
  konu_id: string | null;
  brans_kodu: string | null;
}
interface KayitJson extends KaynakJson {
  izlendi: boolean;
  izledi_at: string | null;
  bozuk: boolean;
  acik_sorun_var?: boolean;
  ders_baslangic_at: string | null;
  ogretmen_id: string | null;
}
interface KayitlarimYaniti {
  kayitlar: KayitJson[];
  sonraki_imlec: string | null;
}

const ANAHTAR = randomBytes(32).toString('base64');

describe.skipIf(dbYok())('ders kayitlari ve materyaller API', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let appDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;
  let k: ReturnType<typeof kaynakYardimcilari>;
  const eskiAnahtar = process.env.API_KAYNAK_PAROLA_ANAHTARI;

  beforeAll(() => {
    if (!urls) return;
    process.env.API_KAYNAK_PAROLA_ANAHTARI = ANAHTAR;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    appDb = createDb({ url: urls.sistemUrl, max: 2 });
    y = dersYardimcilari({ t, sistem });
    k = kaynakYardimcilari(y, sistem);
  });
  afterAll(async () => {
    if (eskiAnahtar === undefined) delete process.env.API_KAYNAK_PAROLA_ANAHTARI;
    else process.env.API_KAYNAK_PAROLA_ANAHTARI = eskiAnahtar;
    await t.service.stop();
    await sistem.end();
    await appDb.close();
  });

  const ilk = (liste: Uye[]): Uye => {
    const x = liste[0];
    if (!x) throw new Error('kurulumda ogrenci yok');
    return x;
  };
  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;
  const link = (ek: Record<string, unknown> = {}) => ({
    baslik: 'Kayıt 1',
    url: 'https://zoom.us/rec/share/abc',
    ...ek,
  });
  const dersKaynagi = (s: Kurulum, dersId: string, token: string, govde: unknown) =>
    y.post(s.k, token, `/dersler/${dersId}/kaynaklar`, govde);
  const materyal = (s: Kurulum, grupId: string, token: string, govde: unknown) =>
    y.post(s.k, token, `/gruplar/${grupId}/materyaller`, govde);
  const kayitlarim = (s: Kurulum, token: string, q = '') => y.get(s.k, token, `/kayitlarim${q}`);
  const kayitlarimOku = async (s: Kurulum, token: string, q = '') => {
    const res = await kayitlarim(s, token, q);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<KayitlarimYaniti>();
  };
  const ekle = async (
    s: Kurulum,
    dersId: string,
    token: string,
    linkler: unknown[],
    ek: Record<string, unknown> = {},
  ) => {
    const res = await dersKaynagi(s, dersId, token, { linkler, ...ek });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ kaynaklar: KaynakJson[] }>().kaynaklar;
  };

  /** Giris yapan `n` ogrenci + hoca + ders (ders acilmadan once ogrenciler gruba eklenir). */
  async function kurulum(n = 1) {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const ogrenciler: Uye[] = [];
    for (let i = 0; i < n; i++) ogrenciler.push(await k.ogrenciEkle(s));
    const ders = await y.dersAc(s);
    return { s, o: ogrenciler, ders };
  }
  const ogrenciGorur = async (s: Kurulum, o: Uye, id: string) =>
    (await kayitlarimOku(s, o.token, '?limit=100')).kayitlar.some((x) => x.id === id);

  describe('ekleme', () => {
    it('ogretmen tek istekte birden cok link ekler: saglayici taninir, parola sifreli saklanir, olay kaynak basina bir kez', async () => {
      const { s, o, ders } = await kurulum(2);
      const kaynaklar = await ekle(
        s,
        ders.id,
        s.hoca.token,
        [
          link({ baslik: 'Zoom kaydı', parola: 'Gizli#Parola1' }),
          link({ baslik: 'Drive', url: 'https://drive.google.com/file/d/1/view' }),
          link({ baslik: 'YouTube', url: 'https://youtu.be/abc' }),
          link({ baslik: 'OneDrive', url: 'https://1drv.ms/v/s!abc' }),
          link({ baslik: 'Diğer', url: 'https://evilzoom.us/rec/x' }),
        ],
        { gorunurluk: 'grup' },
      );
      expect(kaynaklar.map((x) => x.saglayici)).toEqual([
        'zoom',
        'drive',
        'youtube',
        'onedrive',
        'diger',
      ]);
      expect(kaynaklar.every((x) => x.tur === 'kayit' && x.durum === 'aktif')).toBe(true);
      expect(kaynaklar[0]?.parola).toBe('Gizli#Parola1');
      expect(kaynaklar[0]?.parola_var).toBe(true);
      expect(kaynaklar[1]?.parola_var).toBe(false);
      expect(kaynaklar[0]?.brans_kodu).toBe('matematik');

      const [satir] = await sistem<{ parola_sifreli: Buffer }[]>`
        select parola_sifreli from ders.ders_kaynaklari where id = ${kaynaklar[0]?.id ?? ''}`;
      expect(satir?.parola_sifreli.length).toBeGreaterThan(28);
      expect(satir?.parola_sifreli.toString('latin1')).not.toContain('Gizli');

      const olaylar = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.eklendi.v1');
      expect(olaylar).toHaveLength(5);
      const ilk = olaylar[0]?.payload.data;
      expect(ilk).toMatchObject({
        kaynak_id: kaynaklar[0]?.id,
        tur: 'kayit',
        ders_id: ders.id,
        gorunurluk: 'grup',
        ekleyen_id: s.hoca.uyelikId,
        brans_kodu: 'matematik',
        parca_no: 1,
        parca_sayisi: 1,
      });
      expect((ilk?.ogrenci_idleri as string[]).sort()).toEqual(o.map((x) => x.uyelikId).sort());
      const yuk = JSON.stringify(olaylar.map((e) => e.payload));
      for (const yasak of [
        'Gizli#Parola1',
        'zoom.us',
        'Zoom kaydı',
        '"baslik"',
        '"url"',
        '"parola"',
      ]) {
        expect(yuk).not.toContain(yasak);
      }
    });

    it('ogrenci_idleri 200 luk parcalara bolunur (250 katilimci -> 2 parca) ve gorunurluk ogretmen ise olay yok', async () => {
      const s = await y.kur({ ogrenciSayisi: 250 });
      const ders = await y.dersAc(s);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const olaylar = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.eklendi.v1');
      expect(olaylar).toHaveLength(2);
      const boyutlar = olaylar.map((e) => (e.payload.data.ogrenci_idleri as string[]).length);
      expect(boyutlar).toEqual([200, 50]);
      expect(olaylar.map((e) => e.payload.data.parca_sayisi)).toEqual([2, 2]);
      expect(olaylar.map((e) => e.payload.data.parca_no)).toEqual([1, 2]);
      expect(new Set(olaylar.map((e) => e.payload.data.kaynak_id))).toEqual(new Set([kaynak?.id]));

      await ekle(s, ders.id, s.hoca.token, [link()], { gorunurluk: 'ogretmen' });
      expect(await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.eklendi.v1')).toHaveLength(2);
    });

    it('url dogrulama: http, ftp, bosluk, 2001 karakter, kullanici bilgisi 422 kaynak_url_gecersiz; hicbir satir yazilmaz', async () => {
      const { s, ders } = await kurulum(0);
      for (const url of [
        'http://zoom.us/rec/x',
        'ftp://zoom.us/x',
        'zoom.us/rec/x',
        'https://zoom.us@evil.com/x',
        `https://ornek.com/${'a'.repeat(1990)}`.padEnd(2001, 'a'),
      ]) {
        const res = await dersKaynagi(s, ders.id, s.hoca.token, {
          linkler: [link(), link({ url })],
        });
        // 2001 karakter sinirini sema yakalar (400), digerleri sunucu dogrulamasi (422)
        expect([400, 422], url.slice(0, 40)).toContain(res.statusCode);
        if (res.statusCode === 422) expect(hataKodu(res)).toBe('kaynak_url_gecersiz');
      }
      const [n] = await sistem<{ n: number }[]>`
        select count(*)::int n from ders.ders_kaynaklari where ders_id = ${ders.id}`;
      expect(n?.n).toBe(0);
    });

    it('gecmis tarihli son erisim 422; bos liste, 21 link ve baslik olmadan 400', async () => {
      const { s, ders } = await kurulum(0);
      const gecmis = await dersKaynagi(s, ders.id, s.hoca.token, {
        linkler: [link({ gecerlilik_bitis_at: '2020-01-01T00:00:00Z' })],
      });
      expect(gecmis.statusCode).toBe(422);
      expect(hataKodu(gecmis)).toBe('kaynak_suresi_gecmis');
      for (const linkler of [
        [],
        Array.from({ length: 21 }, () => link()),
        [{ url: 'https://a.com' }],
      ]) {
        expect((await dersKaynagi(s, ders.id, s.hoca.token, { linkler })).statusCode).toBe(400);
      }
    });

    it('secili_ogrenciler: alicilar dersin katilimcisi olmali (422), liste zorunlu (400)', async () => {
      const { s, o, ders } = await kurulum(2);
      const yabanci = await y.topluOgrenci(s.k.kurumId, 1);
      const kotu = await dersKaynagi(s, ders.id, s.hoca.token, {
        linkler: [link()],
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o[0]?.uyelikId, yabanci[0]],
      });
      expect(kotu.statusCode).toBe(422);
      expect(hataKodu(kotu)).toBe('kaynak_alici_gecersiz');
      const eksik = await dersKaynagi(s, ders.id, s.hoca.token, {
        linkler: [link()],
        gorunurluk: 'secili_ogrenciler',
      });
      expect(eksik.statusCode).toBe(400);
      const fazla = await dersKaynagi(s, ders.id, s.hoca.token, {
        linkler: [link()],
        gorunurluk: 'grup',
        ogrenci_idleri: [o[0]?.uyelikId],
      });
      expect(fazla.statusCode).toBe(400);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()], {
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o[0]?.uyelikId],
      });
      expect(kaynak?.ogrenci_idleri).toEqual([o[0]?.uyelikId]);
      const olay = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.eklendi.v1');
      expect(olay[0]?.payload.data.ogrenci_idleri).toEqual([o[0]?.uyelikId]);
    });

    it('iptal derse 409 kaynak_ders_iptal', async () => {
      const { s, ders } = await kurulum(0);
      await sistem`update ders.dersler set durum = 'iptal', iptal_at = now(), iptal_kaynagi = 'ogretmen' where id = ${ders.id}`;
      const res = await dersKaynagi(s, ders.id, s.hoca.token, { linkler: [link()] });
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('kaynak_ders_iptal');
    });

    it('sifreleme anahtari yoksa api calisir, parolasiz ekleme olur, parolali ekleme 503 anlasilir hata verir', async () => {
      const { s, ders } = await kurulum(0);
      delete process.env.API_KAYNAK_PAROLA_ANAHTARI;
      try {
        expect(
          (await dersKaynagi(s, ders.id, s.hoca.token, { linkler: [link()] })).statusCode,
        ).toBe(201);
        const res = await dersKaynagi(s, ders.id, s.hoca.token, {
          linkler: [link({ parola: 'x' })],
        });
        expect(res.statusCode).toBe(503);
        expect(hataKodu(res)).toBe('kaynak_sifreleme_yapilandirilmamis');
      } finally {
        process.env.API_KAYNAK_PAROLA_ANAHTARI = ANAHTAR;
      }
    });
  });

  describe('yetki ve kapsam', () => {
    it('ogretmen atanmadigi grubun dersine ve grubuna yazamaz (404); ayni gruptaki baska ogretmenin dersine 403', async () => {
      const { s, ders } = await kurulum(1);
      const baskaHoca = await y.davetliUye(s.k, 'ogretmen'); // hicbir gruba atanmamis
      const yabanciDers = await dersKaynagi(s, ders.id, baskaHoca.token, { linkler: [link()] });
      expect(yabanciDers.statusCode).toBe(404);
      const yabanciGrup = await materyal(s, s.grup.id, baskaHoca.token, { linkler: [link()] });
      expect(yabanciGrup.statusCode).toBe(404);

      // Ayni gruba atanmis ikinci ogretmen: dersi baskasinin oldugu icin 403, gruba materyal serbest.
      const ikinci = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, ikinci.uyelikId, 'fizik');
      const baskasininDersi = await dersKaynagi(s, ders.id, ikinci.token, { linkler: [link()] });
      expect(baskasininDersi.statusCode).toBe(403);
      expect((await materyal(s, s.grup.id, ikinci.token, { linkler: [link()] })).statusCode).toBe(
        201,
      );

      // Ogrenci ve baska kurum
      const [o] = await Promise.all([k.ogrenciEkle(s)]);
      expect((await dersKaynagi(s, ders.id, o.token, { linkler: [link()] })).statusCode).toBe(403);
      const yabanci = await y.kurumluKullanici();
      const kurumDisi = await y.app.inject({
        method: 'POST',
        url: y.api(s.k, `/dersler/${ders.id}/kaynaklar`),
        headers: bearer(yabanci.token),
        payload: { linkler: [link()] },
      });
      expect(kurumDisi.statusCode).toBe(403);
      expect(
        (
          await y.post(yabanci, yabanci.token, `/dersler/${ders.id}/kaynaklar`, {
            linkler: [link()],
          })
        ).statusCode,
      ).toBe(404);
    });

    it('ogretmen baska ogretmenin kaynagini duzenleyemez/silemez ama atandigi grubun kaynagini yonetebilir; kapsam disi 404', async () => {
      const { s, ders } = await kurulum(1);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      const disaridaki = await y.davetliUye(s.k, 'ogretmen');
      const duzenle = await y.patch(s.k, disaridaki.token, `/kaynaklar/${id}`, { baslik: 'x' });
      expect(duzenle.statusCode).toBe(404);
      expect(
        (
          await y.app.inject({
            method: 'DELETE',
            url: y.api(s.k, `/kaynaklar/${id}`),
            headers: bearer(disaridaki.token),
          })
        ).statusCode,
      ).toBe(404);
      expect((await y.get(s.k, disaridaki.token, `/kaynaklar/${id}`)).statusCode).toBe(404);

      const atanmis = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, atanmis.uyelikId, 'fizik');
      const duzenlendi = await y.patch(s.k, atanmis.token, `/kaynaklar/${id}`, {
        baslik: 'Fizik ekledi',
      });
      expect(duzenlendi.statusCode, duzenlendi.body).toBe(200);
      expect(duzenlendi.json<KaynakJson>().baslik).toBe('Fizik ekledi');
      const yonetici = await y.patch(s.k, s.k.token, `/kaynaklar/${id}`, { baslik: 'Sahip' });
      expect(yonetici.statusCode).toBe(200);
    });

    it('kayitlar modulu kurumda kapaliyken tum uclar 403 modul_kapali; grup duzeyinde kapaliyken yazma 403, ogrenciden gizlenir', async () => {
      const { s, o, ders } = await kurulum(1);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const ogrenci = ilk(o);
      expect(await ogrenciGorur(s, ogrenci, kaynak?.id ?? '')).toBe(true);

      await k.modulKapat(s, 'kayitlar', 'grup');
      expect(await ogrenciGorur(s, ogrenci, kaynak?.id ?? '')).toBe(false);
      expect((await y.get(s.k, ogrenci.token, `/kayitlarim/${kaynak?.id ?? ''}`)).statusCode).toBe(
        404,
      );
      const yazma = await dersKaynagi(s, ders.id, s.hoca.token, { linkler: [link()] });
      expect(yazma.statusCode).toBe(403);
      expect(hataKodu(yazma)).toBe('modul_kapali');
      expect(
        (await y.patch(s.k, s.hoca.token, `/kaynaklar/${kaynak?.id ?? ''}`, { baslik: 'x' }))
          .statusCode,
      ).toBe(403);

      const s2 = await kurulum(1);
      const [k2] = await ekle(s2.s, s2.ders.id, s2.s.hoca.token, [link()]);
      await k.modulKapat(s2.s, 'kayitlar');
      for (const res of [
        await kayitlarim(s2.s, s2.o[0]?.token ?? ''),
        await y.get(s2.s.k, s2.o[0]?.token ?? '', `/kayitlarim/${k2?.id ?? ''}`),
        await y.get(s2.s.k, s2.s.hoca.token, '/kaynaklar'),
        await dersKaynagi(s2.s, s2.ders.id, s2.s.hoca.token, { linkler: [link()] }),
        await y.post(s2.s.k, s2.o[0]?.token ?? '', `/kayitlarim/${k2?.id ?? ''}/izledim`, {}),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(hataKodu(res)).toBe('modul_kapali');
      }
    });
  });

  describe('gorunurluk kurallari (ogrenci)', () => {
    it('grup: dersin katilimcisi (gelmedi olsa da) gorur; katilimci olmayan grup uyesi, baska grup ve baska kurum gormez', async () => {
      const { s, o, ders } = await kurulum(2);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link({ parola: 'p1' })]);
      const id = kaynak?.id ?? '';
      const [o1, o2] = o as [Uye, Uye];
      // yoklama: biri gelmedi -> yine de gorur (telafi izlemek icin)
      await k.dersZamanla(ders.id, 60);
      await y.yoklamaPut(s.k, s.hoca.token, ders.id, [
        y.yoklamaSatiri(o1.uyelikId, 'geldi'),
        y.yoklamaSatiri(o2.uyelikId, 'gelmedi'),
      ]);
      expect(await ogrenciGorur(s, o1, id)).toBe(true);
      expect(await ogrenciGorur(s, o2, id)).toBe(true);

      // Sonradan gruba katilan ogrenci dersin katilimcisi degildir: derse bagli kaydi gormez.
      const gec = await k.ogrenciEkle(s);
      await sistem`delete from ders.ders_katilimcilari where ders_id = ${ders.id} and ogrenci_id = ${gec.uyelikId}`;
      expect(await ogrenciGorur(s, gec, id)).toBe(false);
      expect((await y.get(s.k, gec.token, `/kayitlarim/${id}`)).statusCode).toBe(404);

      // Baska grup ayni kurumda
      const grup2 = await y.grupAc(s.k, 'grup', 'Grup B');
      const g2 = await y.davetliUye(s.k, 'ogrenci');
      await y.gruba(s.k, grup2.id, [g2.uyelikId]);
      expect(await ogrenciGorur(s, g2, id)).toBe(false);
      // Baska kurum
      const baska = await kurulum(1);
      const yabanci = ilk(baska.o);
      expect(await ogrenciGorur(baska.s, yabanci, id)).toBe(false);
      expect((await y.get(baska.s.k, yabanci.token, `/kayitlarim/${id}`)).statusCode).toBe(404);
    });

    it('secili_ogrenciler yalniz alicilara; ogretmen gorunurlugu hic ogrenciye; gizli, silinmis ve suresi dolmus gorunmez; bozuk uyariyla gorunur', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [secili] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Seçili' })], {
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o1.uyelikId],
      });
      const [ozel] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Özel' })], {
        gorunurluk: 'ogretmen',
      });
      const [gizli] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Gizli' })]);
      const [silinen] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Silinen' })]);
      const [dolmus] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Dolmuş' })]);
      const [bozuk] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Bozuk' })]);
      const [acik] = await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'Açık' })]);

      expect(
        (await y.patch(s.k, s.hoca.token, `/kaynaklar/${gizli?.id ?? ''}`, { durum: 'gizli' }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await y.app.inject({
            method: 'DELETE',
            url: y.api(s.k, `/kaynaklar/${silinen?.id ?? ''}`),
            headers: bearer(s.hoca.token),
          })
        ).statusCode,
      ).toBe(200);
      // Sure dolumu okumada hemen filtrelenir (is calismasa bile): durum hala `aktif`.
      await sistem`update ders.ders_kaynaklari set gecerlilik_bitis_at = now() - interval '1 minute' where id = ${dolmus?.id ?? ''}`;
      expect(
        (
          await y.post(s.k, o2.token, `/kayitlarim/${bozuk?.id ?? ''}/sorunlar`, {
            neden: 'acilmiyor',
          })
        ).statusCode,
      ).toBe(201);

      const g1 = (await kayitlarimOku(s, o1.token, '?limit=100')).kayitlar;
      const g2 = (await kayitlarimOku(s, o2.token, '?limit=100')).kayitlar;
      expect(g1.map((x) => x.baslik).sort()).toEqual(['Açık', 'Bozuk', 'Seçili']);
      expect(g2.map((x) => x.baslik).sort()).toEqual(['Açık', 'Bozuk']);
      expect(g1.find((x) => x.baslik === 'Bozuk')).toMatchObject({ bozuk: true, durum: 'bozuk' });
      expect(g1.find((x) => x.baslik === 'Açık')?.bozuk).toBe(false);
      for (const gorunmeyen of [ozel, gizli, silinen, dolmus]) {
        expect((await y.get(s.k, o1.token, `/kayitlarim/${gorunmeyen?.id ?? ''}`)).statusCode).toBe(
          404,
        );
      }
      expect((await y.get(s.k, o2.token, `/kayitlarim/${secili?.id ?? ''}`)).statusCode).toBe(404);
      expect(acik?.id).toBeTruthy();
    });

    it('materyal: gruba bagli, derssiz; grubun etkin uyesi gorur, gruptan ayrilan ya da baska gruptaki gormez', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const uye = await k.ogrenciEkle(s);
      const [m] = await (async () => {
        const res = await materyal(s, s.grup.id, s.hoca.token, {
          linkler: [link({ baslik: 'Konu anlatımı', url: 'https://ornek.com/konu.pdf' })],
        });
        expect(res.statusCode, res.body).toBe(201);
        return res.json<{ kaynaklar: KaynakJson[] }>().kaynaklar;
      })();
      expect(m).toMatchObject({
        tur: 'materyal',
        ders_id: null,
        saglayici: 'diger',
        brans_kodu: null,
      });
      const j = await kayitlarimOku(s, uye.token);
      expect(j.kayitlar).toHaveLength(1);
      expect(j.kayitlar[0]).toMatchObject({ tur: 'materyal', ders_baslangic_at: null });
      // Olay: grubun etkin uyeleri
      const olay = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.eklendi.v1');
      expect(olay[0]?.payload.data).toMatchObject({
        tur: 'materyal',
        ders_id: null,
        ogrenci_idleri: [uye.uyelikId],
      });

      await sistem`update hesap.grup_uyeleri set bitis_tarihi = current_date where ogrenci_id = ${uye.uyelikId}`;
      expect((await kayitlarimOku(s, uye.token)).kayitlar).toHaveLength(0);
    });

    it('parola yalniz gorebilen ogrenciye ve yetkili personele; listede hic donmez; baskasi gorunurluk disindan okuyamaz', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link({ parola: 'Zoom-Pw-9' })], {
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o1.uyelikId],
      });
      const id = kaynak?.id ?? '';
      const tekil = await y.get(s.k, o1.token, `/kayitlarim/${id}`);
      expect(tekil.json<KayitJson>().parola).toBe('Zoom-Pw-9');
      const liste = await kayitlarim(s, o1.token);
      expect(liste.body).not.toContain('Zoom-Pw-9');
      expect(liste.json<KayitlarimYaniti>().kayitlar[0]?.parola_var).toBe(true);
      // Alici olmayan ogrenci: 404, govdede parola yok
      const yasak = await y.get(s.k, o2.token, `/kayitlarim/${id}`);
      expect(yasak.statusCode).toBe(404);
      expect(yasak.body).not.toContain('Zoom-Pw-9');
      // Personel: ekleyen, sahip duz metin; liste degil
      expect((await y.get(s.k, s.hoca.token, `/kaynaklar/${id}`)).json<KaynakJson>().parola).toBe(
        'Zoom-Pw-9',
      );
      expect((await y.get(s.k, s.k.token, `/kaynaklar/${id}`)).json<KaynakJson>().parola).toBe(
        'Zoom-Pw-9',
      );
      const personelListe = await y.get(s.k, s.hoca.token, '/kaynaklar');
      expect(personelListe.body).not.toContain('Zoom-Pw-9');
      // Ogrenci personel ucuna giremez
      expect((await y.get(s.k, o1.token, `/kaynaklar/${id}`)).statusCode).toBe(403);
      expect((await y.get(s.k, o1.token, '/kaynaklar')).statusCode).toBe(403);
      // Personel ogrenci ucuna giremez
      expect((await kayitlarim(s, s.hoca.token)).statusCode).toBe(403);
    });
  });

  describe('Kayitlarim listesi', () => {
    it('izlenmemisler once, sonra yeni->eski; imlecli sayfalama tum satirlari tam bir kez dondurur; suzgecler', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await k.ogrenciEkle(s);
      const ders1 = await y.dersAc(s);
      await k.dersZamanla(ders1.id, 10 * 24 * 60); // 10 gun once
      const ders2 = await y.dersAc(s); // >= 2 hafta sonra
      const konu = uuidv7();
      const kayit: KaynakJson[] = [];
      // Ayni istekte (ayni created_at) 3 link + ayri isteklerde 4 link
      kayit.push(
        ...(await ekle(s, ders1.id, s.hoca.token, [
          link({ baslik: 'A1' }),
          link({ baslik: 'A2' }),
          link({ baslik: 'A3', konu_id: konu }),
        ])),
      );
      for (const b of ['B1', 'B2', 'B3', 'B4']) {
        kayit.push(...(await ekle(s, ders2.id, s.hoca.token, [link({ baslik: b })])));
      }
      const [mat] = await (async () => {
        const res = await materyal(s, s.grup.id, s.hoca.token, {
          linkler: [link({ baslik: 'M1', url: 'https://ornek.com/a' })],
        });
        return res.json<{ kaynaklar: KaynakJson[] }>().kaynaklar;
      })();

      // B2 ve A1 izlendi -> sona gider
      const izle = (id: string) => y.post(s.k, o.token, `/kayitlarim/${id}/izledim`, {});
      expect((await izle(kayit[4]?.id ?? '')).statusCode).toBe(200);
      expect((await izle(kayit[0]?.id ?? '')).statusCode).toBe(200);

      const hepsi = await kayitlarimOku(s, o.token, '?limit=100');
      expect(hepsi.kayitlar).toHaveLength(8);
      expect(hepsi.kayitlar.map((x) => x.izlendi)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
      ]);
      // Izlenmemisler: en yeni once (M1, B4, B3, B1, A3, A2)
      expect(hepsi.kayitlar.slice(0, 6).map((x) => x.baslik)).toEqual([
        'M1',
        'B4',
        'B3',
        'B1',
        'A3',
        'A2',
      ]);
      expect(hepsi.kayitlar.slice(6).map((x) => x.baslik)).toEqual(['B2', 'A1']);

      // Sayfalama: limit 3 -> tum satirlar, tekrarsiz, ayni sirada
      const toplanan: string[] = [];
      let imlec: string | null = null;
      let sayfaSayisi = 0;
      do {
        const sayfa: KayitlarimYaniti = await kayitlarimOku(
          s,
          o.token,
          `?limit=3${imlec ? `&imlec=${imlec}` : ''}`,
        );
        toplanan.push(...sayfa.kayitlar.map((x) => x.id));
        imlec = sayfa.sonraki_imlec;
        sayfaSayisi++;
      } while (imlec && sayfaSayisi < 10);
      expect(sayfaSayisi).toBe(3);
      expect(toplanan).toEqual(hepsi.kayitlar.map((x) => x.id));

      // Suzgecler
      const f = async (q: string) =>
        (await kayitlarimOku(s, o.token, `?limit=100&${q}`)).kayitlar.map((x) => x.baslik).sort();
      expect(await f('tur=materyal')).toEqual(['M1']);
      expect(await f(`ders_id=${ders1.id}`)).toEqual(['A1', 'A2', 'A3']);
      expect(await f(`konu_id=${konu}`)).toEqual(['A3']);
      expect(await f('brans_kodu=matematik')).toHaveLength(7); // materyal dersle iliskisiz
      expect(await f('brans_kodu=fizik')).toEqual([]);
      expect(await f(`grup_id=${s.grup.id}`)).toHaveLength(8);
      expect(await f(`grup_id=${uuidv7()}`)).toEqual([]);
      // Tarih araligi: ders1 10 gun once, ders2 en az 2 hafta sonra, materyal simdi eklendi
      const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
      expect(await f(`baslangic=${gun(-5)}&bitis=${gun(1)}`)).toEqual(['M1']);
      expect(await f(`baslangic=${gun(-12)}&bitis=${gun(-8)}`)).toEqual(['A1', 'A2', 'A3']);
      expect(await f(`baslangic=${gun(-12)}&bitis=${gun(-8)}&tur=materyal`)).toEqual([]);
      expect(await f('baslangic=2099-01-01')).toEqual([]);
      expect(
        (await kayitlarim(s, o.token, '?baslangic=2026-02-01&bitis=2026-01-01')).statusCode,
      ).toBe(400);
      expect((await kayitlarim(s, o.token, '?imlec=bozuk')).statusCode).toBe(400);
      expect(mat?.id).toBeTruthy();
    });

    it('her satirda ders tarihi, brans, ogretmen kimligi, konu, izlendi ve bozuk bilgisi var', async () => {
      const { s, o, ders } = await kurulum(1);
      const konu = uuidv7();
      await ekle(s, ders.id, s.hoca.token, [link({ konu_id: konu })]);
      const [satir] = (await kayitlarimOku(s, o[0]?.token ?? '')).kayitlar;
      expect(satir).toMatchObject({
        ders_id: ders.id,
        brans_kodu: 'matematik',
        ogretmen_id: s.hoca.uyelikId,
        konu_id: konu,
        izlendi: false,
        bozuk: false,
        grup_id: s.grup.id,
        saglayici: 'zoom',
        tur: 'kayit',
      });
      expect(new Date(satir?.ders_baslangic_at ?? '').getTime()).toBe(
        new Date(ders.baslangic_at).getTime(),
      );
    });

    it('260 kayitli ogrenci + 3000 baskasinin kaydi: liste hizli, indeksler kullanilir (EXPLAIN)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await k.ogrenciEkle(s);
      const diger = await y.kur({ ogrenciSayisi: 0 });
      await sistem`
        insert into ders.ders_kaynaklari (id, kurum_id, tur, grup_id, baslik, saglayici, url, ekleyen_id, created_at)
        select gen_random_uuid(), ${s.k.kurumId}, 'materyal', ${s.grup.id}, 'M' || n, 'diger', 'https://ornek.com/' || n,
               ${s.hoca.uyelikId}, now() - make_interval(secs => n)
        from generate_series(1, 260) n`;
      await sistem`
        insert into ders.ders_kaynaklari (id, kurum_id, tur, grup_id, baslik, saglayici, url, ekleyen_id, created_at)
        select gen_random_uuid(), ${diger.k.kurumId}, 'materyal', ${diger.grup.id}, 'D' || n, 'diger', 'https://ornek.com/' || n,
               ${diger.hoca.uyelikId}, now() - make_interval(secs => n)
        from generate_series(1, 3000) n`;
      await sistem`analyze ders.ders_kaynaklari`;

      const bas = performance.now();
      const ilk = await kayitlarimOku(s, o.token, '?limit=100');
      const sure = performance.now() - bas;
      expect(ilk.kayitlar).toHaveLength(100);
      expect(ilk.sonraki_imlec).not.toBeNull();
      expect(sure).toBeLessThan(500);
      const tumu: string[] = [];
      let imlec: string | null = null;
      do {
        const sayfa: KayitlarimYaniti = await kayitlarimOku(
          s,
          o.token,
          `?limit=100${imlec ? `&imlec=${imlec}` : ''}`,
        );
        tumu.push(...sayfa.kayitlar.map((x) => x.id));
        imlec = sayfa.sonraki_imlec;
      } while (imlec);
      expect(tumu).toHaveLength(260);
      expect(new Set(tumu).size).toBe(260);

      // EXPLAIN: sorgu planinda ders_kaynaklari taramasi indeksle (kurum_id, grup_id, created_at) olmali.
      const plan = await sistem.begin(async (tx) => {
        await tx`set local enable_seqscan = off`;
        return tx<{ 'QUERY PLAN': string }[]>`
          explain select k.id from ders.ders_kaynaklari k
          where k.kurum_id = ${s.k.kurumId} and k.silindi_at is null and k.grup_id = ${s.grup.id}
            and k.durum in ('aktif','bozuk')
          order by k.created_at desc, k.id desc limit 101`;
      });
      expect(plan.map((p) => p['QUERY PLAN']).join('\n')).toMatch(
        /ders_kaynaklari_kurum_id_grup_id_created_at_idx/,
      );
    });
  });

  describe('izledim', () => {
    it('idempotent: ikinci cagri ayni izledi_at ile ilk:false; olay yalniz ilk eklemede; ogretmen kimin izledigini gorur', async () => {
      const { s, o, ders } = await kurulum(3);
      const [o1, o2, o3] = o as [Uye, Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      const a = await y.post(s.k, o1.token, `/kayitlarim/${id}/izledim`, {});
      expect(a.statusCode, a.body).toBe(200);
      const aj = a.json<{ ilk: boolean; izledi_at: string }>();
      expect(aj.ilk).toBe(true);
      const b = await y.post(s.k, o1.token, `/kayitlarim/${id}/izledim`, {});
      expect(b.json<{ ilk: boolean; izledi_at: string }>()).toEqual({
        ...aj,
        ilk: false,
        kaynak_id: id,
      });
      await y.post(s.k, o2.token, `/kayitlarim/${id}/izledim`, {});

      const [n] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.ders_kaynagi_izlemeleri where kaynak_id = ${id}`;
      expect(n?.n).toBe(2);
      const olaylar = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.izlendi.v1');
      expect(olaylar).toHaveLength(2);
      expect(olaylar.map((e) => e.payload.data.ogrenci_id).sort()).toEqual(
        [o1.uyelikId, o2.uyelikId].sort(),
      );
      expect(olaylar[0]?.payload.data).toMatchObject({
        kaynak_id: id,
        ders_id: ders.id,
        brans_kodu: 'matematik',
      });

      const izl = await y.get(s.k, s.hoca.token, `/kaynaklar/${id}/izlemeler`);
      expect(izl.statusCode, izl.body).toBe(200);
      const ij = izl.json<{
        hedef_sayisi: number;
        izleyenler: { ogrenci_id: string }[];
        izlemeyenler: { ogrenci_id: string }[];
      }>();
      expect(ij.hedef_sayisi).toBe(3);
      expect(ij.izleyenler.map((x) => x.ogrenci_id).sort()).toEqual(
        [o1.uyelikId, o2.uyelikId].sort(),
      );
      expect(ij.izlemeyenler.map((x) => x.ogrenci_id)).toEqual([o3.uyelikId]);
      expect(
        (await y.get(s.k, s.hoca.token, '/kaynaklar')).json<{ kaynaklar: KaynakJson[] }>()
          .kaynaklar[0]?.izleyen_sayisi,
      ).toBe(2);
      // izlenen kayit satirda izlendi:true
      expect((await kayitlarimOku(s, o1.token)).kayitlar[0]?.izlendi).toBe(true);
      expect((await kayitlarimOku(s, o3.token)).kayitlar[0]?.izlendi).toBe(false);
    });

    it('gorunmeyen kaynagi izleyemez (404) ve eszamanli iki istek tek olay uretir', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()], {
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o1.uyelikId],
      });
      const id = kaynak?.id ?? '';
      expect((await y.post(s.k, o2.token, `/kayitlarim/${id}/izledim`, {})).statusCode).toBe(404);
      const sonuc = await Promise.all(
        Array.from({ length: 5 }, () => y.post(s.k, o1.token, `/kayitlarim/${id}/izledim`, {})),
      );
      expect(sonuc.every((r) => r.statusCode === 200)).toBe(true);
      expect(sonuc.filter((r) => r.json<{ ilk: boolean }>().ilk)).toHaveLength(1);
      expect(await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.izlendi.v1')).toHaveLength(1);
    });
  });

  describe('acilmiyor bildirimi', () => {
    it('ilk acik bildirim kaynagi bozuk yapar, ayni ogrencinin ikincisi 409, baska ogrenci ekleyebilir; olay her yeni bildirimde', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      const a = await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, {
        neden: 'acilmiyor',
        aciklama: 'Drive izni yok',
      });
      expect(a.statusCode, a.body).toBe(201);
      expect(
        a.json<{ kaynak_durumu: string; sorun: { durum: string; aciklama: string } }>(),
      ).toMatchObject({
        kaynak_durumu: 'bozuk',
        sorun: { durum: 'acik', aciklama: 'Drive izni yok' },
      });
      const tekrar = await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'diger' });
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('kaynak_sorun_zaten_acik');
      expect(
        (await y.post(s.k, o2.token, `/kayitlarim/${id}/sorunlar`, { neden: 'parola_yanlis' }))
          .statusCode,
      ).toBe(201);
      expect((await y.get(s.k, o1.token, `/kayitlarim/${id}`)).json<KayitJson>()).toMatchObject({
        bozuk: true,
        acik_sorun_var: true,
      });

      const olaylar = await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.sorun_bildirildi.v1');
      expect(olaylar).toHaveLength(2);
      expect(olaylar[0]?.payload.data).toMatchObject({
        kaynak_id: id,
        bildiren_id: o1.uyelikId,
        neden: 'acilmiyor',
        ekleyen_id: s.hoca.uyelikId,
        ders_id: ders.id,
      });
      expect(JSON.stringify(olaylar[0]?.payload)).not.toContain('Drive izni');

      const liste = await y.get(s.k, s.hoca.token, `/kaynaklar/${id}/sorunlar`);
      expect(liste.json<{ sorunlar: { durum: string }[] }>().sorunlar).toHaveLength(2);
      expect(
        (await y.get(s.k, s.hoca.token, '/kaynaklar')).json<{ kaynaklar: KaynakJson[] }>()
          .kaynaklar[0],
      ).toMatchObject({ durum: 'bozuk', acik_sorun_sayisi: 2 });
    });

    it('esamanli ayni ogrenci bildirimi tek satir uretir; gecersiz neden 400; gorunmeyen kaynak 404', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()], {
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o1.uyelikId],
      });
      const id = kaynak?.id ?? '';
      const sonuc = await Promise.all(
        Array.from({ length: 4 }, () =>
          y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'acilmiyor' }),
        ),
      );
      expect(sonuc.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409]);
      expect(await k.olaylar(s.k.kurumId, 'evt.ders.kaynak.sorun_bildirildi.v1')).toHaveLength(1);
      expect(
        (await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'baska' })).statusCode,
      ).toBe(400);
      expect(
        (await y.post(s.k, o2.token, `/kayitlarim/${id}/sorunlar`, { neden: 'acilmiyor' }))
          .statusCode,
      ).toBe(404);
    });

    it('ogretmen bildirimleri cozunce kaynak aktif doner ve ayni ogrenci yeniden bildirebilir', async () => {
      const { s, o, ders } = await kurulum(1);
      const o1 = ilk(o);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'acilmiyor' });
      const coz = await y.post(s.k, s.hoca.token, `/kaynaklar/${id}/sorunlar/coz`, {});
      expect(coz.statusCode, coz.body).toBe(200);
      expect(coz.json()).toEqual({ cozulen_sayisi: 1, kaynak_durumu: 'aktif' });
      expect((await y.post(s.k, s.hoca.token, `/kaynaklar/${id}/sorunlar/coz`, {})).json()).toEqual(
        { cozulen_sayisi: 0, kaynak_durumu: 'aktif' },
      );
      const [sorun] = await sistem<
        { durum: string; cozen_id: string; cozuldu_at: Date }[]
      >`select durum, cozen_id, cozuldu_at from ders.ders_kaynagi_sorunlari where kaynak_id = ${id}`;
      expect(sorun).toMatchObject({ durum: 'cozuldu', cozen_id: s.hoca.uyelikId });
      expect((await y.get(s.k, o1.token, `/kayitlarim/${id}`)).json<KayitJson>().bozuk).toBe(false);
      expect(
        (await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'diger' })).statusCode,
      ).toBe(201);
    });

    it('ogretmen kaynagi guncelleyince bozuk kaynak aktif doner ve acik bildirimler cozulur; gizli kalmayi korur', async () => {
      const { s, o, ders } = await kurulum(1);
      const o1 = ilk(o);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'acilmiyor' });
      const duzelt = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, {
        url: 'https://drive.google.com/file/d/2/view',
      });
      expect(duzelt.statusCode, duzelt.body).toBe(200);
      expect(duzelt.json<KaynakJson>()).toMatchObject({
        durum: 'aktif',
        saglayici: 'drive',
        acik_sorun_sayisi: 0,
      });
      const [acik] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.ders_kaynagi_sorunlari where kaynak_id = ${id} and durum = 'acik'`;
      expect(acik?.n).toBe(0);

      // Gizliyken bozuk olan kaynak gizli kalir
      await y.post(s.k, o1.token, `/kayitlarim/${id}/sorunlar`, { neden: 'diger' });
      const gizle = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, { durum: 'gizli' });
      expect(gizle.json<KaynakJson>().durum).toBe('gizli');
      expect((await y.get(s.k, o1.token, `/kayitlarim/${id}`)).statusCode).toBe(404);
      const ac = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, { durum: 'aktif' });
      expect(ac.json<KaynakJson>().durum).toBe('aktif');
      expect((await y.get(s.k, o1.token, `/kayitlarim/${id}`)).statusCode).toBe(200);
    });
  });

  describe('duzenleme, gizleme, silme', () => {
    it('baslik/url/parola/konu/tarih guncellenir; parola null ile kalkar; gorunurluk degisince alicilar yenilenir; gecersiz alanlar reddedilir', async () => {
      const { s, o, ders } = await kurulum(2);
      const [o1, o2] = o as [Uye, Uye];
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link({ parola: 'eski' })]);
      const id = kaynak?.id ?? '';
      const yeniTarih = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const konu = uuidv7();
      const res = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, {
        baslik: 'Yeni başlık',
        parola: 'yeni',
        gecerlilik_bitis_at: yeniTarih,
        konu_id: konu,
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o2.uyelikId],
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<KaynakJson>()).toMatchObject({
        baslik: 'Yeni başlık',
        parola: 'yeni',
        konu_id: konu,
        gorunurluk: 'secili_ogrenciler',
        ogrenci_idleri: [o2.uyelikId],
      });
      expect(await ogrenciGorur(s, o1, id)).toBe(false);
      expect(await ogrenciGorur(s, o2, id)).toBe(true);
      const kaldir = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, {
        parola: null,
        gorunurluk: 'grup',
      });
      expect(kaldir.json<KaynakJson>()).toMatchObject({
        parola: null,
        parola_var: false,
        ogrenci_idleri: null,
      });
      expect(await ogrenciGorur(s, o1, id)).toBe(true);
      const [alici] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.ders_kaynagi_alicilari where kaynak_id = ${id}`;
      expect(alici?.n).toBe(0);

      for (const govde of [
        {},
        { url: 'http://x.com' },
        { gorunurluk: 'secili_ogrenciler' },
        { ogrenci_idleri: [o1.uyelikId] },
        { gecerlilik_bitis_at: '2020-01-01T00:00:00Z' },
      ]) {
        const kotu = await y.patch(s.k, s.hoca.token, `/kaynaklar/${id}`, govde);
        expect([400, 422], JSON.stringify(govde)).toContain(kotu.statusCode);
      }
    });

    it('yumusak silme: satir kalir (silindi_at), ogrenciden ve personel listesinden kaybolur, tekrar silme 404', async () => {
      const { s, o, ders } = await kurulum(1);
      const [kaynak] = await ekle(s, ders.id, s.hoca.token, [link()]);
      const id = kaynak?.id ?? '';
      const sil = await y.app.inject({
        method: 'DELETE',
        url: y.api(s.k, `/kaynaklar/${id}`),
        headers: bearer(s.hoca.token),
      });
      expect(sil.json()).toEqual({ id, silindi: true });
      const [satir] = await sistem<
        { silindi_at: Date | null }[]
      >`select silindi_at from ders.ders_kaynaklari where id = ${id}`;
      expect(satir?.silindi_at).not.toBeNull();
      expect(await ogrenciGorur(s, ilk(o), id)).toBe(false);
      expect(
        (await y.get(s.k, s.hoca.token, '/kaynaklar')).json<{ kaynaklar: unknown[] }>().kaynaklar,
      ).toHaveLength(0);
      expect((await y.get(s.k, s.hoca.token, `/kaynaklar/${id}`)).statusCode).toBe(404);
      expect(
        (
          await y.app.inject({
            method: 'DELETE',
            url: y.api(s.k, `/kaynaklar/${id}`),
            headers: bearer(s.hoca.token),
          })
        ).statusCode,
      ).toBe(404);
    });

    it('personel listesi: ogretmen yalniz kapsamini gorur, suzgecler (durum, tur) ve imlec calisir; yonetici hepsini gorur', async () => {
      const { s, ders } = await kurulum(1);
      await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'K1' }), link({ baslik: 'K2' })]);
      const bozuk = (await ekle(s, ders.id, s.hoca.token, [link({ baslik: 'K3' })]))[0];
      await sistem`update ders.ders_kaynaklari set durum = 'bozuk' where id = ${bozuk?.id ?? ''}`;
      const grup2 = await y.grupAc(s.k, 'grup', 'Grup B');
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, grup2.id, hoca2.uyelikId, 'fizik');
      await materyal(s, grup2.id, hoca2.token, {
        linkler: [link({ baslik: 'G2', url: 'https://ornek.com/g2' })],
      });

      const liste = async (token: string, q = '') =>
        (await y.get(s.k, token, `/kaynaklar${q}`)).json<{
          kaynaklar: KaynakJson[];
          sonraki_imlec: string | null;
        }>();
      expect((await liste(s.hoca.token)).kaynaklar.map((x) => x.baslik).sort()).toEqual([
        'K1',
        'K2',
        'K3',
      ]);
      expect((await liste(hoca2.token)).kaynaklar.map((x) => x.baslik)).toEqual(['G2']);
      expect((await liste(s.k.token)).kaynaklar).toHaveLength(4);
      expect((await liste(s.k.token, '?durum=bozuk')).kaynaklar.map((x) => x.baslik)).toEqual([
        'K3',
      ]);
      expect((await liste(s.k.token, '?tur=materyal')).kaynaklar.map((x) => x.baslik)).toEqual([
        'G2',
      ]);
      const s1 = await liste(s.k.token, '?limit=3');
      const s2 = await liste(s.k.token, `?limit=3&imlec=${s1.sonraki_imlec ?? ''}`);
      expect([...s1.kaynaklar, ...s2.kaynaklar].map((x) => x.baslik)).toEqual([
        'G2',
        'K3',
        'K2',
        'K1',
      ]);
      expect(s2.sonraki_imlec).toBeNull();
    });
  });

  describe('sure sonu isi', () => {
    it('aktif ve suresi gecmis kaynaklari suresi_doldu yapar; idempotent; silinmis/bozuk/gizli ve gelecek tarihliye dokunmaz; ogrenci hemen gormez', async () => {
      const { s, o, ders } = await kurulum(1);
      const gelecek = new Date(Date.now() + 86_400_000).toISOString();
      const kaynaklar = await ekle(s, ders.id, s.hoca.token, [
        link({ baslik: 'dolacak' }),
        link({ baslik: 'gelecek', gecerlilik_bitis_at: gelecek }),
        link({ baslik: 'bozuk' }),
        link({ baslik: 'gizli' }),
        link({ baslik: 'silinmis' }),
      ]);
      const [dolacak, , bozuk, gizli, silinmis] = kaynaklar;
      await sistem`update ders.ders_kaynaklari set gecerlilik_bitis_at = now() - interval '1 hour' where id in (${dolacak?.id ?? ''}, ${bozuk?.id ?? ''}, ${gizli?.id ?? ''}, ${silinmis?.id ?? ''})`;
      await sistem`update ders.ders_kaynaklari set durum = 'bozuk' where id = ${bozuk?.id ?? ''}`;
      await sistem`update ders.ders_kaynaklari set durum = 'gizli' where id = ${gizli?.id ?? ''}`;
      await sistem`update ders.ders_kaynaklari set silindi_at = now() where id = ${silinmis?.id ?? ''}`;
      expect(await ogrenciGorur(s, ilk(o), dolacak?.id ?? '')).toBe(false); // okumada zaten filtreli

      const ozet = await kaynakSuresiniDoldur(appDb);
      expect(ozet.hata).toBe(0);
      expect(ozet.kaynak).toBeGreaterThanOrEqual(1);
      const durumlar = await sistem<
        { baslik: string; durum: string }[]
      >`select baslik, durum from ders.ders_kaynaklari where ders_id = ${ders.id} order by baslik`;
      expect(Object.fromEntries(durumlar.map((d) => [d.baslik, d.durum]))).toEqual({
        bozuk: 'bozuk',
        dolacak: 'suresi_doldu',
        gelecek: 'aktif',
        gizli: 'gizli',
        silinmis: 'aktif',
      });
      const tekrar = await kaynakSuresiniDoldur(appDb);
      expect(tekrar.kaynak).toBe(0);
      // Is denetim kaydini yalniz is varken yazar
      const [denetim] = await sistem<
        { n: number }[]
      >`select count(*)::int n from hesap.denetim_kayitlari where kurum_id = ${s.k.kurumId} and eylem = 'sistem.kaynak_sure_sonu'`;
      expect(denetim?.n).toBe(1);
      // Suresi dolan kaynagin tarihi uzatilinca aktife doner
      const uzat = await y.patch(s.k, s.hoca.token, `/kaynaklar/${dolacak?.id ?? ''}`, {
        gecerlilik_bitis_at: gelecek,
      });
      expect(uzat.json<KaynakJson>().durum).toBe('aktif');
      expect(await ogrenciGorur(s, ilk(o), dolacak?.id ?? '')).toBe(true);
    });

    it('iki worker ayni anda calisinca her kaynak yalniz bir kez islenir (SKIP LOCKED)', async () => {
      const { s, ders } = await kurulum(0);
      const kaynaklar = await ekle(
        s,
        ders.id,
        s.hoca.token,
        Array.from({ length: 10 }, (_, i) => link({ baslik: `K${String(i)}` })),
      );
      await sistem`update ders.ders_kaynaklari set gecerlilik_bitis_at = now() - interval '1 hour' where ders_id = ${ders.id}`;
      const [a, b] = await Promise.all([kaynakSuresiniDoldur(appDb), kaynakSuresiniDoldur(appDb)]);
      expect(a.hata + b.hata).toBe(0);
      const [n] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.ders_kaynaklari where ders_id = ${ders.id} and durum = 'suresi_doldu'`;
      expect(n?.n).toBe(kaynaklar.length);
    });
  });
});
