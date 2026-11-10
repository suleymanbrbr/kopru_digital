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
  apiMock: process.env.EXPO_PUBLIC_API_MOCK === '1',
  apiUrl: apiUrlCoz(process.env.EXPO_PUBLIC_API_URL ?? ''),
  /** Gelistirici ekranlari (Bilesenler) yalnizca gelistirme derlemesinde acilir. */
  gelistirici: __DEV__,
} as const;
