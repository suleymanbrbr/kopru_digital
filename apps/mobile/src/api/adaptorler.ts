import type { KayitAdapter } from './kayitTipleri';
import type { MedyaAdapter } from './medyaTipleri';
import type { OgrenmeAdapter } from './ogrenmeTipleri';
import type { SoruAdapter } from './soruTipleri';
import type { DersAdapter, FinansAdapter } from './operasyonTipleri';
import type {
  DavetSonucu,
  KatilimIstegi,
  KatilimKodu,
  OgrenciBugun,
  OgretmenBugun,
  OturumBilgisi,
  OturumKaydi,
  RizaMetni,
  SinifBekleyenleri,
  UyelikBaglami,
} from './tipler';

/**
 * Kimlik dogrulama ve oturum adaptoru (ADR 0004). Belirtec saklama/yenileme adaptorun isidir;
 * gercek uygulama packages/api-client uzerinden baglanacak, simdilik mock vardir.
 */
export interface AuthAdapter {
  /** Telefona OTP yollar. `yenidenGondermeSn`: yeniden istek icin beklenecek sure. */
  otpIste: (telefon: string) => Promise<{ yenidenGondermeSn: number }>;
  /** Kodu dogrular; basariliysa belirtecleri depoya yazar. */
  otpDogrula: (telefon: string, kod: string) => Promise<void>;
  /** Mevcut oturumun kullanici, uyelikler ve KVKK durumu. Oturum yoksa `yetkisiz` firlatir. */
  oturumBilgisi: () => Promise<OturumBilgisi>;
  /** Onay bekleyen (kabul edilmemis) guncel metinleri taze okur. */
  kvkkMetinleri: () => Promise<RizaMetni[]>;
  kvkkKabulEt: (surum: string) => Promise<void>;
  /** Etkin uyelik/kurum secimi (yeni erisim belirteci alir). */
  uyelikSec: (uyelikId: string) => Promise<UyelikBaglami>;
  cikis: () => Promise<void>;
}

/** Ekranlarin veri adaptoru (okuma). */
export interface VeriAdapter {
  ogretmenBugun: () => Promise<OgretmenBugun>;
  ogrenciBugun: () => Promise<OgrenciBugun>;
}

/**
 * Hesap modulunun sinif kodu, davet ve oturum uclari. Bu islemler cevrimdisi kuyruga GIRMEZ:
 * baglanti yoksa `cevrimdisi` hatasi alinir (bkz. `hesap/cevrimici.ts`).
 */
export interface HesapAdapter {
  /** Sinif koduyla katilim istegi gonderir (kod buyuk harfe cevrilmis olmali). */
  sinifKoduKatil: (kod: string) => Promise<KatilimIstegi>;
  /** Kendi bekleyen katilim isteklerim (tum kurumlar). */
  sinifKoduIsteklerim: () => Promise<KatilimIstegi[]>;
  sinifKoduIstegiIptal: (istekId: string) => Promise<void>;

  /** Ogretmen/yonetici: etkin kurumdaki sinif gruplari ve bekleyen katilim istekleri. */
  sinifBekleyenleri: () => Promise<SinifBekleyenleri[]>;
  katilimIstegiOnayla: (grupId: string, istekId: string) => Promise<void>;
  katilimIstegiReddet: (grupId: string, istekId: string) => Promise<void>;
  /** Etkin katilim kodu; yoksa null. */
  katilimKodu: (grupId: string) => Promise<KatilimKodu | null>;
  /** Olusturur ya da yeniler (eski kod gecersizlesir). */
  katilimKoduYenile: (grupId: string) => Promise<KatilimKodu>;

  /** Daveti kabul eder (giris + KVKK sonrasi). */
  davetKabul: (belirtec: string) => Promise<DavetSonucu>;

  oturumlar: () => Promise<OturumKaydi[]>;
  /** `buOturum`: sonlandirilan oturum bu cihazinki ise yerel belirtecler de silinir. */
  oturumSonlandir: (
    oturumId: string,
    buOturum: boolean,
  ) => Promise<{ kendiOturumuKapandi: boolean }>;
  /** `mevcutHaric`: true ise bu cihazin oturumu acik kalir. */
  oturumlariKapat: (
    mevcutHaric: boolean,
  ) => Promise<{ kapatilan: number; kendiOturumuKapandi: boolean }>;
}

export interface Adaptorler {
  auth: AuthAdapter;
  veri: VeriAdapter;
  hesap: HesapAdapter;
  ders: DersAdapter;
  finans: FinansAdapter;
  ogrenme: OgrenmeAdapter;
  kayit: KayitAdapter;
  soru: SoruAdapter;
  /** Dosya yukleme (medya servisi); soru/cevap fotograf ve ses ekleri icin. */
  medya: MedyaAdapter;
}
