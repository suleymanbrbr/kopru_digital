import type { Actor, AnyEventEnvelope } from '@kopru/contracts';
import { publishInTx, type Tx } from '@kopru/service-kit';

/** Hesap olaylari `ortak.outbox` tablosuna, is verisini yazan islemde eklenir. */
export const OUTBOX_TABLOSU = 'ortak.outbox';

export interface OlayBaglami {
  kurumId: string;
  actor: Actor;
  correlationId: string;
}

/** Olay tanimindan zarfi olusturup ayni islemde outbox'a yazar. */
export async function olayYaz<TData>(
  tx: Tx,
  tanim: {
    create(input: {
      kurumId: string;
      actor: Actor;
      correlationId: string;
      data: TData;
    }): AnyEventEnvelope;
  },
  baglam: OlayBaglami,
  data: TData,
): Promise<void> {
  await publishInTx(tx, tanim.create({ ...baglam, data }), { table: OUTBOX_TABLOSU });
}
