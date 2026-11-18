import { motivasyonRozetKazanildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `motivasyon.rozet.kazanildi.v1`: ogrenciye "yeni rozet" (kategori `oyunlastirma`). Rozet gorunen adi olayda
 * yoktur; metin genel, `rozet_kodu` yalniz kutu verisinde (uygulama adi/gorseli kodla bulur).
 */
export const rozetKazanildiEsleme = esleme(motivasyonRozetKazanildiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'rozet_kazanildi',
    degiskenler: { rozet_kodu: d.rozet_kodu },
    veri: { rozet_kodu: d.rozet_kodu },
    kaynakOlayId: olay.id,
    tekilAnahtar: `rozet_kazanildi:${d.ogrenci_id}:${d.rozet_kodu}`,
  });
});
