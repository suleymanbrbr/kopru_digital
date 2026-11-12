/**
 * yukleme-akisi.sh icin: api'nin `servisBelirteciUret` islevi ve anahtar deposuyla medya'ya yazilmis
 * 5 dakikalik servis JWT'si basar (`sub=servis:api`, `aud=medya`, `scope=medya.okuma`). api koduna dokunmaz;
 * yalniz gelistirme/deneme icindir (api'nin veritabani ve BETTER_AUTH_SECRET'i gerekir).
 *
 * Kullanim: API_DATABASE_URL=... API_BETTER_AUTH_SECRET=... API_PUBLIC_URL=... tsx scripts/servis-token.mjs
 */
import { createDb } from '@kopru/service-kit';

// Gelistirme betigi (tsc/derleme disinda): api'nin uretim islevi ve anahtar deposu yeniden kullanilir.
import { AnahtarDeposu } from '../../api/src/modules/hesap/anahtarlar.js';
import { servisBelirteciUret } from '../../api/src/modules/hesap/servis-belirteci.js';

const url = process.env.API_DATABASE_URL;
if (!url) throw new Error('API_DATABASE_URL tanımlı değil');
const sir = process.env.API_BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me-0123456789abcdef';
const issuer = process.env.JWT_ISSUER ?? process.env.API_PUBLIC_URL ?? 'http://localhost:4000';

const db = createDb({ url, max: 2 });
try {
  const anahtarlar = new AnahtarDeposu(() => db, sir);
  console.log(
    await servisBelirteciUret(
      { anahtarlar, issuer },
      { hedef: 'medya', scope: [process.env.SCOPE ?? 'medya.okuma'] },
    ),
  );
} finally {
  await db.close();
}
