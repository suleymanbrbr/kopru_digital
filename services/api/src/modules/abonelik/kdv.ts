/**
 * KDV hesabi (kurus, tam sayi). Yuvarlama kurali: **yariyi yukari** (0,5 kurus yukari), yalniz tam sayi
 * aritmetigiyle (kayan nokta yok). Fatura ve odeme kaydi ayni kuralla bolunur; `matrah + kdv = toplam` her zaman.
 *
 *  - KDV dahil toplamdan (saglayicinin tahsil ettigi tutar): `matrah = yuvarla(toplam * 100 / (100 + oran))`,
 *    `kdv = toplam - matrah` (fark matrahtan hesaplandigi icin toplam asla kaymaz).
 *  - KDV hariç matrahtan (plan fiyati): `kdv = yuvarla(matrah * oran / 100)`, `toplam = matrah + kdv`.
 */
export function yariYukari(pay: number, payda: number): number {
  return Math.floor((2 * pay + payda) / (2 * payda));
}

export interface KdvBolumu {
  matrahKurus: number;
  kdvKurus: number;
  toplamKurus: number;
}

/** KDV dahil toplam -> matrah + KDV. */
export function kdvAyir(toplamKurus: number, kdvOrani: number): KdvBolumu {
  const matrah = yariYukari(toplamKurus * 100, 100 + kdvOrani);
  return { matrahKurus: matrah, kdvKurus: toplamKurus - matrah, toplamKurus };
}

/** KDV hariç matrah -> toplam (KDV dahil). */
export function kdvEkle(matrahKurus: number, kdvOrani: number): KdvBolumu {
  const kdv = yariYukari(matrahKurus * kdvOrani, 100);
  return { matrahKurus, kdvKurus: kdv, toplamKurus: matrahKurus + kdv };
}
