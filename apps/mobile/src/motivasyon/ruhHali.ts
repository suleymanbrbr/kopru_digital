import type { RuhHali } from '../karakter/tipler';

/** `YYYY-MM-DD` iki gun arasindaki tam gun farki (b - a). */
export function gunFarki(a: string, b: string): number {
  const ms = (g: string) => Date.parse(`${g}T00:00:00Z`);
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

export interface RuhHaliGirdisi {
  /** Odak oturumu suruyor. */
  odakta: boolean;
  /** Kutlama ani (seviye atlama, evrim, odak bitisi ...). */
  kutlama: boolean;
  /** Kurum gunu (04:00 kurali; sunucudan). */
  bugun: string;
  /** Son aktif gun; hic aktif olmadiysa `null`. */
  sonAktifGun: string | null;
  /** Bugun XP kazanildi. */
  bugunXp?: number;
}

/**
 * Karakterin ruh hali (sartname "Motivasyon sistemi"):
 *  - odak oturumu surerken `odak`; kutlama anlarinda `kutlama`;
 *  - 2+ gun aktivite yoksa `uykulu` ("seni bekledim", suclamadan);
 *  - bugun aktifse `mutlu`; digerleri `normal`.
 * Hic aktivitesi olmayan yeni ogrenci uykulu degil `normal` baslar.
 */
export function ruhHaliSec(g: RuhHaliGirdisi): RuhHali {
  if (g.kutlama) return 'kutlama';
  if (g.odakta) return 'odak';
  if (g.sonAktifGun === g.bugun || (g.bugunXp ?? 0) > 0) return 'mutlu';
  if (g.sonAktifGun !== null && gunFarki(g.sonAktifGun, g.bugun) >= 2) return 'uykulu';
  return 'normal';
}
