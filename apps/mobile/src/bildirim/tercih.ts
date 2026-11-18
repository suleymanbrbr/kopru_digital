/** Sessiz saat adimi (dk). */
export const SAAT_ADIMI_DK = 30;
export const TUM_GUNLER: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/** `HH:MM` degerini `dk` dakika kaydirir (gece yarisini asar: 23:45 + 30 -> 00:15). Gecersizse aynen doner. */
export function saatKaydir(saat: string, dk: number): string {
  const e = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(saat);
  if (!e) return saat;
  const gun = 24 * 60;
  const toplam = (((Number(e[1]) * 60 + Number(e[2]) + dk) % gun) + gun) % gun;
  const s = Math.floor(toplam / 60);
  const d = toplam % 60;
  return `${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}`;
}

/** Gun listesinde `gun`u acar/kapatir; sonuc siralidir ve tekrarsizdir. */
export function gunDegistir(gunler: readonly number[], gun: number): number[] {
  const set = new Set(gunler);
  if (set.has(gun)) set.delete(gun);
  else set.add(gun);
  return [...set].filter((g) => g >= 1 && g <= 7).sort((a, b) => a - b);
}

/**
 * Sessiz saat acik mi: sunucuda `sessiz_gunler: []` "kapali" demektir (yazim sozlesmesi).
 */
export function sessizSaatAcikMi(gunler: readonly number[]): boolean {
  return gunler.length > 0;
}
