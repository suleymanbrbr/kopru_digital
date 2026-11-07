import { t } from '@kopru/i18n';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

import './globals.css';

export const metadata: Metadata = {
  title: { default: t('marka.ad'), template: `%s · ${t('marka.ad')}` },
  description: t('marka.sloganAciklama'),
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E14' },
  ],
};

export default function KokDuzen({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="antialiased">
        <a
          href="#icerik"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-orta focus:bg-yuzey focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
        >
          {t('nav.icerigeGec')}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
