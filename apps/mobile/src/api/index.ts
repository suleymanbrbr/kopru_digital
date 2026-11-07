import type { BelirtecDeposu } from '../depo/belirtecDeposu';
import { ortam } from '../ortam';
import type { Adaptorler } from './adaptorler';
import { mockAdaptorler } from './mock';
import { ApiHata } from './tipler';

/** Gercek istemci baglanana kadar: her cagri `yapilandirma` hatasi verir. */
function baglanmamisAdaptorler(): Adaptorler {
  const hata = () => Promise.reject(new ApiHata('yapilandirma'));
  return {
    auth: {
      otpIste: hata,
      otpDogrula: hata,
      oturumBilgisi: hata,
      kvkkKabulEt: hata,
      uyelikSec: hata,
      cikis: () => Promise.resolve(),
    },
    veri: { ogretmenBugun: hata, ogrenciBugun: hata },
  };
}

/**
 * Adaptor secimi. TODO(orkestrator): `ortam.apiUrl` doluyken packages/api-client'i saran
 * adaptorleri burada dondurun; sozlesme `Adaptorler` arayuzudur.
 */
export function adaptorleriOlustur(depo: BelirtecDeposu): Adaptorler {
  if (ortam.apiMock) return mockAdaptorler(depo);
  return baglanmamisAdaptorler();
}
