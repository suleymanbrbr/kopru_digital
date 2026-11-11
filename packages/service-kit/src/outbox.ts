import { readFile } from 'node:fs/promises';

import {
  EVENT_SUBJECT_PREFIX,
  eventEnvelopeSchema,
  eventSubject,
  type AnyEventEnvelope,
} from '@kopru/contracts';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { NatsConnection } from 'nats';

import type { Database, Orm } from './db.js';
import { identifier, tableRef } from './sql-adi.js';

/** outbox tablosu icin SQL migration sablonunu verilen sema ile doldurur. */
export async function renderOutboxMigration(schema = 'public'): Promise<string> {
  if (!identifier.test(schema)) throw new Error(`Geçersiz şema adı: ${schema}`);
  const template = await readFile(new URL('../migrations/outbox.sql', import.meta.url), 'utf8');
  return template.replaceAll('{{schema}}', schema);
}

export interface OutboxOptions {
  /** Varsayilan: `outbox` (search_path). Sema ile: `platform.outbox`. */
  table?: string;
}

/**
 * Olayi, is verisini yazan AYNI transaction icinde outbox'a yazar. Gonderim relay'in isidir.
 * `tx`, `withTenant` veya `db.orm.transaction` icinden gelen islem nesnesidir.
 */
export async function publishInTx(
  tx: Pick<Orm, 'execute'>,
  event: AnyEventEnvelope,
  options: OutboxOptions = {},
): Promise<void> {
  const parsed = eventEnvelopeSchema.parse(event);
  await tx.execute(
    sql`insert into ${tableRef(options.table ?? 'outbox')} (id, kurum_id, subject, payload)
        values (${parsed.id}, ${parsed.kurumId}, ${eventSubject(parsed)}, ${JSON.stringify(parsed)}::jsonb)`,
  );
}

/** Relay'in ihtiyac duydugu en kucuk NATS yuzeyi (testte sahte ile degistirilebilir). */
export interface JetStreamPublisher {
  jetstream(): {
    publish(subject: string, data: Uint8Array, options?: { msgID?: string }): Promise<unknown>;
  };
}

export interface OutboxRelayOptions extends OutboxOptions {
  db: Pick<Database, 'orm'>;
  nats: JetStreamPublisher;
  logger?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  batchSize?: number;
  intervalMs?: number;
}

export interface OutboxRelay {
  stop(): Promise<void>;
}

interface OutboxRow {
  id: string;
  subject: string;
  payload: string;
}

/**
 * Gonderilmemis outbox satirlarini `FOR UPDATE SKIP LOCKED` ile alip JetStream'e yayinlar.
 * Birden fazla relay (replica) guvenle paralel calisir. `msgID = olay id`, JetStream'in
 * duplicate penceresi sayesinde tekrar gonderim (at-least-once) cift mesaj uretmez.
 * Bir mesaj basarisiz olursa sira korunmasi icin tur durur; basarili olanlar commit edilir.
 */
export function startOutboxRelay(options: OutboxRelayOptions): OutboxRelay {
  const { db, nats, logger } = options;
  const table = tableRef(options.table ?? 'outbox');
  const batchSize = options.batchSize ?? 50;
  const intervalMs = options.intervalMs ?? 1000;
  const encoder = new TextEncoder();
  const abort = new AbortController();

  const drainOnce = () =>
    db.orm.transaction(async (tx) => {
      const rows = await tx.execute<OutboxRow & Record<string, unknown>>(
        sql`select id, subject, payload::text as payload from ${table}
            where sent_at is null
            order by created_at, id
            limit ${batchSize}
            for update skip locked`,
      );

      let sent = 0;
      for (const row of rows) {
        try {
          await nats
            .jetstream()
            .publish(row.subject, encoder.encode(row.payload), { msgID: row.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await tx.execute(
            sql`update ${table} set attempts = attempts + 1, last_error = ${message} where id = ${row.id}`,
          );
          logger?.warn({ err, eventId: row.id, subject: row.subject }, 'outbox yayını başarısız');
          break;
        }
        await tx.execute(
          sql`update ${table} set sent_at = now(), attempts = attempts + 1, last_error = null where id = ${row.id}`,
        );
        sent++;
      }
      return { fetched: rows.length, sent };
    });

  const loop = (async () => {
    while (!abort.signal.aborted) {
      try {
        const { fetched, sent } = await drainOnce();
        if (fetched === batchSize && sent === fetched) continue;
      } catch (err) {
        logger?.error({ err }, 'outbox relay turu başarısız');
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, intervalMs);
        abort.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  })();

  logger?.info({ table: options.table ?? 'outbox', batchSize, intervalMs }, 'outbox relay başladı');

  return {
    async stop() {
      abort.abort();
      await loop;
    },
  };
}

/** Olay stream'i yoksa olusturur (`evt.>`). Idempotent. */
export async function ensureEventStream(
  nats: Pick<NatsConnection, 'jetstreamManager'>,
  name = 'EVENTS',
): Promise<void> {
  const jsm = await nats.jetstreamManager();
  try {
    await jsm.streams.info(name);
  } catch {
    await jsm.streams.add({ name, subjects: [`${EVENT_SUBJECT_PREFIX}.>`] });
  }
}
