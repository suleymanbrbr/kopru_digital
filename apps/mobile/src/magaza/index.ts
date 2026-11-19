import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { ortam } from '../ortam';
import { revenueCatSaglayicisi } from './revenuecat';
import { sahteMagazaOlustur, type SahteMagazaSecenekleri } from './sahte';
import type { MagazaSaglayici } from './tipler';

export * from './tipler';
export { urundenPlan } from './eslesme';
export { sahteMagazaOlustur, SAHTE_TEKLIFLER } from './sahte';

export interface MagazaSecimGirdisi {
  /** Platforma ozgu RevenueCat genel SDK anahtari; bos ise sahte. */
  apiAnahtari: string;
  /** Expo Go'da native `react-native-purchases` yoktur. */
  expoGo: boolean;
  /** Web'de magaza yoktur. */
  platform: string;
  planKodlari: () => Promise<readonly string[]>;
  sahte?: SahteMagazaSecenekleri;
}

/** Saf secim: gercek native modul yalniz anahtar varsa ve destekleniyorsa. */
export function magazaSaglayiciSec(g: MagazaSecimGirdisi): MagazaSaglayici {
  const destekli = g.platform === 'ios' || g.platform === 'android';
  if (g.apiAnahtari && destekli && !g.expoGo) {
    return revenueCatSaglayicisi({ apiAnahtari: g.apiAnahtari, planKodlari: g.planKodlari });
  }
  return sahteMagazaOlustur(g.sahte);
}

/** Uygulamanin magaza saglayicisi (ortam degiskenleri + calisma ortami). */
export function uygulamaMagazasi(
  planKodlari: () => Promise<readonly string[]>,
  sahte?: SahteMagazaSecenekleri,
): MagazaSaglayici {
  return magazaSaglayiciSec({
    apiAnahtari: Platform.OS === 'android' ? ortam.revenueCatAndroid : ortam.revenueCatIos,
    expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    platform: Platform.OS,
    planKodlari,
    ...(sahte ? { sahte } : {}),
  });
}
