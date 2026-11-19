import { BlockList, isIP } from 'node:net';

import { errorCodes } from '@kopru/contracts';
import { AppError, type AuthContext } from '@kopru/service-kit';

export interface PlatformErisimi {
  /** `PLATFORM_IP_IZINLI` (IP ya da IP/onek listesi). Bos: gelistirmede acik, uretimde herkes reddedilir. */
  izinliIpler: readonly string[];
  uretim: boolean;
}

function ipIzinliMi(ip: string, liste: readonly string[]): boolean {
  const adres = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const tur = isIP(adres);
  if (tur === 0) return false;
  const engel = new BlockList();
  for (const giris of liste) {
    const [a, onek] = giris.split('/');
    if (!a || isIP(a) === 0) continue;
    const girisTuru = isIP(a) === 6 ? 'ipv6' : 'ipv4';
    if (onek === undefined) engel.addAddress(a, girisTuru);
    else engel.addSubnet(a, Number(onek), girisTuru);
  }
  return engel.check(adres, tur === 6 ? 'ipv6' : 'ipv4');
}

/**
 * `/platform/*` uclarinin tek yetki kontrolu: JWT'de `plat = yonetici` (taklit belirteci `imp` olamaz) ve
 * istemci IP'si izin listesinde. Gecersizse AppError firlatir; gecerliyse kimligi doner.
 * Ikinci adim: belirtecte gecerli `plat_2fa_exp` claim'i zorunludur (api yalniz taze 2FA'da koyar).
 */
export function platformYoneticisiGerekli(
  auth: AuthContext | null,
  ip: string,
  erisim: PlatformErisimi,
  simdi: Date = new Date(),
): AuthContext {
  if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (auth.claims.imp !== undefined) {
    throw new AppError(
      403,
      errorCodes.taklitSaltOkunur,
      'Taklit oturumuyla platform işlemi yapılamaz.',
    );
  }
  if (auth.claims.plat !== 'yonetici') {
    throw new AppError(403, errorCodes.izinYok, 'Bu işlem yalnızca platform yöneticileri içindir.');
  }
  // Ikinci adim kaniti (ADR 0004, 2026-11-19): api, oturumda taze 2FA varsa `plat_2fa_exp` (epoch sn) koyar.
  const ikinciAdimBitis = auth.claims.plat_2fa_exp;
  if (typeof ikinciAdimBitis !== 'number' || ikinciAdimBitis * 1000 <= simdi.getTime()) {
    throw new AppError(
      403,
      errorCodes.ikinciAdimGerekli,
      'Platform işlemleri için iki adımlı doğrulamayı tamamlayıp yeni belirteç alın.',
    );
  }
  const liste = erisim.izinliIpler;
  if (liste.length === 0 ? erisim.uretim : !ipIzinliMi(ip, liste)) {
    throw new AppError(403, errorCodes.forbidden, 'Bu adresten platform işlemi yapılamaz.');
  }
  return auth;
}
