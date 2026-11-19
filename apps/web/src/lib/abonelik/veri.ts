import {
  AbonelikPlanListeYanitSema,
  AbonelikYanitSema,
  FaturaBilgisiYanitSema,
  FaturaGecmisiYanitSema,
  OdemeGecmisiYanitSema,
} from '@kopru/contracts';
import { useQuery } from '@tanstack/react-query';

import { abonelikIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';

export const abonelikAnahtari = (kurumId: string) => ['abonelik', kurumId, 'durum'] as const;
export const planlarAnahtari = (kurumId: string) => ['abonelik', kurumId, 'planlar'] as const;
export const faturaBilgisiAnahtari = (kurumId: string) =>
  ['abonelik', kurumId, 'fatura-bilgisi'] as const;
export const odemelerAnahtari = (kurumId: string) => ['abonelik', kurumId, 'odemeler'] as const;
export const faturalarAnahtari = (kurumId: string) => ['abonelik', kurumId, 'faturalar'] as const;

export const abonelikGetir = (kurumId: string) =>
  abonelikIstek(`kurumlar/${kurumId}/abonelik`, { sema: AbonelikYanitSema });

/** Sahip icin abonelik durumu; `enabled=false` ise (diger roller) istek atilmaz. */
export function useAbonelik(kurumId: string, enabled = true, yenilemeMs?: number | false) {
  return useQuery({
    queryKey: abonelikAnahtari(kurumId),
    enabled,
    retry: yenidenDene,
    ...(yenilemeMs ? { refetchInterval: yenilemeMs } : {}),
    queryFn: () => abonelikGetir(kurumId),
  });
}

export function usePlanlar(kurumId: string) {
  return useQuery({
    queryKey: planlarAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () =>
      abonelikIstek(`kurumlar/${kurumId}/planlar`, { sema: AbonelikPlanListeYanitSema }),
  });
}

export function useFaturaBilgisi(kurumId: string) {
  return useQuery({
    queryKey: faturaBilgisiAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () =>
      abonelikIstek(`kurumlar/${kurumId}/fatura-bilgileri`, { sema: FaturaBilgisiYanitSema }),
  });
}

export function useOdemeler(kurumId: string) {
  return useQuery({
    queryKey: odemelerAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () => abonelikIstek(`kurumlar/${kurumId}/odemeler`, { sema: OdemeGecmisiYanitSema }),
  });
}

export function useFaturalar(kurumId: string) {
  return useQuery({
    queryKey: faturalarAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () => abonelikIstek(`kurumlar/${kurumId}/faturalar`, { sema: FaturaGecmisiYanitSema }),
  });
}
