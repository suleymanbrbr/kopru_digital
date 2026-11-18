import { motivasyonSeviyeAtladiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/** `motivasyon.seviye.atladi.v1`: ogrenciye "seviye atladin" (kategori `oyunlastirma`). */
export const seviyeAtladiEsleme = esleme(motivasyonSeviyeAtladiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'seviye_atladi',
    degiskenler: { yeni_seviye: d.yeni_seviye },
    veri: { yeni_seviye: d.yeni_seviye },
    kaynakOlayId: olay.id,
    tekilAnahtar: `seviye_atladi:${d.ogrenci_id}:${String(d.yeni_seviye)}`,
  });
});
