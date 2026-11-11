/**
 * Ders kayitlari (Kayitlarim, kayit ekleme) ve ders sonu geri bildirimi adaptor tipleri (camelCase).
 * Anlar ISO-8601 UTC metnidir. Video bizde degildir: kayit, harici bir baglantidir.
 */

export type KayitSaglayici = 'zoom' | 'drive' | 'youtube' | 'onedrive' | 'diger';
export type KayitTuru = 'kayit' | 'materyal';
export type KayitDurumu = 'aktif' | 'suresi_doldu' | 'bozuk' | 'gizli';
export type SorunNedeni = 'acilmiyor' | 'parola_yanlis' | 'suresi_doldu' | 'diger';
export type GeriBildirimDegeri = 'anladim' | 'kismen' | 'anlamadim';

export const SORUN_NEDENLERI: readonly SorunNedeni[] = [
  'acilmiyor',
  'parola_yanlis',
  'suresi_doldu',
  'diger',
];
export const GERI_BILDIRIM_DEGERLERI: readonly GeriBildirimDegeri[] = [
  'anladim',
  'kismen',
  'anlamadim',
];

// --- Ogrenci: Kayitlarim --------------------------------------------------------------------

export interface KayitSatiri {
  id: string;
  tur: KayitTuru;
  dersId: string | null;
  grupId: string;
  baslik: string;
  saglayici: KayitSaglayici;
  url: string;
  parolaVar: boolean;
  gecerlilikBitis: string | null;
  konuId: string | null;
  durum: KayitDurumu;
  bransKodu: string | null;
  /** Dersin baslangici (materyalde null). */
  dersBaslangic: string | null;
  eklenme: string;
  izlendi: boolean;
  izlediAt: string | null;
  /** Bir ogrenci "acilmiyor" bildirdi (liste uyarisi). */
  bozuk: boolean;
}

export interface KayitDetayi extends KayitSatiri {
  /** Yalniz tekil okumada; listede `parolaVar`. */
  parola: string | null;
  /** Bu ogrencinin bu kayit icin acik bildirimi var. */
  acikSorunVar: boolean;
}

export interface KayitSuzgeci {
  tur?: KayitTuru;
  bransKodu?: string;
  /** Kurum yerel gunu `YYYY-MM-DD` (dahil). */
  baslangic?: string;
  bitis?: string;
}

export interface KayitSayfasi {
  kayitlar: KayitSatiri[];
  /** Opak imlec; yoksa son sayfa. */
  sonrakiImlec: string | null;
}

export interface IzledimSonucu {
  izlediAt: string;
  /** false: zaten isaretliydi. */
  ilk: boolean;
}

// --- Ogretmen: kayit ekleme ve izleme ------------------------------------------------------

export interface DersKaynagi {
  id: string;
  tur: KayitTuru;
  dersId: string | null;
  baslik: string;
  saglayici: KayitSaglayici;
  url: string;
  parolaVar: boolean;
  gecerlilikBitis: string | null;
  durum: KayitDurumu;
  izleyenSayisi: number;
  acikSorunSayisi: number;
  eklenme: string;
  dersBaslangic: string | null;
}

export interface KaynakIzlemesi {
  hedefSayisi: number;
  izleyenler: { ogrenciId: string; ad: string; izlediAt: string }[];
  izlemeyenler: { ogrenciId: string; ad: string }[];
}

export interface KaynakGirdisi {
  baslik: string;
  url: string;
  parola?: string;
  /** Son erisim (ISO, gelecekte). */
  gecerlilikBitis?: string;
}

// --- Geri bildirim --------------------------------------------------------------------------

export interface BekleyenGeriBildirim {
  dersId: string;
  bransKodu: string;
  baslik: string | null;
  baslangic: string;
  bitis: string;
  /** Bu andan sonra degistirilemez. */
  sonVerme: string;
}

export interface GeriBildirim {
  dersId: string;
  deger: GeriBildirimDegeri;
  konuId: string | null;
  not: string | null;
  guncelleme: string;
}

export interface GeriBildirimGirdisi {
  deger: GeriBildirimDegeri;
  konuId?: string | null;
  not?: string | null;
}

export interface GeriBildirimSayilari {
  anladim: number;
  kismen: number;
  anlamadim: number;
  toplam: number;
}

export interface DersGeriBildirimleri {
  dersId: string;
  ozet: GeriBildirimSayilari;
  satirlar: (GeriBildirim & { ogrenciId: string; ad: string })[];
  katilimciSayisi: number;
}

export interface KayitAdapter {
  /** Izlenmemisler once; `imlec` onceki sayfanin `sonrakiImlec`i. */
  kayitlarim: (suzgec: KayitSuzgeci, imlec: string | null) => Promise<KayitSayfasi>;
  kayit: (id: string) => Promise<KayitDetayi>;
  /** Idempotent ("izledim" geri alinmaz). */
  izledim: (id: string) => Promise<IzledimSonucu>;
  sorunBildir: (id: string, neden: SorunNedeni, aciklama?: string) => Promise<void>;

  /** Personel: kurumdaki kaynaklar (derse ya da gune gore). */
  kaynaklar: (suzgec: {
    dersId?: string;
    baslangic?: string;
    bitis?: string;
  }) => Promise<DersKaynagi[]>;
  kaynakIzlemeleri: (kaynakId: string) => Promise<KaynakIzlemesi>;
  kaynakEkle: (dersId: string, linkler: KaynakGirdisi[]) => Promise<DersKaynagi[]>;

  geriBildirimBekleyen: () => Promise<BekleyenGeriBildirim[]>;
  /** PUT: ayni ders icin tekrar gonderim gunceller (idempotent). */
  geriBildirimVer: (dersId: string, g: GeriBildirimGirdisi) => Promise<GeriBildirim>;
  dersGeriBildirimleri: (dersId: string) => Promise<DersGeriBildirimleri>;
}
