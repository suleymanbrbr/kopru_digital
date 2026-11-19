/** Odeme sayfasina giderken sahip kurumun kimligi (donus `/abonelik?odeme=` kurumsuz gelir). */
export const KURUM_ANAHTARI = 'kopru.abonelik.kurum';

/** Odeme baslatirken saklanan kurum (depolama yoksa `null`). */
export function saklananKurum(): string | null {
  try {
    return window.localStorage.getItem(KURUM_ANAHTARI);
  } catch {
    return null;
  }
}

/**
 * Odeme donusu hangi kuruma gider? Once odemeyi baslatirken saklanan kurum (hala sahipse), yoksa aktif
 * uyelik, yoksa tek sahip uyeligi. Belirsizse `null` (kurum secimi).
 */
export function donusKurumu(
  uyelikler: readonly { id: string; kurumId: string; rol: string }[],
  aktifUyelikId: string | null,
  saklanan: string | null,
): string | null {
  const sahipler = uyelikler.filter((u) => u.rol === 'sahip');
  if (saklanan && sahipler.some((u) => u.kurumId === saklanan)) return saklanan;
  const aktif = sahipler.find((u) => u.id === aktifUyelikId);
  if (aktif) return aktif.kurumId;
  const kurumlar = [...new Set(sahipler.map((u) => u.kurumId))];
  return kurumlar.length === 1 ? (kurumlar[0] ?? null) : null;
}
