import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Saklanan, henuz kabul edilmemis davet belirteci. */
export interface BekleyenDavet {
  belirtec: string;
  /** Kayit zamani (epoch ms); eski kayitlar atilir. */
  kayit: number;
}

export interface DavetDeposu {
  oku: () => Promise<BekleyenDavet | null>;
  yaz: (d: BekleyenDavet) => Promise<void>;
  sil: () => Promise<void>;
}

const ANAHTAR = 'kopru.davet';

function ayristir(ham: string | null): BekleyenDavet | null {
  if (!ham) return null;
  try {
    const d = JSON.parse(ham) as Partial<BekleyenDavet>;
    return typeof d.belirtec === 'string' && typeof d.kayit === 'number'
      ? { belirtec: d.belirtec, kayit: d.kayit }
      : null;
  } catch {
    return null;
  }
}

/**
 * Davet belirteci oturum belirteci gibi hassastir (kabul eden uyelik kazanir): iOS Keychain /
 * Android Keystore'da tutulur, uygulama yeniden baslatilsa da kaybolmaz. Web'de yalnizca
 * gelistirme icin localStorage.
 */
export function guvenliDavetDeposu(): DavetDeposu {
  const web = Platform.OS === 'web';
  const sec = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  return {
    oku: async () =>
      ayristir(
        web
          ? globalThis.localStorage.getItem(ANAHTAR)
          : await SecureStore.getItemAsync(ANAHTAR, sec),
      ),
    yaz: async (d) => {
      const ham = JSON.stringify(d);
      if (web) globalThis.localStorage.setItem(ANAHTAR, ham);
      else await SecureStore.setItemAsync(ANAHTAR, ham, sec);
    },
    sil: async () => {
      if (web) globalThis.localStorage.removeItem(ANAHTAR);
      else await SecureStore.deleteItemAsync(ANAHTAR, sec);
    },
  };
}

/** Testler icin bellek ici depo (`ham` ile "uygulama yeniden basladi" simule edilir). */
export function bellekDavetDeposu(): DavetDeposu & { ham: () => BekleyenDavet | null } {
  let deger: BekleyenDavet | null = null;
  return {
    oku: () => Promise.resolve(deger),
    yaz: (d) => {
      deger = d;
      return Promise.resolve();
    },
    sil: () => {
      deger = null;
      return Promise.resolve();
    },
    ham: () => deger,
  };
}
