import type { OgrenmeAdapter } from '../api/ogrenmeTipleri';
import { ApiHata, apiHatasiMi } from '../api/tipler';
import type { KuyrukIsi, OfflineKuyruk } from './kuyruk';

export const PLAN_GERCEKLESEN_TURU = 'plan.gerceklesen';

/** Kuyruk yuku: gorev basligi yalniz basarisiz is listesinde gostermek icindir. */
export interface PlanGerceklesenYuku {
  gorevId: string;
  gorevBaslik: string;
  /** Gorevin gunu (`YYYY-MM-DD`, kurum yerel gunu). */
  gun: string;
  miktar: number;
}

/**
 * `plan.gerceklesen` isleyicisi. Sunucu ayni degeri tekrar yazmayi guvenli sayar (surum artmaz, olay
 * yok) ve `surum` yollanmaz: cevrimdisi beklerken surum eskise de 409 `surum_cakismasi` olusmaz.
 *  - 429 gecici sayilir; 4xx (`plan_kilitli`, `gorev_zaten_devredildi` ...) kalici hata olarak
 *    `basarisiz` listesine duser ve `senkron` ekraninda gorunur.
 */
export function planIsleyicisiKaydet(
  kuyruk: OfflineKuyruk,
  ogrenme: () => OgrenmeAdapter,
  basarili?: () => void,
) {
  kuyruk.kaydet(PLAN_GERCEKLESEN_TURU, async (is: KuyrukIsi) => {
    const yuk = is.yuk as PlanGerceklesenYuku;
    try {
      await ogrenme().gorevGerceklesen(yuk.gorevId, yuk.miktar);
    } catch (e) {
      if (apiHatasiMi(e) && e.kod === 'cok_istek') {
        throw new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
      }
      throw e;
    }
    basarili?.();
  });
}

/** Gerceklesen girisini kuyruga alir (iyimser: arayuz hemen gunceller) ve bosaltmayi tetikler. */
export function gerceklesenKuyrugaAl(
  kuyruk: OfflineKuyruk,
  yuk: PlanGerceklesenYuku,
  istekId?: string,
): KuyrukIsi {
  const is = kuyruk.ekle(PLAN_GERCEKLESEN_TURU, yuk, istekId ? { istekId } : undefined);
  void kuyruk.bosalt();
  return is;
}
