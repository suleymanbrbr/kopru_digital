import { SORU_SES_EN_FAZLA_SN } from '@kopru/contracts';

/**
 * Sesli anlatim: `MediaRecorder` bicim secimi, sure sinirli kayit durum makinesi ve sure bicimleme.
 * Tarayici destegi: Safari `audio/mp4` kaydeder; Chrome/Firefox `audio/webm;codecs=opus`. Medya servisi
 * `audio/mp4` ve `audio/webm` kabul eder (parametresiz mime ile); en cok 180 sn, 5 MB.
 */

export const SES_EN_FAZLA_SN = SORU_SES_EN_FAZLA_SN;

export interface SesBicimi {
  /** `MediaRecorder` `mimeType` secenegi. */
  kayitTuru: string;
  /** Medya'ya bildirilen parametresiz tur. */
  mime: 'audio/mp4' | 'audio/webm';
  uzanti: 'm4a' | 'webm';
}

/** Tarayicinin destekledigi ilk bicimi secer; `audio/mp4` tercih edilir. Hicbiri yoksa `null`. */
export function sesBicimiSec(destekliMi: (mime: string) => boolean): SesBicimi | null {
  if (destekliMi('audio/mp4')) return { kayitTuru: 'audio/mp4', mime: 'audio/mp4', uzanti: 'm4a' };
  if (destekliMi('audio/webm;codecs=opus')) {
    return { kayitTuru: 'audio/webm;codecs=opus', mime: 'audio/webm', uzanti: 'webm' };
  }
  if (destekliMi('audio/webm'))
    return { kayitTuru: 'audio/webm', mime: 'audio/webm', uzanti: 'webm' };
  return null;
}

export function tarayicidaSesBicimi(): SesBicimi | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return sesBicimiSec((m) => MediaRecorder.isTypeSupported(m));
}

/** `m:ss`. */
export function sureBicimle(saniye: number): string {
  const s = Math.max(0, Math.floor(saniye));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Olculen milisaniyeyi `sure_sn` icin 1..enFazla araligina yuvarlar (api en az 1 ister). */
export function sureSaniyeYap(ms: number, enFazla = SES_EN_FAZLA_SN): number {
  return Math.min(enFazla, Math.max(1, Math.ceil(ms / 1000)));
}

export type KayitAsamasi = 'bos' | 'kaydediyor' | 'bitti' | 'hata';

export interface KayitDurumu {
  asama: KayitAsamasi;
  gecenMs: number;
  /** Sure siniri dolunca kayit kendiliginden durdu. */
  siniraUlasti: boolean;
}

export type KayitOlayi =
  | { tur: 'basla' }
  | { tur: 'tik'; gecenMs: number }
  | { tur: 'bitir' }
  | { tur: 'hata' }
  | { tur: 'sifirla' };

export const KAYIT_BASLANGIC: KayitDurumu = { asama: 'bos', gecenMs: 0, siniraUlasti: false };

/** `enFazlaSn` dolunca `tik` kaydi bitirir ve `siniraUlasti` isaretlenir. */
export function kayitIlerlet(
  d: KayitDurumu,
  o: KayitOlayi,
  enFazlaSn = SES_EN_FAZLA_SN,
): KayitDurumu {
  switch (o.tur) {
    case 'basla':
      return { asama: 'kaydediyor', gecenMs: 0, siniraUlasti: false };
    case 'tik': {
      if (d.asama !== 'kaydediyor') return d;
      const sinir = enFazlaSn * 1000;
      return o.gecenMs >= sinir
        ? { asama: 'bitti', gecenMs: sinir, siniraUlasti: true }
        : { ...d, gecenMs: o.gecenMs };
    }
    case 'bitir':
      return d.asama === 'kaydediyor' ? { ...d, asama: 'bitti' } : d;
    case 'hata':
      return { ...d, asama: 'hata' };
    case 'sifirla':
      return KAYIT_BASLANGIC;
  }
}
