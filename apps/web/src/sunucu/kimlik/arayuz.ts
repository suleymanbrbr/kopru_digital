import type { KurumBaglami, Oturum, RizaMetni } from '@/oturum/tipler';

/** Kimlik katmaninin makine okunur hatasi; BFF bunu standart hata govdesine cevirir. */
export class KimlikHatasi extends Error {
  constructor(
    public readonly durum: number,
    public readonly kod: string,
    mesaj: string,
  ) {
    super(mesaj);
    this.name = 'KimlikHatasi';
  }
}

export interface OturumSecimi {
  uyelikId?: string;
  kurumId?: string;
}

export interface OturumSonucu {
  oturum: Oturum;
  /** Saglayici oturum belirtecini yenilediyse (kayan 30 gun) cerezin yeni degeri. */
  oturumBelirteci?: string;
}

/**
 * Sunucu tarafi kimlik adaptoru. Next route handler'lari yalnizca bu arayuzu bilir.
 * Gercek uygulama `api` servisindeki Better Auth'a (ADR 0004) baglanir; `NEXT_PUBLIC_API_MOCK=1`
 * iken bellek ici mock kullanilir.
 *
 * `oturumBelirteci`: httpOnly cerezde tutulan opak yenileme/oturum belirteci. Tarayici
 * bu degeri hic gormez.
 */
export interface KimlikAdaptoru {
  /** Telefona OTP gonderir. `yenidenSn`: yeniden gonderme icin beklenecek sure. */
  kodIste(telefon: string): Promise<{ yenidenSn: number }>;
  /** Kodu dogrular ve yeni oturum belirteci dondurur. */
  kodDogrula(telefon: string, kod: string): Promise<{ oturumBelirteci: string }>;
  /** Oturum belirtecini kisa omurlu erisim belirtecine cevirir (`POST /auth/token`). */
  oturumAl(oturumBelirteci: string, secim?: OturumSecimi): Promise<OturumSonucu>;
  /** Etkin kurum icin cozulmus modul listesi. */
  kurumBaglami(
    oturumBelirteci: string,
    erisimBelirteci: string,
    kurumId: string,
  ): Promise<KurumBaglami>;
  rizaMetni(oturumBelirteci: string): Promise<RizaMetni>;
  /** Rizayi kaydeder; belirtec degisebilir. */
  rizaKabul(oturumBelirteci: string, surum: string): Promise<{ oturumBelirteci: string }>;
  cikis(oturumBelirteci: string): Promise<void>;
}
