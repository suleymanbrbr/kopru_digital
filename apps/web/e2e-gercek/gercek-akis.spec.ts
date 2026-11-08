import { expect, test } from '@playwright/test';

import { benzersizTelefon, kurumOlustur, ortamSorunu, sonOtpKodu } from './yardimcilar';

/**
 * Gercek `api`ya karsi tam akis: telefon OTP -> KVKK -> kurum secimi -> Bugun.
 * `pnpm --filter @kopru/web e2e:gercek` (api ve Postgres calisiyor olmali; yoksa test atlanir).
 * `EKRAN_KAYDET=<dizin>` verilirse ekran goruntuleri o dizine yazilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
});

for (const tema of ['light', 'dark'] as const) {
  test(`gercek api: giris, KVKK, kurum secimi ve bugun (${tema})`, async ({ page }) => {
    test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
    await page.emulateMedia({ colorScheme: tema });
    const dizin = process.env.EKRAN_KAYDET;
    const goruntu = async (ad: string) => {
      if (dizin) await page.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: true });
    };

    const telefon = benzersizTelefon();
    const kurumAdi = `Deneme Kurumu ${telefon.slice(-4)}`;

    await page.goto('/giris');
    await page.getByLabel('Telefon numaran').fill(telefon);
    await goruntu('giris-telefon');
    await page.getByRole('button', { name: 'Kod gönder' }).click();

    const kod = await sonOtpKodu(telefon);
    await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(kod);
    await expect(page).toHaveURL(/\/kvkk$/);
    await expect(page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ })).toBeVisible();
    await expect(page.locator('article')).toBeVisible();
    await goruntu('kvkk');

    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/kurum-sec$/);

    // Kurum olusturma arayuzde yok: api'den acilir, kurum secimi ve sonrasi tarayicidan gecer.
    await kurumOlustur(telefon, kurumAdi);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).waitFor();
    await goruntu('kurum-sec');
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();

    await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bugün' }).first()).toBeVisible();
    await goruntu('bugun');

    // Sayfa yenilenince oturum cerezden geri gelir (erisim belirteci yeniden alinir).
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
  });
}
