import type {
  OgrenciBugun,
  OgretmenBugun,
  OturumBilgisi,
  RizaMetni,
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

export interface Adaptorler {
  auth: AuthAdapter;
  veri: VeriAdapter;
}
