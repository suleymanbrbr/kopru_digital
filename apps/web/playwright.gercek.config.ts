import { defineConfig, devices } from '@playwright/test';

/** `E2E_WEB_PORT` ile degistirilebilir (paralel calisan baska bir web ile cakismamak icin). */
const port = Number(process.env.E2E_WEB_PORT ?? 3100);
const chromeYolu = process.env.PLAYWRIGHT_CHROME_PATH;
const kullan = chromeYolu ? { launchOptions: { executablePath: chromeYolu } } : {};

/**
 * Gercek api'ye karsi e2e: `pnpm e2e:gercek`. Mock kapali (`NEXT_PUBLIC_API_MOCK=0`), web `next dev`
 * ile 3100'de calisir (mock e2e'nin `.next` derlemesiyle cakismaz). CI'daki `web-e2e` isi bu
 * config'i kullanmaz. Api erisilemezse testler acik mesajla atlanir.
 */
export default defineConfig({
  testDir: './e2e-gercek',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...kullan,
  },
  projects: [{ name: 'gercek-api', use: { ...devices['Desktop Chrome'], ...kullan } }],
  webServer: {
    command: `pnpm run hazirla && pnpm exec next dev --port ${String(port)}`,
    url: `http://localhost:${String(port)}/giris`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_MOCK: '0',
      API_URL: process.env.API_URL ?? 'http://localhost:4000',
      MEDYA_URL: process.env.MEDYA_URL ?? 'http://localhost:4003',
    },
  },
});
