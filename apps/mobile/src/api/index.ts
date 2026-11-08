import { Platform } from 'react-native';

import type { BelirtecDeposu } from '../depo/belirtecDeposu';
import { ortam } from '../ortam';
import type { Adaptorler } from './adaptorler';
import { gercekAdaptorler } from './gercek';
import { mockAdaptorler } from './mock';
import { ApiHata } from './tipler';

/** Api adresi tanimli degilken (mock da kapaliysa): her cagri `yapilandirma` hatasi verir. */
function baglanmamisAdaptorler(): Adaptorler {
  const hata = () => Promise.reject(new ApiHata('yapilandirma'));
  return {
    auth: {
      otpIste: hata,
      otpDogrula: hata,
      oturumBilgisi: hata,
      kvkkMetinleri: hata,
      kvkkKabulEt: hata,
      uyelikSec: hata,
      cikis: () => Promise.resolve(),
    },
    veri: { ogretmenBugun: hata, ogrenciBugun: hata },
  };
}

/**
 * Adaptor secimi: `EXPO_PUBLIC_API_MOCK=1` -> sahte; `EXPO_PUBLIC_API_URL` doluysa -> gercek api
 * (`@kopru/api-client`); ikisi de yoksa `yapilandirma` hatasi.
 */
export function adaptorleriOlustur(depo: BelirtecDeposu): Adaptorler {
  if (ortam.apiMock) return mockAdaptorler(depo);
  if (ortam.apiUrl) {
    return gercekAdaptorler({
      apiUrl: ortam.apiUrl,
      depo,
      kaynak: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
    });
  }
  return baglanmamisAdaptorler();
}
