import { sql } from 'drizzle-orm';

import { VARSAYILAN_SAAT_DILIMI, type Islem } from '../ortak.js';

/** Kurumun saat dilimi (kopya yoksa `Europe/Istanbul`): bildirim metinlerindeki tarih/saat icin. */
export async function kurumSaatDilimi(tx: Islem, kurumId: string): Promise<string> {
  const [k] = await tx.execute<{ saat_dilimi: string }>(sql`
    select saat_dilimi from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`);
  return k?.saat_dilimi ?? VARSAYILAN_SAAT_DILIMI;
}

/** `10 Kasım Salı 15:00` (Turkce, verilen saat diliminde). */
export function tarihSaatMetni(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: saatDilimi,
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(an);
}

/** `15:00` (verilen saat diliminde). */
export function saatMetni(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: saatDilimi,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(an);
}
