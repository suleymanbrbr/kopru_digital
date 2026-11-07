import { createMMKV } from 'react-native-mmkv';

/** Senkron anahtar-deger deposu arayuzu (MMKV ve testlerdeki bellek deposu uygular). */
export interface KvDepo {
  getString: (anahtar: string) => string | undefined;
  set: (anahtar: string, deger: string) => void;
  remove: (anahtar: string) => unknown;
  clearAll: () => void;
}

/** Bellek ici KvDepo; testler ve MMKV'nin olmadigi ortamlar icin. */
export function bellekKv(): KvDepo {
  const harita = new Map<string, string>();
  return {
    getString: (k) => harita.get(k),
    set: (k, v) => void harita.set(k, v),
    remove: (k) => harita.delete(k),
    clearAll: () => {
      harita.clear();
    },
  };
}

let uygulamaKv: KvDepo | undefined;

/**
 * Uygulamanin kalici deposu (MMKV; web'de localStorage, jest'te bellek). Tembel olusturulur ki
 * modul iceri alinirken native modul gerekmesin.
 * Not: Cache kisisel veri icerir; cikista `kvTemizle` ile silinir.
 */
export function kv(): KvDepo {
  uygulamaKv ??= createMMKV({ id: 'kopru-uygulama' });
  return uygulamaKv;
}

/** TanStack Query persister'inin bekledigi Web Storage benzeri sarmal. */
export function webDeposuOlarak(depo: KvDepo) {
  return {
    getItem: (k: string) => depo.getString(k) ?? null,
    setItem: (k: string, v: string) => {
      depo.set(k, v);
    },
    removeItem: (k: string) => {
      depo.remove(k);
    },
  };
}
