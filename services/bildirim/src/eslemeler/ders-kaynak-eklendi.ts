import { dersKaynakEklendiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ders.kaynak.eklendi.v1`: cozumlenmis alici ogrencilere "yeni kayit/materyal" (kategori `kayit`). Parcali:
 * her parca kendi ogrencilerini isler. Baslik/url/parola olayda yoktur; metin genel, ayrinti uygulamadadir.
 */
export const dersKaynakEklendiEsleme = esleme(dersKaynakEklendiV1, async (tx, olay) => {
  const d = olay.data;
  if (d.ogrenci_idleri.length === 0) return;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: d.ogrenci_idleri,
    sablonKodu: d.tur === 'kayit' ? 'kayit_eklendi' : 'materyal_eklendi',
    degiskenler: { kaynak_id: d.kaynak_id },
    veri: { kaynak_id: d.kaynak_id, ders_id: d.ders_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `kaynak_eklendi:${d.kaynak_id}`,
  });
});
