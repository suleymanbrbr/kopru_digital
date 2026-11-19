import type { Database, Tx } from '@kopru/service-kit';

import { withSistem, type SistemBaglami } from './with-sistem.js';

/**
 * Platform mufredat editoru yazmalari: `api_sistem` islemi + `hesap.denetim_kayitlari` satiri. Baglam
 * (aktor, IP, eylem `platform.mufredat.<eylem>`, neden, hedef) P1 denetim yardimcisindan
 * (`platformBaglami`/`platformIslem`, hesap modulu) gelir; denetim satiri islemle ayni transaction'da yazilir.
 * `withSistem` yalnizca `src/sistem/**` altindan cagrilir (ADR 0003).
 */
export function platformMufredatIslemi<T>(
  db: Pick<Database, 'orm'> | null,
  baglam: SistemBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSistem(db, baglam, fn);
}
