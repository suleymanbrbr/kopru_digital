import { createDb } from '@kopru/service-kit';

import { loadServiceEnv } from './config.js';
import { seriGeceIsi, seriRiskIsi } from './seri-isleri.js';

/**
 * Gelistirme/test komutu: seri islerini verilen anda (`simdi`) bir kez calistirir.
 * `tsx src/seri-komut.ts gece|risk <ISO zaman>` (yalniz gelistirmede; NODE_ENV=production reddedilir).
 * `DATABASE_SISTEM_URL` (yoksa `DATABASE_URL`) baglantisiyla calisir.
 */
const env = loadServiceEnv();
if (env.NODE_ENV === 'production') {
  console.error('seri-komut yalnız geliştirmede çalışır.');
  process.exit(1);
}
const [komut, zaman] = process.argv.slice(2);
const simdi = zaman ? new Date(zaman) : new Date();
if ((komut !== 'gece' && komut !== 'risk') || Number.isNaN(simdi.getTime())) {
  console.error('kullanım: seri-komut.ts gece|risk <ISO zaman>');
  process.exit(2);
}
const url = env.DATABASE_SISTEM_URL ?? env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_SISTEM_URL (ya da DATABASE_URL) gerekli.');
  process.exit(2);
}
const db = createDb({ url, max: 2 });
try {
  const sonuc =
    komut === 'gece'
      ? await seriGeceIsi({ db }, simdi)
      : { olay: await seriRiskIsi({ db }, simdi) };
  console.log(JSON.stringify({ komut, simdi: simdi.toISOString(), ...sonuc }));
} finally {
  await db.close();
}
