import { t } from '@kopru/i18n';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

import './globals.css';

export const metadata: Metadata = {
  title: { default: t('yonetim.sayfaBasligi'), template: `%s · ${t('yonetim.sayfaBasligi')}` },
  robots: { index: false, follow: false },
};

export default function KokDuzen({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
