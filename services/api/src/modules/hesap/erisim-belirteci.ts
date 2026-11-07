import { IZIN_SOZLUGU_SURUMU, type Rol } from '@kopru/contracts';
import { SignJWT } from 'jose';
import { uuidv7 } from 'uuidv7';

import type { AnahtarDeposu } from './anahtarlar.js';

export const ERISIM_BELIRTECI_OMRU_SN = 15 * 60;
export const JWT_AUDIENCE = 'kopru';

export interface BelirtecIddiasi {
  kullaniciId: string;
  sessionId: string;
  kurumId: string | null;
  uyelikId: string | null;
  rol: Rol | null;
  roller: Rol[];
}

/** 15 dakikalik EdDSA erisim belirteci (ADR 0004 claim seti). Izin/grup/modul bilgisi tasimaz. */
export async function erisimBelirteciUret(
  anahtarlar: AnahtarDeposu,
  issuer: string,
  audience: string,
  iddia: BelirtecIddiasi,
): Promise<string> {
  const { kid, key } = await anahtarlar.imzaAnahtari();
  return new SignJWT({
    sid: iddia.sessionId,
    pv: IZIN_SOZLUGU_SURUMU,
    roller: iddia.roller,
    ...(iddia.kurumId ? { kurum_id: iddia.kurumId } : {}),
    ...(iddia.uyelikId ? { uyelik_id: iddia.uyelikId } : {}),
    ...(iddia.rol ? { rol: iddia.rol } : {}),
  })
    .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
    .setSubject(iddia.kullaniciId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${String(ERISIM_BELIRTECI_OMRU_SN)}s`)
    .setJti(uuidv7())
    .sign(key);
}
