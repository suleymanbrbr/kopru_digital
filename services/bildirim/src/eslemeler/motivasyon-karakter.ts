import { motivasyonKarakterEvrildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/** `motivasyon.karakter.evrildi.v1`: ogrenciye "karakterin evrildi" (kategori `oyunlastirma`; karakter adi yok). */
export const karakterEvrildiEsleme = esleme(motivasyonKarakterEvrildiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'karakter_evrildi',
    degiskenler: { yeni_asama: d.yeni_asama },
    veri: { tur_kodu: d.tur_kodu, yeni_asama: d.yeni_asama },
    kaynakOlayId: olay.id,
    tekilAnahtar: `karakter_evrildi:${d.ogrenci_id}:${d.tur_kodu}:${String(d.yeni_asama)}`,
  });
});
