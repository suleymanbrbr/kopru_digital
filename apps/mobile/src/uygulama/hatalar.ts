import { t, type MessageKey } from '@kopru/i18n';

import { apiHatasiMi } from '../api/tipler';

/**
 * Api hata kodlarina (`ayrinti`) ozel anlasilir mesajlar; HTTP durumundan bagimsizdir
 * (ornegin `yoklama_kilitli` 403, `ders_henuz_baslamadi` 422 doner).
 */
const AYRINTI_MESAJLARI: Record<string, MessageKey> = {
  surum_cakismasi: 'mobil.hata.surumCakismasi',
  ders_henuz_baslamadi: 'mobil.hata.dersHenuzBaslamadi',
  ders_iptal_edildi: 'mobil.hata.dersIptalEdildi',
  yoklama_kilitli: 'mobil.hata.yoklamaKilitli',
  ogrenci_katilimci_degil: 'mobil.hata.ogrenciKatilimciDegil',
  yoklama_eski: 'mobil.hata.yoklamaEski',
  ogretmen_gerekli: 'mobil.hata.ogretmenGerekli',
  iptal_kaynagi_gecersiz: 'mobil.hata.iptalKaynagiGecersiz',
  zaten_katilimci: 'mobil.hata.zatenKatilimci',
  ogrenci_modeli_paket_degil: 'mobil.hata.modelPaketDegil',
  odeme_gecersiz: 'mobil.hata.odemeGecersiz',
  paket_arsivde: 'mobil.hata.paketArsivde',
  istek_cakismasi: 'mobil.hata.istekCakismasi',
  ders_planli_degil: 'mobil.hata.dersPlanliDegil',
  // Ogrenme: plan, odev, deneme
  plan_kilitli: 'mobil.hata.planKilitli',
  plan_zaten_var: 'mobil.hata.planZatenVar',
  plan_dolu: 'mobil.hata.planKilitli',
  gorev_zaten_devredildi: 'mobil.hata.gorevZatenDevredildi',
  devretme_durumu_gecersiz: 'mobil.hata.devretmeDurumuGecersiz',
  hedef_gun_gecersiz: 'mobil.hata.hedefGunGecersiz',
  gorev_silinemez: 'mobil.hata.gorevSilinemez',
  gun_hafta_disinda: 'mobil.hata.gunHaftaDisinda',
  teslim_durumu_gecersiz: 'mobil.hata.teslimDurumuGecersiz',
  inceleme_durumu_gecersiz: 'mobil.hata.incelemeDurumuGecersiz',
  odev_kapali: 'mobil.hata.odevKapali',
  odev_yayinda_degil: 'mobil.hata.odevKapali',
  ogrenci_deneme_girisi_kapali: 'mobil.hata.ogrenciDenemeGirisiKapali',
  deneme_zaten_var: 'mobil.hata.denemeZatenVar',
  deneme_bolum_gecersiz: 'mobil.hata.denemeBolumGecersiz',
  deneme_onay_durumu_gecersiz: 'mobil.hata.denemeOnayDurumuGecersiz',
};

/** Kuyrukta basarisiz olan isin hata kodunu (api `ayrinti` ya da adaptor kodu) mesaja cevirir. */
export function kuyrukHataMesaji(kod: string | undefined): string {
  const anahtar = kod ? AYRINTI_MESAJLARI[kod] : undefined;
  if (anahtar) return t(anahtar);
  if (kod === 'izin_yok') return t('mobil.hata.izinYok');
  if (kod === 'modul_kapali') return t('mobil.hata.modulKapali');
  if (kod === 'abonelik_gerekli') return t('mobil.hata.abonelikGerekli');
  return t('ortak.hataGenel');
}

/** Hatayi kullaniciya gorunur Turkce mesaja cevirir. */
export function hataMesaji(e: unknown): string {
  if (!apiHatasiMi(e)) return t('ortak.hataGenel');
  const ozel = e.ayrinti ? AYRINTI_MESAJLARI[e.ayrinti] : undefined;
  if (ozel) return t(ozel);
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
