import type { Beceriler, TurKodu } from '../api/tipler';

export type { Beceriler, TurKodu };
export const TURLER: readonly TurKodu[] = ['kivilcim', 'dinamo', 'sedir'];
export const ASAMALAR = [1, 2, 3, 4, 5] as const;
export type Asama = (typeof ASAMALAR)[number];
/** 0 ortaokul, 1 lise (docs/karakter/rive-yapisi.md `variant`). */
export type Varyant = 0 | 1;

/**
 * Surekli ruh halleri: normal, odak (focus=true), uykulu (sleepy=true).
 * Gecici olaylar: mutlu (happy tetikleyicisi), kutlama (celebrate tetikleyicisi); olay
 * bitince ust bilesen ruhHali'ni 'normal'e dondurur.
 */
export type RuhHali = 'normal' | 'odak' | 'uykulu' | 'mutlu' | 'kutlama';

export interface Kozmetik {
  sapka?: number;
  aksesuar?: number;
  arkaPlan?: number;
  tema?: number;
}

/** Rive kaynagi: paketlenmis `require('x.riv')` (number) ya da uzak `{ uri }`. */
export type RiveKaynagi = number | { uri: string };

export interface CompanionProps {
  tur: TurKodu;
  asama: Asama | number;
  seviye: number;
  ruhHali?: RuhHali;
  beceriler?: Partial<Beceriler>;
  varyant?: Varyant;
  kozmetik?: Kozmetik;
  /** Karakter adi (erisilebilirlik etiketi icin); yoksa tur adi kullanilir. */
  ad?: string;
  /** dp cinsinden kenar uzunlugu (48-320). */
  boyut?: number;
  /** Verilirse ve hareket serbestse Rive ile cizilir; yoksa statik SVG yer tutucu. */
  riveKaynagi?: RiveKaynagi | null;
  /** Statik gorseli zorlar (ornegin liste onizlemesi). */
  statik?: boolean;
}
