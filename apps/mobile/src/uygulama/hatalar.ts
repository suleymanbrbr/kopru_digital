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
  // Gunluk soru takibi (metinler `gunlukSoru.hata.*`, web ile ortak)
  kayit_duzenlenemez: 'gunlukSoru.hata.kayit_duzenlenemez',
  soru_toplami_gecersiz: 'gunlukSoru.hata.soru_toplami_gecersiz',
  gun_gecersiz: 'gunlukSoru.hata.gun_gecersiz',
  konu_gecersiz: 'gunlukSoru.hata.konu_gecersiz',
  brans_gecersiz: 'gunlukSoru.hata.brans_gecersiz',
  kaynak_testi_gecersiz: 'gunlukSoru.hata.kaynak_testi_gecersiz',
  plan_gorevi_gecersiz: 'gunlukSoru.hata.plan_gorevi_gecersiz',
  dosya_zaten_bagli: 'gunlukSoru.hata.dosya_zaten_bagli',
  dosya_hazir_degil: 'gunlukSoru.hata.dosya_hazir_degil',
  dosya_gecersiz: 'gunlukSoru.hata.dosya_gecersiz',
  gorev_hedefi_gecersiz: 'gunlukSoru.hata.gorev_hedefi_gecersiz',
  // Degerlendirme ve kaynak onerisi (metinler `degerlendirme.hata.*`, web ile ortak)
  degerlendirme_duzenlenemez: 'degerlendirme.hata.degerlendirme_duzenlenemez',
  degerlendirme_geri_cekildi: 'degerlendirme.hata.degerlendirme_geri_cekildi',
  donem_gecersiz: 'degerlendirme.hata.donem_gecersiz',
  kaynak_gecersiz: 'degerlendirme.hata.kaynak_gecersiz',
  // Ders kayitlari ve geri bildirim
  kaynak_sorun_zaten_acik: 'mobil.kayit.hata.sorunZatenAcik',
  kaynak_url_gecersiz: 'mobil.kayit.hata.urlGecersiz',
  kaynak_suresi_gecmis: 'mobil.kayit.hata.suresiGecmis',
  kaynak_sifreleme_yapilandirilmamis: 'mobil.kayit.hata.sifrelemeYok',
  kaynak_ders_iptal: 'mobil.kayit.hata.dersIptal',
  geri_bildirim_ders_bitmedi: 'mobil.kayit.hata.dersBitmedi',
  geri_bildirim_yoklama_uygun_degil: 'mobil.kayit.hata.yoklamaUygunDegil',
  geri_bildirim_guncelleme_suresi_doldu: 'mobil.kayit.hata.guncellemeSuresiDoldu',
  // Motivasyon: karakter, odak, haftanin yildizi
  karakter_adi_uygunsuz: 'mobil.motivasyon.hata.karakter_adi_uygunsuz',
  karakter_zaten_secildi: 'mobil.motivasyon.hata.karakter_zaten_secildi',
  karakter_secilmemis: 'mobil.motivasyon.hata.karakter_secilmemis',
  tur_degistirme_hakki_yok: 'mobil.motivasyon.hata.tur_degistirme_hakki_yok',
  kozmetik_sahip_degil: 'mobil.motivasyon.hata.kozmetik_sahip_degil',
  kozmetik_slot_uyusmuyor: 'mobil.motivasyon.hata.kozmetik_slot_uyusmuyor',
  haftanin_yildizi_verilmis: 'mobil.motivasyon.hata.haftanin_yildizi_verilmis',
  haftalik_limit_asildi: 'mobil.motivasyon.hata.haftalik_limit_asildi',
  baslangic_gecersiz: 'mobil.motivasyon.hata.baslangic_gecersiz',
  acik_oturum_var: 'mobil.motivasyon.hata.acik_oturum_var',
};

/** Kuyrukta basarisiz olan isin hata kodunu (api `ayrinti` ya da adaptor kodu) mesaja cevirir. */
export function kuyrukHataMesaji(kod: string | undefined): string {
  const anahtar = kod ? AYRINTI_MESAJLARI[kod] : undefined;
  if (anahtar) return t(anahtar);
  if (kod === 'izin_yok') return t('mobil.hata.izinYok');
  if (kod === 'modul_kapali') return t('mobil.hata.modulKapali');
  if (kod === 'abonelik_gerekli') return t('mobil.hata.abonelikGerekli');
  if (kod === 'plan_limiti') return t('hata.plan_limiti');
  if (kod === 'kurum_askida') return t('hata.kurum_askida');
  return t('ortak.hataGenel');
}

/**
 * Degerlendirme/oneri islemlerinde hata mesaji: `surum_cakismasi` burada "Kayit" der (genel mesaj
 * ders icindir); digerleri genel esleme.
 */
export function degerlendirmeHataMesaji(e: unknown): string {
  if (apiHatasiMi(e) && e.ayrinti === 'surum_cakismasi') {
    return t('degerlendirme.hata.surum_cakismasi');
  }
  return hataMesaji(e);
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
    case 'plan_limiti':
      return t('hata.plan_limiti');
    case 'kurum_askida':
      return t('hata.kurum_askida');
    case 'abonelik_baska_kanalda':
      return t('hata.abonelik_baska_kanalda');
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
    case 'otp_gonderim_siniri':
      return gonderimSiniriMesaji(e.detay);
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

/** "Çok fazla kod istedin. 12 dakika sonra yeniden dene." (sure bilinmiyorsa genel metin). */
function gonderimSiniriMesaji(detay: unknown): string {
  const sn = (detay as { beklemeSn?: unknown } | undefined)?.beklemeSn;
  if (typeof sn !== 'number' || !(sn > 0)) return t('mobil.giris.kodGonderimSiniriGenel');
  const dk = Math.ceil(sn / 60);
  const sure =
    dk >= 60
      ? t('mobil.giris.sureSaat', { n: Math.ceil(dk / 60) })
      : t('mobil.giris.sureDakika', { n: dk });
  return t('mobil.giris.kodGonderimSiniri', { sure });
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
