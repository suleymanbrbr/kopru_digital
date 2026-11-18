import { expect, test, type Page } from '@playwright/test';

/**
 * Bildirim ekranlari (mock modu): zil acilir listesi, bildirimler sayfasi, bos durum, tercihler.
 * `pnpm ekran` ile uretilir (calisan mock `pnpm start` gerekir; `E2E_MOCK_PORT` ile port degisir).
 * Ogrenci (`Atlas`) ve ogretmen (`Ege`) icin acik/koyu tema, masaustu ve dar ekran.
 */

const klasor = 'docs/ekranlar';
const masaustu = { width: 1280, height: 800 };
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
    test(`bildirim ${ad}${tema}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        colorScheme: tema,
        locale: 'tr-TR',
        ...(mobilMi ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      const al = async (dosya: string, tam = false) => {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${klasor}/${ad}${dosya}-${tema}.png`, fullPage: tam });
      };
      const zil = page.getByTestId('bildirim-zili').filter({ visible: true });

      await giris(page, 'Atlas');
      await expect(page.getByTestId('bildirim-rozeti').filter({ visible: true })).toBeVisible();
      await zil.click();
      await expect(page.getByRole('dialog', { name: 'Son bildirimler' })).toBeVisible();
      await al('bildirim-zil-ogrenci');
      await page.keyboard.press('Escape');

      await page.goto('/kurum-atlas/bildirimler');
      await expect(page.getByTestId('bildirim-satiri').first()).toBeVisible();
      await al('bildirimler-ogrenci', true);
      await page.getByRole('button', { name: /^Okunmamış/ }).click();
      await expect(page.getByTestId('bildirim-satiri').first()).toBeVisible();
      await al('bildirimler-okunmamis-ogrenci');

      await page.goto('/kurum-atlas/ayarlar/bildirimler');
      await expect(
        page.getByRole('heading', { name: 'Bildirim tercihleri', level: 1 }),
      ).toBeVisible();
      await al('bildirim-tercihleri-ogrenci', true);

      await page.goto('/kurum-sec');
      await page.getByRole('button', { name: /Ege Işık/ }).click();
      await expect(page).toHaveURL(/\/kurum-ege\/bugun$/);
      await page.goto('/kurum-ege/bildirimler');
      await expect(page.getByTestId('bildirim-satiri').first()).toBeVisible();
      await al('bildirimler-ogretmen', true);
      await context.close();
    });
  }
}
