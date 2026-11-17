import type {
  HaftaninYildizi,
  KarakterDetay,
  MotivasyonDuraklatma as Duraklatma,
  MotivasyonDuraklatmaGirdisi as DuraklatmaGirdisi,
  MotivasyonOgrenciDurumu as MotivasyonDurumu,
  MotivasyonSeriDetayi as SeriDetayi,
  OdakModu,
  OdakOturumu,
} from '@kopru/contracts';

/**
 * Motivasyon servisi adaptor tipleri. Okuma modelleri sozlesmeyle (`@kopru/contracts`, snake_case)
 * aynidir: yeniden adlandirma katmani eklenmedi. Girdiler camelCase'dir.
 */
export type {
  Duraklatma,
  DuraklatmaGirdisi,
  HaftaninYildizi,
  KarakterDetay,
  MotivasyonDurumu,
  OdakModu,
  OdakOturumu,
  SeriDetayi,
};

export type KozmetikSlotu = 'sapka' | 'gozluk' | 'aksesuar' | 'arka_plan' | 'cerceve';
export const KOZMETIK_SLOTLARI: readonly KozmetikSlotu[] = [
  'sapka',
  'gozluk',
  'aksesuar',
  'arka_plan',
  'cerceve',
];

export interface KarakterAsamaTanimi {
  asama: number;
  ad: string;
  gereken_seviye: number;
}

export interface KarakterTuru {
  kod: string;
  ad: string;
  asamalar: KarakterAsamaTanimi[];
}

export interface Kozmetik {
  kod: string;
  slot: KozmetikSlotu;
  ad: string;
  nadirlik: 'yaygin' | 'nadir' | 'efsanevi';
  sahip: boolean;
  acildi_at: string | null;
  kusanildi: boolean;
  acilma_kosulu: { rozet?: string; rozet_adi?: string; seviye?: number; seri?: number };
}

export interface OdakBaslatGirdisi {
  /** Istemcide uretilen UUIDv7; ayni oturumun her denemesinde ayni. */
  istemciId: string;
  mod: OdakModu;
  planlananDk?: number;
  /** Cevrimdisi baslatilan oturum icin gercek baslangic. */
  baslangicAt?: string;
  bransKodu?: string;
  planGorevId?: string;
  cihaz?: string;
}

export interface OdakKazanimi {
  xp: number;
  seviyeAtladi: boolean;
  yeniRozetler: string[];
  /** Sunucunun gormedigi geriye donuk sureden sayilan saniye. */
  dogrulanmamisSayilanSn: number;
  /** Gunluk paya takilip sayilmayan saniye. */
  dogrulanmamisSayilmayanSn: number;
}

export interface OdakBitirSonucu {
  oturum: OdakOturumu;
  kazanim: OdakKazanimi;
}

export interface YildizVerGirdisi {
  ogrenciId: string;
  grupId: string;
  gerekce?: string;
}

export interface YildizVerSonucu {
  yildiz: HaftaninYildizi;
  xp: number;
  yeniRozetler: string[];
}

export interface YildizVerdiklerim {
  haftaBaslangic: string;
  /** Ogretmen icin haftalik sinir; yonetici/sahip icin `null`. */
  limit: number | null;
  verilen: number;
  kalan: number | null;
  yildizlar: HaftaninYildizi[];
}

/** Grup uyesi ogrenci (kimlik = ogrenci uyelik kimligi). */
export interface GrupOgrencisi {
  ogrenciId: string;
  ad: string;
}

export interface MotivasyonAdapter {
  /** Ogrencinin kendi durumu. */
  benim: () => Promise<MotivasyonDurumu>;
  /** Personel: ogrencinin ozeti. */
  ogrenciOzeti: (ogrenciId: string) => Promise<MotivasyonDurumu>;
  seri: () => Promise<SeriDetayi>;

  karakterTurleri: () => Promise<KarakterTuru[]>;
  karakter: () => Promise<KarakterDetay | null>;
  karakterSec: (turKodu: string, ad: string) => Promise<KarakterDetay>;
  turDegistir: (turKodu: string) => Promise<KarakterDetay>;
  adDegistir: (ad: string) => Promise<KarakterDetay>;
  kozmetikler: () => Promise<Kozmetik[]>;
  kusan: (slot: KozmetikSlotu, kozmetikKodu: string) => Promise<void>;
  cikar: (slot: KozmetikSlotu) => Promise<void>;

  /** Devam eden odak oturumu (yoksa `null`). */
  odakAcik: () => Promise<OdakOturumu | null>;
  /** `409 acik_oturum_var`: `ApiHata('cakisma')`, `ayrinti === 'acik_oturum_var'`, `detay.oturum`. */
  odakBaslat: (g: OdakBaslatGirdisi) => Promise<OdakOturumu>;
  odakBitir: (
    istemciId: string,
    durum: 'tamam' | 'yarida',
    bitisAt?: string,
  ) => Promise<OdakBitirSonucu>;

  yildizVer: (g: YildizVerGirdisi) => Promise<YildizVerSonucu>;
  yildizVerdiklerim: () => Promise<YildizVerdiklerim>;
  /** Bir ogrencinin aldigi haftanin yildizlari (ogrenci kendi kimligiyle, personel kapsamla). */
  yildizAldiklari: (ogrenciId: string) => Promise<HaftaninYildizi[]>;
  duraklatmalar: (grupId: string) => Promise<Duraklatma[]>;
  duraklatmaOlustur: (grupId: string, g: DuraklatmaGirdisi) => Promise<Duraklatma>;
  duraklatmaIptal: (grupId: string, duraklatmaId: string) => Promise<void>;
  /** Grubun etkin ogrencileri (yildiz verirken secim icin). */
  grupOgrencileri: (grupId: string) => Promise<GrupOgrencisi[]>;
}

/** `409 acik_oturum_var` hata ayrintisindan mevcut acik oturumu cikarir. */
export function odakAcikOturumHatasindan(detay: unknown): OdakOturumu | null {
  if (typeof detay !== 'object' || detay === null) return null;
  const o = (detay as { oturum?: unknown }).oturum;
  if (typeof o !== 'object' || o === null) return null;
  return o as OdakOturumu;
}
