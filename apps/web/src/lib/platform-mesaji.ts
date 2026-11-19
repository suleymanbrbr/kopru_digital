const ANAHTAR = 'kopru.platform-mesaji.kapatilan';
const SINIR = 20;

/** Kapatilan mesaj kimlikleri (tarayicida hatirlanir; depolama yoksa bos). */
export function kapatilanlariOku(): string[] {
  try {
    const ham = window.localStorage.getItem(ANAHTAR);
    const liste: unknown = ham ? JSON.parse(ham) : [];
    return Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Mesaj kimligini kapatilanlara ekler (en yeni `SINIR` kimlik tutulur) ve guncel listeyi doner. */
export function mesajiKapat(kimlik: string): string[] {
  const liste = [...kapatilanlariOku().filter((k) => k !== kimlik), kimlik].slice(-SINIR);
  try {
    window.localStorage.setItem(ANAHTAR, JSON.stringify(liste));
  } catch {
    // Depolama kapali: kapatma yalniz bu oturumda gecerli kalir.
  }
  return liste;
}
