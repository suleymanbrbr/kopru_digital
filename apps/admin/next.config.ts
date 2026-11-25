import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// Docker imaji `NEXT_STANDALONE=1` ile derler (bagimsiz sunucu: `node apps/admin/server.js`).
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
  transpilePackages: ['@kopru/i18n', '@kopru/ui-tokens', '@kopru/contracts'],
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]);
  },
};

export default config;
