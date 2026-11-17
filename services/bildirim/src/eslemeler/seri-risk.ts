import { motivasyonSeriRiskV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `motivasyon.seri.risk.v1`: ogrenciye seri hatirlatmasi (kategori `oyunlastirma`). Hatirlatma gunun sonunda
 * anlamini yitirir: `gecerlilik_bitis_at` = `gun_bitis_at` (sonra kutuda gizlenir). Ayni gun icin tek bildirim.
 */
export const seriRiskEsleme = esleme(motivasyonSeriRiskV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'seri_hatirlatma',
    degiskenler: { mevcut_seri: d.mevcut_seri },
    veri: { mevcut_seri: d.mevcut_seri },
    kaynakOlayId: olay.id,
    tekilAnahtar: `seri_hatirlatma:${d.ogrenci_id}:${d.gun_bitis_at}`,
    gecerlilikBitisAt: new Date(d.gun_bitis_at),
  });
});
