import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Uygulama kimligi ortam degiskenlerinden okunur (varsayilanlar YER TUTUCUDUR; Apple Developer ve
 * Google Play hesaplari acilinca gercek degerlerle degisir, bkz. docs/gelistirme.md "Magaza derlemesi"):
 *  APP_BUNDLE_ID       iOS bundleIdentifier ve Android package (varsayilan com.koprudigital.app)
 *  APP_ADI             ana ekranda gorunen ad
 *  APP_SCHEME          derin baglanti semasi
 *  APP_PUSH_MODU       `production`: APNs uretim ortami (magaza ve ad hoc derlemeleri)
 *  EAS_PROJE_KIMLIGI   EAS proje kimligi (`eas init` sonrasi; bos: expo-notifications `extra.eas` yok)
 * EXPO_PUBLIC_* degiskenleri istemci kodunda dogrudan okunur (bkz. src/ortam.ts).
 *
 * Surum stratejisi: `version` (kullaniciya gorunen, semver) elle artirilir; iOS `buildNumber` ve
 * Android `versionCode` EAS tarafindan uzaktan artirilir (`eas.json` appVersionSource=remote,
 * production autoIncrement). `runtimeVersion` politikasi `appVersion`: yerel kod ayni surum
 * numarasi boyunca uyumlu sayilir; native bagimlilik degisince `version` artirilir.
 */
const env = (ad: string) => (process.env as Record<string, string | undefined>)[ad];
const bundleId = env('APP_BUNDLE_ID') ?? 'com.koprudigital.app';
const arkaPlan = '#2F7BF6';
const easProjeKimligi = env('EAS_PROJE_KIMLIGI');
const MIKROFON_METNI =
  'Köprü, soruna ya da cevabına sesli anlatım eklemen için mikrofonu yalnızca sen kaydı başlattığında kullanır.';

/**
 * Uretim derlemesi guvenlik denetimi: `eas build --profile production` sirasinda (EAS her derlemede
 * `EAS_BUILD_PROFILE` verir) sahte api, sahte push ya da http adresi paketin icine girmeden durdurur.
 */
export function uretimDenetimi(e: (ad: string) => string | undefined): string[] {
  if (e('EAS_BUILD_PROFILE') !== 'production') return [];
  const hatalar: string[] = [];
  if (e('EXPO_PUBLIC_API_MOCK') !== undefined) {
    hatalar.push('EXPO_PUBLIC_API_MOCK uretim derlemesinde tanimli olamaz.');
  }
  if (e('EXPO_PUBLIC_PUSH_SAHTE') !== undefined) {
    hatalar.push('EXPO_PUBLIC_PUSH_SAHTE uretim derlemesinde tanimli olamaz.');
  }
  if (e('EXPO_PUBLIC_OLCUM_URL') !== undefined) {
    hatalar.push('EXPO_PUBLIC_OLCUM_URL uretim derlemesinde tanimli olamaz.');
  }
  const api = e('EXPO_PUBLIC_API_URL') ?? '';
  if (!api.startsWith('https://')) {
    hatalar.push('EXPO_PUBLIC_API_URL uretimde https:// ile baslamali.');
  }
  return hatalar;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const hatalar = uretimDenetimi(env);
  if (hatalar.length > 0)
    throw new Error(`Uretim derlemesi reddedildi:\n- ${hatalar.join('\n- ')}`);

  return {
    ...config,
    name: env('APP_ADI') ?? 'Köprü',
    slug: 'kopru-mobil',
    version: '0.1.0',
    runtimeVersion: { policy: 'appVersion' },
    orientation: 'portrait',
    scheme: env('APP_SCHEME') ?? 'kopru',
    userInterfaceStyle: 'automatic',
    icon: './assets/ikon.png',
    ios: {
      bundleIdentifier: bundleId,
      supportsTablet: false,
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
      // Apple "required reason API" bildirimi: paket `PrivacyInfo.xcprivacy` olarak uretilir.
      // Bagimliliklarin kendi bildirimleri de (React Native, expo-*) pakete eklenir; burada uygulamanin
      // toplam ihtiyaci beyan edilir. Ayrinti ve tarama sonucu: docs/isletim/magaza-gizlilik.md.
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
            NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
          },
        ],
        // Toplanan veri turleri (hepsi kimlikle baglantili, takip yok). Tablo: magaza-gizlilik.md.
        NSPrivacyCollectedDataTypes: [
          veriTuru('NSPrivacyCollectedDataTypeName'),
          veriTuru('NSPrivacyCollectedDataTypePhoneNumber'),
          veriTuru('NSPrivacyCollectedDataTypeEmailAddress'),
          veriTuru('NSPrivacyCollectedDataTypePhotosorVideos'),
          veriTuru('NSPrivacyCollectedDataTypeAudioData'),
          veriTuru('NSPrivacyCollectedDataTypeOtherUserContent'),
          veriTuru('NSPrivacyCollectedDataTypePurchaseHistory'),
          veriTuru('NSPrivacyCollectedDataTypeUserID'),
          veriTuru('NSPrivacyCollectedDataTypeDeviceID'),
        ],
      },
    },
    android: {
      package: bundleId,
      adaptiveIcon: {
        foregroundImage: './assets/ikon-on.png',
        backgroundColor: arkaPlan,
      },
      predictiveBackGestureEnabled: false,
      // En az yetki: yalniz gercek kullanimlar. Depolama izinleri gerekmez (Android 13+ foto secici
      // ve uygulamaya ozel dizinler kullanilir); ekran ustu cizim izni hic gerekmez.
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.VIBRATE',
      ],
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
    },
    web: { bundler: 'metro', output: 'single', favicon: './assets/ikon.png' },
    plugins: [
      'expo-router',
      [
        'expo-secure-store',
        {
          // Uygulama biyometrik dogrulama istemez; Apple yine de bir aciklama metni ister.
          faceIDPermission:
            'Köprü, oturum bilgilerini cihazında güvenli saklar; Face ID kullanmaz.',
        },
      ],
      'expo-dev-client',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          // APNs ortami: gelistirme derlemesi `development`, magaza surumu `production`.
          mode: env('APP_PUSH_MODU') === 'production' ? 'production' : 'development',
          color: arkaPlan,
        },
      ],
      [
        'expo-audio',
        {
          // Arka planda oynatma/kayit yok: iOS `audio` arka plan modu ve Android on plan servis
          // izinleri (FOREGROUND_SERVICE*) eklenmez.
          enableBackgroundPlayback: false,
          microphonePermission: MIKROFON_METNI,
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission:
            'Köprü, çözemediğin sorunun ya da ödev çözümünün fotoğrafını çekip öğretmenine göndermen için kamerayı kullanır.',
          photosPermission:
            'Köprü, soru ya da ödev çözümü olarak göndermek istediğin fotoğrafları seçebilmen için fotoğraflarına erişir. Yalnızca seçtiklerin yüklenir.',
          // `false` olursa eklenti Android'de RECORD_AUDIO iznini engeller ve sesli anlatim bozulur.
          microphonePermission: MIKROFON_METNI,
        },
      ],
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
    ...(easProjeKimligi ? { extra: { eas: { projectId: easProjeKimligi } } } : {}),
  };
};

/** Apple gizlilik bildirimi: veri turu, kimlikle bagli, takip yok, tek amac (uygulama islevi). */
function veriTuru(tur: string) {
  return {
    NSPrivacyCollectedDataType: tur,
    NSPrivacyCollectedDataTypeLinked: true,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
  };
}
