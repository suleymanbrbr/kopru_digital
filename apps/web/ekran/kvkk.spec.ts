import { expect, test, type Page } from '@playwright/test';

/** KVKK Hesabim ekranlari (mock modu). `pnpm ekran` ile uretilir; docs/ekranlar/kvkk-*.png. */
const klasor = 'docs/ekranlar';
const masaustu = { width: 1280, height: 800 };

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
  test(`kvkk hesabim ${tema}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: masaustu,
      colorScheme: tema,
      locale: 'tr-TR',
    });
    const page = await context.newPage();
    const al = async (ad: string, tam = false) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${klasor}/kvkk-${ad}-${tema}.png`, fullPage: tam });
    };
    await giris(page, 'Atlas');
    await page.goto('/kurum-atlas/ayarlar/hesabim');
    await expect(page.getByRole('button', { name: /Hesabımı sil/ })).toBeVisible();
    await al('hesabim', true);

    await page.getByRole('button', { name: /Hesabımı sil/ }).click();
    const pencere = page.getByRole('dialog');
    await pencere.getByLabel('Parolam').check();
    await pencere.getByLabel('Parola', { exact: true }).fill('parola123');
    await al('dogrulama');
    await pencere.getByRole('button', { name: 'Silme talebini başlat' }).click();
    await expect(page.getByTestId('silme-bekleyen')).toBeVisible();
    await al('bekleyen', true);
    await page.getByRole('button', { name: 'Talebi geri al' }).click();
    await expect(page.getByTestId('silme-bekleyen')).toBeHidden();

    await context.close();

    // Sahip engeli: senaryo cerezi giristen ONCE ayarlanir.
    const engelBaglam = await browser.newContext({
      viewport: masaustu,
      colorScheme: tema,
      locale: 'tr-TR',
    });
    await engelBaglam.addCookies([
      {
        name: 'mock_senaryo',
        value: `kvkk${tema}:kvkk-engel`,
        url: `http://localhost:${process.env.E2E_MOCK_PORT ?? '3000'}`,
      },
    ]);
    const sayfa = await engelBaglam.newPage();
    await giris(sayfa, 'Atlas');
    await sayfa.goto('/kurum-atlas/ayarlar/hesabim');
    await expect(sayfa.getByTestId('silme-engel')).toBeVisible();
    await sayfa.mouse.move(0, 0);
    await sayfa.waitForTimeout(400);
    await sayfa.screenshot({ path: `${klasor}/kvkk-sahip-engeli-${tema}.png`, fullPage: true });
    await engelBaglam.close();
  });
}
