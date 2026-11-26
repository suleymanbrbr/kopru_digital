import { ogrenmeDegerlendirmeYayimlandiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ogrenme.degerlendirme.yayimlandi.v1`: ogrenciye gorunur bir ogretmen degerlendirmesi yayimlandi (kategori
 * `odev`, YALNIZ kutu: push yok). Metin genel ("Ogretmeninden yeni bir degerlendirme"); yorum, olcek ve
 * ogretmen adi olayda ve bildirimde yoktur. Ayni degerlendirme icin tek bildirim.
 */
export const degerlendirmeYayimlandiEsleme = esleme(
  ogrenmeDegerlendirmeYayimlandiV1,
  async (tx, olay) => {
    const d = olay.data;
    await bildirimUret(tx, {
      kurumId: olay.kurumId,
      aliciUyelikIdleri: [d.ogrenci_id],
      sablonKodu: 'degerlendirme_yayimlandi',
      degiskenler: {},
      veri: { degerlendirme_id: d.degerlendirme_id },
      kaynakOlayId: olay.id,
      tekilAnahtar: `degerlendirme_yayimlandi:${d.degerlendirme_id}`,
    });
  },
);
