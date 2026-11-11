import type { SoruOzet } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { and, sql, type SQL } from 'drizzle-orm';

import { sorular } from '../../db/schema.js';
import { ozetleriHazirla } from './soru-detay.js';
import { aramaKatla, imlecCoz, imlecYaz } from './soru-ortak.js';

/** Baslik ya da herhangi bir mesaj metninde Turkce harf duyarsiz arama. */
export function soruAramaKosulu(q: string): SQL {
  const desen = `%${aramaKatla(q)}%`;
  return sql`(translate(${sorular.baslik}, 'İIı', 'iii') ilike ${desen}
    or exists (select 1 from ogrenme.soru_mesajlari m
               where m.soru_id = ${sorular.id} and translate(m.metin, 'İIı', 'iii') ilike ${desen}))`;
}

/** `son_hareket_at` + `id` anahtarli, imleçli sayfalama. `artan`: en eski once (cevap kuyrugu). */
export async function soruListele(
  tx: Tx,
  kosullar: readonly (SQL | undefined)[],
  secenek: { artan: boolean; limit: number; imlec: string | undefined },
): Promise<{ sorular: SoruOzet[]; sonraki_imlec: string | null }> {
  const son = imlecCoz(secenek.imlec);
  const ts = sql<string>`${sorular.son_hareket_at}::text`;
  const karsilastir = secenek.artan ? sql`>` : sql`<`;
  const siralama = secenek.artan
    ? [sql`${sorular.son_hareket_at} asc`, sql`${sorular.id} asc`]
    : [sql`${sorular.son_hareket_at} desc`, sql`${sorular.id} desc`];
  const satirlar = await tx
    .select({ s: sorular, ts })
    .from(sorular)
    .where(
      and(
        ...kosullar,
        son
          ? sql`(${sorular.son_hareket_at}, ${sorular.id}) ${karsilastir} (${son.ts}::timestamptz, ${son.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(...siralama)
    .limit(secenek.limit + 1);
  const sayfa = satirlar.slice(0, secenek.limit);
  const sonSatir = sayfa.at(-1);
  return {
    sorular: await ozetleriHazirla(
      tx,
      sayfa.map((r) => r.s),
    ),
    sonraki_imlec:
      satirlar.length > secenek.limit && sonSatir ? imlecYaz(sonSatir.ts, sonSatir.s.id) : null,
  };
}
