/**
 * Giris ve KVKK adimlarindan sonra donulecek yer (ornegin `/davet/<belirtec>`). Yalniz bu sekmenin
 * `sessionStorage`inda tutulur; sunucuya, log'a ya da analitige gonderilmez. Belirtec bu yolun icindedir.
 */
const ANAHTAR = 'kopru.devam';

/** Yalniz uygulamanin kendi yollari: `//evil.com` ve mutlak adresler reddedilir. */
export function devamGecerliMi(yol: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9_\-./%?=&]*$/.test(yol) && !yol.includes('..');
}

export function devamKaydet(yol: string): void {
  if (!devamGecerliMi(yol)) return;
  try {
    sessionStorage.setItem(ANAHTAR, yol);
  } catch {
    // Depolama kapaliysa devam hatirlanmaz; kullanici baglantiyi yeniden acar.
  }
}

export function devamOku(): string | null {
  try {
    const yol = sessionStorage.getItem(ANAHTAR);
    return yol && devamGecerliMi(yol) ? yol : null;
  } catch {
    return null;
  }
}

export function devamSil(): void {
  try {
    sessionStorage.removeItem(ANAHTAR);
  } catch {
    // yok say
  }
}
