import type { MutationOptions, QueryClient } from '@tanstack/react-query';

import type { HesapAdapter } from '../api/adaptorler';
import type { GrupKatilimIstegi, SinifBekleyenleri } from '../api/tipler';

export type KatilimKarari = 'onayla' | 'reddet';

export interface KararGirdisi {
  grupId: string;
  istekId: string;
  karar: KatilimKarari;
}

interface GeriAlma {
  grupId: string;
  istek: GrupKatilimIstegi | undefined;
}

export const sinifBekleyenleriAnahtari = (uyelikId: string | undefined) =>
  ['sinif-bekleyenleri', uyelikId] as const;

function sirala(l: GrupKatilimIstegi[]): GrupKatilimIstegi[] {
  return [...l].sort((a, b) => a.olusturma.localeCompare(b.olusturma));
}

/**
 * Onay/red icin iyimser guncelleme: istek listeden hemen kalkar; hata olursa YALNIZCA o istek
 * geri konur (birden cok karar ayni anda ucustayken biri basarisiz olunca digerinin sonucu
 * bozulmaz). Her durumda liste sunucudan tazelenir (ornegin `istek_beklemiyor` 409'u).
 */
export function katilimKarariSecenekleri(
  qc: QueryClient,
  hesap: HesapAdapter,
  anahtar: readonly unknown[],
): MutationOptions<void, Error, KararGirdisi, GeriAlma> {
  return {
    // Cevrimdisi korumasi adaptorde; mutasyon bekletilmez, hata hemen gorunur.
    networkMode: 'always',
    mutationFn: ({ grupId, istekId, karar }) =>
      karar === 'onayla'
        ? hesap.katilimIstegiOnayla(grupId, istekId)
        : hesap.katilimIstegiReddet(grupId, istekId),
    onMutate: async ({ grupId, istekId }) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<SinifBekleyenleri[]>(anahtar);
      const istek = onceki
        ?.find((g) => g.grup.id === grupId)
        ?.istekler.find((i) => i.id === istekId);
      qc.setQueryData<SinifBekleyenleri[]>(anahtar, (liste) =>
        liste?.map((g) =>
          g.grup.id === grupId ? { ...g, istekler: g.istekler.filter((i) => i.id !== istekId) } : g,
        ),
      );
      return { grupId, istek };
    },
    onError: (_hata, _girdi, geriAlma) => {
      const istek = geriAlma?.istek;
      if (!istek) return;
      qc.setQueryData<SinifBekleyenleri[]>(anahtar, (liste) =>
        liste?.map((g) =>
          g.grup.id === geriAlma.grupId && !g.istekler.some((i) => i.id === istek.id)
            ? { ...g, istekler: sirala([...g.istekler, istek]) }
            : g,
        ),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: anahtar }),
  };
}
