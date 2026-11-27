'use client';

import { GrupListeYanitSema, UyeListeYanitSema, type GrupTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';

import { hesapIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { VARSAYILAN_SAAT_DILIMI } from '@/lib/saat';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';

const kurumBilgisiSema = z.object({
  saat_dilimi: z.string().default(VARSAYILAN_SAAT_DILIMI),
  ayarlar: z.object({ yoklama_kilit_gun: z.number().optional() }).partial().loose().default({}),
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
  /** Etkin ogrenci sayisi (duyuru onayinda "yaklasik N kisiye gidecek"). */
  uyeSayisi: number;
}

/** Aktif gruplar (en cok 200); birebir grubun ogrenci adi liste yanitiyla gelir (ayri sorgu yok). */
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
  const secenekler = useMemo<GrupSecenegi[]>(() => {
    const liste = (gruplar.data?.gruplar ?? []).map((g) => ({
      id: g.id,
      tur: g.tur,
      uyeSayisi: g.uye_sayisi,
      etiket:
        g.tur === 'birebir'
          ? t('operasyon.takvim.birebirEtiket', { ad: g.ogrenci_ad ?? g.ad })
          : g.ad,
    }));
    return trSirala(liste, (g) => g.etiket);
  }, [gruplar.data]);
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
