'use client';

import {
  DersCakismaDetaySema,
  DersDetaySema,
  DersListeYanitSema,
  type CakisanDersSema,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { z } from 'zod';

import { UygulamaHatasi } from '@/lib/api';
import { dersIstek } from '@/lib/hesap-istek';
import { haftaAraligi } from '@/lib/saat';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

export type CakisanDers = z.infer<typeof CakisanDersSema>;

/** Tum ders onbellegi (liste, ayrinti, yoklama bekleyenler) bu anahtarin altindadir. */
export const dersAnahtari = (kurumId: string) => ['ders', kurumId] as const;

/** `409 ders_cakismasi` hatasindan cakisan dersleri cikarir; baska hatada `null`. */
export function cakisanlariOku(hata: unknown): CakisanDers[] | null {
  if (!(hata instanceof UygulamaHatasi) || hata.kod !== 'ders_cakismasi') return null;
  const sonuc = DersCakismaDetaySema.safeParse(hata.detaylar);
  return sonuc.success ? sonuc.data.cakisanlar : [];
}

/** Bir haftanin dersleri (kurum saat diliminde Pazartesi 00:00 - sonraki Pazartesi 00:00). */
export function useHaftaDersleri({
  haftaBasi,
  saatDilimi,
  ...ortak
}: {
  kurumId: string;
  haftaBasi: string;
  saatDilimi: string;
  etkin: boolean;
  ogretmenId?: string;
  grupId?: string;
}) {
  return useAralikDersleri({ ...ortak, ...haftaAraligi(haftaBasi, saatDilimi) });
}

/** Verilen UTC araligindaki dersler; sonraki sayfalar (200'luk) otomatik cekilir. */
export function useAralikDersleri({
  kurumId,
  baslangic,
  bitis,
  etkin,
  ogretmenId,
  grupId,
}: {
  kurumId: string;
  baslangic: string;
  bitis: string;
  etkin: boolean;
  ogretmenId?: string;
  grupId?: string;
}) {
  const sorgu = useSayfaliSorgu({
    servis: 'ders',
    anahtar: [...dersAnahtari(kurumId), 'liste'],
    yol: `kurumlar/${kurumId}/dersler`,
    sema: DersListeYanitSema,
    sayfaBoyutu: 200,
    etkin,
    sorgu: {
      baslangic,
      bitis,
      ...(ogretmenId ? { ogretmen_id: ogretmenId } : {}),
      ...(grupId ? { grup_id: grupId } : {}),
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = sorgu;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { ...sorgu, dersler: sorgu.data?.pages.flatMap((s) => s.dersler) ?? [] };
}

export function useDersDetayi(kurumId: string, dersId: string | null) {
  return useQuery({
    queryKey: [...dersAnahtari(kurumId), 'detay', dersId],
    enabled: dersId !== null,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`kurumlar/${kurumId}/dersler/${dersId ?? ''}`, { sema: DersDetaySema }),
  });
}

/** Ders yazimlarindan sonra tum ders onbellegini gecersiz kilar. */
export function useDersYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: dersAnahtari(kurumId) });
}
