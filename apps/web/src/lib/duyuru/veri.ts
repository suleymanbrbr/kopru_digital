'use client';

import {
  DuyuruAliciListesiSema,
  DuyuruDetaySema,
  DuyuruOkunduYanitiSema,
  DuyuruOkuyanlarSema,
  DuyuruSema,
  DuyuruSilYanitiSema,
  DuyuruYonetimListesiSema,
  UyeListeYanitSema,
  type DuyuruDurum,
  type DuyuruGuncelle,
  type DuyuruOlustur,
} from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { bildirimAnahtari } from '@/lib/bildirim/veri';
import { bildirimIstek, hesapIstek, sorguDizgesi } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';

/** Tum duyuru onbellegi bu anahtarin altindadir (kurum basina). */
export const duyuruAnahtari = (kurumId: string) => ['duyuru', kurumId] as const;

const yol = (kurumId: string, son = '') => `kurumlar/${kurumId}/duyurular${son}`;

export const DUYURU_SAYFA_BOYUTU = 20;

/** Duyuru uclarinin hata kodlari (`tr.bildirim.duyuru.hata`); digerleri genel hata metnine duser. */
const DUYURU_HATA_KODLARI = ['modul_kapali', 'izin_yok', 'yasak', 'cakisma', 'bulunamadi'] as const;

export function duyuruHataMesaji(hata: unknown): string {
  if (hata instanceof UygulamaHatasi) {
    const kod = DUYURU_HATA_KODLARI.find((k) => k === hata.kod);
    if (kod) return t(`bildirim.duyuru.hata.${kod}` as MessageKey);
  }
  return hataMesaji(hata);
}

// --- Alici ------------------------------------------------------------------------------------

/** Duyurularim: sabitler sunucuda uste siralanir; sayfalama `offset` ile. */
export function useDuyurularim(kurumId: string, yalnizOkunmamis: boolean, etkin = true) {
  return useInfiniteQuery({
    queryKey: [...duyuruAnahtari(kurumId), 'gelen', { okunmamis: yalnizOkunmamis }],
    enabled: etkin,
    retry: yenidenDene,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      bildirimIstek(
        yol(
          kurumId,
          sorguDizgesi({
            okunmamis: yalnizOkunmamis ? 'true' : undefined,
            limit: DUYURU_SAYFA_BOYUTU,
            offset: pageParam,
          }),
        ),
        { sema: DuyuruAliciListesiSema },
      ),
    getNextPageParam: (son, sayfalar) => {
      const yuklenen = sayfalar.reduce((n, s) => n + s.ogeler.length, 0);
      return yuklenen < son.toplam && son.ogeler.length > 0 ? yuklenen : undefined;
    },
  });
}

export function useDuyuruDetayi(kurumId: string, duyuruId: string) {
  return useQuery({
    queryKey: [...duyuruAnahtari(kurumId), 'detay', duyuruId],
    refetchOnMount: 'always',
    retry: yenidenDene,
    queryFn: () => bildirimIstek(yol(kurumId, `/${duyuruId}`), { sema: DuyuruDetaySema }),
  });
}

/** Okundu isareti: liste/detay tazelenir, zil sayisi (kutu bildirimi okunur) yeniden cekilir. */
export function useDuyuruOkundu(kurumId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (duyuruId: string) =>
      bildirimIstek(yol(kurumId, `/${duyuruId}/okundu`), {
        yontem: 'POST',
        sema: DuyuruOkunduYanitiSema,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: duyuruAnahtari(kurumId) });
      void qc.invalidateQueries({ queryKey: bildirimAnahtari(kurumId) });
    },
  });
}

// --- Yazar / yonetici --------------------------------------------------------------------------

export function useDuyuruYonetimi(kurumId: string, durum: DuyuruDurum | undefined, etkin: boolean) {
  return useInfiniteQuery({
    queryKey: [...duyuruAnahtari(kurumId), 'yonetim', { durum }],
    enabled: etkin,
    retry: yenidenDene,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      bildirimIstek(
        yol(
          kurumId,
          `/yonetim${sorguDizgesi({ durum, limit: DUYURU_SAYFA_BOYUTU, offset: pageParam })}`,
        ),
        { sema: DuyuruYonetimListesiSema },
      ),
    getNextPageParam: (son, sayfalar) => {
      const yuklenen = sayfalar.reduce((n, s) => n + s.ogeler.length, 0);
      return yuklenen < son.toplam && son.ogeler.length > 0 ? yuklenen : undefined;
    },
  });
}

function useYazma<V, R>(kurumId: string, istek: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: istek,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: duyuruAnahtari(kurumId) });
      void qc.invalidateQueries({ queryKey: bildirimAnahtari(kurumId) });
    },
  });
}

export function useDuyuruOlustur(kurumId: string) {
  return useYazma(kurumId, (govde: DuyuruOlustur) =>
    bildirimIstek(yol(kurumId), { yontem: 'POST', govde, sema: DuyuruSema }),
  );
}

export function useDuyuruGuncelle(kurumId: string) {
  return useYazma(kurumId, ({ id, govde }: { id: string; govde: DuyuruGuncelle }) =>
    bildirimIstek(yol(kurumId, `/${id}`), { yontem: 'PATCH', govde, sema: DuyuruSema }),
  );
}

export function useDuyuruYayinla(kurumId: string) {
  return useYazma(kurumId, (id: string) =>
    bildirimIstek(yol(kurumId, `/${id}/yayinla`), { yontem: 'POST', sema: DuyuruSema }),
  );
}

export function useDuyuruArsivle(kurumId: string) {
  return useYazma(kurumId, (id: string) =>
    bildirimIstek(yol(kurumId, `/${id}/arsivle`), { yontem: 'POST', sema: DuyuruSema }),
  );
}

export function useDuyuruSil(kurumId: string) {
  return useYazma(kurumId, (id: string) =>
    bildirimIstek(yol(kurumId, `/${id}`), { yontem: 'DELETE', sema: DuyuruSilYanitiSema }),
  );
}

const OKUYAN_LIMITI = 500;

export function useDuyuruOkuyanlari(kurumId: string, duyuruId: string, etkin: boolean) {
  return useQuery({
    queryKey: [...duyuruAnahtari(kurumId), 'okuyanlar', duyuruId],
    enabled: etkin,
    retry: yenidenDene,
    queryFn: () =>
      bildirimIstek(
        yol(kurumId, `/${duyuruId}/okuyanlar${sorguDizgesi({ limit: OKUYAN_LIMITI })}`),
        {
          sema: DuyuruOkuyanlarSema,
        },
      ),
  });
}

const UYE_SAYFA_ENFAZLA = 25;

/**
 * Uyelik kimligi -> gorunen ad. Okuyanlar listesi yalniz uyelik kimligi verir; toplu "kimliklerle ad cozme"
 * ucu yok, bu yuzden kurumun ogrenci ve ogretmen uyeleri sayfa sayfa (200'luk) bir kez cekilip onbellege
 * alinir (kimlik basina istek yok). Rolun goremedigi liste (403) sessizce atlanir.
 */
export function useUyeAdlari(kurumId: string, etkin: boolean) {
  return useQuery({
    queryKey: ['hesap', kurumId, 'uye-adlari-duyuru'],
    enabled: etkin,
    staleTime: 5 * 60_000,
    retry: yenidenDene,
    queryFn: async () => {
      const adlar = new Map<string, string>();
      for (const rol of ['ogrenci', 'ogretmen'] as const) {
        let imlec: string | undefined;
        try {
          for (let sayfa = 0; sayfa < UYE_SAYFA_ENFAZLA; sayfa += 1) {
            const s = await hesapIstek(
              `kurumlar/${kurumId}/uyelikler${sorguDizgesi({ rol, limit: 200, imlec })}`,
              { sema: UyeListeYanitSema },
            );
            for (const u of s.uyeler) if (u.gorunen_ad) adlar.set(u.uyelik_id, u.gorunen_ad);
            if (!s.sonraki_imlec) break;
            imlec = s.sonraki_imlec;
          }
        } catch (hata) {
          if (!(hata instanceof UygulamaHatasi) || hata.durum < 400 || hata.durum >= 500)
            throw hata;
        }
      }
      return adlar;
    },
  });
}
