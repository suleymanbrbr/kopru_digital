import { EVENT_SUBJECT_PREFIX, type EventDefinition, type EventOf } from '@kopru/contracts';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import {
  AckPolicy,
  DeliverPolicy,
  RetentionPolicy,
  StorageType,
  headers as natsHeaders,
  nanos,
  type JsMsg,
  type NatsConnection,
} from 'nats';

import { kiraciBaglaminiAyarla, type Database, type Tx } from './db.js';
import { ensureEventStream } from './outbox.js';
import { tableRef } from './sql-adi.js';

/**
 * Idempotent olay tuketicisi (ADR 0002 "Idempotent tuketiciler", "Teslim, yeniden deneme ve DLQ").
 *
 * Her mesaj TEK veritabani isleminde islenir: `processed_events` satiri `ON CONFLICT DO NOTHING` ile
 * eklenir (satir yoksa mesaj daha once islenmistir: ack), isleyici ayni `tx` ile calisir, commit'ten
 * SONRA ack verilir. Boylece at-least-once teslim, tek seferlik etkiye donusur.
 */

export const DLQ_STREAM = 'DLQ';
export const DLQ_SUBJECT_PREFIX = 'dlq';
/** DLQ kayitlari 30 gun saklanir (ADR 0002). */
export const DLQ_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** ADR 0002: `ack_wait=30s`, `max_deliver=8`, `backoff=[1s, 5s, 30s, 2m, 10m, 30m, 1h]`. */
export const TUKETICI_ACK_WAIT_MS = 30_000;
export const TUKETICI_MAX_DELIVER = 8;
export const TUKETICI_BACKOFF_MS: readonly number[] = [
  1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000, 3_600_000,
];
/** `YenidenDene` icin varsayilan gecikmeler (ADR 0002 "Sira varsayimlari"): 5s, 30s, 2m, 10m. */
export const YENIDEN_DENE_GECIKMELERI_MS: readonly number[] = [5_000, 30_000, 120_000, 600_000];
export const TUKETICI_ESZAMANLILIK = 8;
export const PROCESSED_EVENTS_SAKLAMA_GUN = 30;

/**
 * Isleyici "bagimli veri henuz yok (ornegin uyelik kopyasi), sonra tekrar dene" derken firlatir.
 * Islem geri alinir; mesaj gecikmeli `nak` ile yeniden teslim edilir. `max_deliver` asilirsa DLQ'ya duser.
 */
export class YenidenDene extends Error {
  constructor(
    message = 'Bağımlı veri henüz hazır değil, yeniden denenecek.',
    /** Verilmezse `YENIDEN_DENE_GECIKMELERI_MS` teslim sayisina gore secilir. */
    readonly gecikmeMs?: number,
  ) {
    super(message);
    this.name = 'YenidenDene';
  }
}

/** Yeniden denemenin anlamsiz oldugu is hatasi: islem geri alinir, mesaj DLQ'ya yazilip `term` edilir. */
export class KaliciHata extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KaliciHata';
  }
}

export interface TuketiciBaglami {
  /** NATS konusu, ornek `evt.ortak.dosya.baglandi.v1`. */
  konu: string;
  /** 1'den baslar; yeniden tesliminde artar. */
  teslimSayisi: number;
  streamSirasi: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
}

export type TuketiciKiraci =
  /**
   * Varsayilan. Islem, olaydaki `kurumId` ile RLS degiskenleri ayarlanarak (`withTenant` ile ayni
   * `app.kurum_id`) calisir. `db` uygulama rolu (`*_app`) ile baglanmalidir; RLS atlanamaz.
   */
  | 'olaydan'
  /**
   * Kiraci degiskeni ayarlanmaz. Kiraciya bagli olmayan ya da kurumlar arasi isler icindir; `db` yalnizca
   * gereken tablolara yetkili (ya da sistem rolu) bir baglanti olmalidir.
   */
  | 'yok';

export interface TuketiciSecenekleri<TOlaylar extends readonly EventDefinition[]> {
  nats: Pick<NatsConnection, 'jetstream' | 'jetstreamManager'>;
  db: Pick<Database, 'orm'>;
  /** `{servis}.{amac}` (ADR 0002), ornek `medya.baglama`. Durable consumer adi: noktalar `_` olur. */
  tuketici: string;
  /** Tuketilen olay tanimlari; her birinin tum surumleri filtrelenir, bilinmeyen surum DLQ'ya gider. */
  olaylar: TOlaylar;
  /** Isleyici; `tx` ile yapilan yazimlar `processed_events` ile birlikte commit/rollback olur. */
  isle: (tx: Tx, olay: EventOf<TOlaylar[number]>, baglam: TuketiciBaglami) => Promise<void>;
  log?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  kiraci?: TuketiciKiraci;
  /** Varsayilan `EVENTS` (`ensureEventStream`). */
  stream?: string;
  /** Eszamanli islenen en cok mesaj (varsayilan 8). */
  esZamanli?: number;
  ackWaitMs?: number;
  maxDeliver?: number;
  /** Sunucu tarafi yeniden teslim gecikmeleri (`nak` gecikmesi olarak da kullanilir). */
  backoffMs?: readonly number[];
  yenidenDeneGecikmeleriMs?: readonly number[];
  /** Varsayilan `ortak.processed_events`. */
  processedEventsTablosu?: string;
  /**
   * Consumer ilk kez olusturulurken nereden baslanacagi. `hepsi` (varsayilan): stream'de kalan tum
   * olaylar (yeni servis gecmisi yakalar). `yeni`: yalniz olusturulduktan sonra yayimlananlar; paylasilan
   * `EVENTS` stream'inde baska sureclerin olaylarini gormemesi gereken testler icindir. Var olan
   * consumer'da etkisizdir (NATS `deliver_policy` sonradan degistirilemez).
   */
  baslangic?: 'hepsi' | 'yeni';
}

export interface Tuketici {
  /** Durable consumer adi. */
  readonly ad: string;
  /** Yeni mesaj almayi birakir, calisan islerin bitmesini (commit + ack) bekler. */
  stop(): Promise<void>;
}

const tuketiciAdi = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** `DLQ` stream'i yoksa olusturur (`dlq.>`, `max_age=30d`). Idempotent. */
export async function ensureDlqStream(
  nats: Pick<NatsConnection, 'jetstreamManager'>,
  name = DLQ_STREAM,
): Promise<void> {
  const jsm = await nats.jetstreamManager();
  try {
    await jsm.streams.info(name);
  } catch {
    await jsm.streams.add({
      name,
      subjects: [`${DLQ_SUBJECT_PREFIX}.>`],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_age: nanos(DLQ_MAX_AGE_MS),
    });
  }
}

/** `PROCESSED_EVENTS_SAKLAMA_GUN`'den eski `processed_events` satirlarini siler; silinen sayiyi dondurur. */
export async function islenmisOlaylariTemizle(
  db: Pick<Database, 'orm'>,
  options: { gun?: number; tablo?: string } = {},
): Promise<number> {
  const gun = options.gun ?? PROCESSED_EVENTS_SAKLAMA_GUN;
  const silinen = await db.orm.execute(
    sql`delete from ${tableRef(options.tablo ?? 'ortak.processed_events')}
        where islenme_zamani < now() - make_interval(days => ${gun})
        returning 1`,
  );
  return silinen.length;
}

function sec(liste: readonly number[], teslimSayisi: number, varsayilan: number): number {
  if (liste.length === 0) return varsayilan;
  return liste[Math.min(Math.max(teslimSayisi - 1, 0), liste.length - 1)] ?? varsayilan;
}

/**
 * Durable pull consumer olusturur (varsa ayarlarini gunceller) ve mesajlari isler.
 * Cagiran `stop()`'u kapanista cagirir (`runWorker` `setup` temizleyicisi ile uyumlu).
 */
export async function startConsumer<const TOlaylar extends readonly EventDefinition[]>(
  options: TuketiciSecenekleri<TOlaylar>,
): Promise<Tuketici> {
  const { nats, db, tuketici, olaylar, isle } = options;
  if (!tuketiciAdi.test(tuketici)) {
    throw new Error(`Geçersiz tüketici adı (beklenen "{servis}.{amac}"): ${tuketici}`);
  }
  if (olaylar.length === 0) throw new Error('Tüketici için en az bir olay tanımı gerekli');
  const log = options.log ?? {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const kiraci = options.kiraci ?? 'olaydan';
  const stream = options.stream ?? 'EVENTS';
  const esZamanli = Math.max(1, options.esZamanli ?? TUKETICI_ESZAMANLILIK);
  const ackWaitMs = options.ackWaitMs ?? TUKETICI_ACK_WAIT_MS;
  const maxDeliver = options.maxDeliver ?? TUKETICI_MAX_DELIVER;
  const backoffMs = options.backoffMs ?? TUKETICI_BACKOFF_MS;
  const yenidenDene = options.yenidenDeneGecikmeleriMs ?? YENIDEN_DENE_GECIKMELERI_MS;
  if (backoffMs.length >= maxDeliver) {
    throw new Error(
      `max_deliver (${String(maxDeliver)}) backoff uzunluğundan (${String(backoffMs.length)}) büyük olmalı`,
    );
  }
  const processed = tableRef(options.processedEventsTablosu ?? 'ortak.processed_events');
  const ad = tuketici.replaceAll('.', '_');
  const decoder = new TextDecoder();
  const tanimlar = new Map<string, EventDefinition>(olaylar.map((t) => [t.subject, t]));

  await ensureEventStream(nats, stream);
  await ensureDlqStream(nats);
  const jsm = await nats.jetstreamManager();
  const guncellenebilir = {
    ack_wait: nanos(ackWaitMs),
    max_deliver: maxDeliver,
    backoff: backoffMs.map((ms) => nanos(ms)),
    max_ack_pending: esZamanli * 4,
    // Her olay turunun TUM surumleri (`evt.<tur>.*`): bilinmeyen surum sessizce atlanmaz, DLQ'ya gider.
    filter_subjects: [...new Set(olaylar.map((t) => `${EVENT_SUBJECT_PREFIX}.${t.type}.*`))],
  };
  const varMi = await jsm.consumers.info(stream, ad).then(
    () => true,
    () => false,
  );
  if (varMi) {
    await jsm.consumers.update(stream, ad, guncellenebilir);
  } else {
    await jsm.consumers.add(stream, {
      ...guncellenebilir,
      durable_name: ad,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: options.baslangic === 'yeni' ? DeliverPolicy.New : DeliverPolicy.All,
    });
  }

  const js = nats.jetstream();
  const consumer = await js.consumers.get(stream, ad);

  /** Mesaji DLQ'ya kopyalar ve `term` eder. DLQ yazimi basarisizsa mesaj kaybolmasin diye `nak` edilir. */
  async function dlqVeTerm(msg: JsMsg, neden: string, hata?: unknown): Promise<void> {
    const ayrinti = hata instanceof Error ? `${hata.name}: ${hata.message}` : undefined;
    try {
      const h = natsHeaders();
      h.set('Kopru-Tuketici', tuketici);
      h.set('Kopru-Konu', msg.subject);
      h.set('Kopru-Neden', neden);
      h.set('Kopru-Teslim-Sayisi', String(msg.info.deliveryCount));
      h.set('Kopru-Stream-Sirasi', String(msg.info.streamSequence));
      if (ayrinti) h.set('Kopru-Hata', ayrinti.slice(0, 500));
      await js.publish(`${DLQ_SUBJECT_PREFIX}.${tuketici}.${msg.subject}`, msg.data, {
        headers: h,
        msgID: `dlq-${ad}-${String(msg.info.streamSequence)}`,
      });
    } catch (err) {
      log.error(
        { err, tuketici, konu: msg.subject, neden },
        'DLQ yazımı başarısız; mesaj yeniden denenecek',
      );
      msg.nak(sec(backoffMs, msg.info.deliveryCount, 5_000));
      return;
    }
    log.warn(
      {
        tuketici,
        konu: msg.subject,
        neden,
        streamSirasi: msg.info.streamSequence,
        teslimSayisi: msg.info.deliveryCount,
        hata: ayrinti,
      },
      'olay DLQ’ya yazıldı',
    );
    msg.term(neden);
  }

  /**
   * `backoff` tanimliyken sunucu ilk teslimden `backoff[0]` (1s) sonra ack gelmediyse yeniden teslim eder
   * (`ack_wait` yerine gecer). Uzun suren isleyici ayni anda ikinci kez teslim edilmesin diye isleme
   * suresince `working()` ile sayac sifirlanir.
   */
  const nabizMs = Math.max(200, Math.floor(Math.min(ackWaitMs, backoffMs[0] ?? ackWaitMs) / 2));
  function mesajIsle(msg: JsMsg): Promise<void> {
    const nabiz = setInterval(() => {
      try {
        msg.working();
      } catch {
        // baglanti kopmus olabilir; mesaj ack_wait sonunda yeniden teslim edilir
      }
    }, nabizMs);
    return mesajIsleAsil(msg).finally(() => {
      clearInterval(nabiz);
    });
  }

  async function mesajIsleAsil(msg: JsMsg): Promise<void> {
    const teslimSayisi = msg.info.deliveryCount;
    const tanim = tanimlar.get(msg.subject);
    if (!tanim) return dlqVeTerm(msg, 'bilinmeyen_konu_veya_surum');

    let ham: unknown;
    try {
      ham = JSON.parse(decoder.decode(msg.data));
    } catch {
      return dlqVeTerm(msg, 'gecersiz_json');
    }
    const sonuc = tanim.schema.safeParse(ham);
    if (!sonuc.success) {
      // Yuk degerleri loglanmaz; yalnizca hata yollari ve kodlari.
      const sorunlar = sonuc.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join(', ');
      return dlqVeTerm(msg, 'gecersiz_yuk', new Error(sorunlar));
    }
    const olay = sonuc.data as EventOf<TOlaylar[number]>;
    const baglam: TuketiciBaglami = {
      konu: msg.subject,
      teslimSayisi,
      streamSirasi: msg.info.streamSequence,
      log,
    };

    try {
      const yeni = await db.orm.transaction(async (tx) => {
        const eklenen = await tx.execute(
          sql`insert into ${processed} (tuketici, olay_id) values (${tuketici}, ${(olay as { id: string }).id})
              on conflict do nothing returning olay_id`,
        );
        if (eklenen.length === 0) return false;
        if (kiraci === 'olaydan') {
          await kiraciBaglaminiAyarla(tx, { kurumId: (olay as { kurumId: string }).kurumId });
        }
        await isle(tx, olay, baglam);
        return true;
      });
      if (!yeni) log.info({ tuketici, konu: msg.subject }, 'tekrar teslim edilen olay atlandı');
      msg.ack();
    } catch (err) {
      if (err instanceof KaliciHata) return dlqVeTerm(msg, 'kalici_hata', err);
      if (teslimSayisi >= maxDeliver) return dlqVeTerm(msg, 'teslim_siniri_asildi', err);
      const gecikme =
        err instanceof YenidenDene
          ? (err.gecikmeMs ?? sec(yenidenDene, teslimSayisi, 5_000))
          : sec(backoffMs, teslimSayisi, 1_000);
      log.warn(
        { tuketici, konu: msg.subject, teslimSayisi, gecikme, hata: (err as Error).message },
        err instanceof YenidenDene ? 'olay hazır değil, yeniden denenecek' : 'olay işlenemedi',
      );
      msg.nak(gecikme);
    }
  }

  const mesajlar = await consumer.consume({ max_messages: esZamanli });
  const calisan = new Set<Promise<void>>();
  const dongu = (async () => {
    for await (const msg of mesajlar) {
      const is: Promise<void> = mesajIsle(msg)
        .catch((err: unknown) => {
          // Beklenmeyen hata (ornegin NATS kopmasi): mesaj ack_wait sonunda yeniden teslim edilir.
          log.error({ err, tuketici, konu: msg.subject }, 'mesaj işleme beklenmeyen hata verdi');
        })
        .finally(() => calisan.delete(is));
      calisan.add(is);
      if (calisan.size >= esZamanli) await Promise.race(calisan);
    }
  })();

  log.info({ tuketici, stream, esZamanli }, 'olay tüketicisi başladı');

  let durdu: Promise<void> | undefined;
  return {
    ad,
    stop() {
      durdu ??= (async () => {
        await mesajlar.close();
        await dongu;
        await Promise.allSettled(calisan);
        log.info({ tuketici }, 'olay tüketicisi durdu');
      })();
      return durdu;
    },
  };
}
