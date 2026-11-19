import type { AbonelikPeriyodu } from '../api/abonelikTipleri';

/** Magazadaki (App Store / Google Play) bir abonelik teklifi; bir plan kodu ve periyoda eslenir. */
export interface MagazaTeklifi {
  /** Magaza urun kimligi (ornegin `kopru.kurum.aylik`). */
  urunId: string;
  planKodu: string;
  periyot: AbonelikPeriyodu;
  /** Magazanin yerellestirilmis fiyat metni (ornegin `₺4.999,99`). */
  fiyatMetni: string;
  /** Saglayiciya ozgu opak nesne (RevenueCat paketi); arayuz dokunmaz. */
  ham?: unknown;
}

export type SatinAlmaSonucu = { durum: 'tamam' } | { durum: 'iptal' };

export type MagazaHataKodu = 'kullanilamiyor' | 'satin_alma_basarisiz' | 'geri_yukleme_basarisiz';

export class MagazaHatasi extends Error {
  readonly kod: MagazaHataKodu;
  constructor(kod: MagazaHataKodu, mesaj?: string) {
    super(mesaj ?? kod);
    this.name = 'MagazaHatasi';
    this.kod = kod;
  }
}

/**
 * Mağaza satin alma arayuzu (RevenueCat arkasinda). Gercek saglayici yalniz anahtar varsa ve
 * native modul desteklendiyse (dev build / magaza surumu) yuklenir; aksi halde sahte saglayici.
 * Sunucu aktivasyonu mağaza degil RevenueCat webhook'u ile olur: satin alma sonrasi istemci
 * `GET .../abonelik` yoklar.
 */
export interface MagazaSaglayici {
  readonly tur: 'revenuecat' | 'sahte';
  /** RevenueCat kullanicisini kurum kimligiyle esler (`app_user_id` = kurum id). Tekrar cagri etkisizdir. */
  logIn: (kurumId: string) => Promise<void>;
  logOut: () => Promise<void>;
  /** Kullanilabilir teklifler; magaza urunu yoksa bos liste. */
  teklifleriGetir: () => Promise<MagazaTeklifi[]>;
  satinAl: (teklif: MagazaTeklifi) => Promise<SatinAlmaSonucu>;
  geriYukle: () => Promise<void>;
}

/** Platformun abonelik yonetim sayfasi (web satin alma baglantisi DEGIL; Apple kurallarina uygun). */
export function aboneligiYonetUrl(platform: string): string {
  return platform === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';
}
