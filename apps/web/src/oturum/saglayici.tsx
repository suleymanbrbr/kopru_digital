'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';

import { oturumSema, type Oturum, type RizaKabul } from './tipler';

import { bffIstek } from '@/lib/api';

export type OturumDurumu =
  { tur: 'yukleniyor' } | { tur: 'girissiz' } | { tur: 'hazir'; oturum: Oturum };

/**
 * Erisim belirteci yalnizca bellekte (modul degiskeni) tutulur: localStorage'a ya da
 * cerezlere yazilmaz. Sayfa yenilenince httpOnly cerez ile `/api/oturum/yenile` yeniden alir.
 */
let bellekBelirteci: string | null = null;
export const erisimBelirteciAl = (): string | null => bellekBelirteci;

/** 401 alan istekler belirteci bir kez yenileyip tekrar dener (saglayici kurulunca baglanir). */
let yenileKancasi: (() => Promise<Oturum | null>) | null = null;
export const belirteciYenile = (): Promise<Oturum | null> =>
  yenileKancasi ? yenileKancasi() : Promise.resolve(null);

export interface OturumBaglami {
  durum: OturumDurumu;
  kodIste: (telefon: string) => Promise<{ yenidenSn: number }>;
  kodDogrula: (telefon: string, kod: string) => Promise<Oturum>;
  /** Etkin uyelik/kurum degistirir ya da belirteci yeniler. */
  yenile: (secim?: { uyelikId?: string; kurumId?: string }) => Promise<Oturum | null>;
  rizaKabul: (kabul: RizaKabul) => Promise<void>;
  cikis: () => Promise<void>;
}

const Baglam = createContext<OturumBaglami | null>(null);

const yenidenSema = z.object({ yenidenSn: z.number() });
/** Sureyi dolmadan once belirteci tazele (ms). */
const ONCEDEN_MS = 60_000;

export function OturumSaglayici({ children }: { children: ReactNode }) {
  const [durum, setDurum] = useState<OturumDurumu>({ tur: 'yukleniyor' });
  const durumRef = useRef(durum);
  const uctaki = useRef<Promise<Oturum | null> | null>(null);
  const sorgular = useQueryClient();

  const oturumKoy = useCallback((oturum: Oturum | null) => {
    bellekBelirteci = oturum?.erisimBelirteci ?? null;
    const sonraki: OturumDurumu = oturum ? { tur: 'hazir', oturum } : { tur: 'girissiz' };
    durumRef.current = sonraki;
    setDurum(sonraki);
  }, []);

  const yenile = useCallback<OturumBaglami['yenile']>(
    (secim) => {
      // Ayni anda tek yenileme; ikinci cagri ilkinin sonucunu paylasir.
      if (uctaki.current) return uctaki.current;
      const istek = bffIstek('/api/oturum/yenile', {
        govde: secim ?? {},
        sema: oturumSema,
      })
        .then((oturum) => {
          oturumKoy(oturum);
          return oturum;
        })
        .catch((hata: unknown) => {
          if (hata instanceof Error && 'durum' in hata && hata.durum === 401) {
            oturumKoy(null);
            return null;
          }
          throw hata;
        })
        .finally(() => {
          uctaki.current = null;
        });
      uctaki.current = istek;
      return istek;
    },
    [oturumKoy],
  );

  useEffect(() => {
    yenileKancasi = () =>
      yenile(
        durumRef.current.tur === 'hazir' && durumRef.current.oturum.aktifUyelikId
          ? { uyelikId: durumRef.current.oturum.aktifUyelikId }
          : {},
      );
    return () => {
      yenileKancasi = null;
    };
  }, [yenile]);

  // Acilista cerezden oturumu geri kur.
  useEffect(() => {
    yenile().catch(() => {
      oturumKoy(null);
    });
  }, [yenile, oturumKoy]);

  // Belirtec dolmadan once sessizce tazele.
  const bitisAt = durum.tur === 'hazir' ? durum.oturum.bitisAt : null;
  const aktifUyelikId = durum.tur === 'hazir' ? durum.oturum.aktifUyelikId : null;
  useEffect(() => {
    if (!bitisAt) return;
    const bekleme = Math.max(new Date(bitisAt).getTime() - Date.now() - ONCEDEN_MS, 5_000);
    const zamanlayici = setTimeout(() => {
      yenile(aktifUyelikId ? { uyelikId: aktifUyelikId } : {}).catch(() => undefined);
    }, bekleme);
    return () => {
      clearTimeout(zamanlayici);
    };
  }, [bitisAt, aktifUyelikId, yenile]);

  const deger = useMemo<OturumBaglami>(
    () => ({
      durum,
      kodIste: (telefon) =>
        bffIstek('/api/oturum/kod-iste', { govde: { telefon }, sema: yenidenSema }),
      kodDogrula: async (telefon, kod) => {
        const oturum = await bffIstek('/api/oturum/kod-dogrula', {
          govde: { telefon, kod },
          sema: oturumSema,
        });
        oturumKoy(oturum);
        return oturum;
      },
      yenile,
      rizaKabul: async (kabul) => {
        await bffIstek('/api/oturum/riza', { govde: kabul });
        await yenile(
          durumRef.current.tur === 'hazir' && durumRef.current.oturum.aktifUyelikId
            ? { uyelikId: durumRef.current.oturum.aktifUyelikId }
            : {},
        );
      },
      cikis: async () => {
        await bffIstek('/api/oturum/cikis', { yontem: 'POST', govde: {} }).catch(() => undefined);
        sorgular.clear();
        oturumKoy(null);
      },
    }),
    [durum, yenile, oturumKoy, sorgular],
  );

  return <Baglam value={deger}>{children}</Baglam>;
}

export function useOturum(): OturumBaglami {
  const baglam = useContext(Baglam);
  if (!baglam) throw new Error('useOturum, OturumSaglayici icinde kullanilmalidir.');
  return baglam;
}
