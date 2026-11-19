import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { withSistem, type SistemBaglami } from './with-sistem.js';

export interface SistemSagligi {
  outbox: { bekleyen: number; enEskiYasSn: number | null; hatali: number };
  kuyruk: {
    pgbossKurulu: boolean;
    derinlikler: { kuyruk: string; durum: string; sayi: number }[];
    basarisiz: number;
  };
}

/**
 * Yalniz api'nin kendi verisi: `ortak.outbox` birikimi ve (kuruluysa) pg-boss kuyruk derinlikleri.
 * pg-boss henuz depoda degil; `pgboss.job` tablosu varsa otomatik raporlanir, yoksa `pgbossKurulu: false`.
 */
export async function platformSistemSagligi(
  sistemDb: Database | null,
  baglam: SistemBaglami,
): Promise<SistemSagligi> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const [outbox] = await tx.execute<{ bekleyen: number; yas: number | null; hatali: number }>(sql`
      select count(*)::int as bekleyen,
             floor(extract(epoch from (now() - min(created_at))))::int as yas,
             count(*) filter (where attempts > 0)::int as hatali
      from ortak.outbox where sent_at is null`);
    const [var_] = await tx.execute<{ kurulu: boolean }>(
      sql`select to_regclass('pgboss.job') is not null as kurulu`,
    );
    let derinlikler: { kuyruk: string; durum: string; sayi: number }[] = [];
    let basarisiz = 0;
    if (var_?.kurulu) {
      const rows = await tx.execute<{ kuyruk: string; durum: string; sayi: number }>(sql`
        select name as kuyruk, state::text as durum, count(*)::int as sayi
        from pgboss.job where state in ('created', 'retry', 'active', 'failed')
        group by name, state order by name, state`);
      derinlikler = [...rows];
      basarisiz = derinlikler.filter((d) => d.durum === 'failed').reduce((t, d) => t + d.sayi, 0);
    }
    return {
      outbox: {
        bekleyen: outbox?.bekleyen ?? 0,
        enEskiYasSn: outbox?.yas ?? null,
        hatali: outbox?.hatali ?? 0,
      },
      kuyruk: { pgbossKurulu: var_?.kurulu ?? false, derinlikler, basarisiz },
    };
  });
}
