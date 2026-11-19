import { defineConfig, devices } from '@playwright/test';

/**
 * Gercek api + motivasyon'a karsi deneme: `pnpm e2e:gercek`. Admin `next build && next start` ile
 * onceden calistirilmis olmali (`E2E_ADMIN_PORT`, varsayilan 3101); bu config sunucu baslatmaz.
 * Ortam: `GERCEK_TELEFON` (platform yoneticisinin telefonu), `GERCEK_EKRAN_DIZINI` (ekran goruntuleri).
 */
const port = Number(process.env.E2E_ADMIN_PORT ?? 3101);
const chromeYolu = process.env.PLAYWRIGHT_CHROME_PATH;
const kullan = chromeYolu ? { launchOptions: { executablePath: chromeYolu } } : {};

export default defineConfig({
  testDir: './e2e-gercek',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${String(port)}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    ...kullan,
  },
  projects: [{ name: 'gercek-api', use: { ...devices['Desktop Chrome'], ...kullan } }],
});
