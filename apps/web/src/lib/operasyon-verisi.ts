'use client';

import {
  GrupListeYanitSema,
  GrupUyeListeYanitSema,
  UyeListeYanitSema,
  type GrupTipi,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';

import { hesapIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { VARSAYILAN_SAAT_DILIMI } from '@/lib/saat';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';

const kurumBilgisiSema = z.object({
  saat_dilimi: z.string().default(VARSAYILAN_SAAT_DILIMI),
  ayarlar: z.object({ yoklama_kilit_gun: z.number().optional() }).partial().passthrough().default({}),
});

/** Kurumun saat dilimi; ders saatleri tarayicinin degil kurumun saat diliminde gosterilir. */
export function useSaatDilimi(kurumId: string): { saatDilimi: string; hazir: boolean } {
  const q = useQuery({
    queryKey: ['hesap', kurumId, 'kurum-bilgisi'],
    staleTime: 10 * 60_000,
    retry: yenidenDene,
    queryFn: () => hesapIstek(`kurumlar/${kurumId}`, { sema: kurumBilgisiSema }),
  });
  return { saatDilimi: q.data?.saat_dilimi ?? VARSAYILAN_SAAT_DILIMI, hazir: !q.isPending };
}

export interface GrupSecenegi {
  id: string;
  tur: GrupTipi['tur'];
  etiket: string;
}

/** Aktif gruplar (en cok 200) ve birebir gruplarin ogrenci adlari; ders formunda ve takvimde etiket olur. */
export function useGruplar(kurumId: string, etkin = true) {
  const gruplar = useQuery({
    queryKey: ['hesap', kurumId, 'gruplar-tumu'],
    enabled: etkin,
    staleTime: 60_000,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/gruplar${sorguDizgesi({ durum: 'aktif', limit: 200 })}`, {
        sema: GrupListeYanitSema,
      }),
  });
  const birebirler = useMemo(
    () => gruplar.data?.gruplar.filter((g) => g.tur === 'birebir') ?? [],
    [gruplar.data],
  );
  const uyeler = useQueries({
    queries: birebirler.map((g) => ({
      queryKey: ['hesap', kurumId, 'grup-uyeleri', g.id],
      staleTime: 60_000,
      queryFn: () =>
        hesapIstek(`kurumlar/${kurumId}/gruplar/${g.id}/uyeler`, { sema: GrupUyeListeYanitSema }),
    })),
  });
  const birebirAdlari = uyeler.map((u) => u.data?.uyeler[0]?.gorunen_ad ?? null).join('|');
  const secenekler = useMemo<GrupSecenegi[]>(() => {
    const liste = (gruplar.data?.gruplar ?? []).map((g) => {
      const idx = birebirler.findIndex((b) => b.id === g.id);
      const ad = idx >= 0 ? uyeler[idx]?.data?.uyeler[0]?.gorunen_ad : null;
      return {
        id: g.id,
        tur: g.tur,
        etiket: g.tur === 'birebir' ? t('operasyon.takvim.birebirEtiket', { ad: ad ?? g.ad }) : g.ad,
      };
    });
    return trSirala(liste, (g) => g.etiket);
    // `uyeler` her render yeni dizi; ad listesi degisince yeniden hesaplanir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruplar.data, birebirler, birebirAdlari]);
  const adlar = useMemo(() => new Map(secenekler.map((g) => [g.id, g])), [secenekler]);
  return { secenekler, adlar, yukleniyor: gruplar.isPending, hata: gruplar.isError };
}

/** Kurumdaki ogretmenler (kimlik -> ad); sahip/yonetici filtre ve ders formunda kullanir. */
export function useOgretmenler(kurumId: string, etkin = true) {
  const q = useQuery({
    queryKey: ['hesap', kurumId, 'ogretmenler-tumu'],
    enabled: etkin,
    staleTime: 60_000,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/uyelikler${sorguDizgesi({ rol: 'ogretmen', limit: 200 })}`, {
        sema: UyeListeYanitSema,
      }),
  });
  const liste = useMemo(
    () =>
      trSirala(
        (q.data?.uyeler ?? []).map((u) => ({ id: u.uyelik_id, ad: u.gorunen_ad ?? '' })),
        (u) => u.ad,
      ),
    [q.data],
  );
  const adlar = useMemo(() => new Map(liste.map((u) => [u.id, u.ad])), [liste]);
  return { liste, adlar, yukleniyor: q.isPending };
}
