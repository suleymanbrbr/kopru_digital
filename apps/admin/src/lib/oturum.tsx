'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { bff, platform } from './api';
import type { Ben, PlatformRolu, TaklitOzeti } from './tipler';

export const BEN_ANAHTARI = ['ben'] as const;
export const TAKLIT_ANAHTARI = ['taklit', 'durum'] as const;

/** Platform kimligim ve ikinci adim durumum (`GET /platform/ben`). Gecersiz oturumda 401 -> giris. */
export function useBen() {
  return useQuery<Ben>({
    queryKey: BEN_ANAHTARI,
    queryFn: () => platform.al<Ben>('ben'),
    retry: false,
    staleTime: 60_000,
  });
}

/** Etkin taklit oturumu (BFF cerezinden); yoksa `null`. */
export function useTaklit() {
  return useQuery<TaklitOzeti | null>({
    queryKey: TAKLIT_ANAHTARI,
    queryFn: async () => (await bff.al<{ taklit: TaklitOzeti | null }>('taklit/durum')).taklit,
    staleTime: 10_000,
  });
}

const RolBaglami = createContext<PlatformRolu>('destek');
export const RolSaglayici = RolBaglami.Provider;

/** Panel icinde gecerli platform rolu (`destek` yalniz okur, `yonetici` yazar). */
export const useRol = (): PlatformRolu => useContext(RolBaglami);
export const useYonetici = (): boolean => useRol() === 'yonetici';
