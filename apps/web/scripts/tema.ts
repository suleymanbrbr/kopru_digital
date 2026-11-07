/**
 * `@kopru/ui-tokens` degerlerinden Tailwind v4 tema dosyasini uretir:
 * acik/koyu CSS degiskenleri + `@theme inline` esleme. Renk, kose ve yazi olceklerinin tek
 * kaynagi ui-tokens paketidir; elle CSS'e renk yazilmaz.
 *
 * Kullanim:  tsx scripts/tema.ts [--cikti <dosya>]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { palette, radius, themes, typography, type ThemeColors } from '@kopru/ui-tokens';

const kebab = (ad: string) => ad.replace(/[A-Z]/g, (harf) => `-${harf.toLowerCase()}`);

const renkAnahtarlari = Object.keys(themes.acik) as (keyof ThemeColors)[];

function degiskenler(tema: ThemeColors): string {
  return renkAnahtarlari.map((k) => `  --${kebab(k)}: ${tema[k]};`).join('\n');
}

const satirYuksekligi: Record<string, number> = {
  xs: 18,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 30,
  '2xl': 34,
  '3xl': 40,
};

export function temaCssUret(): string {
  const paletRenkleri = Object.entries(palette)
    .flatMap(([grup, tonlar]) =>
      Object.entries(tonlar).map(([ton, hex]) => `  --color-${grup}-${ton}: ${hex};`),
    )
    .join('\n');

  const eslemeler = renkAnahtarlari
    .map((k) => `  --color-${kebab(k)}: var(--${kebab(k)});`)
    .join('\n');

  const yaziBoyutlari = Object.entries(typography.boyut)
    .map(([ad, px]) => {
      const tw = ad === 'md' ? 'base' : ad;
      return `  --text-${tw}: ${String(px / 16)}rem;\n  --text-${tw}--line-height: ${String((satirYuksekligi[ad] ?? 24) / px)};`;
    })
    .join('\n');

  const koseler = Object.entries(radius)
    .map(([ad, px]) => `  --radius-${ad}: ${String(px)}px;`)
    .join('\n');

  return `/*
 * Uretilmis dosya: \`pnpm --filter <uygulama> hazirla\` ile @kopru/ui-tokens degerlerinden uretilir.
 * Elle degistirmeyin; degisiklik icin packages/ui-tokens veya apps/web/scripts/tema.ts.
 */

:root {
  color-scheme: light;
${degiskenler(themes.acik)}

  /* Vurgu rengi uzerindeki metin. Kurum rengi verilince calisma aninda yeniden hesaplanir. */
  --vurgu-uzeri: ${palette.notr[900]};

  /* Turetilmis yumusak zeminler: durum ve vurgu renklerinin seffaf karisimi. */
  --birincil-yumusak: color-mix(in oklab, var(--birincil) 12%, transparent);
  --vurgu-yumusak: color-mix(in oklab, var(--vurgu) 16%, transparent);
  --basari-yumusak: color-mix(in oklab, var(--basari) 12%, transparent);
  --uyari-yumusak: color-mix(in oklab, var(--uyari) 14%, transparent);
  --hata-yumusak: color-mix(in oklab, var(--hata) 10%, transparent);
}

.dark {
  color-scheme: dark;
${degiskenler(themes.koyu)}
}

@theme inline {
  --font-sans: 'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
    sans-serif;

${eslemeler}
  --color-vurgu-uzeri: var(--vurgu-uzeri);
  --color-birincil-yumusak: var(--birincil-yumusak);
  --color-vurgu-yumusak: var(--vurgu-yumusak);
  --color-basari-yumusak: var(--basari-yumusak);
  --color-uyari-yumusak: var(--uyari-yumusak);
  --color-hata-yumusak: var(--hata-yumusak);

${paletRenkleri}

${koseler}

${yaziBoyutlari}
}
`;
}

const argumanlar = process.argv.slice(2);
const cikti = argumanlar[argumanlar.indexOf('--cikti') + 1];
if (argumanlar.includes('--cikti') && cikti) {
  const hedef = resolve(process.cwd(), cikti);
  await mkdir(dirname(hedef), { recursive: true });
  await writeFile(hedef, temaCssUret());
}
