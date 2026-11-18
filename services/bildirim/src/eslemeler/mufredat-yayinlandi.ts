import { ogrenmeMufredatYayinlandiV1 } from '@kopru/contracts';
import { sql } from 'drizzle-orm';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

const KATALOG_ADI = {
  lgs: 'LGS',
  tyt: 'TYT',
  ayt: 'AYT',
  ydt: 'YDT',
  okul: 'Okul (9–12. sınıf)',
} as const;

/**
 * `ogrenme.mufredat.yayinlandi.v1`: platform yeni bir katalog surumu yayinlayinca (olay kurum basina bir kez
 * uretilir) kurumun etkin sahip ve yoneticilerine "Mufredat guncellendi" (kategori `duyuru`, YALNIZ kutu:
 * push yok). Konu adi ve degisiklik notu olayda olmadigindan bildirimde yalniz katalog ve sayilar yer alir.
 * Kurumda etkin sahip/yonetici kopyasi yoksa bildirim uretilmez.
 */
export const mufredatYayinlandiEsleme = esleme(ogrenmeMufredatYayinlandiV1, async (tx, olay) => {
  const d = olay.data;
  const alicilar = await tx.execute<{ uyelik_id: string }>(sql`
    select uyelik_id from bildirim.uyelik_kopyalari
     where kurum_id = ${olay.kurumId} and durum = 'aktif' and rol in ('sahip', 'yonetici')
     order by uyelik_id`);
  if (alicilar.length === 0) return;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: alicilar.map((a) => a.uyelik_id),
    sablonKodu: 'mufredat_guncellendi',
    degiskenler: {
      katalog_ad: KATALOG_ADI[d.katalog_kodu],
      surum_no: d.surum_no,
      eklenen: d.eklenen,
      tasinan: d.tasinan + d.yeniden_adlandirilan,
      birlesen: d.birlesen,
      kaldirilan: d.kaldirilan,
    },
    veri: { katalog_kodu: d.katalog_kodu, surum_no: d.surum_no },
    kaynakOlayId: olay.id,
    tekilAnahtar: `mufredat_guncellendi:${d.katalog_kodu}:${String(d.surum_no)}`,
  });
});
