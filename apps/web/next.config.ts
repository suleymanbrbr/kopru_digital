import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

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
  transpilePackages: ['@kopru/i18n', '@kopru/ui-tokens', '@kopru/api-client', '@kopru/contracts'],
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]);
  },
};

export default config;
