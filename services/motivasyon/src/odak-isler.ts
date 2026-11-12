import type { Database } from '@kopru/service-kit';

import { eskiAcikOturumlariKapat } from './odak.js';

/**
 * 6 saatten uzun `devam` odak oturumlarini `yarida` yapar (worker, `motivasyon_sistem`: BYPASSRLS).
 * Idempotent ve coklu worker guvenli (kapatilan satir bir daha eslesmez). Kapatilan sayisini doner.
 */
export async function acikOdakTemizle(
  d: { db: Pick<Database, 'orm'> },
  an: Date = new Date(),
): Promise<number> {
  return d.db.orm.transaction((tx) => eskiAcikOturumlariKapat(tx, an));
}
