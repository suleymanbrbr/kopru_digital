import { useSyncExternalStore } from 'react';

type Dinleyici = () => void;

export interface Depo<T> {
  al: () => T;
  /** Kismi guncelleme ya da fonksiyonla yeni durum. */
  ayarla: (guncelleme: Partial<T> | ((onceki: T) => T)) => void;
  abone: (dinleyici: Dinleyici) => () => void;
  /** React'te durumu (ya da bir dilimini) izler. */
  kullan: <S = T>(secici?: (durum: T) => S) => S;
}

/** Bagimliliksiz, kucuk bir dis durum deposu (useSyncExternalStore). */
export function depoOlustur<T extends object>(baslangic: T): Depo<T> {
  let durum = baslangic;
  const dinleyiciler = new Set<Dinleyici>();

  const al = () => durum;
  const abone = (d: Dinleyici) => {
    dinleyiciler.add(d);
    return () => dinleyiciler.delete(d);
  };
  const ayarla: Depo<T>['ayarla'] = (g) => {
    const sonraki = typeof g === 'function' ? g(durum) : { ...durum, ...g };
    if (Object.is(sonraki, durum)) return;
    durum = sonraki;
    dinleyiciler.forEach((d) => {
      d();
    });
  };
  function kullan<S = T>(secici?: (d: T) => S): S {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- tek bir hook, kosulsuz
    return useSyncExternalStore(
      abone,
      () => (secici ? secici(durum) : (durum as unknown as S)),
      () => (secici ? secici(durum) : (durum as unknown as S)),
    );
  }
  return { al, ayarla, abone, kullan };
}
