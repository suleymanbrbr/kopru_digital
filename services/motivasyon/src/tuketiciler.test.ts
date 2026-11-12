import {
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import { createDb, ensureEventStream, type Database } from '@kopru/service-kit';
import { connect, headers, type NatsConnection } from 'nats';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, dk, olay, ortamKur, yeniSenaryo, type Ortam } from './test/ortam.js';
import { natsYok, testDb, testNats } from './test/yardimcilar.js';
import { tuketicileriBaslat } from './tuketiciler.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function bekle<T>(oku: () => Promise<T | undefined | false>, ms = 15_000): Promise<T> {
  const bitis = Date.now() + ms;
  for (;;) {
    const v = await oku();
    if (v) return v;
    if (Date.now() > bitis) throw new Error('beklenen durum olusmadi');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe.skipIf(natsYok())('olay tuketicileri (gercek PostgreSQL + NATS)', () => {
  const urls = testDb();
  const sonek = `_t${Math.random().toString(36).slice(2, 8)}`;
  let nats: NatsConnection;
  let o: Ortam;
  let app: Database;
  let durdur: () => Promise<void>;

  async function yayinla(olay: { id: string; type: string; version: number }) {
    // JetStream tekrar-onleme (msgID) yerine ayni olay kimligi iki kez gonderilebilsin diye rastgele msgID.
    const h = headers();
    h.set('Nats-Msg-Id', uuidv7());
    await nats
      .jetstream()
      .publish(`evt.${olay.type}.v${String(olay.version)}`, JSON.stringify(olay), { headers: h });
  }

  beforeAll(async () => {
    const url = testNats();
    if (!urls || !url) return;
    o = ortamKur();
    app = createDb({ url: urls.appUrl, max: 4 });
    nats = await connect({ servers: url, name: 'motivasyon-test' });
    await ensureEventStream(nats);
    // Paylasilan EVENTS'te baska sureclerin gercek olaylarini gormemek icin yalniz yeni olaylar.
    const tuketiciler = await tuketicileriBaslat({
      nats,
      db: app,
      log: sessiz,
      sonek,
      baslangic: 'yeni',
    });
    durdur = async () => {
      await Promise.all(tuketiciler.map((t) => t.stop()));
    };
  });

  afterAll(async () => {
    await durdur();
    const jsm = await nats.jetstreamManager();
    for (const ad of [`motivasyon_kopya${sonek}`, `motivasyon_xp${sonek}`]) {
      await jsm.consumers.delete('EVENTS', ad).catch(() => undefined);
    }
    await nats.drain();
    await app.close();
    await o.kapat();
  });

  const islenen = async (olayId: string, tuketici: string) =>
    (
      await o.sistem<{ n: number }[]>`
        select count(*)::int n from ortak.processed_events
         where olay_id = ${olayId} and tuketici = ${`${tuketici}${sonek}`}`
    )[0]?.n ?? 0;

  it('kopya olaylari kopya tablolarini doldurur; XP olayi ayni olay iki kez gelse de tek XP verir', async () => {
    const s = yeniSenaryo();
    const zarf = {
      kurumId: s.kurumId,
      actor: { tur: 'sistem', id: 'api' } as const,
      correlationId: 'c',
    };
    await yayinla(
      hesapKurumDegistiV1.create({
        ...zarf,
        data: {
          kurum_id: s.kurumId,
          ad: 'K',
          tur: 'kurum',
          saat_dilimi: 'Asia/Tokyo',
          durum: 'aktif',
        },
      }),
    );
    const uyelik = hesapUyelikDegistiV1.create({
      ...zarf,
      data: {
        uyelik_id: s.ogrenciId,
        kullanici_id: uuidv7(),
        rol: 'ogrenci',
        durum: 'aktif',
        sube_id: null,
        kademe_id: null,
      },
    });
    await yayinla(uyelik);
    await bekle(async () => (await islenen(uyelik.id, 'motivasyon.kopya')) === 1);
    const [k] = await o.sistem<{ saat_dilimi: string }[]>`
      select saat_dilimi from motivasyon.kurum_kopyalari where kurum_id = ${s.kurumId}`;
    expect(k?.saat_dilimi).toBe('Asia/Tokyo');

    // 20:00Z = 05:00 JST: ayni gun; ayni olay iki kez yayimlanir (at-least-once)
    const yoklama = olay.yoklama(s, {
      at: new Date('2026-11-10T20:00:00Z'),
      durum: 'geldi',
      yoklamaId: uuidv7(),
      surum: 1,
    });
    await yayinla(yoklama);
    await yayinla(yoklama);
    await bekle(async () => (await islenen(yoklama.id, 'motivasyon.xp')) === 1);
    // ikinci kopyanin da islenmis olmasi icin kisa bekleme, sonra durum kontrolu
    await new Promise((r) => setTimeout(r, 500));
    const [d] = await o.sistem<{ toplam_xp: number; seviye: number }[]>`
      select toplam_xp::int, seviye from motivasyon.ogrenci_durumlari where ogrenci_id = ${s.ogrenciId}`;
    expect(d).toEqual({ toplam_xp: 20, seviye: 2 });
    const h = await o.sistem<{ gun: string }[]>`
      select gun::text from motivasyon.xp_hareketleri where ogrenci_id = ${s.ogrenciId}`;
    expect(h).toEqual([{ gun: '2026-11-11' }]); // Tokyo 05:00, 11 Kasim
    const outbox = await o.sistem<{ subject: string }[]>`
      select subject from ortak.outbox where kurum_id = ${s.kurumId}`;
    expect(outbox.map((x) => x.subject)).toEqual(['evt.motivasyon.seviye.atladi.v1']);
  });

  it('modul ayari kopyasi olayla kapaninca sonraki XP olayi pasif sayilir', async () => {
    const s = yeniSenaryo();
    const zarf = {
      kurumId: s.kurumId,
      actor: { tur: 'sistem', id: 'api' } as const,
      correlationId: 'c',
    };
    const ayar = hesapModulAyariDegistiV1.create({
      ...zarf,
      data: {
        modul_ayari_id: uuidv7(),
        modul_kodu: 'oyunlastirma',
        kapsam: 'kurum',
        kapsam_id: s.kurumId,
        acik: false,
      },
    });
    await yayinla(ayar);
    await bekle(async () => (await islenen(ayar.id, 'motivasyon.kopya')) === 1);
    const e = olay.yoklama(s, { at: dk(T0, 1), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 });
    await yayinla(e);
    await bekle(async () => (await islenen(e.id, 'motivasyon.xp')) === 1);
    const [d] = await o.sistem<{ toplam_xp: number; pasif: number }[]>`
      select toplam_xp::int, pasif_olay_sayisi as pasif from motivasyon.ogrenci_durumlari where ogrenci_id = ${s.ogrenciId}`;
    expect(d).toEqual({ toplam_xp: 0, pasif: 1 });
  });

  it('gecersiz yuklu olay DLQ ye gider, sonraki olaylar islenmeye devam eder', async () => {
    const s = yeniSenaryo();
    const h = headers();
    h.set('Nats-Msg-Id', uuidv7());
    await nats
      .jetstream()
      .publish(
        'evt.ders.yoklama.kaydedildi.v1',
        JSON.stringify({ id: uuidv7(), type: 'ders.yoklama.kaydedildi', version: 1, bozuk: true }),
        { headers: h },
      );
    const e = olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId: uuidv7(), surum: 1 });
    await yayinla(e);
    await bekle(async () => (await islenen(e.id, 'motivasyon.xp')) === 1);
  });
});
