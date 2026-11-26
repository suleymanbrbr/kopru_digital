import type { DegerlendirmeAdapter } from './degerlendirmeTipleri';
import { ApiHata } from './tipler';

/**
 * Degerlendirme, kaynak onerisi ve kocluk islemleri cevrimdisi kuyruga GIRMEZ: baglanti yokken istek
 * gonderilmez ve `cevrimdisi` hatasi atilir (okumada onbellekteki veri ekranda kalir). Bir
 * degerlendirmenin sessizce gec gonderilmesi (ornegin 7 gunluk duzenleme penceresi ya da gorunurluk
 * secimi degistikten sonra) istenmez.
 */
export function cevrimiciKorumaliDegerlendirme(
  d: DegerlendirmeAdapter,
  cevrimiciMi: () => boolean,
): DegerlendirmeAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(d)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] = (...a: unknown[]) =>
      cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as DegerlendirmeAdapter;
}
