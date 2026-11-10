import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Konu, PlanDetayi, PlanGorevi } from '../api/ogrenmeTipleri';
import { gorevDurumuHesapla } from '../ogrenme/hafta';
import { useAktif, useServisler } from './baglam';
import { useModulAcik } from './operasyon';

/**
 * Ogrenme sorgulari. Anahtarlar uyelik kapsamlidir; plan sorgularinin ilk parcasi `plan`dir
 * (kuyruk basarili olunca `['plan']` gecersiz kilinir). Modul kapaliysa sorgu calismaz.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

export function useKonular(etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['konular', uyelikId],
    queryFn: () => adaptorler.ogrenme.konular(),
    enabled: !!uyelikId && etkin,
    staleTime: 60 * 60_000,
  });
}

/** Kimlik -> konu (kullanimdan kalkanlar dahil; mevcut referanslar rozetle gosterilir). */
export function useKonuHaritasi(): Map<string, Konu> {
  const odev = useModulAcik('odev');
  const plan = useModulAcik('haftalik_plan');
  const q = useKonular(odev || plan);
  return useMemo(() => new Map((q.data ?? []).map((k) => [k.id, k])), [q.data]);
}

export function usePlanim(hafta: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('haftalik_plan');
  return useQuery({
    queryKey: ['plan', uyelikId, 'planim', hafta],
    queryFn: () => adaptorler.ogrenme.planim(hafta),
    enabled: !!uyelikId && acik,
  });
}

export function useOgrenciPlani(ogrenciId: string, hafta: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('haftalik_plan');
  return useQuery({
    queryKey: ['plan', uyelikId, 'ogrenci', ogrenciId, hafta],
    queryFn: () => adaptorler.ogrenme.ogrenciPlani(ogrenciId, hafta),
    enabled: !!uyelikId && acik && !!ogrenciId,
  });
}

export function useOdevlerim() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('odev');
  return useQuery({
    queryKey: ['odev', uyelikId, 'odevlerim'],
    queryFn: () => adaptorler.ogrenme.odevlerim(),
    enabled: !!uyelikId && acik,
  });
}

export function useBekleyenTeslimler() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('odev');
  return useQuery({
    queryKey: ['odev', uyelikId, 'bekleyen'],
    queryFn: () => adaptorler.ogrenme.incelemeBekleyenler(),
    enabled: !!uyelikId && acik,
  });
}

export function useOdevOzeti(odevId: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('odev');
  return useQuery({
    queryKey: ['odev', uyelikId, 'ozet', odevId],
    queryFn: () => adaptorler.ogrenme.odevOzeti(odevId),
    enabled: !!uyelikId && acik && !!odevId,
  });
}

export function useOdevSablonlari() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('odev');
  return useQuery({
    queryKey: ['odev', uyelikId, 'sablonlar'],
    queryFn: () => adaptorler.ogrenme.odevSablonlari(),
    enabled: !!uyelikId && acik,
    staleTime: 5 * 60_000,
  });
}

export function useDenemeKurallari() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('deneme');
  return useQuery({
    queryKey: ['deneme', uyelikId, 'kurallar'],
    queryFn: () => adaptorler.ogrenme.denemeKurallari(),
    enabled: !!uyelikId && acik,
    staleTime: 60 * 60_000,
  });
}

export function useOgrenciDenemeAyari() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('deneme');
  return useQuery({
    queryKey: ['deneme', uyelikId, 'ayar'],
    queryFn: () => adaptorler.ogrenme.ogrenciDenemeGirisi(),
    enabled: !!uyelikId && acik,
    staleTime: 5 * 60_000,
  });
}

export function useDenemelerim() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('deneme');
  return useQuery({
    queryKey: ['deneme', uyelikId, 'denemelerim'],
    queryFn: () => adaptorler.ogrenme.denemelerim(),
    enabled: !!uyelikId && acik,
  });
}

/** Ogretmen: onay kuyrugu (`ogrenciId` yok) ya da tek ogrencinin denemeleri. */
export function useDenemeler(s: { onay?: 'bekliyor'; ogrenciId?: string }) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('deneme');
  return useQuery({
    queryKey: ['deneme', uyelikId, 'liste', s.onay ?? 'tum', s.ogrenciId ?? 'hepsi'],
    queryFn: () => adaptorler.ogrenme.denemeler(s),
    enabled: !!uyelikId && acik,
  });
}

export function useDenemeGelisim(ogrenciId: string | undefined, kuralKodu: string | null) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('deneme');
  return useQuery({
    queryKey: ['deneme', uyelikId, 'gelisim', ogrenciId, kuralKodu],
    queryFn: () => adaptorler.ogrenme.denemeGelisim(ogrenciId ?? '', kuralKodu ?? ''),
    enabled: !!uyelikId && acik && !!ogrenciId && !!kuralKodu,
  });
}

/** Deneme ile ilgili tum sorgulari (onay kuyrugu, liste, gelisim, denemelerim) tazeler. */
export function denemeleriTazele(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: ['deneme'] });
}

/**
 * Iyimser gerceklesen girisi: bellekteki tum `planim` sorgularinda gorev guncellenir (surum
 * degismez; sunucu yanitiyla `['plan']` gecersiz kilinarak esitlenir).
 */
export function gerceklesenIyimser(
  qc: QueryClient,
  uyelikId: string | undefined,
  gorevId: string,
  miktar: number,
) {
  qc.setQueriesData<PlanDetayi>({ queryKey: ['plan', uyelikId, 'planim'] }, (eski) => {
    if (!eski) return eski;
    return {
      ...eski,
      gorevler: eski.gorevler.map(
        (g): PlanGorevi =>
          g.id === gorevId
            ? { ...g, gerceklesen: miktar, durum: gorevDurumuHesapla(g.hedefMiktar, miktar) }
            : g,
      ),
    };
  });
}
