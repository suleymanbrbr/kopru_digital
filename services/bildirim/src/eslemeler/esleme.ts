import type { EventDefinition, EventOf } from '@kopru/contracts';
import type { TuketiciBaglami } from '@kopru/service-kit';

import type { Islem } from '../ortak.js';

/**
 * Olay -> bildirim eslemesi. Yeni bir olay icin yalniz bir dosya eklenir (`eslemeler/<ad>.ts`) ve
 * `eslemeler/index.ts` kayit listesine yazilir; tuketici ve konu filtreleri listeden otomatik kurulur.
 *
 * Eslemenin gorevi: olay yukunden alici (uyelik) ve sablon degiskenlerini cikarmak ve
 * `bildirimUret`i cagirmak. Kisisel veri (ad, telefon, e-posta, not, ucret) degiskenlere KONMAZ.
 */
export interface Esleme {
  olay: EventDefinition;
  isle(tx: Islem, olay: unknown, baglam: TuketiciBaglami): Promise<void>;
}

export function esleme<const TOlay extends EventDefinition>(
  olay: TOlay,
  isle: (tx: Islem, olay: EventOf<TOlay>, baglam: TuketiciBaglami) => Promise<void>,
): Esleme {
  return { olay, isle: (tx, ham, baglam) => isle(tx, ham as EventOf<TOlay>, baglam) };
}
