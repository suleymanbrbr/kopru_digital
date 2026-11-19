'use client';

import type { AbonelikYanitSema, PlanLimitiDetay } from '@kopru/contracts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { z } from 'zod';

import { useKurum } from './baglam';

import { AskiEkrani } from '@/components/abonelik/aski-ekrani';
import { PlanLimitiPenceresi } from '@/components/abonelik/plan-limiti-penceresi';
import { planLimitiDetayi } from '@/lib/abonelik/bicim';
import { useAbonelik } from '@/lib/abonelik/veri';
import { ABONELIK_HATA_OLAYI, type AbonelikHataOlayi } from '@/lib/api';

export interface KurumAbonelikDurumu {
  /** Abonelik gecersiz: yazma istekleri 402 `abonelik_gerekli` doner; veri gorunmeye devam eder. */
  saltOkunur: boolean;
  /** Yalniz sahip icin bilinir (`GET /abonelik`); diger roller `null`. */
  abonelik: z.output<typeof AbonelikYanitSema> | null;
}

const Baglam = createContext<KurumAbonelikDurumu>({ saltOkunur: false, abonelik: null });
export const useKurumAbonelik = () => useContext(Baglam);

/**
 * Kurum duzeyi abonelik durumu: sahip icin `GET /abonelik` ile onden bilinir; diger roller icin
 * `402 abonelik_gerekli` yanitindan ogrenilir. `402 plan_limiti` yukseltme penceresini, `403 kurum_askida`
 * ask ekranini acar (hata olayi `bffIstek`ten gelir; mevcut veri gorunmeye devam eder).
 */
export function AbonelikDurumKatmani({ children }: { children: ReactNode }) {
  const { rol, uyelik } = useKurum();
  const sahip = rol === 'sahip';
  const sorgu = useAbonelik(uyelik.kurumId, sahip);
  const [olayKilidi, setOlayKilidi] = useState(false);
  const [askida, setAskida] = useState(false);
  const [limit, setLimit] = useState<PlanLimitiDetay | null>(null);

  useEffect(() => {
    const dinle = (olay: Event) => {
      const { kod, detaylar } = (olay as CustomEvent<AbonelikHataOlayi>).detail;
      if (kod === 'kurum_askida') setAskida(true);
      else if (kod === 'abonelik_gerekli') setOlayKilidi(true);
      else
        setLimit(planLimitiDetayi(detaylar) ?? { limit: 'max_ogrenci', mevcut: 0, ust_sinir: 0 });
    };
    window.addEventListener(ABONELIK_HATA_OLAYI, dinle);
    return () => {
      window.removeEventListener(ABONELIK_HATA_OLAYI, dinle);
    };
  }, []);

  const deger = useMemo<KurumAbonelikDurumu>(
    () => ({
      // Sahipte sorgu kesin bilgidir (odeme sonrasi kilit kalkar); digerlerinde 402 olayi.
      saltOkunur: sorgu.data ? sorgu.data.yazma_kilitli : olayKilidi,
      abonelik: sorgu.data ?? null,
    }),
    [sorgu.data, olayKilidi],
  );

  if (askida) return <AskiEkrani />;

  return (
    <Baglam value={deger}>
      {children}
      <PlanLimitiPenceresi
        limit={limit}
        degisti={() => {
          setLimit(null);
        }}
      />
    </Baglam>
  );
}
