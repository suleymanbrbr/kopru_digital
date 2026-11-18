import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import type {
  DuyuruAliciSayfasi,
  DuyuruDetay,
  DuyuruGuncelle,
  DuyuruOlustur,
  DuyuruYonetimSayfasi,
} from '../api/bildirimTipleri';
import { useAktif, useServisler } from './baglam';
import { useModulAcik } from './operasyon';

/**
 * Duyuru sorgulari. Anahtarlar uyelik kapsamlidir (`['duyuru', uyelikId, ...]`); yazimlar ve
 * okundu `['duyuru']` on ekini gecersiz kilar. Sorgu onbellegi kalici oldugundan cevrimdisiyken
 * son liste gosterilir. `duyuru` modulu kapaliysa sorgular calismaz.
 */
const SAYFA = 20;

function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

/** Yazma ekrani ve "Yazdiklarim" yalniz personele (ogretmen, yonetici, sahip) acilir. */
export function useDuyuruYazabilir(): boolean {
  const rol = useAktif()?.uyelik.rol;
  return rol === 'ogretmen' || rol === 'yonetici' || rol === 'sahip';
}

export function useDuyurularim() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('duyuru');
  return useInfiniteQuery({
    queryKey: ['duyuru', uyelikId, 'liste'],
    queryFn: ({ pageParam }) =>
      adaptorler.bildirim.duyurularim({ limit: SAYFA, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (son: DuyuruAliciSayfasi, sayfalar) => {
      const yuklenen = sayfalar.reduce((n, s) => n + s.ogeler.length, 0);
      return yuklenen < son.toplam && son.ogeler.length > 0 ? yuklenen : undefined;
    },
    enabled: !!uyelikId && acik,
    staleTime: 15_000,
  });
}

export function useDuyuru(id: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['duyuru', uyelikId, 'detay', id],
    queryFn: (): Promise<DuyuruDetay> => adaptorler.bildirim.duyuru(id),
    enabled: !!uyelikId && id !== '',
    staleTime: 0,
  });
}

export function useDuyuruYonetim(etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const yazabilir = useDuyuruYazabilir();
  return useQuery({
    queryKey: ['duyuru', uyelikId, 'yonetim'],
    queryFn: (): Promise<DuyuruYonetimSayfasi> => adaptorler.bildirim.duyuruYonetim({ limit: 100 }),
    enabled: !!uyelikId && yazabilir && etkin,
    staleTime: 0,
  });
}

/** Acilan duyuruyu okundu isaretler; liste ve kutu sayaci tazelenir. */
export function useDuyuruOkundu() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.bildirim.duyuruOkundu(id),
    onMutate: (id) => {
      // Listede hemen okundu gorunur; sunucu yaniti gelince kesinlesir.
      const simdi = new Date().toISOString();
      qc.setQueryData<InfiniteData<DuyuruAliciSayfasi, number>>(
        ['duyuru', uyelikId, 'liste'],
        (d) =>
          d && {
            ...d,
            pages: d.pages.map((s) => ({
              ...s,
              ogeler: s.ogeler.map((o) =>
                o.id === id && o.okundu_at === null ? { ...o, okundu_at: simdi } : o,
              ),
            })),
          },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['duyuru', uyelikId] });
      void qc.invalidateQueries({ queryKey: ['bildirim', uyelikId] });
    },
  });
}

/** Yazar islemleri: taslak, guncelle, yayinla, arsivle, sil. Basarida tum duyuru sorgulari tazelenir. */
export function useDuyuruIslemleri() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  const yenile = () => {
    void qc.invalidateQueries({ queryKey: ['duyuru', uyelikId] });
    void qc.invalidateQueries({ queryKey: ['bildirim', uyelikId] });
  };
  const b = adaptorler.bildirim;
  return {
    taslak: useMutation({
      networkMode: 'always',
      mutationFn: (g: DuyuruOlustur) => b.duyuruTaslak(g),
      onSuccess: yenile,
    }),
    guncelle: useMutation({
      networkMode: 'always',
      mutationFn: (a: { id: string; g: DuyuruGuncelle }) => b.duyuruGuncelle(a.id, a.g),
      onSuccess: yenile,
    }),
    yayinla: useMutation({
      networkMode: 'always',
      mutationFn: (id: string) => b.duyuruYayinla(id),
      onSuccess: yenile,
    }),
    arsivle: useMutation({
      networkMode: 'always',
      mutationFn: (id: string) => b.duyuruArsivle(id),
      onSuccess: yenile,
    }),
    sil: useMutation({
      networkMode: 'always',
      mutationFn: (id: string) => b.duyuruSil(id),
      onSuccess: yenile,
    }),
  };
}
