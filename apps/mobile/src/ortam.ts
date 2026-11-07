/**
 * Calisma zamani ortami. EXPO_PUBLIC_* degiskenleri derleme aninda koda gomulur; bu yuzden
 * `process.env.EXPO_PUBLIC_X` dogrudan (dinamik anahtar olmadan) okunmalidir.
 */
export const ortam = {
  apiMock: process.env.EXPO_PUBLIC_API_MOCK === '1',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  /** Gelistirici ekranlari (Bilesenler) yalnizca gelistirme derlemesinde acilir. */
  gelistirici: __DEV__,
} as const;
