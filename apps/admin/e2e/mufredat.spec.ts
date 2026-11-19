import { expect, test, type Page } from '@playwright/test';

import { menuGit, panelAc, sifirla } from './yardimcilar';

test.beforeEach(async ({ page }) => {
  await sifirla(page);
});

/** Pencerede zorunlu notu yazıp onaylar; not boşken onay düğmesi kapalıdır. */
async function notlaOnayla(page: Page, dugme: string, not: string) {
  const pencere = page.getByRole('dialog');
  const onay = pencere.getByRole('button', { name: dugme, exact: true });
  await expect(onay).toBeDisabled();
  await pencere.getByLabel('Değişiklik notu').fill(not);
  await expect(onay).toBeEnabled();
  await onay.click();
}

test('müfredat: taslak → işlemler → fark → yayın', async ({ page }) => {
  await panelAc(page);
  await menuGit(page, 'Müfredat editörü');
  await page.getByRole('link', { name: 'Aç: LGS' }).click();
  await expect(page.getByRole('heading', { name: 'LGS', level: 1 })).toBeVisible();

  // Yayınlı sürüm salt okunur
  await expect(page.getByText(/Yayınlanmış sürüm salt okunur/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Yeniden adlandır:/ })).toHaveCount(0);

  // Taslak aç
  await page.getByRole('button', { name: 'Taslak aç' }).click();
  await page.getByRole('dialog').getByLabel('Taslak adı').fill('2027-2028 LGS');
  await page.getByRole('dialog').getByRole('button', { name: 'Taslak aç' }).click();
  await expect(page.getByText('Taslak açıldı.')).toBeVisible();
  await expect(page.getByText('taslak', { exact: true }).first()).toBeVisible();

  // Konu ekle
  await page.getByRole('button', { name: 'Konu ekle', exact: true }).first().click();
  const ekle = page.getByRole('dialog');
  await ekle.getByLabel('Ad', { exact: true }).fill('Kümeler');
  await ekle.getByLabel('Branş kodu').fill('matematik');
  await notlaOnayla(page, 'Konu ekle', 'Yeni müfredat ünitesi');
  await expect(page.getByText('İşlem taslağa yazıldı.')).toBeVisible();
  await expect(page.getByText('Kümeler')).toBeVisible();

  // Yeniden adlandır
  await page.getByRole('button', { name: 'Yeniden adlandır: Üslü İfadeler' }).click();
  await page.getByRole('dialog').getByLabel('Yeni ad').fill('Üslü Sayılar');
  await notlaOnayla(page, 'Yeniden adlandır', 'Resmi adıyla düzeltildi');
  await expect(page.getByText('Üslü Sayılar')).toBeVisible();

  // Taşı
  await page.getByRole('button', { name: 'Taşı: Çarpanlar ve Katlar' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Yeni üst konu')
    .selectOption({ label: 'Ünite: Cebir' });
  await notlaOnayla(page, 'Taşı', 'Cebir ünitesine alındı');

  // Birleştir
  await page.getByRole('button', { name: 'Birleştir: Mitoz' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Hedef konu (kalacak olan)')
    .selectOption({ label: 'Mayoz' });
  await notlaOnayla(page, 'Birleştir', 'Aynı kazanım iki konuda tekrarlanıyordu');
  await expect(page.getByText('Mitoz', { exact: true })).toHaveCount(0);

  // Kaldır
  await page.getByRole('button', { name: 'Kaldır: Paragraf' }).click();
  await notlaOnayla(page, 'Kaldır', 'Müfredattan çıkarıldı');
  await expect(page.getByText('Paragraf', { exact: true })).toHaveCount(0);

  // Fark görünümü
  await page.getByRole('tab', { name: 'Fark' }).click();
  const fark = page.getByRole('tabpanel');
  await expect(fark.getByRole('region', { name: 'Eklenen' }).getByText('Kümeler')).toBeVisible();
  await expect(
    fark
      .getByRole('region', { name: 'Yeniden adlandırılan' })
      .getByText('Üslü İfadeler → Üslü Sayılar'),
  ).toBeVisible();
  await expect(
    fark.getByRole('region', { name: 'Taşınan' }).getByText('Cebir ünitesine alındı'),
  ).toBeVisible();
  await expect(fark.getByRole('heading', { name: 'Birleşen' })).toBeVisible();
  await expect(fark.getByRole('heading', { name: 'Kaldırılan' })).toBeVisible();

  // Yayın: onay kutusu olmadan yayınlanmaz
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  const yayin = page.getByRole('dialog');
  await expect(yayin.getByText('Taslakta 5 işlem var.')).toBeVisible();
  const yayinla = yayin.getByRole('button', { name: 'Yayınla', exact: true });
  await expect(yayinla).toBeDisabled();
  await yayin.getByRole('checkbox').check();
  await yayinla.click();
  await expect(page.getByText(/Sürüm yayınlandı\. \d+ kuruma bildirildi/)).toBeVisible();
  await expect(page.getByText(/Yayınlanmış sürüm salt okunur/)).toBeVisible();
});

test('müfredat: değişiklik yokken yayın kapalı, çakışan taslak açık hata verir', async ({
  page,
}) => {
  await panelAc(page);
  await page.goto('/mufredat/ydt');
  await expect(page.getByText('Henüz yayınlanmış sürüm yok.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Taslak aç' }).click();
  await page.getByRole('dialog').getByLabel('Taslak adı').fill('2026 YDT');
  await page.getByRole('dialog').getByRole('button', { name: 'Taslak aç' }).click();
  await expect(page.getByText('Taslak açıldı.')).toBeVisible();

  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Yayınla', exact: true }),
  ).toBeDisabled();
});
