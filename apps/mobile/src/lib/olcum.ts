import { useEffect, useRef } from 'react';

import { ortam } from '../ortam';

/**
 * Soguk acilis olcumu: JS paketi yuklendigi andan "Bugun" ekraninin ilk dolu karesine kadar gecen
 * sure `console.log('[olcum] ...')` ile yazilir (gelistirme derlemesi). `kaynak` verinin onceki
 * oturumdan kalici onbellekten mi (`onbellek`) yoksa agdan mi (`ag`) geldigini gosterir.
 *
 * Release derlemesinde konsol cikisi yoktur: `EXPO_PUBLIC_OLCUM_URL` verilirse (yalniz olcum
 * derlemesi; uretimde reddedilir, bkz. `app.config.ts`) ayni satir o adrese `GET ?m=<satir>` ile
 * gonderilir (`scripts/soguk-acilis-release.sh`).
 *
 * Yontem: modul yuklenirken `JS_BASLANGIC_EPOCH` duvar saati olarak sabitlenir (JS paketinin
 * calismaya basladigi an; `performance.now()` Hermes'te anlamli bir kok vermiyor). `dataUpdatedAt` bunun oncesindeyse veri bir onceki oturumdan gelmistir.
 */
export const JS_BASLANGIC_EPOCH = Date.now();

const olcumAcik = __DEV__ || ortam.olcumUrl !== '';

function yaz(satir: string) {
  if (__DEV__) console.log(satir);
  if (ortam.olcumUrl !== '') {
    void fetch(`${ortam.olcumUrl}/?m=${encodeURIComponent(satir)}`).catch(() => undefined);
  }
}

let yazildi = false;

/** `dolu` ilk kez true olunca bir kez yazar. `veriZamani`: sorgu verisinin guncellenme zamani (ms). */
export function useBugunOlcumu(ad: string, dolu: boolean, veriZamani: number) {
  const ref = useRef(false);
  useEffect(() => {
    if (!olcumAcik || !dolu || ref.current || yazildi) return;
    ref.current = true;
    yazildi = true;
    const ms = Date.now() - JS_BASLANGIC_EPOCH;
    const kaynak = veriZamani > 0 && veriZamani < JS_BASLANGIC_EPOCH ? 'onbellek' : 'ag';
    yaz(
      `[olcum] ${ad}-dolu ${String(ms)}ms (JS paketi calismaya basladigindan; kaynak=${kaynak}; bitis_epoch=${String(Date.now())})`,
    );
  }, [ad, dolu, veriZamani]);
}

const isaretli = new Set<string>();

/** Acilis asamasi isareti (her ad bir kez): `[olcum] <ad> +NNNms`. */
export function olcumIsareti(ad: string) {
  if (!olcumAcik || isaretli.has(ad)) return;
  isaretli.add(ad);
  yaz(`[olcum] ${ad} +${String(Date.now() - JS_BASLANGIC_EPOCH)}ms`);
}
