'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';

import { OturumSaglayici } from '@/oturum/saglayici';

export function Providers({ children }: { children: ReactNode }) {
  const [istemci] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={istemci}>
        <OturumSaglayici>{children}</OturumSaglayici>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
