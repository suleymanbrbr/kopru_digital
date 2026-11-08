'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { UygulamaHatasi } from '@/lib/api';
import { hesapIstek, sorguDizgesi } from '@/lib/hesap-istek';

/** 4xx hatalari (yetki, bulunamadi) tekrar denemekle duzelmez; yalniz ag/sunucu hatalarinda bir kez daha dene. */
export function yenidenDene(sayi: number, hata: unknown): boolean {
  if (hata instanceof UygulamaHatasi && hata.durum >= 400 && hata.durum < 500) return false;
  return sayi < 1;
}

export const SAYFA_BOYUTU = 25;

/**
 * `imlec` tabanli sayfalama: yanit `sonraki_imlec` dondurur, "Daha fazla yukle" bir sonraki
 * sayfayi ister. `sema` yaniti dogrular.
 */
export function useSayfaliSorgu<S extends z.ZodType<{ sonraki_imlec: string | null }>>({
  anahtar,
  yol,
  sema,
  sorgu = {},
  etkin = true,
}: {
  anahtar: readonly unknown[];
  yol: string;
  sema: S;
  sorgu?: Record<string, string | number | undefined>;
  etkin?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: [...anahtar, sorgu],
    enabled: etkin,
    retry: yenidenDene,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      hesapIstek(`${yol}${sorguDizgesi({ ...sorgu, limit: SAYFA_BOYUTU, imlec: pageParam })}`, {
        sema,
      }),
    getNextPageParam: (son) => son.sonraki_imlec ?? undefined,
  });
}
