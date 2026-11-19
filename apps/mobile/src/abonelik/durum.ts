import type { Abonelik, AbonelikKaynagi, AbonelikOzeti } from '../api/abonelikTipleri';

const GUN = 86_400_000;

/** Verilen ISO zamana kalan tam gun sayisi (yukari yuvarlanir; gecmisse 0). */
export function kalanGun(iso: string | null, simdi: number): number {
  if (!iso) return 0;
  const fark = Date.parse(iso) - simdi;
  return fark <= 0 ? 0 : Math.ceil(fark / GUN);
}

/** Bu cihazin magaza kanali. */
export function platformKaynagi(platform: string): 'apple' | 'google' | null {
  if (platform === 'ios') return 'apple';
  if (platform === 'android') return 'google';
  return null;
}

/** Abonelik "etkin" mi (erisim suruyor) — baska kanaldan abone sayilmak icin. */
function etkinMi(a: Abonelik): boolean {
  return a.durum === 'aktif' || a.durum === 'odeme_bekliyor' || a.durum === 'ek_sure';
}

export type SatinAlmaKapaliNedeni = 'baska_kanal' | 'kurumsal' | 'web' | 'magaza_yok';

export interface DurumOzeti {
  durum: Abonelik['durum'] | 'ucretsiz';
  kaynak: AbonelikKaynagi | null;
  /** Deneme ya da ek sure icin kalan gun. */
  kalanGun: number | null;
  /** Iptal edilmis ama donem sonuna kadar erisim suruyor. */
  iptalBitis: string | null;
  /** `null`: satin alma acik. */
  satinAlmaKapali: SatinAlmaKapaliNedeni | null;
  /** Mağaza aboneligi (bu cihaz kanalinda) etkin: "aboneligi yonet" gosterilir. */
  magazaYonetilebilir: boolean;
  /** Deneme bitisine <= 3 gun: sahibe afis. */
  denemeBitiyor: boolean;
}

export const DENEME_UYARI_GUN = 3;

/**
 * Aboneligin ekranda nasil gosterilecegi. Satin alma yalniz mağaza kanalinda (bu cihazin
 * platformu) ve baska kanalda etkin abonelik yokken acilir (sunucu `abonelik_baska_kanalda`
 * ile de reddeder).
 */
export function durumOzetle(o: AbonelikOzeti, platform: string, simdi: number): DurumOzeti {
  const a = o.abonelik;
  const benimKanal = platformKaynagi(platform);
  if (!a) {
    return {
      durum: 'ucretsiz',
      kaynak: null,
      kalanGun: null,
      iptalBitis: null,
      satinAlmaKapali: benimKanal ? null : 'magaza_yok',
      magazaYonetilebilir: false,
      denemeBitiyor: false,
    };
  }
  const gun =
    a.durum === 'deneme'
      ? kalanGun(a.denemeBitis, simdi)
      : a.durum === 'ek_sure'
        ? kalanGun(a.ekSureBitis, simdi)
        : null;
  let kapali: SatinAlmaKapaliNedeni | null = null;
  if (!benimKanal) kapali = 'magaza_yok';
  else if (etkinMi(a) && a.kaynak !== benimKanal) {
    kapali = a.kaynak === 'kurumsal' ? 'kurumsal' : a.kaynak === 'iyzico' ? 'web' : 'baska_kanal';
  }
  return {
    durum: a.durum,
    kaynak: a.kaynak,
    kalanGun: gun,
    iptalBitis:
      a.iptalIstendi && !a.otomatikYenileme && a.durum !== 'sona_erdi' ? a.donemBitis : null,
    satinAlmaKapali: kapali,
    magazaYonetilebilir: benimKanal !== null && a.kaynak === benimKanal && etkinMi(a),
    denemeBitiyor: a.durum === 'deneme' && (gun ?? 0) <= DENEME_UYARI_GUN,
  };
}

/** Sahibe gosterilecek tekil abonelik seridi turu. */
export function seritTuru(
  o: AbonelikOzeti | undefined,
  saltOkunurIsareti: boolean,
  platform: string,
  simdi: number,
): 'salt_okunur' | 'deneme_bitiyor' | null {
  if (o?.yazmaKilitli || saltOkunurIsareti) return 'salt_okunur';
  if (o && durumOzetle(o, platform, simdi).denemeBitiyor) return 'deneme_bitiyor';
  return null;
}
