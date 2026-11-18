import type { BildirimKutuOgesi } from '@kopru/contracts';

/**
 * Gelen kutusu onbellegi icin saf guncelleme islevleri (iyimser guncelleme). Liste, `okunmamis` suzgecli
 * ise okunan/arsivlenen oge listeden cikar; suzgecsiz listede okundu damgasi alir, arsivlenen cikar.
 */
export type KutuDegisimi =
  | { tur: 'okundu'; id: string; zaman: string }
  | { tur: 'arsivle'; id: string }
  | { tur: 'tumunuOku'; zaman: string };

export function ogeleriDegistir(
  ogeler: readonly BildirimKutuOgesi[],
  degisim: KutuDegisimi,
  yalnizOkunmamis: boolean,
): BildirimKutuOgesi[] {
  switch (degisim.tur) {
    case 'okundu':
      return yalnizOkunmamis
        ? ogeler.filter((o) => o.id !== degisim.id)
        : ogeler.map((o) =>
            o.id === degisim.id && o.okundu_at === null ? { ...o, okundu_at: degisim.zaman } : o,
          );
    case 'arsivle':
      return ogeler.filter((o) => o.id !== degisim.id);
    case 'tumunuOku':
      return yalnizOkunmamis
        ? []
        : ogeler.map((o) => (o.okundu_at === null ? { ...o, okundu_at: degisim.zaman } : o));
  }
}

/** Okunmamis sayisinin iyimser yeni degeri; `okunmamisMiydi`: degisen oge okunmamis mi idi (bilinmiyorsa `false`). */
export function sayiyiDegistir(
  sayi: number,
  degisim: KutuDegisimi,
  okunmamisMiydi: boolean,
): number {
  if (degisim.tur === 'tumunuOku') return 0;
  return okunmamisMiydi ? Math.max(0, sayi - 1) : sayi;
}
