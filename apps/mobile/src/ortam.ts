import { Platform } from 'react-native';

/**
 * Android emulatorunde `localhost` emulatorun kendisidir; gelistirme makinesine `10.0.2.2` ile
 * ulasilir. iOS simulatoru makinenin agini paylastigi icin `localhost` oldugu gibi calisir.
 */
export function apiUrlCoz(url: string, platform: string = Platform.OS): string {
  if (platform !== 'android') return url;
  return url.replace(
    /^(https?:\/\/)(?:localhost|127\.0\.0\.1)(?=[:/]|$)/,
    (_eslesme, sema: string) => `${sema}10.0.2.2`,
  );
}

/**
 * Calisma zamani ortami. EXPO_PUBLIC_* degiskenleri derleme aninda koda gomulur; bu yuzden
 * `process.env.EXPO_PUBLIC_X` dogrudan (dinamik anahtar olmadan) okunmalidir.
 */
export const ortam = {
  apiMock: (process.env.EXPO_PUBLIC_API_MOCK as string | undefined) === '1',
  apiUrl: apiUrlCoz((process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? ''),
  /** Medya servisi adresi (bos: api ile ayni alan adi). */
  medyaUrl: apiUrlCoz((process.env.EXPO_PUBLIC_MEDYA_URL as string | undefined) ?? ''),
  /** Motivasyon servisi adresi (bos: api ile ayni alan adi; yerelde http://localhost:4001). */
  motivasyonUrl: apiUrlCoz((process.env.EXPO_PUBLIC_MOTIVASYON_URL as string | undefined) ?? ''),
  /** Bildirim servisi adresi (bos: api ile ayni alan adi; yerelde http://localhost:4002). */
  bildirimUrl: apiUrlCoz((process.env.EXPO_PUBLIC_BILDIRIM_URL as string | undefined) ?? ''),
  /**
   * Yalniz gelistirme: gercek Expo belirteci alinamayan ortamda (simulator, EAS projesi yok) sahte
   * belirtecle cihaz kaydi yapar (`EXPO_PUBLIC_PUSH_SAHTE=1`). Uretim derlemesinde yok sayilir.
   */
  pushSahte: __DEV__ && (process.env.EXPO_PUBLIC_PUSH_SAHTE as string | undefined) === '1',
  /** Expo push belirteci icin EAS proje kimligi (bos: `app.config` extra.eas.projectId). */
  easProjeKimligi: (process.env.EXPO_PUBLIC_EAS_PROJE_ID as string | undefined) ?? '',
  /** Mock mod abonelik senaryolari (virgullu; bkz. `api/mockAbonelik.ts`). */
  mockAbonelik: (process.env.EXPO_PUBLIC_MOCK_ABONELIK as string | undefined) ?? '',
  /** RevenueCat genel SDK anahtarlari (bos: sahte magaza saglayicisi). */
  revenueCatIos: (process.env.EXPO_PUBLIC_REVENUECAT_IOS as string | undefined) ?? '',
  revenueCatAndroid: (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID as string | undefined) ?? '',
  /** Gelistirici ekranlari (Bilesenler) yalnizca gelistirme derlemesinde acilir. */
  gelistirici: __DEV__,
} as const;
