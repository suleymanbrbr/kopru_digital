import * as Crypto from 'expo-crypto';
import { V7Generator } from 'uuidv7';

let uretici: V7Generator | undefined;

/**
 * Istemci tarafi uretilen, zaman sirali `istek_id` (UUIDv7). Sunucu ayni `istek_id` ile gelen
 * tekrar istekleri idempotent isler; bu yuzden yeniden denemelerde ayni deger gonderilir.
 */
export function yeniIstekId(): string {
  uretici ??= new V7Generator({
    nextUint32: () => Crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  });
  return uretici.generate().toString();
}
