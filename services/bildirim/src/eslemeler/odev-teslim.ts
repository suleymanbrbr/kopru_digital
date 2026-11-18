import { ogrenmeOdevTeslimEdildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { KAYNAK_ODEV, iptalEt, uretilmisiGizle } from '../zamanlama.js';
import { esleme } from './esleme.js';
import { SABLON_ODEV_TESLIM_YAKLASIYOR } from './odev-yayinlandi.js';

/**
 * `ogrenme.odev.teslim_edildi.v1`: odevi veren ogretmene "yeni teslim" (kategori `odev`; ogrenci adi yok).
 * Yeniden teslimde de bildirim gider (olay basina tekil). Ayrica ogrencinin bekleyen "teslim tarihi yaklasiyor"
 * satiri iptal edilir, uretilmisse kutuda gizlenir.
 */
export const odevTeslimEsleme = esleme(ogrenmeOdevTeslimEdildiV1, async (tx, olay) => {
  const d = olay.data;
  const simdi = new Date();
  await iptalEt(
    tx,
    {
      kurumId: olay.kurumId,
      kaynakTuru: KAYNAK_ODEV,
      kaynakId: d.odev_id,
      nedeni: 'teslim',
      aliciIdleri: [d.ogrenci_id],
      sablonKodlari: [SABLON_ODEV_TESLIM_YAKLASIYOR],
    },
    simdi,
  );
  await uretilmisiGizle(
    tx,
    {
      kurumId: olay.kurumId,
      sablonKodu: SABLON_ODEV_TESLIM_YAKLASIYOR,
      tekilOnek: `${SABLON_ODEV_TESLIM_YAKLASIYOR}:${d.odev_id}`,
      aliciIdleri: [d.ogrenci_id],
    },
    simdi,
  );
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.veren_id],
    sablonKodu: 'odev_teslim_edildi',
    degiskenler: { odev_id: d.odev_id },
    veri: { odev_id: d.odev_id, ogrenci_odev_id: d.ogrenci_odev_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: d.yeniden_teslim
      ? `odev_teslim_edildi:${d.ogrenci_odev_id}:${olay.id}`
      : `odev_teslim_edildi:${d.ogrenci_odev_id}`,
  });
});
