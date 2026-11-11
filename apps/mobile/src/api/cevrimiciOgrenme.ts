import type { OgrenmeAdapter } from './ogrenmeTipleri';
import { ApiHata } from './tipler';

/**
 * Ogrenme islemleri (okumalar dahil) cevrimdisiyken istek gondermez ve `cevrimdisi` hatasi atar;
 * onbellekte veri varsa ekran onu gostermeye devam eder. Tek istisna `gorevGerceklesen`: kuyruk
 * isleyicisi tarafindan cagrilir ve kuyruk cevrimici kontrolunu kendisi yapar.
 */
export function cevrimiciKorumaliOgrenme(
  o: OgrenmeAdapter,
  cevrimiciMi: () => boolean,
): OgrenmeAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(o)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] =
      ad === 'gorevGerceklesen'
        ? islev
        : (...a: unknown[]) =>
            cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as OgrenmeAdapter;
}
