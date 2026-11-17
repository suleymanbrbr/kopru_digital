'use client';

import {
  KarakterTurleriYanitiSema,
  KarakterYanitiSema,
  KozmetiklerYanitiSema,
  MotivasyonDuraklatmaListesiSema,
  MotivasyonOgrenciDurumuSema,
  MotivasyonSeriDetaySema,
  OdakAcikYanitiSema,
  OdakListeYanitiSema,
  YildizAldiklariYanitiSema,
  YildizVerdiklerimYanitiSema,
} from '@kopru/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { UygulamaHatasi } from '@/lib/api';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';

/** Tum motivasyon onbellegi bu anahtarin altindadir; yazimlardan sonra topluca gecersiz kilinir. */
export const motivasyonAnahtari = (kurumId: string) => ['motivasyon', kurumId] as const;
export const benimAnahtari = (kurumId: string) =>
  [...motivasyonAnahtari(kurumId), 'benim'] as const;

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;

/** 403 `modul_kapali`: oyunlastirma arayuzu gizlenir (hata gosterilmez). */
export function modulKapaliMi(hata: unknown): boolean {
  return hata instanceof UygulamaHatasi && hata.durum === 403 && hata.kod === 'modul_kapali';
}

export function useMotivasyonYenile(kurumId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
}

// --- Ogrenci ----------------------------------------------------------------------------------

/** Ogrencinin kendi durumu (XP, seviye, beceriler, rozetler, karakter, seri ozeti, hareketler). */
export function useBenim(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: benimAnahtari(kurumId),
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => motivasyonIstek(yol(kurumId, 'benim'), { sema: MotivasyonOgrenciDurumuSema }),
  });
}

export function useSeri(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'seri'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => motivasyonIstek(yol(kurumId, 'benim/seri'), { sema: MotivasyonSeriDetaySema }),
  });
}

export function useKarakterim(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'karakter'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () => motivasyonIstek(yol(kurumId, 'karakter'), { sema: KarakterYanitiSema }),
  });
}

export function useKarakterTurleri(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'karakter-turleri'],
    enabled: etkin,
    staleTime: 10 * 60_000,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, 'karakter/turler'), { sema: KarakterTurleriYanitiSema }),
  });
}

export function useKozmetikler(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'kozmetikler'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, 'karakter/kozmetikler'), { sema: KozmetiklerYanitiSema }),
  });
}

export function useAcikOdak(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'odak', 'acik'],
    enabled: etkin,
    staleTime: 0,
    gcTime: 0,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, 'odak-oturumlari/acik'), { sema: OdakAcikYanitiSema }),
  });
}

export function useOdakGecmisi(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'odak', 'liste'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, 'odak-oturumlari?limit=5'), { sema: OdakListeYanitiSema }),
  });
}

/** Ogrencinin aldigi haftanin yildizlari (ogrenci kendi kimligiyle, ogretmen ogrenci kimligiyle). */
export function useAldigiYildizlar(kurumId: string, ogrenciId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'ogrenci', ogrenciId, 'yildizlar'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, `ogrenciler/${ogrenciId}/haftanin-yildizlari`), {
        sema: YildizAldiklariYanitiSema,
      }),
  });
}

// --- Ogretmen / yonetici ----------------------------------------------------------------------

export function useOgrenciOzeti(kurumId: string, ogrenciId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'ogrenci', ogrenciId, 'ozet'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, `ogrenciler/${ogrenciId}/ozet`), {
        sema: MotivasyonOgrenciDurumuSema,
      }),
  });
}

export function useVerdiklerim(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'yildiz-verdiklerim'],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, 'haftanin-yildizlari/verdiklerim'), {
        sema: YildizVerdiklerimYanitiSema,
      }),
  });
}

export function useDuraklatmalar(kurumId: string, grupId: string, etkin = true) {
  return useQuery({
    queryKey: [...motivasyonAnahtari(kurumId), 'duraklatmalar', grupId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      motivasyonIstek(yol(kurumId, `gruplar/${grupId}/seri-duraklatmalari`), {
        sema: MotivasyonDuraklatmaListesiSema,
      }),
  });
}
