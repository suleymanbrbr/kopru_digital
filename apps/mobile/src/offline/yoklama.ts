import type { DersAdapter, YoklamaSatiri } from '../api/operasyonTipleri';
import { ApiHata, apiHatasiMi } from '../api/tipler';
import type { KuyrukIsi, OfflineKuyruk } from './kuyruk';

export const YOKLAMA_TURU = 'yoklama.kaydet';

/** Kuyruk yuku: ders bilgisi yalniz basarisiz is listesinde gostermek icindir (ogrenci adi yok). */
export interface YoklamaYuku {
  dersId: string;
  dersBaslik: string;
  dersBaslangic: string;
  satirlar: YoklamaSatiri[];
}

/**
 * `yoklama.kaydet` isleyicisi. `Idempotency-Key` = `KuyrukIsi.istekId` (her denemede ayni).
 *  - 429 gecici sayilir (yeniden denenir); 4xx kalici hata olarak `basarisiz` listesine duser.
 *  - Sunucu bir satiri `eski` saydiysa (yazilmadi) is kalici hata olur: sessizce kaybolmaz.
 */
export function yoklamaIsleyicisiKaydet(
  kuyruk: OfflineKuyruk,
  ders: () => DersAdapter,
  basarili?: () => void,
) {
  kuyruk.kaydet(YOKLAMA_TURU, async (is: KuyrukIsi) => {
    const yuk = is.yuk as YoklamaYuku;
    let sonuc;
    try {
      sonuc = await ders().yoklamaKaydet(yuk.dersId, yuk.satirlar, is.istekId);
    } catch (e) {
      if (apiHatasiMi(e) && e.kod === 'cok_istek') {
        throw new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
      }
      throw e;
    }
    basarili?.();
    if (sonuc.sonuclar.some((s) => s.sonuc === 'eski')) {
      throw new ApiHata('dogrulama', undefined, {
        durum: 200,
        ayrinti: 'yoklama_eski',
        yenidenDenenebilir: false,
      });
    }
  });
}

/** Yoklamayi kuyruga alir (iyimser: arayuz hemen "alindi" gosterir) ve bosaltmayi tetikler. */
export function yoklamaKuyrugaAl(kuyruk: OfflineKuyruk, yuk: YoklamaYuku): KuyrukIsi {
  const is = kuyruk.ekle(YOKLAMA_TURU, yuk);
  void kuyruk.bosalt();
  return is;
}
