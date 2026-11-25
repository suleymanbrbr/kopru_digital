import type { NextConfig } from 'next';

import { sabitBasliklar } from './src/sunucu/csp';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Paylasilan paketler derlenmis (dist) ESM olarak gelir.
  transpilePackages: ['@kopru/i18n', '@kopru/ui-tokens', '@kopru/api-client', '@kopru/contracts'],
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: sabitBasliklar(process.env.NODE_ENV === 'production'),
      },
    ]);
  },
};

export default config;
