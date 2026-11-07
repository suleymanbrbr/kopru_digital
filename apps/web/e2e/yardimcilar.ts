import { expect, type Page } from '@playwright/test';

/** Telefon -> OTP -> KVKK -> kurum secimi akisini calistirir ve secilen kurumun Bugun ekraninda biter. */
export async function girisYap(page: Page, kurumAdi: string, opsiyon: { kvkkOnay?: boolean } = {}) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill('532 123 45 67');
  await page.getByRole('button', { name: 'Kod gönder' }).click();

  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('123456');
  await expect(page).toHaveURL(/\/kvkk$/);

  if (opsiyon.kvkkOnay !== false) {
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/kurum-sec$/);
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
    await expect(page).toHaveURL(/\/kurum-[a-z]+\/bugun$/);
  }
}
