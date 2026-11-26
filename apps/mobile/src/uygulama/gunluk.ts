import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';

import type {
  AnalizSorgusu,
  GorevVerGirdisi,
  GunlukKayitGuncelleGirdisi,
  GunlukKayitSorgusu,
  HucreSorgusu,
} from '../api/gunlukSoruTipleri';
import type { Gonderim } from '../yukleme/gonderim';
import { useAktif, useServisler } from './baglam';

/**
 * Gunluk soru takibi sorgulari. Anahtarlar uyelik kapsamli ve `['gunluk', ...]` ile baslar
 * (gonderim tamamlaninca ya da duzeltme/silmede tumu birden gecersiz kilinir). Ogrenci kendi
 * kayitlarini ve (oneri OLMAYAN) analizini, personel ogrenci analizini okur.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

export function useOgrenciMi(): boolean {
  return useAktif()?.uyelik.rol === 'ogrenci';
}

export function useSonKullanilanlar() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const ogrenci = useOgrenciMi();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'son-kullanilanlar'],
    queryFn: () => adaptorler.gunlukSoru.sonKullanilanlar(),
    enabled: !!uyelikId && ogrenci,
    staleTime: 60_000,
  });
}

export function useGunlukKayitlarim(sorgu: GunlukKayitSorgusu, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const ogrenci = useOgrenciMi();
  return useInfiniteQuery({
    queryKey: ['gunluk', uyelikId, 'kayitlar', sorgu],
    queryFn: ({ pageParam }) => adaptorler.gunlukSoru.kayitlarim(sorgu, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && ogrenci && etkin,
    placeholderData: keepPreviousData,
  });
}

export function useKaynakKitaplar(bransKodu: string | undefined, ogrenciId?: string, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'kitaplar', bransKodu ?? null, ogrenciId ?? null],
    queryFn: () =>
      adaptorler.gunlukSoru.kaynakKitaplar({
        ...(bransKodu ? { bransKodu } : {}),
        ...(ogrenciId ? { ogrenciId } : {}),
      }),
    enabled: !!uyelikId && etkin,
    staleTime: 5 * 60_000,
  });
}

export function useKaynakKitap(kitapId: string | null, ogrenciId?: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'kitap', kitapId, ogrenciId ?? null],
    queryFn: () => adaptorler.gunlukSoru.kaynakKitap(kitapId ?? '', ogrenciId),
    enabled: !!uyelikId && !!kitapId,
    staleTime: 60_000,
  });
}

/** Ogrenci kendi analizi (`ogrenciId` yok) ya da personelin ogrenci analizi. */
export function useGunlukAnaliz(sorgu: AnalizSorgusu | null, ogrenciId?: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'analiz', ogrenciId ?? 'ben', sorgu],
    queryFn: sorgu ? () => adaptorler.gunlukSoru.analiz(sorgu, ogrenciId) : skipToken,
    enabled: !!uyelikId && !!sorgu,
    placeholderData: keepPreviousData,
  });
}

export function useHucreDetayi(sorgu: HucreSorgusu | null, ogrenciId?: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'hucre', ogrenciId ?? 'ben', sorgu],
    queryFn: sorgu ? () => adaptorler.gunlukSoru.hucre(sorgu, ogrenciId) : skipToken,
    enabled: !!uyelikId && !!sorgu,
  });
}

export function useHaftalikOzet(ogrenciId: string, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['gunluk', uyelikId, 'haftalik-ozet', ogrenciId],
    queryFn: () => adaptorler.gunlukSoru.haftalikOzet(ogrenciId),
    enabled: !!uyelikId && !!ogrenciId && etkin,
  });
}

export function useKayitDuzelt() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (v: { id: string; girdi: GunlukKayitGuncelleGirdisi }) =>
      adaptorler.gunlukSoru.kayitDuzelt(v.id, v.girdi),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gunluk'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

export function useKayitSil() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.gunlukSoru.kayitSil(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gunluk'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

export function useGorevVer(ogrenciId: string) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (g: GorevVerGirdisi) => adaptorler.gunlukSoru.gorevVer(ogrenciId, g),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plan'] });
      void qc.invalidateQueries({ queryKey: ['odev'] });
    },
  });
}

/** Etkin kapsamin gonderilmemis ya da hatali gunluk soru kayitlari (olusturulma sirasiyla). */
export function useGunlukGonderimleri(): readonly Gonderim[] {
  const { gonderim } = useServisler();
  const uyelikId = useUyelikId();
  const hepsi = useSyncExternalStore(
    (cb) => gonderim.abone(cb),
    () => gonderim.liste(),
  );
  return useMemo(
    () => hepsi.filter((g) => g.tur === 'gunluk_soru' && g.kapsam === uyelikId),
    [hepsi, uyelikId],
  );
}
