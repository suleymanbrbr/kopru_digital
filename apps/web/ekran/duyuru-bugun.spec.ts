import { expect, test, type Page } from '@playwright/test';

/**
 * Duyurular ve Bugun ekranlari (mock modu). `pnpm ekran` ile uretilir (calisan mock `pnpm start` gerekir;
 * `E2E_MOCK_PORT` ile port degisir). `EKRAN_KLASOR` ile cikti dizini degisir.
 * Bugun ekran goruntuleri tam sayfa degil gorunum alanidir: "Bugun ne yapmalıyım?" kaydirmadan gorunmeli.
 */

const klasor = process.env.EKRAN_KLASOR ?? 'docs/ekranlar';
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
    test(`duyuru ve bugun ${ad}${tema}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        colorScheme: tema,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        ...(mobilMi ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      const al = async (dosya: string, tam = false) => {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${klasor}/${ad}${dosya}-${tema}.png`, fullPage: tam });
      };

      // Ogrenci: Bugun (gorunum alani) ve duyurular
      await giris(page, 'Atlas');
      await expect(page.getByTestId('bugun-duyuru-karti')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Yol arkadaşın' })).toBeVisible();
      await al('bugun-ogrenci-ekran');
      await page.goto('/kurum-atlas/duyurular');
      await expect(page.getByTestId('duyuru-satiri').first()).toBeVisible();
      await al('duyurular-ogrenci', true);
      await page.getByRole('link', { name: /Deneme sınavı takvimi/ }).click();
      await expect(page.getByTestId('duyuru-detay')).toBeVisible();
      await al('duyuru-detay-ogrenci');

      // Ogretmen: Bugun, duyurular (gelen ve yonetim), yeni duyuru formu
      await page.goto('/kurum-sec');
      await page.getByRole('button', { name: /Ege Işık/ }).click();
      await expect(page).toHaveURL(/\/kurum-ege\/bugun$/);
      await expect(page.getByTestId('bugun-hizli-eylemler')).toBeVisible();
      await al('bugun-ogretmen-ekran');
      await page.goto('/kurum-ege/duyurular');
      await page.getByRole('button', { name: 'Yönetim' }).click();
      await expect(page.getByTestId('duyuru-yonetim-satiri').first()).toBeVisible();
      await al('duyurular-yonetim-ogretmen', true);
      await page.getByRole('button', { name: 'Yeni duyuru' }).click();
      await expect(page.getByRole('dialog', { name: 'Yeni duyuru' })).toBeVisible();
      await al('duyuru-formu-ogretmen');
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: /Yarınki sınav için hazırlık notu/ }).click();
      await expect(page.getByTestId('duyuru-yonetim')).toBeVisible();
      await page.getByRole('button', { name: 'Okuyanları göster' }).click();
      await expect(page.getByTestId('duyuru-okuyanlar')).toBeVisible();
      await al('duyuru-detay-yazar', true);
      await context.close();
    });
  }
}
