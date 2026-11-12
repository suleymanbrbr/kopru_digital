import { randomUUID } from 'node:crypto';

import { medyaDosyaHazirV1, medyaDosyaSilindiV1 } from '@kopru/contracts';
import { createDb, type Database } from '@kopru/service-kit';
import { connect, type JetStreamManager, type NatsConnection } from 'nats';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { medyaKopyaTuketiciBaslat, type MedyaKopyaOlayi } from './sistem/medya-kopya-tuketici.js';
import { soruKotaSayaclariniTemizle, soruOtomatikCoz } from './sistem/soru-isleri.js';
import { dersYardimcilari, type Kurulum } from './test/ders-yardimcilar.js';
import { dbYok, testDb, testServisi } from './test/yardimcilar.js';

describe.skipIf(dbYok())('soru sor worker isleri', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 4 });
    y = dersYardimcilari({ t, sistem });
  });
  afterAll(async () => {
    await sistemDb.close();
    await t.service.stop();
    await sistem.end();
  });

  async function soruEkle(
    s: Kurulum,
    durum: string,
    hareketGunOnce: number,
    ek: { dosya?: string; saklamaGun?: number } = {},
  ) {
    const ogrenci = (await y.topluOgrenci(s.k.kurumId, 1))[0] ?? '';
    const id = uuidv7();
    await sistem`insert into ogrenme.sorular
      (id, kurum_id, ogrenci_id, brans_kodu, yonlendirme, atanan_ogretmen_id, durum, kota_donemi, son_hareket_at,
       cozuldu_at)
      values (${id}, ${s.k.kurumId}, ${ogrenci}, 'matematik', 'atanan_ogretmen', ${s.hoca.uyelikId}, ${durum},
              current_date, now() - make_interval(days => ${hareketGunOnce}), ${durum === 'cozuldu' ? new Date() : null})`;
    if (ek.dosya) {
      await sistem`insert into ogrenme.soru_dosyalari (id, kurum_id, soru_id, medya_dosya_id)
        values (${uuidv7()}, ${s.k.kurumId}, ${id}, ${ek.dosya})`;
    }
    return id;
  }
  const olaylar = (kurumId: string) =>
    sistem<{ payload: { actor: { tur: string }; data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = 'evt.ogrenme.soru.cozuldu.v1'
      order by created_at, id`;

  it('7 gundur cevaplanmis ve takipsiz soru otomatik cozulur (olayiyla, idempotent, coklu worker guvenli)', async () => {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const dosya = uuidv7();
    const eski = await soruEkle(s, 'cevaplandi', 8, { dosya });
    const yeni = await soruEkle(s, 'cevaplandi', 3);
    const takipte = await soruEkle(s, 'takip_bekliyor', 20);
    const acik = await soruEkle(s, 'acik', 20);
    await sistem`insert into ogrenme.soru_ayarlari (id, kurum_id, foto_saklama_gun) values (${uuidv7()}, ${s.k.kurumId}, 10)`;

    const [a, b] = await Promise.all([soruOtomatikCoz(sistemDb), soruOtomatikCoz(sistemDb)]);
    expect(a.soru + b.soru).toBeGreaterThanOrEqual(1);
    const durumlar = await sistem<{ id: string; durum: string; cozuldu_kaynagi: string | null }[]>`
      select id, durum, cozuldu_kaynagi from ogrenme.sorular where kurum_id = ${s.k.kurumId}`;
    const d = (id: string) => durumlar.find((x) => x.id === id);
    expect(d(eski)).toMatchObject({ durum: 'cozuldu', cozuldu_kaynagi: 'otomatik' });
    expect(d(yeni)?.durum).toBe('cevaplandi');
    expect(d(takipte)?.durum).toBe('takip_bekliyor');
    expect(d(acik)?.durum).toBe('acik');

    const olay = await olaylar(s.k.kurumId);
    expect(olay).toHaveLength(1);
    expect(olay[0]?.payload.actor.tur).toBe('sistem');
    const veri = olay[0]?.payload.data as {
      soru_id: string;
      dosya_idleri: string[];
      cozuldu_at: string;
      silinecek_at: string;
    };
    expect(veri.soru_id).toBe(eski);
    expect(veri.dosya_idleri).toEqual([dosya]);
    expect(
      Math.round((Date.parse(veri.silinecek_at) - Date.parse(veri.cozuldu_at)) / 86_400_000),
    ).toBe(10);

    // Ikinci calisma bir sey yapmaz.
    const ikinci = await soruOtomatikCoz(sistemDb);
    expect(ikinci.soru).toBe(0);
    expect(await olaylar(s.k.kurumId)).toHaveLength(1);
  });

  it('400 gunden eski kota sayaclarini siler, yenilere dokunmaz', async () => {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const ogrenci = (await y.topluOgrenci(s.k.kurumId, 1))[0] ?? '';
    await sistem`insert into ogrenme.soru_kota_sayaclari (kurum_id, ogrenci_id, donem_turu, donem, kullanilan) values
      (${s.k.kurumId}, ${ogrenci}, 'gun', current_date - 401, 2),
      (${s.k.kurumId}, ${ogrenci}, 'ay', current_date - 450, 5),
      (${s.k.kurumId}, ${ogrenci}, 'gun', current_date - 399, 1),
      (${s.k.kurumId}, ${ogrenci}, 'gun', current_date, 1)`;
    expect(await soruKotaSayaclariniTemizle(sistemDb)).toBeGreaterThanOrEqual(2);
    const kalan = await sistem<{ n: number }[]>`
      select count(*)::int n from ogrenme.soru_kota_sayaclari where ogrenci_id = ${ogrenci}`;
    expect(kalan[0]?.n).toBe(2);
  });
});

const natsUrl = process.env.NATS_URL ?? '';

/** `api.medya` tuketicisi: gercek NATS + PostgreSQL, uygulama rolu (RLS) baglantisiyla. */
describe.skipIf(dbYok() || !natsUrl)('api.medya tuketicisi (gercek NATS)', () => {
  const urls = testDb();
  const sonek = randomUUID().replaceAll('-', '').slice(0, 10);
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullanici = uuidv7();
  let sistem: postgres.Sql;
  let appDb: Database;
  let nats: NatsConnection;
  let jsm: JetStreamManager;
  const siralar: number[] = [];
  const dlqKonulari: string[] = [];
  const tuketiciAdi = `api.medya_t${sonek}`;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 4 });
    nats = await connect({ servers: natsUrl });
    jsm = await nats.jetstreamManager();
    await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullanici}, ${'+9055' + String(Math.floor(10_000_000 + Math.random() * 89_000_000))})`;
    for (const k of [kurumA, kurumB]) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${k}, 'K', 'kurum', ${kullanici})`;
    }
  });
  afterAll(async () => {
    await jsm.consumers.delete('EVENTS', tuketiciAdi.replaceAll('.', '_')).catch(() => undefined);
    for (const seq of siralar)
      await jsm.streams.deleteMessage('EVENTS', seq).catch(() => undefined);
    for (const konu of dlqKonulari)
      await jsm.streams.purge('DLQ', { filter: konu }).catch(() => undefined);
    await nats.drain();
    await appDb.close();
    await sistem.end();
  });

  async function yayinla(olay: MedyaKopyaOlayi) {
    const ack = await nats
      .jetstream()
      .publish(`evt.${olay.type}.v1`, new TextEncoder().encode(JSON.stringify(olay)), {
        msgID: olay.id,
      });
    siralar.push(ack.seq);
  }
  const bekle = async (kosul: () => Promise<boolean>, ms = 15_000) => {
    const bitis = Date.now() + ms;
    while (Date.now() < bitis) {
      if (await kosul()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('zaman asimi');
  };
  const hazir = (kurumId: string, dosyaId: string, mime = 'image/jpeg') =>
    medyaDosyaHazirV1.create({
      kurumId,
      actor: { tur: 'servis', id: 'medya' },
      correlationId: 'k',
      data: {
        dosya_id: dosyaId,
        sahip_kullanici_id: kullanici,
        sahip_uyelik_id: uuidv7(),
        tur: 'soru_fotografi',
        mime_tipi: mime,
        boyut_bayt: 1234,
        genislik: 640,
        yukseklik: 480,
        sure_sn: null,
        kucuk_resim_var: true,
      },
    });

  it('hazir olayi kopya olusturur; ayni olay iki kez teslim edilince tek kez islenir; silindi durumu gunceller; baska kurumun olayi baska kuruma yazamaz', async () => {
    const dosya = uuidv7();
    const baskaKurumDosyasi = uuidv7();
    await sistem`insert into ortak.medya_dosya_kopyalari (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
      values (${baskaKurumDosyasi}, ${kurumB}, ${kullanici}, 'soru_fotografi', 'hazir', 'image/jpeg', 5, ${uuidv7()})`;

    const tuketici = await medyaKopyaTuketiciBaslat({ nats, db: appDb, tuketici: tuketiciAdi });
    try {
      const olay = hazir(kurumA, dosya);
      await yayinla(olay);
      // Ayni olay kimligi, farkli NATS mesaji (yeniden teslim benzetimi): tuketici processed_events ile atlar.
      const ack = await nats
        .jetstream()
        .publish(`evt.${olay.type}.v1`, new TextEncoder().encode(JSON.stringify(olay)), {
          msgID: `tekrar-${olay.id}`,
        });
      siralar.push(ack.seq);
      await bekle(async () => {
        const r = await sistem`select 1 from ortak.medya_dosya_kopyalari where id = ${dosya}`;
        return r.length === 1;
      });
      await bekle(async () => {
        const r =
          await sistem`select 1 from ortak.processed_events where tuketici = ${tuketiciAdi} and olay_id = ${olay.id}`;
        return r.length === 1;
      });
      const [k] = await sistem<
        { kurum_id: string; durum: string; boyut_bayt: string; kaynak_olay_id: string }[]
      >`
        select kurum_id, durum, boyut_bayt::text, kaynak_olay_id from ortak.medya_dosya_kopyalari where id = ${dosya}`;
      expect(k).toMatchObject({
        kurum_id: kurumA,
        durum: 'hazir',
        boyut_bayt: '1234',
        kaynak_olay_id: olay.id,
      });

      const silindi = medyaDosyaSilindiV1.create({
        kurumId: kurumA,
        actor: { tur: 'servis', id: 'medya' },
        correlationId: 'k',
        data: {
          dosya_id: dosya,
          tur: 'soru_fotografi',
          silme_nedeni: 'soru_cozuldu',
          silindi_at: new Date().toISOString(),
        },
      });
      await yayinla(silindi);
      await bekle(async () => {
        const r = await sistem<
          { durum: string }[]
        >`select durum from ortak.medya_dosya_kopyalari where id = ${dosya}`;
        return r[0]?.durum === 'silindi';
      });

      // Baska kurumun satirini ezmeye calisan olay: RLS reddeder, satir degismez, mesaj DLQ'ya gider.
      const caprazOlay = hazir(kurumA, baskaKurumDosyasi, 'image/png');
      dlqKonulari.push(`dlq.${tuketiciAdi}.evt.medya.dosya.hazir.v1`);
      await yayinla(caprazOlay);
      await new Promise((r) => setTimeout(r, 2500));
      const [b] = await sistem<{ kurum_id: string; mime_tipi: string }[]>`
        select kurum_id, mime_tipi from ortak.medya_dosya_kopyalari where id = ${baskaKurumDosyasi}`;
      expect(b).toEqual({ kurum_id: kurumB, mime_tipi: 'image/jpeg' });
      const islendi =
        await sistem`select 1 from ortak.processed_events where tuketici = ${tuketiciAdi} and olay_id = ${caprazOlay.id}`;
      expect(islendi).toHaveLength(0);
    } finally {
      await tuketici.stop();
    }
  });
});
