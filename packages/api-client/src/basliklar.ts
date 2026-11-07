/** Istek izleme basligi (ADR 0006). Servisler `x-request-id` ile de okur; ikisi birlikte gonderilir. */
export const istekIdBasligi = 'X-Istek-Id';
export const requestIdBasligi = 'X-Request-Id';
export const idempotencyBasligi = 'Idempotency-Key';

/** Tarayici ve Node 22 icin `crypto.randomUUID`; yoksa rastgele yedek. */
export function yeniId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Izleme basliklari. Her istekte yeni bir kimlik uretilir. */
export function istekBasliklari(istekId: string = yeniId()): Record<string, string> {
  return { [istekIdBasligi]: istekId, [requestIdBasligi]: istekId };
}

/**
 * Yazma isteklerini guvenle tekrarlamak icin `Idempotency-Key` basligi.
 * Anahtari bir kez uretip (ornegin form acilinca) tekrar denemelerde ayni anahtari verin.
 */
export function idempotencyBasliklari(anahtar: string = yeniId()): Record<string, string> {
  return { [idempotencyBasligi]: anahtar };
}
