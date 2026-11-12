/**
 * "Soru sor" (ogrenme modulu) adaptor tipleri (camelCase). Anlar ISO-8601 UTC metnidir.
 * Cizim verisi (`CizimVerisi`) `src/cizim/model.ts`te tanimlidir; api'de serbest JSON, burada `unknown`.
 */

export type SoruDurumu = 'acik' | 'cevaplandi' | 'takip_bekliyor' | 'cozuldu' | 'kapandi';
export const SORU_DURUMLARI: readonly SoruDurumu[] = [
  'acik',
  'cevaplandi',
  'takip_bekliyor',
  'cozuldu',
  'kapandi',
];
export type SoruMesajTuru = 'soru' | 'cevap' | 'takip';
export type SoruYazarRolu = 'ogrenci' | 'ogretmen' | 'yonetici';
export type SoruEkTuru = 'fotograf' | 'cizimli_fotograf' | 'ses';
export type SoruBildirimNedeni = 'uygunsuz' | 'kisisel_bilgi' | 'diger';
export const SORU_BILDIRIM_NEDENLERI: readonly SoruBildirimNedeni[] = [
  'uygunsuz',
  'kisisel_bilgi',
  'diger',
];

/** Sartname: soru basina en cok 3 fotograf; ses en cok 180 sn. */
export const SORU_EN_FAZLA_FOTOGRAF = 3;
export const SORU_SES_EN_FAZLA_SN = 180;
export const SORU_METIN_EN_FAZLA = 4000;

export interface OkumaAdresi {
  mimeTipi: string;
  /** Tam boyutlu (yakinlastirma icin) adres. */
  asilUrl: string;
  kucukUrl: string | null;
  ortaUrl: string | null;
  genislik: number | null;
  yukseklik: number | null;
  sureSn: number | null;
  /** Adresin gecerlilik sonu (ISO). */
  bitis: string;
}

export interface SoruEki {
  id: string;
  tur: SoruEkTuru;
  medyaDosyaId: string;
  kaynakDosyaId: string | null;
  sureSn: number | null;
  /** `cizimli_fotograf`: vektor cizgi verisi (bkz. `cizim/model.ts`). */
  cizimVerisi: unknown;
  sira: number;
  /** Medyadan adres alinamadiysa null. */
  adres: OkumaAdresi | null;
}

export interface SoruMesaji {
  id: string;
  yazarId: string;
  yazarAdi: string | null;
  yazarRolu: SoruYazarRolu;
  tur: SoruMesajTuru;
  metin: string | null;
  dersteKonusalim: boolean;
  sira: number;
  olusturma: string;
  ekler: SoruEki[];
}

export interface SoruFotografi {
  medyaDosyaId: string;
  sira: number;
  adres: OkumaAdresi | null;
}

export interface SoruOzeti {
  id: string;
  ogrenciId: string;
  ogrenciAdi: string | null;
  bransKodu: string;
  konuId: string | null;
  baslik: string | null;
  onizleme: string | null;
  durum: SoruDurumu;
  mesajSayisi: number;
  olusturma: string;
  sonHareket: string;
  ilkCevap: string | null;
  cozuldu: string | null;
}

export interface SoruDetayi extends SoruOzeti {
  fotoSilinme: string | null;
  yenidenAcmaSayisi: number;
  kalanTakipHakki: number;
  fotograflar: SoruFotografi[];
  mesajlar: SoruMesaji[];
  adresAlinamadi: boolean;
}

export interface SoruKotasi {
  /** null: sinirsiz. */
  gunlukLimit: number | null;
  gunlukKullanilan: number;
  /** null: sinirsiz. */
  gunlukKalan: number | null;
  /** Kurumun yerel gununun bitisi (ISO). */
  gunlukSifirlanma: string;
  aylikKalan: number | null;
  aylikSifirlanma: string;
}

export interface SoruTahmini {
  /** Medyan ilk cevap suresi; yeterli ornek yoksa null. */
  sureSn: number | null;
  ornekSayisi: number;
  /** false: hedef ogretmen bugun cevap veremiyorum dedi. */
  hedefMusait: boolean | null;
}

export interface SoruSuzgeci {
  bransKodu?: string;
  durum?: SoruDurumu;
  q?: string;
}

export interface SoruSayfasi {
  sorular: SoruOzeti[];
  sonrakiImlec: string | null;
}

export interface KuyrukSuzgeci {
  bransKodu?: string;
  ogrenciId?: string;
}

export interface ArsivSuzgeci extends KuyrukSuzgeci {
  q?: string;
}

export interface KuyrukSayisi {
  bekleyen: number;
  branslar: { bransKodu: string; bekleyen: number }[];
  enEski: string | null;
}

/** Ek girdisi: dosya kimligi medya servisinden gelir (`hazir`). */
export type EkGirdisi =
  | { tur: 'fotograf'; dosyaId: string }
  | {
      tur: 'cizimli_fotograf';
      dosyaId: string;
      kaynakDosyaId: string;
      cizimVerisi?: unknown;
    }
  | { tur: 'ses'; dosyaId: string; sureSn?: number };

export interface IsaretGirdisi {
  dosyaId: string;
  kaynakDosyaId: string;
  cizimVerisi?: unknown;
}

export interface SoruGirdisi {
  bransKodu: string;
  konuId?: string;
  baslik?: string;
  /** "Burada takildim" notu. */
  metin?: string;
  fotograflar: string[];
  isaretler?: IsaretGirdisi[];
  istekId: string;
}

export interface SoruSonucu {
  soru: SoruDetayi;
  /** true: ayni `istek_id` onceki istekle islendi, kota tuketilmedi. */
  tekrar: boolean;
  kota: SoruKotasi;
  tahmin: SoruTahmini;
}

export interface TakipGirdisi {
  metin: string;
  ekler?: Exclude<EkGirdisi, { tur: 'ses' }>[];
  istekId: string;
}

export interface CevapGirdisi {
  metin?: string;
  dersteKonusalim: boolean;
  ekler?: EkGirdisi[];
  istekId: string;
}

export interface Musaitlik {
  musait: boolean;
  /** Kurum yerel gunu (YYYY-AA-GG). */
  musaitDegilTarihi: string | null;
}

export interface SoruAdapter {
  // Ogrenci
  sorularim: (suzgec: SoruSuzgeci, imlec: string | null) => Promise<SoruSayfasi>;
  kota: () => Promise<SoruKotasi>;
  soru: (id: string) => Promise<SoruDetayi>;
  soruSor: (girdi: SoruGirdisi) => Promise<SoruSonucu>;
  /** Cevaplanmis soru `cozuldu` olur (idempotent). */
  anladim: (id: string) => Promise<SoruDetayi>;
  takip: (id: string, girdi: TakipGirdisi) => Promise<SoruDetayi>;
  bildir: (
    id: string,
    neden: SoruBildirimNedeni,
    aciklama?: string,
    mesajId?: string,
  ) => Promise<void>;

  // Ogretmen
  gelenSorular: (suzgec: KuyrukSuzgeci, imlec: string | null) => Promise<SoruSayfasi>;
  gelenSoruSayisi: () => Promise<KuyrukSayisi>;
  cevapla: (id: string, girdi: CevapGirdisi) => Promise<SoruDetayi>;
  cevapladiklarim: (suzgec: ArsivSuzgeci, imlec: string | null) => Promise<SoruSayfasi>;
  musaitlik: () => Promise<Musaitlik>;
  musaitlikAyarla: (musait: boolean) => Promise<Musaitlik>;
}
