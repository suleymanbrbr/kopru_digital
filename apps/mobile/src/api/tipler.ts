export type Rol = 'sahip' | 'yonetici' | 'ogretmen' | 'ogrenci' | 'veli';
/** Mobil arayuzu olan roller (faz 1: veli arayuzu yok). */
export type MobilRol = Exclude<Rol, 'veli'>;

/** hesap.modul_ayarlari modul kodlari (docs/schema/api.md). */
export const MODUL_KODLARI = [
  'takvim',
  'yoklama',
  'geri_bildirim',
  'kayitlar',
  'finans',
  'odev',
  'haftalik_plan',
  'deneme',
  'soru_sor',
  'oyunlastirma',
  'duyuru',
] as const;
export type ModulKodu = (typeof MODUL_KODLARI)[number];
export type ModulDurumu = Partial<Record<ModulKodu, boolean>>;

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

export interface KvkkDurumu {
  /** Guncel aydinlatma metni surumu. */
  guncelSurum: string;
  /** Kullanicinin kabul ettigi surum; yoksa null. */
  kabulEdilenSurum: string | null;
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

const HATA_KODLARI = [
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
] as const;
export type ApiHataKodu = (typeof HATA_KODLARI)[number];

/** Adaptor katmaninin tek hata tipi. Gercek istemci HTTP hatalarini bu tipe cevirir. */
export class ApiHata extends Error {
  readonly kod: ApiHataKodu;
  readonly durum: number | undefined;
  readonly yenidenDenenebilir: boolean;

  constructor(kod: ApiHataKodu, mesaj?: string, secenekler?: { durum?: number; yenidenDenenebilir?: boolean }) {
    super(mesaj ?? kod);
    this.name = 'ApiHata';
    this.kod = kod;
    this.durum = secenekler?.durum;
    this.yenidenDenenebilir =
      secenekler?.yenidenDenenebilir ?? (kod === 'ag' || kod === 'zaman_asimi' || kod === 'sunucu');
  }
}

export function apiHatasiMi(e: unknown): e is ApiHata {
  return e instanceof ApiHata;
}
