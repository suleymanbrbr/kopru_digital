/**
 * Gelistirme ve build oncesi hazirlik:
 *  - Karakter yer tutucu SVG'lerini assets/karakter/placeholder -> public/karakter kopyalar.
 *  - Tema CSS'ini @kopru/ui-tokens'tan uretir.
 */
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { temaCssUret } from './tema.ts';

const uygulama = join(import.meta.dirname, '..');
const kaynak = join(uygulama, '../../assets/karakter/placeholder');
const hedef = join(uygulama, 'public/karakter');

await mkdir(hedef, { recursive: true });
const svgler = (await readdir(kaynak)).filter((ad) => ad.endsWith('.svg')).sort();
for (const ad of svgler) await cp(join(kaynak, ad), join(hedef, ad));
console.log(`karakter: ${String(svgler.length)} SVG kopyalandi -> public/karakter`);

await mkdir(join(uygulama, 'src/styles'), { recursive: true });
await writeFile(join(uygulama, 'src/styles/tema.generated.css'), temaCssUret());
console.log('tema: src/styles/tema.generated.css uretildi');
