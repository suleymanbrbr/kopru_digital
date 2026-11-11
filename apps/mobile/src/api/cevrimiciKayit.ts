import type { KayitAdapter } from './kayitTipleri';
import { ApiHata } from './tipler';

/**
 * Kayit ve geri bildirim okumalari/islemleri cevrimdisiyken istek gondermez ve `cevrimdisi` hatasi
 * atar; onbellekte veri varsa ekran onu gostermeye devam eder. Tek istisna `geriBildirimVer`: kuyruk
 * isleyicisi tarafindan cagrilir ve kuyruk cevrimici kontrolunu kendisi yapar.
 */
export function cevrimiciKorumaliKayit(k: KayitAdapter, cevrimiciMi: () => boolean): KayitAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(k)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] =
      ad === 'geriBildirimVer'
        ? islev
        : (...a: unknown[]) =>
            cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as KayitAdapter;
}
