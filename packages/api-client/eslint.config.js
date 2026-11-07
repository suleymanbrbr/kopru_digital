import { createConfig } from '@kopru/config/eslint';

// Uretilen tip dosyalari (openapi-typescript ciktisi) lint kapsami disindadir.
export default [
  { ignores: ['src/generated/**'] },
  ...createConfig({ rootDir: import.meta.dirname }),
];
