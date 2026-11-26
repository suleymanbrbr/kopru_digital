'use client';

import {
  AnalizYanitiSema,
  GorevVerYanitiSema,
  GunlukSoruKaydiSema,
  GunlukSoruListeYanitiSema,
  HaftalikOzetSema,
  HucreDetaySema,
  KaynakKitapDetaySema,
  KaynakKitapListeYanitiSema,
  KaynakKitapSema,
  SinifAnaliziSema,
  SonKullanilanlarSema,
  type GunlukSoruGuncelleGirdi,
  type GunlukSoruOlusturGirdi,
} from '@kopru/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import type { AnalizDonemi } from '@/lib/gunluk-soru/analiz';
import { ogrenmeIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { ogrenmeAnahtari, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;
const anahtar = (kurumId: string, ...parca: readonly unknown[]) =>
  [...ogrenmeAnahtari(kurumId), 'gunluk-soru', ...parca] as const;

// --- Ogrenci: kayitlar ----------------------------------------------------------------------

export function useSonKullanilanlar(kurumId: string) {
  return useQuery({
    queryKey: anahtar(kurumId, 'son-kullanilanlar'),
    staleTime: 30_000,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, 'gunluk-soru/son-kullanilanlar'), { sema: SonKullanilanlarSema }),
  });
}

export function useKayitlarim(kurumId: string, etkin = true) {
  return useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: anahtar(kurumId, 'kayitlar'),
    yol: yol(kurumId, 'gunluk-soru/kayitlar'),
    sema: GunlukSoruListeYanitiSema,
    sayfaBoyutu: 20,
    etkin,
  });
}

export function useKayitOlustur(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: GunlukSoruOlusturGirdi) =>
      ogrenmeIstek(yol(kurumId, 'gunluk-soru/kayitlar'), {
        yontem: 'POST',
        govde,
        sema: GunlukSoruKaydiSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useKayitGuncelle(kurumId: string, kayitId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: GunlukSoruGuncelleGirdi) =>
      ogrenmeIstek(yol(kurumId, `gunluk-soru/kayitlar/${kayitId}`), {
        yontem: 'PATCH',
        govde,
        sema: GunlukSoruKaydiSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useKayitSil(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (kayitId: string) =>
      ogrenmeIstek(yol(kurumId, `gunluk-soru/kayitlar/${kayitId}`), { yontem: 'DELETE' }),
    onSuccess: () => yenile(),
  });
}

// --- Analiz (ogrenci kendi: ogrenciId yok; personel: ogrenciId) -----------------------------------

export interface AnalizSorgusu {
  brans: string;
  donem: AnalizDonemi;
}

const analizYolu = (kurumId: string, ogrenciId: string | undefined, son: string) =>
  ogrenciId
    ? yol(kurumId, `ogrenciler/${ogrenciId}/gunluk-soru/${son}`)
    : yol(kurumId, `gunluk-soru/${son}`);

export function useAnaliz(
  kurumId: string,
  ogrenciId: string | undefined,
  { brans, donem }: AnalizSorgusu,
  etkin = true,
) {
  return useQuery({
    queryKey: anahtar(kurumId, 'analiz', ogrenciId ?? 'ben', brans, donem),
    enabled: etkin && brans !== '',
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        `${analizYolu(kurumId, ogrenciId, 'analiz')}${sorguDizgesi({ brans_kodu: brans, donem })}`,
        { sema: AnalizYanitiSema },
      ),
  });
}

export function useHucreDetayi(
  kurumId: string,
  ogrenciId: string | undefined,
  s: (AnalizSorgusu & { konuId: string; zorluk: string | undefined }) | null,
) {
  return useQuery({
    queryKey: anahtar(kurumId, 'hucre', ogrenciId ?? 'ben', s),
    enabled: s !== null,
    retry: yenidenDene,
    // Fotograf adresleri sureli: acildikca yeniden alinir.
    staleTime: 0,
    gcTime: 0,
    queryFn: () => {
      if (!s) throw new Error('hucre secili degil');
      return ogrenmeIstek(
        `${analizYolu(kurumId, ogrenciId, 'analiz/hucre')}${sorguDizgesi({
          brans_kodu: s.brans,
          konu_id: s.konuId,
          zorluk: s.zorluk,
          donem: s.donem,
        })}`,
        { sema: HucreDetaySema },
      );
    },
  });
}

export function useHaftalikOzet(kurumId: string, ogrenciId: string) {
  return useQuery({
    queryKey: anahtar(kurumId, 'haftalik-ozet', ogrenciId),
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/gunluk-soru/haftalik-ozet`), {
        sema: HaftalikOzetSema,
      }),
  });
}

export function useSinifAnalizi(kurumId: string, grupId: string, s: AnalizSorgusu) {
  return useQuery({
    queryKey: anahtar(kurumId, 'sinif', grupId, s.brans, s.donem),
    enabled: s.brans !== '',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        yol(
          kurumId,
          `gunluk-soru/sinif-analizi${sorguDizgesi({
            grup_id: grupId,
            brans_kodu: s.brans,
            donem: s.donem,
          })}`,
        ),
        { sema: SinifAnaliziSema },
      ),
  });
}

export interface GorevVerGovdesi {
  tur: 'plan_gorevi' | 'odev';
  brans_kodu: string;
  konu_id: string;
  zorluk: 'kolay' | 'orta' | 'zor';
  soru_sayisi: number;
  gun?: string;
  son_teslim_at?: string;
}

export function useGorevVer(kurumId: string, ogrenciId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: GorevVerGovdesi) =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/gunluk-soru/gorev-ver`), {
        yontem: 'POST',
        govde,
        sema: GorevVerYanitiSema,
      }),
    onSuccess: () => yenile(),
  });
}

// --- Kaynak kitaplar --------------------------------------------------------------------------

export function useKaynakKitaplar(
  kurumId: string,
  { brans, pasifler, ogrenciId }: { brans?: string; pasifler?: boolean; ogrenciId?: string } = {},
  etkin = true,
) {
  return useQuery({
    queryKey: anahtar(kurumId, 'kitaplar', brans ?? '', pasifler ?? false, ogrenciId ?? ''),
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        yol(
          kurumId,
          `kaynak-kitaplar${sorguDizgesi({
            brans_kodu: brans,
            pasifler: pasifler ? 'true' : undefined,
            ogrenci_id: ogrenciId,
          })}`,
        ),
        { sema: KaynakKitapListeYanitiSema },
      ),
  });
}

export function useKaynakKitapDetayi(kurumId: string, kitapId: string | null, ogrenciId?: string) {
  return useQuery({
    queryKey: anahtar(kurumId, 'kitap', kitapId ?? '', ogrenciId ?? ''),
    enabled: kitapId !== null,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        yol(kurumId, `kaynak-kitaplar/${kitapId ?? ''}${sorguDizgesi({ ogrenci_id: ogrenciId })}`),
        { sema: KaynakKitapDetaySema },
      ),
  });
}

export interface TestGirdisi {
  ad: string;
  soru_sayisi: number;
}

export function useKitapOlustur(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: {
      ad: string;
      yayinevi?: string;
      brans_kodu: string;
      testler: TestGirdisi[];
    }) =>
      ogrenmeIstek(yol(kurumId, 'kaynak-kitaplar'), {
        yontem: 'POST',
        govde,
        sema: KaynakKitapDetaySema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useKitapGuncelle(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: ({
      id,
      ...govde
    }: {
      id: string;
      ad?: string;
      yayinevi?: string | null;
      aktif?: boolean;
      surum?: number;
    }) =>
      ogrenmeIstek(yol(kurumId, `kaynak-kitaplar/${id}`), {
        yontem: 'PATCH',
        govde,
        sema: KaynakKitapSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useTestEkle(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: ({ kitapId, testler }: { kitapId: string; testler: TestGirdisi[] }) =>
      ogrenmeIstek(yol(kurumId, `kaynak-kitaplar/${kitapId}/testler`), {
        yontem: 'POST',
        govde: { testler },
        sema: KaynakKitapDetaySema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useTestSil(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: ({ kitapId, testId }: { kitapId: string; testId: string }) =>
      ogrenmeIstek(yol(kurumId, `kaynak-kitaplar/${kitapId}/testler/${testId}`), {
        yontem: 'DELETE',
      }),
    onSuccess: () => yenile(),
  });
}

export type Kayit = z.output<typeof GunlukSoruKaydiSema>;
