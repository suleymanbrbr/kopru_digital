import type { DersAdapter, FinansAdapter } from './operasyonTipleri';
import { ApiHata } from './tipler';

/**
 * Ders ve finans islemleri (yoklama kaydi haric) cevrimdisi kuyruga girmez: cihaz cevrimdisiyken
 * istek hic gonderilmez ve `cevrimdisi` hatasi atilir. Okumalar da korunur; onbellekte veri varsa
 * ekran onu gostermeye devam eder (TanStack Query hata durumunda eski veriyi korur).
 * `yoklamaKaydet` kuyruk isleyicisi tarafindan cagrilir; kuyruk cevrimici kontrolunu kendisi yapar.
 */
export function cevrimiciKorumaliOperasyon(
  ders: DersAdapter,
  finans: FinansAdapter,
  cevrimiciMi: () => boolean,
): { ders: DersAdapter; finans: FinansAdapter } {
  const kor =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> =>
      cevrimiciMi() ? f(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  return {
    ders: {
      saatDilimi: kor(ders.saatDilimi),
      dersler: kor(ders.dersler),
      gruplar: kor(ders.gruplar),
      dersOlustur: kor(ders.dersOlustur),
      dersTasi: kor(ders.dersTasi),
      dersIptal: kor(ders.dersIptal),
      yoklamaBekleyen: kor(ders.yoklamaBekleyen),
      yoklamaKatilimcilari: kor(ders.yoklamaKatilimcilari),
      yoklamaKaydet: ders.yoklamaKaydet,
    },
    finans: {
      paketler: kor(finans.paketler),
      ogrenciler: kor(finans.ogrenciler),
      ogrenciKarti: kor(finans.ogrenciKarti),
      paketSat: kor(finans.paketSat),
      tahsilatAl: kor(finans.tahsilatAl),
    },
  };
}
