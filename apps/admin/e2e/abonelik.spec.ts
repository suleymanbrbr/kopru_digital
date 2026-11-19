import { expect, test } from '@playwright/test';

import { menuGit, panelAc, sifirla } from './yardimcilar';

test.beforeEach(async ({ page }) => {
  await sifirla(page);
});

test('abonelik: denemeyi uzat → kurumsal aktivasyon → platform askısı al/aç → denetim', async ({
  page,
}) => {
  await panelAc(page);
  await page.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
  const abonelik = page.getByRole('region', { name: 'Abonelik', exact: true });
  await expect(abonelik.getByText('Deneme', { exact: true }).first()).toBeVisible();
  await expect(abonelik.getByText('Önceki abonelik kaydı yok.')).toBeVisible();

  // Denemeyi uzat: gün sınırı ve zorunlu neden
  await abonelik.getByRole('button', { name: 'Denemeyi uzat' }).click();
  const pencere = page.getByRole('dialog');
  const onay = pencere.getByRole('button', { name: 'Denemeyi uzat' });
  await pencere.getByLabel('Gün sayısı').fill('91');
  await pencere.getByLabel(/Neden/).fill('Müşteri talebi üzerine uzatma');
  await expect(onay).toBeDisabled();
  await pencere.getByLabel('Gün sayısı').fill('14');
  await onay.click();
  await expect(page.getByText('Abonelik işlemi kaydedildi ve denetime yazıldı.')).toBeVisible();

  // Kurumsal aktivasyon: sözleşme zorunlu, eski abonelik geçmişe düşer
  await abonelik.getByRole('button', { name: 'Kurumsal aktivasyon' }).click();
  const akt = page.getByRole('dialog');
  const aktOnay = akt.getByRole('button', { name: 'Kurumsal aktivasyon' });
  await akt.getByLabel(/Neden/).fill('Teklif ve fatura ile aktivasyon');
  await expect(aktOnay).toBeDisabled();
  await akt.getByLabel('Sözleşme numarası').fill('S-2026-01');
  await akt.getByLabel(/Fiyat/).fill('4.999,00');
  await aktOnay.click();
  await expect(abonelik.getByText('Aktif', { exact: true }).first()).toBeVisible();
  await expect(abonelik.getByText('Kurumsal', { exact: true }).first()).toBeVisible();
  await expect(
    abonelik.getByRole('region', { name: 'Abonelik geçmişi' }).first().getByText('Deneme'),
  ).toBeVisible();

  // Platform askısı: al → rozet → aç
  const aski = page.getByRole('region', { name: 'Platform askısı', exact: true });
  await aski.getByRole('button', { name: 'Platform askısına al' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Ödeme anlaşmazlığı nedeniyle');
  await page.getByRole('dialog').getByRole('button', { name: 'Platform askısına al' }).click();
  await expect(page.getByText('Kurum platform askısına alındı.')).toBeVisible();
  await expect(aski.getByText('Kurum platform tarafından askıya alındı')).toBeVisible();
  await aski.getByRole('button', { name: 'Askıyı aç' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Anlaşmazlık çözüldü');
  await page.getByRole('dialog').getByRole('button', { name: 'Askıyı aç' }).click();
  await expect(page.getByText('Platform askısı kaldırıldı.')).toBeVisible();

  // Denetim
  await menuGit(page, 'Denetim kayıtları');
  await page.getByLabel('Eylem', { exact: true }).fill('platform.*');
  await page.getByRole('button', { name: 'Süz' }).click();
  const denetim = page.getByRole('region', { name: 'Denetim kayıtları' });
  await expect(denetim.getByText('platform.abonelik_deneme_uzat')).toBeVisible();
  await expect(denetim.getByText('platform.abonelik_kurumsal_aktivasyon')).toBeVisible();
  await expect(denetim.getByText('platform.kurum_askiya_al')).toBeVisible();
});

test('abonelik: destek rolü özeti görür ama işlem düğmesi yoktur', async ({ page }) => {
  await panelAc(page, '501 123 45 67');
  await page.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
  const abonelik = page.getByRole('region', { name: 'Abonelik', exact: true });
  await expect(abonelik.getByText('Deneme', { exact: true }).first()).toBeVisible();
  await expect(abonelik.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Platform askısına al/ })).toHaveCount(0);
});
