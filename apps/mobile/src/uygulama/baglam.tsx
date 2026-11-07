import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { queryOnlineYonetiminiBagla } from '../offline/ag';
import type { AktifBaglam, OturumDurumu } from '../oturum/yonetici';

import { servisleriKur, type Servisler } from './servisler';

const Baglam = createContext<Servisler | null>(null);

export function useServisler(): Servisler {
  const s = useContext(Baglam);
  if (!s) throw new Error('useServisler, UygulamaSaglayicilari disinda kullanildi.');
  return s;
}

export function useOturum(): OturumDurumu {
  return useServisler().oturum.depo.kullan();
}

/** Etkin kurum/uyelik baglami; yoksa null. */
export function useAktif(): AktifBaglam | null {
  const d = useOturum();
  return d.asama === 'giris' ? d.aktif : null;
}

export function UygulamaSaglayicilari({ children }: { children: ReactNode }) {
  const [servisler] = useState(servisleriKur);

  useEffect(() => {
    queryOnlineYonetiminiBagla();
    void servisler.oturum.baslat();
    return servisler.kuyruk.baglan(servisler.agGozlemcisi);
  }, [servisler]);

  return (
    <Baglam.Provider value={servisler}>
      <PersistQueryClientProvider
        client={servisler.queryClient}
        persistOptions={{
          persister: servisler.persister,
          maxAge: 24 * 60 * 60 * 1000,
          buster: servisler.cacheBuster,
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </Baglam.Provider>
  );
}
