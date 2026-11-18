import { sql, type SQL } from 'drizzle-orm';

export type { SistemBaglami } from './with-sistem.js';

/**
 * `timestamptz` sutununu ISO 8601 (UTC) metin olarak secer: drizzle `execute` ham sorgularda zaman
 * damgalarini `Date`e cevirmez (metin doner), bu bicim `new Date(...)` ile guvenle ayristirilir.
 */
export const isoZaman = (kolon: string): SQL =>
  sql.raw(`to_char(${kolon} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

/** drizzle `sql` sablonu dizi parametrelerini `(a, b)` olarak acar; PostgreSQL dizisi icin bunu kullanin. */
export function pgDizi(oge: readonly string[], tur: 'text' | 'uuid' = 'text'): SQL {
  if (oge.length === 0) return sql.raw(`'{}'::${tur}[]`);
  return sql`array[${sql.join(
    oge.map((o) => sql`${o}`),
    sql`, `,
  )}]::${sql.raw(tur)}[]`;
}
