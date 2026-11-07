import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

import { hepsiniUret } from './lib.js';

const cikti = await hepsiniUret();
const eskiler: string[] = [];
for (const [dosya, beklenen] of cikti) {
  const mevcut = await readFile(dosya, 'utf8').catch(() => null);
  if (mevcut !== beklenen) eskiler.push(relative(process.cwd(), dosya));
}

if (eskiler.length > 0) {
  console.error(
    `OpenAPI anligi veya uretilen tipler eski:\n  ${eskiler.join('\n  ')}\n` +
      'Duzeltmek icin: pnpm build && pnpm --filter @kopru/api-client generate',
  );
  process.exit(1);
}
console.log('OpenAPI anliklari ve tipler guncel.');
