import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { ortam } from '../ortam';
import { yukuAyristir, type BildirimYuku } from './baglanti';

export type IzinDurumu = 'verilmedi' | 'verildi' | 'reddedildi';

/**
 * Isletim sistemi push katmani. `expo-notifications` yalniz burada kullanilir; geri kalan kod bu
 * arayuze baglidir (testlerde bellek ici sahte kullanilir).
 */
export interface PushPlatformu {
  os: 'ios' | 'android' | 'web';
  izinDurumu: () => Promise<IzinDurumu>;
  /** Sistem izin penceresini acar (yalniz "verilmedi" durumunda pencere cikar). */
  izinIste: () => Promise<IzinDurumu>;
  /** Expo push belirteci; alinamazsa (simulator, EAS projesi yok, ag) `null`. Hata firlatmaz. */
  belirtecAl: () => Promise<string | null>;
  rozetAyarla: (sayi: number) => Promise<void>;
  /** Uygulama ONDEYKEN gelen bildirim. */
  gelenDinle: (cb: (y: BildirimYuku) => void) => () => void;
  /**
   * Kullanici bildirime dokundu (arka plan / one gelme). Uygulamayi acan bildirim (kapaliyken
   * dokunma) de bir kez iletilir. `kimlik` tekrarlari ayiklamak icindir.
   */
  dokunmaDinle: (cb: (y: BildirimYuku, kimlik: string) => void) => () => void;
  belirtecDegisinceDinle: (cb: (belirtec: string) => void) => () => void;
  /** Sistem ayarlarinda uygulamanin bildirim sayfasini acar. */
  ayarlariAc: () => Promise<void>;
}

function izinCevir(s: { status: string }): IzinDurumu {
  if (s.status === 'granted') return 'verildi';
  if (s.status === 'denied') return 'reddedildi';
  return 'verilmedi';
}

function projeKimligi(): string | null {
  const ekstra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const adaylar = [ortam.easProjeKimligi, ekstra?.eas?.projectId, Constants.easConfig?.projectId];
  return adaylar.find((a): a is string => typeof a === 'string' && a !== '') ?? null;
}

function yukCikar(n: Notifications.Notification): BildirimYuku {
  const icerik = n.request.content;
  // Uzak (APNs/FCM) bildirimlerde veri bazen tetikleyicinin `payload`indadir.
  const tetik = n.request.trigger as { payload?: unknown } | null;
  const veri =
    icerik.data && Object.keys(icerik.data).length > 0 ? icerik.data : (tetik?.payload ?? {});
  return yukuAyristir(veri, { baslik: icerik.title, govde: icerik.body });
}

/** Web ve desteklenmeyen ortamlar: izin "verilmedi", hicbir olay yok. */
export function bosPushPlatformu(): PushPlatformu {
  return {
    os: 'web',
    izinDurumu: () => Promise.resolve('verilmedi'),
    izinIste: () => Promise.resolve('verilmedi'),
    belirtecAl: () => Promise.resolve(null),
    rozetAyarla: () => Promise.resolve(),
    gelenDinle: () => () => undefined,
    dokunmaDinle: () => () => undefined,
    belirtecDegisinceDinle: () => () => undefined,
    ayarlariAc: () => Promise.resolve(),
  };
}

export function expoPushPlatformu(): PushPlatformu {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return bosPushPlatformu();
  const os = Platform.OS;

  // Uygulama ondeyken sistem afisi cikmaz: uygulama ici afis (BildirimAfisi) gosterilir.
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });

  let kanalHazir: Promise<unknown> | null = null;
  const kanalKur = () => {
    if (os !== 'android') return Promise.resolve();
    kanalHazir ??= Notifications.setNotificationChannelAsync('varsayilan', {
      name: 'Bildirimler',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
    return kanalHazir;
  };

  return {
    os,
    async izinDurumu() {
      try {
        return izinCevir(await Notifications.getPermissionsAsync());
      } catch {
        return 'verilmedi';
      }
    },
    async izinIste() {
      try {
        await kanalKur();
        return izinCevir(
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          }),
        );
      } catch {
        return 'verilmedi';
      }
    },
    async belirtecAl() {
      try {
        const projectId = projeKimligi();
        if (!projectId) return null;
        await kanalKur();
        const b = await Notifications.getExpoPushTokenAsync({ projectId });
        return b.data || null;
      } catch {
        return null;
      }
    },
    async rozetAyarla(sayi) {
      try {
        await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(sayi)));
      } catch {
        // Rozet izni yoksa sessizce gec.
      }
    },
    gelenDinle(cb) {
      const abone = Notifications.addNotificationReceivedListener((n) => {
        cb(yukCikar(n));
      });
      return () => {
        abone.remove();
      };
    },
    dokunmaDinle(cb) {
      const isle = (r: Notifications.NotificationResponse) => {
        if (r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
        cb(yukCikar(r.notification), `${r.notification.request.identifier}|${r.actionIdentifier}`);
      };
      const abone = Notifications.addNotificationResponseReceivedListener(isle);
      // Uygulamayi kapaliyken acan dokunma: dinleyici kurulmadan once gelmis olabilir.
      try {
        const son = Notifications.getLastNotificationResponse();
        if (son) isle(son);
      } catch {
        // Yerel modul hazir degilse yalniz dinleyici calisir.
      }
      return () => {
        abone.remove();
      };
    },
    belirtecDegisinceDinle(cb) {
      const abone = Notifications.addPushTokenListener(() => {
        // Cihaz belirteci degisti; Expo belirteci yeniden alinip kaydedilir.
        void this.belirtecAl().then((b) => {
          if (b) cb(b);
        });
      });
      return () => {
        abone.remove();
      };
    },
    ayarlariAc: () => Linking.openSettings().catch(() => undefined),
  };
}
