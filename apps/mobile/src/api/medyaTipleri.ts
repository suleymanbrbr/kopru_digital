/**
 * Medya servisi (dosya yukleme) adaptor tipleri. Akis: `izinAl` -> `yukle` (presigned PUT) -> `tamam`
 * -> `durum` ile `hazir` beklenir. Ayni `istemciAnahtari` ayni kaydi (ve yeni PUT adresi) dondurur.
 */

/** Mobilden yuklenen soru-sor dosya turleri (`MEDYA_TUR_KURALLARI` ile ayni adlar). */
export type MedyaTuru = 'soru_fotografi' | 'soru_cevap_fotografi' | 'soru_cizim' | 'soru_ses';

export type MedyaDurumu =
  | 'yukleme_bekliyor'
  | 'yuklendi'
  | 'isleniyor'
  | 'hazir'
  | 'islenemedi'
  | 'silindi';

export interface MedyaIzniGirdisi {
  tur: MedyaTuru;
  mimeTipi: string;
  boyutBayt: number;
  /** Baytlarin SHA-256 ozeti (64 hane onaltilik, kucuk harf). */
  sha256: string;
  /** Istemcinin urettigi UUID (zayif baglantida guvenli yeniden deneme). */
  istemciAnahtari: string;
}

export interface YuklemeAdresi {
  url: string;
  /** PUT istegine AYNEN eklenecek basliklar (imzaya dahil). */
  basliklar: Record<string, string>;
  bitis: string;
}

export interface MedyaIzni {
  dosyaId: string;
  durum: MedyaDurumu;
  /** Yalniz `yukleme_bekliyor` ve adres gecerliyken dolu. */
  yukleme: YuklemeAdresi | null;
}

export interface MedyaDosyaDurumu {
  dosyaId: string;
  durum: MedyaDurumu;
  boyutBayt: number | null;
  /** Medya hata kodu (`bozuk_dosya`, `boyut_uyusmazligi` ...). */
  hataKodu: string | null;
}

export interface YerelDosyaBilgisi {
  boyutBayt: number;
  sha256: string;
}

export interface MedyaAdapter {
  izinAl: (girdi: MedyaIzniGirdisi) => Promise<MedyaIzni>;
  /**
   * Presigned PUT. Uygulama arka plandayken de surebilen bir oturumla (iOS arka plan
   * `NSURLSession`) calisir; HTTP 2xx disinda `ApiHata` firlatir.
   */
  yukle: (adres: YuklemeAdresi, yerelUri: string, mimeTipi: string) => Promise<void>;
  /** Idempotent. Nesne henuz yoksa `cakisma` hatasi, `ayrinti: 'yukleme_bulunamadi'`. */
  tamam: (dosyaId: string) => Promise<MedyaDosyaDurumu>;
  durum: (dosyaId: string) => Promise<MedyaDosyaDurumu>;
  /** Yerel dosyanin boyutu ve SHA-256 ozeti. */
  yerelBilgi: (yerelUri: string) => Promise<YerelDosyaBilgisi>;
}
