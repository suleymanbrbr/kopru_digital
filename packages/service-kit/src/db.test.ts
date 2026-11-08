import { dersYoklamaKaydedildiV1 } from '@kopru/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb, withTenant, type Database } from './db.js';
import {
  publishInTx,
  renderOutboxMigration,
  startOutboxRelay,
  type JetStreamPublisher,
} from './outbox.js';

const url = process.env.DATABASE_URL ?? '';
if (!url) {
  console.warn('[service-kit/db.test] DATABASE_URL tanımlı değil: DB testleri atlanıyor.');
}

const kurumId = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';
const schema = 'kit_test';

describe.skipIf(!url)('db + outbox (gercek PostgreSQL)', () => {
  let db: Database;
  const query = <T extends object>(text: string) => db.sql.unsafe<T[]>(text);

  beforeAll(async () => {
    db = createDb({ url, max: 4 });
    await db.sql.unsafe(`drop schema if exists ${schema} cascade; create schema ${schema}`);
    await db.sql.unsafe(await renderOutboxMigration(schema));
  });

  afterAll(async () => {
    await db.sql.unsafe(`drop schema if exists ${schema} cascade`);
    await db.close();
  });

  const event = () =>
    dersYoklamaKaydedildiV1.create({
      kurumId,
      actor: { tur: 'sistem', id: 'test' },
      correlationId: 'corr-1',
      data: {
        yoklama_id: kurumId,
        ders_id: kurumId,
        grup_id: kurumId,
        ogrenci_id: kurumId,
        brans_kodu: 'matematik',
        durum: 'geldi',
        onceki_durum: null,
        gec_dakika: null,
        isaretlenme_at: '2026-11-07T10:00:00.000Z',
        yoklama_surumu: 1,
      },
    });

  it('withTenant degiskenleri islem icinde ayarlar ve sonra temizler', async () => {
    const inside = await withTenant(
      db,
      { kurumId, kullaniciId: 'u-1', roller: ['ogretmen', 'yonetici'] },
      async (tx) => {
        const rows = await tx.execute<{ k: string; u: string; r: string }>(
          sql`select current_setting('app.kurum_id') k, current_setting('app.kullanici_id') u, current_setting('app.roller') r`,
        );
        return rows[0];
      },
    );
    expect(inside).toEqual({ k: kurumId, u: 'u-1', r: 'ogretmen,yonetici' });

    const after = await db.orm.execute<{ k: string | null }>(
      sql`select current_setting('app.kurum_id', true) k`,
    );
    expect(after[0]?.k ?? '').toBe('');
  });

  it('withTenant gecersiz kurumId ile DB ye gitmeden reddeder', async () => {
    await expect(withTenant(db, { kurumId: 'x' }, () => Promise.resolve(1))).rejects.toThrow();
  });

  it('publishInTx is verisiyle birlikte commit/rollback olur', async () => {
    const table = `${schema}.outbox`;
    await expect(
      db.orm.transaction(async (tx) => {
        await publishInTx(tx, event(), { table });
        throw new Error('geri al');
      }),
    ).rejects.toThrow('geri al');
    expect((await query<{ c: number }>(`select count(*)::int c from ${table}`))[0]?.c).toBe(0);

    const committed = event();
    await db.orm.transaction((tx) => publishInTx(tx, committed, { table }));
    const rows = await query<{ id: string }>(`select id, subject, sent_at from ${table}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: committed.id,
      subject: 'evt.ders.yoklama.kaydedildi.v1',
      sent_at: null,
    });
  });

  it('relay bekleyen olayi JetStream e yayinlar ve gonderildi isaretler', async () => {
    const published: { subject: string; msgID: string | undefined; body: unknown }[] = [];
    const nats: JetStreamPublisher = {
      jetstream: () => ({
        publish: (subject, data, options) => {
          published.push({
            subject,
            msgID: options?.msgID,
            body: JSON.parse(new TextDecoder().decode(data)),
          });
          return Promise.resolve({});
        },
      }),
    };
    const pending = await query<{ id: string }>(
      `select id from ${schema}.outbox where sent_at is null`,
    );

    const relay = startOutboxRelay({ db, nats, intervalMs: 20, table: `${schema}.outbox` });
    await expect
      .poll(
        async () =>
          (
            await query<{ c: number }>(
              `select count(*)::int c from ${schema}.outbox where sent_at is null`,
            )
          )[0]?.c,
      )
      .toBe(0);
    await relay.stop();

    expect(published.map((p) => p.msgID)).toEqual(pending.map((row) => row.id));
    expect(published[0]?.subject).toBe('evt.ders.yoklama.kaydedildi.v1');
    expect(dersYoklamaKaydedildiV1.parse(published[0]?.body).kurumId).toBe(kurumId);
  });

  it('yayin hatasinda satir gonderilmemis kalir ve hata kaydedilir', async () => {
    const failing: JetStreamPublisher = {
      jetstream: () => ({ publish: () => Promise.reject(new Error('nats kapali')) }),
    };
    await db.orm.transaction((tx) => publishInTx(tx, event(), { table: `${schema}.outbox` }));

    const relay = startOutboxRelay({
      db,
      nats: failing,
      intervalMs: 20,
      table: `${schema}.outbox`,
    });
    await expect
      .poll(
        async () =>
          (
            await query<{ attempts: number }>(
              `select attempts from ${schema}.outbox where sent_at is null`,
            )
          )[0]?.attempts,
      )
      .toBeGreaterThanOrEqual(1);
    await relay.stop();

    const row = (
      await query<{ last_error: string }>(
        `select last_error from ${schema}.outbox where sent_at is null`,
      )
    )[0];
    expect(row?.last_error).toBe('nats kapali');
  });
});
