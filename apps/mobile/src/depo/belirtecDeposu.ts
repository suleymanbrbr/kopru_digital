import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface Belirtecler {
  erisim: string;
  yenileme: string;
  /** Erisim belirtecinin bitisi (epoch ms). */
  erisimBitis: number;
}

export interface BelirtecDeposu {
  oku: () => Promise<Belirtecler | null>;
  yaz: (b: Belirtecler) => Promise<void>;
  sil: () => Promise<void>;
}

const ANAHTAR = 'kopru.oturum';

/**
 * Belirtecler iOS Keychain / Android Keystore'da (expo-secure-store) tutulur (ADR 0004).
 * Web'de SecureStore yoktur; yalnizca gelistirme icin localStorage'a dusulur.
 */
export function guvenliBelirtecDeposu(): BelirtecDeposu {
  const web = Platform.OS === 'web';
  const sec = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  const ayristir = (ham: string | null): Belirtecler | null => {
    if (!ham) return null;
    try {
      const b = JSON.parse(ham) as Partial<Belirtecler>;
      return typeof b.erisim === 'string' &&
        typeof b.yenileme === 'string' &&
        typeof b.erisimBitis === 'number'
        ? { erisim: b.erisim, yenileme: b.yenileme, erisimBitis: b.erisimBitis }
        : null;
    } catch {
      return null;
    }
  };
  return {
    oku: async () =>
      ayristir(
        web
          ? globalThis.localStorage.getItem(ANAHTAR)
          : await SecureStore.getItemAsync(ANAHTAR, sec),
      ),
    yaz: async (b) => {
      const ham = JSON.stringify(b);
      if (web) globalThis.localStorage.setItem(ANAHTAR, ham);
      else await SecureStore.setItemAsync(ANAHTAR, ham, sec);
    },
    sil: async () => {
      if (web) globalThis.localStorage.removeItem(ANAHTAR);
      else await SecureStore.deleteItemAsync(ANAHTAR, sec);
    },
  };
}

/** Testler ve mock icin bellek ici depo. */
export function bellekBelirtecDeposu(): BelirtecDeposu {
  let deger: Belirtecler | null = null;
  return {
    oku: () => Promise.resolve(deger),
    yaz: (b) => {
      deger = b;
      return Promise.resolve();
    },
    sil: () => {
      deger = null;
      return Promise.resolve();
    },
  };
}
