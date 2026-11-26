import { t } from '@kopru/i18n';

import type { Oneri } from '../api/gunlukSoruTipleri';
import { zorlukAdi } from '../gunluk/kurallar';

/** Sistem onerisinin tek satirlik metni (konu analizi ekraniyla ayni `gunlukSoru.oneri.*` metinleri). */
export function oneriMetni(o: Oneri): string {
  const konu = o.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz');
  if (o.tur === 'birebir_ders') {
    return t('gunlukSoru.oneri.birebirDers', { konu, basari: Math.round(o.zorBasari * 100) });
  }
  return t('gunlukSoru.oneri.gorevOner', {
    konu,
    zorluk: zorlukAdi(o.zorluk).toLowerCase(),
    sayi: o.soruSayisi,
  });
}
