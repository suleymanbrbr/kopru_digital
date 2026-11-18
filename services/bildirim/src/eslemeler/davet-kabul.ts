import { hesapDavetKabulEdildiV1 } from '@kopru/contracts';

import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';

const ROL_OZETI = {
  sahip: 'kurum sahibi',
  yonetici: 'yönetici',
  ogretmen: 'öğretmen',
  ogrenci: 'öğrenci',
  veli: 'veli',
} as const;

/**
 * `hesap.davet.kabul_edildi.v1`: daveti gonderene "davetin kabul edildi" (kategori `sistem`: kapatilamaz,
 * sessiz saati delmez; sessiz saatte push atlanir, kutu yazilir). Davet edilenin adi bildirimde yoktur.
 */
export const davetKabulEsleme = esleme(hesapDavetKabulEdildiV1, async (tx, olay) => {
  const d = olay.data;
  await bildirimUret(tx, {
    kurumId: olay.kurumId,
    aliciUyelikIdleri: [d.davet_eden_id],
    sablonKodu: 'davet_kabul_edildi',
    degiskenler: { rol_ozeti: ROL_OZETI[d.rol] },
    veri: { davet_id: d.davet_id, uyelik_id: d.uyelik_id, rol: d.rol },
    kaynakOlayId: olay.id,
    tekilAnahtar: `davet_kabul_edildi:${d.davet_id}`,
  });
});
