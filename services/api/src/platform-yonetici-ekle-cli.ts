import { PlatformRoluSema } from '@kopru/contracts';
import { createDb } from '@kopru/service-kit';

import { loadServiceEnv } from './config.js';
import { telefonuNormallestir } from './modules/hesap/index.js';
import { platformYoneticiEkle } from './sistem/platform-yonetici.js';

/**
 * Platform rolu verme yolu (uretimde TEK yol; HTTP ucu yoktur). Kullanim:
 *   pnpm --filter @kopru/api platform:yonetici-ekle -- <telefon|eposta> [--rol destek|yonetici] [--2fa-sifirla]
 * Kullanici yoksa olusturulur; giris yine OTP/e-posta ile yapilir ve ilk giriste ikinci adim kurulur.
 * `DATABASE_SISTEM_URL` (api_sistem) gerekir. Islem `platform.yonetici_ekle` olarak denetime yazilir.
 */
const args = process.argv.slice(2).filter((a) => a !== '--');
const hedef = args.find((a) => !a.startsWith('--'));
const rolIndex = args.indexOf('--rol');
const rolDegeri = rolIndex >= 0 ? args[rolIndex + 1] : 'yonetici';
const sifirla = args.includes('--2fa-sifirla');

const rol = PlatformRoluSema.safeParse(rolDegeri);
if (!hedef || !rol.success) {
  console.error(
    'Kullanım: pnpm --filter @kopru/api platform:yonetici-ekle -- <telefon|eposta> [--rol destek|yonetici] [--2fa-sifirla]',
  );
  process.exit(2);
}

const env = loadServiceEnv();
if (!env.DATABASE_SISTEM_URL) {
  console.error('DATABASE_SISTEM_URL (api_sistem) tanımlı değil.');
  process.exit(2);
}

const telefon = hedef.includes('@') ? null : telefonuNormallestir(hedef);
if (!hedef.includes('@') && !telefon) {
  console.error('Geçerli bir telefon numarası veya e-posta girin.');
  process.exit(2);
}

const db = createDb({ url: env.DATABASE_SISTEM_URL, max: 1 });
try {
  const sonuc = await platformYoneticiEkle(db, {
    ...(telefon ? { telefonE164: telefon } : { eposta: hedef.toLowerCase() }),
    rol: rol.data,
    ikinciAdimiSifirla: sifirla,
  });
  console.log(
    `${sonuc.yeniKullanici ? 'Kullanıcı oluşturuldu' : 'Mevcut kullanıcı'} (${sonuc.kullaniciId}); platform rolü: ${sonuc.rol}` +
      (sifirla
        ? `; ikinci adım ${sonuc.ikinciAdimSifirlandi ? 'sıfırlandı' : 'zaten kurulu değildi'}`
        : ''),
  );
} finally {
  await db.close();
}
