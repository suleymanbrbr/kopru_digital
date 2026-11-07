import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { z } from 'zod';

export type Orm = PostgresJsDatabase;
/** `withTenant` / `orm.transaction` icindeki islem nesnesi. */
export type Tx = Parameters<Parameters<Orm['transaction']>[0]>[0];

export interface Database {
  /** Ham postgres.js istemcisi (migration, health, LISTEN vb. icin). */
  sql: Sql;
  orm: Orm;
  close(): Promise<void>;
}

export function createDb(options: { url: string; max?: number }): Database {
  const client = postgres(options.url, {
    max: options.max ?? 10,
    onnotice: () => undefined,
  });
  return {
    sql: client,
    orm: drizzle(client),
    close: () => client.end({ timeout: 5 }),
  };
}

export async function checkDb(db: Pick<Database, 'sql'>): Promise<void> {
  await db.sql`select 1`;
}

export const tenantContextSchema = z.object({
  kurumId: z.uuid(),
  kullaniciId: z.string().min(1).optional(),
  roller: z.array(z.string().regex(/^[a-z0-9_]+$/)).default([]),
});

export type TenantContext = z.input<typeof tenantContextSchema>;

/**
 * Bir islem (transaction) acar ve RLS politikalarinin okuyacagi oturum degiskenlerini
 * `set_config(..., is_local => true)` ile ayarlar; degiskenler islem bitince kaybolur,
 * boylece havuzdaki baglantilar arasinda tenant sizintisi olmaz.
 *
 * Politikalarda: `current_setting('app.kurum_id', true)::uuid`
 */
export async function withTenant<T>(
  db: Pick<Database, 'orm'>,
  context: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const { kurumId, kullaniciId, roller } = tenantContextSchema.parse(context);
  return db.orm.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kurum_id', ${kurumId}, true),
                 set_config('app.kullanici_id', ${kullaniciId ?? ''}, true),
                 set_config('app.roller', ${roller.join(',')}, true)`,
    );
    return fn(tx);
  });
}
