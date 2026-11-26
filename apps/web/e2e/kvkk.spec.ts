import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

import { abonelikSenaryosu, girisYap, test } from './yardimcilar';

/** KVKK Hesabim ekrani (mock): veri indirme, silme talebi (parola), geri alma, sahip engeli. */
test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

test('ogrenci: verisini indirir, silme talebi acar ve geri alir', async ({ page }) => {
  await girisYap(page, 'Atlas');
  await page.goto('/kurum-atlas/ayarlar/hesabim');
  await expect(page.getByRole('heading', { name: 'Hesabım ve verilerim', level: 1 })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  const indirme = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Verilerimi indir' }).click();
  expect((await indirme).suggestedFilename()).toBe('verilerim.json');
  await expect(page.getByRole('status').filter({ hasText: 'Verilerin indirildi' })).toBeVisible();

  await page.getByRole('button', { name: /Hesabımı sil/ }).click();
  const pencere = page.getByRole('dialog');
  await pencere.getByLabel('Parolam').check();
  await pencere.getByLabel('Parola', { exact: true }).fill('yanlis');
  await pencere.getByRole('button', { name: 'Silme talebini başlat' }).click();
  await expect(pencere.getByRole('alert')).toContainText('Doğrulama başarısız');
  await pencere.getByLabel('Parola', { exact: true }).fill('parola123');
  await pencere.getByRole('button', { name: 'Silme talebini başlat' }).click();
  await expect(page.getByTestId('silme-bekleyen')).toBeVisible();

  await page.getByRole('button', { name: 'Talebi geri al' }).click();
  await expect(page.getByTestId('silme-bekleyen')).toBeHidden();
  await expect(page.getByRole('button', { name: /Hesabımı sil/ })).toBeVisible();
});

test('tek sahip: engel aciklamasi gosterilir, sil dugmesi yok', async ({ page }) => {
  await abonelikSenaryosu(page, 'kvkk-engel');
  await girisYap(page, 'Kuzey Yıldızı Akademi');
  await page.goto('/kurum-kuzey/ayarlar/hesabim');
  await expect(page.getByTestId('silme-engel')).toContainText('tek sahibisin');
  await expect(page.getByRole('button', { name: /Hesabımı sil/ })).toHaveCount(0);
});
