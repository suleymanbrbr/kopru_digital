import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';

import type { ArsivSuzgeci, KuyrukSuzgeci, SoruSuzgeci } from '../api/soruTipleri';
import { type Gonderim } from '../yukleme/gonderim';
import { useAktif, useServisler } from './baglam';
import { useModulAcik } from './operasyon';

/**
 * "Soru sor" sorgulari. Anahtarlar uyelik kapsamli ve `['soru', ...]` ile baslar (gonderim
 * tamamlaninca tumu birden gecersiz kilinir). Modul (`soru_sor`) kapaliysa hicbiri calismaz.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

export function useSoruModulu(): boolean {
  return useModulAcik('soru_sor');
}

export function useOgrenciSoruAcik(): boolean {
  const aktif = useAktif();
  return useSoruModulu() && aktif?.uyelik.rol === 'ogrenci';
}

export function usePersonelSoruAcik(): boolean {
  const aktif = useAktif();
  return useSoruModulu() && !!aktif && aktif.uyelik.rol !== 'ogrenci';
}

export function useSoruKotasi() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOgrenciSoruAcik();
  return useQuery({
    queryKey: ['soru', uyelikId, 'kota'],
    queryFn: () => adaptorler.soru.kota(),
    enabled: !!uyelikId && acik,
    staleTime: 10_000,
  });
}

export function useSorularim(suzgec: SoruSuzgeci, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOgrenciSoruAcik();
  return useInfiniteQuery({
    queryKey: ['soru', uyelikId, 'sorularim', suzgec],
    queryFn: ({ pageParam }) => adaptorler.soru.sorularim(suzgec, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && acik && etkin,
    placeholderData: keepPreviousData,
  });
}

export function useSoru(id: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useSoruModulu();
  return useQuery({
    queryKey: ['soru', uyelikId, 'detay', id],
    queryFn: () => adaptorler.soru.soru(id),
    enabled: !!uyelikId && acik,
  });
}

export function useGelenSorular(suzgec: KuyrukSuzgeci, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = usePersonelSoruAcik();
  return useInfiniteQuery({
    queryKey: ['soru', uyelikId, 'gelen', suzgec],
    queryFn: ({ pageParam }) => adaptorler.soru.gelenSorular(suzgec, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && acik && etkin,
    placeholderData: keepPreviousData,
  });
}

export function useGelenSoruSayisi() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = usePersonelSoruAcik();
  return useQuery({
    queryKey: ['soru', uyelikId, 'gelen-sayi'],
    queryFn: () => adaptorler.soru.gelenSoruSayisi(),
    enabled: !!uyelikId && acik,
  });
}

export function useCevapladiklarim(suzgec: ArsivSuzgeci, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = usePersonelSoruAcik();
  return useInfiniteQuery({
    queryKey: ['soru', uyelikId, 'cevapladiklarim', suzgec],
    queryFn: ({ pageParam }) => adaptorler.soru.cevapladiklarim(suzgec, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && acik && etkin,
    placeholderData: keepPreviousData,
  });
}

export function useMusaitlik() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = usePersonelSoruAcik();
  return useQuery({
    queryKey: ['soru', uyelikId, 'musaitlik'],
    queryFn: () => adaptorler.soru.musaitlik(),
    enabled: !!uyelikId && acik,
  });
}

export function useMusaitlikAyarla() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (musait: boolean) => adaptorler.soru.musaitlikAyarla(musait),
    onSuccess: (d) => {
      qc.setQueryData(['soru', uyelikId, 'musaitlik'], d);
    },
  });
}

export function useAnladim(id: string) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adaptorler.soru.anladim(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soru'] }),
  });
}

export function useBildir(id: string) {
  const { adaptorler } = useServisler();
  return useMutation({
    mutationFn: (g: {
      neden: Parameters<typeof adaptorler.soru.bildir>[1];
      aciklama?: string;
    }) => adaptorler.soru.bildir(id, g.neden, g.aciklama),
  });
}

/** Etkin kapsamin gonderimleri (yeniden eskiye degil, olusturulma sirasiyla). */
export function useGonderimler(): readonly Gonderim[] {
  const { gonderim } = useServisler();
  const uyelikId = useUyelikId();
  const hepsi = useSyncExternalStore(
    (cb) => gonderim.abone(cb),
    () => gonderim.liste(),
  );
  return useMemo(() => hepsi.filter((g) => g.kapsam === uyelikId), [hepsi, uyelikId]);
}
