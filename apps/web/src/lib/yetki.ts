import { ROL_IZINLERI, type IzinKodu } from '@kopru/contracts';

import type { Rol } from '@/lib/navigasyon';

/**
 * Rolun izni var mi? Yalniz arayuzu sadelestirir (aksiyonlari gizler); gercek denetim `api`dadir
 * ve 403/404 yine duzgun gosterilir.
 */
export function izinli(rol: Rol, izin: IzinKodu): boolean {
  return ROL_IZINLERI[rol][izin] !== undefined;
}
