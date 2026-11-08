import { KATILIM_KODU_ALFABESI, KATILIM_KODU_UZUNLUK } from '@kopru/contracts';

/**
 * Yazilirken girdiyi temizler: bosluk/tire atilir, buyuk harfe cevrilir, en fazla 8 karakter.
 * Api de ayni sekilde (kucuk harf, bosluk, tire) hosgorur; istemci yine de buyuk harf gonderir.
 */
export function kodBicimle(girdi: string): string {
  return girdi.replace(/[\s-]/g, '').toUpperCase().slice(0, KATILIM_KODU_UZUNLUK);
}

export type KodDogrulama = 'tamam' | 'uzunluk' | 'karakter';

/**
 * Gondermeden once yerel dogrulama. Bicimi hatali kodlar sunucuya gitmez: 5 basarisiz denemede
 * 15 dakikalik kilit oldugu icin yazim hatalari bos yere hak tuketmemeli.
 */
export function kodDogrula(girdi: string): KodDogrulama {
  const kod = kodBicimle(girdi);
  for (const harf of kod) {
    if (!KATILIM_KODU_ALFABESI.includes(harf)) return 'karakter';
  }
  return kod.length === KATILIM_KODU_UZUNLUK ? 'tamam' : 'uzunluk';
}

/** "ABCD2345" -> "ABCD 2345" (okunurluk). */
export function kodGoster(kod: string): string {
  return `${kod.slice(0, 4)} ${kod.slice(4)}`.trim();
}
