'use client';

import {
  SoruAyarlariSema,
  SoruBildirimListeYanitSema,
  SoruDetaySema,
  SoruKotaSema,
  SoruKuyrukSayiYanitSema,
  SoruListeYanitSema,
  SoruMasasiListeYanitSema,
  SoruMusaitlikSema,
  SoruOlcumSema,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ogrenmeIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

/** Tum "soru sor" onbellegi bu anahtarin altindadir; yazimlardan sonra topluca gecersiz kilinir. */
export const soruAnahtari = (kurumId: string) => ['soru', kurumId] as const;

export function useSoruYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: soruAnahtari(kurumId) });
}

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;

export interface SoruSuzgeci {
  brans?: string;
  konuId?: string;
  durum?: string;
  q?: string;
  ogrenciId?: string;
  ogretmenId?: string;
}

const suzgecSorgusu = (f: SoruSuzgeci) => ({
  ...(f.brans ? { brans_kodu: f.brans } : {}),
  ...(f.konuId ? { konu_id: f.konuId } : {}),
  ...(f.durum ? { durum: f.durum } : {}),
  ...(f.q ? { q: f.q } : {}),
  ...(f.ogrenciId ? { ogrenci_id: f.ogrenciId } : {}),
  ...(f.ogretmenId ? { ogretmen_id: f.ogretmenId } : {}),
});

function useListeSorgusu(
  kurumId: string,
  uc: string,
  anahtar: string,
  f: SoruSuzgeci,
  etkin = true,
) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...soruAnahtari(kurumId), anahtar],
    yol: yol(kurumId, uc),
    sema: SoruListeYanitSema,
    sayfaBoyutu: 20,
    etkin,
    sorgu: suzgecSorgusu(f),
  });
  return { ...sorgu, sorular: sorgu.data?.pages.flatMap((s) => s.sorular) ?? [] };
}

// --- Ogrenci ----------------------------------------------------------------------------------

export function useSorularim(kurumId: string, f: SoruSuzgeci, etkin = true) {
  return useListeSorgusu(kurumId, 'sorularim', 'sorularim', f, etkin);
}

export function useSoruKotam(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'kota'],
    enabled: etkin,
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'soru-kotam'), { sema: SoruKotaSema }),
  });
}

export function useSoruDetayi(kurumId: string, soruId: string) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'detay', soruId],
    // Ek adresleri 10 dk gecerlidir ve cevap baska kullanicidan gelir: her acilista tazele.
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, `sorular/${soruId}`), { sema: SoruDetaySema }),
  });
}

// --- Ogretmen ---------------------------------------------------------------------------------

export function useGelenSorular(kurumId: string, f: SoruSuzgeci, etkin = true) {
  return useListeSorgusu(kurumId, 'gelen-sorular', 'gelen', f, etkin);
}

export function useCevapladigimSorular(kurumId: string, f: SoruSuzgeci, etkin = true) {
  return useListeSorgusu(kurumId, 'cevapladigim-sorular', 'cevapladigim', f, etkin);
}

/** Cevap bekleyen soru sayisi (menu rozeti ve Bugun karti); dakikada bir tazelenir. */
export function useBekleyenSayisi(kurumId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'bekleyen-sayi'],
    enabled: etkin,
    refetchInterval: 60_000,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, 'gelen-sorular/sayi'), { sema: SoruKuyrukSayiYanitSema }),
  });
}

export function useMusaitlik(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'musaitlik'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'soru-musaitligim'), { sema: SoruMusaitlikSema }),
  });
}

// --- Yonetim ----------------------------------------------------------------------------------

export function useYonetimSorulari(kurumId: string, f: SoruSuzgeci, etkin = true) {
  return useListeSorgusu(kurumId, 'yonetim/sorular', 'yonetim', f, etkin);
}

export function useSoruMasalari(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'masalar'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'soru-masalari'), { sema: SoruMasasiListeYanitSema }),
  });
}

export function useSoruAyarlari(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'ayarlar'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => ogrenmeIstek(yol(kurumId, 'soru-ayarlari'), { sema: SoruAyarlariSema }),
  });
}

export function useSoruBildirimleri(kurumId: string, durum: 'acik' | 'kapandi', etkin = true) {
  const sorgu = useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: [...soruAnahtari(kurumId), 'bildirimler'],
    yol: yol(kurumId, 'soru-bildirimleri'),
    sema: SoruBildirimListeYanitSema,
    sayfaBoyutu: 20,
    etkin,
    sorgu: { durum },
  });
  return { ...sorgu, bildirimler: sorgu.data?.pages.flatMap((s) => s.bildirimler) ?? [] };
}

export function useSoruOlcumu(
  kurumId: string,
  aralik: { baslangic: string; bitis: string },
  etkin = true,
) {
  return useQuery({
    queryKey: [...soruAnahtari(kurumId), 'olcum', aralik.baslangic, aralik.bitis],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(
        yol(
          kurumId,
          `soru-olcum${sorguDizgesi({
            ...(aralik.baslangic ? { baslangic: aralik.baslangic } : {}),
            ...(aralik.bitis ? { bitis: aralik.bitis } : {}),
          })}`,
        ),
        { sema: SoruOlcumSema },
      ),
  });
}
