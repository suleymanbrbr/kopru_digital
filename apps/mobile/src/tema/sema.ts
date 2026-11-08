import { AppState, Appearance } from 'react-native';

import { depoOlustur } from '../lib/store';
import type { Sema } from './degiskenler';
import type { TemaTercihi } from './tercihler';

/** Isletim sistemi renk semasi (RN `Appearance`). */
export type SistemSemasi = 'light' | 'dark' | null | undefined;
export type YerelOverride = 'light' | 'dark' | 'unspecified';

/** Isletim sistemi / uygulama durumu erisimi; testlerde sahtesi verilir. */
export interface TemaPortu {
  /** Gecerli sema. Yerel override aciksa override'i dondurur (sistem degeri DEGIL). */
  sistemSemasi: () => SistemSemasi;
  /** Uygulamanin yerel gorunumunu zorlar ('unspecified': sistemi izle). */
  yerelAyarla: (o: YerelOverride) => void;
  /** Sema degisimi ya da uygulamanin one gelmesi; donus degeri aboneligi kapatir. */
  degisimiDinle: (cb: () => void) => () => void;
  /** Native taraf sistem degerini asenkron gunceller; kisa bir sure sonra yeniden okunur. */
  gecikmeliOku: (cb: () => void) => () => void;
}

/** Kalici tema tercihi kaynagi (`tercihler` deposunun okunur dilimi). */
export interface TercihKaynagi {
  al: () => { tema: TemaTercihi };
  abone: (dinleyici: () => void) => () => void;
}

/** Kalici tercih + sistem semasindan etkin sema. `acik`/`koyu` sistemden etkilenmez. */
export function semaCoz(tercih: TemaTercihi, sistem: Sema): Sema {
  return tercih === 'sistem' ? sistem : tercih;
}

export function yerelOverrideSec(tercih: TemaTercihi): YerelOverride {
  return tercih === 'acik' ? 'light' : tercih === 'koyu' ? 'dark' : 'unspecified';
}

const sistemdenSema = (s: SistemSemasi): Sema => (s === 'dark' ? 'koyu' : 'acik');

export const GERCEK_TEMA_PORTU: TemaPortu = {
  sistemSemasi: () => Appearance.getColorScheme(),
  yerelAyarla: (o) => {
    Appearance.setColorScheme(o);
  },
  degisimiDinle: (cb) => {
    // Nativewind'in kendi dinleyicisi uygulama "active" degilken gelen degisimi yok sayar ve
    // 'unspecified' durumunda eski degeri korur; burada her degisimde dogrudan yeniden okunur.
    const a = Appearance.addChangeListener(cb);
    const b = AppState.addEventListener('change', (d) => {
      if (d === 'active') cb();
    });
    return () => {
      a.remove();
      b.remove();
    };
  },
  gecikmeliOku: (cb) => {
    const zamanlayici = setTimeout(cb, 300);
    return () => {
      clearTimeout(zamanlayici);
    };
  },
};

/**
 * Tema denetleyicisi: "etkin sema = tercih === sistem ? isletim sistemi : tercih".
 *
 * Neden NativeWind `setColorScheme` yerine bu: NativeWind sistem semasini yalnizca kendi
 * dinleyicisiyle gunceller; `sistem` tercihine donuste (override sifirlanirken) ya da uygulama
 * arka plandayken gelen degisimlerde eski degerde (ornegin koyu) takili kalabiliyordu. Burada
 * sistem degeri yalnizca override KAPALIYKEN (`sistem` tercihi) okunur, tercih degisince ve
 * uygulama one gelince/asenkron guncellemeden sonra yeniden okunur.
 */
export function temaDenetleyicisiOlustur(port: TemaPortu, tercihDepo: TercihKaynagi) {
  const durum = depoOlustur<{ sistem: Sema }>({ sistem: sistemdenSema(port.sistemSemasi()) });
  let iptalGecikme: (() => void) | null = null;

  function sistemiOku() {
    // Override aciksa okunan deger sistemin degil override'in degeridir: kaydetme.
    if (tercihDepo.al().tema !== 'sistem') return;
    durum.ayarla({ sistem: sistemdenSema(port.sistemSemasi()) });
  }

  function uygula() {
    const tercih = tercihDepo.al().tema;
    port.yerelAyarla(yerelOverrideSec(tercih));
    iptalGecikme?.();
    iptalGecikme = null;
    if (tercih === 'sistem') {
      sistemiOku();
      iptalGecikme = port.gecikmeliOku(sistemiOku);
    }
  }

  return {
    durum,
    /** Baslangicta ve her tercih degisiminde yerel gorunumu uygular; sistem degisimini dinler. */
    baglan(): () => void {
      let onceki = tercihDepo.al().tema;
      uygula();
      const kapatTercih = tercihDepo.abone(() => {
        const simdi = tercihDepo.al().tema;
        if (simdi === onceki) return;
        onceki = simdi;
        uygula();
      });
      const kapatSistem = port.degisimiDinle(sistemiOku);
      return () => {
        kapatTercih();
        kapatSistem();
        iptalGecikme?.();
        iptalGecikme = null;
      };
    },
  };
}

export type TemaDenetleyicisi = ReturnType<typeof temaDenetleyicisiOlustur>;
