import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { PlatformMesaji } from '../api/abonelikTipleri';
import { useAktif, useServisler } from './baglam';

/** Ekran acilisindaki saat (render icinde `Date.now` cagrilmaz; test saati `jest.zaman.js` ile sabit). */
export function useSimdi(): number {
  const [simdi] = useState(() => Date.now());
  return simdi;
}

/** Abonelik yalnız sahibe aittir; diger roller bu uclari hic cagirmaz (403 olurdu). */
export function useSahipMi(): boolean {
  return useAktif()?.uyelik.rol === 'sahip';
}

function useKurumId(): string | undefined {
  return useAktif()?.uyelik.kurumId;
}

export function useAbonelikOzeti() {
  const { adaptorler } = useServisler();
  const kurumId = useKurumId();
  const sahip = useSahipMi();
  return useQuery({
    queryKey: ['abonelik', kurumId, 'ozet'],
    queryFn: () => adaptorler.abonelik.ozet(),
    enabled: !!kurumId && sahip,
  });
}

export function useAbonelikPlanlari() {
  const { adaptorler } = useServisler();
  const kurumId = useKurumId();
  const sahip = useSahipMi();
  return useQuery({
    queryKey: ['abonelik', kurumId, 'planlar'],
    queryFn: () => adaptorler.abonelik.planlar(),
    enabled: !!kurumId && sahip,
  });
}

/** Mağaza teklifleri (RevenueCat); once kurum kimligiyle `logIn` yapilir. */
export function useMagazaTeklifleri() {
  const { magaza } = useServisler();
  const kurumId = useKurumId();
  const sahip = useSahipMi();
  return useQuery({
    queryKey: ['abonelik', kurumId, 'magaza'],
    queryFn: async () => {
      if (kurumId) await magaza.logIn(kurumId);
      return magaza.teklifleriGetir();
    },
    enabled: !!kurumId && sahip,
    retry: false,
  });
}

const KAPATILAN_ANAHTAR = 'kopru.platform-mesaji.kapatilan';

/**
 * Platform mesaji: acilista ve uygulama one gelince (kimliksiz uc). Kapatilan mesajin kimligi
 * cihazda hatirlanir; yeni mesaj yeniden gorunur.
 */
export function usePlatformMesaji(): { mesaj: PlatformMesaji | null; kapat: () => void } {
  const { adaptorler, yerelDepo, queryClient } = useServisler();
  const [kapatilan, setKapatilan] = useState<string | null>(() => {
    try {
      return yerelDepo.getString(KAPATILAN_ANAHTAR) ?? null;
    } catch {
      return null;
    }
  });
  const q = useQuery({
    queryKey: ['platform-mesaji'],
    queryFn: () => adaptorler.abonelik.platformMesaji(),
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    const abone = AppState.addEventListener('change', (d) => {
      if (d === 'active') void queryClient.invalidateQueries({ queryKey: ['platform-mesaji'] });
    });
    return () => {
      abone.remove();
    };
  }, [queryClient]);

  const mesaj = q.data ?? null;
  return {
    mesaj: mesaj && mesaj.id !== kapatilan ? mesaj : null,
    kapat: () => {
      if (!mesaj) return;
      try {
        yerelDepo.set(KAPATILAN_ANAHTAR, mesaj.id);
      } catch {
        // depo yazilamazsa yalniz bu oturum icin gizlenir
      }
      setKapatilan(mesaj.id);
    },
  };
}
