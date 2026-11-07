import { t } from '@kopru/i18n';

import { apiHatasiMi } from '../api/tipler';

/** Hatayi kullaniciya gorunur Turkce mesaja cevirir. */
export function hataMesaji(e: unknown): string {
  if (!apiHatasiMi(e)) return t('ortak.hataGenel');
  switch (e.kod) {
    case 'yetkisiz':
      return t('mobil.hata.yetkisiz');
    case 'riza_gerekli':
      return t('mobil.hata.rizaGerekli');
    case 'abonelik_gerekli':
      return t('mobil.hata.abonelikGerekli');
    case 'modul_kapali':
      return t('mobil.hata.modulKapali');
    case 'izin_yok':
      return t('mobil.hata.izinYok');
    case 'yapilandirma':
      return t('mobil.hata.yapilandirma');
    case 'ag':
    case 'zaman_asimi':
      return t('mobil.hata.ag');
    case 'otp_gecersiz':
      return t('mobil.giris.kodGecersiz');
    case 'otp_cok_deneme':
      return t('mobil.giris.kodCokDeneme');
    default:
      return t('ortak.hataGenel');
  }
}
