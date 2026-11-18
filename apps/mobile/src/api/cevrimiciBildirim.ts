import type { BildirimAdapter } from './bildirimTipleri';
import { ApiHata } from './tipler';

/**
 * Bildirim istekleri cevrimdisiyken gonderilmez ve `cevrimdisi` hatasi atar; onbellekte veri varsa
 * ekran onu gostermeye devam eder (kutu listesi, tercihler). Cihaz kaydi da bir sonraki acilista
 * yinelenir, kuyruga girmez.
 */
export function cevrimiciKorumaliBildirim(
  b: BildirimAdapter,
  cevrimiciMi: () => boolean,
): BildirimAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(b)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] = (...a: unknown[]) =>
      cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as BildirimAdapter;
}
