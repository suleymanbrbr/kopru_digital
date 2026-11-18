import { ogrenmeOdevIncelendiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

const SONUC_OZETI = {
  tamam: 'tamam olarak işaretlendi',
  eksik: 'eksik bulundu',
  tekrar: 'tekrar istendi',
} as const;

/**
 * `ogrenme.odev.incelendi.v1`: ogrenciye "odevin incelendi" (kategori `odev`). Kutuda sonuc (sabit liste:
 * tamam/eksik/tekrar), push genel. Ogretmen notu olayda yoktur. Ayni sonucla yeniden inceleme tekrar bildirim
 * uretmez; sonuc degisirse uretir.
 */
export const odevIncelendiEsleme = esleme(ogrenmeOdevIncelendiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'odev_incelendi',
    degiskenler: { odev_id: d.odev_id, sonuc_ozeti: SONUC_OZETI[d.inceleme_sonucu] },
    veri: {
      odev_id: d.odev_id,
      ogrenci_odev_id: d.ogrenci_odev_id,
      inceleme_sonucu: d.inceleme_sonucu,
    },
    kaynakOlayId: olay.id,
    tekilAnahtar: `odev_incelendi:${d.ogrenci_odev_id}:${d.inceleme_sonucu}`,
  });
});
