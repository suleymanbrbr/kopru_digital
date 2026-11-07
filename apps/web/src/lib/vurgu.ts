import { palette } from '@kopru/ui-tokens';

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#RRGGBB` bicimini dogrular ve normallestirir; gecersizse null. */
export function hexNormalle(girdi: string | null | undefined): string | null {
  if (!girdi) return null;
  const eslesme = HEX.exec(girdi.trim());
  return eslesme?.[1] ? `#${eslesme[1].toUpperCase()}` : null;
}

function goreliParlaklik(hex: string): number {
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(0) + 0.7152 * kanal(1) + 0.0722 * kanal(2);
}

function kontrast(a: number, b: number): number {
  const [acik, koyu] = a > b ? [a, b] : [b, a];
  return (acik + 0.05) / (koyu + 0.05);
}

/** Verilen zemin uzerinde daha okunur olan metin rengi (koyu notr ya da beyaz). */
export function okunurMetinRengi(zemin: string): string {
  const parlaklik = goreliParlaklik(zemin);
  const koyu = goreliParlaklik(palette.notr[900]);
  const beyaz = 1;
  return kontrast(parlaklik, koyu) >= kontrast(parlaklik, beyaz) ? palette.notr[900] : '#FFFFFF';
}

/**
 * Kurumun vurgu rengi icin CSS degiskenleri. Gecersiz renkte bos nesne doner;
 * boylece tema varsayilan vurguya (ui-tokens) duser.
 */
export function vurguDegiskenleri(renk: string | null | undefined): Record<string, string> {
  const hex = hexNormalle(renk);
  if (!hex) return {};
  return { '--vurgu': hex, '--vurgu-uzeri': okunurMetinRengi(hex) };
}

/** Kok elemana kurum vurgusunu uygular; geri alma fonksiyonu dondurur. */
export function vurguUygula(kok: HTMLElement, renk: string | null | undefined): () => void {
  const degiskenler = vurguDegiskenleri(renk);
  const anahtarlar = Object.keys(degiskenler);
  for (const [ad, deger] of Object.entries(degiskenler)) kok.style.setProperty(ad, deger);
  return () => {
    for (const ad of anahtarlar) kok.style.removeProperty(ad);
  };
}
