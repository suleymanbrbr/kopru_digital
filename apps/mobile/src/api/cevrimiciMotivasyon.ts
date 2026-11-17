import type { MotivasyonAdapter } from './motivasyonTipleri';
import { ApiHata } from './tipler';

/** Kuyruk isleyicilerinin cagirdigi uclar: kuyruk cevrimici kontrolunu kendisi yapar. */
const KUYRUKLU = new Set(['odakBaslat', 'odakBitir', 'odakAcik']);

/**
 * Motivasyon okumalari ve islemleri cevrimdisiyken istek gondermez ve `cevrimdisi` hatasi atar;
 * onbellekte veri varsa ekran onu gostermeye devam eder. Istisna: odak ucu (`odakBaslat`,
 * `odakBitir`, `odakAcik`) cevrimdisi kuyruk tarafindan cagrilir.
 */
export function cevrimiciKorumaliMotivasyon(
  m: MotivasyonAdapter,
  cevrimiciMi: () => boolean,
): MotivasyonAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(m)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] = KUYRUKLU.has(ad)
      ? islev
      : (...a: unknown[]) =>
          cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as MotivasyonAdapter;
}
