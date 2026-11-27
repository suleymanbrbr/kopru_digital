import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import { sabitBasliklar } from './src/sunucu/csp';

// Docker imaji `NEXT_STANDALONE=1` ile derler (bagimsiz sunucu: `node apps/web/server.js`).
// Yerel gelistirme, e2e ve `next start` akisi degismez.
const standalone = process.env.NEXT_STANDALONE === '1';

const config: NextConfig = {
  ...(standalone
    ? {
        output: 'standalone' as const,
        // Monorepo koku: izlenen bagimliliklar (pnpm .pnpm deposu, workspace dist'leri) buradan toplanir.
        outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
      }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Paylasilan paketler derlenmis (dist) ESM olarak gelir.
  transpilePackages: [
    '@kopru/i18n',
    '@kopru/markdown',
    '@kopru/ui-tokens',
    '@kopru/api-client',
    '@kopru/contracts',
  ],
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
