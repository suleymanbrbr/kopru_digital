import { t, type MessageKey } from '@kopru/i18n';

import { hataMesaji, UygulamaHatasi } from '@/lib/api';

/** Motivasyon servisinin kullaniciya gosterilen hata kodlari (`motivasyon.hata.<kod>`). */
const KODLAR = new Set([
  'acik_oturum_var',
  'baslangic_gecersiz',
  'karakter_zaten_secildi',
  'karakter_adi_uygunsuz',
  'karakter_secilmemis',
  'karakter_turu_gecersiz',
  'tur_degistirme_hakki_yok',
  'ayni_tur',
  'kozmetik_sahip_degil',
  'kozmetik_slot_uyusmuyor',
  'haftanin_yildizi_verilmis',
  'haftalik_limit_asildi',
]);

/**
 * Hata kodunu Turkce, eyleme yonelik metne cevirir. `baglam: 'duraklatma'` iken 409 "cakisan aralik"
 * demektir; sunucu mesajlari ham gosterilmez.
 */
export function motivasyonHataMesaji(hata: unknown, baglam?: 'duraklatma'): string {
  if (hata instanceof UygulamaHatasi) {
    if (KODLAR.has(hata.kod)) return t(`motivasyon.hata.${hata.kod}` as MessageKey);
    if (baglam === 'duraklatma' && hata.durum === 409)
      return t('motivasyon.hata.duraklatma_cakisma');
    if (baglam === 'duraklatma' && hata.durum === 422)
      return t('motivasyon.hata.duraklatma_gecersiz');
  }
  return hataMesaji(hata);
}

/** `409 acik_oturum_var` yanitindaki `details.oturum` (varsa). */
export function acikOturumDetayi(hata: unknown): unknown {
  if (hata instanceof UygulamaHatasi && hata.kod === 'acik_oturum_var') {
    const d = hata.detaylar;
    if (typeof d === 'object' && d !== null && 'oturum' in d) return d.oturum;
  }
  return undefined;
}
