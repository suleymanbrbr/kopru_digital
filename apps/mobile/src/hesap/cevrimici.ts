import type { HesapAdapter } from '../api/adaptorler';
import { ApiHata } from '../api/tipler';

/**
 * Sinif kodu, davet ve oturum islemleri cevrimdisi kuyruga girmez (kod yarisi, onay ve oturum
 * kapatma anlik sonuc ister). Cihaz cevrimdisiyken istek hic gonderilmez ve `cevrimdisi` hatasi
 * atilir; ekranlar bunu "Cevrimdisisin..." mesajina cevirir. Okuma cagrilari da korunur ki
 * baglantisizken sonsuz yukleme yerine acik mesaj gorunsun.
 */
export function cevrimiciKorumali(hesap: HesapAdapter, cevrimiciMi: () => boolean): HesapAdapter {
  const kor =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> =>
      cevrimiciMi() ? f(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  return {
    sinifKoduKatil: kor(hesap.sinifKoduKatil),
    sinifKoduIsteklerim: kor(hesap.sinifKoduIsteklerim),
    sinifKoduIstegiIptal: kor(hesap.sinifKoduIstegiIptal),
    sinifBekleyenleri: kor(hesap.sinifBekleyenleri),
    katilimIstegiOnayla: kor(hesap.katilimIstegiOnayla),
    katilimIstegiReddet: kor(hesap.katilimIstegiReddet),
    katilimKodu: kor(hesap.katilimKodu),
    katilimKoduYenile: kor(hesap.katilimKoduYenile),
    davetKabul: kor(hesap.davetKabul),
    oturumlar: kor(hesap.oturumlar),
    oturumSonlandir: kor(hesap.oturumSonlandir),
    oturumlariKapat: kor(hesap.oturumlariKapat),
  };
}
