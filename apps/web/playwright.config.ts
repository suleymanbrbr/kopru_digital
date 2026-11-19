import { defineConfig, devices } from '@playwright/test';

/** `E2E_MOCK_PORT` ile degistirilebilir (baska bir surecle cakismamak icin). */
const port = Number(process.env.E2E_MOCK_PORT ?? 3000);
/** Konteynerde Playwright tarayicisi indirilemiyorsa yerel Chrome: PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome */
const chromeYolu = process.env.PLAYWRIGHT_CHROME_PATH;
const kullan = chromeYolu ? { launchOptions: { executablePath: chromeYolu } } : {};

/**
 * Tek e2e "simdi"si: referans an = kosu gununun Istanbul tarihi, saat 12:00 (`E2E_SIMDI_ISO` ile
 * degistirilebilir, ornegin `2026-11-18T23:30:00+03:00`). Gercek saate gore sabit kayma `E2E_KAYMA_MS`
 * olarak hem web sunucusuna (mock veri) hem testlere/tarayiciya gecer; gecen sure korunur. Ilk
 * degerlendirmede (ana surec) hesaplanir, isci surecler ortamdan miras alir.
 */
function referansAn(): number {
  if (process.env.E2E_SIMDI_ISO) return Date.parse(process.env.E2E_SIMDI_ISO);
  const gun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  return Date.parse(`${gun}T12:00:00+03:00`);
}
process.env.E2E_KAYMA_MS ??= String(referansAn() - Date.now());

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
    command: process.env.E2E_HAZIR
      ? `pnpm exec next start --port ${String(port)}`
      : `pnpm build && pnpm exec next start --port ${String(port)}`,
    url: `http://localhost:${String(port)}/giris`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { NEXT_PUBLIC_API_MOCK: '1', E2E_KAYMA_MS: process.env.E2E_KAYMA_MS ?? '0' },
  },
});
