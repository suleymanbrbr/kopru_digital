import { ogrenmeSoruSorildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ogrenme.soru.sorildi.v1`: hedef ogretmenlere "yeni soru" (kategori `soru`). `hedef_ogretmen_idleri` bos ise
 * (masa/yonetici yonlendirmesi, atanmis ogretmen yok) bildirim uretilmez. Soru metni/ogrenci adi bildirimde yoktur.
 */
export const soruSorildiEsleme = esleme(ogrenmeSoruSorildiV1, async (tx, olay) => {
  const d = olay.data;
  if (d.hedef_ogretmen_idleri.length === 0) return;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: d.hedef_ogretmen_idleri,
    sablonKodu: 'yeni_soru',
    degiskenler: { soru_id: d.soru_id },
    veri: { soru_id: d.soru_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `yeni_soru:${d.soru_id}`,
  });
});
