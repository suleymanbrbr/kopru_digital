import {
  finansKrediAzaldiV1,
  finansPaketSatildiV1,
  finansTahsilatAlindiV1,
} from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * Finans olaylari (kategori `finans`). KARAR (sartname: "push metinlerinde ucret, not veya hassas bilgi yer
 * almaz"): TUTAR (kurus) hicbir yerde yazilmaz, kutuda da. Kutu yalniz ders sayisi (kredi) gibi sayim
 * verir; odeme tutari/yontemi/makbuz uygulamanin ilgili ekraninda gorulur.
 */

/** `finans.kredi.azaldi.v1`: ogrenciye "kredin azaliyor" (kutuda kalan ders sayisi; push'ta sayi yok). */
export const krediAzaldiEsleme = esleme(finansKrediAzaldiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'kredi_azaliyor',
    degiskenler: { kalan_kredi: d.kalan_kredi },
    veri: { kalan_kredi: d.kalan_kredi },
    kaynakOlayId: olay.id,
    // Esik her gecildiginde (iade ile ustune cikip tekrar inince) yeni bildirim.
    tekilAnahtar: `kredi_azaldi:${d.ogrenci_id}:${olay.id}`,
  });
});

/** `finans.tahsilat.alindi.v1`: ogrenciye "odemen alindi" (tutar, yontem ve makbuz no bildirimde yok). */
export const tahsilatAlindiEsleme = esleme(finansTahsilatAlindiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'tahsilat_alindi',
    degiskenler: {},
    veri: { tahsilat_id: d.tahsilat_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `tahsilat_alindi:${d.tahsilat_id}`,
  });
});

/** `finans.paket.satildi.v1`: ogrenciye "yeni ders paketin tanimlandi" (kutuda ders sayisi; tutar yok). */
export const paketSatildiEsleme = esleme(finansPaketSatildiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'paket_satildi',
    degiskenler: { toplam_kredi: d.toplam_kredi },
    veri: { paket_satisi_id: d.paket_satisi_id, toplam_kredi: d.toplam_kredi },
    kaynakOlayId: olay.id,
    tekilAnahtar: `paket_satildi:${d.paket_satisi_id}`,
  });
});
