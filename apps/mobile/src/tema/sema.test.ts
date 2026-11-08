import { depoOlustur } from '../lib/store';
import {
  semaCoz,
  temaDenetleyicisiOlustur,
  yerelOverrideSec,
  type SistemSemasi,
  type TemaPortu,
  type YerelOverride,
} from './sema';
import type { TemaTercihi } from './tercihler';

/**
 * Sahte isletim sistemi. Gercek davranisi taklit eder: yerel override aciksa `sistemSemasi()`
 * override'i dondurur; 'unspecified' yapilinca gercek sistem degerine doner (asenkron olay).
 */
function sahtePort(baslangic: 'light' | 'dark') {
  let sistem = baslangic;
  let override: YerelOverride = 'unspecified';
  const dinleyiciler = new Set<() => void>();
  const gecikmeliler: (() => void)[] = [];
  const port: TemaPortu = {
    sistemSemasi: (): SistemSemasi => (override === 'unspecified' ? sistem : override),
    yerelAyarla: (o) => {
      override = o;
    },
    degisimiDinle: (cb) => {
      dinleyiciler.add(cb);
      return () => dinleyiciler.delete(cb);
    },
    gecikmeliOku: (cb) => {
      gecikmeliler.push(cb);
      return () => {
        const i = gecikmeliler.indexOf(cb);
        if (i >= 0) gecikmeliler.splice(i, 1);
      };
    },
  };
  return {
    port,
    override: () => override,
    /** Kullanici sistem temasini degistirir (uygulama acikken). */
    sistemiDegistir(yeni: 'light' | 'dark') {
      sistem = yeni;
      dinleyiciler.forEach((d) => {
        d();
      });
    },
    gecikmelileriCalistir() {
      gecikmeliler.splice(0).forEach((g) => {
        g();
      });
    },
  };
}

function kur(sistem: 'light' | 'dark', tema: TemaTercihi = 'sistem') {
  const os = sahtePort(sistem);
  const tercih = depoOlustur<{ tema: TemaTercihi }>({ tema });
  const d = temaDenetleyicisiOlustur(os.port, tercih);
  const kapat = d.baglan();
  const sema = () => semaCoz(tercih.al().tema, d.durum.al().sistem);
  return { os, tercih, d, kapat, sema };
}

describe('tema: etkin sema', () => {
  it('semaCoz: acik/koyu tercih sistemden etkilenmez, sistem tercihi sistemi izler', () => {
    expect(semaCoz('acik', 'koyu')).toBe('acik');
    expect(semaCoz('koyu', 'acik')).toBe('koyu');
    expect(semaCoz('sistem', 'koyu')).toBe('koyu');
    expect(semaCoz('sistem', 'acik')).toBe('acik');
  });

  it('yerel override tercihe gore secilir; sistem tercihi override kaldirir', () => {
    expect(yerelOverrideSec('acik')).toBe('light');
    expect(yerelOverrideSec('koyu')).toBe('dark');
    expect(yerelOverrideSec('sistem')).toBe('unspecified');
  });

  it('sistem acikken uygulama acik kalir (koyuda takilma regresyonu)', () => {
    const { sema, os, kapat } = kur('light');
    expect(sema()).toBe('acik');
    expect(os.override()).toBe('unspecified');
    kapat();
  });

  it('sistem tercihi: uygulama acikken isletim sistemi teması degisince gecer', () => {
    const { sema, os, kapat } = kur('light');
    os.sistemiDegistir('dark');
    expect(sema()).toBe('koyu');
    os.sistemiDegistir('light');
    expect(sema()).toBe('acik');
    kapat();
  });

  it('kalici acik/koyu tercih sistem degisiminden etkilenmez', () => {
    const k = kur('dark', 'acik');
    expect(k.sema()).toBe('acik');
    expect(k.os.override()).toBe('light');
    k.os.sistemiDegistir('light');
    k.os.sistemiDegistir('dark');
    expect(k.sema()).toBe('acik');

    k.tercih.ayarla({ tema: 'koyu' });
    expect(k.os.override()).toBe('dark');
    k.os.sistemiDegistir('light');
    expect(k.sema()).toBe('koyu');
    k.kapat();
  });

  it("koyu tercihten 'sistem'e donunce override kalkar ve gercek sistem semasi okunur", () => {
    const k = kur('light', 'koyu');
    expect(k.sema()).toBe('koyu');
    // Override aciksa okunan deger override'dir; sistem degeri olarak kaydedilmemeli.
    expect(k.d.durum.al().sistem).not.toBe('koyu');
    k.tercih.ayarla({ tema: 'sistem' });
    expect(k.os.override()).toBe('unspecified');
    expect(k.sema()).toBe('acik');
    k.kapat();
  });

  it("override koyuyken sistem degisip 'sistem'e donulurse guncel sistem degeri alinir", () => {
    const k = kur('dark', 'koyu');
    k.os.sistemiDegistir('light'); // arka planda sistem acik oldu
    k.tercih.ayarla({ tema: 'sistem' });
    expect(k.sema()).toBe('acik');
    k.kapat();
  });

  it('native taraf gec guncellerse gecikmeli okuma duzeltir', () => {
    const os = sahtePort('light');
    const tercih = depoOlustur<{ tema: TemaTercihi }>({ tema: 'koyu' });
    // Eski deger takili kalan port: ilk okuma override'i (koyu) doner, gecikmeli okuma gercegi.
    let gec = true;
    const port: TemaPortu = {
      ...os.port,
      sistemSemasi: () => (gec ? 'dark' : 'light'),
    };
    const d = temaDenetleyicisiOlustur(port, tercih);
    const kapat = d.baglan();
    tercih.ayarla({ tema: 'sistem' });
    expect(d.durum.al().sistem).toBe('koyu'); // bayat
    gec = false;
    os.gecikmelileriCalistir();
    expect(d.durum.al().sistem).toBe('acik');
    kapat();
  });

  it('baglan iptal edilince dinleyiciler kalkar', () => {
    const k = kur('light');
    k.kapat();
    k.os.sistemiDegistir('dark');
    expect(k.d.durum.al().sistem).toBe('acik');
  });
});
