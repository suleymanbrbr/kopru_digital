import { defineConfig, devices } from '@playwright/test';

const chromeYolu = process.env.PLAYWRIGHT_CHROME_PATH;
const kullan = chromeYolu ? { launchOptions: { executablePath: chromeYolu } } : {};

/** Ekran goruntusu uretimi: `pnpm ekran` (calisan bir `pnpm start` ve mock modu gerekir). */
export default defineConfig({
  testDir: './ekran',
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    ...kullan,
  },
  projects: [{ name: 'ekran', use: { ...devices['Desktop Chrome'], ...kullan } }],
});
