'use client';

import {
  DegerlendirmeHatirlatmaSema,
  DegerlendirmeListeYanitiSema,
  DegerlendirmeSema,
  KaynakOnerisiListeYanitiSema,
  KaynakOnerisiSema,
  KoclukYanitiSema,
  OgrenciDegerlendirmeListeYanitiSema,
  type DegerlendirmeOlusturGirdi,
  type KaynakOnerisiOlusturGirdi,
} from '@kopru/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { ogrenmeIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { ogrenmeAnahtari, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

const yol = (kurumId: string, son: string) => `kurumlar/${kurumId}/${son}`;
const anahtar = (kurumId: string, ...parca: readonly unknown[]) =>
  [...ogrenmeAnahtari(kurumId), 'kocluk', ...parca] as const;

/** Koçluk görünümü: tek istek (kalite çıtası 2 sn); zaman çizelgesinin ilk sayfası içindedir. */
export function useKocluk(kurumId: string, ogrenciId: string) {
  return useQuery({
    queryKey: anahtar(kurumId, 'ogrenci', ogrenciId),
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/kocluk`), { sema: KoclukYanitiSema }),
  });
}

/** Zaman çizelgesinin devamı (koçluk yanıtındaki `sonraki_imlec`ten sonrası). */
export function degerlendirmeDevami(
  kurumId: string,
  ogrenciId: string,
  imlec: string,
): Promise<z.output<typeof DegerlendirmeListeYanitiSema>> {
  return ogrenmeIstek(
    `${yol(kurumId, `ogrenciler/${ogrenciId}/degerlendirmeler`)}${sorguDizgesi({ limit: 20, imlec })}`,
    { sema: DegerlendirmeListeYanitiSema },
  );
}

/** Değerlendirme yaz; `ogrenci_gorur` varsayılan kapalıdır. */
export function useDegerlendirmeYaz(kurumId: string, ogrenciId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: DegerlendirmeOlusturGirdi) =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/degerlendirmeler`), {
        yontem: 'POST',
        govde,
        sema: DegerlendirmeSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useDegerlendirmeGuncelle(kurumId: string, id: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      ogrenmeIstek(yol(kurumId, `degerlendirmeler/${id}`), {
        yontem: 'PATCH',
        govde,
        sema: DegerlendirmeSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useDegerlendirmeGeriCek(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(yol(kurumId, `degerlendirmeler/${id}/geri-cek`), {
        yontem: 'POST',
        sema: DegerlendirmeSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useOneriYap(kurumId: string, ogrenciId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (govde: KaynakOnerisiOlusturGirdi) =>
      ogrenmeIstek(yol(kurumId, `ogrenciler/${ogrenciId}/kaynak-onerileri`), {
        yontem: 'POST',
        govde,
        sema: KaynakOnerisiSema,
      }),
    onSuccess: () => yenile(),
  });
}

export function useOneriGeriCek(kurumId: string) {
  const yenile = useOgrenmeYenile(kurumId);
  return useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(yol(kurumId, `kaynak-onerileri/${id}/geri-cek`), {
        yontem: 'POST',
        sema: KaynakOnerisiSema,
      }),
    onSuccess: () => yenile(),
  });
}

/** Bugün kartı (personel): bu hafta değerlendirmesi olmayan öğrencilerim. */
export function useDegerlendirmeHatirlatma(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: anahtar(kurumId, 'hatirlatma'),
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, 'degerlendirme-hatirlatma'), {
        sema: DegerlendirmeHatirlatmaSema,
      }),
  });
}

/** Öğrenci: kendisine görünür işaretlenmiş değerlendirmeler. */
export function useDegerlendirmelerim(kurumId: string, etkin = true) {
  return useSayfaliSorgu({
    servis: 'ogrenme',
    anahtar: anahtar(kurumId, 'degerlendirmelerim'),
    yol: yol(kurumId, 'degerlendirmelerim'),
    sema: OgrenciDegerlendirmeListeYanitiSema,
    sayfaBoyutu: 20,
    etkin,
  });
}

/** Öğrenci: kendisine önerilen kaynaklar. */
export function useKaynakOnerilerim(kurumId: string, etkin = true) {
  return useQuery({
    queryKey: anahtar(kurumId, 'oneriler-benim'),
    enabled: etkin,
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () =>
      ogrenmeIstek(yol(kurumId, 'kaynak-onerilerim'), { sema: KaynakOnerisiListeYanitiSema }),
  });
}
