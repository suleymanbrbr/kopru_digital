import { parseArgs } from 'node:util';

import { createDb } from '@kopru/service-kit';
import { z } from 'zod';

import { hesapOlaylariniYenidenYayimla } from './sistem/olaylari-yeniden-yayimla.js';

/**
 * `olaylari-yeniden-yayimla --kapsam hesap [--kurum <id>]... [--kuru] [--parca 500]`
 * Sistem rolu (`API_DATABASE_SISTEM_URL`, yoksa `DATABASE_SISTEM_URL`) ile baglanir; hesap verisinin bugunku
 * durumunu `hesap.*.degisti` olaylari olarak outbox'a yazar (worker relay'i yayimlar).
 */
const KULLANIM =
  'Kullanım: pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap [--kurum <uuid>]... [--kuru] [--parca 500]';

const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
const { values } = parseArgs({
  args: argv,
  options: {
    kapsam: { type: 'string' },
    kurum: { type: 'string', multiple: true },
    kuru: { type: 'boolean', default: false },
    parca: { type: 'string' },
  },
  strict: true,
});

if (values.kapsam !== 'hesap') {
  console.error(`--kapsam zorunlu ve şimdilik yalnız "hesap" desteklenir.\n${KULLANIM}`);
  process.exit(2);
}
const kurumIdleri = z.array(z.uuid()).safeParse(values.kurum ?? []);
if (!kurumIdleri.success) {
  console.error(`--kurum geçerli bir UUID olmalı.\n${KULLANIM}`);
  process.exit(2);
}
const parca = values.parca === undefined ? undefined : Number(values.parca);
if (parca !== undefined && (!Number.isInteger(parca) || parca < 1)) {
  console.error(`--parca pozitif tam sayı olmalı.\n${KULLANIM}`);
  process.exit(2);
}
const url = process.env.API_DATABASE_SISTEM_URL ?? process.env.DATABASE_SISTEM_URL;
if (!url) {
  console.error('API_DATABASE_SISTEM_URL (veya DATABASE_SISTEM_URL) tanımlı değil.');
  process.exit(2);
}

const db = createDb({ url, max: 2 });
let cikis = 0;
try {
  const ozet = await hesapOlaylariniYenidenYayimla(db, {
    kurumIdleri: kurumIdleri.data,
    kuru: values.kuru,
    ...(parca !== undefined ? { parca } : {}),
    log: (m) => {
      console.log(m);
    },
  });
  console.log(
    `${ozet.kuru ? '[kuru] ' : ''}${String(ozet.kurum)} kurum, ${String(ozet.toplam)} olay ${
      ozet.kuru ? 'yayımlanacak' : 'yazıldı'
    } (çalıştırma ${ozet.calistirmaId})`,
  );
  console.log(JSON.stringify(ozet.olaylar));
  if (ozet.hatalar.length > 0) {
    console.error(`${String(ozet.hatalar.length)} kurumda hata var.`);
    cikis = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  cikis = 1;
} finally {
  await db.close();
}
process.exit(cikis);
