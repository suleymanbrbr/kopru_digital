import { expect, test, type Page } from '@playwright/test';

const klasor = 'docs/ekranlar';
const masaustu = { width: 1280, height: 800 };
const mobil = { width: 390, height: 844 };

async function giris(page: Page, kurum: string | null) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill('532 123 45 67');
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('123456');
  await expect(page).toHaveURL(/\/kvkk$/);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
  if (kurum) {
    await page.getByRole('button', { name: new RegExp(kurum) }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
}

for (const tema of ['light', 'dark'] as const) {
  test(`masaustu ${tema}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: masaustu,
      colorScheme: tema,
      locale: 'tr-TR',
    });
    const page = await context.newPage();
    const al = (ad: string) => page.screenshot({ path: `${klasor}/${ad}-${tema}.png` });

    await page.goto('/giris');
    await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
    await page.waitForTimeout(1600);
    await al('giris-telefon');

    await page.getByLabel('Telefon numaran').fill('532 123 45 67');
    await page.getByRole('button', { name: 'Kod gönder' }).click();
    await page
      .getByLabel('SMS ile gelen 6 haneli kodu gir')
      .pressSequentially('123', { delay: 30 });
    await al('giris-kod');
    await page.getByLabel('SMS ile gelen 6 haneli kodu gir').pressSequentially('456');
    await expect(page).toHaveURL(/\/kvkk$/);
    await expect(page.getByRole('heading', { name: 'Veri sorumlusu' })).toBeVisible();
    await page.getByRole('checkbox').click();
    await al('kvkk');
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/kurum-sec$/);
    await expect(page.getByRole('button', { name: /Ege/ })).toBeVisible();
    await al('kurum-sec');

    await page.getByRole('button', { name: /Ege Işık/ }).click();
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
    await al('bugun-ogretmen');

    await page.goto('/kurum-sec');
    await page.getByRole('button', { name: /Atlas/ }).click();
    await expect(page.getByRole('heading', { name: 'Bugünkü görevler' })).toBeVisible();
    await page.waitForTimeout(300);
    await al('bugun-ogrenci');

    await page.goto('/kurum-sec');
    await page.getByRole('button', { name: /Mavi Kule/ }).click();
    await expect(page.getByRole('heading', { name: 'Bugün kurumda' })).toBeVisible();
    await al('bugun-yonetici');
    await context.close();
  });

  test(`mobil ${tema}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: mobil,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: tema,
      locale: 'tr-TR',
    });
    const page = await context.newPage();
    await page.goto('/giris');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${klasor}/mobil-giris-${tema}.png` });

    await giris(page, 'Atlas');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${klasor}/mobil-bugun-ogrenci-${tema}.png` });

    await page.getByRole('button', { name: 'Menü' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${klasor}/mobil-menu-ogrenci-${tema}.png` });
    await context.close();
  });
}
