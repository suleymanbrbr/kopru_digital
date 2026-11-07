/**
 * Telefon girdisini E.164'e cevirir; gecersizse `null`. Turkiye cep numaralari icin
 * `05xx`, `5xx`, `905xx`, `+905xx` (bosluk, tire, parantez serbest) kabul edilir.
 * Diger ulkeler yalnizca `+` ile baslayan uluslararasi biçimde kabul edilir.
 */
export function telefonuNormallestir(girdi: string): string | null {
  const temiz = girdi.replace(/[\s\-().]/g, '');
  if (/^\+[1-9][0-9]{7,14}$/.test(temiz)) {
    return temiz.startsWith('+90') && !/^\+905[0-9]{9}$/.test(temiz) ? null : temiz;
  }
  if (/^0?5[0-9]{9}$/.test(temiz)) return `+90${temiz.slice(-10)}`;
  if (/^905[0-9]{9}$/.test(temiz)) return `+${temiz}`;
  if (/^00[1-9][0-9]{7,14}$/.test(temiz)) return `+${temiz.slice(2)}`;
  return null;
}
