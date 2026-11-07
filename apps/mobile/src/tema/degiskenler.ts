import { themes, type ThemeColors } from '@kopru/ui-tokens';

export type Sema = 'acik' | 'koyu';

const HEX = /^#([0-9a-f]{6})$/i;

export function gecerliHex(s: string | null | undefined): s is string {
  return typeof s === 'string' && HEX.test(s);
}

export function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function kanallar(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#2F7BF6" -> "47 123 246" (tailwind `rgb(var(--x) / <alpha-value>)` bicimi). */
export function rgbKanallari(hex: string): string {
  return kanallar(hex).join(' ');
}

function parlaklik(hex: string): number {
  const [r, g, b] = kanallar(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function kontrastOrani(a: string, b: string): number {
  const [l1, l2] = [parlaklik(a), parlaklik(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Verilen zemin uzerinde daha okunur olan metin rengi (beyaz ya da koyu). */
export function okunurUstRenk(zemin: string): string {
  const beyaz = '#FFFFFF';
  const koyu = '#0B0E14';
  return kontrastOrani(zemin, beyaz) >= kontrastOrani(zemin, koyu) ? beyaz : koyu;
}

/** tailwind.config.js ile ayni adlandirma: --renk-<kebab>. */
export function degiskenAdi(anahtar: string): string {
  return `--renk-${kebab(anahtar)}`;
}

/**
 * Temadan NativeWind `vars()` sozlugu uretir. `vurgu` (kurum vurgu rengi) varsa vurgu rengini ve
 * uzerindeki metin rengini calisma aninda ezer; gecersiz hex yok sayilir.
 */
export function renkDegiskenleri(sema: Sema, vurgu?: string | null): Record<string, string> {
  const renkler: ThemeColors = { ...themes[sema] };
  if (gecerliHex(vurgu)) renkler.vurgu = vurgu;
  const cikti: Record<string, string> = {};
  for (const [anahtar, hex] of Object.entries(renkler) as [string, string][])
    cikti[degiskenAdi(anahtar)] = rgbKanallari(hex);
  cikti[degiskenAdi('vurguUzeri')] = rgbKanallari(okunurUstRenk(renkler.vurgu));
  return cikti;
}

export function etkinRenkler(
  sema: Sema,
  vurgu?: string | null,
): ThemeColors & { vurguUzeri: string } {
  const renkler: ThemeColors = { ...themes[sema] };
  if (gecerliHex(vurgu)) renkler.vurgu = vurgu;
  return { ...renkler, vurguUzeri: okunurUstRenk(renkler.vurgu) };
}
