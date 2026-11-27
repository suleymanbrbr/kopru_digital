import { expect, test, type Page } from '@playwright/test';

/**
 * Koçluk ekranlari (mock modu): ogretmen Koçluk sekmesi, degerlendirme/oneri pencereleri, Bugun hatirlatma karti
 * ve ogrenci "Ogretmenim" sekmesi. `pnpm ekran` ile uretilir (calisan mock `pnpm start` gerekir; `E2E_MOCK_PORT` ile
 * port degisir). `EKRAN_KLASOR` ile cikti dizini degisir. Dosya adi: `kocluk-<ekran>[-mobil]-<tema>.png`.
 */

const klasor = process.env.EKRAN_KLASOR ?? 'docs/ekranlar';
const masaustu = { width: 1280, height: 900 };
const mobil = { width: 390, height: 844 };

async function giris(page: Page, kurum: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill('532 123 45 67');
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('123456');
  await expect(page).toHaveURL(/\/kvkk$/);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
  await page.getByRole('button', { name: new RegExp(kurum) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

for (const tema of ['light', 'dark'] as const) {
  for (const [ad, viewport, mobilMi] of [
    ['', masaustu, false],
    ['mobil-', mobil, true],
  ] as const) {
    test(`kocluk ${ad}${tema}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        colorScheme: tema,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        ...(mobilMi ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      const al = async (dosya: string, tam = true) => {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${klasor}/kocluk-${dosya}-${ad}${tema}.png`,
          fullPage: tam,
        });
      };

      // Ogretmen: Bugun karti, Koçluk sekmesi, pencereler
      await giris(page, 'Ege');
      await expect(page.getByTestId('degerlendirme-hatirlatma')).toBeVisible();
      await al('bugun-ogretmen', false);
      await page.goto('/kurum-ege/ogrenciler');
      await page.getByRole('link', { name: 'Çağlar Yıldız koçluk görünümü' }).click();
      await expect(page.getByTestId('kocluk')).toBeVisible();
      await expect(page.getByTestId('olcek-egilimi')).toBeVisible();
      await al('ogretmen');
      await page.getByRole('button', { name: 'Değerlendirme yaz' }).click();
      const pencere = page.getByRole('dialog', { name: 'Değerlendirme yaz' });
      await pencere.getByRole('switch', { name: 'Öğrenci görsün' }).check();
      await al('degerlendirme-formu', false);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Kaynak öner' }).click();
      await expect(page.getByRole('dialog', { name: 'Kaynak öner' })).toBeVisible();
      await al('oneri-formu', false);
      await context.close();

      // Ogrenci: Ogretmenim sekmesi
      const ogrContext = await browser.newContext({
        viewport,
        colorScheme: tema,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        ...(mobilMi ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
      });
      const ogr = await ogrContext.newPage();
      await giris(ogr, 'Atlas');
      await ogr.goto('/kurum-atlas/gunluk-soru?sekme=ogretmenim');
      await expect(ogr.getByTestId('ogretmenim')).toBeVisible();
      await ogr.mouse.move(0, 0);
      await ogr.waitForTimeout(500);
      await ogr.screenshot({
        path: `${klasor}/kocluk-ogrenci-ogretmenim-${ad}${tema}.png`,
        fullPage: true,
      });
      await ogrContext.close();
    });
  }
}
