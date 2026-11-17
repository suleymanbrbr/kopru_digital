import { ogrenmeSoruMesajiEklendiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ogrenme.soru_mesaji.eklendi.v1`, `tur = cevap`: ogrenciye "Sorun cevaplandi" (kategori `soru`).
 * `takip` mesajlari (ogretmene) ve ogrencinin kendi mesaji bildirim uretmez (sonraki paket: takip).
 */
export const soruCevapEsleme = esleme(ogrenmeSoruMesajiEklendiV1, async (tx, olay) => {
  const d = olay.data;
  if (d.tur !== 'cevap' || d.yazar_id === d.ogrenci_id) return;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'soru_cevaplandi',
    degiskenler: { soru_id: d.soru_id },
    veri: { soru_id: d.soru_id, mesaj_id: d.mesaj_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `soru_cevaplandi:${d.mesaj_id}`,
  });
});
