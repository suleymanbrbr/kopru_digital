import { sql, type SQL } from 'drizzle-orm';

export const identifier = /^[a-z_][a-z0-9_]*$/i;

/** `sema.tablo` ya da `tablo` adini guvenli sekilde SQL tanimlayicisina cevirir. */
export function tableRef(table: string): SQL {
  const parts = table.split('.');
  if (parts.length > 2 || !parts.every((part) => identifier.test(part))) {
    throw new Error(`Geçersiz tablo adı: ${table}`);
  }
  return sql.join(
    parts.map((part) => sql.identifier(part)),
    sql.raw('.'),
  );
}
