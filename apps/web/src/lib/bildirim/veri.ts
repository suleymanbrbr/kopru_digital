'use client';

import {
  BildirimAyarlariSema,
  BildirimKutuIslemYanitiSema,
  BildirimKutuListesiSema,
  BildirimOkunmamisSayisiSema,
  BildirimTercihListesiSema,
  BildirimTumunuOkuYanitiSema,
  type BildirimAyarlari,
  type BildirimKanal,
  type BildirimKategori,
  type BildirimKutuOgesi,
} from '@kopru/contracts';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';

import { ogeleriDegistir, sayiyiDegistir, type KutuDegisimi } from './onbellek';

import { bildirimIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

type KutuListesi = z.output<typeof BildirimKutuListesiSema>;
type TercihListesi = z.output<typeof BildirimTercihListesiSema>;

/** Tum bildirim onbellegi bu anahtarin altindadir (kurum basina). */
export const bildirimAnahtari = (kurumId: string) => ['bildirim', kurumId] as const;
const sayiAnahtari = (kurumId: string) => [...bildirimAnahtari(kurumId), 'sayi'] as const;
const sonAnahtari = (kurumId: string) => [...bildirimAnahtari(kurumId), 'son'] as const;
const kutuAnahtari = (kurumId: string) => [...bildirimAnahtari(kurumId), 'kutu'] as const;
const tercihAnahtari = (kurumId: string) => [...bildirimAnahtari(kurumId), 'tercihler'] as const;
const ayarAnahtari = (kurumId: string) => [...bildirimAnahtari(kurumId), 'ayarlar'] as const;

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;

/** Okunmamis sayisi yoklama araligi (ms); sekme odaklaninca da tazelenir. */
export const SAYI_YOKLAMA_MS = 60_000;
export const ZIL_LISTE_BOYUTU = 8;

// --- Okuma --------------------------------------------------------------------------------------

/** Zil rozeti: 60 sn'de bir ve sekme odaklaninca tazelenir. Hata sessizdir (rozet gizlenir). */
export function useOkunmamisSayisi(kurumId: string) {
  return useQuery({
    queryKey: sayiAnahtari(kurumId),
    staleTime: 15_000,
    refetchInterval: SAYI_YOKLAMA_MS,
    refetchOnWindowFocus: 'always',
    retry: yenidenDene,
    queryFn: () =>
      bildirimIstek(yol(kurumId, 'kutu/okunmamis-sayisi'), { sema: BildirimOkunmamisSayisiSema }),
  });
}

/** Zilin acilir listesi: son bildirimler (okunmus olanlar dahil). */
export function useSonBildirimler(kurumId: string, etkin: boolean) {
  return useQuery({
    queryKey: sonAnahtari(kurumId),
    enabled: etkin,
    staleTime: 0,
    retry: yenidenDene,
    queryFn: () =>
      bildirimIstek(yol(kurumId, `kutu?limit=${String(ZIL_LISTE_BOYUTU)}`), {
        sema: BildirimKutuListesiSema,
      }),
  });
}

/** Bildirimler sayfasi: imleçli sonsuz liste; `yalnizOkunmamis` sunucuda suzulur. */
export function useKutu(kurumId: string, yalnizOkunmamis: boolean) {
  return useSayfaliSorgu({
    anahtar: kutuAnahtari(kurumId),
    yol: yol(kurumId, 'kutu'),
    sema: BildirimKutuListesiSema,
    sorgu: { okunmamis: yalnizOkunmamis ? 'true' : undefined },
    servis: 'bildirim',
    sayfaBoyutu: 20,
  });
}

export function useTercihler(kurumId: string) {
  return useQuery({
    queryKey: tercihAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () => bildirimIstek(yol(kurumId, 'tercihler'), { sema: BildirimTercihListesiSema }),
  });
}

export function useAyarlar(kurumId: string) {
  return useQuery({
    queryKey: ayarAnahtari(kurumId),
    retry: yenidenDene,
    queryFn: () => bildirimIstek(yol(kurumId, 'ayarlar'), { sema: BildirimAyarlariSema }),
  });
}

// --- Gelen kutusu islemleri (iyimser) -------------------------------------------------------------

type Anlik = [readonly unknown[], unknown][];

function ogelerOku(veri: unknown): BildirimKutuOgesi[] {
  if (veri && typeof veri === 'object') {
    if ('pages' in veri) {
      return (veri as InfiniteData<KutuListesi>).pages.flatMap((s) => s.ogeler);
    }
    if ('ogeler' in veri) return (veri as KutuListesi).ogeler;
  }
  return [];
}

/** Degisimi tum kutu onbelleklerine uygular; geri alma icin onceki degerleri dondurur. */
export function kutuDegisimiUygula(qc: QueryClient, kurumId: string, degisim: KutuDegisimi): Anlik {
  const anlik: Anlik = qc.getQueriesData({ queryKey: bildirimAnahtari(kurumId) });
  const okunmamisMiydi =
    degisim.tur !== 'tumunuOku' &&
    anlik.some(([, veri]) =>
      ogelerOku(veri).some((o) => o.id === degisim.id && o.okundu_at === null),
    );
  for (const [anahtar, veri] of anlik) {
    const tur = anahtar[2];
    if (tur === 'kutu' && veri && typeof veri === 'object' && 'pages' in veri) {
      const sorgu = anahtar[3] as { okunmamis?: string } | undefined;
      const yalnizOkunmamis = sorgu?.okunmamis === 'true';
      const bicim = veri as InfiniteData<KutuListesi>;
      qc.setQueryData(anahtar, {
        ...bicim,
        pages: bicim.pages.map((s) => ({
          ...s,
          ogeler: ogeleriDegistir(s.ogeler, degisim, yalnizOkunmamis),
        })),
      });
    } else if (tur === 'son' && veri && typeof veri === 'object' && 'ogeler' in veri) {
      const bicim = veri as KutuListesi;
      qc.setQueryData(anahtar, { ...bicim, ogeler: ogeleriDegistir(bicim.ogeler, degisim, false) });
    } else if (tur === 'sayi' && veri && typeof veri === 'object' && 'okunmamis' in veri) {
      const bicim = veri as { okunmamis: number };
      qc.setQueryData(anahtar, {
        okunmamis: sayiyiDegistir(bicim.okunmamis, degisim, okunmamisMiydi),
      });
    }
  }
  return anlik;
}

function geriAl(qc: QueryClient, anlik: Anlik | undefined) {
  for (const [anahtar, veri] of anlik ?? []) qc.setQueryData(anahtar, veri);
}

function useKutuIslemi<V>(
  kurumId: string,
  kur: (v: V) => { degisim: KutuDegisimi; istek: () => Promise<unknown> },
) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, V, { anlik: Anlik }>({
    mutationFn: (v) => kur(v).istek(),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: bildirimAnahtari(kurumId) });
      return { anlik: kutuDegisimiUygula(qc, kurumId, kur(v).degisim) };
    },
    onError: (_hata, _v, baglam) => {
      geriAl(qc, baglam?.anlik);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: bildirimAnahtari(kurumId) }),
  });
}

export function useOkunduIsaretle(kurumId: string) {
  return useKutuIslemi<string>(kurumId, (id) => ({
    degisim: { tur: 'okundu', id, zaman: new Date().toISOString() },
    istek: () =>
      bildirimIstek(yol(kurumId, `kutu/${id}/okundu`), {
        yontem: 'POST',
        sema: BildirimKutuIslemYanitiSema,
      }),
  }));
}

export function useArsivle(kurumId: string) {
  return useKutuIslemi<string>(kurumId, (id) => ({
    degisim: { tur: 'arsivle', id },
    istek: () =>
      bildirimIstek(yol(kurumId, `kutu/${id}/arsivle`), {
        yontem: 'POST',
        sema: BildirimKutuIslemYanitiSema,
      }),
  }));
}

export function useTumunuOku(kurumId: string) {
  return useKutuIslemi<undefined>(kurumId, () => ({
    degisim: { tur: 'tumunuOku', zaman: new Date().toISOString() },
    istek: () =>
      bildirimIstek(yol(kurumId, 'kutu/tumunu-oku'), {
        yontem: 'POST',
        sema: BildirimTumunuOkuYanitiSema,
      }),
  }));
}

// --- Tercihler ve ayarlar (iyimser) ----------------------------------------------------------------

export interface TercihDegisikligi {
  kategori: BildirimKategori;
  kanal: BildirimKanal;
  acik: boolean;
}

export function useTercihGuncelle(kurumId: string) {
  const qc = useQueryClient();
  const anahtar = tercihAnahtari(kurumId);
  return useMutation<
    TercihListesi,
    Error,
    TercihDegisikligi,
    { onceki: TercihListesi | undefined }
  >({
    mutationKey: [...anahtar, 'yaz'],
    mutationFn: (d) =>
      bildirimIstek(yol(kurumId, 'tercihler'), {
        yontem: 'PUT',
        govde: { tercihler: [d] },
        sema: BildirimTercihListesiSema,
      }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<TercihListesi>(anahtar);
      if (onceki) {
        qc.setQueryData<TercihListesi>(anahtar, {
          tercihler: onceki.tercihler.map((t) =>
            t.kategori === d.kategori && t.kanal === d.kanal ? { ...t, acik: d.acik } : t,
          ),
        });
      }
      return { onceki };
    },
    onError: (_h, d, baglam) => {
      // Yalniz bu hucreyi geri al (baska hucrelerin bekleyen degisikligini ezme).
      const simdiki = qc.getQueryData<TercihListesi>(anahtar);
      const eski = baglam?.onceki?.tercihler.find(
        (t) => t.kategori === d.kategori && t.kanal === d.kanal,
      );
      if (simdiki && eski) {
        qc.setQueryData<TercihListesi>(anahtar, {
          tercihler: simdiki.tercihler.map((t) =>
            t.kategori === d.kategori && t.kanal === d.kanal ? { ...t, acik: eski.acik } : t,
          ),
        });
      }
    },
    onSettled: () => {
      // Son bekleyen yazimdan sonra sunucudaki gercek matrisle esitle.
      if (qc.isMutating({ mutationKey: [...anahtar, 'yaz'] }) <= 1) {
        void qc.invalidateQueries({ queryKey: anahtar });
      }
    },
  });
}

export function useAyarlarGuncelle(kurumId: string) {
  const qc = useQueryClient();
  const anahtar = ayarAnahtari(kurumId);
  return useMutation<
    BildirimAyarlari,
    Error,
    Partial<BildirimAyarlari>,
    { onceki: BildirimAyarlari | undefined }
  >({
    mutationKey: [...anahtar, 'yaz'],
    mutationFn: (d) =>
      bildirimIstek(yol(kurumId, 'ayarlar'), {
        yontem: 'PUT',
        govde: d,
        sema: BildirimAyarlariSema,
      }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<BildirimAyarlari>(anahtar);
      if (onceki) qc.setQueryData<BildirimAyarlari>(anahtar, { ...onceki, ...d });
      return { onceki };
    },
    onError: (_h, _d, baglam) => {
      if (baglam?.onceki) qc.setQueryData(anahtar, baglam.onceki);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: [...anahtar, 'yaz'] }) <= 1) {
        void qc.invalidateQueries({ queryKey: anahtar });
      }
    },
  });
}
