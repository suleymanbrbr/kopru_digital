'use client';

import {
  DenemeAyarlariSema,
  DenemeGelisimSema,
  DenemeGrupOzetSema,
  DenemeKuraliListeYanitSema,
  DenemeListeYanitSema,
  GorevlerimYanitSema,
  GrupUyeListeYanitSema,
  KatalogListeYanitSema,
  KonuListeYanitSema,
  OdevListeYanitSema,
  OdevOzetSema,
  OdevlerimYanitSema,
  PlanDetaySema,
  PlanOzetSema,
  PlanSablonListeYanitSema,
  SablonListeYanitSema,
  UyeListeYanitSema,
  type Konu,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { hesapIstek, ogrenmeIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';

/** Tum ogrenme onbellegi bu anahtarin altindadir; yazimlardan sonra topluca gecersiz kilinir. */
export const ogrenmeAnahtari = (kurumId: string) => ['ogrenme', kurumId] as const;

export function useOgrenmeYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ogrenmeAnahtari(kurumId) });
}

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;

// --- Ortak: ogrenci listesi -------------------------------------------------------------------

/** Kurumun etkin ogrencileri (kimlik -> ad), Turkce sirali; ogrenci secicileri ve adlar icin. */
export function useOgrenciler(kurumId: string, etkin = true) {
  const q = useQuery({
    queryKey: ['hesap', kurumId, 'ogrenciler-tumu'],
    enabled: etkin,
    staleTime: 60_000,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(yol(kurumId, `uyelikler${sorguDizgesi({ rol: 'ogrenci', limit: 200 })}`), {
        sema: UyeListeYanitSema,
      }),
  });
  const liste = useMemo(
    () =>
      trSirala(
        (q.data?.uyeler ?? [])
          .filter((u) => u.durum === 'aktif')
          .map((u) => ({ id: u.uyelik_id, ad: u.gorunen_ad ?? '' })),
        (u) => u.ad,
      ),
    [q.data],
  );
  const adlar = useMemo(() => new Map(liste.map((u) => [u.id, u.ad])), [liste]);
  return { liste, adlar, yukleniyor: q.isPending, hata: q.isError };
}

export function useGrupOgrencileri(kurumId: string, grupId: string) {
  return useQuery({
    queryKey: ['hesap', kurumId, 'grup-uyeleri', grupId],
    enabled: grupId !== '',
    staleTime: 30_000,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(yol(kurumId, `gruplar/${grupId}/uyeler`), { sema: GrupUyeListeYanitSema }),
  });
}

// --- Mufredat ---------------------------------------------------------------------------------

/** Tum konular (kullanimdan kalkanlar ve arsivliler dahil, rozetli); sayfa sayfa yuklenir. */
export function useKonular(kurumId: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'konular'],
    staleTime: 5 * 60_000,
    retry: yenidenDene,
    queryFn: async (): Promise<Konu[]> => {
      const hepsi: Konu[] = [];
      let imlec: string | undefined;
      for (let sayfa = 0; sayfa < 20; sayfa += 1) {
        const yanit = await ogrenmeIstek(
          yol(kurumId, `konular${sorguDizgesi({ tumu: 1, limit: 500, imlec })}`),
          { sema: KonuListeYanitSema },
        );
        hepsi.push(...yanit.konular);
        if (!yanit.sonraki_imlec) break;
        imlec = yanit.sonraki_imlec;
      }
      return hepsi;
    },
  });
}

export function useKataloglar(kurumId: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'kataloglar'],
    staleTime: 10 * 60_000,
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'kataloglar'), { sema: KatalogListeYanitSema }),
  });
}

// --- Odev -------------------------------------------------------------------------------------

export function useOdevler(kurumId: string, durum: string, etkin = true) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...ogrenmeAnahtari(kurumId), 'odevler'],
    yol: yol(kurumId, 'odevler'),
    sema: OdevListeYanitSema,
    sayfaBoyutu: 25,
    etkin,
    sorgu: durum ? { durum } : {},
  });
  return { ...sorgu, odevler: sorgu.data?.pages.flatMap((s) => s.odevler) ?? [] };
}

export function useOdevOzeti(kurumId: string, odevId: string | null) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'odev-ozet', odevId],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: odevId !== null,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `odevler/${String(odevId)}/ozet`), { sema: OdevOzetSema }),
  });
}

export function useOdevSablonlari(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'odev-sablonlari'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'odev-sablonlari'), { sema: SablonListeYanitSema }),
  });
}

export function useOdevlerim(kurumId: string, durum: string) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...ogrenmeAnahtari(kurumId), 'odevlerim'],
    yol: yol(kurumId, 'odevlerim'),
    sema: OdevlerimYanitSema,
    sayfaBoyutu: 25,
    sorgu: durum ? { durum } : {},
  });
  return { ...sorgu, odevler: sorgu.data?.pages.flatMap((s) => s.odevler) ?? [] };
}

// --- Plan -------------------------------------------------------------------------------------

export function usePlanDetayi(kurumId: string, ogrenciId: string, hafta: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'plan', ogrenciId, hafta],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: ogrenciId !== '',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/plan${sorguDizgesi({ hafta })}`), {
        sema: PlanDetaySema,
      }),
  });
}

export function usePlanim(kurumId: string, hafta: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'planim', hafta],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `planim${sorguDizgesi({ hafta })}`), { sema: PlanDetaySema }),
  });
}

export function usePlanOzeti(kurumId: string, planId: string | null) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'plan-ozet', planId],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: planId !== null,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `planlar/${String(planId)}/ozet`), { sema: PlanOzetSema }),
  });
}

export function usePlanSablonlari(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'plan-sablonlari'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, 'plan-sablonlari'), { sema: PlanSablonListeYanitSema }),
  });
}

export function useGorevlerim(kurumId: string, gun: string | undefined, etkin = true) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'gorevlerim', gun ?? 'bugun'],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `gorevlerim${sorguDizgesi({ gun })}`), {
        sema: GorevlerimYanitSema,
      }),
  });
}

// --- Deneme -----------------------------------------------------------------------------------

export function useDenemeKurallari(kurumId: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'deneme-kurallari'],
    staleTime: 10 * 60_000,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `deneme-kurallari${sorguDizgesi({ aktif: 'true' })}`), {
        sema: DenemeKuraliListeYanitSema,
      }),
  });
}

export function useDenemeAyarlari(kurumId: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'deneme-ayarlari'],
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'deneme-ayarlari'), { sema: DenemeAyarlariSema }),
  });
}

export function useDenemeler(
  kurumId: string,
  filtre: { onay?: string; ogrenciId?: string; kural?: string },
  etkin = true,
) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...ogrenmeAnahtari(kurumId), 'denemeler'],
    yol: yol(kurumId, 'denemeler'),
    sema: DenemeListeYanitSema,
    sayfaBoyutu: 25,
    etkin,
    sorgu: {
      ...(filtre.onay ? { onay: filtre.onay } : {}),
      ...(filtre.ogrenciId ? { ogrenci_id: filtre.ogrenciId } : {}),
      ...(filtre.kural ? { kural: filtre.kural } : {}),
    },
  });
  return { ...sorgu, denemeler: sorgu.data?.pages.flatMap((s) => s.denemeler) ?? [] };
}

export function useDenemelerim(kurumId: string, kural: string) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...ogrenmeAnahtari(kurumId), 'denemelerim'],
    yol: yol(kurumId, 'denemelerim'),
    sema: DenemeListeYanitSema,
    sayfaBoyutu: 25,
    sorgu: kural ? { kural } : {},
  });
  return { ...sorgu, denemeler: sorgu.data?.pages.flatMap((s) => s.denemeler) ?? [] };
}

export function useGelisim(kurumId: string, ogrenciId: string, kural: string) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'gelisim', ogrenciId, kural],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: ogrenciId !== '' && kural !== '',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        yol(kurumId, `ogrenciler/${ogrenciId}/deneme-gelisim${sorguDizgesi({ kural, limit: 20 })}`),
        { sema: DenemeGelisimSema },
      ),
  });
}

export function useGrupOzeti(kurumId: string, grupId: string, kural: string, etkin: boolean) {
  return useQuery({
    queryKey: [...ogrenmeAnahtari(kurumId), 'grup-ozet', grupId, kural],
    // Baska bir kullanici (ogrenci/ogretmen) degistirmis olabilir: her acilista tazele.
    refetchOnMount: 'always',
    enabled: etkin && grupId !== '' && kural !== '',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `gruplar/${grupId}/deneme-ozet${sorguDizgesi({ kural })}`), {
        sema: DenemeGrupOzetSema,
      }),
  });
}
