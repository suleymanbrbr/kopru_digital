'use client';

import {
  GeriBildirimBekleyenYanitSema,
  GeriBildirimDersYanitSema,
  GeriBildirimKendiYanitSema,
  GeriBildirimOgrenciYanitSema,
  GeriBildirimOzetYanitSema,
  GrupUyeListeYanitSema,
  KayitlarimDetaySema,
  KayitlarimYanitSema,
  KaynakDetaySema,
  KaynakIzlemeYanitSema,
  KaynakListeYanitSema,
  KaynakSorunListeYanitSema,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { dersIstek, hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

/** Kayit, materyal ve geri bildirim onbellegi bu anahtarlarin altindadir; yazimlardan sonra topluca gecersiz kilinir. */
export const kayitAnahtari = (kurumId: string) => ['kayit', kurumId] as const;
export const geriBildirimAnahtari = (kurumId: string) => ['geri-bildirim', kurumId] as const;

export function useKayitYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: kayitAnahtari(kurumId) });
}

export function useGeriBildirimYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: geriBildirimAnahtari(kurumId) });
}

const kok = (kurumId: string) => `kurumlar/${kurumId}`;

export interface KaynakSuzgeci {
  tur?: string;
  grup_id?: string;
  brans_kodu?: string;
  ders_id?: string;
  konu_id?: string;
  durum?: string;
  baslangic?: string;
  bitis?: string;
}

/** Bos olmayan suzgec degerleri (sorgu dizgesine yazilir). */
function temizle(s: KaynakSuzgeci): Record<string, string> {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== ''));
}

/** Personel: kurumun kaynaklari (sunucu suzgeci, imlecli sayfalama). */
export function useKaynaklar(
  kurumId: string,
  suzgec: KaynakSuzgeci,
  { etkin = true, sayfaBoyutu = 30 }: { etkin?: boolean; sayfaBoyutu?: number } = {},
) {
  const q = useSayfaliSorgu({
    anahtar: [...kayitAnahtari(kurumId), 'kaynaklar'],
    yol: `${kok(kurumId)}/kaynaklar`,
    sema: KaynakListeYanitSema,
    sorgu: temizle(suzgec),
    servis: 'ders',
    sayfaBoyutu,
    etkin,
  });
  return { ...q, kaynaklar: q.data?.pages.flatMap((s) => s.kaynaklar) ?? [] };
}

/** Ogrenci: "Kayitlarim" (izlenmemisler ustte; sunucu siralar). */
export function useKayitlarim(kurumId: string, suzgec: KaynakSuzgeci, etkin = true) {
  const q = useSayfaliSorgu({
    anahtar: [...kayitAnahtari(kurumId), 'kayitlarim'],
    yol: `${kok(kurumId)}/kayitlarim`,
    sema: KayitlarimYanitSema,
    sorgu: temizle(suzgec),
    servis: 'ders',
    sayfaBoyutu: 30,
    etkin,
  });
  return { ...q, kayitlar: q.data?.pages.flatMap((s) => s.kayitlar) ?? [] };
}

export function useKayitlarimDetay(kurumId: string, kaynakId: string | null) {
  return useQuery({
    queryKey: [...kayitAnahtari(kurumId), 'kayitlarim-detay', kaynakId],
    enabled: kaynakId !== null,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/kayitlarim/${String(kaynakId)}`, { sema: KayitlarimDetaySema }),
  });
}

export function useKaynakDetay(kurumId: string, kaynakId: string | null) {
  return useQuery({
    queryKey: [...kayitAnahtari(kurumId), 'kaynak-detay', kaynakId],
    enabled: kaynakId !== null,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/kaynaklar/${String(kaynakId)}`, { sema: KaynakDetaySema }),
  });
}

export function useIzlemeler(kurumId: string, kaynakId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...kayitAnahtari(kurumId), 'izlemeler', kaynakId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/kaynaklar/${kaynakId}/izlemeler`, { sema: KaynakIzlemeYanitSema }),
  });
}

export function useSorunlar(kurumId: string, kaynakId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...kayitAnahtari(kurumId), 'sorunlar', kaynakId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/kaynaklar/${kaynakId}/sorunlar`, {
        sema: KaynakSorunListeYanitSema,
      }),
  });
}

/** Grubun etkin uyeleri (secili ogrenciler gorunurlugu icin aday listesi). */
export function useGrupUyeleri(kurumId: string, grupId: string | null) {
  return useQuery({
    queryKey: ['hesap', kurumId, 'grup-uyeleri', grupId],
    enabled: grupId !== null,
    staleTime: 60_000,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`${kok(kurumId)}/gruplar/${String(grupId)}/uyeler`, {
        sema: GrupUyeListeYanitSema,
      }),
  });
}

// --- Geri bildirim ------------------------------------------------------------------------------

export function useGeriBildirimBekleyen(kurumId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...geriBildirimAnahtari(kurumId), 'bekleyen'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/geri-bildirim/bekleyen`, {
        sema: GeriBildirimBekleyenYanitSema,
      }),
  });
}

export function useDersGeriBildirimleri(kurumId: string, dersId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...geriBildirimAnahtari(kurumId), 'ders', dersId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/dersler/${dersId}/geri-bildirimler`, {
        sema: GeriBildirimDersYanitSema,
      }),
  });
}

export function useKendiGeriBildirimim(kurumId: string, dersId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...geriBildirimAnahtari(kurumId), 'kendi', dersId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(`${kok(kurumId)}/dersler/${dersId}/geri-bildirim`, {
        sema: GeriBildirimKendiYanitSema,
      }),
  });
}

export function useOgrenciGeriBildirimleri(kurumId: string, ogrenciId: string, etkin: boolean) {
  const q = useSayfaliSorgu({
    anahtar: [...geriBildirimAnahtari(kurumId), 'ogrenci', ogrenciId],
    yol: `${kok(kurumId)}/ogrenciler/${ogrenciId}/geri-bildirimler`,
    sema: GeriBildirimOgrenciYanitSema,
    servis: 'ders',
    sayfaBoyutu: 10,
    etkin,
  });
  return { ...q, satirlar: q.data?.pages.flatMap((s) => s.geri_bildirimler) ?? [] };
}

export function useGeriBildirimOzeti(
  kurumId: string,
  aralik: { baslangic: string; bitis: string },
  etkin: boolean,
) {
  return useQuery({
    queryKey: [...geriBildirimAnahtari(kurumId), 'ozet', aralik.baslangic, aralik.bitis],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      dersIstek(
        `${kok(kurumId)}/geri-bildirim/ozet?baslangic=${aralik.baslangic}&bitis=${aralik.bitis}`,
        { sema: GeriBildirimOzetYanitSema },
      ),
  });
}
