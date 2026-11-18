import { errorCodes, type Rol } from '@kopru/contracts';
import { AppError, type AuthContext } from '@kopru/service-kit';

export interface KurumKimligi {
  kullaniciId: string;
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

/** Kullanici duzeyi kimlik (cihaz uclari): yalniz gecerli oturum gerekir. */
export function kullaniciKimligi(request: { auth: AuthContext | null }): { kullaniciId: string } {
  const a = request.auth;
  if (!a) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  return { kullaniciId: a.kullaniciId };
}

/** Kurum baglamli kimlik; motivasyon servisiyle ayni 403 davranisi (baska kurum, kurum yok). */
export function kimlik(request: { auth: AuthContext | null }, kurumId: string): KurumKimligi {
  const a = request.auth;
  if (!a) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (!a.kurumId || !a.uyelikId || !a.rol) {
    throw new AppError(403, errorCodes.kurumGerekli, 'Bu işlem için bir kurum seçmelisiniz.');
  }
  if (a.kurumId !== kurumId) {
    throw new AppError(403, errorCodes.forbidden, 'Bu kuruma erişiminiz yok.');
  }
  return { kullaniciId: a.kullaniciId, kurumId, uyelikId: a.uyelikId, rol: a.rol as Rol };
}
