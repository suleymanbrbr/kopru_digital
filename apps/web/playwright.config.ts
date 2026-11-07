import { defineConfig, devices } from '@playwright/test';

const port = 3000;
/** Konteynerde Playwright tarayicisi indirilemiyorsa yerel Chrome: PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome */
const chromeYolu = process.env.PLAYWRIGHT_CHROME_PATH;
const kullan = chromeYolu ? { launchOptions: { executablePath: chromeYolu } } : {};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    ...kullan,
  },
  projects: [
    {
      name: 'masaustu',
      use: { ...devices['Desktop Chrome'], ...kullan, viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobil', use: { ...devices['Pixel 7'], ...kullan } },
  ],
  webServer: {
    // E2E_HAZIR=1: build zaten yapildi (CI). Aksi halde mock modunda build edilip baslatilir.
    command: process.env.E2E_HAZIR ? 'pnpm start' : 'pnpm build && pnpm start',
    url: `http://localhost:${String(port)}/giris`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { NEXT_PUBLIC_API_MOCK: '1' },
  },
});
