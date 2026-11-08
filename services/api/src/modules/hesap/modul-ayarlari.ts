import { MODUL_KODLARI, type ModulKodu } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

export interface ModulBaglami {
  kademeId?: string | null;
  grupId?: string | null;
}

/**
 * Modul bu baglam icin acik mi? Oncelik kurum > kademe > grup; alt duzey yalnizca daraltir
 * (ADR 0004). Cozumleme `hesap.modul_acik_mi` SQL fonksiyonundadir ve kiraci baglami (RLS)
 * icindeki bir islemde cagrilmalidir. Kademe verilmezse grubun kademesi kullanilir.
 */
export async function modulAcikMi(
  tx: Tx,
  kurumId: string,
  modul: ModulKodu,
  baglam: ModulBaglami = {},
): Promise<boolean> {
  const rows = await tx.execute<{ acik: boolean }>(
    sql`select hesap.modul_acik_mi(${kurumId}::uuid, ${modul}, ${baglam.kademeId ?? null}::uuid, ${baglam.grupId ?? null}::uuid) as acik`,
  );
  return rows[0]?.acik ?? true;
}

/**
 * Tum modullerin durumu tek sorguda; her modul icin `hesap.modul_acik_mi` ile ayni cozumleme
 * (tekil uc ile ayni sonuc).
 */
export async function modulDurumlari(
  tx: Tx,
  kurumId: string,
  baglam: ModulBaglami = {},
): Promise<Record<ModulKodu, boolean>> {
  const kodlar = sql.join(
    MODUL_KODLARI.map((k) => sql`(${k})`),
    sql`, `,
  );
  const rows = await tx.execute<{ kod: ModulKodu; acik: boolean }>(
    sql`select m.kod, hesap.modul_acik_mi(${kurumId}::uuid, m.kod, ${baglam.kademeId ?? null}::uuid, ${baglam.grupId ?? null}::uuid) as acik
        from (values ${kodlar}) as m(kod)`,
  );
  const sonuc = Object.fromEntries(MODUL_KODLARI.map((k) => [k, true])) as Record<
    ModulKodu,
    boolean
  >;
  for (const r of rows) sonuc[r.kod] = r.acik;
  return sonuc;
}
