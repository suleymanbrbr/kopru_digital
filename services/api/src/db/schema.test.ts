import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { dbYok, testDb } from '../test/yardimcilar.js';
import * as semalar from './schema.js';

describe.skipIf(dbYok())('Drizzle semasi == migration sonucu', () => {
  const urls = testDb();
  const sql = postgres(urls?.ownerUrl ?? 'postgres://x', { max: 1, onnotice: () => undefined });
  afterAll(() => sql.end());

  it('her Drizzle tablosunun sutunlari veritabaniyla birebir ayni', async () => {
    const tablolar = Object.values(semalar).filter((v) => is(v, PgTable));
    expect(tablolar.length).toBeGreaterThan(15);
    for (const tablo of tablolar) {
      const { name, schema, columns } = getTableConfig(tablo);
      const gercek = await sql<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = ${schema ?? 'public'} and table_name = ${name}`;
      expect(gercek.map((c) => c.column_name).sort(), `${schema ?? ''}.${name}`).toEqual(
        columns.map((c) => c.name).sort(),
      );
    }
  });
});
