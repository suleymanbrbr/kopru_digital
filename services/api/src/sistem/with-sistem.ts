import { type Database, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

export interface SistemBaglami {
  /** `hesap.denetim_kayitlari.eylem`, ornek `sistem.kurum_olustur`. */
  eylem: string;
  /** Zorunlu: kiracı bağlamı olmadan çalışmanın nedeni (denetime yazılır). */
  neden: string;
  aktorKullaniciId?: string;
  kurumId?: string;
  hedefTuru?: string;
  hedefId?: string;
  istekId?: string;
}

/**
 * Kiraci baglami olmayan platform isleri icin `api_sistem` (BYPASSRLS) havuzunda islem acar ve
 * nedeni `hesap.denetim_kayitlari`na yazar (ADR 0003). Normal istek kodu `withTenant` kullanir.
 */
export async function withSistem<T>(
  db: Pick<Database, 'orm'> | null,
  context: SistemBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: sistem işlemi yapılamaz.');
  if (context.neden.trim().length === 0) throw new Error('withSistem için neden zorunlu');
  return db.orm.transaction(async (tx) => {
    await tx.execute(sql`
      insert into hesap.denetim_kayitlari
        (id, kurum_id, created_by, aktor_kullanici_id, eylem, hedef_turu, hedef_id, neden, istek_id)
      values (${uuidv7()}, ${context.kurumId ?? null}, ${context.aktorKullaniciId ?? null},
              ${context.aktorKullaniciId ?? null}, ${context.eylem}, ${context.hedefTuru ?? null},
              ${context.hedefId ?? null}, ${context.neden}, ${context.istekId ?? null})`);
    return fn(tx);
  });
}
