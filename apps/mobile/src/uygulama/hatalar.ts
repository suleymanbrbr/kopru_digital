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
    case 'cevrimdisi':
      return t('mobil.hata.cevrimdisiIslem');
    case 'otp_gecersiz':
      return t('mobil.giris.kodGecersiz');
    case 'otp_cok_deneme':
      return t('mobil.giris.kodCokDeneme');
    case 'cok_istek':
      return t('mobil.hata.cokIstek');
    case 'zaten_uye':
      return t('mobil.hata.zatenUye');
    case 'kod_gecersiz':
      return t('mobil.hata.sinifKoduGecersiz');
    case 'davet_gecersiz':
      return t('mobil.davet.gecersiz');
    case 'cakisma':
      return cakismaMesaji(e.ayrinti);
    default:
      return t('ortak.hataGenel');
  }
}

function cakismaMesaji(ayrinti: string | undefined): string {
  switch (ayrinti) {
    case 'kapasite_dolu':
      return t('mobil.hata.kapasiteDolu');
    case 'kod_kullanim_doldu':
      return t('mobil.hata.kodKullanimDoldu');
    case 'uyelik_askida':
      return t('mobil.hata.uyelikAskida');
    case 'istek_beklemiyor':
      return t('mobil.hata.istekBeklemiyor');
    default:
      return t('mobil.hata.cakisma');
  }
}

/**
 * Sinif kodu ile katilim: 429 icin "yaklasik 15 dk bekle" (5 basarisiz denemede kilit),
 * digerleri genel esleme.
 */
export function katilimHataMesaji(e: unknown): string {
  if (apiHatasiMi(e) && e.kod === 'cok_istek') return t('mobil.hata.sinifKoduCokDeneme');
  return hataMesaji(e);
}
