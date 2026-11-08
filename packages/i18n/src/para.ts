/**
 * Para gosterimi ve girisi (ADR 0007). Tutarlar her yerde tam sayi kurustur; TL yalniz arayuzde gorunur.
 * Ayristirma kayan noktaya hic girmez: metin parcalanip tam sayi olarak birlestirilir.
 */
const TL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/** `600050` -> `₺6.000,50`. */
export function kurusBicimle(kurus: number): string {
  return TL.format(kurus / 100);
}

// Turkce yazim: nokta binlik ayiraci, virgul ondalik. `6.000`, `6000`, `6.000,5`, `6000,50` gecerli;
// `6.5` (nokta ondalik degildir) ve `6,505` (kurustan kucuk) gecersizdir.
const TUTAR = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** Kullanicinin yazdigi TL tutarini kurusa cevirir; gecersiz ya da guvenli aralik disiysa `null`. */
export function tlMetniniKurusaCevir(metin: string): number | null {
  const eslesme = TUTAR.exec(metin.replace(/[\s₺]|TL/gi, ''));
  if (!eslesme) return null;
  const lira = (eslesme[1] ?? '').replaceAll('.', '');
  const kurus = (eslesme[2] ?? '').padEnd(2, '0');
  const sonuc = Number(`${lira}${kurus}`);
  return Number.isSafeInteger(sonuc) ? sonuc : null;
}
