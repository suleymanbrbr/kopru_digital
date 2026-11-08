import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

async function ihlaller(page: Page) {
  // Sayfa gecisinde <title> ayrica akar; tarama basliktan once calisirsa document-title yanlis alarm verir.
  await expect(page).toHaveTitle(/.+/);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`erisilebilirlik (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('giris ekrani', async ({ page }) => {
      await page.goto('/giris');
      await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });

    test('KVKK ve bugun ekrani', async ({ page }) => {
      await girisYap(page, 'Ege Işık Dershanesi', { kvkkOnay: false });
      await expect(page.getByRole('checkbox')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Veri sorumlusu' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);

      await page.getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
      await page.getByRole('button', { name: /Ege Işık Dershanesi/ }).click();
      await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });
  });
}
