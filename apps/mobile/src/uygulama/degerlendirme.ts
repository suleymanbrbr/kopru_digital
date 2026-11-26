import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  Degerlendirme,
  DegerlendirmeGirdisi,
  DegerlendirmeGuncelleGirdisi,
  KaynakOneriGirdisi,
  Kocluk,
} from '../api/degerlendirmeTipleri';
import { useAktif, useServisler } from './baglam';

/**
 * Degerlendirme, kaynak onerisi ve kocluk sorgulari. Anahtarlar uyelik kapsamli ve
 * `['degerlendirme', ...]` ile baslar: yazma/duzenleme/geri cekme/oneri sonrasi tumu birden
 * gecersiz kilinir. Ogrenci yalniz `degerlendirmelerim` ve `kaynakOnerilerim`i okur; personel ucu
 * ogrenci rolunde calistirilmaz (`enabled`).
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

const ogrenciMi = (rol: string | undefined) => rol === 'ogrenci';

/** Tek istekte koclukta gereken her sey (hedef: 2 sn). */
export function useKocluk(ogrenciId: string | null) {
  const { adaptorler } = useServisler();
  const aktif = useAktif();
  const uyelikId = aktif?.uyelik.uyelikId;
  const rol = aktif?.uyelik.rol;
  return useQuery({
    queryKey: ['degerlendirme', uyelikId, 'kocluk', ogrenciId],
    queryFn: ogrenciId ? () => adaptorler.degerlendirme.kocluk(ogrenciId) : skipToken,
    enabled: !!uyelikId && !!ogrenciId && !ogrenciMi(rol),
  });
}

interface EkSayfalar {
  liste: Degerlendirme[];
  imlec: string | null;
  /** Ilk "daha fazla" yapildi mi (yapilmadiysa devam imleci koclugun ilk sayfasindadir). */
  yuklendi: boolean;
}

/**
 * Zaman cizelgesi: koclugun ilk sayfasi + "Daha fazla" ile liste ucundan gelen sayfalar. Ek sayfalar
 * sorgu onbelleginde durur (duzenleme ekrani da buradan okur); her yazma/geri cekme sonrasi
 * gecersiz kilinir ve cizelge ilk sayfadan yeniden baslar.
 */
export function useZamanCizelgesi(ogrenciId: string, kocluk: Kocluk | undefined) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  const anahtar = ['degerlendirme', uyelikId, 'ek', ogrenciId];
  const ek = useQuery<EkSayfalar>({
    queryKey: anahtar,
    queryFn: () => ({ liste: [], imlec: null, yuklendi: false }),
    staleTime: Infinity,
    enabled: !!uyelikId && !!kocluk,
  });
  const daha = useMutation({
    networkMode: 'always',
    mutationFn: () => {
      const imlec = ek.data?.yuklendi
        ? ek.data.imlec
        : (kocluk?.degerlendirmeler.sonrakiImlec ?? null);
      return adaptorler.degerlendirme.degerlendirmeler(ogrenciId, imlec);
    },
    onSuccess: (s) => {
      qc.setQueryData<EkSayfalar>(anahtar, (eski) => ({
        liste: [...(eski?.liste ?? []), ...s.degerlendirmeler],
        imlec: s.sonrakiImlec,
        yuklendi: true,
      }));
    },
  });
  const ilk = kocluk?.degerlendirmeler.degerlendirmeler ?? [];
  const eklenen = ek.data?.liste ?? [];
  const gorulen = new Set(ilk.map((d) => d.id));
  const liste = [...ilk, ...eklenen.filter((d) => !gorulen.has(d.id))];
  const dahaVar = ek.data?.yuklendi
    ? ek.data.imlec !== null
    : (kocluk?.degerlendirmeler.sonrakiImlec ?? null) !== null;
  return {
    liste,
    dahaVar,
    dahaFazla: () => {
      daha.mutate();
    },
    yukleniyor: daha.isPending,
    hata: daha.error,
  };
}

/** Bugun karti: bu hafta degerlendirmesi olmayan ogrencilerim (personel). */
export function useDegerlendirmeHatirlatma() {
  const { adaptorler } = useServisler();
  const aktif = useAktif();
  const uyelikId = aktif?.uyelik.uyelikId;
  const rol = aktif?.uyelik.rol;
  return useQuery({
    queryKey: ['degerlendirme', uyelikId, 'hatirlatma'],
    queryFn: () => adaptorler.degerlendirme.hatirlatma(),
    enabled: !!uyelikId && !ogrenciMi(rol),
  });
}

/** Ogrenci: kendisine GORUNUR degerlendirmeler (sayfali). */
export function useDegerlendirmelerim() {
  const { adaptorler } = useServisler();
  const aktif = useAktif();
  const uyelikId = aktif?.uyelik.uyelikId;
  const rol = aktif?.uyelik.rol;
  return useInfiniteQuery({
    queryKey: ['degerlendirme', uyelikId, 'benim'],
    queryFn: ({ pageParam }) => adaptorler.degerlendirme.degerlendirmelerim(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && ogrenciMi(rol),
  });
}

/** Ogrenci: kendisine onerilen kaynaklar ("Ogretmenimin onerdikleri"). */
export function useKaynakOnerilerim() {
  const { adaptorler } = useServisler();
  const aktif = useAktif();
  const uyelikId = aktif?.uyelik.uyelikId;
  const rol = aktif?.uyelik.rol;
  return useQuery({
    queryKey: ['degerlendirme', uyelikId, 'oneriler'],
    queryFn: () => adaptorler.degerlendirme.kaynakOnerilerim(),
    enabled: !!uyelikId && ogrenciMi(rol),
  });
}

function useTazele() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['degerlendirme'] });
}

export function useDegerlendirmeYaz(ogrenciId: string) {
  const { adaptorler } = useServisler();
  const tazele = useTazele();
  return useMutation({
    networkMode: 'always',
    mutationFn: (g: DegerlendirmeGirdisi) =>
      adaptorler.degerlendirme.degerlendirmeYaz(ogrenciId, g),
    onSuccess: tazele,
  });
}

export function useDegerlendirmeDuzenle() {
  const { adaptorler } = useServisler();
  const tazele = useTazele();
  return useMutation({
    networkMode: 'always',
    mutationFn: (v: { id: string; girdi: DegerlendirmeGuncelleGirdisi }) =>
      adaptorler.degerlendirme.degerlendirmeDuzenle(v.id, v.girdi),
    onSuccess: tazele,
  });
}

export function useDegerlendirmeGeriCek() {
  const { adaptorler } = useServisler();
  const tazele = useTazele();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.degerlendirme.degerlendirmeGeriCek(id),
    onSuccess: tazele,
  });
}

export function useKaynakOner(ogrenciId: string) {
  const { adaptorler } = useServisler();
  const tazele = useTazele();
  return useMutation({
    networkMode: 'always',
    mutationFn: (g: KaynakOneriGirdisi) => adaptorler.degerlendirme.kaynakOner(ogrenciId, g),
    onSuccess: tazele,
  });
}

export function useKaynakOneriGeriCek() {
  const { adaptorler } = useServisler();
  const tazele = useTazele();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.degerlendirme.kaynakOneriGeriCek(id),
    onSuccess: tazele,
  });
}
