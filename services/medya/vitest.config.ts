import { defineVitestConfig } from '@kopru/config/vitest';

export default defineVitestConfig({
  test: {
    // Silme/isleme isleri kiracilar arasi calisir; dosyalar paylasilan test veritabaninda sirayla kosar.
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'], testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
