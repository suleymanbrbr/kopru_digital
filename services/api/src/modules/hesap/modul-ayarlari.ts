import type { ModulKodu } from '@kopru/contracts';
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
