import type { Rol } from '@/lib/navigasyon';

/**
 * Ogrenme ekranlarinda role gore gorunurluk (yalniz arayuz; gercek denetim `api`dadir ve 403/404
 * yine duzgun gosterilir). Ogrenci baskasinin sonucunu, sinif ortalamasini ve baskasinin notunu gormez;
 * ogretmen gerceklesen miktari degistiremez; ogrenci hedefi degistiremez.
 */
export interface OgrenmeYetkileri {
  personel: boolean;
  /** Odev ver, plan kur, deneme gir. */
  yazabilir: boolean;
  /** Odevi tum kuruma verebilir (sahip/yonetici). */
  genisHedef: boolean;
  konuYonetebilir: boolean;
  denemeAyariYazabilir: boolean;
  sinifOrtalamasiGorur: boolean;
  denemeOnaylayabilir: boolean;
  gerceklesenYazabilir: boolean;
  hedefDegistirebilir: boolean;
  teslimEdebilir: boolean;
  odevIncelebilir: boolean;
  kendiDenemesiniGirebilir: boolean;
}

export function ogrenmeYetkileri(rol: Rol): OgrenmeYetkileri {
  const personel = rol === 'sahip' || rol === 'yonetici' || rol === 'ogretmen';
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const ogrenci = rol === 'ogrenci';
  return {
    personel,
    yazabilir: personel,
    genisHedef: yonetim,
    konuYonetebilir: yonetim,
    denemeAyariYazabilir: yonetim,
    sinifOrtalamasiGorur: personel,
    denemeOnaylayabilir: personel,
    gerceklesenYazabilir: ogrenci,
    hedefDegistirebilir: personel,
    teslimEdebilir: ogrenci,
    odevIncelebilir: personel,
    kendiDenemesiniGirebilir: ogrenci,
  };
}
