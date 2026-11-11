import type { Tx } from '@kopru/service-kit';
import { eq, sql, type SQL } from 'drizzle-orm';

import { dersKaynaklari, dersler } from '../../db/schema.js';
import { kurumSaatDilimi } from './ders-ortak.js';
import { MIKROSANIYE_ISO } from './imlec.js';
import { tarihEkle, yerelDenUtc } from './zaman.js';

/** Liste suzgecleri (Kayitlarim ve personel listesi ortak). */
export interface KaynakSuzgeci {
  tur?: 'kayit' | 'materyal' | undefined;
  grup_id?: string | undefined;
  brans_kodu?: string | undefined;
  ders_id?: string | undefined;
  konu_id?: string | undefined;
  baslangic?: string | undefined;
  bitis?: string | undefined;
}

/** `kaynak.created_at` mikrosaniye hassasiyetinde metin: imlec tam hassasiyetle tasinir. */
export const olusturmaImleci = sql<string>`to_char(${dersKaynaklari.created_at} at time zone 'UTC', ${sql.raw(MIKROSANIYE_ISO)})`;

/**
 * Suzgec kosullari. Tarih araligi dersin tarihine (materyalde eklenme tarihine) bakar ve kurumun yerel
 * gunleriyle yorumlanir (ust sinir dahil).
 */
export async function suzgecKosullari(tx: Tx, kurumId: string, s: KaynakSuzgeci): Promise<SQL[]> {
  const kosullar: SQL[] = [];
  if (s.tur) kosullar.push(eq(dersKaynaklari.tur, s.tur));
  if (s.grup_id) kosullar.push(eq(dersKaynaklari.grup_id, s.grup_id));
  if (s.ders_id) kosullar.push(eq(dersKaynaklari.ders_id, s.ders_id));
  if (s.konu_id) kosullar.push(eq(dersKaynaklari.konu_id, s.konu_id));
  if (s.brans_kodu) kosullar.push(eq(dersler.brans_kodu, s.brans_kodu));
  if (s.baslangic || s.bitis) {
    const dilim = await kurumSaatDilimi(tx, kurumId);
    const tarih = sql`coalesce(${dersler.baslangic_at}, ${dersKaynaklari.created_at})`;
    if (s.baslangic) {
      const alt = yerelDenUtc(s.baslangic, '00:00', dilim);
      kosullar.push(sql`${tarih} >= ${alt.toISOString()}::timestamptz`);
    }
    if (s.bitis) {
      const ust = yerelDenUtc(tarihEkle(s.bitis, 1), '00:00', dilim);
      kosullar.push(sql`${tarih} < ${ust.toISOString()}::timestamptz`);
    }
  }
  return kosullar;
}
