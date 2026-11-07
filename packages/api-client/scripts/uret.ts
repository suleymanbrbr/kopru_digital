import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { hepsiniUret } from './lib.js';

const cikti = await hepsiniUret();
for (const [dosya, icerik] of cikti) {
  await mkdir(dirname(dosya), { recursive: true });
  await writeFile(dosya, icerik);
  console.log(`yazildi: ${dosya}`);
}
