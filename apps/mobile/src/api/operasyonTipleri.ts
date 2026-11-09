/**
 * Ders, yoklama ve finans icin adaptor katmani tipleri (camelCase). Tum para tutarlari kurus
 * tam sayisidir; anlar ISO-8601 UTC metnidir (gosterim kurumun saat dilimindedir).
 */

export type DersDurumu = 'planli' | 'tamamlandi' | 'iptal';
export type GrupTuru = 'birebir' | 'grup' | 'sinif' | 'etut';
export type DersKapsami = 'yalniz_bu' | 'bu_ve_sonrakiler';
export type IptalKaynagi = 'ogretmen' | 'ogrenci' | 'yonetici';
export type YoklamaDurumu = 'geldi' | 'gelmedi' | 'izinli' | 'gec';
export type NotGorunurluk = 'ogretmene_ozel' | 'ogrenciye';
export type FinansModeli = 'paket' | 'ders_basi' | 'yok';
export type TahsilatYontemi = 'nakit' | 'havale' | 'kart';

export interface Ders {
  id: string;
  grupId: string;
  seriId: string | null;
  ogretmenId: string;
  bransKodu: string;
  baslik: string | null;
  baslangic: string;
  bitis: string;
  durum: DersDurumu;
  iptalNedeni: string | null;
  seriIstisna: boolean;
  onlineBaglanti: string | null;
  yer: string | null;
  katilimciSayisi: number;
  surum: number;
  /** Ders listesinde gorunecek grup/ogrenci adi (varsa; adaptor doldurur). */
  grupAd?: string | null;
}

export interface BekleyenYoklamaDersi extends Ders {
  yoklamasiEksikSayisi: number;
}

/** Ders acarken secilebilen grup; birebir grupta `ogrenciAd` tek uyenin adidir. */
export interface DersGrubu {
  id: string;
  ad: string;
  tur: GrupTuru;
  uyeSayisi: number;
  ogrenciAd: string | null;
}

export interface YeniDersGirdisi {
  grupId: string;
  /** Kurum yerel gunu `YYYY-MM-DD`. */
  tarih: string;
  /** Kurum yerel saati `SS:DD`. */
  saat: string;
  sureDk: number;
  haftalik: boolean;
  /** Haftalik tekrarin son gunu (dahil); bos ise suresiz (12 hafta ileriye uretilir). */
  bitisTarihi?: string;
  bransKodu?: string;
  baslik?: string;
  onlineBaglanti?: string;
  yer?: string;
  cakismaOnayli: boolean;
}

export interface CakisanDers {
  id: string;
  grupId: string;
  baslik: string | null;
  baslangic: string;
  bitis: string;
}

export interface DersOlusturSonucu {
  dersler: Ders[];
  /** `cakismaOnayli` ile yazilirken cakisilan mevcut dersler. */
  cakisanlar: CakisanDers[];
  /** Bir ya da daha fazla ogrencinin ayni saatte baska dersi var (uyari). */
  ogrenciCakismasi: boolean;
  atlanan: number;
}

export interface DersTasiGirdisi {
  kapsam: DersKapsami;
  yeniTarih?: string;
  yeniSaat?: string;
  cakismaOnayli: boolean;
}

export interface DersIptalGirdisi {
  kapsam: DersKapsami;
  kaynak: IptalKaynagi;
  neden?: string;
}

export interface DersIslemSonucu {
  etkilenen: number;
  ogrenciCakismasi: boolean;
}

// --- Yoklama --------------------------------------------------------------------------------

export interface YoklamaSatiri {
  ogrenciId: string;
  durum: YoklamaDurumu;
  gecDakika?: number;
  not?: string;
  notGorunurluk?: NotGorunurluk;
  /** Dokunma anindaki istemci saati (ISO); yeniden denemede degismez. */
  isaretlenmeAt: string;
}

export interface YoklamaKatilimcisi {
  ogrenciId: string;
  ad: string;
  tur: 'uye' | 'misafir' | 'telafi';
  /** Mevcut yoklama; yoksa null. */
  durum: YoklamaDurumu | null;
  /** Ogrenciye gorunur ders notu (ogrenci rolunde `ogretmene_ozel` not hep null); yoksa null. */
  not: string | null;
}

export type YoklamaSonucTuru = 'yeni' | 'guncellendi' | 'ayni' | 'eski';

export interface YoklamaSonucu {
  ogrenciId: string;
  sonuc: YoklamaSonucTuru;
  kalanKredi: number | null;
}

export interface YoklamaKaydiSonucu {
  dersId: string;
  sonuclar: YoklamaSonucu[];
}

// --- Finans ---------------------------------------------------------------------------------

export interface Paket {
  id: string;
  ad: string;
  krediAdedi: number;
  fiyatKurus: number;
  gecerlilikGun: number | null;
}

export interface FinansOgrenciSatiri {
  ogrenciId: string;
  ad: string;
  model: FinansModeli;
  kalanKredi: number;
  bakiyeKurus: number;
  borclu: boolean;
}

export interface FinansOgrenciListesi {
  ogrenciler: FinansOgrenciSatiri[];
  dusukKrediEsigi: number;
}

export interface EtkinPaket {
  id: string;
  ad: string;
  toplamKredi: number;
  kalanKredi: number;
  bitisTarihi: string | null;
}

export interface FinansHareketi {
  id: string;
  tur: 'kredi' | 'bakiye';
  /** Insan okunur tur adi anahtari (i18n `mobil.finans.hareketTuru.*`). */
  turKodu: string;
  /** Kredi hareketinde adet, bakiye hareketinde kurus. */
  miktar: number;
  tarih: string;
}

/** Personel gorunumu: bakiye, paketler, hareketler ve odeyen bilgisi. */
export interface OgrenciKartiTam {
  gorunum: 'tam';
  ogrenciId: string;
  model: FinansModeli;
  kalanKredi: number;
  dusukKrediEsigi: number;
  /** Negatif = borclu. */
  bakiyeKurus: number;
  borclu: boolean;
  etkinPaketler: EtkinPaket[];
  hareketler: FinansHareketi[];
  odeyenAd: string | null;
  odeyenTelefon: string | null;
}

/** Ogrenci gorunumu: yalniz kalan ders (kurum ayari kapaliysa `null`). Fiyat/borc yoktur. */
export interface OgrenciKartiOgrenci {
  gorunum: 'ogrenci';
  ogrenciId: string;
  kalanKredi: number | null;
}

export type OgrenciKarti = OgrenciKartiTam | OgrenciKartiOgrenci;

export type OdemeSecimi =
  | { tur: 'sonra' }
  | { tur: 'tamami'; yontem: TahsilatYontemi }
  | { tur: 'kismi'; yontem: TahsilatYontemi; tutarKurus: number };

export interface PaketSatisGirdisi {
  ogrenciId: string;
  paketId: string;
  odeme: OdemeSecimi;
}

export interface PaketSatisSonucu {
  kalanKredi: number;
  bakiyeKurus: number;
}

export interface TahsilatGirdisi {
  ogrenciId: string;
  tutarKurus: number;
  yontem: TahsilatYontemi;
}

export interface TahsilatSonucu {
  /** Ayni `Idempotency-Key` ile yinelenen istek: yeni kayit olusmadi. */
  tekrar: boolean;
}

// --- Adaptorler -----------------------------------------------------------------------------

export interface DersAdapter {
  /** Kurumun saat dilimi (IANA); okunamazsa `Europe/Istanbul`. */
  saatDilimi: () => Promise<string>;
  /** [baslangic, bitis) araligindaki dersler (tum sayfalar). */
  dersler: (baslangic: string, bitis: string) => Promise<Ders[]>;
  gruplar: () => Promise<DersGrubu[]>;
  dersOlustur: (g: YeniDersGirdisi) => Promise<DersOlusturSonucu>;
  dersTasi: (ders: Ders, g: DersTasiGirdisi) => Promise<DersIslemSonucu>;
  dersIptal: (ders: Ders, g: DersIptalGirdisi) => Promise<DersIslemSonucu>;
  yoklamaBekleyen: () => Promise<BekleyenYoklamaDersi[]>;
  yoklamaKatilimcilari: (dersId: string) => Promise<YoklamaKatilimcisi[]>;
  /** `Idempotency-Key` = `istekId` (cevrimdisi kuyruk her denemede ayni degeri gonderir). */
  yoklamaKaydet: (
    dersId: string,
    satirlar: YoklamaSatiri[],
    istekId: string,
  ) => Promise<YoklamaKaydiSonucu>;
}

export interface FinansAdapter {
  paketler: () => Promise<Paket[]>;
  ogrenciler: () => Promise<FinansOgrenciListesi>;
  ogrenciKarti: (ogrenciId: string) => Promise<OgrenciKarti>;
  paketSat: (g: PaketSatisGirdisi) => Promise<PaketSatisSonucu>;
  /** `istekId` Idempotency-Key olarak gider; ayni deger tekrar gonderilirse cift kayit olusmaz. */
  tahsilatAl: (g: TahsilatGirdisi, istekId: string) => Promise<TahsilatSonucu>;
}
