/**
 * Mufredat, odev, haftalik plan ve deneme icin adaptor katmani tipleri (camelCase). Tarihler kurum
 * yerel gunu `YYYY-MM-DD`, anlar ISO-8601 UTC metnidir. Ogrenci kimligi = uyelik kimligidir.
 */

// --- Mufredat -------------------------------------------------------------------------------

export type KonuSeviyesi = 'unite' | 'konu' | 'alt_konu';

export interface Konu {
  id: string;
  bransKodu: string;
  ustId: string | null;
  seviye: KonuSeviyesi;
  ad: string;
  sira: number;
  sinifSeviyesi: number | null;
  /** Global katalog satiri mi (kurum konusu degil). */
  global: boolean;
  /** Katalog surumunde artik yok / arsivlendi: rozetle gosterilir, yeni secimde sunulmaz. */
  kullanimdanKalkti: boolean;
}

// --- Odev -----------------------------------------------------------------------------------

export type OdevTuru = 'soru' | 'sayfa' | 'serbest';
export type OdevDurumu = 'taslak' | 'yayinda' | 'kapali';
export type OgrenciOdevDurumu =
  'atandi' | 'teslim_edildi' | 'incelendi' | 'tekrar_istendi' | 'iptal';
export type IncelemeSonucu = 'tamam' | 'eksik' | 'tekrar';
export type OdevHedefTuru = 'ogrenci' | 'grup';

/** Ogrencinin kendi odev satiri (ogrenci_odevleri + odev ozeti). */
export interface OgrenciOdevi {
  id: string;
  odevId: string;
  baslik: string;
  aciklama: string | null;
  bransKodu: string;
  konuId: string | null;
  tur: OdevTuru;
  kaynak: string | null;
  hedefSoruSayisi: number | null;
  durum: OgrenciOdevDurumu;
  sonTeslim: string | null;
  yapilanSoru: number | null;
  dogru: number | null;
  yanlis: number | null;
  bos: number | null;
  ogrenciNotu: string | null;
  teslimAt: string | null;
  gecTeslim: boolean;
  incelemeSonucu: IncelemeSonucu | null;
  incelemeNotu: string | null;
}

export interface TeslimGirdisi {
  yapilanSoru: number;
  dogru?: number;
  yanlis?: number;
  bos?: number;
  not?: string;
}

export interface Odev {
  id: string;
  baslik: string;
  bransKodu: string;
  konuId: string | null;
  tur: OdevTuru;
  kaynak: string | null;
  hedefTuru: 'ogrenci' | 'grup' | 'kademe' | 'kurum';
  hedefId: string;
  sonTeslim: string | null;
  hedefSoruSayisi: number | null;
  durum: OdevDurumu;
  atananSayisi: number;
}

export interface OdevVerGirdisi {
  baslik: string;
  bransKodu: string;
  konuId?: string;
  tur: OdevTuru;
  kaynak?: string;
  hedefTuru: OdevHedefTuru;
  hedefId: string;
  /** Teslim aninin UTC ISO degeri. */
  sonTeslim: string;
  hedefSoruSayisi?: number;
}

export interface OdevOgrenciSatiri {
  ogrenciOdevId: string;
  ogrenciId: string;
  ad: string | null;
  durum: OgrenciOdevDurumu;
  gecTeslim: boolean;
  teslimAt: string | null;
  yapilanSoru: number | null;
  dogru: number | null;
  yanlis: number | null;
  bos: number | null;
  ogrenciNotu: string | null;
  incelemeSonucu: IncelemeSonucu | null;
  incelemeNotu: string | null;
}

export interface OdevOzeti {
  odev: Odev;
  sayilar: {
    atanan: number;
    atandi: number;
    teslimEdildi: number;
    incelendi: number;
    tekrarIstendi: number;
    gecTeslim: number;
    /** 0-1; dogru sayisi girilen teslimlerin ortalamasi. */
    ortalamaDogruOrani: number | null;
  };
  ogrenciler: OdevOgrenciSatiri[];
}

export interface OdevSablonu {
  id: string;
  baslik: string;
  bransKodu: string;
  konuId: string | null;
  tur: OdevTuru;
  kaynak: string | null;
  hedefSoruSayisi: number | null;
}

/** Ogretmenin "Bugun" ekraninda gordugu, inceleme bekleyen teslim. */
export interface BekleyenTeslim {
  odevId: string;
  odevBaslik: string;
  ogrenciOdevId: string;
  ad: string | null;
  teslimAt: string | null;
  gecTeslim: boolean;
}

// --- Haftalik plan --------------------------------------------------------------------------

export type PlanHedefTuru = 'soru' | 'dakika';
export type PlanGorevDurumu = 'bekliyor' | 'tamam' | 'kismen' | 'yapilmadi' | 'devredildi';

export interface PlanGorevi {
  id: string;
  planId: string;
  ogrenciId: string;
  haftaBaslangic: string;
  gun: string;
  bransKodu: string;
  konuId: string | null;
  baslik: string | null;
  hedefTuru: PlanHedefTuru;
  hedefMiktar: number;
  gerceklesen: number | null;
  durum: PlanGorevDurumu;
  devredenGorevId: string | null;
  sira: number;
  surum: number;
}

export interface PlanDetayi {
  ogrenciId: string;
  haftaBaslangic: string;
  /** Hafta sonu + 14 gun gecti: yazma 409 `plan_kilitli`. */
  kilitli: boolean;
  plan: { id: string; durum: 'taslak' | 'yayinda'; not: string | null; surum: number } | null;
  gorevler: PlanGorevi[];
}

export interface GorevGirdisi {
  gun: string;
  bransKodu: string;
  konuId?: string;
  baslik?: string;
  hedefTuru: PlanHedefTuru;
  hedefMiktar: number;
}

export interface GorevGuncelleGirdisi {
  gun?: string;
  hedefTuru?: PlanHedefTuru;
  hedefMiktar?: number;
  baslik?: string | null;
  surum?: number;
}

// --- Deneme ---------------------------------------------------------------------------------

export type DenemeOnayDurumu = 'bekliyor' | 'onaylandi' | 'reddedildi';

export interface DenemeKuraliBolumu {
  bolumKodu: string;
  bransKodu: string;
  ad: string;
  soruSayisi: number;
}

export interface DenemeKurali {
  id: string;
  kod: string;
  ad: string;
  /** Yanlisin dogruyu goturme orani (LGS 0.3333, TYT/AYT/YDT 0.25). */
  yanlisKatsayisi: number;
  bolumler: DenemeKuraliBolumu[];
  toplamSoruSayisi: number;
}

export interface DenemeBolumu {
  bolumKodu: string;
  bransKodu: string;
  soruSayisi: number;
  dogru: number;
  yanlis: number;
  bos: number;
  net: number;
}

export interface Deneme {
  id: string;
  ogrenciId: string;
  /** Yalniz ogretmen/yonetici yanitlarinda. */
  ogrenciAd: string | null;
  kuralKodu: string;
  yanlisKatsayisi: number;
  ad: string;
  yayinevi: string | null;
  sinavTarihi: string;
  toplamNet: number;
  kaynak: 'ogrenci' | 'ogretmen';
  onayDurumu: DenemeOnayDurumu;
  redNedeni: string | null;
  bolumler: DenemeBolumu[];
}

export interface DenemeBolumGirdisi {
  bolumKodu: string;
  dogru: number;
  yanlis: number;
  bos?: number;
}

export interface DenemeGirdisi {
  /** Ogretmen/yonetici icin zorunlu; ogrencide yok sayilir. */
  ogrenciId?: string;
  kuralKodu: string;
  ad: string;
  yayinevi?: string;
  sinavTarihi: string;
  bolumler: DenemeBolumGirdisi[];
}

export interface DenemeGelisimNoktasi {
  denemeId: string;
  ad: string;
  sinavTarihi: string;
  toplamNet: number;
  bolumler: { bolumKodu: string; bransKodu: string; net: number }[];
}

export interface DenemeGelisimi {
  ogrenciId: string;
  kuralKodu: string;
  denemeSayisi: number;
  /** Eskiden yeniye. */
  noktalar: DenemeGelisimNoktasi[];
  son5Ortalama: number | null;
  onceki5Ortalama: number | null;
  degisim: number | null;
  bolumGelisimi: {
    bolumKodu: string;
    bransKodu: string;
    son5Ortalama: number | null;
    degisim: number | null;
  }[];
}

// --- Adaptor --------------------------------------------------------------------------------

export interface OgrenmeAdapter {
  /** Kullanimdan kalkanlar dahil tum konular (secici yenilerini sunmaz, mevcut referanslar rozetli). */
  konular: () => Promise<Konu[]>;

  // Odev (ogrenci)
  odevlerim: () => Promise<OgrenciOdevi[]>;
  odevTeslim: (ogrenciOdevId: string, g: TeslimGirdisi) => Promise<OgrenciOdevi>;
  // Odev (ogretmen)
  odevler: () => Promise<Odev[]>;
  odevVer: (g: OdevVerGirdisi) => Promise<Odev>;
  odevOzeti: (odevId: string) => Promise<OdevOzeti>;
  odevIncele: (
    ogrenciOdevId: string,
    sonuc: IncelemeSonucu,
    not?: string,
  ) => Promise<OdevOgrenciSatiri>;
  odevSablonlari: () => Promise<OdevSablonu[]>;
  incelemeBekleyenler: () => Promise<BekleyenTeslim[]>;

  // Plan (ogrenci)
  /** `hafta`: haftanin herhangi bir gunu (kurum yerel gunu). */
  planim: (hafta: string) => Promise<PlanDetayi>;
  /**
   * Gerceklesen miktari yazar. `surum` YOLLANMAZ: ayni deger tekrari sunucuda guvenlidir ve eski
   * surum cevrimdisi tekrarda 409 vermez.
   */
  gorevGerceklesen: (gorevId: string, miktar: number) => Promise<PlanGorevi>;
  gorevDevret: (gorevId: string, hedefGun?: string) => Promise<{ eski: PlanGorevi; yeni: PlanGorevi }>;
  // Plan (ogretmen)
  ogrenciPlani: (ogrenciId: string, hafta: string) => Promise<PlanDetayi>;
  planOlustur: (ogrenciId: string, haftaBaslangic: string) => Promise<PlanDetayi>;
  gorevEkle: (planId: string, g: GorevGirdisi) => Promise<PlanGorevi>;
  gorevGuncelle: (gorevId: string, g: GorevGuncelleGirdisi) => Promise<PlanGorevi>;
  gorevSil: (gorevId: string) => Promise<void>;
  planYayinla: (planId: string) => Promise<PlanDetayi>;

  // Deneme
  denemeKurallari: () => Promise<DenemeKurali[]>;
  /** Ogrenci kendi sonucunu girebilir mi (kurum ayari). */
  ogrenciDenemeGirisi: () => Promise<boolean>;
  denemelerim: () => Promise<Deneme[]>;
  denemeOlustur: (g: DenemeGirdisi) => Promise<Deneme>;
  /** Ogretmen: tek ogrenci ya da onay kuyrugu (`onay: 'bekliyor'`). */
  denemeler: (s: { onay?: DenemeOnayDurumu; ogrenciId?: string }) => Promise<Deneme[]>;
  denemeOnayla: (denemeId: string) => Promise<void>;
  denemeReddet: (denemeId: string, nedeni: string) => Promise<void>;
  denemeGelisim: (ogrenciId: string, kuralKodu: string) => Promise<DenemeGelisimi>;
}
