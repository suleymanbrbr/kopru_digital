import { expect, test } from '@playwright/test';

import { girisYap } from './yardimcilar';

test.describe('giris akisi', () => {
  test('oturumsuz kullanici girise yonlenir', async ({ page }) => {
    await page.goto('/kurum-ege/bugun');
    await expect(page).toHaveURL(/\/giris$/);
    await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
  });

  test('gecersiz telefonda hata gosterir, yanlis kodda yeni kod ister', async ({ page }) => {
    await page.goto('/giris');
    await page.getByLabel('Telefon numaran').fill('123');
    await page.getByRole('button', { name: 'Kod gönder' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Geçerli bir cep telefonu' }),
    ).toBeVisible();

    await page.getByLabel('Telefon numaran').fill('532 123 45 67');
    await page.getByRole('button', { name: 'Kod gönder' }).click();
    await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('000000');
    await expect(page.getByRole('alert').filter({ hasText: 'Kod hatalı' })).toBeVisible();
    await expect(page).toHaveURL(/\/giris$/);
  });

  test('telefon, kod, KVKK, kurum secimi ve bugun ekrani', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi', { kvkkOnay: false });

    // KVKK onaylanmadan uygulama acilmaz.
    await page.goto('/kurum-ege/bugun');
    await expect(page).toHaveURL(/\/kvkk$/);
    const kabul = page.getByRole('button', { name: 'Kabul et ve devam et' });
    await expect(kabul).toBeDisabled();
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await expect(kabul).toBeEnabled();
    await kabul.click();

    await expect(page).toHaveURL(/\/kurum-sec$/);
    await page.getByRole('button', { name: /Ege Işık Dershanesi/ }).click();

    await expect(page).toHaveURL(/\/kurum-ege\/bugun$/);
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cevap bekleyen sorular' })).toBeVisible();
    await expect(page.getByText('Bugün için planlanmış ders yok')).toBeVisible();
  });

  test('sayfa yenilenince oturum cerezden geri gelir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
  });

  test('cikis yapinca girise doner', async ({ page, isMobile }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await expect(page).toHaveURL(/\/giris$/);
  });
});

test.describe('rol ve modul duyarli navigasyon', () => {
  test('ogretmen tum calisma ogelerini gorur, yonetim ogeleri yoktur', async ({
    page,
    isMobile,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    for (const ad of [
      'Bugün',
      'Takvim',
      'Öğrenciler',
      'Gruplar',
      'Ödevler',
      'Planlar',
      'Denemeler',
      'Sorular',
      'Kayıtlar',
      'Finans',
    ]) {
      await expect(menu.getByRole('link', { name: ad, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('link', { name: 'Abonelik' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Kurum', exact: true })).toHaveCount(0);
  });

  test('ogrenci kendi menusunu ve yol arkadasini gorur', async ({ page, isMobile }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await expect(page.getByRole('heading', { name: 'Bugünkü görevler' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Kıvılcım/ })).toBeVisible();
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    for (const ad of ['Bugün', 'Görevler', 'Ödevlerim', 'Soru sor', 'Kayıtlarım', 'Karakterim']) {
      await expect(menu.getByRole('link', { name: ad, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('link', { name: 'Takvim' })).toHaveCount(0);
  });

  test('yonetici icin kapali moduller gizlenir, yonetim ogeleri gorunur', async ({
    page,
    isMobile,
  }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(menu.getByRole('link', { name: 'Öğretmenler' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Modüller' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Finans' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Denemeler' })).toHaveCount(0);
    // Yonetici abonelik gormez (yalnizca sahip).
    await expect(menu.getByRole('link', { name: 'Abonelik' })).toHaveCount(0);
  });

  test('kapali modulun adresine gidilirse aciklayici durum gosterilir', async ({ page }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await page.goto('/kurum-mavi/finans');
    await expect(page.getByText('Bu modül kurumunda kapalı')).toBeVisible();
  });

  test('hazirlanmakta olan bolum yer tutucu gosterir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto('/kurum-ege/takvim');
    await expect(page.getByRole('heading', { name: 'Takvim', level: 1 })).toBeVisible();
    await expect(page.getByText('Bu bölüm hazırlanıyor')).toBeVisible();
  });
});
