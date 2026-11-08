const toplayici = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

/** Turkce siralama (ç, ğ, ı, ö, ş, ü dogru yerde; buyuk/kucuk harf farksiz). */
export function trKarsilastir(a: string | null | undefined, b: string | null | undefined): number {
  return toplayici.compare(a ?? '', b ?? '');
}

export function trSirala<T>(
  liste: readonly T[],
  anahtar: (oge: T) => string | null | undefined,
): T[] {
  return [...liste].sort((x, y) => trKarsilastir(anahtar(x), anahtar(y)));
}
