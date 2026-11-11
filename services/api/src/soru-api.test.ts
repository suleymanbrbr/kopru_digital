import { randomInt } from 'node:crypto';

import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { sahteMedya } from './test/sahte-medya.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface Mesaj {
  id: string;
  yazar_rolu: string;
  tur: string;
  metin: string | null;
  derste_konusalim: boolean;
  ekler: {
    tur: string;
    medya_dosya_id: string;
    sure_sn: number | null;
    adres: { asil_url: string } | null;
  }[];
}
interface SoruJson {
  id: string;
  durum: string;
  yonlendirme: string;
  atanan_ogretmen_id: string | null;
  masa_id: string | null;
  ustlenen_id: string | null;
  baslik: string | null;
  mesajlar: Mesaj[];
  fotograflar: { medya_dosya_id: string; adres: { asil_url: string } | null }[];
  adres_alinamadi: boolean;
  foto_silinme_at: string | null;
  kalan_takip_hakki: number;
  yeniden_acilma_sayisi: number;
}
interface OlusturJson extends SoruJson {
  tekrar: boolean;
  kota: { gunluk_kalan: number | null; gunluk_kullanilan: number; gunluk_limit: number | null };
  tahmini_cevap: { sure_sn: number | null; ornek_sayisi: number; hedef_musait: boolean | null };
}
interface ListeJson {
  sorular: { id: string; durum: string; ogrenci_id: string }[];
  sonraki_imlec: string | null;
}

const YASAK_ALANLAR = ['metin', 'baslik', 'gorunen_ad', 'ad', 'telefon', 'eposta', 'cizim_verisi'];
const MEDYA_PORT = 40_000 + randomInt(0, 20_000);

describe.skipIf(dbYok())('soru sor API', () => {
  const urls = testDb();
  const t = testServisi({
    RATE_LIMIT_MAX: '100000',
    MEDYA_URL: `http://127.0.0.1:${String(MEDYA_PORT)}`,
    MEDYA_ZAMAN_ASIMI_MS: '400',
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
        (await t.service.app.inject({ url: '/.well-known/jwks.json' })).json<{
          keys: never[];
        }>(),
      () => t.service.app.kimlik.issuer,
      MEDYA_PORT,
    );
  });
  afterAll(async () => {
    await medya.kapat();
    await t.service.stop();
    await sistem.end();
  });

  const api = (kurumId: string, yol: string) => `/v1/ogrenme/kurumlar/${kurumId}${yol}`;
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
      url: api(kurumId, yol),
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  /** Medya kopyasi (medya servisinin `dosya.hazir` olayinin sonucu). */
  async function kopya(
    kurumId: string,
    kullaniciId: string,
    tur: string,
    ek: { durum?: string; sure_sn?: number } = {},
  ): Promise<string> {
    const id = uuidv7();
    await sistem`
      insert into ortak.medya_dosya_kopyalari
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, sure_sn, kaynak_olay_id)
      values (${id}, ${kurumId}, ${kullaniciId}, ${tur}, ${ek.durum ?? 'hazir'}, 'image/jpeg', 1000,
              ${ek.sure_sn ?? null}, ${uuidv7()})`;
    return id;
  }

  async function ogrenciKur(s: Kurulum): Promise<Uye> {
    const o = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [o.uyelikId]);
    return o;
  }

  const foto = (s: Kurulum, o: Uye, tur = 'soru_fotografi') =>
    kopya(s.k.kurumId, o.kullaniciId, tur);

  async function sor(s: Kurulum, o: Uye, ek: Record<string, unknown> = {}) {
    const f = await foto(s, o);
    return istek('POST', s.k.kurumId, o.token, '/sorular', {
      brans_kodu: 'matematik',
      baslik: 'Türev sorusu',
      metin: 'Burada takıldım',
      fotograflar: [f],
      ...ek,
    });
  }

  async function soruAc(s: Kurulum, o: Uye, ek: Record<string, unknown> = {}) {
    const res = await sor(s, o, ek);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<OlusturJson>();
  }

  const olaylar = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject} order by created_at, id`;
  const olaySayisi = async (kurumId: string, subject: string) =>
    (await olaylar(kurumId, subject)).length;

  const detay = async (s: Kurulum, token: string, id: string) => {
    const res = await istek('GET', s.k.kurumId, token, `/sorular/${id}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<SoruJson>();
  };

  const cevapla = (s: Kurulum, token: string, id: string, govde: Record<string, unknown>) =>
    istek('POST', s.k.kurumId, token, `/sorular/${id}/cevap`, govde);

  async function hocaAta(
    s: Kurulum,
    ek: { brans?: string; ana?: boolean; once?: boolean; bitis?: string } = {},
  ): Promise<Uye> {
    const h = await y.davetliUye(s.k, 'ogretmen');
    await sistem`insert into hesap.atamalar
      (id, kurum_id, grup_id, ogretmen_id, brans_kodu, ana_ogretmen, baslangic_tarihi, bitis_tarihi)
      values (${uuidv7()}, ${s.k.kurumId}, ${s.grup.id}, ${h.uyelikId}, ${ek.brans ?? 'matematik'},
              ${ek.ana ?? false}, current_date - 5, ${ek.bitis ?? null})`;
    return h;
  }

  async function masaKur(s: Kurulum, brans: string, uyeler: Uye[]) {
    const res = await istek('POST', s.k.kurumId, s.k.token, '/soru-masalari', {
      brans_kodu: brans,
      ad: `${brans} masası`,
      ogretmen_idleri: uyeler.map((u) => u.uyelikId),
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>();
  }

  describe('yonlendirme', () => {
    it('atanmis ogretmen; olayda hedef ogretmen ve kisisel veri yok', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      expect(soru.yonlendirme).toBe('atanan_ogretmen');
      expect(soru.atanan_ogretmen_id).toBe(s.hoca.uyelikId);
      expect(soru.durum).toBe('acik');
      expect(soru.fotograflar).toHaveLength(1);
      expect(soru.tahmini_cevap.sure_sn).toBeNull();
      const [e] = await olaylar(s.k.kurumId, 'evt.ogrenme.soru.sorildi.v1');
      expect(e?.payload.data).toMatchObject({
        soru_id: soru.id,
        ogrenci_id: o.uyelikId,
        yonlendirme: 'atanan_ogretmen',
        hedef_ogretmen_idleri: [s.hoca.uyelikId],
      });
      for (const alan of YASAK_ALANLAR) expect(e?.payload.data).not.toHaveProperty(alan);
    });

    it('ana ogretmen onceliklidir; ana yoksa en eski atama', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const ana = await hocaAta(s, { ana: true });
      expect((await soruAc(s, o)).atanan_ogretmen_id).toBe(ana.uyelikId);
      // Ana kalkinca (bitis dun) en eski atama (kurulumdaki hoca) devralir.
      await sistem`update hesap.atamalar set bitis_tarihi = current_date - 1
        where ogretmen_id = ${ana.uyelikId}`;
      expect((await soruAc(s, o)).atanan_ogretmen_id).toBe(s.hoca.uyelikId);
    });

    it('atama yoksa branşın soru masası, o da yoksa yonetici kuyrugu; uygun brans yoksa 422', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const h2 = await y.davetliUye(s.k, 'ogretmen');
      const masa = await masaKur(s, 'fizik', [h2]);
      const m = await soruAc(s, o, { brans_kodu: 'fizik' });
      expect(m.yonlendirme).toBe('masa');
      expect(m.masa_id).toBe(masa.id);
      // Gecmis atamasi olan brans: masa yok -> yonetici kuyrugu.
      await hocaAta(s, { brans: 'kimya', bitis: new Date().toISOString().slice(0, 10) });
      await sistem`update hesap.atamalar set baslangic_tarihi = current_date - 5, bitis_tarihi = current_date - 1
        where brans_kodu = 'kimya' and kurum_id = ${s.k.kurumId}`;
      const yk = await soruAc(s, o, { brans_kodu: 'kimya' });
      expect(yk.yonlendirme).toBe('yonetici');
      expect(yk.atanan_ogretmen_id).toBeNull();
      const res = await sor(s, o, { brans_kodu: 'biyoloji' });
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('brans_gecersiz');
      const kotu = await sor(s, o, { brans_kodu: 'yok_brans' });
      expect(hataKodu(kotu)).toBe('brans_gecersiz');
    });

    it('bireysel kurumda (solo hoca) her brans yonetici kuyruguna duser', async () => {
      const k = await y.kurumluKullanici('bireysel');
      const o = await y.davetliUye(k, 'ogrenci');
      const f = await kopya(k.kurumId, o.kullaniciId, 'soru_fotografi');
      const res = await istek('POST', k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f],
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json<OlusturJson>().yonlendirme).toBe('yonetici');
      const kuyruk = await istek('GET', k.kurumId, k.token, '/gelen-sorular');
      expect(kuyruk.json<ListeJson>().sorular).toHaveLength(1);
    });

    it('konu mufredatta olmali ve branşa ait olmali', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const res = await sor(s, o, { konu_id: uuidv7() });
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('konu_gecersiz');
    });
  });

  describe('kota', () => {
    it('gunde 3 soru; dorduncu 429 kota_asildi, kalan hak ve sifirlanma; takip kotaya girmez', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const ilk = await soruAc(s, o);
      expect(ilk.kota).toMatchObject({ gunluk_limit: 3, gunluk_kullanilan: 1, gunluk_kalan: 2 });
      await soruAc(s, o);
      await soruAc(s, o);
      const dorduncu = await sor(s, o);
      expect(dorduncu.statusCode).toBe(429);
      const hata = dorduncu.json<{
        error: {
          code: string;
          details: { kota: { gunluk_kalan: number; gunluk_sifirlanma_at: string } };
        };
      }>();
      expect(hata.error.code).toBe('kota_asildi');
      expect(hata.error.details.kota.gunluk_kalan).toBe(0);
      expect(Date.parse(hata.error.details.kota.gunluk_sifirlanma_at)).toBeGreaterThan(Date.now());
      const kota = await istek('GET', s.k.kurumId, o.token, '/soru-kotam');
      expect(kota.json()).toMatchObject({
        gunluk_kullanilan: 3,
        gunluk_kalan: 0,
        aylik_limit: null,
      });
      // Reddedilen istek hak tuketmez ve soru yazmaz.
      const liste = await istek('GET', s.k.kurumId, o.token, '/sorularim');
      expect(liste.json<ListeJson>().sorular).toHaveLength(3);
      // Takip kotaya girmez.
      await cevapla(s, s.hoca.token, ilk.id, { metin: 'Şöyle yapılır' });
      const takip = await istek('POST', s.k.kurumId, o.token, `/sorular/${ilk.id}/takip`, {
        metin: 'Hâlâ anlamadım',
      });
      expect(takip.statusCode, takip.body).toBe(200);
      const kota2 = await istek('GET', s.k.kurumId, o.token, '/soru-kotam');
      expect(kota2.json()).toMatchObject({ gunluk_kullanilan: 3 });
    });

    it('esZamanli 5 istekte tam 3 basarili', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const fotolar = await Promise.all(Array.from({ length: 5 }, () => foto(s, o)));
      const sonuc = await Promise.all(
        fotolar.map((f) =>
          istek('POST', s.k.kurumId, o.token, '/sorular', {
            brans_kodu: 'matematik',
            fotograflar: [f],
          }),
        ),
      );
      const kodlar = sonuc.map((r) => r.statusCode).sort();
      expect(kodlar).toEqual([201, 201, 201, 429, 429]);
      const [r] = await sistem<{ n: number }[]>`
        select count(*)::int n from ogrenme.sorular where ogrenci_id = ${o.uyelikId}`;
      expect(r?.n).toBe(3);
      const [k] = await sistem<{ kullanilan: number }[]>`
        select kullanilan from ogrenme.soru_kota_sayaclari
        where ogrenci_id = ${o.uyelikId} and donem_turu = 'gun'`;
      expect(k?.kullanilan).toBe(3);
    });

    it('kurum ayariyla degisir (gunluk 5, aylik 5 -> aylik asilinca 429), sinirsiz null', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const varsayilan = await istek('GET', s.k.kurumId, s.k.token, '/soru-ayarlari');
      expect(varsayilan.json()).toMatchObject({
        gunluk_soru_limiti: 3,
        aylik_soru_limiti: null,
        soru_basina_takip_limiti: 3,
        ses_azami_sn: 180,
        varsayilan: true,
      });
      const put = await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', {
        gunluk_soru_limiti: 5,
        aylik_soru_limiti: 4,
      });
      expect(put.statusCode, put.body).toBe(200);
      for (let i = 0; i < 4; i++) await soruAc(s, o);
      const bes = await sor(s, o);
      expect(bes.statusCode).toBe(429);
      expect(
        bes.json<{ error: { details: { kota_turu: string } } }>().error.details.kota_turu,
      ).toBe('aylik');
      // Reddedilen istek gunluk sayaci da artirmamis olmali (islem geri alindi).
      const kota = await istek('GET', s.k.kurumId, o.token, '/soru-kotam');
      expect(kota.json()).toMatchObject({ gunluk_kullanilan: 4, aylik_kullanilan: 4 });
      await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', {
        gunluk_soru_limiti: null,
        aylik_soru_limiti: null,
      });
      expect((await sor(s, o)).statusCode).toBe(201);
    });

    it('istek_id: ayni istek iki kez gelirse tek soru, kota bir kez, olay bir kez', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const istekId = uuidv7();
      const f = await foto(s, o);
      const govde = { brans_kodu: 'matematik', fotograflar: [f], istek_id: istekId };
      const a = await istek('POST', s.k.kurumId, o.token, '/sorular', govde);
      const b = await istek('POST', s.k.kurumId, o.token, '/sorular', govde);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(200);
      expect(b.json<OlusturJson>().tekrar).toBe(true);
      expect(b.json<OlusturJson>().id).toBe(a.json<OlusturJson>().id);
      expect(b.json<OlusturJson>().kota.gunluk_kullanilan).toBe(1);
      expect(await olaySayisi(s.k.kurumId, 'evt.ogrenme.soru.sorildi.v1')).toBe(1);
      // Eszamanli ayni istek
      const f2 = await foto(s, o);
      const govde2 = { brans_kodu: 'matematik', fotograflar: [f2], istek_id: uuidv7() };
      const ikisi = await Promise.all([
        istek('POST', s.k.kurumId, o.token, '/sorular', govde2),
        istek('POST', s.k.kurumId, o.token, '/sorular', govde2),
      ]);
      expect(ikisi.map((r) => r.statusCode).sort()).toEqual([200, 201]);
      expect(new Set(ikisi.map((r) => r.json<OlusturJson>().id)).size).toBe(1);
      const [r] = await sistem<{ n: number }[]>`
        select count(*)::int n from ogrenme.sorular where ogrenci_id = ${o.uyelikId}`;
      expect(r?.n).toBe(2);
    });
  });

  describe('dosya baglama', () => {
    it('hazir degil/yok 409, baskasinin ya da yanlis turde 422, iki kez baglama 409, baglandi olayi', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const diger = await ogrenciKur(s);
      const yok = uuidv7();
      let res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [yok],
      });
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('dosya_hazir_degil');
      // Olay gec gelir: ayni dosya artik hazir, istemci yeniden dener.
      await sistem`insert into ortak.medya_dosya_kopyalari
        (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
        values (${yok}, ${s.k.kurumId}, ${o.kullaniciId}, 'soru_fotografi', 'hazir', 'image/jpeg', 10, ${uuidv7()})`;
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [yok],
      });
      expect(res.statusCode, res.body).toBe(201);
      const soruId = res.json<OlusturJson>().id;
      const baglandi = await olaylar(s.k.kurumId, 'evt.ortak.dosya.baglandi.v1');
      expect(baglandi.map((e) => e.payload.data)).toContainEqual({
        dosya_id: yok,
        bagli_tur: 'soru',
        bagli_id: soruId,
      });

      // Baskasinin dosyasi
      const baskasi = await foto(s, diger);
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [baskasi],
      });
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('dosya_gecersiz');
      // Yanlis tur (personel fotografi)
      const yanlis = await foto(s, o, 'soru_cevap_fotografi');
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [yanlis],
      });
      expect(hataKodu(res)).toBe('dosya_gecersiz');
      // Islenemedi
      const bozuk = await kopya(s.k.kurumId, o.kullaniciId, 'soru_fotografi', {
        durum: 'islenemedi',
      });
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [bozuk],
      });
      expect(hataKodu(res)).toBe('dosya_islenemedi');
      // Iki kez baglama
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [yok],
      });
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('dosya_zaten_bagli');
      // Ayni dosya ayni istekte iki kez
      const f = await foto(s, o);
      res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f, f],
      });
      expect(hataKodu(res)).toBe('dosya_gecersiz');
      // Hicbiri kota tuketmedi (yalniz basarili 1 soru).
      const kota = await istek('GET', s.k.kurumId, o.token, '/soru-kotam');
      expect(kota.json()).toMatchObject({ gunluk_kullanilan: 1 });
    });

    it('fotograf sayisi 1-3; baska kurumun kopyasi gorunmez (409)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const f = await foto(s, o);
      const dort = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f, f, f, f],
      });
      expect(dort.statusCode).toBe(400);
      const sB = await y.kur({ ogrenciSayisi: 0 });
      const oB = await ogrenciKur(sB);
      const bFoto = await foto(sB, oB);
      const res = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [bFoto],
      });
      expect(hataKodu(res)).toBe('dosya_hazir_degil');
    });

    it('cizimli fotograf: kaynak ayni sorunun fotografi olmali; cizim verisi 256 KB sinirli; isaret ogrenci cizimi', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const f = await foto(s, o);
      const cizim = await foto(s, o, 'soru_cizim');
      const kotuKaynak = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f],
        isaretler: [{ medya_dosya_id: cizim, kaynak_dosya_id: uuidv7() }],
      });
      expect(kotuKaynak.statusCode).toBe(422);
      expect(hataKodu(kotuKaynak)).toBe('kaynak_dosya_gecersiz');
      const buyuk = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f],
        isaretler: [
          {
            medya_dosya_id: cizim,
            kaynak_dosya_id: f,
            cizim_verisi: { veri: 'x'.repeat(262_200) },
          },
        ],
      });
      expect(buyuk.statusCode).toBe(422);
      const iyi = await istek('POST', s.k.kurumId, o.token, '/sorular', {
        brans_kodu: 'matematik',
        fotograflar: [f],
        isaretler: [
          { medya_dosya_id: cizim, kaynak_dosya_id: f, cizim_verisi: { cizgiler: [[0, 0, 1, 1]] } },
        ],
      });
      expect(iyi.statusCode, iyi.body).toBe(201);
      const soru = iyi.json<OlusturJson>();
      expect(soru.mesajlar[0]?.ekler[0]).toMatchObject({
        tur: 'cizimli_fotograf',
        medya_dosya_id: cizim,
      });
    });
  });

  describe('akis ve olaylar', () => {
    it('soru -> cevap (metin + ses + cizimli fotograf) -> takip -> cevap -> anladim -> yeniden acma', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      const sorulanFoto = soru.fotograflar[0]?.medya_dosya_id ?? '';

      // Kuyruk
      const sayi = await istek('GET', s.k.kurumId, s.hoca.token, '/gelen-sorular/sayi');
      expect(sayi.json()).toMatchObject({
        bekleyen: 1,
        branslar: [{ brans_kodu: 'matematik', bekleyen: 1 }],
      });
      const kuyruk = await istek('GET', s.k.kurumId, s.hoca.token, '/gelen-sorular');
      expect(kuyruk.json<ListeJson>().sorular.map((x) => x.id)).toEqual([soru.id]);
      const ogrKuyruk = await istek('GET', s.k.kurumId, o.token, '/gelen-sorular');
      expect(ogrKuyruk.statusCode).toBe(403);

      // Cevap: ses 181 sn (kopyadaki sure) reddedilir, 100 sn kabul edilir.
      const uzunSes = await kopya(s.k.kurumId, s.hoca.kullaniciId, 'soru_ses', { sure_sn: 181 });
      const uzun = await cevapla(s, s.hoca.token, soru.id, {
        ekler: [{ tur: 'ses', medya_dosya_id: uzunSes }],
      });
      expect(uzun.statusCode).toBe(422);
      expect(hataKodu(uzun)).toBe('ses_cok_uzun');
      const bos = await cevapla(s, s.hoca.token, soru.id, {});
      expect(hataKodu(bos)).toBe('cevap_bos');
      const ses = await kopya(s.k.kurumId, s.hoca.kullaniciId, 'soru_ses', { sure_sn: 100 });
      const cizim = await kopya(s.k.kurumId, s.hoca.kullaniciId, 'soru_cizim');
      const cevap = await cevapla(s, s.hoca.token, soru.id, {
        metin: 'Önce türev al',
        ekler: [
          { tur: 'ses', medya_dosya_id: ses },
          {
            tur: 'cizimli_fotograf',
            medya_dosya_id: cizim,
            kaynak_dosya_id: sorulanFoto,
            cizim_verisi: { c: 1 },
          },
        ],
      });
      expect(cevap.statusCode, cevap.body).toBe(200);
      const c = cevap.json<SoruJson>();
      expect(c.durum).toBe('cevaplandi');
      const cevapMesaji = c.mesajlar.find((m) => m.tur === 'cevap');
      expect(cevapMesaji?.ekler.map((e) => e.tur)).toEqual(['ses', 'cizimli_fotograf']);
      expect(cevapMesaji?.ekler[0]?.sure_sn).toBe(100);
      // Kuyruktan cikti, arsive girdi.
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/gelen-sorular')).json<ListeJson>().sorular,
      ).toHaveLength(0);
      const arsiv = await istek('GET', s.k.kurumId, s.hoca.token, '/cevapladigim-sorular');
      expect(arsiv.json<ListeJson>().sorular.map((x) => x.id)).toEqual([soru.id]);

      // Takip (limit 3)
      const takip = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, {
        metin: 'Hâlâ anlamadım',
      });
      expect(takip.statusCode, takip.body).toBe(200);
      expect(takip.json<SoruJson>().durum).toBe('takip_bekliyor');
      expect(takip.json<SoruJson>().kalan_takip_hakki).toBe(2);
      const ikinciTakip = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, {
        metin: 'Bir daha',
      });
      expect(hataKodu(ikinciTakip)).toBe('soru_durumu_gecersiz');
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/gelen-sorular')).json<ListeJson>().sorular,
      ).toHaveLength(1);

      // Ikinci cevap, anladim
      expect((await cevapla(s, s.hoca.token, soru.id, { derste_konusalim: true })).statusCode).toBe(
        200,
      );
      const anladim = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/anladim`, {});
      expect(anladim.statusCode, anladim.body).toBe(200);
      const cozuldu = anladim.json<SoruJson>();
      expect(cozuldu.durum).toBe('cozuldu');
      expect(cozuldu.foto_silinme_at).not.toBeNull();
      const derste = cozuldu.mesajlar.at(-1);
      expect(derste).toMatchObject({ tur: 'cevap', derste_konusalim: true, metin: null });
      // Ikinci anladim etkisiz
      await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/anladim`, {});
      const cozulduOlaylari = await olaylar(s.k.kurumId, 'evt.ogrenme.soru.cozuldu.v1');
      expect(cozulduOlaylari).toHaveLength(1);
      const cd = cozulduOlaylari[0]?.payload.data as {
        dosya_idleri: string[];
        cozuldu_at: string;
        silinecek_at: string;
      };
      expect(cd.dosya_idleri.sort()).toEqual([sorulanFoto, ses, cizim].sort());
      const gun = (Date.parse(cd.silinecek_at) - Date.parse(cd.cozuldu_at)) / 86_400_000;
      expect(Math.round(gun)).toBe(30);
      for (const alan of YASAK_ALANLAR) expect(cd).not.toHaveProperty(alan);

      // Yeniden acma
      const yeniden = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, {
        metin: 'Aslında anlamamışım',
      });
      expect(yeniden.statusCode, yeniden.body).toBe(200);
      expect(yeniden.json<SoruJson>()).toMatchObject({
        durum: 'takip_bekliyor',
        foto_silinme_at: null,
        yeniden_acilma_sayisi: 1,
      });
      const ya = await olaylar(s.k.kurumId, 'evt.ogrenme.soru.yeniden_acildi.v1');
      expect(ya).toHaveLength(1);
      expect((ya[0]?.payload.data as { dosya_idleri: string[] }).dosya_idleri).toHaveLength(3);

      // Olay sayilari (tam bir kez)
      expect(await olaySayisi(s.k.kurumId, 'evt.ogrenme.soru.sorildi.v1')).toBe(1);
      const mesajOlaylari = await olaylar(s.k.kurumId, 'evt.ogrenme.soru_mesaji.eklendi.v1');
      expect(mesajOlaylari.map((e) => e.payload.data.tur)).toEqual([
        'cevap',
        'takip',
        'cevap',
        'takip',
      ]);
      expect(mesajOlaylari[0]?.payload.data.alici_idleri).toEqual([o.uyelikId]);
      expect(mesajOlaylari[1]?.payload.data.alici_idleri).toEqual([s.hoca.uyelikId]);
      // soru foto + ses + cizim = 3 baglama olayi
      expect(await olaySayisi(s.k.kurumId, 'evt.ortak.dosya.baglandi.v1')).toBe(3);
    });

    it('takip limiti kurum ayariyla: limit dolunca 422 takip_limiti_asildi', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', { soru_basina_takip_limiti: 1 });
      const soru = await soruAc(s, o);
      await cevapla(s, s.hoca.token, soru.id, { metin: 'a' });
      expect(
        (await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, { metin: 'b' }))
          .statusCode,
      ).toBe(200);
      await cevapla(s, s.hoca.token, soru.id, { metin: 'c' });
      const ikinci = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, {
        metin: 'd',
      });
      expect(ikinci.statusCode).toBe(422);
      expect(hataKodu(ikinci)).toBe('takip_limiti_asildi');
    });

    it('cevapsiz soruya anladim 409; cevap istek_id ile tekrarlanabilir (tek mesaj, tek olay)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      const a = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/anladim`, {});
      expect(a.statusCode).toBe(409);
      const id = uuidv7();
      const r1 = await cevapla(s, s.hoca.token, soru.id, { metin: 'tek', istek_id: id });
      const r2 = await cevapla(s, s.hoca.token, soru.id, { metin: 'tek', istek_id: id });
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r2.json<SoruJson>().mesajlar.filter((m) => m.tur === 'cevap')).toHaveLength(1);
      expect(await olaySayisi(s.k.kurumId, 'evt.ogrenme.soru_mesaji.eklendi.v1')).toBe(1);
    });
  });

  describe('masa ustlenme', () => {
    it('iki ogretmen ayni anda cevaplar: biri 200, digeri 409 masa_ustlenildi; sonradan da 409; sahip cevaplayabilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const h1 = await y.davetliUye(s.k, 'ogretmen');
      const h2 = await y.davetliUye(s.k, 'ogretmen');
      await masaKur(s, 'fizik', [h1, h2]);
      const soru = await soruAc(s, o, { brans_kodu: 'fizik' });
      expect(soru.yonlendirme).toBe('masa');
      // Ikisinin de kuyrugunda
      for (const h of [h1, h2]) {
        const k = await istek('GET', s.k.kurumId, h.token, '/gelen-sorular');
        expect(k.json<ListeJson>().sorular).toHaveLength(1);
      }
      const sonuc = await Promise.all([
        cevapla(s, h1.token, soru.id, { metin: 'ben' }),
        cevapla(s, h2.token, soru.id, { metin: 'ben de' }),
      ]);
      expect(sonuc.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      const kaybeden = sonuc.find((r) => r.statusCode === 409);
      expect(hataKodu(kaybeden ?? { json: () => ({ error: { code: 'yok' } }) })).toBe(
        'masa_ustlenildi',
      );
      const kazanan = sonuc.find((r) => r.statusCode === 200)?.json<SoruJson>();
      expect(kazanan?.ustlenen_id).not.toBeNull();
      expect([h1.uyelikId, h2.uyelikId]).toContain(kazanan?.ustlenen_id);
      const digeri = kazanan?.ustlenen_id === h1.uyelikId ? h2 : h1;
      // Takip gelince yalniz ustlenenin kuyrugunda
      await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/takip`, { metin: 'bir de' });
      expect(
        (await istek('GET', s.k.kurumId, digeri.token, '/gelen-sorular')).json<ListeJson>().sorular,
      ).toHaveLength(0);
      const geri = await cevapla(s, digeri.token, soru.id, { metin: 'geç kaldım' });
      expect(geri.statusCode).toBe(409);
      expect(hataKodu(geri)).toBe('masa_ustlenildi');
      // Sahip (yonetim) masa sorusunu cevaplayabilir, ustlenen degismez.
      const sahip = await cevapla(s, s.k.token, soru.id, { metin: 'yönetici notu' });
      expect(sahip.statusCode, sahip.body).toBe(200);
      expect(sahip.json<SoruJson>().ustlenen_id).toBe(kazanan?.ustlenen_id);
      expect(sahip.json<SoruJson>().mesajlar.at(-1)?.yazar_rolu).toBe('yonetici');
    });
  });

  describe('yetki', () => {
    it('ogrenci baska ogrencinin sorusunu goremez; hedef olmayan ogretmen goremez ve cevaplayamaz; yonetim hepsini gorur', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o1 = await ogrenciKur(s);
      const o2 = await ogrenciKur(s);
      const yabanci = await y.davetliUye(s.k, 'ogretmen');
      const soru = await soruAc(s, o1);
      expect((await istek('GET', s.k.kurumId, o2.token, `/sorular/${soru.id}`)).statusCode).toBe(
        404,
      );
      expect(
        (await istek('GET', s.k.kurumId, yabanci.token, `/sorular/${soru.id}`)).statusCode,
      ).toBe(404);
      expect((await cevapla(s, yabanci.token, soru.id, { metin: 'x' })).statusCode).toBe(404);
      expect(
        (await istek('POST', s.k.kurumId, o2.token, `/sorular/${soru.id}/anladim`, {})).statusCode,
      ).toBe(404);
      expect(
        (
          await istek('POST', s.k.kurumId, o2.token, `/sorular/${soru.id}/bildir`, {
            neden: 'uygunsuz',
          })
        ).statusCode,
      ).toBe(404);
      expect((await detay(s, s.hoca.token, soru.id)).id).toBe(soru.id);
      expect((await detay(s, s.k.token, soru.id)).id).toBe(soru.id);
      // Ogrenci ogretmen/yonetim uclarina giremez; ogretmen yonetim ucuna giremez
      expect((await istek('GET', s.k.kurumId, o1.token, '/yonetim/sorular')).statusCode).toBe(403);
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/yonetim/sorular')).statusCode).toBe(
        403,
      );
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/soru-ayarlari')).statusCode).toBe(
        403,
      );
      expect((await istek('GET', s.k.kurumId, s.k.token, '/yonetim/sorular')).statusCode).toBe(200);
      // Ogretmen ogrenci ucunu kullanamaz
      expect(
        (
          await istek('POST', s.k.kurumId, s.hoca.token, '/sorular', {
            brans_kodu: 'matematik',
            fotograflar: [uuidv7()],
          })
        ).statusCode,
      ).toBe(403);
      // Baska kurumun sorusu
      const sB = await y.kur({ ogrenciSayisi: 0 });
      expect((await istek('GET', sB.k.kurumId, sB.k.token, `/sorular/${soru.id}`)).statusCode).toBe(
        404,
      );
    });

    it('soru_sor modulu grup duzeyinde kapaliysa 403 modul_kapali (soru, takip, cevap)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${s.k.kurumId}, 'soru_sor', 'grup', ${s.grup.id}, false)`;
      const yeni = await sor(s, o);
      expect(yeni.statusCode).toBe(403);
      expect(hataKodu(yeni)).toBe('modul_kapali');
      expect(hataKodu(await cevapla(s, s.hoca.token, soru.id, { metin: 'x' }))).toBe(
        'modul_kapali',
      );
    });

    it('soru_sor modulu kurum duzeyinde kapaliysa her uc 403', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${s.k.kurumId}, 'soru_sor', 'kurum', ${s.k.kurumId}, false)`;
      expect(hataKodu(await sor(s, o))).toBe('modul_kapali');
      expect((await istek('GET', s.k.kurumId, o.token, '/sorularim')).statusCode).toBe(403);
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/gelen-sorular')).statusCode).toBe(
        403,
      );
    });
  });

  describe('okuma adresleri', () => {
    it('detayda ek adresleri medya ic ucundan tek toplu istekle gelir (servis JWT: aud=medya, scope=medya.okuma)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      medya.durum.mod = 'tamam';
      const soru = await soruAc(s, o);
      expect(soru.adres_alinamadi).toBe(false);
      const fotoId = soru.fotograflar[0]?.medya_dosya_id ?? '';
      expect(soru.fotograflar[0]?.adres?.asil_url).toBe(`https://depo.test/${fotoId}`);
      const ses = await kopya(s.k.kurumId, s.hoca.kullaniciId, 'soru_ses', { sure_sn: 30 });
      await cevapla(s, s.hoca.token, soru.id, { ekler: [{ tur: 'ses', medya_dosya_id: ses }] });
      medya.istekler.length = 0;
      const d = await detay(s, o.token, soru.id);
      expect(d.fotograflar[0]?.adres).not.toBeNull();
      expect(d.mesajlar.at(-1)?.ekler[0]?.adres?.asil_url).toBe(`https://depo.test/${ses}`);
      expect(medya.istekler).toHaveLength(1);
      expect(medya.istekler[0]).toMatchObject({
        kurum_id: s.k.kurumId,
        scope: 'medya.okuma',
        sub: 'servis:api',
      });
      expect(medya.istekler[0]?.dosya_idleri.sort()).toEqual([fotoId, ses].sort());
    });

    it('medya hata verir, kopar ya da yavassa soru yine doner: adres null, adres_alinamadi true', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      for (const mod of ['hata', 'baglanti_kes', 'yavas'] as const) {
        medya.durum.mod = mod;
        const d = await detay(s, o.token, soru.id);
        expect(d.adres_alinamadi, mod).toBe(true);
        expect(d.fotograflar[0]?.adres, mod).toBeNull();
        expect(d.id).toBe(soru.id);
      }
      medya.durum.mod = 'tamam';
      expect((await detay(s, o.token, soru.id)).adres_alinamadi).toBe(false);
    });
  });

  describe('arsiv, arama, musaitlik, tahmin', () => {
    it('ogrenci arsivi: brans/durum suzgeci, Turkce harf duyarsiz arama, imlecli sayfalama', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', { gunluk_soru_limiti: null });
      const a = await soruAc(s, o, { baslik: 'İntegral hesabı', metin: 'Alan bulma' });
      await soruAc(s, o, { baslik: 'Işık ve gölge', metin: 'x' });
      await soruAc(s, o, { baslik: 'Limit', metin: 'ISIL işlem sorusu' });
      const ara = async (q: string) =>
        (
          await istek('GET', s.k.kurumId, o.token, `/sorularim?q=${encodeURIComponent(q)}`)
        ).json<ListeJson>().sorular.length;
      expect(await ara('integral')).toBe(1);
      expect(await ara('INTEGRAL')).toBe(1);
      expect(await ara('ışık')).toBe(1);
      expect(await ara('isik')).toBe(0);
      expect(await ara('ısıl')).toBe(1);
      expect(await ara('alan bulma')).toBe(1);
      const sayfa1 = await istek('GET', s.k.kurumId, o.token, '/sorularim?limit=2');
      const j1 = sayfa1.json<ListeJson>();
      expect(j1.sorular).toHaveLength(2);
      expect(j1.sonraki_imlec).not.toBeNull();
      const sayfa2 = await istek(
        'GET',
        s.k.kurumId,
        o.token,
        `/sorularim?limit=2&imlec=${j1.sonraki_imlec ?? ''}`,
      );
      const j2 = sayfa2.json<ListeJson>();
      expect(j2.sorular).toHaveLength(1);
      expect(j2.sonraki_imlec).toBeNull();
      expect(new Set([...j1.sorular, ...j2.sorular].map((x) => x.id)).size).toBe(3);
      const filtre = await istek('GET', s.k.kurumId, o.token, '/sorularim?brans_kodu=fizik');
      expect(filtre.json<ListeJson>().sorular).toHaveLength(0);
      const durum = await istek('GET', s.k.kurumId, o.token, '/sorularim?durum=cevaplandi');
      expect(durum.json<ListeJson>().sorular).toHaveLength(0);
      expect(a.id).toBeTruthy();
      const kotuImlec = await istek('GET', s.k.kurumId, o.token, '/sorularim?imlec=abc');
      expect(kotuImlec.statusCode).toBe(400);
    });

    it('tahmini cevap suresi: en az 3 ornek medyan; "bugun cevap veremiyorum" yanitta gorunur', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', { gunluk_soru_limiti: null });
      expect((await soruAc(s, o)).tahmini_cevap.sure_sn).toBeNull();
      // 3 cevaplanmis ornek: ilk cevap 10, 20, 60 dk -> medyan 20 dk (+ ustteki cevapsiz soru ornek degil)
      for (const dk of [10, 20, 60]) {
        await sistem`insert into ogrenme.sorular
          (id, kurum_id, ogrenci_id, brans_kodu, yonlendirme, atanan_ogretmen_id, durum, kota_donemi,
           created_at, ilk_cevap_at, ilk_cevaplayan_id)
          values (${uuidv7()}, ${s.k.kurumId}, ${o.uyelikId}, 'matematik', 'atanan_ogretmen', ${s.hoca.uyelikId},
                  'cevaplandi', current_date, now() - interval '3 hours',
                  now() - interval '3 hours' + make_interval(mins => ${dk}), ${s.hoca.uyelikId})`;
      }
      const t1 = await soruAc(s, o);
      expect(t1.tahmini_cevap).toMatchObject({
        sure_sn: 1200,
        ornek_sayisi: 3,
        hedef_musait: true,
      });
      const durum = await istek('PUT', s.k.kurumId, s.hoca.token, '/soru-musaitligim', {
        musait: false,
      });
      expect(durum.json()).toMatchObject({ musait: false });
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/soru-musaitligim')).json(),
      ).toMatchObject({ musait: false });
      const t2 = await soruAc(s, o);
      expect(t2.tahmini_cevap.hedef_musait).toBe(false);
      await istek('PUT', s.k.kurumId, s.hoca.token, '/soru-musaitligim', { musait: true });
      expect((await soruAc(s, o)).tahmini_cevap.hedef_musait).toBe(true);
      // Ogrenci musaitlik ucunu kullanamaz
      expect(
        (await istek('PUT', s.k.kurumId, o.token, '/soru-musaitligim', { musait: false }))
          .statusCode,
      ).toBe(403);
    });
  });

  describe('yonetim', () => {
    it('masa CRUD: tekil brans 409, surum cakismasi, uye ekle/cikar, arsiv', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const h = await y.davetliUye(s.k, 'ogretmen');
      const o = await ogrenciKur(s);
      const masa = await masaKur(s, 'fizik', [h]);
      const tekrar = await istek('POST', s.k.kurumId, s.k.token, '/soru-masalari', {
        brans_kodu: 'fizik',
        ad: 'x',
      });
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('masa_var');
      const liste = await istek('GET', s.k.kurumId, s.k.token, '/soru-masalari');
      expect(liste.json<{ masalar: { uyeler: unknown[] }[] }>().masalar[0]?.uyeler).toHaveLength(1);
      const guncel = await istek('PATCH', s.k.kurumId, s.k.token, `/soru-masalari/${masa.id}`, {
        ad: 'Fizik',
        surum: 1,
      });
      expect(guncel.statusCode, guncel.body).toBe(200);
      const eski = await istek('PATCH', s.k.kurumId, s.k.token, `/soru-masalari/${masa.id}`, {
        ad: 'Fizik 2',
        surum: 1,
      });
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      // Ogrenci masaya uye olamaz
      const kotu = await istek('POST', s.k.kurumId, s.k.token, `/soru-masalari/${masa.id}/uyeler`, {
        ogretmen_id: o.uyelikId,
      });
      expect(kotu.statusCode).toBe(422);
      const h2 = await y.davetliUye(s.k, 'ogretmen');
      const ekle = await istek('POST', s.k.kurumId, s.k.token, `/soru-masalari/${masa.id}/uyeler`, {
        ogretmen_id: h2.uyelikId,
      });
      expect(ekle.json<{ uyeler: unknown[] }>().uyeler).toHaveLength(2);
      expect(
        (
          await istek(
            'DELETE',
            s.k.kurumId,
            s.k.token,
            `/soru-masalari/${masa.id}/uyeler/${h2.uyelikId}`,
          )
        ).statusCode,
      ).toBe(204);
      expect(
        (await istek('DELETE', s.k.kurumId, s.k.token, `/soru-masalari/${masa.id}`)).statusCode,
      ).toBe(204);
      // Arsivlenen masa yeni soruyu almaz (brans uygun degil)
      expect(hataKodu(await sor(s, o, { brans_kodu: 'fizik' }))).toBe('brans_gecersiz');
      // Ogretmen masa yonetemez
      expect((await istek('GET', s.k.kurumId, h.token, '/soru-masalari')).statusCode).toBe(403);
    });

    it('uygunsuz icerik bildirimi: ogrenci ve ogretmen bildirir, tekrar ayni bildirim, yonetici listeler ve kapatir', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      const soru = await soruAc(s, o);
      const b1 = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/bildir`, {
        neden: 'uygunsuz',
        aciklama: 'kötü',
      });
      expect(b1.statusCode, b1.body).toBe(200);
      const b1b = await istek('POST', s.k.kurumId, o.token, `/sorular/${soru.id}/bildir`, {
        neden: 'uygunsuz',
      });
      expect(b1b.json<{ id: string }>().id).toBe(b1.json<{ id: string }>().id);
      const b2 = await istek('POST', s.k.kurumId, s.hoca.token, `/sorular/${soru.id}/bildir`, {
        neden: 'kisisel_bilgi',
      });
      expect(b2.statusCode).toBe(200);
      const liste = await istek('GET', s.k.kurumId, s.k.token, '/soru-bildirimleri');
      expect(liste.json<{ bildirimler: unknown[] }>().bildirimler).toHaveLength(2);
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/soru-bildirimleri')).statusCode).toBe(
        403,
      );
      const kapat = await istek(
        'POST',
        s.k.kurumId,
        s.k.token,
        `/soru-bildirimleri/${b1.json<{ id: string }>().id}/kapat`,
        { not: 'Uyarıldı' },
      );
      expect(kapat.json()).toMatchObject({ durum: 'kapandi', kapatma_notu: 'Uyarıldı' });
      const kalan = await istek('GET', s.k.kurumId, s.k.token, '/soru-bildirimleri');
      expect(kalan.json<{ bildirimler: unknown[] }>().bildirimler).toHaveLength(1);
      const kapali = await istek('GET', s.k.kurumId, s.k.token, '/soru-bildirimleri?durum=kapandi');
      expect(kapali.json<{ bildirimler: unknown[] }>().bildirimler).toHaveLength(1);
    });

    it('yonetim listesi suzgecleri ve olcum ozeti (ortalama ilk cevap suresi, anladim orani, kirilimlar)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await ogrenciKur(s);
      await istek('PUT', s.k.kurumId, s.k.token, '/soru-ayarlari', { gunluk_soru_limiti: null });
      const a = await soruAc(s, o);
      const b = await soruAc(s, o);
      await soruAc(s, o);
      await cevapla(s, s.hoca.token, a.id, { metin: '1' });
      await cevapla(s, s.hoca.token, b.id, { metin: '2' });
      await istek('POST', s.k.kurumId, o.token, `/sorular/${a.id}/anladim`, {});
      const tum = await istek('GET', s.k.kurumId, s.k.token, '/yonetim/sorular');
      expect(tum.json<ListeJson>().sorular).toHaveLength(3);
      const acik = await istek('GET', s.k.kurumId, s.k.token, '/yonetim/sorular?durum=acik');
      expect(acik.json<ListeJson>().sorular).toHaveLength(1);
      const hocaya = await istek(
        'GET',
        s.k.kurumId,
        s.k.token,
        `/yonetim/sorular?ogretmen_id=${s.hoca.uyelikId}`,
      );
      expect(hocaya.json<ListeJson>().sorular).toHaveLength(3);
      const ol = await istek('GET', s.k.kurumId, s.k.token, '/soru-olcum');
      expect(ol.statusCode, ol.body).toBe(200);
      const j = ol.json<{
        soru_sayisi: number;
        cevaplanan: number;
        anladim: number;
        anladim_orani: number;
        ortalama_ilk_cevap_sn: number;
        ogretmenler: { ogretmen_id: string; cevaplanan: number }[];
        branslar: { brans_kodu: string; soru_sayisi: number }[];
      }>();
      expect(j).toMatchObject({ soru_sayisi: 3, cevaplanan: 2, anladim: 1, anladim_orani: 0.5 });
      expect(j.ortalama_ilk_cevap_sn).toBeGreaterThanOrEqual(0);
      expect(j.ogretmenler).toMatchObject([{ ogretmen_id: s.hoca.uyelikId, cevaplanan: 2 }]);
      expect(j.branslar).toMatchObject([{ brans_kodu: 'matematik', soru_sayisi: 3 }]);
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/soru-olcum')).statusCode).toBe(403);
    });
  });
});
