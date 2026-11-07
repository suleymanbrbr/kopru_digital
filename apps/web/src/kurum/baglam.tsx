'use client';

import type { ModulKodu } from '@kopru/contracts';
import { createContext, useContext } from 'react';

import type { Rol } from '@/lib/navigasyon';
import type { Uyelik } from '@/oturum/tipler';

export interface KurumBaglami {
  uyelik: Uyelik;
  rol: Rol;
  kullaniciAd: string;
  /** Kurum/kademe/grup onceligi cozulmus acik moduller. */
  acikModuller: readonly ModulKodu[];
}

export const KurumKutusu = createContext<KurumBaglami | null>(null);

export function useKurum(): KurumBaglami {
  const baglam = useContext(KurumKutusu);
  if (!baglam) throw new Error('useKurum, kurum duzeni icinde kullanilmalidir.');
  return baglam;
}
