import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import type {
  BildirimAyarlari,
  BildirimKutuSayfasi,
  BildirimTercihGuncellemesi,
  BildirimTercihi,
} from '../api/bildirimTipleri';
import { useAktif, useServisler } from './baglam';

/**
 * Bildirim sorgulari. Anahtarlar uyelik kapsamlidir (`['bildirim', uyelikId, ...]`); yonetici
 * (`degisti`) ve yazimlar `['bildirim']` on ekini gecersiz kilar. Sorgu onbellegi kalici oldugundan
 * cevrimdisiyken son kutu listesi gosterilir.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

const SAYFA = 20;

export function useBildirimKutusu() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useInfiniteQuery({
    queryKey: ['bildirim', uyelikId, 'kutu'],
    queryFn: ({ pageParam }) =>
      adaptorler.bildirim.kutu({ limit: SAYFA, ...(pageParam ? { imlec: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (son: BildirimKutuSayfasi) => son.sonrakiImlec ?? undefined,
    enabled: !!uyelikId,
    staleTime: 0,
  });
}

/**
 * Etkin kurumdaki okunmamis sayisi (zil rozeti). Deger degisince uygulama simgesi rozeti de
 * guncellenir (sunucu push'ta tum kurumlarin toplamini gonderir; acikken etkin kurum esas alinir).
 */
export function useOkunmamisSayisi(rozetiGuncelle = false) {
  const { adaptorler, bildirim } = useServisler();
  const uyelikId = useUyelikId();
  const sorgu = useQuery({
    queryKey: ['bildirim', uyelikId, 'okunmamis'],
    queryFn: () => adaptorler.bildirim.okunmamisSayisi(),
    enabled: !!uyelikId,
    staleTime: 15_000,
  });
  const sayi = sorgu.data;
  useEffect(() => {
    if (rozetiGuncelle && sayi !== undefined) void bildirim.rozetAyarla(sayi);
  }, [rozetiGuncelle, sayi, bildirim]);
  return sorgu;
}

/** Okundu, tumunu oku ve arsivle: basarida kutu ve sayac tazelenir. */
export function useBildirimIslemleri() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  const yenile = () => qc.invalidateQueries({ queryKey: ['bildirim', uyelikId] });
  const okundu = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.bildirim.okundu(id),
    onSuccess: yenile,
  });
  const tumunuOku = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.bildirim.tumunuOku(),
    onSuccess: yenile,
  });
  const arsivle = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.bildirim.arsivle(id),
    onMutate: (id) => {
      // Satir hemen kaybolur; hata olursa liste yeniden okunur.
      qc.setQueryData<InfiniteData<BildirimKutuSayfasi, string>>(
        ['bildirim', uyelikId, 'kutu'],
        (d) =>
          d && {
            ...d,
            pages: d.pages.map((s) => ({ ...s, ogeler: s.ogeler.filter((o) => o.id !== id) })),
          },
      );
    },
    onSettled: yenile,
  });
  return { okundu, tumunuOku, arsivle };
}

export function useBildirimTercihleri() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['bildirim', uyelikId, 'tercihler'],
    queryFn: () => adaptorler.bildirim.tercihler(),
    enabled: !!uyelikId,
  });
}

export function useBildirimAyarlari() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['bildirim', uyelikId, 'ayarlar'],
    queryFn: () => adaptorler.bildirim.ayarlar(),
    enabled: !!uyelikId,
  });
}

/** Tercih ve ayar yazimlari iyimser guncellenir; hatada onceki deger geri yuklenir. */
export function useBildirimTercihYazimi() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  const tercihAnahtar = ['bildirim', uyelikId, 'tercihler'] as const;
  const ayarAnahtar = ['bildirim', uyelikId, 'ayarlar'] as const;

  const tercih = useMutation({
    networkMode: 'always',
    mutationFn: (g: BildirimTercihGuncellemesi[]) => adaptorler.bildirim.tercihGuncelle(g),
    onMutate: async (g) => {
      await qc.cancelQueries({ queryKey: tercihAnahtar });
      const onceki = qc.getQueryData<BildirimTercihi[]>(tercihAnahtar);
      qc.setQueryData<BildirimTercihi[]>(tercihAnahtar, (liste) =>
        liste?.map((h) => {
          const y = g.find((x) => x.kategori === h.kategori && x.kanal === h.kanal);
          return y ? { ...h, acik: y.acik } : h;
        }),
      );
      return { onceki };
    },
    onError: (_e, _g, ctx) => {
      if (ctx?.onceki) qc.setQueryData(tercihAnahtar, ctx.onceki);
    },
    onSuccess: (liste) => {
      qc.setQueryData(tercihAnahtar, liste);
    },
  });

  const ayar = useMutation({
    networkMode: 'always',
    mutationFn: (g: Partial<BildirimAyarlari>) => adaptorler.bildirim.ayarGuncelle(g),
    onMutate: async (g) => {
      await qc.cancelQueries({ queryKey: ayarAnahtar });
      const onceki = qc.getQueryData<BildirimAyarlari>(ayarAnahtar);
      qc.setQueryData<BildirimAyarlari>(ayarAnahtar, (a) => a && { ...a, ...g });
      return { onceki };
    },
    onError: (_e, _g, ctx) => {
      if (ctx?.onceki) qc.setQueryData(ayarAnahtar, ctx.onceki);
    },
    onSuccess: (a) => {
      qc.setQueryData(ayarAnahtar, a);
    },
  });

  return { tercih, ayar };
}
