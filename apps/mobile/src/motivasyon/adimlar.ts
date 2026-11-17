import type { XpOlayi } from './xpYonetici';

export type AdimTuru = 'xp' | 'seviye' | 'evrim' | 'rozet';
export interface Adim {
  tur: AdimTuru;
  /** Adimin ekranda kalma suresi (ms). Evrim sahnesi en cok 4 sn. */
  sureMs: number;
}

export const EVRIM_ENFAZLA_MS = 4000;

/**
 * Bir XP olayinin gosterim adimlari: "+N XP" -> seviye atlama (evrim varsa yerine tam ekran evrim
 * sahnesi) -> yeni rozet. Evrim sahnesi <= 4 sn'dir ve atlanabilir.
 */
export function adimlariPlanla(f: XpOlayi['fark']): Adim[] {
  const adimlar: Adim[] = [];
  if (f.xp > 0) adimlar.push({ tur: 'xp', sureMs: 1800 });
  if (f.evrim) adimlar.push({ tur: 'evrim', sureMs: EVRIM_ENFAZLA_MS });
  else if (f.seviyeAtladi) adimlar.push({ tur: 'seviye', sureMs: 2600 });
  if (f.yeniRozetler.length > 0) adimlar.push({ tur: 'rozet', sureMs: 2600 });
  return adimlar;
}
