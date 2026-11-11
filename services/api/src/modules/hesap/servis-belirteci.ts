import { SERVIS_BELIRTECI_OMRU_SN, SERVIS_SUB_ONEKI } from '@kopru/service-kit';
import { SignJWT } from 'jose';
import { uuidv7 } from 'uuidv7';

import { serviceName } from '../../config.js';
import type { KimlikHizmeti } from './kimlik.js';

export interface ServisBelirteciIstegi {
  /** Hedef servis (`aud`): `medya`, `bildirim`, `motivasyon`. */
  hedef: string;
  /** Hedef ucun istedigi scope'lar (`iletisim.oku` gibi); bosluklu tek claim olarak yazilir. */
  scope: readonly string[];
}

const scopeAdi = /^[a-z0-9_.]+$/;

/**
 * api'nin diger servislerin `/ic/*` uclarini cagirmak icin kullandigi kisa omurlu (5 dk) servis JWT'si
 * (ADR 0004). Kullanici belirteciyle ayni EdDSA anahtari/JWKS: `sub=servis:api`, `aud=<hedef servis>`,
 * `scope=<bosluklu liste>`, kullanici claim'i (`sid`, `kurum_id`...) yok. Hedef servis `createService`
 * ile `config.servisScope` taniminda dogrular.
 */
export async function servisBelirteciUret(
  kimlik: Pick<KimlikHizmeti, 'anahtarlar' | 'issuer'>,
  istek: ServisBelirteciIstegi,
): Promise<string> {
  if (istek.hedef.length === 0 || istek.hedef === serviceName) {
    throw new Error('Servis belirteci başka bir servis için üretilmelidir');
  }
  if (istek.scope.length === 0 || !istek.scope.every((s) => scopeAdi.test(s))) {
    throw new Error('Servis belirteci için geçerli en az bir scope gerekli');
  }
  const { kid, key } = await kimlik.anahtarlar.imzaAnahtari();
  return new SignJWT({ scope: istek.scope.join(' ') })
    .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
    .setSubject(`${SERVIS_SUB_ONEKI}${serviceName}`)
    .setIssuer(kimlik.issuer)
    .setAudience(istek.hedef)
    .setIssuedAt()
    .setExpirationTime(`${String(SERVIS_BELIRTECI_OMRU_SN)}s`)
    .setJti(uuidv7())
    .sign(key);
}
