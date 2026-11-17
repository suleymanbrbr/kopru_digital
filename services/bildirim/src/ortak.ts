import type { Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

export const OUTBOX_TABLOSU = 'ortak.outbox';
export const VARSAYILAN_SAAT_DILIMI = 'Europe/Istanbul';

export type Islem = Pick<Tx, 'execute'>;

export const yeniId = () => uuidv7();

/** `timestamptz` -> ISO 8601 (UTC, mikrosaniye: imlec sayfalamasi icin kayipsiz). */
export const isoMikro = (kolon: string) =>
  sql.raw(`to_char(${kolon} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

/** `timestamptz` -> ISO 8601 (UTC, ms). */
export const iso = (kolon: string) =>
  sql.raw(`to_char(${kolon} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

/** Kurum durumu (kopya); kopya yoksa `aktif` varsayilir. */
export async function kurumDurumu(tx: Islem, kurumId: string): Promise<string> {
  const [k] = await tx.execute<{ durum: string }>(sql`
    select durum from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`);
  return k?.durum ?? 'aktif';
}
