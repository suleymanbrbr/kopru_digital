import { ogrenmeOdevYayinlandiV1 } from '@kopru/contracts';

import { aliciAyarlari } from '../ders-zamanlama.js';
import { bildirimUret } from '../uretim.js';
import { KAYNAK_ODEV, zamanla } from '../zamanlama.js';
import { esleme } from './esleme.js';

export const SABLON_ODEV_TESLIM_YAKLASIYOR = 'odev_teslim_yaklasiyor';
/** Teslim tarihinden bu kadar once, teslim etmemis ogrenciye hatirlatma. */
export const TESLIM_HATIRLATMA_SAAT = 24;

/**
 * `ogrenme.odev.yayinlandi.v1` (parcali, 200'luk): ogrencilere "yeni odev" (kategori `odev`). Baslik olayda
 * yoktur; metin genel. `son_teslim_at` varsa her ogrenci icin `son_teslim_at - 24 saat`te zamanlanmis
 * "teslim tarihi yaklasiyor" satiri eklenir (teslim olayi gelince iptal; gecmise dusen eklenmez).
 */
export const odevYayinlandiEsleme = esleme(ogrenmeOdevYayinlandiV1, async (tx, olay) => {
  const d = olay.data;
  if (d.ogrenci_idleri.length === 0) return;
  const simdi = new Date();
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: d.ogrenci_idleri,
    sablonKodu: 'odev_yayinlandi',
    degiskenler: { odev_id: d.odev_id },
    veri: { odev_id: d.odev_id },
    kaynakOlayId: olay.id,
    tekilAnahtar: `odev_yayinlandi:${d.odev_id}`,
  });
  if (!d.son_teslim_at) return;
  const sonTeslim = new Date(d.son_teslim_at);
  const gonderimAt = new Date(sonTeslim.getTime() - TESLIM_HATIRLATMA_SAAT * 3_600_000);
  if (gonderimAt.getTime() <= simdi.getTime()) return;
  const alicilar = await aliciAyarlari(tx, olay.kurumId, d.ogrenci_idleri);
  for (const uyelikId of new Set(d.ogrenci_idleri)) {
    if (!alicilar.get(uyelikId)?.aktif) continue;
    await zamanla(
      tx,
      {
        kurumId: olay.kurumId,
        kaynakTuru: KAYNAK_ODEV,
        kaynakId: d.odev_id,
        aliciId: uyelikId,
        sablonKodu: SABLON_ODEV_TESLIM_YAKLASIYOR,
        gonderimAt,
        veri: { odev_id: d.odev_id, son_teslim_at: d.son_teslim_at },
      },
      simdi,
    );
  }
});
