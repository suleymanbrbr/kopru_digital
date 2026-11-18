import { dersKaynakSorunBildirildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

const NEDEN_OZETI = {
  acilmiyor: 'açılmıyor',
  parola_yanlis: 'parola yanlış',
  suresi_doldu: 'süresi dolmuş',
  diger: 'başka bir sorun',
} as const;

/**
 * `ders.kaynak.sorun_bildirildi.v1`: kaynagi ekleyen ogretmene (kategori `kayit`). Kutuda sorunun nedeni
 * (sabit liste) yazar; push genel. Bildiren ogrencinin adi bildirimde yoktur.
 */
export const dersKaynakSorunEsleme = esleme(dersKaynakSorunBildirildiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ekleyen_id],
    sablonKodu: 'kaynak_sorun',
    degiskenler: { kaynak_id: d.kaynak_id, neden_ozeti: NEDEN_OZETI[d.neden] },
    veri: { kaynak_id: d.kaynak_id, sorun_id: d.sorun_id, neden: d.neden },
    kaynakOlayId: olay.id,
    tekilAnahtar: `kaynak_sorun:${d.sorun_id}`,
  });
});
