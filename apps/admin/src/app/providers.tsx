'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';

import { YonetimHatasi } from '@/lib/api';
import { KAPI_KODLARI } from '@/lib/hata';

/** Oturum bitti -> giris; ikinci adim eksik -> dogrulama ekrani. Diger hatalar cagirana birakilir. */
function kapiHatasi(hata: unknown, git: (yol: string) => void): void {
  if (!(hata instanceof YonetimHatasi)) return;
  const yol = window.location.pathname;
  if (hata.kod === KAPI_KODLARI.oturumYok && yol !== '/giris') {
    git('/giris');
  } else if (hata.kod === KAPI_KODLARI.ikinciAdim && yol !== '/dogrulama') {
    git('/dogrulama');
  }
}

/** Sorgu ve islem hatalarini dinler: oturum/ikinci adim kapisi her sayfada ayni davranir. */
function KapiDinleyici() {
  const router = useRouter();
  const istemci = useQueryClient();
  useEffect(() => {
    const git = (yol: string) => {
      router.replace(yol);
    };
    const sorgular = istemci.getQueryCache().subscribe((olay) => {
      if (olay.type === 'updated' && olay.action.type === 'error') {
        kapiHatasi(olay.action.error, git);
      }
    });
    const islemler = istemci.getMutationCache().subscribe((olay) => {
      if (olay.type === 'updated' && olay.action.type === 'error') {
        kapiHatasi(olay.action.error, git);
      }
    });
    return () => {
      sorgular();
      islemler();
    };
  }, [istemci, router]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [istemci] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (sayi, hata) =>
              !(hata instanceof YonetimHatasi && hata.durum >= 400 && hata.durum < 500) && sayi < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={istemci}>
        <KapiDinleyici />
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
