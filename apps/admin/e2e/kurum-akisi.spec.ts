import { expect, test } from '@playwright/test';

import {
  girisYap,
  ikinciAdimKur,
  KOD,
  menuAc,
  menuGit,
  ROLSUZ_TELEFON,
  DESTEK_TELEFON,
  sifirla,
} from './yardimcilar';

test.beforeEach(async ({ page }) => {
  await sifirla(page);
});

test('giriş → 2FA kurulum → kurum ara → modül kapat → denetimde gör', async ({ page }) => {
  await girisYap(page);

  // Kurulum: QR istemcide çizilir, yedek kodlar bir kez gösterilir.
  await expect(page.getByRole('heading', { name: 'İki adımlı doğrulama', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
  await expect(page.getByRole('img', { name: 'İki adımlı doğrulama QR kodu' })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
  await expect(
    page.getByRole('list', { name: '2. Yedek kodları saklayın' }).getByRole('listitem'),
  ).toHaveCount(10);

  // Onay kutusu ve kod olmadan tamamlanamaz; yanlış kod açık hata verir.
  const onayla = page.getByRole('button', { name: 'Kurulumu onayla' });
  await expect(onayla).toBeDisabled();
  await page.getByRole('checkbox', { name: /Yedek kodları güvenli bir yere kaydettim/ }).check();
  await page.getByLabel('Doğrulama kodu').fill('111111');
  await onayla.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Doğrulama kodu hatalı');
  await page.getByLabel('Doğrulama kodu').fill(KOD);
  await onayla.click();
  await expect(page).toHaveURL(/\/kurumlar$/);

  // Kurum ara
  await page.getByLabel('Kurum ara').fill('Ege');
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  const tablo = page.getByRole('region', { name: 'Kurum listesi' });
  await expect(tablo.getByRole('link', { name: 'Ege Işık Dershanesi' })).toBeVisible();
  await expect(tablo.getByRole('link', { name: 'Bornova Fen Kursu' })).toHaveCount(0);
  await tablo.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
  await expect(page.getByRole('heading', { name: 'Ege Işık Dershanesi', level: 1 })).toBeVisible();
  await expect(page.getByText('Aktif üye')).toBeVisible();

  // Modülü kapat: zorunlu neden ≥ 10 karakter
  await page.getByRole('button', { name: 'Kapat: Finans' }).click();
  const pencere = page.getByRole('dialog');
  const onay = pencere.getByRole('button', { name: 'Onayla' });
  await pencere.getByLabel(/Neden/).fill('kısa');
  await expect(onay).toBeDisabled();
  await pencere.getByLabel(/Neden/).fill('Müşteri talebiyle kapatıldı');
  await onay.click();
  await expect(page.getByText('Değişiklik kaydedildi ve denetim kaydına yazıldı.')).toBeVisible();
  const finansSatiri = page.getByRole('row', { name: /Finans/ });
  await expect(finansSatiri.getByText('Kapalı', { exact: true })).toBeVisible();

  // Denetimde gör
  await menuGit(page, 'Denetim kayıtları');
  await page.getByLabel('Eylem', { exact: true }).fill('platform.modul_ayarla');
  await page.getByRole('button', { name: 'Süz' }).click();
  const denetim = page.getByRole('region', { name: 'Denetim kayıtları' });
  await expect(denetim.getByText('platform.modul_ayarla')).toBeVisible();
  await expect(denetim.getByText('Müşteri talebiyle kapatıldı')).toBeVisible();
});

test('2FA olmadan panel açılmaz; yedek kodla yeniden giriş', async ({ page }) => {
  await girisYap(page);
  await page.goto('/kurumlar');
  await expect(page).toHaveURL(/\/dogrulama$/);

  await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
  const yedekKod =
    (await page
      .getByRole('list', { name: '2. Yedek kodları saklayın' })
      .getByRole('listitem')
      .first()
      .textContent()) ?? '';
  expect(yedekKod.length).toBeGreaterThan(5);
  await page.getByRole('checkbox', { name: /Yedek kodları güvenli/ }).check();
  await page.getByLabel('Doğrulama kodu').fill(KOD);
  await page.getByRole('button', { name: 'Kurulumu onayla' }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);

  // Çıkış → yeniden giriş: kurulu olduğundan kod girişi; yedek kod bir kez çalışır.
  await menuAc(page);
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/giris$/);
  await girisYap(page);
  await expect(page.getByRole('button', { name: 'Kurulumu başlat' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Yedek kod kullan' }).click();
  await page.getByLabel('Yedek kod', { exact: true }).fill(yedekKod.trim());
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);
});

test('platform rolü olmayan hesap açık hata ekranı görür', async ({ page }) => {
  await girisYap(page, ROLSUZ_TELEFON);
  await expect(page.getByRole('heading', { name: 'Platform yetkiniz yok' })).toBeVisible();
  await expect(page.getByText(/platform sorumlusu tarafından/)).toBeVisible();
});

test('destek rolü yalnız okur: yazma ve yönetici sayfaları kapalı', async ({ page }) => {
  await girisYap(page, DESTEK_TELEFON);
  await ikinciAdimKur(page);

  await menuAc(page);
  const gezinme = page.getByRole('navigation', { name: 'Ana gezinme' });
  await expect(gezinme.getByRole('link', { name: 'Kurumlar' })).toBeVisible();
  await expect(gezinme.getByRole('link', { name: 'Denetim kayıtları' })).toHaveCount(0);
  await expect(gezinme.getByRole('link', { name: 'Müfredat editörü' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
  await expect(page.getByText(/Destek rolü yalnızca okuyabilir/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Kapat: / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Taklit başlat' })).toBeVisible();

  await page.goto('/denetim');
  await expect(page.getByText('Bu işlem için platform yöneticisi rolü gerekir.')).toBeVisible();
});
