import { t } from '@kopru/i18n';

import type { Beceriler, CompanionProps, RuhHali, TurKodu } from './tipler';

/**
 * Rive sozlesmesindeki girdi adlari (docs/karakter/rive-yapisi.md bolum 3.1). Ad degisirse
 * sozlesme surumu yukselir; bu dosya tek dogruluk kaynagidir.
 */
export const RIVE = {
  artboard: 'main',
  stateMachine: 'Companion_SM',
  sayilar: [
    'stage',
    'level',
    'variant',
    'skill_sayisal',
    'skill_sozel',
    'skill_fen',
    'skill_sosyal',
    'skill_dil',
    'cos_hat',
    'cos_accessory',
    'cos_background',
    'cos_theme',
  ],
  mantiksal: ['focus', 'sleepy', 'reduce_motion'],
  tetikleyiciler: ['happy', 'celebrate', 'evolve'],
  olaylar: ['evo_midpoint', 'evo_done', 'celebrate_done', 'happy_done', 'wake_done'],
} as const;

export type RiveSayiAdi = (typeof RIVE.sayilar)[number];
export type RiveMantiksalAdi = (typeof RIVE.mantiksal)[number];
export type RiveTetikleyiciAdi = (typeof RIVE.tetikleyiciler)[number];

export interface RiveGirdileri {
  sayilar: Record<RiveSayiAdi, number>;
  mantiksal: Record<RiveMantiksalAdi, boolean>;
}

const sinirla = (n: number, alt: number, ust: number) =>
  Math.min(Math.max(Number.isFinite(n) ? n : alt, alt), ust);

/** Tam sayiya yuvarlar ve araliga sikistirir. */
export const tamSinirla = (n: number, alt: number, ust: number) => Math.round(sinirla(n, alt, ust));

export function asamaSinirla(asama: number): 1 | 2 | 3 | 4 | 5 {
  return tamSinirla(asama, 1, 5) as 1 | 2 | 3 | 4 | 5;
}

/** Bilesen props'unu Rive girdilerine esler (sinirlar sozlesmeden: stage 1-5, level 1-99, skill 0-10). */
export function riveGirdileri(p: CompanionProps, hareketAzalt: boolean): RiveGirdileri {
  const b: Partial<Beceriler> = p.beceriler ?? {};
  const k = p.kozmetik ?? {};
  return {
    sayilar: {
      stage: asamaSinirla(p.asama),
      level: tamSinirla(p.seviye, 1, 99),
      variant: p.varyant === 1 ? 1 : 0,
      skill_sayisal: tamSinirla(b.sayisal ?? 0, 0, 10),
      skill_sozel: tamSinirla(b.sozel ?? 0, 0, 10),
      skill_fen: tamSinirla(b.fen ?? 0, 0, 10),
      skill_sosyal: tamSinirla(b.sosyal ?? 0, 0, 10),
      skill_dil: tamSinirla(b.dil ?? 0, 0, 10),
      cos_hat: Math.max(0, Math.trunc(k.sapka ?? 0)),
      cos_accessory: Math.max(0, Math.trunc(k.aksesuar ?? 0)),
      cos_background: Math.max(0, Math.trunc(k.arkaPlan ?? 0)),
      cos_theme: Math.max(0, Math.trunc(k.tema ?? 0)),
    },
    mantiksal: {
      focus: p.ruhHali === 'odak',
      sleepy: p.ruhHali === 'uykulu',
      reduce_motion: hareketAzalt,
    },
  };
}

/** Ruh hali degisiminde tetiklenecek bir-seferlik girdiler (yalnizca gecici hallere girisi). */
export function ruhHaliTetikleri(
  onceki: RuhHali | undefined,
  yeni: RuhHali | undefined,
): RiveTetikleyiciAdi[] {
  if (onceki === yeni) return [];
  if (yeni === 'mutlu') return ['happy'];
  if (yeni === 'kutlama') return ['celebrate'];
  return [];
}

/** Asama artisi evrim dizisini baslatir; ilk cizimde ya da dususte tetiklenmez. */
export function evrimGerekli(onceki: number | undefined, yeni: number): boolean {
  return onceki !== undefined && asamaSinirla(yeni) > asamaSinirla(onceki);
}

/** Rive olay adina gore uygulama tepkisi (evo_midpoint gelmezse zaman asimi ayni isi yapar). */
export const EVRIM_ZAMAN_ASIMI_MS = 2500;

export const TUR_ADLARI: Record<
  TurKodu,
  'mobil.karakter.kivilcim' | 'mobil.karakter.dinamo' | 'mobil.karakter.sedir'
> = {
  kivilcim: 'mobil.karakter.kivilcim',
  dinamo: 'mobil.karakter.dinamo',
  sedir: 'mobil.karakter.sedir',
};

/** Statik gorsel anahtari: once `<tur>-<asama>-v<varyant>` (nihai gorseller), yoksa `<tur>-<asama>`. */
export function statikAnahtarlar(
  tur: TurKodu,
  asama: number,
  varyant: 0 | 1 | undefined,
): string[] {
  const a = asamaSinirla(asama);
  return [`${tur}-${a}-v${varyant ?? 0}`, `${tur}-${a}`];
}

/** Ekran okuyucu etiketi (Rive icinde metin yok; etiketi uygulama verir). */
export function companionEtiketi(
  p: Pick<CompanionProps, 'tur' | 'ad' | 'asama' | 'ruhHali'>,
): string {
  const ruhHali = t(`mobil.karakter.ruhHali.${p.ruhHali ?? 'normal'}`);
  return t('mobil.karakter.etiket', {
    ad: p.ad ?? t(TUR_ADLARI[p.tur]),
    asama: asamaSinirla(p.asama),
    ruhHali,
  });
}
