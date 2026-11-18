import { motivasyonSeriBozuldiV1, motivasyonSeriKilometreTasiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

/**
 * `motivasyon.seri.kilometre_tasi.v1` (3, 7, 14, 30, 60, 100, 365): ogrenciye kutlama (kategori `oyunlastirma`).
 * Seri bozulup tekrar ayni tasa ulasabildiginden `tekil_anahtar` olay kimligini icerir (ayni olay iki kez
 * bildirim uretmez).
 */
export const seriKilometreTasiEsleme = esleme(motivasyonSeriKilometreTasiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: 'seri_kilometre_tasi',
    degiskenler: { seri: d.seri },
    veri: { seri: d.seri },
    kaynakOlayId: olay.id,
    tekilAnahtar: `seri_kilometre_tasi:${d.ogrenci_id}:${String(d.seri)}:${olay.id}`,
  });
});

/**
 * `motivasyon.seri.bozuldu.v1`: ogrenciye suclamayan dille (kategori `oyunlastirma`): "Yeni seri bugun
 * basliyor"; onarilabiliyorsa onarim hatirlatilir (`seri_onarilabilir`).
 */
export const seriBozuldiEsleme = esleme(motivasyonSeriBozuldiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.ogrenci_id],
    sablonKodu: d.onarilabilir ? 'seri_onarilabilir' : 'seri_bozuldu',
    degiskenler: { onceki_seri: d.onceki_seri },
    veri: { onceki_seri: d.onceki_seri, onarilabilir: d.onarilabilir },
    kaynakOlayId: olay.id,
    tekilAnahtar: `seri_bozuldu:${d.ogrenci_id}:${olay.id}`,
    ...(d.onarim_son_gun
      ? { gecerlilikBitisAt: new Date(`${d.onarim_son_gun}T23:59:59+03:00`) }
      : {}),
  });
});
