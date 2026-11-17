import type { KvDepo } from '../depo/kv';

/** Vitrinde en cok bu kadar rozet (sartname: "vitrinde secilen 3 rozet"). */
export const VITRIN_ENFAZLA = 3;

const anahtar = (uyelikId: string) => `kopru.motivasyon.vitrin.${uyelikId}`;

/**
 * Vitrin secimi yerelde saklanir (uyelik kapsamli): sunucuda vitrin ucu yok. Cihaz degisince
 * secim tasinmaz.
 */
export function vitrinOku(depo: KvDepo, uyelikId: string): string[] {
  const ham = depo.getString(anahtar(uyelikId));
  if (!ham) return [];
  try {
    const v: unknown = JSON.parse(ham);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string').slice(0, VITRIN_ENFAZLA);
  } catch {
    return [];
  }
}

export interface VitrinSonucu {
  secim: string[];
  /** Zaten dolu olan vitrine yeni rozet eklenmek istendi. */
  dolu: boolean;
}

/** Rozeti vitrine ekler / cikarir. Dolu iken ekleme reddedilir (`dolu: true`). */
export function vitrinDegistir(depo: KvDepo, uyelikId: string, kod: string): VitrinSonucu {
  const mevcut = vitrinOku(depo, uyelikId);
  if (mevcut.includes(kod)) {
    const secim = mevcut.filter((k) => k !== kod);
    depo.set(anahtar(uyelikId), JSON.stringify(secim));
    return { secim, dolu: false };
  }
  if (mevcut.length >= VITRIN_ENFAZLA) return { secim: mevcut, dolu: true };
  const secim = [...mevcut, kod];
  depo.set(anahtar(uyelikId), JSON.stringify(secim));
  return { secim, dolu: false };
}
