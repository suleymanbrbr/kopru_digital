import { errorCodes, mufredatEditorHataKodlari } from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';
import type { FastifyRequest } from 'fastify';

/**
 * Platform yetkisi on kontrolu (ADR 0004 "Platform yoneticisi"): `plat` claim'i `yonetici` olmali.
 * GECICI: platform kimlik paketi (P1: iki adimli dogrulama, IP izin listesi) birlestirilince bu tek
 * fonksiyon onun korumasiyla degistirilir; rotalar yalniz buna baglidir. Donus: islemi yapan kullanici.
 */
export function platformYoneticisiGerekli(request: Pick<FastifyRequest, 'auth'>): string {
  const auth = request.auth;
  if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (auth.claims['plat'] !== 'yonetici') {
    throw new AppError(
      403,
      mufredatEditorHataKodlari.platformYetkisiYok,
      'Bu işlem için platform yöneticisi yetkisi gerekir.',
    );
  }
  return auth.kullaniciId;
}
