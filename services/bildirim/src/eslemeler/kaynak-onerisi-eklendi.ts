import { ogrenmeKaynakOnerisiEklendiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ogrenme.kaynak_onerisi.eklendi.v1`: ogretmen ogrenciye kaynak onerdi (kategori `odev`, YALNIZ kutu: push
 * yok). Baslik, baglanti, not ve kitap adi olayda yoktur; ayrinti derin baglantidaki "Ogretmenimin
 * onerdikleri" sayfasindadir. Ayni oneri icin tek bildirim.
 */
export const kaynakOnerisiEklendiEsleme = esleme(
  ogrenmeKaynakOnerisiEklendiV1,
  async (tx, olay) => {
    const d = olay.data;
    await bildirimUret(tx, {
      kurumId: olay.kurumId,
      aliciUyelikIdleri: [d.ogrenci_id],
      sablonKodu: 'kaynak_onerisi_eklendi',
      degiskenler: {},
      veri: { oneri_id: d.oneri_id, tur: d.tur },
      kaynakOlayId: olay.id,
      tekilAnahtar: `kaynak_onerisi_eklendi:${d.oneri_id}`,
    });
  },
);
