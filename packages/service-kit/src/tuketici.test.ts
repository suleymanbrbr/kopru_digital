import { randomUUID } from 'node:crypto';

import { ortakDosyaBaglandiV1, ortakDosyaBirakildiV1, type EventOf } from '@kopru/contracts';
import { sql } from 'drizzle-orm';
import { connect, type JetStreamManager, type NatsConnection } from 'nats';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createDb, type Database, type Tx } from './db.js';
import {
  DLQ_STREAM,
  KaliciHata,
  YenidenDene,
  ensureDlqStream,
  islenmisOlaylariTemizle,
  startConsumer,
  type Tuketici,
  type TuketiciBaglami,
  type TuketiciSecenekleri,
} from './tuketici.js';

const dbUrl = process.env.DATABASE_URL ?? '';
const natsUrl = process.env.NATS_URL ?? '';
if (!dbUrl || !natsUrl) {
  console.warn('[service-kit/tuketici.test] DATABASE_URL ve NATS_URL gerekli: testler atlanıyor.');
}

const olaylar = [ortakDosyaBaglandiV1, ortakDosyaBirakildiV1] as const;
type Olay = EventOf<(typeof olaylar)[number]>;
type Isleyici = (tx: Tx, olay: Olay, baglam: TuketiciBaglami) => Promise<void>;
type Ek = Partial<
  Omit<TuketiciSecenekleri<typeof olaylar>, 'nats' | 'db' | 'tuketici' | 'olaylar' | 'isle'>
>;

const sonek = randomUUID().replaceAll('-', '').slice(0, 10);
const schema = `tuk_${sonek}`;
const encoder = new TextEncoder();

describe.skipIf(!dbUrl || !natsUrl)('idempotent olay tuketicisi (gercek NATS + PostgreSQL)', () => {
  let db: Database;
  let nats: NatsConnection;
  let jsm: JetStreamManager;
  const baslayanlar: Tuketici[] = [];
  const tuketiciler: string[] = [];
  const streamSiralari: number[] = [];
  const dlqKonulari: string[] = [];

  beforeAll(async () => {
    db = createDb({ url: dbUrl, max: 8 });
    nats = await connect({ servers: natsUrl });
    jsm = await nats.jetstreamManager();
    await ensureDlqStream(nats);
    await db.sql.unsafe(`
      drop schema if exists ${schema} cascade;
      create schema ${schema};
      create table ${schema}.processed_events (
        tuketici text not null, olay_id uuid not null,
        islenme_zamani timestamptz not null default now(),
        primary key (tuketici, olay_id));
      create table ${schema}.kayit (olay_id uuid not null, kurum_id uuid not null, deger text);
    `);
  });

  afterEach(async () => {
    for (const t of baslayanlar.splice(0)) await t.stop();
    // Yalnizca bu testin olusturdugu consumer, mesaj ve DLQ kayitlari silinir; paylasilan stream'lere dokunulmaz.
    for (const ad of tuketiciler.splice(0)) {
      await jsm.consumers.delete('EVENTS', ad.replaceAll('.', '_')).catch(() => undefined);
    }
    for (const seq of streamSiralari.splice(0)) {
      await jsm.streams.deleteMessage('EVENTS', seq).catch(() => undefined);
    }
    for (const konu of dlqKonulari.splice(0)) {
      await jsm.streams.purge(DLQ_STREAM, { filter: konu }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await db.sql.unsafe(`drop schema if exists ${schema} cascade`);
    await db.close();
    await nats.drain();
  });

  const ortak = (kurumId: string) => ({
    kurumId,
    actor: { tur: 'sistem', id: 'test' } as const,
    correlationId: 'tuketici-test',
  });
  const baglandi = (kurumId: string, dosyaId = randomUUID()) =>
    ortakDosyaBaglandiV1.create({
      ...ortak(kurumId),
      data: { dosya_id: dosyaId, bagli_tur: 'odev_eki', bagli_id: randomUUID() },
    });

  async function yayimla(konu: string, govde: string, msgID?: string): Promise<number> {
    const ack = await nats.jetstream().publish(konu, encoder.encode(govde), {
      ...(msgID ? { msgID } : {}),
    });
    streamSiralari.push(ack.seq);
    return ack.seq;
  }

  const yeniAd = () => `tst.k${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  async function baslat(ad: string, kurumId: string, isle: Isleyici, ek: Ek = {}) {
    tuketiciler.push(ad);
    dlqKonulari.push(`dlq.${ad}.>`);
    const t = await startConsumer({
      nats,
      db,
      tuketici: ad,
      olaylar,
      processedEventsTablosu: `${schema}.processed_events`,
      // Paylasilan `EVENTS` stream'inde yerel betiklerin/servislerin gercek olaylari durabilir (7 gun);
      // test consumer'i yalniz kendinden sonra yayimlananlari gorur. Ayni anda kosan baska testlerin
      // olaylari yine gorunebilir; yalnizca bu testin kurumu islenir.
      baslangic: 'yeni',
      isle: async (tx, olay, baglam) => {
        if (olay.kurumId !== kurumId) return;
        await isle(tx, olay, baglam);
      },
      ...ek,
    });
    baslayanlar.push(t);
    return t;
  }

  async function bekle(kosul: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
    const son = Date.now() + ms;
    while (Date.now() < son) {
      if (await kosul()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('beklenen koşul zaman aşımına uğradı');
  }

  const islenenSayisi = async (ad: string, olayId?: string) => {
    const satirlar = await db.sql.unsafe<{ n: string }[]>(
      `select count(*)::text as n from ${schema}.processed_events where tuketici = $1 ${olayId ? 'and olay_id = $2' : ''}`,
      olayId ? [ad, olayId] : [ad],
    );
    return Number(satirlar[0]?.n ?? 0);
  };

  async function bekleyenYok(ad: string) {
    await nats.flush();
    await bekle(async () => {
      const bilgi = await jsm.consumers.info('EVENTS', ad.replaceAll('.', '_'));
      return bilgi.num_ack_pending === 0 && bilgi.num_pending === 0;
    });
  }

  it('basarili isleme: yazim + processed_events commit olur, mesaj ack edilir, kiraci baglami olaydan gelir', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    const goruldu: { kurum: string; konu: string; teslim: number }[] = [];
    await baslat(ad, kurumId, async (tx, olay, baglam) => {
      const r = await tx.execute<{ k: string }>(
        sql`select current_setting('app.kurum_id', true) as k`,
      );
      goruldu.push({ kurum: r[0]?.k ?? '', konu: baglam.konu, teslim: baglam.teslimSayisi });
      await tx.execute(
        sql`insert into ${sql.identifier(schema)}.kayit (olay_id, kurum_id, deger) values (${olay.id}, ${olay.kurumId}, ${olay.data.dosya_id})`,
      );
    });
    const olay = baglandi(kurumId);
    await yayimla(`evt.ortak.dosya.baglandi.v1`, JSON.stringify(olay), olay.id);

    await bekle(async () => (await islenenSayisi(ad, olay.id)) === 1);
    await bekleyenYok(ad);
    expect(goruldu).toEqual([{ kurum: kurumId, konu: 'evt.ortak.dosya.baglandi.v1', teslim: 1 }]);
    const kayitlar = await db.sql.unsafe(`select deger from ${schema}.kayit where olay_id = $1`, [
      olay.id,
    ]);
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]?.deger).toBe(olay.data.dosya_id);
  });

  it('kiraci: "yok" iken tenant degiskeni ayarlanmaz', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    const goruldu: string[] = [];
    await baslat(
      ad,
      kurumId,
      async (tx) => {
        const r = await tx.execute<{ k: string | null }>(
          sql`select nullif(current_setting('app.kurum_id', true), '') as k`,
        );
        goruldu.push(r[0]?.k ?? 'bos');
      },
      { kiraci: 'yok' },
    );
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(() => goruldu.length === 1);
    expect(goruldu).toEqual(['bos']);
  });

  it('ayni olay iki kez yayimlanirsa (cift stream mesaji) isleyici bir kez calisir', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    await baslat(ad, kurumId, () => {
      cagri++;
      return Promise.resolve();
    });
    const olay = baglandi(kurumId);
    // Farkli msgID: JetStream tekilleştirmesi devre disi, tekilleştirme yalnizca processed_events ile.
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), `a-${olay.id}`);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), `b-${olay.id}`);
    await bekleyenYok(ad);
    expect(cagri).toBe(1);
    expect(await islenenSayisi(ad, olay.id)).toBe(1);
  });

  it('isleyici hata atinca islem geri alinir (processed_events dahil); yeniden teslimde basariyla islenir', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    const ara: { processedIlk: number; kayitIlk: number }[] = [];
    await baslat(
      ad,
      kurumId,
      async (tx, olay) => {
        cagri++;
        if (cagri === 2) {
          // Ayri baglantidan: ilk denemenin hicbir izi commit olmamis olmali.
          ara.push({
            processedIlk: await islenenSayisi(ad, olay.id),
            kayitIlk: (
              await db.sql.unsafe(`select 1 from ${schema}.kayit where olay_id = $1`, [olay.id])
            ).length,
          });
        }
        await tx.execute(
          sql`insert into ${sql.identifier(schema)}.kayit (olay_id, kurum_id) values (${olay.id}, ${olay.kurumId})`,
        );
        if (cagri === 1) throw new Error('geçici hata');
      },
      { backoffMs: [100, 100], maxDeliver: 5 },
    );
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(async () => (await islenenSayisi(ad, olay.id)) === 1);
    await bekleyenYok(ad);

    expect(cagri).toBe(2);
    expect(ara).toEqual([{ processedIlk: 0, kayitIlk: 0 }]);
    const kayitlar = await db.sql.unsafe(`select 1 from ${schema}.kayit where olay_id = $1`, [
      olay.id,
    ]);
    expect(kayitlar).toHaveLength(1);
  });

  it("gecersiz yuk, gecersiz JSON ve bilinmeyen surum: DLQ'da gorunur, isleyici calismaz", async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    await baslat(ad, kurumId, () => {
      cagri++;
      return Promise.resolve();
    });
    const gecerli = baglandi(kurumId);
    const bozukYuk = { ...gecerli, id: uuidv7(), data: { ...gecerli.data, bagli_tur: 'yok' } };
    const v2 = { ...gecerli, id: uuidv7(), version: 2 };

    const seqYuk = await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(bozukYuk));
    const seqJson = await yayimla('evt.ortak.dosya.baglandi.v1', '{bozuk json');
    const seqV2 = await yayimla('evt.ortak.dosya.baglandi.v2', JSON.stringify(v2));

    // Ayni konuda birden fazla DLQ mesaji olabilir: her biri stream sirasi basligi ile bulunur.
    const json = await dlqOkuSira(ad, 'evt.ortak.dosya.baglandi.v1', seqJson);
    const surum = await dlqOkuSira(ad, 'evt.ortak.dosya.baglandi.v2', seqV2);
    const yukSonuc = await dlqOkuSira(ad, 'evt.ortak.dosya.baglandi.v1', seqYuk);

    expect(yukSonuc.neden).toBe('gecersiz_yuk');
    expect(yukSonuc.tuketici).toBe(ad);
    expect(yukSonuc.veri).toContain('"bagli_tur":"yok"');
    expect(json.neden).toBe('gecersiz_json');
    expect(surum.neden).toBe('bilinmeyen_konu_veya_surum');
    expect(cagri).toBe(0);
    await bekleyenYok(ad);
    expect(await islenenSayisi(ad)).toBe(0);
  });

  /** Ayni DLQ konusundaki mesajlar arasinda stream sirasi basligina gore arar. */
  async function dlqOkuSira(ad: string, konu: string, streamSirasi: number) {
    const dlqKonu = `dlq.${ad}.${konu}`;
    const son = Date.now() + 10_000;
    while (Date.now() < son) {
      let seq = 0;
      for (;;) {
        const m = await jsm.streams
          .getMessage(DLQ_STREAM, { next_by_subj: dlqKonu, seq: seq + 1 } as unknown as {
            seq: number;
          })
          .catch(() => null);
        if (!m) break;
        seq = m.seq;
        if (m.header.get('Kopru-Stream-Sirasi') === String(streamSirasi)) {
          return {
            neden: m.header.get('Kopru-Neden'),
            tuketici: m.header.get('Kopru-Tuketici'),
            teslim: Number(m.header.get('Kopru-Teslim-Sayisi')),
            veri: new TextDecoder().decode(m.data),
          };
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`DLQ kaydı bulunamadı (özgün sıra ${String(streamSirasi)})`);
  }

  it('YenidenDene: gecikmeli yeniden teslim edilir ve sonunda islenir', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    const zamanlar: number[] = [];
    await baslat(
      ad,
      kurumId,
      (_tx, _olay, baglam) => {
        zamanlar.push(Date.now());
        if (baglam.teslimSayisi < 3) throw new YenidenDene('üyelik kopyası yok');
        return Promise.resolve();
      },
      { yenidenDeneGecikmeleriMs: [300, 600], backoffMs: [10, 10], maxDeliver: 6 },
    );
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(async () => (await islenenSayisi(ad, olay.id)) === 1);

    expect(zamanlar).toHaveLength(3);
    const [z1 = 0, z2 = 0, z3 = 0] = zamanlar;
    expect(z2 - z1).toBeGreaterThanOrEqual(280);
    expect(z3 - z2).toBeGreaterThanOrEqual(580);
  });

  it('KaliciHata: tek denemede DLQ ve term; yeniden teslim yok', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    await baslat(ad, kurumId, () => {
      cagri++;
      throw new KaliciHata('dosya başka kuruma ait');
    });
    const olay = baglandi(kurumId);
    const seq = await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    const dlq = await dlqOkuSira(ad, 'evt.ortak.dosya.baglandi.v1', seq);
    expect(dlq.neden).toBe('kalici_hata');
    expect(dlq.teslim).toBe(1);
    await bekleyenYok(ad);
    expect(cagri).toBe(1);
    expect(await islenenSayisi(ad, olay.id)).toBe(0);
  });

  it("surekli hata: max_deliver asilinca DLQ'ya dusar", async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    await baslat(
      ad,
      kurumId,
      () => {
        cagri++;
        throw new Error('hep başarısız');
      },
      { maxDeliver: 3, backoffMs: [50, 50] },
    );
    const olay = baglandi(kurumId);
    const seq = await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    const dlq = await dlqOkuSira(ad, 'evt.ortak.dosya.baglandi.v1', seq);
    expect(dlq.neden).toBe('teslim_siniri_asildi');
    expect(dlq.teslim).toBe(3);
    expect(cagri).toBe(3);
    await bekleyenYok(ad);
  });

  it('eszamanlilik siniri asilmaz ve tum mesajlar islenir', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let aktif = 0;
    let enCok = 0;
    let bitti = 0;
    await baslat(
      ad,
      kurumId,
      async () => {
        aktif++;
        enCok = Math.max(enCok, aktif);
        await new Promise((r) => setTimeout(r, 80));
        aktif--;
        bitti++;
      },
      { esZamanli: 2 },
    );
    for (let i = 0; i < 6; i++) {
      const olay = baglandi(kurumId);
      await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    }
    await bekle(() => bitti === 6);
    expect(enCok).toBe(2);
  });

  it('kapanista calisan is bitirilir: commit olur, ack verilir, yeni mesaj alinmaz', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let basladi = false;
    let cagri = 0;
    const t = await baslat(ad, kurumId, async (tx, olay) => {
      cagri++;
      basladi = true;
      await new Promise((r) => setTimeout(r, 500));
      await tx.execute(
        sql`insert into ${sql.identifier(schema)}.kayit (olay_id, kurum_id) values (${olay.id}, ${olay.kurumId})`,
      );
    });
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(() => basladi);
    await t.stop();

    expect(await islenenSayisi(ad, olay.id)).toBe(1);
    const kayitlar = await db.sql.unsafe(`select 1 from ${schema}.kayit where olay_id = $1`, [
      olay.id,
    ]);
    expect(kayitlar).toHaveLength(1);
    await bekleyenYok(ad);

    // Durdurulmus tuketici yeni mesaj almaz.
    const sonraki = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(sonraki), sonraki.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(cagri).toBe(1);
    expect(await islenenSayisi(ad, sonraki.id)).toBe(0);
  });

  it('ayni durable adla yeniden baslatma ayarlari gunceller, islenmis olaylari tekrar islemez', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    const isle = () => {
      cagri++;
      return Promise.resolve();
    };
    const ilk = await baslat(ad, kurumId, isle);
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(() => cagri === 1);
    await ilk.stop();
    await baslat(ad, kurumId, isle, { maxDeliver: 4, backoffMs: [1000, 2000] });
    const bilgi = await jsm.consumers.info('EVENTS', ad.replaceAll('.', '_'));
    expect(bilgi.config.max_deliver).toBe(4);
    expect(bilgi.config.filter_subjects).toEqual([
      'evt.ortak.dosya.baglandi.*',
      'evt.ortak.dosya.birakildi.*',
    ]);
    await bekleyenYok(ad);
    expect(cagri).toBe(1);
  });

  it('varsayilan tuketici ayarlari ADR 0002 ile uyumlu', async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    await baslat(ad, kurumId, () => Promise.resolve());
    const { config } = await jsm.consumers.info('EVENTS', ad.replaceAll('.', '_'));
    expect(config.ack_policy).toBe('explicit');
    expect(config.max_deliver).toBe(8);
    // Sunucu, backoff tanimliyken ack_wait'i backoff[0] olarak raporlar; 30s `ack_wait` istegi yine gonderilir.
    expect(config.ack_wait).toBe(1_000_000_000);
    expect(config.backoff).toEqual([1, 5, 30, 120, 600, 1800, 3600].map((s) => s * 1_000_000_000));
    const dlq = await jsm.streams.info(DLQ_STREAM);
    expect(dlq.config.max_age).toBe(30 * 24 * 3600 * 1_000_000_000);
    expect(dlq.config.subjects).toContain('dlq.>');
  });

  it("backoff[0]'dan uzun suren isleyici yeniden teslim edilmez (working nabzi)", async () => {
    const kurumId = randomUUID();
    const ad = yeniAd();
    let cagri = 0;
    const tekrarlar: unknown[] = [];
    await baslat(
      ad,
      kurumId,
      async () => {
        cagri++;
        await new Promise((r) => setTimeout(r, 1500));
      },
      {
        backoffMs: [400, 400],
        maxDeliver: 4,
        log: {
          info: (_obj: unknown, mesaj?: string) => {
            // Ikinci teslim islemin ortasinda gelirse "tekrar teslim edilen olay atlandi" loglanir.
            if (mesaj?.includes('tekrar teslim')) tekrarlar.push(mesaj);
          },
          warn: () => undefined,
          error: () => undefined,
        },
      },
    );
    const olay = baglandi(kurumId);
    await yayimla('evt.ortak.dosya.baglandi.v1', JSON.stringify(olay), olay.id);
    await bekle(async () => (await islenenSayisi(ad, olay.id)) === 1);
    await bekleyenYok(ad);
    expect(cagri).toBe(1);
    expect(tekrarlar).toEqual([]);
  });

  it('max_deliver backoff uzunlugundan buyuk olmali', async () => {
    await expect(
      startConsumer({
        nats,
        db,
        tuketici: 'tst.kisa',
        olaylar: [ortakDosyaBaglandiV1],
        maxDeliver: 3,
        isle: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/max_deliver/);
  });

  it('gecersiz tuketici adi reddedilir', async () => {
    await expect(
      startConsumer({
        nats,
        db,
        tuketici: 'adsiz',
        olaylar: [ortakDosyaBaglandiV1],
        isle: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/tüketici adı/);
  });

  it('islenmisOlaylariTemizle 30 gunden eski satirlari siler', async () => {
    const ad = yeniAd();
    const eski = randomUUID();
    const yeni = randomUUID();
    await db.sql.unsafe(
      `insert into ${schema}.processed_events (tuketici, olay_id, islenme_zamani) values
        ($1, $2, now() - interval '31 days'), ($1, $3, now() - interval '29 days')`,
      [ad, eski, yeni],
    );
    const silinen = await islenmisOlaylariTemizle(db, { tablo: `${schema}.processed_events` });
    expect(silinen).toBeGreaterThanOrEqual(1);
    expect(await islenenSayisi(ad, eski)).toBe(0);
    expect(await islenenSayisi(ad, yeni)).toBe(1);
  });
});
