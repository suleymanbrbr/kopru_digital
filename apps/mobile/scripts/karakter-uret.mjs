// assets/karakter/placeholder/*.svg dosyalarindan src/karakter/gorseller.generated.ts uretir.
// Metro dinamik require desteklemez; bu yuzden harita statik import olarak uretilir (elle cogaltma yok).
// Kullanim: pnpm --filter @kopru/mobile karakter:uret
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const burasi = dirname(fileURLToPath(import.meta.url));
const kaynak = join(burasi, '../../../assets/karakter/placeholder');
const hedef = join(burasi, '../src/karakter/gorseller.generated.ts');
// <tur>-<asama>[-v<varyant>].svg
const desen = /^(kivilcim|dinamo|sedir)-([1-5])(?:-v([01]))?\.svg$/;

const dosyalar = readdirSync(kaynak)
  .map((ad) => ({ ad, m: desen.exec(ad) }))
  .filter((x) => x.m)
  .sort((a, b) => a.ad.localeCompare(b.ad));

const kimlik = (ad) => ad.replace(/\.svg$/, '').replace(/-/g, '_');
const satirlar = [
  '// OTOMATIK URETILDI: scripts/karakter-uret.mjs. Elle duzenlemeyin.',
  "import type { FunctionComponent } from 'react';",
  "import type { SvgProps } from 'react-native-svg';",
  '',
  ...dosyalar.map(
    ({ ad }) => `import ${kimlik(ad)} from '../../../../assets/karakter/placeholder/${ad}';`,
  ),
  '',
  'export type GorselBileseni = FunctionComponent<SvgProps>;',
  '',
  '/** Anahtar: `<tur>-<asama>` ya da `<tur>-<asama>-v<varyant>`. */',
  'export const KARAKTER_GORSELLERI: Readonly<Record<string, GorselBileseni>> = {',
  ...dosyalar.map(({ ad }) => `  '${ad.replace(/\.svg$/, '')}': ${kimlik(ad)},`),
  '};',
  '',
];
writeFileSync(hedef, satirlar.join('\n'));
console.log(`${dosyalar.length} gorsel -> ${hedef}`);
