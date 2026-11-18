'use client';

import {
  AylikOzetSema,
  DersRaporOzetSema,
  FinansOgrenciListeYanitSema,
  HesapRaporOgrencilerSema,
  HesapRaporOzetSema,
  OgrenmeRaporOzetSema,
  RaporOdevListeSema,
  RaporOgrenciOraniListeSema,
  RaporSoruListeSema,
  type RaporDonemi,
} from '@kopru/contracts';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { dersIstek, finansIstek, hesapIstek, ogrenmeIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';

export const raporAnahtari = (kurumId: string) => ['rapor', kurumId] as const;

/** Panel gostergeleri ve altindaki liste turleri. */
export type Gosterge = 'aktif' | 'devam' | 'anladim' | 'odev' | 'plan' | 'soru';

/** Gostergeyi hesaplayan modul ve uc adi (`/rapor/<ad>`). */
export const GOSTERGE_UCLARI = {
  aktif: { servis: 'hesap', ad: 'ogrenciler', sema: HesapRaporOgrencilerSema },
  devam: { servis: 'ders', ad: 'devam', sema: RaporOgrenciOraniListeSema },
  anladim: { servis: 'ders', ad: 'anladim', sema: RaporOgrenciOraniListeSema },
  odev: { servis: 'ogrenme', ad: 'odev', sema: RaporOdevListeSema },
  plan: { servis: 'ogrenme', ad: 'plan', sema: RaporOgrenciOraniListeSema },
  soru: { servis: 'ogrenme', ad: 'soru', sema: RaporSoruListeSema },
} as const;

const istekci = { hesap: hesapIstek, ders: dersIstek, ogrenme: ogrenmeIstek } as const;

/**
 * Panelin uc ozeti: her modul kendi gostergesini hesaplar, web ucunu birden (paralel) ceker.
 * Biri hata verirse digerleri yine gosterilir (kart bazinda hata).
 */
export function useRaporOzetleri(kurumId: string, donem: RaporDonemi) {
  const ortak = { retry: yenidenDene, staleTime: 30_000 } as const;
  const sorgu = sorguDizgesi({ donem });
  const hesap = useQuery({
    ...ortak,
    queryKey: [...raporAnahtari(kurumId), 'hesap', donem],
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/rapor/ozet${sorgu}`, { sema: HesapRaporOzetSema }),
  });
  const ders = useQuery({
    ...ortak,
    queryKey: [...raporAnahtari(kurumId), 'ders', donem],
    queryFn: () => dersIstek(`kurumlar/${kurumId}/rapor/ozet${sorgu}`, { sema: DersRaporOzetSema }),
  });
  const ogrenme = useQuery({
    ...ortak,
    queryKey: [...raporAnahtari(kurumId), 'ogrenme', donem],
    queryFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/rapor/ozet${sorgu}`, { sema: OgrenmeRaporOzetSema }),
  });
  return { hesap, ders, ogrenme };
}

export interface ListeSuzgeci {
  grupId?: string | undefined;
  ogretmenId?: string | undefined;
}

export type RaporListeYaniti<G extends Gosterge> = z.infer<(typeof GOSTERGE_UCLARI)[G]['sema']>;

/** Bir sayinin altindaki liste (en cok 200 satir); gosterge hangi modulun ucunu cagiracagini belirler. */
export function useRaporListe<G extends Gosterge>(
  kurumId: string,
  gosterge: G,
  donem: RaporDonemi,
  suzgec: ListeSuzgeci,
) {
  const uc = GOSTERGE_UCLARI[gosterge];
  return useQuery({
    queryKey: [
      ...raporAnahtari(kurumId),
      'liste',
      gosterge,
      donem,
      suzgec.grupId ?? null,
      suzgec.ogretmenId ?? null,
    ],
    retry: yenidenDene,
    queryFn: async (): Promise<RaporListeYaniti<G>> =>
      (await istekci[uc.servis](
        `kurumlar/${kurumId}/rapor/${uc.ad}${sorguDizgesi({
          donem,
          grup_id: suzgec.grupId,
          ogretmen_id: suzgec.ogretmenId,
        })}`,
        { sema: uc.sema },
      )) as RaporListeYaniti<G>,
  });
}

/** Finans ozeti (yalniz yetkili): bu ayin tahsilati ve borclu ogrencilerin acik bakiyesi. */
export function useFinansOzeti(kurumId: string, ay: string, etkin: boolean) {
  const aylik = useQuery({
    queryKey: [...raporAnahtari(kurumId), 'finans-ay', ay],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ozet/aylik${sorguDizgesi({ ay })}`, {
        sema: AylikOzetSema,
      }),
  });
  const borclular = useQuery({
    queryKey: [...raporAnahtari(kurumId), 'finans-borclu'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ogrenciler${sorguDizgesi({ borclu: 'true', limit: 200 })}`, {
        sema: FinansOgrenciListeYanitSema,
      }),
  });
  return { aylik, borclular };
}

/** Excel dosyasinin yolu (ogrenme modulu, uc modulun sayilarini birlestirir). */
export const raporExcelYolu = (kurumId: string, donem: RaporDonemi) =>
  `kurumlar/${kurumId}/rapor/disa-aktar${sorguDizgesi({ donem })}`;
