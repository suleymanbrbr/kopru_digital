import type { ModulDurumu } from '@kopru/contracts';

export type Rol = 'sahip' | 'yonetici' | 'ogretmen' | 'ogrenci' | 'veli';
/** Mobil arayuzu olan roller (faz 1: veli arayuzu yok). */
export type MobilRol = Exclude<Rol, 'veli'>;

/** Modul kodlari tek kaynaktan gelir: `@kopru/contracts` (api migration'i, web, mobil, i18n ayni listeyi kullanir). */
export type { ModulDurumu, ModulKodu } from '@kopru/contracts';

export interface Kullanici {
  id: string;
  adSoyad: string;
  telefon: string;
}

export interface Uyelik {
  uyelikId: string;
  kurumId: string;
  kurumAd: string;
  rol: Rol;
}

/** Kullanicinin onayina sunulan hukuki metin (api `rizalar/guncel`). */
export interface RizaMetni {
  id: string;
  /** `kvkk_aydinlatma`, `kullanim_kosullari` ... Bilinmeyen turler de gosterilir. */
  tur: string;
  baslik: string;
  govdeMarkdown: string;
  surum: string;
}

export interface KvkkDurumu {
  /** Guncel aydinlatma metni surumu. */
  guncelSurum: string;
  /** Kullanicinin kabul ettigi surum; yoksa null. */
  kabulEdilenSurum: string | null;
  /**
   * Henuz kabul edilmemis metinler (sirali). Bos ise ekran metinleri `kvkkMetinleriYukle` ile
   * getirir; metin yuklenmeden onay verilemez.
   */
  metinler: RizaMetni[];
}

export interface OturumBilgisi {
  kullanici: Kullanici;
  uyelikler: Uyelik[];
  kvkk: KvkkDurumu;
}

export interface UyelikBaglami {
  uyelik: Uyelik;
  moduller: ModulDurumu;
  /** Kurum vurgu rengi (#RRGGBB) ya da null. */
  vurgu: string | null;
}

export type TurKodu = 'kivilcim' | 'dinamo' | 'sedir';
export interface Beceriler {
  sayisal: number;
  sozel: number;
  fen: number;
  sosyal: number;
  dil: number;
}
export interface KarakterOzeti {
  ad: string;
  tur: TurKodu;
  asama: number;
  seviye: number;
  varyant: 0 | 1;
  beceriler: Beceriler;
  uykulu: boolean;
}

export interface OgretmenBugun {
  dersler: { id: string; baslik: string; saat: string }[];
  bekleyenSorular: { id: string; ogrenciAd: string; konu: string }[];
}
export interface OgrenciBugun {
  seri: number;
  gorevler: { id: string; baslik: string; tamam: boolean }[];
  karakter: KarakterOzeti;
}

/** Sinif koduyla katilim istegi (ogrencinin kendi istegi; kurum ve grup adiyla). */
export type KatilimDurumu = 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal';
export interface KatilimIstegi {
  id: string;
  kurumId: string;
  kurumAd: string;
  grupId: string;
  grupAd: string;
  durum: KatilimDurumu;
  /** Istegin acilis zamani (ISO). */
  olusturma: string;
}

/** Ogretmenin gordugu istek: yalnizca gorunen ad (telefon/e-posta donmez). */
export interface GrupKatilimIstegi {
  id: string;
  grupId: string;
  kullaniciId: string;
  gorunenAd: string;
  olusturma: string;
}

export interface SinifGrubu {
  id: string;
  ad: string;
  uyeSayisi: number;
}

export interface KatilimKodu {
  /** 8 karakter, buyuk harf. */
  kod: string;
  /** Bitis (ISO) ya da suresiz ise null. */
  bitis: string | null;
  maxKullanim: number | null;
  kullanimSayisi: number;
}

/** `ogrenciler` sekmesi: sinif grubu + bekleyen istekleri. */
export interface SinifBekleyenleri {
  grup: SinifGrubu;
  istekler: GrupKatilimIstegi[];
}

export interface OturumKaydi {
  id: string;
  olusturma: string;
  sonKullanim: string;
  cihaz: string | null;
  ipMaskeli: string | null;
  /** Istegi yapan (bu cihazdaki) oturum. */
  buOturum: boolean;
}

export interface DavetSonucu {
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

export const HATA_KODLARI = [
  'ag',
  'zaman_asimi',
  'yetkisiz',
  'riza_gerekli',
  'abonelik_gerekli',
  'modul_kapali',
  'izin_yok',
  'dogrulama',
  'bulunamadi',
  'sunucu',
  'yapilandirma',
  'otp_gecersiz',
  'otp_cok_deneme',
  /** Genel hiz siniri (429); OTP disinda. */
  'cok_istek',
  /** Sinif kodu gecersiz/kapali/suresi dolmus (410). */
  'kod_gecersiz',
  /** Kullanici zaten bu kurumun uyesi (409 zaten_uye). */
  'zaten_uye',
  /** Davet gecersiz/kullanilmis/suresi dolmus (410). */
  'davet_gecersiz',
  /** Durum cakismasi (409): kapasite_dolu, istek_beklemiyor ...; ayrinti `ayrinti`da. */
  'cakisma',
  /** Islem baglanti gerektirir ve cihaz cevrimdisi (istek gonderilmedi). */
  'cevrimdisi',
] as const;
export type ApiHataKodu = (typeof HATA_KODLARI)[number];

/** Adaptor katmaninin tek hata tipi. Gercek istemci HTTP hatalarini bu tipe cevirir. */
export class ApiHata extends Error {
  readonly kod: ApiHataKodu;
  readonly durum: number | undefined;
  readonly yenidenDenenebilir: boolean;
  /** Api hata kodu (ornegin `kapasite_dolu`); kullaniciya ozel mesaj secmek icin. */
  readonly ayrinti: string | undefined;

  constructor(
    kod: ApiHataKodu,
    mesaj?: string,
    secenekler?: { durum?: number; yenidenDenenebilir?: boolean; ayrinti?: string },
  ) {
    super(mesaj ?? kod);
    this.name = 'ApiHata';
    this.kod = kod;
    this.durum = secenekler?.durum;
    this.ayrinti = secenekler?.ayrinti;
    this.yenidenDenenebilir =
      secenekler?.yenidenDenenebilir ?? (kod === 'ag' || kod === 'zaman_asimi' || kod === 'sunucu');
  }
}

export function apiHatasiMi(e: unknown): e is ApiHata {
  return e instanceof ApiHata;
}
