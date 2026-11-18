import { dersYoklamaKaydedildiV1 } from '@kopru/contracts';

import { yoklamaGeriBildirimeEtki } from '../ders-zamanlama.js';
import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `ders.yoklama.kaydedildi.v1`: `gelmedi` ve `gec` durumunda ogrenciye bildirim (kategori `yoklama`). Not, ad vb.
 * olayda yoktur; push metni genel. Yoklama duzeltilip ayni duruma tekrar gelirse `yoklama_surumu` ayri bildirim
 * uretir; ayni olayin yeniden gelmesi uretmez.
 *
 * Ayrica ders sonu geri bildirimi istegi: derse katilmayan (`gelmedi`/`izinli`) ogrenciye gitmez; sonradan
 * `geldi`/`gec`e duzeltilirse yeniden etkinlesir.
 */
export const dersYoklamaEsleme = esleme(dersYoklamaKaydedildiV1, async (tx, olay) => {
  const d = olay.data;
  await yoklamaGeriBildirimeEtki(
    tx,
    {
      kurumId: olay.kurumId,
      dersId: d.ders_id,
      ogrenciId: d.ogrenci_id,
      katildi: d.durum === 'geldi' || d.durum === 'gec',
    },
    new Date(),
  );
  if (d.durum !== 'gelmedi' && d.durum !== 'gec') return;
  const sablonKodu = d.durum === 'gelmedi' ? 'yoklama_gelmedi' : 'yoklama_gec';
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu,
    degiskenler: { ders_id: d.ders_id },
    veri: { ders_id: d.ders_id, yoklama_id: d.yoklama_id, durum: d.durum },
    kaynakOlayId: olay.id,
    tekilAnahtar: `${sablonKodu}:${d.yoklama_id}:${String(d.yoklama_surumu)}`,
  });
});
