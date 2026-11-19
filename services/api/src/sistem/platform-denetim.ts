import type { Database } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';

import { withSistem, type SistemBaglami } from './with-sistem.js';

/**
 * Platform denetiminin TEK yazma yolu: her platform istegi (okuma dahil) ve taklit belirteciyle gelen
 * her istek `hesap.denetim_kayitlari`na buradan (veya `withSistem` ile ayni islemde) yazilir.
 * Veri degistirmeyen yazim: islem govdesi bos, yalniz denetim satiri eklenir.
 */
export async function platformDenetimYaz(
  sistemDb: Database | null,
  baglam: SistemBaglami,
): Promise<void> {
  await withSistem(sistemDb, baglam, () => Promise.resolve());
}

export interface DenetimSuzgeci {
  kurumId?: string | undefined;
  aktorId?: string | undefined;
  /** Tam eylem adi veya `onek.*`. */
  eylem?: string | undefined;
  baslangic?: Date | undefined;
  bitis?: Date | undefined;
  limit: number;
  imlec?: { createdAt: string; id: string } | undefined;
}

export interface DenetimSatiri extends Record<string, unknown> {
  id: string;
  created_at: string;
  eylem: string;
  kurum_id: string | null;
  aktor_kullanici_id: string | null;
  taklit_kayit_id: string | null;
  hedef_turu: string | null;
  hedef_id: string | null;
  neden: string | null;
  ip: string | null;
  sonra: Record<string, unknown> | null;
}

const likeKacis = (m: string) => m.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Platform denetim listesi (imecli: `(created_at, id)` azalan). `created_at` mikrosaniye hassasiyetiyle
 * metin olarak tasinir; imlec ayni degeri geri verir (JS Date milisaniyeye yuvarlar).
 */
export async function platformDenetimListele(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  s: DenetimSuzgeci,
): Promise<{ satirlar: DenetimSatiri[]; sonraki: { createdAt: string; id: string } | null }> {
  const kosullar: SQL[] = [];
  if (s.kurumId) kosullar.push(sql`kurum_id = ${s.kurumId}::uuid`);
  if (s.aktorId) kosullar.push(sql`aktor_kullanici_id = ${s.aktorId}::uuid`);
  if (s.eylem) {
    if (s.eylem.endsWith('.*')) {
      kosullar.push(sql`eylem like ${`${likeKacis(s.eylem.slice(0, -1))}%`}`);
    } else {
      kosullar.push(sql`eylem = ${s.eylem}`);
    }
  }
  if (s.baslangic) kosullar.push(sql`created_at >= ${s.baslangic.toISOString()}::timestamptz`);
  if (s.bitis) kosullar.push(sql`created_at < ${s.bitis.toISOString()}::timestamptz`);
  if (s.imlec) {
    kosullar.push(sql`(created_at, id) < (${s.imlec.createdAt}::timestamptz, ${s.imlec.id}::uuid)`);
  }
  const where = kosullar.length > 0 ? sql`where ${sql.join(kosullar, sql` and `)}` : sql``;
  return withSistem(sistemDb, baglam, async (tx) => {
    const rows = await tx.execute<DenetimSatiri & { ham_zaman: string }>(sql`
      select id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
             created_at::text as ham_zaman, eylem, kurum_id, aktor_kullanici_id, taklit_kayit_id,
             hedef_turu, hedef_id, neden, host(ip) as ip, sonra
      from hesap.denetim_kayitlari ${where}
      order by created_at desc, id desc
      limit ${s.limit + 1}`);
    const fazla = rows.length > s.limit;
    const sayfa = rows.slice(0, s.limit);
    const son = sayfa.at(-1);
    return {
      satirlar: sayfa.map(({ ham_zaman: _h, ...r }) => r),
      sonraki: fazla && son ? { createdAt: son.ham_zaman, id: son.id } : null,
    };
  });
}
