import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda hesap ekranlari (gruplar, davetler, oturumlar, sinif kodu, davet kabul, e-posta dogrulama).
 * Mock veri sunucu surecinde ortaktir; bu yuzden testler yalniz masaustu projesinde ve kendi
 * olusturdugu verilerle calisir.
 */
test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

async function ihlaller(page: Page) {
  // Sayfa gecisinde <title> ayrica akar; tarama basliktan once calisirsa document-title yanlis alarm verir.
  await expect(page).toHaveTitle(/.+/);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`hesap ekranlari (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('sahip: grup olusturur, kod yeniler, istek onaylar, ogrenci ve ogretmen ekler', async ({
      page,
    }) => {
      await girisYap(page, 'Kuzey Yıldızı Akademi');
      await page.getByRole('link', { name: 'Gruplar' }).first().click();
      await expect(page.getByRole('heading', { name: 'Gruplar', level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: /9-A Sınıfı/ })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);

      const ad = `Deneme Sınıfı ${tema}`;
      await page.getByRole('button', { name: 'Grup oluştur' }).first().click();
      const pencere = page.getByRole('dialog');
      await pencere.getByLabel('Grup adı').fill(ad);
      await pencere.getByLabel('Tür').selectOption({ label: 'Sınıf' });
      await pencere.getByRole('button', { name: 'Grup oluştur' }).click();
      await expect(page.getByText(`"${ad}" grubu oluşturuldu.`)).toBeVisible();

      await page.getByRole('link', { name: new RegExp(ad) }).click();
      await expect(page.getByText('Etkin kod yok')).toBeVisible();
      await page.getByRole('button', { name: 'Kod üret' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Kod üret' }).click();
      const kutu = page.getByTestId('katilim-kodu');
      const eski = await kutu.textContent();
      await page.getByRole('button', { name: 'Kodu yenile' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Kodu yenile' }).click();
      await expect(kutu).not.toHaveText(eski ?? '');
      await page.getByRole('button', { name: 'Kodu kapat' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Kodu kapat' }).click();
      await expect(page.getByText('Etkin kod yok')).toBeVisible();

      // Ogrenci ekle (coklu) ve cikar.
      await page.getByRole('button', { name: 'Öğrenci ekle' }).click();
      const ekle = page.getByRole('dialog');
      await ekle.getByRole('checkbox').nth(0).click();
      await ekle.getByRole('checkbox').nth(1).click();
      await ekle.getByRole('button', { name: '2 öğrenciyi ekle' }).click();
      await expect(page.getByText('2 öğrenci eklendi.')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Tüm öğrencileri seç' }).click();
      await page.getByRole('button', { name: /Seçilenleri çıkar/ }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Gruptan çıkar' }).click();
      await expect(page.getByText('2 öğrenci gruptan çıkarıldı.')).toBeVisible();

      // Ogretmen ata.
      await page.getByRole('button', { name: 'Öğretmen ata' }).first().click();
      const ata = page.getByRole('dialog');
      await ata.getByRole('button', { name: 'Öğretmen ata' }).click();
      await expect(ata.getByText('Bir öğretmen seç.')).toBeVisible();
      await ata.getByLabel('Öğretmen', { exact: true }).selectOption({ index: 1 });
      await ata.getByLabel('Branş').selectOption({ label: 'Fizik' });
      await ata.getByRole('button', { name: 'Öğretmen ata' }).click();
      await expect(page.getByText('Öğretmen atandı.')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });

    test('ogretmen: grup yazma aksiyonlari gizli', async ({ page }) => {
      await girisYap(page, 'Ege Işık Dershanesi');
      await page.getByRole('link', { name: 'Gruplar' }).first().click();
      await expect(page.getByRole('link', { name: /9-A Sınıfı/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Grup oluştur' })).toHaveCount(0);
      await page.getByRole('link', { name: /9-A Sınıfı/ }).click();
      await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Öğrenci ekle' })).toHaveCount(0);
      // Kod ve istekler ogretmene acik.
      await expect(page.getByTestId('katilim-kodu')).toBeVisible();
    });

    test('davetler: tekil baglanti, toplu davet satir sonuclari, iptal', async ({ page }) => {
      await girisYap(page, 'Mavi Kule Kurs Merkezi');
      await page.getByRole('link', { name: 'Öğrenciler' }).first().click();
      await expect(page.getByRole('heading', { name: 'Davetler' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);

      await page.getByRole('button', { name: 'Davet oluştur' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Daveti oluştur' }).click();
      await expect(page.locator('#davet-baglantisi')).toHaveValue(/\/davet\/.{20,}$/);
      await page.getByRole('button', { name: 'Tamam' }).click();

      await page.getByRole('button', { name: 'Toplu davet' }).click();
      const toplu = page.getByRole('dialog');
      await toplu.getByLabel('Kişiler').fill('Ali Veli, 532 111 22 33\nHatalı, 123');
      await toplu.getByRole('button', { name: '2 kişiyi davet et' }).click();
      await expect(toplu.getByText('1 başarılı, 1 hatalı')).toBeVisible();
      await expect(toplu.getByText('Telefon numarası geçersiz.')).toBeVisible();
      await toplu.getByRole('button', { name: 'Tamam' }).click();

      await page
        .getByRole('button', { name: /davetini iptal et/ })
        .first()
        .click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Daveti iptal et' }).click();
      await expect(page.getByText('Davet iptal edildi.')).toBeVisible();
    });

    test('oturumlarim: tek oturum sonlandirilir, tumu kapatilinca girise donulur', async ({
      page,
    }) => {
      await girisYap(page, 'Mavi Kule Kurs Merkezi');
      await page.getByRole('link', { name: 'Oturumlarım' }).first().click();
      await expect(page.getByText('Bu oturum', { exact: true })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      const sonlandir = page.getByRole('button', { name: /oturumunu sonlandır/ });
      const once = await sonlandir.count();
      await sonlandir.first().click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Oturumu sonlandır' })
        .click();
      await expect(sonlandir).toHaveCount(once - 1);
      await page.getByRole('button', { name: 'Tüm oturumları kapat', exact: true }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Hepsini kapat ve çık' })
        .click();
      await expect(page).toHaveURL(/\/giris$/);
    });
  });
}

test.describe('sinif koduyla katil', () => {
  test('hata metinleri ve basarili istek', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/sinif-kodu');
    const kod = page.getByLabel('Sınıf kodu');
    const gonder = page.getByRole('button', { name: 'İstek gönder' });

    await kod.fill('ABC');
    await gonder.click();
    await expect(page.getByText('Kod 8 karakter olmalı')).toBeVisible();
    await kod.fill('KXTU2222');
    await gonder.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Bu kod geçersiz' })).toBeVisible();
    await kod.fill('MMMM2222');
    await gonder.click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Çok fazla hatalı deneme' }),
    ).toBeVisible();
    await kod.fill('ZATEN222');
    await gonder.click();
    await expect(page.getByRole('alert').filter({ hasText: 'zaten üyesin' })).toBeVisible();

    await kod.fill('mavk 2345');
    await gonder.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'öğretmenine iletildi' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /isteğini iptal et/ })
      .first()
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'İsteği iptal et' }).click();
    await expect(page.getByText('İstek iptal edildi.')).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
  });
});

test.describe('davet kabul', () => {
  const uzun = (onek: string) => `${onek}${'x'.repeat(30)}`;

  test('oturumsuz: girise gider, giris ve KVKK sonrasi davet sayfasina doner, kuruma girer', async ({
    page,
  }) => {
    await page.goto(`/davet/${uzun('gecerli')}`);
    await expect(page).toHaveURL(/\/giris$/);
    await page.getByLabel('Telefon numaran').fill('532 123 45 67');
    await page.getByRole('button', { name: 'Kod gönder' }).click();
    await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('123456');
    await expect(page).toHaveURL(/\/kvkk$/);
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/davet\/gecerli/);
    expect(await ihlaller(page)).toEqual([]);
    await page.getByRole('button', { name: 'Daveti kabul et' }).click();
    await expect(page).toHaveURL(/\/kurum-ege\/bugun$/);
  });

  test('gecersiz (410) ve zaten uye (409) ekranlari', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/davet/${uzun('gecersiz')}`);
    await page.getByRole('button', { name: 'Daveti kabul et' }).click();
    await expect(page.getByRole('heading', { name: 'Bu davet geçerli değil' })).toBeVisible();

    await page.goto(`/davet/${uzun('zatenuye')}`);
    await page.getByRole('button', { name: 'Daveti kabul et' }).click();
    await expect(page.getByRole('heading', { name: 'Bu kurumda zaten üyesin' })).toBeVisible();
  });
});

test.describe('e-posta dogrulama', () => {
  test('gecerli, gecersiz ve eksik baglanti', async ({ page }) => {
    await page.goto('/eposta-dogrula?belirtec=gecerli-eposta-belirteci');
    await expect(page.getByRole('heading', { name: 'E-posta adresin doğrulandı' })).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);

    await page.goto('/eposta-dogrula?belirtec=bozuk-belirtec-123');
    await expect(
      page.getByRole('heading', { name: 'Bağlantı geçersiz ya da süresi dolmuş' }),
    ).toBeVisible();
    await page.getByLabel('E-posta adresin').fill('yanlis');
    await page.getByRole('button', { name: 'Yeni bağlantı gönder' }).click();
    await expect(page.getByText('Geçerli bir e-posta adresi gir.')).toBeVisible();
    await page.getByLabel('E-posta adresin').fill('ben@ornek.test');
    await page.getByRole('button', { name: 'Yeni bağlantı gönder' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'yeni bir doğrulama' })).toBeVisible();

    await page.goto('/eposta-dogrula');
    await expect(page.getByRole('heading', { name: 'Bağlantı eksik' })).toBeVisible();
  });
});
