import { withTenant } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[api/tenant.test] DATABASE_URL tanımlı değil: DB testleri atlanıyor.');
}

const kurumId = '0190b2f0-7c3a-7a1e-8d5b-3f2a1c9e4b6d';

describe.skipIf(!databaseUrl)('withTenant (gercek PostgreSQL)', () => {
  const service = buildService(
    loadServiceEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: databaseUrl }),
  );
  afterAll(() => service.stop());

  it('app.kurum_id islem icinde ayarlanir, islem sonrasi kalmaz', async () => {
    const { db } = service.app;
    if (!db) throw new Error('DATABASE_URL ile başlatılan serviste db olmalı');

    const inside = await withTenant(db, { kurumId, roller: ['yonetici'] }, async (tx) => {
      const rows = await tx.execute<{ kurum_id: string; roller: string }>(
        sql`select current_setting('app.kurum_id') as kurum_id, current_setting('app.roller') as roller`,
      );
      return rows[0];
    });
    expect(inside).toEqual({ kurum_id: kurumId, roller: 'yonetici' });

    const outside = await db.orm.execute<{ kurum_id: string | null }>(
      sql`select current_setting('app.kurum_id', true) as kurum_id`,
    );
    expect(outside[0]?.kurum_id ?? '').toBe('');
  });

  it('/ready veritabanini kontrol eder', async () => {
    const res = await service.app.inject({ url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { db: 'ok' } });
  });
});

describe('/ready veritabani ulasilamazsa', () => {
  const service = buildService(
    loadServiceEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://api:api@127.0.0.1:1/api',
    }),
  );
  afterAll(() => service.stop());

  it('503 doner, /health etkilenmez', async () => {
    const ready = await service.app.inject({ url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'not_ready', checks: { db: 'hata' } });
    expect((await service.app.inject({ url: '/health' })).statusCode).toBe(200);
  });
});
