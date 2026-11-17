import { defineVitestConfig } from '@kopru/config/vitest';

export default defineVitestConfig({
  test: {
    // Testler paylasilan test veritabanini ve NATS'i kullanir; dosyalar sirayla kosar.
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
