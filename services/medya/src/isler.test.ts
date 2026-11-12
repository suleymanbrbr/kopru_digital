import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Depolama } from './depolama.js';
import { kuyrugunuIsle, takilanlariGeriAl } from './isleme/isle.js';
import {
  bakimTuru,
  gunlukTemizlik,
  kotaDenetimi,
  silmeIsi,
  yetimKurali,
  yuklemeZamanAsimi,
} from './isler.js';
import {
  j,
  jpegExifli,
  kullaniciTokeni,
  s3Yok,
  testDb,
  testServisi,
  yeniKimlik,
  yetki,
  yukle,
  type TestServisi,
} from './test/yardimcilar.js';
import { periyodikIs, istanbulSaati } from './zamanlayici.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(s3Yok())('zamanlanmis isler (gercek PostgreSQL + S3)', () => {
  const urls = testDb();
  let s: TestServisi;
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let d: { db: Database; depolama: Depolama; log: typeof sessiz };

  beforeAll(async () => {
    if (!urls) return;
    s = testServisi();
    await s.service.app.ready();
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 4 });
    if (!s.depolama) throw new Error('depolama yok');
    d = { db: sistemDb, depolama: s.depolama, log: sessiz };
  });

  afterAll(async () => {
    await s.service.stop();
    await sistem.end();
    await sistemDb.close();
  });

  /** Hazir dosya + anahtarlari: POST -> PUT -> tamam -> isleme. */
  async function hazirOlustur() {
    const k = yeniKimlik('ogrenci');
    const token = await kullaniciTokeni(k);
    const r = await yukle(s, token, {
      tur: 'soru_fotografi',
      mime: 'image/jpeg',
      govde: await jpegExifli(1600, 1200),
    });
    await kuyrugunuIsle(d, 4);
    const [satir] = await sistem<{ depolama_anahtari: string; durum: string }[]>`
      select depolama_anahtari, durum from medya.dosyalar where id = ${r.id}`;
    expect(satir?.durum).toBe('hazir');
    return { k, token, id: r.id, anahtar: satir?.depolama_anahtari ?? '' };
  }

  const kota = async (kurumId: string) =>
    (
      await sistem<{ kullanilan_bayt: string; dosya_sayisi: number }[]>`
        select kullanilan_bayt, dosya_sayisi from medya.kurum_kotalari where kurum_id = ${kurumId}`
    )[0];

  it('silme isi: nesne + kucuk resimler silinir, satir silindi, kota duser, olay yazilir; tekrar bir sey yapmaz', async () => {
    const { k, id, anahtar } = await hazirOlustur();
    for (const a of [anahtar, `${anahtar}.kucuk.webp`, `${anahtar}.orta.webp`]) {
      expect(await d.depolama.bilgi(a)).not.toBeNull();
    }
    expect((await kota(k.kurumId))?.dosya_sayisi).toBe(1);
    expect(Number((await kota(k.kurumId))?.kullanilan_bayt)).toBeGreaterThan(0);

    await sistem`update medya.dosyalar set silinecek_at = now() - interval '1 minute', silme_nedeni = 'saklama_suresi' where id = ${id}`;
    const ozet = await silmeIsi(d);
    expect(ozet.silinen).toBeGreaterThanOrEqual(1);

    for (const a of [anahtar, `${anahtar}.kucuk.webp`, `${anahtar}.orta.webp`]) {
      expect(await d.depolama.bilgi(a)).toBeNull();
    }
    const [satir] = await sistem<
      {
        durum: string;
        depolama_anahtari: string | null;
        silindi_at: Date | null;
        sha256: Buffer;
        boyut_bayt: string;
        kota_bayt: string;
      }[]
    >`
      select durum, depolama_anahtari, silindi_at, sha256, boyut_bayt, kota_bayt from medya.dosyalar where id = ${id}`;
    expect(satir?.durum).toBe('silindi');
    expect(satir?.depolama_anahtari).toBeNull();
    expect(satir?.silindi_at).not.toBeNull();
    // denetim icin ozet ve boyut kalir
    expect(satir?.sha256.length).toBe(32);
    expect(Number(satir?.boyut_bayt)).toBeGreaterThan(0);
    expect(Number(satir?.kota_bayt)).toBe(0);
    const [n] = await sistem<
      { n: number }[]
    >`select count(*)::int n from medya.kucuk_resimler where dosya_id = ${id}`;
    expect(n?.n).toBe(0);
    expect(await kota(k.kurumId)).toMatchObject({ dosya_sayisi: 0 });
    expect(Number((await kota(k.kurumId))?.kullanilan_bayt)).toBe(0);

    const olaylar = await sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.medya.dosya.silindi.v1'`;
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]?.payload.data).toMatchObject({
      dosya_id: id,
      tur: 'soru_fotografi',
      silme_nedeni: 'saklama_suresi',
    });

    // idempotent: ikinci tur ayni dosyaya dokunmaz, ikinci olay uretmez
    await silmeIsi(d);
    const [m] = await sistem<{ n: number }[]>`
      select count(*)::int n from ortak.outbox where kurum_id = ${k.kurumId} and subject = 'evt.medya.dosya.silindi.v1'`;
    expect(m?.n).toBe(1);
    expect((await kota(k.kurumId))?.dosya_sayisi).toBe(0);
  });

  it('henuz zamani gelmemis dosyaya dokunmaz', async () => {
    const { id, anahtar } = await hazirOlustur();
    await silmeIsi(d);
    expect(await d.depolama.bilgi(anahtar)).not.toBeNull();
    const [satir] = await sistem<
      { durum: string }[]
    >`select durum from medya.dosyalar where id = ${id}`;
    expect(satir?.durum).toBe('hazir');
  });

  it('depolama hatasinda satir yarina ertelenir ve hata sayaci artar (durum silinmez)', async () => {
    const { id } = await hazirOlustur();
    await sistem`update medya.dosyalar set silinecek_at = now() - interval '1 minute' where id = ${id}`;
    const bozuk: Depolama = {
      ...d.depolama,
      sil: () => Promise.reject(new Error('depolama kapali')),
    };
    const ozet = await silmeIsi({ ...d, depolama: bozuk });
    expect(ozet.hata).toBeGreaterThanOrEqual(1);
    const [satir] = await sistem<{ durum: string; hata: number; gun: number }[]>`
      select durum, silme_hata_sayisi as hata, extract(epoch from (silinecek_at - now())) / 86400 as gun
        from medya.dosyalar where id = ${id}`;
    expect(satir?.durum).toBe('hazir');
    expect(satir?.hata).toBe(1);
    expect(Number(satir?.gun)).toBeGreaterThan(0.9);
    // sonraki saglam tur (zamani geldiginde) siler
    await sistem`update medya.dosyalar set silinecek_at = now() - interval '1 minute' where id = ${id}`;
    await silmeIsi(d);
    expect((await sistem`select durum from medya.dosyalar where id = ${id}`)[0]?.durum).toBe(
      'silindi',
    );
  });

  it('nesnesi olmayan dosya silinirken hata sayilmaz', async () => {
    const k = yeniKimlik('ogrenci');
    const token = await kullaniciTokeni(k);
    const izin = await s.service.app.inject({
      method: 'POST',
      url: '/v1/dosyalar',
      headers: yetki(token),
      payload: {
        tur: 'soru_fotografi',
        mime_tipi: 'image/jpeg',
        boyut_bayt: 500,
        sha256: 'c'.repeat(64),
        istemci_anahtari: uuidv7(),
      },
    });
    const id = j(izin).dosya.id;
    await sistem`update medya.dosyalar set silinecek_at = now() where id = ${id}`;
    await silmeIsi(d);
    expect((await sistem`select durum from medya.dosyalar where id = ${id}`)[0]?.durum).toBe(
      'silindi',
    );
    expect(await kota(k.kurumId)).toMatchObject({ dosya_sayisi: 0 });
  });

  it('yukleme zaman asimi: son_at + 1 saat gecen yukleme_bekliyor silinmek uzere isaretlenir ve bakim turu kotayi geri verir', async () => {
    const k = yeniKimlik('ogrenci');
    const token = await kullaniciTokeni(k);
    const mk = async () =>
      j(
        await s.service.app.inject({
          method: 'POST',
          url: '/v1/dosyalar',
          headers: yetki(token),
          payload: {
            tur: 'soru_fotografi',
            mime_tipi: 'image/jpeg',
            boyut_bayt: 700,
            sha256: 'd'.repeat(64),
            istemci_anahtari: uuidv7(),
          },
        }),
      ).dosya.id;
    const eski = await mk();
    const yeni = await mk();
    const arada = await mk();
    await sistem`update medya.dosyalar set yukleme_son_at = now() - interval '61 minutes' where id = ${eski}`;
    await sistem`update medya.dosyalar set yukleme_son_at = now() - interval '30 minutes' where id = ${arada}`;
    expect((await kota(k.kurumId))?.dosya_sayisi).toBe(3);

    expect(await yuklemeZamanAsimi(sistemDb)).toBeGreaterThanOrEqual(1);
    expect(await yuklemeZamanAsimi(sistemDb)).toBe(0); // idempotent
    const durumlar = await sistem<{ id: string; silinecek: boolean; neden: string | null }[]>`
      select id, silinecek_at is not null as silinecek, silme_nedeni as neden from medya.dosyalar where id in ${sistem([eski, yeni, arada])}`;
    const g = (id: string) => durumlar.find((x) => x.id === id);
    expect(g(eski)).toMatchObject({ silinecek: true, neden: 'yukleme_zaman_asimi' });
    expect(g(yeni)?.silinecek).toBe(false);
    expect(g(arada)?.silinecek).toBe(false); // tamam icin 1 saatlik pay suruyor

    await bakimTuru(d);
    expect((await sistem`select durum from medya.dosyalar where id = ${eski}`)[0]?.durum).toBe(
      'silindi',
    );
    expect(await kota(k.kurumId)).toMatchObject({ dosya_sayisi: 2 });
    expect(Number((await kota(k.kurumId))?.kullanilan_bayt)).toBe(1400);
  });

  it('yetim kurali: hazir, baglanmamis ve plani olmayan dosyaya hazir_at + yetim_saat atanir', async () => {
    const { id } = await hazirOlustur();
    await sistem`update medya.dosyalar set silinecek_at = null, silme_nedeni = null where id = ${id}`;
    expect(await yetimKurali(sistemDb)).toBeGreaterThanOrEqual(1);
    const [satir] = await sistem<{ saat: number; neden: string }[]>`
      select extract(epoch from (silinecek_at - hazir_at)) / 3600 as saat, silme_nedeni as neden from medya.dosyalar where id = ${id}`;
    expect(Number(satir?.saat)).toBeCloseTo(48, 1);
    expect(satir?.neden).toBe('yetim');
    expect(await yetimKurali(sistemDb)).toBe(0);
  });

  it('takilan isleme: cokmus workerin biraktigi isleniyor satiri kuyruga geri alinir ve islenir', async () => {
    const k = yeniKimlik('ogrenci');
    const token = await kullaniciTokeni(k);
    const r = await yukle(s, token, {
      tur: 'avatar',
      mime: 'image/jpeg',
      govde: await jpegExifli(500, 500),
    });
    await sistem`update medya.dosyalar set durum = 'isleniyor', isleme_basladi_at = now() - interval '11 minutes' where id = ${r.id}`;
    expect(await kuyrugunuIsle(d, 5)).toBe(0); // isleniyor satiri alinmaz
    expect(await takilanlariGeriAl(sistemDb)).toBeGreaterThanOrEqual(1);
    await kuyrugunuIsle(d, 5);
    expect((await sistem`select durum from medya.dosyalar where id = ${r.id}`)[0]?.durum).toBe(
      'hazir',
    );
  });

  it('gece kota denetimi sapmayi bulur ve duzeltir', async () => {
    const { k } = await hazirOlustur();
    const dogru = (await kota(k.kurumId))?.kullanilan_bayt;
    await sistem`update medya.kurum_kotalari set kullanilan_bayt = 999999, dosya_sayisi = 9 where kurum_id = ${k.kurumId}`;
    const farklar = await kotaDenetimi(d);
    expect(farklar.some((f) => f.kurum_id === k.kurumId && f.kayitli_bayt === 999999)).toBe(true);
    expect((await kota(k.kurumId))?.kullanilan_bayt).toBe(dogru);
    expect((await kota(k.kurumId))?.dosya_sayisi).toBe(1);
    expect((await kotaDenetimi(d)).filter((f) => f.kurum_id === k.kurumId)).toEqual([]);
  });

  it('gunluk temizlik: 30 gunden eski processed_events silinir, yenisi kalir', async () => {
    const eski = uuidv7();
    const yeni = uuidv7();
    await sistem`insert into ortak.processed_events (tuketici, olay_id, islenme_zamani) values ('medya.test', ${eski}, now() - interval '31 days'), ('medya.test', ${yeni}, now())`;
    expect(await gunlukTemizlik(d)).toBeGreaterThanOrEqual(1);
    const kalan = await sistem<
      { olay_id: string }[]
    >`select olay_id from ortak.processed_events where tuketici = 'medya.test'`;
    expect(kalan.map((x) => x.olay_id)).toEqual([yeni]);
  });

  it('periyodik is: cakismaz, hata durdurmaz, saat yardimcisi 0-23 doner', async () => {
    let sayac = 0;
    let es = 0;
    let azami = 0;
    const hatalar: unknown[] = [];
    const durdur = periyodikIs('t', 20, { error: (o) => void hatalar.push(o) }, async () => {
      es++;
      azami = Math.max(azami, es);
      sayac++;
      await new Promise((r) => setTimeout(r, 50));
      es--;
      if (sayac === 1) throw new Error('bilerek');
    });
    await new Promise((r) => setTimeout(r, 250));
    await durdur();
    expect(sayac).toBeGreaterThan(2);
    expect(azami).toBe(1);
    expect(hatalar).toHaveLength(1);
    expect(istanbulSaati().saat).toBeGreaterThanOrEqual(0);
    expect(istanbulSaati(new Date('2026-06-01T00:30:00Z'))).toEqual({ saat: 3, gun: '2026-06-01' });
  });
});
