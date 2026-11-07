import { kurumAyarlariSema, type KurumSemaTipi, type Rol } from '@kopru/contracts';

import type { kurumlar } from '../../db/schema.js';

export type KurumSatiri = typeof kurumlar.$inferSelect;

/** Varsayilan kademe listesi (kurum/ekip). Bireysel ogretmende kademe acilmaz. */
export const VARSAYILAN_KADEMELER = [
  ['5. Sınıf', 5],
  ['6. Sınıf', 6],
  ['7. Sınıf', 7],
  ['8. Sınıf', 8],
  ['9. Sınıf', 9],
  ['10. Sınıf', 10],
  ['11. Sınıf', 11],
  ['12. Sınıf', 12],
  ['Mezun', 13],
] as const;

export function kurumYaniti(satir: KurumSatiri): KurumSemaTipi {
  const ayarlar = kurumAyarlariSema.safeParse(satir.ayarlar);
  return {
    id: satir.id,
    ad: satir.ad,
    tur: satir.tur as KurumSemaTipi['tur'],
    kisa_ad: satir.kisa_ad,
    saat_dilimi: satir.saat_dilimi,
    durum: satir.durum as KurumSemaTipi['durum'],
    ayarlar: ayarlar.success ? ayarlar.data : {},
    surum: satir.surum,
    created_at: satir.created_at.toISOString(),
  };
}

/** Kurum turune gore olusturulacak uyelik rolleri: bireysel ogretmen hem sahip hem ogretmendir. */
export const kurucuRolleri = (tur: KurumSemaTipi['tur']): Rol[] =>
  tur === 'bireysel' ? ['sahip', 'ogretmen'] : ['sahip'];
