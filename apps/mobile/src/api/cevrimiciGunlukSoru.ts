import type { GunlukSoruAdapter } from './gunlukSoruTipleri';
import { ApiHata } from './tipler';

/**
 * Gunluk soru okuma/duzeltme/silme cevrimdisiyken istek gondermez ve `cevrimdisi` hatasi atar
 * (onbellekte veri varsa ekran onu gostermeye devam eder). Tek istisna `kayitOlustur`: cevrimdisi
 * GIRILEN kayit `gonderim` kuyrugundan (`istek_id` ile idempotent) gonderilir ve kuyruk cevrimici
 * kontrolunu kendisi yapar.
 */
export function cevrimiciKorumaliGunlukSoru(
  g: GunlukSoruAdapter,
  cevrimiciMi: () => boolean,
): GunlukSoruAdapter {
  const sonuc: Record<string, unknown> = {};
  for (const [ad, f] of Object.entries(g)) {
    const islev = f as (...a: unknown[]) => Promise<unknown>;
    sonuc[ad] =
      ad === 'kayitOlustur'
        ? islev
        : (...a: unknown[]) =>
            cevrimiciMi() ? islev(...a) : Promise.reject(new ApiHata('cevrimdisi'));
  }
  return sonuc as unknown as GunlukSoruAdapter;
}
