import { useEffect, useRef } from 'react';

/**
 * Soguk acilis olcumu (yalniz gelistirme derlemesi): JS paketi yuklendigi andan "Bugun" ekraninin ilk
 * dolu karesine kadar gecen sure `console.log('[olcum] ...')` ile yazilir. `kaynak` verinin onceki
 * oturumdan kalici onbellekten mi (`onbellek`) yoksa agdan mi (`ag`) geldigini gosterir.
 *
 * Yontem: modul yuklenirken `JS_BASLANGIC_EPOCH` duvar saati olarak sabitlenir (JS paketinin
 * calismaya basladigi an; `performance.now()` Hermes'te anlamli bir kok vermiyor). `dataUpdatedAt` bunun oncesindeyse veri bir onceki oturumdan gelmistir.
 */
export const JS_BASLANGIC_EPOCH = Date.now();

let yazildi = false;

/** `dolu` ilk kez true olunca bir kez yazar. `veriZamani`: sorgu verisinin guncellenme zamani (ms). */
export function useBugunOlcumu(ad: string, dolu: boolean, veriZamani: number) {
  const ref = useRef(false);
  useEffect(() => {
    if (!__DEV__ || !dolu || ref.current || yazildi) return;
    ref.current = true;
    yazildi = true;
    const ms = Date.now() - JS_BASLANGIC_EPOCH;
    const kaynak = veriZamani > 0 && veriZamani < JS_BASLANGIC_EPOCH ? 'onbellek' : 'ag';
    console.log(
      `[olcum] ${ad}-dolu ${String(ms)}ms (JS paketi calismaya basladigindan; kaynak=${kaynak}; bitis_epoch=${String(Date.now())})`,
    );
  }, [ad, dolu, veriZamani]);
}

const isaretli = new Set<string>();

/** Acilis asamasi isareti (yalniz gelistirme, her ad bir kez): `[olcum] <ad> +NNNms`. */
export function olcumIsareti(ad: string) {
  if (!__DEV__ || isaretli.has(ad)) return;
  isaretli.add(ad);
  console.log(`[olcum] ${ad} +${String(Date.now() - JS_BASLANGIC_EPOCH)}ms`);
}
