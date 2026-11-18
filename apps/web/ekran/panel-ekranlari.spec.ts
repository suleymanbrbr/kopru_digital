import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Yonetici paneli ve modul ayarlari ekran goruntuleri (mock modu): `pnpm exec playwright test
 * --config playwright.ekran.config.ts ekran/panel-ekranlari.spec.ts` (calisan `pnpm start`, mock modu).
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

async function menu(page: Page, ad: string, mobilMi: boolean) {
  if (mobilMi) await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: ad }).click();
}

async function oturum(browser: Browser, tema: 'light' | 'dark', mobilMi: boolean) {
  const context = await browser.newContext(
    mobilMi
      ? {
          viewport: mobil,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          colorScheme: tema,
          locale: 'tr-TR',
        }
      : { viewport: masaustu, colorScheme: tema, locale: 'tr-TR' },
  );
  return { context, page: await context.newPage() };
}

for (const tema of ['light', 'dark'] as const) {
  test(`panel masaustu ${tema}`, async ({ browser }) => {
    const { context, page } = await oturum(browser, tema, false);
    const al = async (ad: string, tamSayfa = false) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${klasor}/${ad}-${tema}.png`, fullPage: tamSayfa });
    };

    await giris(page, 'Kuzey');
    await menu(page, 'Panel', false);
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Gruplar' })).toBeVisible();
    await al('panel-sahip', true);

    // Sayiya tiklayinca altindaki liste.
    await page
      .getByRole('table', { name: 'Gruplar' })
      .getByRole('button', { name: /^Devam oranı, 9-A Sınıfı:/ })
      .click();
    await expect(page.getByTestId('alt-liste')).toBeVisible();
    await al('panel-alt-liste', true);

    await menu(page, 'Modüller', false);
    await expect(page.getByRole('heading', { name: 'Modüller', level: 1 })).toBeVisible();
    await page.getByLabel('Grup', { exact: true }).selectOption({ label: '9-A Sınıfı' });
    await al('moduller', true);

    await page.goto('/kurum-sec');
    await page.getByRole('button', { name: /Ege Işık/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await menu(page, 'Panel', false);
    await expect(page.getByRole('table', { name: 'Gruplar' })).toBeVisible();
    await al('panel-ogretmen', true);
    await context.close();
  });

  test(`panel mobil ${tema}`, async ({ browser }) => {
    const { context, page } = await oturum(browser, tema, true);
    await giris(page, 'Mavi');
    await menu(page, 'Panel', true);
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Gruplar' })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${klasor}/mobil-panel-yonetici-${tema}.png`, fullPage: true });
    await context.close();
  });
}
