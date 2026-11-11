import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Uygulama kimligi ortam degiskenlerinden okunur (varsayilanlar yer tutucudur):
 *  APP_BUNDLE_ID  iOS bundleIdentifier ve Android package (varsayilan com.koprudigital.app)
 *  APP_ADI        ana ekranda gorunen ad
 *  APP_SCHEME     derin baglanti semasi
 * EXPO_PUBLIC_* degiskenleri istemci kodunda dogrudan okunur (bkz. src/ortam.ts).
 */
const env = (ad: string) => (process.env as Record<string, string | undefined>)[ad];
const bundleId = env('APP_BUNDLE_ID') ?? 'com.koprudigital.app';
const arkaPlan = '#2F7BF6';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env('APP_ADI') ?? 'Köprü',
  slug: 'kopru-mobil',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: env('APP_SCHEME') ?? 'kopru',
  userInterfaceStyle: 'automatic',
  icon: './assets/ikon.png',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      foregroundImage: './assets/ikon-on.png',
      backgroundColor: arkaPlan,
    },
    predictiveBackGestureEnabled: false,
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/ikon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-dev-client',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/ikon-on.png',
        imageWidth: 160,
        backgroundColor: arkaPlan,
        dark: { backgroundColor: '#0B0E14' },
      },
    ],
  ],
  experiments: { typedRoutes: true },
});
