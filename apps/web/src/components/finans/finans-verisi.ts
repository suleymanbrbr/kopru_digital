'use client';

import {
  FinansOgrenciListeYanitSema,
  OgrenciFinansYanitSema,
  PaketListeYanitSema,
  TahsilatListeYanitSema,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { finansIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

/** Tum finans onbellegi bu anahtarin altindadir; yazimlardan sonra topluca gecersiz kilinir. */
export const finansAnahtari = (kurumId: string) => ['finans', kurumId] as const;

export function useFinansYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: finansAnahtari(kurumId) });
}

export function useFinansOgrencileri({
  kurumId,
  q,
  borclu,
  dusukKredi,
}: {
  kurumId: string;
  q: string;
  borclu: boolean;
  dusukKredi: boolean;
}) {
  const sorgu = useSayfaliSorgu({
    servis: 'finans',
    anahtar: [...finansAnahtari(kurumId), 'ogrenciler'],
    yol: `kurumlar/${kurumId}/ogrenciler`,
    sema: FinansOgrenciListeYanitSema,
    sayfaBoyutu: 50,
    sorgu: {
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(borclu ? { borclu: 'true' } : {}),
      ...(dusukKredi ? { dusuk_kredi: 'true' } : {}),
    },
  });
  return {
    ...sorgu,
    ogrenciler: sorgu.data?.pages.flatMap((s) => s.ogrenciler) ?? [],
    esik: sorgu.data?.pages[0]?.dusuk_kredi_esigi ?? 2,
  };
}

export function useOgrenciKarti(kurumId: string, ogrenciId: string) {
  return useQuery({
    queryKey: [...finansAnahtari(kurumId), 'kart', ogrenciId],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ogrenciler/${ogrenciId}/finans`, {
        sema: OgrenciFinansYanitSema,
      }),
  });
}

/** Ogrenci karti yaniti ad tasimaz; ad, finans ogrenci listesinden (en cok 1000 kayit) bulunur. */
export function useOgrenciAdi(kurumId: string, ogrenciId: string): string | null {
  const q = useQuery({
    queryKey: [...finansAnahtari(kurumId), 'ad', ogrenciId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let imlec: string | undefined;
      for (let sayfa = 0; sayfa < 5; sayfa += 1) {
        const yanit = await finansIstek(
          `kurumlar/${kurumId}/ogrenciler${sorguDizgesi({ limit: 200, imlec })}`,
          { sema: FinansOgrenciListeYanitSema },
        );
        const bulunan = yanit.ogrenciler.find((o) => o.ogrenci_id === ogrenciId);
        if (bulunan) return bulunan.gorunen_ad ?? '';
        if (!yanit.sonraki_imlec) break;
        imlec = yanit.sonraki_imlec;
      }
      return '';
    },
  });
  return q.data ? q.data : null;
}

export function usePaketler(kurumId: string, durum: 'aktif' | 'hepsi' = 'aktif', etkin = true) {
  return useQuery({
    queryKey: [...finansAnahtari(kurumId), 'paketler', durum],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/paketler${sorguDizgesi({ durum, limit: 200 })}`, {
        sema: PaketListeYanitSema,
      }),
  });
}

export function useOgrenciOdemeleri(kurumId: string, ogrenciId: string) {
  return useQuery({
    queryKey: [...finansAnahtari(kurumId), 'odemeler', ogrenciId],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(
        `kurumlar/${kurumId}/tahsilatlar${sorguDizgesi({ ogrenci_id: ogrenciId, limit: 10 })}`,
        { sema: TahsilatListeYanitSema },
      ),
  });
}
