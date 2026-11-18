import { ogrenmeSoruMesajiEklendiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ogrenme.soru_mesaji.eklendi.v1` (kategori `soru`):
 * - `tur = cevap`: ogrenciye "Sorun cevaplandi" (ogrencinin kendi mesaji bildirim uretmez).
 * - `tur = takip`: olayin `alici_idleri`ne (masada ustlenen varsa yalniz o, yoksa hedef ogretmenler) "takip sorusu".
 * Metin olayda yoktur; bildirim metni genel.
 */
export const soruCevapEsleme = esleme(ogrenmeSoruMesajiEklendiV1, async (tx, olay) => {
  const d = olay.data;
  if (d.tur === 'cevap') {
    if (d.yazar_id === d.ogrenci_id) return;
    await bildirimUret(tx, {
      kurumId: olay.kurumId,
      aliciUyelikIdleri: [d.ogrenci_id],
      sablonKodu: 'soru_cevaplandi',
      degiskenler: { soru_id: d.soru_id },
      veri: { soru_id: d.soru_id, mesaj_id: d.mesaj_id },
      kaynakOlayId: olay.id,
      tekilAnahtar: `soru_cevaplandi:${d.mesaj_id}`,
    });
    return;
  }
  const alicilar = d.alici_idleri.filter((a) => a !== d.yazar_id);
  if (alicilar.length === 0) return;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: alicilar,
    sablonKodu: 'soru_takip',
    degiskenler: { soru_id: d.soru_id },
    veri: { soru_id: d.soru_id, mesaj_id: d.mesaj_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `soru_takip:${d.mesaj_id}`,
  });
});
