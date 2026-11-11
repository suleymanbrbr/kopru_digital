import { createDb, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kuyrugunuIsle, type IslemeBagimliliklari } from './isleme/isle.js';
import {
  jpegExifli,
  kullaniciTokeni,
  mp3,
  png,
  s3Yok,
  servisTokeni,
  sha256,
  testDb,
  testServisi,
  yeniKimlik,
  yetki,
  yukle,
  type Kimlik,
  type TestServisi,
} from './test/yardimcilar.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(s3Yok())('yukleme akisi (gercek PostgreSQL + S3)', () => {
  const urls = testDb();
  let s: TestServisi;
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let isleme: IslemeBagimliliklari;

  beforeAll(async () => {
    if (!urls) return;
    s = testServisi({ VARSAYILAN_KOTA_BAYT: String(50 * 1024 * 1024) });
    await s.service.app.ready();
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 4 });
    if (!s.depolama) throw new Error('depolama yok');
    isleme = { db: sistemDb, depolama: s.depolama, log: sessiz };
  });

  afterAll(async () => {
    await s.service.stop();
    await sistem.end();
    await sistemDb.close();
  });

  const izinIste = async (k: Kimlik, govde: Record<string, unknown>) =>
    s.service.app.inject({
      method: 'POST',
      url: '/v1/dosyalar',
      headers: yetki(await kullaniciTokeni(k)),
      payload: {
        tur: 'soru_fotografi',
        mime_tipi: 'image/jpeg',
        boyut_bayt: 1000,
        sha256: 'a'.repeat(64),
        istemci_anahtari: uuidv7(),
        ...govde,
      },
    });

  const durumOku = async (id: string) =>
    (await sistem<{ durum: string; hata_kodu: string | null; silinecek_at: Date | null }[]>`
      select durum, hata_kodu, silinecek_at from medya.dosyalar where id = ${id}`)[0];

  const outbox = (kurumId: string, konu: string) =>
    sistem<{ id: string; payload: Record<string, unknown> }[]>`
      select id, payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${konu}
       order by created_at`;

  it('kimliksiz istek 401', async () => {
    const r = await s.service.app.inject({ method: 'POST', url: '/v1/dosyalar', payload: {} });
    expect(r.statusCode).toBe(401);
  });

  describe('izin: rol x tur kurali, MIME, boyut', () => {
    const kurum = uuidv7();
    const beklenen: [Kimlik['rol'], string, number][] = [
      ['ogrenci', 'soru_fotografi', 201],
      ['ogrenci', 'odev_teslim_fotografi', 201],
      ['ogrenci', 'soru_cizim', 201],
      ['ogretmen', 'soru_cizim', 201],
      ['ogretmen', 'soru_cevap_fotografi', 201],
      ['yonetici', 'soru_cevap_fotografi', 201],
      ['sahip', 'kurum_logosu', 201],
      ['yonetici', 'kurum_logosu', 201],
      ['veli', 'avatar', 201],
      ['ogrenci', 'avatar', 201],
      ['ogretmen', 'odev_eki', 201],
      ['ogretmen', 'soru_fotografi', 403],
      ['ogrenci', 'soru_cevap_fotografi', 403],
      ['ogrenci', 'odev_eki', 403],
      ['ogretmen', 'odev_teslim_fotografi', 403],
      ['ogretmen', 'kurum_logosu', 403],
      ['ogrenci', 'kurum_logosu', 403],
      ['sahip', 'fatura_pdf', 403],
    ];
    it.each(beklenen)('%s -> %s: %i', async (rol, tur, kod) => {
      const r = await izinIste(yeniKimlik(rol, kurum), { tur });
      expect(r.statusCode, r.body).toBe(kod);
      if (kod === 403) expect(r.json().error.code).toBe('dosya_turu_yetkisi_yok');
    });

    it('ses turu yalniz personel, ses MIME turleri; gorsel turune ses MIME 415', async () => {
      const k = yeniKimlik('ogretmen', kurum);
      expect(
        (await izinIste(k, { tur: 'soru_ses', mime_tipi: 'audio/mp4' })).statusCode,
      ).toBe(201);
      expect(
        (await izinIste(yeniKimlik('ogrenci', kurum), { tur: 'soru_ses', mime_tipi: 'audio/mp4' }))
          .statusCode,
      ).toBe(403);
      const r = await izinIste(yeniKimlik('ogrenci', kurum), { mime_tipi: 'audio/mp4' });
      expect(r.statusCode).toBe(415);
    });

    it('HEIC ve SVG kabul edilmez (415 mime_desteklenmiyor)', async () => {
      for (const mime of ['image/heic', 'image/heif', 'image/svg+xml', 'text/plain']) {
        const r = await izinIste(yeniKimlik('ogrenci', kurum), { mime_tipi: mime });
        expect(r.statusCode, mime).toBe(415);
        expect(r.json().error.code).toBe('mime_desteklenmiyor');
      }
    });

    it('azami boyut asilirsa 413 dosya_cok_buyuk; ses 5 MB siniri', async () => {
      const r = await izinIste(yeniKimlik('ogrenci', kurum), { boyut_bayt: 10 * 1024 * 1024 + 1 });
      expect(r.statusCode).toBe(413);
      expect(r.json().error.code).toBe('dosya_cok_buyuk');
      const ses = await izinIste(yeniKimlik('ogretmen', kurum), {
        tur: 'soru_ses',
        mime_tipi: 'audio/mp4',
        boyut_bayt: 5 * 1024 * 1024 + 1,
      });
      expect(ses.statusCode).toBe(413);
    });

    it('gecersiz govde 400', async () => {
      const r = await izinIste(yeniKimlik('ogrenci', kurum), { sha256: 'kisa' });
      expect(r.statusCode).toBe(400);
    });
  });

  describe('idempotency', () => {
    it('ayni istemci_anahtari ayni kaydi ve yeni PUT adresi dondurur; farkli govde 409', async () => {
      const k = yeniKimlik('ogrenci');
      const anahtar = uuidv7();
      const ilk = await izinIste(k, { istemci_anahtari: anahtar });
      expect(ilk.statusCode).toBe(201);
      const ikinci = await izinIste(k, { istemci_anahtari: anahtar });
      expect(ikinci.statusCode).toBe(200);
      expect(ikinci.json().dosya.id).toBe(ilk.json().dosya.id);
      expect(ikinci.json().yukleme.url).toContain(ilk.json().dosya.id);
      expect(ikinci.json().yukleme.basliklar['Content-Type']).toBe('image/jpeg');
      // kota tek kez ayrildi
      const [kota] = await sistem<{ dosya_sayisi: number; kullanilan_bayt: string }[]>`
        select dosya_sayisi, kullanilan_bayt from medya.kurum_kotalari where kurum_id = ${k.kurumId}`;
      expect(kota?.dosya_sayisi).toBe(1);
      expect(Number(kota?.kullanilan_bayt)).toBe(1000);

      const cakisma = await izinIste(k, { istemci_anahtari: anahtar, sha256: 'b'.repeat(64) });
      expect(cakisma.statusCode).toBe(409);
      expect(cakisma.json().error.code).toBe('istemci_anahtari_cakisti');
    });

    it('baska kullanicinin ayni anahtari ayri kayittir; suresi dolan yukleme 409 yukleme_suresi_doldu', async () => {
      const kurum = uuidv7();
      const anahtar = uuidv7();
      const a = await izinIste(yeniKimlik('ogrenci', kurum), { istemci_anahtari: anahtar });
      const kb = yeniKimlik('ogrenci', kurum);
      const b = await izinIste(kb, { istemci_anahtari: anahtar });
      expect(a.json().dosya.id).not.toBe(b.json().dosya.id);

      await sistem`update medya.dosyalar set yukleme_son_at = now() - interval '1 minute' where id = ${b.json().dosya.id}`;
      const dolan = await izinIste(kb, { istemci_anahtari: anahtar });
      expect(dolan.statusCode).toBe(409);
      expect(dolan.json().error.code).toBe('yukleme_suresi_doldu');
    });

    it('eszamanli ayni anahtar tek kayit ve tek kota ayirir', async () => {
      const k = yeniKimlik('ogrenci');
      const anahtar = uuidv7();
      const yanitlar = await Promise.all(
        Array.from({ length: 6 }, () => izinIste(k, { istemci_anahtari: anahtar })),
      );
      expect(new Set(yanitlar.map((y) => y.json().dosya.id)).size).toBe(1);
      expect(yanitlar.filter((y) => y.statusCode === 201)).toHaveLength(1);
      const [kota] = await sistem<{ dosya_sayisi: number }[]>`
        select dosya_sayisi from medya.kurum_kotalari where kurum_id = ${k.kurumId}`;
      expect(kota?.dosya_sayisi).toBe(1);
    });
  });

  describe('kota ve kurum durumu', () => {
    it('kota asilirsa 413 kota_asildi; rezervasyon atomik', async () => {
      const k = yeniKimlik('ogrenci');
      await sistem`insert into medya.kurum_kopyalari (kurum_id, medya_kota_bayt) values (${k.kurumId}, 2500)`;
      expect((await izinIste(k, { boyut_bayt: 1000 })).statusCode).toBe(201);
      expect((await izinIste(k, { boyut_bayt: 1000 })).statusCode).toBe(201);
      const r = await izinIste(k, { boyut_bayt: 1000 });
      expect(r.statusCode).toBe(413);
      expect(r.json().error.code).toBe('kota_asildi');
      // basarisiz istek kayit birakmaz
      const [n] = await sistem<{ n: number }[]>`
        select count(*)::int n from medya.dosyalar where kurum_id = ${k.kurumId}`;
      expect(n?.n).toBe(2);
    });

    it('askidaki/kapali kurumda yeni yukleme 403 kurum_askida', async () => {
      for (const durum of ['askida', 'kapali']) {
        const k = yeniKimlik('ogrenci');
        await sistem`insert into medya.kurum_kopyalari (kurum_id, durum) values (${k.kurumId}, ${durum})`;
        const r = await izinIste(k, {});
        expect(r.statusCode, durum).toBe(403);
        expect(r.json().error.code).toBe('kurum_askida');
      }
    });
  });

  describe('presigned PUT -> tamam -> isleme -> hazir', () => {
    it('gercek JPEG: EXIF silinir, kucuk resimler olusur, hazir olayi outbox\'a yazilir', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const govde = await jpegExifli(3000, 2000);
      const sonuc = await yukle(s, token, { tur: 'soru_fotografi', mime: 'image/jpeg', govde });
      expect(sonuc.put.status).toBe(200);
      expect(sonuc.tamam.statusCode).toBe(202);
      expect((await durumOku(sonuc.id))?.durum).toBe('yuklendi');

      // idempotent tamam
      const yine = await s.service.app.inject({
        method: 'POST',
        url: `/v1/dosyalar/${sonuc.id}/tamam`,
        headers: yetki(token),
      });
      expect(yine.statusCode).toBe(202);

      expect(await kuyrugunuIsle(isleme, 4)).toBeGreaterThanOrEqual(1);

      const get = await s.service.app.inject({
        method: 'GET',
        url: `/v1/dosyalar/${sonuc.id}`,
        headers: yetki(token),
      });
      expect(get.statusCode).toBe(200);
      const d = get.json();
      expect(d.durum).toBe('hazir');
      expect(d.mime_tipi).toBe('image/jpeg');
      expect(d.adresler.kucuk_url).toBeTruthy();
      expect(d.adresler.orta_url).toBeTruthy();

      const asil = Buffer.from(await (await fetch(d.adresler.asil_url)).arrayBuffer());
      const meta = await sharp(asil).metadata();
      expect(meta.exif).toBeUndefined();
      expect(asil.includes(Buffer.from('gizli-sahip'))).toBe(false);
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000);
      expect(d.boyut_bayt).toBe(asil.length);
      expect(d.genislik).toBe(meta.width);

      const kucuk = Buffer.from(await (await fetch(d.adresler.kucuk_url)).arrayBuffer());
      const km = await sharp(kucuk).metadata();
      expect(km.format).toBe('webp');
      expect(Math.max(km.width ?? 0, km.height ?? 0)).toBe(256);
      const orta = await sharp(
        Buffer.from(await (await fetch(d.adresler.orta_url)).arrayBuffer()),
      ).metadata();
      expect(Math.max(orta.width ?? 0, orta.height ?? 0)).toBe(1024);

      // ham yukleme nesnesi silindi, islenmis cikti var
      const [satir] = await sistem<{ depolama_anahtari: string; sha256: Buffer; kota_bayt: string }[]>`
        select depolama_anahtari, sha256, kota_bayt from medya.dosyalar where id = ${sonuc.id}`;
      expect(satir?.sha256.toString('hex')).toBe(sha256(govde));
      expect(await s.depolama?.bilgi(`${satir?.depolama_anahtari ?? ''}.yukleme`)).toBeNull();
      expect(await s.depolama?.bilgi(satir?.depolama_anahtari ?? '')).not.toBeNull();
      expect(Number(satir?.kota_bayt)).toBe(asil.length + kucuk.length + (await (await fetch(d.adresler.orta_url)).arrayBuffer()).byteLength);

      const olaylar = await outbox(k.kurumId, 'evt.medya.dosya.hazir.v1');
      expect(olaylar).toHaveLength(1);
      const yuk = olaylar[0]?.payload as { data: Record<string, unknown>; actor: { tur: string } };
      expect(yuk.data).toMatchObject({
        dosya_id: sonuc.id,
        sahip_kullanici_id: k.kullaniciId,
        tur: 'soru_fotografi',
        mime_tipi: 'image/jpeg',
        kucuk_resim_var: true,
      });
      expect(JSON.stringify(yuk)).not.toMatch(/depolama|\.yukleme|TestKamera/);
      // yetim suresi: hazir_at + 48 saat
      const [dd] = await sistem<{ saat: number; neden: string }[]>`
        select extract(epoch from (silinecek_at - hazir_at)) / 3600 as saat, silme_nedeni as neden
          from medya.dosyalar where id = ${sonuc.id}`;
      expect(Number(dd?.saat)).toBeCloseTo(48, 1);
      expect(dd?.neden).toBe('yetim');
    });

    it('tamam, nesne yuklenmeden once 409 yukleme_bulunamadi', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const izin = await izinIste(k, {});
      const r = await s.service.app.inject({
        method: 'POST',
        url: `/v1/dosyalar/${izin.json().dosya.id}/tamam`,
        headers: yetki(token),
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('yukleme_bulunamadi');
    });

    it('imzadaki Content-Type ile uyusmayan PUT reddedilir', async () => {
      const k = yeniKimlik('ogrenci');
      const govde = await png();
      const izin = await izinIste(k, {
        mime_tipi: 'image/png',
        boyut_bayt: govde.length,
        sha256: sha256(govde),
      });
      const put = await fetch(izin.json().yukleme.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: new Uint8Array(govde),
      });
      expect(put.status).toBe(403);
    });

    it('.jpg diye gonderilen PNG ve duz metin: islenemedi + mime_uyusmazligi + olay', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const ornekler = [await png(), Buffer.from('bu bir resim degil, duz metin '.repeat(20))];
      const idler: string[] = [];
      for (const govde of ornekler) {
        const r = await yukle(s, token, { tur: 'soru_fotografi', mime: 'image/jpeg', govde });
        expect(r.tamam.statusCode).toBe(202);
        idler.push(r.id);
      }
      await kuyrugunuIsle(isleme, 4);
      for (const id of idler) {
        const d = await durumOku(id);
        expect(d?.durum).toBe('islenemedi');
        expect(d?.hata_kodu).toBe('mime_uyusmazligi');
        expect(d?.silinecek_at).not.toBeNull();
        const get = await s.service.app.inject({
          method: 'GET',
          url: `/v1/dosyalar/${id}`,
          headers: yetki(token),
        });
        expect(get.json()).toMatchObject({ durum: 'islenemedi', hata_kodu: 'mime_uyusmazligi', adresler: null });
      }
      const olaylar = await outbox(k.kurumId, 'evt.medya.dosya.islenemedi.v1');
      expect(olaylar).toHaveLength(2);
      expect((olaylar[0]?.payload as { data: { hata_kodu: string } }).data.hata_kodu).toBe('mime_uyusmazligi');
    });

    it('SHA-256 uyusmazligi ve bozuk gorsel: bozuk_dosya', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const govde = await png();
      const izin = await izinIste(k, {
        mime_tipi: 'image/png',
        boyut_bayt: govde.length,
        sha256: 'f'.repeat(64),
      });
      const { url, basliklar } = izin.json().yukleme;
      await fetch(url, { method: 'PUT', headers: basliklar, body: new Uint8Array(govde) });
      await s.service.app.inject({ method: 'POST', url: `/v1/dosyalar/${izin.json().dosya.id}/tamam`, headers: yetki(token) });

      // bayt imzasi PNG ama icerigi kesik: sharp cozemez
      const kesik = govde.subarray(0, 40);
      const r2 = await yukle(s, token, { tur: 'soru_fotografi', mime: 'image/png', govde: kesik });
      expect(r2.tamam.statusCode).toBe(202);

      await kuyrugunuIsle(isleme, 4);
      expect((await durumOku(izin.json().dosya.id))?.hata_kodu).toBe('bozuk_dosya');
      expect((await durumOku(r2.id))?.hata_kodu).toBe('bozuk_dosya');
    });

    it('tamam: boyut uyusmazligi 422 ve kayit islenemedi olur', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const govde = await png();
      const izin = await izinIste(k, { mime_tipi: 'image/png', boyut_bayt: govde.length, sha256: sha256(govde) });
      const { url, basliklar } = izin.json().yukleme;
      await fetch(url, { method: 'PUT', headers: basliklar, body: new Uint8Array(govde) });
      await sistem`update medya.dosyalar set bildirilen_boyut_bayt = ${govde.length + 7} where id = ${izin.json().dosya.id}`;
      const r = await s.service.app.inject({ method: 'POST', url: `/v1/dosyalar/${izin.json().dosya.id}/tamam`, headers: yetki(token) });
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('boyut_uyusmazligi');
      expect((await durumOku(izin.json().dosya.id))?.hata_kodu).toBe('boyut_uyusmazligi');
    });

    it('ses: sure cikarilir; 180 sn ustu reddedilir (olayda bozuk_dosya)', async () => {
      const k = yeniKimlik('ogretmen');
      const token = await kullaniciTokeni(k);
      const kisa = await yukle(s, token, { tur: 'soru_ses', mime: 'audio/mpeg', govde: mp3(12) });
      const uzun = await yukle(s, token, { tur: 'soru_ses', mime: 'audio/mpeg', govde: mp3(200) });
      await kuyrugunuIsle(isleme, 4);
      const g = await s.service.app.inject({ method: 'GET', url: `/v1/dosyalar/${kisa.id}`, headers: yetki(token) });
      expect(g.json().durum).toBe('hazir');
      expect(g.json().sure_sn).toBeGreaterThanOrEqual(11);
      expect(g.json().sure_sn).toBeLessThanOrEqual(13);
      expect(g.json().adresler.kucuk_url).toBeNull();
      expect((await durumOku(uzun.id))?.hata_kodu).toBe('sure_asimi');
      const ev = await outbox(k.kurumId, 'evt.medya.dosya.islenemedi.v1');
      expect((ev[0]?.payload as { data: { hata_kodu: string } }).data.hata_kodu).toBe('bozuk_dosya');
    });

    it('baskasinin dosyasi GET/tamam icin 404 (yalniz sahip)', async () => {
      const kurum = uuidv7();
      const sahip = yeniKimlik('ogrenci', kurum);
      const izin = await izinIste(sahip, {});
      const baska = await kullaniciTokeni(yeniKimlik('ogrenci', kurum));
      const digerKurum = await kullaniciTokeni(yeniKimlik('ogrenci'));
      for (const t of [baska, digerKurum]) {
        const g = await s.service.app.inject({ method: 'GET', url: `/v1/dosyalar/${izin.json().dosya.id}`, headers: yetki(t) });
        expect(g.statusCode).toBe(404);
        const tm = await s.service.app.inject({ method: 'POST', url: `/v1/dosyalar/${izin.json().dosya.id}/tamam`, headers: yetki(t) });
        expect(tm.statusCode).toBe(404);
      }
    });

    it('coklu worker: ayni dosya iki kez islenmez (SKIP LOCKED)', async () => {
      const k = yeniKimlik('ogrenci');
      const token = await kullaniciTokeni(k);
      const idler: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await yukle(s, token, { tur: 'avatar', mime: 'image/png', govde: await png(100 + i, 100) });
        idler.push(r.id);
      }
      const sayilar = await Promise.all([1, 2, 3].map(() => kuyrugunuIsle(isleme, 3)));
      expect(sayilar.reduce((t, n) => t + n, 0)).toBeGreaterThanOrEqual(6);
      const olaylar = await outbox(k.kurumId, 'evt.medya.dosya.hazir.v1');
      expect(olaylar).toHaveLength(6);
      expect(new Set(olaylar.map((o) => (o.payload as { data: { dosya_id: string } }).data.dosya_id)).size).toBe(6);
    });
  });

  describe('ic uc /ic/okuma-adresleri', () => {
    const kurumA = uuidv7();
    const kurumB = uuidv7();
    let hazirA: string;
    let hazirB: string;
    let bekleyenA: string;
    let silinenA: string;

    beforeAll(async () => {
      const a = yeniKimlik('ogrenci', kurumA);
      const b = yeniKimlik('ogrenci', kurumB);
      const ta = await kullaniciTokeni(a);
      const tb = await kullaniciTokeni(b);
      hazirA = (await yukle(s, ta, { tur: 'soru_fotografi', mime: 'image/jpeg', govde: await jpegExifli(800, 600) })).id;
      hazirB = (await yukle(s, tb, { tur: 'soru_fotografi', mime: 'image/jpeg', govde: await jpegExifli(800, 600) })).id;
      silinenA = (await yukle(s, ta, { tur: 'avatar', mime: 'image/png', govde: await png() })).id;
      bekleyenA = (await izinIste(a, {})).json().dosya.id;
      await kuyrugunuIsle(isleme, 10);
      await sistem`update medya.dosyalar set durum = 'silindi', silindi_at = now(), depolama_anahtari = null where id = ${silinenA}`;
    });

    const cagir = async (govde: unknown, token?: string) =>
      s.service.app.inject({
        method: 'POST',
        url: '/ic/okuma-adresleri',
        ...(token ? { headers: yetki(token) } : {}),
        payload: govde as object,
      });

    it('servis tokeniyle: hazir dosya icin adresler (indirilebilir); baska kurum, bekleyen, silinmis ve olmayan yanitta yok', async () => {
      const r = await cagir(
        { kurum_id: kurumA, dosya_idleri: [hazirA, hazirB, bekleyenA, silinenA, uuidv7()] },
        await servisTokeni(),
      );
      expect(r.statusCode, r.body).toBe(200);
      const { adresler } = r.json() as { adresler: Record<string, unknown>[] };
      expect(adresler).toHaveLength(1);
      expect(adresler[0]).toMatchObject({ dosya_id: hazirA, mime_tipi: 'image/jpeg' });
      const a = adresler[0] as { asil_url: string; kucuk_url: string; orta_url: string; genislik: number; gecerlilik_bitis_at: string };
      expect((await fetch(a.asil_url)).status).toBe(200);
      expect((await fetch(a.kucuk_url)).status).toBe(200);
      expect((await fetch(a.orta_url)).status).toBe(200);
      expect(a.genislik).toBeGreaterThan(0);
      const sn = (new Date(a.gecerlilik_bitis_at).getTime() - Date.now()) / 1000;
      expect(sn).toBeGreaterThan(590);
      expect(sn).toBeLessThanOrEqual(600);
    });

    it('kullanici tokeniyle 401; kimliksiz 401; yanlis scope 403; baska servise ait token 401', async () => {
      const govde = { kurum_id: kurumA, dosya_idleri: [hazirA] };
      const kt = await kullaniciTokeni(yeniKimlik('sahip', kurumA));
      expect((await cagir(govde, kt)).statusCode).toBe(401);
      expect((await cagir(govde)).statusCode).toBe(401);
      expect((await cagir(govde, await servisTokeni({ scope: 'iletisim.oku' }))).statusCode).toBe(403);
      expect((await cagir(govde, await servisTokeni({ audience: 'bildirim' }))).statusCode).toBe(401);
    });

    it('gecersiz govde 400 (bos liste, 50 ustu)', async () => {
      const t = await servisTokeni();
      expect((await cagir({ kurum_id: kurumA, dosya_idleri: [] }, t)).statusCode).toBe(400);
      expect(
        (await cagir({ kurum_id: kurumA, dosya_idleri: Array.from({ length: 51 }, () => uuidv7()) }, t)).statusCode,
      ).toBe(400);
    });

    it('baska kurumun kimligi istenirse yalniz o kurumun dosyalari doner', async () => {
      const r = await cagir({ kurum_id: kurumB, dosya_idleri: [hazirA, hazirB] }, await servisTokeni());
      expect((r.json() as { adresler: { dosya_id: string }[] }).adresler.map((x) => x.dosya_id)).toEqual([hazirB]);
    });
  });
});
