import { expect, test } from '@playwright/test';

import { ortamSorunu, sonOtpKodu } from './yardimcilar';

/**
 * Gercek `api`ya karsi yonetici paneli. On kosul: `services/api/scripts/rapor-tohum.sql` ile tohumlanmis
 * (1.000 ogrenci) bir kurum ve o kurumun sahibi olan bir telefon (`PANEL_TELEFON`, varsayilan
 * 5310000001) ile `PANEL_KURUM_AD` (varsayilan "Olcum Kurumu"). Veritabani adresi `API_ADMIN_DATABASE_URL`.
 * `services/api/scripts/panel-akisi.sh` ortami kurup bu testi calistirir.
 * `EKRAN_KAYDET=<dizin>` verilirse acik ve koyu ekran goruntuleri yazilir; panel acilis suresi basilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = process.env.PANEL_TELEFON ? await ortamSorunu() : 'PANEL_TELEFON tanimli degil';
});

test('gercek api: 1.000 ogrencili kurumda panel, alt liste ve Excel', async ({ page }) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(120_000);
  const telefon = process.env.PANEL_TELEFON ?? '';
  const kurumAd = process.env.PANEL_KURUM_AD ?? 'Olcum Kurumu';
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (ad: string) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };

  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  // KVKK daha once onaylanmis olabilir (`panel-akisi.sh` onaylar): ikisi de gecerli.
  await expect(page).toHaveURL(/\/(kvkk|kurum-sec)$/);
  if (page.url().endsWith('/kvkk')) {
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
  }
  await expect(page).toHaveURL(/\/kurum-sec$/);
  await page.getByRole('button', { name: new RegExp(kurumAd) }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);

  const bas = Date.now();
  await page
    .getByRole('navigation', { name: 'Ana menü' })
    .getByRole('link', { name: 'Panel' })
    .click();
  const kartlar = page.getByRole('region', { name: 'Kurum göstergeleri' });
  await expect(kartlar.getByText('1000', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Gruplar' }).getByRole('row')).toHaveCount(51);
  // Tum gostergeler (uc modulun yanitlari) gelmis olsun: iskelet kalmadi.
  await expect(page.getByRole('status', { name: 'Yükleniyor…' })).toHaveCount(0);
  const sure = Date.now() - bas;
  console.log(`[panel-akisi] panel acilis suresi (tikla -> tum gostergeler): ${String(sure)} ms`);
  expect(sure).toBeLessThan(2000);
  await expect(kartlar.getByText('Devam oranı')).toBeVisible();
  await goruntu('panel-gercek');

  // Sayiya tikla -> alt liste (kisaltilmis: en cok 200 satir, toplam gercek sayi).
  await kartlar.getByRole('button', { name: /Aktif öğrenci/ }).click();
  const liste = page.getByTestId('alt-liste');
  await expect(liste.getByText('İlk 200 satır gösteriliyor, toplam 1000.')).toBeVisible();
  await kartlar.getByRole('button', { name: /Devam oranı/ }).click();
  await expect(liste.getByRole('heading', { name: 'Devam oranı · Tüm kurum' })).toBeVisible();
  await expect(liste.getByRole('link').first()).toBeVisible();
  await goruntu('panel-gercek-alt-liste');

  const indirme = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Excel indir' }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toBe('panel-son-7-gun.xlsx');
});
