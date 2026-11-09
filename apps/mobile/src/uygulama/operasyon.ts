import { t, type MessageKey } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { Ders, DersGrubu } from '../api/operasyonTipleri';
import type { ModulKodu } from '../api/tipler';
import { gunAraligi, tarihEkle, VARSAYILAN_SAAT_DILIMI } from '../lib/saat';
import { modulAcikMi } from '../nav/yapilandirma';
import type { KuyrukIsi } from '../offline/kuyruk';
import { useAktif, useServisler } from './baglam';

/** Sorgu anahtarlari uyelik kapsamlidir; kurum/rol degisince onbellek karismaz. */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

/** Etkin kurumda modul acik mi (bilinmiyorsa kapali). */
export function useModulAcik(modul: ModulKodu): boolean {
  const aktif = useAktif();
  return !!aktif && modulAcikMi(aktif.moduller, modul);
}

/** Kurum saat dilimi; okunana kadar `hazir=false` (gun sinirlari yanlis hesaplanmasin). */
export function useSaatDilimi(): { tz: string; hazir: boolean } {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const q = useQuery({
    queryKey: ['saat-dilimi', uyelikId],
    queryFn: () => adaptorler.ders.saatDilimi(),
    enabled: !!uyelikId,
    staleTime: 24 * 60 * 60 * 1000,
  });
  // Okuma hatasinda (cevrimdisi, onbellek yok) varsayilanla devam edilir.
  return { tz: q.data ?? VARSAYILAN_SAAT_DILIMI, hazir: q.isSuccess || q.isError };
}

/** Kurum yerel gununun dersleri. */
export function useGunDersleri(tarih: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const { tz, hazir } = useSaatDilimi();
  return useQuery({
    queryKey: ['dersler', uyelikId, 'gun', tz, tarih],
    queryFn: () => {
      const { baslangic, bitis } = gunAraligi(tarih, tz);
      return adaptorler.ders.dersler(baslangic, bitis);
    },
    enabled: !!uyelikId && hazir,
  });
}

/** `[baslangicTarihi, baslangicTarihi + gunSayisi)` araligindaki dersler. */
export function useAralikDersleri(baslangicTarihi: string, gunSayisi: number) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const { tz, hazir } = useSaatDilimi();
  return useQuery({
    queryKey: ['dersler', uyelikId, 'aralik', tz, baslangicTarihi, gunSayisi],
    queryFn: () =>
      adaptorler.ders.dersler(
        gunAraligi(baslangicTarihi, tz).baslangic,
        gunAraligi(tarihEkle(baslangicTarihi, gunSayisi - 1), tz).bitis,
      ),
    enabled: !!uyelikId && hazir,
  });
}

export function useGruplar() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('takvim');
  return useQuery({
    queryKey: ['gruplar', uyelikId],
    queryFn: () => adaptorler.ders.gruplar(),
    enabled: !!uyelikId && acik,
    staleTime: 5 * 60_000,
  });
}

/** Grubun gorunen adi: birebirde ogrencinin adi. */
export function grupEtiketi(g: DersGrubu): string {
  return g.tur === 'birebir' && g.ogrenciAd ? g.ogrenciAd : g.ad;
}

export function dersAdi(d: Ders, gruplar: readonly DersGrubu[] | undefined): string {
  if (d.baslik) return d.baslik;
  const g = gruplar?.find((x) => x.id === d.grupId);
  if (g) return grupEtiketi(g);
  const brans = `mobil.brans.${d.bransKodu}` as MessageKey;
  const ad = t(brans);
  return ad === brans ? t('mobil.ders.adsiz') : ad;
}

export function useYoklamaBekleyen() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('yoklama');
  return useQuery({
    queryKey: ['yoklama-bekleyen', uyelikId],
    queryFn: () => adaptorler.ders.yoklamaBekleyen(),
    enabled: !!uyelikId && acik,
  });
}

export function useYoklamaKatilimcilari(dersId: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['yoklama-katilimcilari', uyelikId, dersId],
    queryFn: () => adaptorler.ders.yoklamaKatilimcilari(dersId),
    enabled: !!uyelikId,
  });
}

/** Cevrimdisi kuyruktaki bekleyen ve basarisiz isler (degisince yeniden render). */
export function useKuyruk(): { bekleyen: readonly KuyrukIsi[]; basarisiz: readonly KuyrukIsi[] } {
  const { kuyruk } = useServisler();
  const bekleyen = useSyncExternalStore(
    (cb) => kuyruk.abone(cb),
    () => kuyruk.bekleyenler(),
  );
  const basarisiz = useSyncExternalStore(
    (cb) => kuyruk.abone(cb),
    () => kuyruk.basarisizlar(),
  );
  return { bekleyen, basarisiz };
}

export function useFinansOgrenciler() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('finans');
  return useQuery({
    queryKey: ['finans', uyelikId, 'ogrenciler'],
    queryFn: () => adaptorler.finans.ogrenciler(),
    enabled: !!uyelikId && acik,
  });
}

export function useOgrenciKarti(ogrenciId: string | undefined) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useModulAcik('finans');
  return useQuery({
    queryKey: ['finans', uyelikId, 'kart', ogrenciId],
    queryFn: () => adaptorler.finans.ogrenciKarti(ogrenciId ?? ''),
    enabled: !!uyelikId && acik && !!ogrenciId,
  });
}

export function usePaketler() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  return useQuery({
    queryKey: ['finans', uyelikId, 'paketler'],
    queryFn: () => adaptorler.finans.paketler(),
    enabled: !!uyelikId,
    staleTime: 5 * 60_000,
  });
}
