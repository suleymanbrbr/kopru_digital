import type { Tx } from '@kopru/service-kit';
import { and, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { atamalar, grupUyeleri, gruplar } from '../../db/schema.js';
import type { YetkiBaglami } from './kimlik.js';

/**
 * Kapsam suzgeci (ADR 0004 "Kapsamlar"). Liste uc noktalari bunu SQL'e ekler, tekil kayit uc noktalari
 * ayni suzgecle arar; kapsam disindaki kayit "yok" sayilir (404, varligi ifsa etmez).
 *
 * Kapsam `request.yetki.kapsam`tir: o isteğin izni icin rolun kapsami (uyelik `sube_id` ile daraltilmis).
 */

/** Ogretmenin etkin atama aldigi grup kimlikleri (bitis tarihi bos ya da ileri). */
export function atananGruplar(tx: Tx, ogretmenUyelikId: string) {
  return tx
    .select({ id: atamalar.grup_id })
    .from(atamalar)
    .where(
      and(
        eq(atamalar.ogretmen_id, ogretmenUyelikId),
        or(isNull(atamalar.bitis_tarihi), gt(atamalar.bitis_tarihi, sql`current_date`)),
      ),
    );
}

/** Ogrencinin etkin uyesi oldugu grup kimlikleri. */
export function uyeOlunanGruplar(tx: Tx, ogrenciUyelikId: string) {
  return tx
    .select({ id: grupUyeleri.grup_id })
    .from(grupUyeleri)
    .where(and(eq(grupUyeleri.ogrenci_id, ogrenciUyelikId), isNull(grupUyeleri.bitis_tarihi)));
}

/**
 * `gruplar` satirlari icin kapsam kosulu; `kurum` kapsaminda `undefined` (ek kosul yok).
 * - `sube`: ayni subedeki gruplar
 * - `grup`: ogretmenin atandigi gruplar
 * - `kendi`: ogrencinin uyesi oldugu gruplar
 */
export function grupKapsami(tx: Tx, y: YetkiBaglami): SQL | undefined {
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return eq(gruplar.sube_id, y.subeId ?? '00000000-0000-0000-0000-000000000000');
    case 'grup':
      return inArray(gruplar.id, atananGruplar(tx, y.uyelikId));
    case 'kendi':
      return inArray(gruplar.id, uyeOlunanGruplar(tx, y.uyelikId));
  }
}

/** Kapsamdaki grup kimliklerinin alt sorgusu (diger tablolari grup uzerinden suzmek icin). */
export function kapsamdakiGruplar(tx: Tx, y: YetkiBaglami) {
  const kosul = grupKapsami(tx, y);
  const sorgu = tx.select({ id: gruplar.id }).from(gruplar);
  return kosul ? sorgu.where(kosul) : sorgu;
}
