import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { KayitSuzgeci } from '../api/kayitTipleri';
import type { VerilenGeriBildirim } from '../offline/geriBildirim';
import { useAktif, useServisler } from './baglam';
import { useModulAcik } from './operasyon';

/**
 * Ders kayitlari ve geri bildirim sorgulari. Anahtarlar uyelik kapsamlidir; geri bildirim
 * sorgularinin ilk parcasi `geri-bildirim`dir (kuyruk basarili olunca gecersiz kilinir).
 * Modul kapaliysa sorgu calismaz.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

/** "Kayitlarim" (ogrenci) icin modul ve rol kosulu. */
export function useKayitlarimAcik(): boolean {
  const aktif = useAktif();
  const modul = useModulAcik('kayitlar');
  return modul && aktif?.uyelik.rol === 'ogrenci';
}

/** Izlenmemisler once, imlecli sonsuz liste. Suzgec degisince onceki liste yeni gelene kadar durur. */
export function useKayitlarim(suzgec: KayitSuzgeci) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useKayitlarimAcik();
  return useInfiniteQuery({
    queryKey: ['kayit', uyelikId, 'liste', suzgec],
    queryFn: ({ pageParam }) => adaptorler.kayit.kayitlarim(suzgec, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonrakiImlec,
    enabled: !!uyelikId && acik,
    placeholderData: keepPreviousData,
  });
}

/** Ogretmen/yonetici: bir gunun (kurum yerel gunu) kaynaklari; izleyen sayilari dahil. */
export function useGunKaynaklari(gun: string, etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('kayitlar');
  return useQuery({
    queryKey: ['kayit', uyelikId, 'gun', gun],
    queryFn: () => adaptorler.kayit.kaynaklar({ baslangic: gun, bitis: gun }),
    enabled: !!uyelikId && acik && etkin,
  });
}

export function useKaynakIzlemeleri(kaynakId: string, etkin: boolean) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('kayitlar');
  return useQuery({
    queryKey: ['kayit', uyelikId, 'izlemeler', kaynakId],
    queryFn: () => adaptorler.kayit.kaynakIzlemeleri(kaynakId),
    enabled: !!uyelikId && acik && etkin,
  });
}

export function useDersGeriBildirimleri(dersId: string, etkin: boolean) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('geri_bildirim');
  return useQuery({
    queryKey: ['geri-bildirim', uyelikId, 'ders', dersId],
    queryFn: () => adaptorler.kayit.dersGeriBildirimleri(dersId),
    enabled: !!uyelikId && acik && etkin,
  });
}

/** Ogrenci: son 24 saatte biten ve henuz cevaplanmamis dersler. */
export function useGeriBildirimBekleyen() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const aktif = useAktif();
  const acik = useModulAcik('geri_bildirim');
  return useQuery({
    queryKey: ['geri-bildirim', uyelikId, 'bekleyen'],
    queryFn: () => adaptorler.kayit.geriBildirimBekleyen(),
    enabled: !!uyelikId && acik && aktif?.uyelik.rol === 'ogrenci',
  });
}

/** Yerel "verdim" kayitlari (degistirilebilir sure icinde olanlar). */
export function useVerilenGeriBildirimler(): readonly VerilenGeriBildirim[] {
  const { geriBildirimDeposu } = useServisler();
  const uyelikId = useUyelikId();
  return useSyncExternalStore(
    (cb) => geriBildirimDeposu.abone(cb),
    () => geriBildirimDeposu.al(uyelikId),
  );
}
