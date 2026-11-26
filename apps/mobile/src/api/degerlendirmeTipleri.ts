/**
 * Ogretmen degerlendirmesi, kaynak onerisi ve ogrenci kocluk gorunumu adaptor tipleri (camelCase;
 * api `snake_case` govdeleri `gercekDegerlendirme.ts`te cevrilir). Ogrenci kimligi = uyelik kimligidir.
 *
 * Ogrenci tipleri (`OgrenciDegerlendirmesi`) bilerek gorunurluk bayragini, yazar kimligini ve surumu
 * TASIMAZ: ogrenci ekranlari bu alanlara tip duzeyinde bile ulasamaz (api de yanitta vermez).
 */
import type { Oneri } from './gunlukSoruTipleri';

/** Ayni anahtarlar api alan adlari ve `degerlendirme.olcek.*` metin anahtarlaridir. */
export type OlcekKodu = 'calisma_duzeni' | 'derse_katilim' | 'odev_disiplini' | 'anlama_duzeyi';
export const OLCEK_KODLARI: readonly OlcekKodu[] = [
  'calisma_duzeni',
  'derse_katilim',
  'odev_disiplini',
  'anlama_duzeyi',
];
export const OLCEK_PUANLARI = [1, 2, 3, 4, 5] as const;
/** Yorum en cok (api CHECK). */
export const YORUM_EN_FAZLA = 4000;
/** Oneri notu en cok (api CHECK). */
export const NOT_EN_FAZLA = 1000;
/** Oneri basligi en cok / baglanti en cok (api CHECK). */
export const BASLIK_EN_FAZLA = 200;
export const BAGLANTI_EN_FAZLA = 2000;
/** Donem en cok (gun, ucu dahil). */
export const DONEM_EN_FAZLA_GUN = 31;

export type Olcekler = Record<OlcekKodu, number | null>;

// --- Degerlendirme ---------------------------------------------------------------------------

/** Personel gorunumu (zaman cizelgesi). */
export interface Degerlendirme {
  id: string;
  ogrenciId: string;
  yazarId: string;
  /** Yazar hesabi silindiyse (anonimlesmis uyelik) bos. */
  yazarAd: string | null;
  /** Etkin uyelik yazar mi. */
  benim: boolean;
  bransKodu: string | null;
  donemBaslangic: string;
  donemBitis: string;
  olcekler: Olcekler;
  yorum: string | null;
  ogrenciGorur: boolean;
  /** Yazar ve olusturmadan sonraki 7 gun icinde mi. */
  duzenlenebilir: boolean;
  duzenlemeSon: string;
  geriCekildi: boolean;
  surum: number;
  olusturma: string;
}

/** Ogrenci gorunumu: yalniz kendisine gorunur isaretlenmis, geri cekilmemis kayitlar. */
export interface OgrenciDegerlendirmesi {
  id: string;
  yazarAd: string | null;
  bransKodu: string | null;
  donemBaslangic: string;
  donemBitis: string;
  olcekler: Olcekler;
  yorum: string | null;
  olusturma: string;
}

export interface DegerlendirmeGirdisi {
  donemBaslangic: string;
  /** Verilmezse tek gun. */
  donemBitis?: string;
  bransKodu?: string | null;
  /** Bos birakilan olcek yollanmaz. */
  olcekler: Partial<Olcekler>;
  yorum?: string | null;
  ogrenciGorur: boolean;
}

export interface DegerlendirmeGuncelleGirdisi {
  donemBaslangic?: string;
  donemBitis?: string;
  bransKodu?: string | null;
  /** `null` = olcegi temizle. */
  olcekler?: Partial<Olcekler>;
  yorum?: string | null;
  ogrenciGorur?: boolean;
  surum: number;
}

export interface DegerlendirmeSayfasi {
  degerlendirmeler: Degerlendirme[];
  sonrakiImlec: string | null;
}

export interface OgrenciDegerlendirmeSayfasi {
  degerlendirmeler: OgrenciDegerlendirmesi[];
  sonrakiImlec: string | null;
}

// --- Kaynak onerisi --------------------------------------------------------------------------

export type OneriTuru = 'kaynak_kitap' | 'kaynak_kitap_testi' | 'link' | 'serbest';

export interface KaynakOnerisi {
  id: string;
  ogrenciId: string;
  onerenId: string;
  onerenAd: string | null;
  benim: boolean;
  tur: OneriTuru;
  kaynakKitapId: string | null;
  kaynakKitapAd: string | null;
  kaynakTestId: string | null;
  kaynakTestAd: string | null;
  baglantiUrl: string | null;
  baslik: string | null;
  bransKodu: string | null;
  konuId: string | null;
  konuAd: string | null;
  notMetni: string | null;
  /** `link` icin `null` (baslama olculemez). */
  basladi: boolean | null;
  ilkKullanimGun: string | null;
  sonKullanimGun: string | null;
  kayitSayisi: number;
  olusturma: string;
}

export type KaynakOneriGirdisi =
  | { tur: 'kaynak_kitap'; kitapId: string; konuId?: string | null; notMetni?: string | null }
  | { tur: 'kaynak_kitap_testi'; testId: string; konuId?: string | null; notMetni?: string | null }
  | {
      tur: 'link';
      baglantiUrl: string;
      baslik: string;
      bransKodu?: string | null;
      konuId?: string | null;
      notMetni?: string | null;
    }
  | {
      tur: 'serbest';
      baslik: string;
      bransKodu?: string | null;
      konuId?: string | null;
      notMetni?: string | null;
    };

// --- Kocluk ----------------------------------------------------------------------------------

export interface OlcekHaftasi {
  haftaBaslangici: string;
  sayi: number;
  ortalamalar: Olcekler;
}

export interface KullanilanKitap {
  kitapId: string;
  ad: string;
  bransKodu: string;
  cozulenTest: number;
  toplamTest: number;
  cozulenSoru: number;
  kayitSayisi: number;
  sonKullanimGun: string;
}

export interface KullanilanKaynaklar {
  kitaplar: KullanilanKitap[];
  serbest: { ad: string; kayitSayisi: number; sonKullanimGun: string }[];
  odevler: { ad: string; odevSayisi: number; sonKullanimGun: string }[];
}

export interface ZayifKonu {
  bransKodu: string;
  konuId: string;
  konuAd: string | null;
  ustKonuAd: string | null;
  cozulen: number;
  basari: number | null;
}

export interface KonuOzeti {
  bas: string;
  bit: string;
  cozulen: number;
  basari: number | null;
  /** Dersler arasi en zayiflar (en fazla 5; api siralamasi korunur). */
  zayifKonular: ZayifKonu[];
  /** Sistem onerileri (yalniz personel yanitindadir). */
  oneriler: Oneri[];
}

export interface PlanOzeti {
  durum: 'taslak' | 'yayinda';
  haftaBaslangici: string;
  gorevSayisi: number;
  tamamSayisi: number;
  soru: { planlanan: number; gerceklesen: number };
  dakika: { planlanan: number; gerceklesen: number };
}

export interface OdevOzeti {
  acik: number;
  geciken: number;
  teslimEdildi: number;
  incelemeBekleyen: number;
}

export interface Kocluk {
  ogrenciId: string;
  ogrenciAd: string | null;
  degerlendirmeler: DegerlendirmeSayfasi;
  olcekHaftalari: OlcekHaftasi[];
  olcekToplami: { sayi: number; ortalamalar: Olcekler };
  kullanilanKaynaklar: KullanilanKaynaklar;
  oneriler: KaynakOnerisi[];
  konuOzeti: KonuOzeti;
  plan: PlanOzeti | null;
  odev: OdevOzeti;
}

// --- Bugun hatirlatmasi ----------------------------------------------------------------------

export interface HatirlatmaOgrencisi {
  ogrenciId: string;
  ogrenciAd: string | null;
  /** Hic yazilmadiysa null. */
  sonDegerlendirmeGun: string | null;
}

export interface DegerlendirmeHatirlatma {
  haftaBaslangici: string;
  ogrenciSayisi: number;
  eksikSayisi: number;
  ogrenciler: HatirlatmaOgrencisi[];
}

// --- Adaptor ---------------------------------------------------------------------------------

export interface DegerlendirmeAdapter {
  /** Personel: degerlendirme yazar (kapsam disi ogrenci `bulunamadi`). */
  degerlendirmeYaz: (ogrenciId: string, g: DegerlendirmeGirdisi) => Promise<Degerlendirme>;
  /** Yalniz yazar ve 7 gun icinde; aksi `cakisma` (`degerlendirme_duzenlenemez`). */
  degerlendirmeDuzenle: (id: string, g: DegerlendirmeGuncelleGirdisi) => Promise<Degerlendirme>;
  /** Yazar ya da sahip/yonetici; tekrar cagri ayni kaydi doner. */
  degerlendirmeGeriCek: (id: string) => Promise<Degerlendirme>;
  /** Zaman cizelgesinin devami (koclukta ilk sayfa vardir). */
  degerlendirmeler: (
    ogrenciId: string,
    imlec?: string | null,
    limit?: number,
  ) => Promise<DegerlendirmeSayfasi>;
  /** Tek istekte koclukta gereken her sey. */
  kocluk: (ogrenciId: string) => Promise<Kocluk>;
  /** Bu hafta degerlendirmesi olmayan ogrencilerim (Bugun karti). */
  hatirlatma: () => Promise<DegerlendirmeHatirlatma>;
  kaynakOner: (ogrenciId: string, g: KaynakOneriGirdisi) => Promise<KaynakOnerisi>;
  kaynakOneriGeriCek: (id: string) => Promise<KaynakOnerisi>;

  /** Yalniz ogrenci: kendisine GORUNUR degerlendirmeler. */
  degerlendirmelerim: (imlec?: string | null) => Promise<OgrenciDegerlendirmeSayfasi>;
  /** Yalniz ogrenci: kendisine onerilen (geri cekilmeyen) kaynaklar. */
  kaynakOnerilerim: () => Promise<KaynakOnerisi[]>;
}
