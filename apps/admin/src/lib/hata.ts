import { t, tr } from '@kopru/i18n';

import { YonetimHatasi } from './api';

const KODLAR = tr.yonetim.hata as Record<string, string>;

/**
 * Hata koduna uygun Turkce mesaj. Sunucunun Turkce `message`i yalniz bilinmeyen kodlarda gosterilir;
 * 422/400 dogrulama ayrintilari `hataAyrintilari` ile ayri listelenir.
 */
export function hataMetni(hata: unknown): string {
  if (hata instanceof YonetimHatasi) {
    // 409 conflict: sunucunun durum aciklamasi (ornegin "Deneme disinda uzatilamaz") ayrintilidir.
    if (hata.kod === 'conflict' && hata.message && hata.message !== 'İstek başarısız.')
      return hata.message;
    const bilinen = KODLAR[hata.kod];
    if (bilinen) return bilinen;
    if (hata.durum === 0) return KODLAR.hizmet_kullanilamiyor ?? '';
    return hata.durum >= 400 &&
      hata.durum < 500 &&
      hata.message &&
      hata.message !== 'İstek başarısız.'
      ? hata.message
      : (KODLAR.genel ?? '');
  }
  return KODLAR.genel ?? '';
}

/** Alan bazli hata satirlari (`ayar_gecersiz` 422, `dogrulama_hatasi` 400). */
export function hataAyrintilari(hata: unknown): string[] {
  if (!(hata instanceof YonetimHatasi)) return [];
  return hata.alanHatalari.map((a) =>
    a.alan ? t('yonetim.hata.alanHatasi', { alan: a.alan, mesaj: a.mesaj }) : a.mesaj,
  );
}

/** Hata `kod`lari: giris/2FA/kapi akislari bunlara gore yonlenir. */
export const KAPI_KODLARI = {
  oturumYok: 'yetkisiz',
  ikinciAdim: 'ikinci_adim_gerekli',
  platformYetkisiYok: 'platform_yetkisi_yok',
  ipYasak: 'platform_ip_yasak',
} as const;
