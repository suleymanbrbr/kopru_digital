/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- process.env tipi expo-env.d.ts varligina gore degisir */
/**
 * Calisma zamani ortami. EXPO_PUBLIC_* degiskenleri derleme aninda koda gomulur; bu yuzden
 * `process.env.EXPO_PUBLIC_X` dogrudan (dinamik anahtar olmadan) okunmalidir.
 */
export const ortam = {
  apiMock: (process.env.EXPO_PUBLIC_API_MOCK as string | undefined) === '1',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? '',
  /** Gelistirici ekranlari (Bilesenler) yalnizca gelistirme derlemesinde acilir. */
  gelistirici: __DEV__,
} as const;
