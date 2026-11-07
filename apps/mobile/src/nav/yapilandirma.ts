import type { MessageKey } from '@kopru/i18n';

import type { MobilRol, ModulDurumu, ModulKodu } from '../api/tipler';

export type SekmeAdi =
  | 'bugun'
  | 'dersler'
  | 'ogrenciler'
  | 'sorular'
  | 'profil'
  | 'gorevler'
  | 'soru-sor'
  | 'karakterim';

export type IkonAdi =
  'today' | 'book' | 'people' | 'chatbubbles' | 'person' | 'checkbox' | 'help-circle' | 'sparkles';

export interface SekmeTanimi {
  /** Rota dosyasi adi: src/app/(uygulama)/(sekmeler)/<ad>.tsx */
  ad: SekmeAdi;
  baslik: MessageKey;
  ikon: IkonAdi;
  /** 'cekirdek': her zaman acik. Aksi halde modul kapaliysa sekme gizlenir. */
  modul: ModulKodu | 'cekirdek';
}

const bugun: SekmeTanimi = {
  ad: 'bugun',
  baslik: 'mobil.sekmeler.bugun',
  ikon: 'today',
  modul: 'cekirdek',
};
const profil: SekmeTanimi = {
  ad: 'profil',
  baslik: 'mobil.sekmeler.profil',
  ikon: 'person',
  modul: 'cekirdek',
};

const ogretmenSekmeleri: readonly SekmeTanimi[] = [
  bugun,
  { ad: 'dersler', baslik: 'mobil.sekmeler.dersler', ikon: 'book', modul: 'takvim' },
  { ad: 'ogrenciler', baslik: 'mobil.sekmeler.ogrenciler', ikon: 'people', modul: 'cekirdek' },
  { ad: 'sorular', baslik: 'mobil.sekmeler.sorular', ikon: 'chatbubbles', modul: 'soru_sor' },
  profil,
];

/** Tek yapilandirma: rol -> sekmeler. Sahip/yonetici ogretmen sekmelerini paylasir. */
export const ROL_SEKMELERI: Record<MobilRol, readonly SekmeTanimi[]> = {
  ogretmen: ogretmenSekmeleri,
  sahip: ogretmenSekmeleri,
  yonetici: ogretmenSekmeleri,
  ogrenci: [
    bugun,
    { ad: 'gorevler', baslik: 'mobil.sekmeler.gorevler', ikon: 'checkbox', modul: 'odev' },
    { ad: 'soru-sor', baslik: 'mobil.sekmeler.soruSor', ikon: 'help-circle', modul: 'soru_sor' },
    {
      ad: 'karakterim',
      baslik: 'mobil.sekmeler.karakterim',
      ikon: 'sparkles',
      modul: 'oyunlastirma',
    },
    profil,
  ],
};

/** Rota dosyasi olan tum sekmeler (gizlenenler `href: null` ile kaydedilir). */
export const TUM_SEKME_ADLARI: readonly SekmeAdi[] = [
  'bugun',
  'dersler',
  'ogrenciler',
  'sorular',
  'gorevler',
  'soru-sor',
  'karakterim',
  'profil',
];

/** Modul bilinmiyorsa (kayit yok) kapali sayilir (fail-closed). */
export function modulAcikMi(moduller: ModulDurumu, modul: ModulKodu | 'cekirdek'): boolean {
  return modul === 'cekirdek' || moduller[modul] === true;
}

export function gorunenSekmeler(rol: MobilRol, moduller: ModulDurumu): SekmeTanimi[] {
  return ROL_SEKMELERI[rol].filter((s) => modulAcikMi(moduller, s.modul));
}

/** Sahip ve yonetici Profil icinde "Kurum" girisini gorur. */
export function kurumGirisiVarMi(rol: MobilRol): boolean {
  return rol === 'sahip' || rol === 'yonetici';
}
