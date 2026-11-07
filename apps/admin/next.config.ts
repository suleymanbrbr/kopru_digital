import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@kopru/i18n', '@kopru/ui-tokens'],
};

export default config;
