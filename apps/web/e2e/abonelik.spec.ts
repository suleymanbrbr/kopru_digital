import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

import { abonelikSenaryosu, girisYap, platformMesaji, test } from './yardimcilar';

/**
 * Mock modda sahip abonelik ekrani, limit/aski deneyimi ve platform mesaji. Her test kendi senaryo
 * cerezini (`abonelikSenaryosu`) kullanir; Kuzey = sahip, Ege = ogretmen, Atlas = ogrenci.
 */

async function ihlaller(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function abonelikAc(page: Page, senaryo: string, isMobile: boolean) {
  await abonelikSenaryosu(page, senaryo);
  await girisYap(page, 'Kuzey Yıldızı');
  if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
  await page
    .getByRole('navigation', { name: 'Ana menü' })
    .getByRole('link', { name: 'Abonelik' })
    .click();
  await expect(page.getByRole('heading', { name: 'Abonelik', level: 1 })).toBeVisible();
}

const doldur = async (page: Page, vergiNo = '1111111114') => {
  await page.getByLabel('Ünvan / ad soyad').fill('Kuzey Yıldızı Eğitim Ltd. Şti.');
  await page.getByLabel(/Vergi kimlik no/).fill(vergiNo);
  await page.getByLabel('Adres', { exact: true }).fill('Moda Cd. 1');
  await page.getByLabel('İlçe').fill('Kadıköy');
  await page.getByLabel('İl', { exact: true }).fill('İstanbul');
  await page.getByLabel('Fatura e-postası').fill('fatura@kuzey.test');
};

for (const tema of ['light', 'dark'] as const) {
  test.describe(`abonelik ekrani erisilebilirlik (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('aktif abonelik, planlar ve kullanim', async ({ page, isMobile }) => {
      await abonelikAc(page, 'aktif', isMobile);
      const durum = page.getByTestId('abonelik-durum');
      await expect(durum.getByText('Mevcut plan: Koç')).toBeVisible();
      await expect(durum.getByText('Aktif', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: /Öğrenci kullanımı: 8 \/ 60/ }),
      ).toBeVisible();
      await expect(page.getByTestId('plan-koc').getByText('Mevcut planın')).toBeVisible();
      await expect(page.getByTestId('donem-sonu-notu')).toContainText('dönem');
      expect(await ihlaller(page)).toEqual([]);
    });

    test('platform mesaji afisi (giris dahil) ve erisilebilirlik', async ({ page }) => {
      await platformMesaji(page, 'uyari');
      await page.goto('/giris');
      const afis = page.getByRole('status').filter({ hasText: 'Planlı bakım' });
      await expect(afis).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });
  });
}

test.describe('abonelik ekrani', () => {
  test('ogretmen menude abonelik gormez, bolum yetkisiz', async ({ page, isMobile }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Abonelik' }),
    ).toHaveCount(0);
    await page.goto('/kurum-ege/abonelik');
    await expect(page.getByRole('heading', { name: 'Bu bölüme erişimin yok' })).toBeVisible();
  });

  test('plan degistir: donem sonunda uygulanacagi yazilir, limit asimi uyarilir', async ({
    page,
    isMobile,
  }) => {
    await abonelikAc(page, 'aktif', isMobile);
    await page
      .getByTestId('plan-baslangic')
      .getByRole('button', { name: /dönem sonunda geç/ })
      .click();
    await expect(page.getByText(/Planın .* tarihinde Başlangıç olarak değişecek/)).toBeVisible();
    await expect(page.getByText(/Öğretmen sınırı: 1\) mevcut kullanımın \(2\)/)).toBeVisible();
    await expect(page.getByTestId('bekleyen-plan')).toContainText('Başlangıç');
  });

  test('otomatik yenilemeyi iptal: onay penceresi, donem sonu tarihi', async ({
    page,
    isMobile,
  }) => {
    await abonelikAc(page, 'aktif', isMobile);
    await page.getByRole('button', { name: 'Otomatik yenilemeyi iptal et' }).click();
    const onay = page.getByRole('alertdialog');
    await expect(onay).toContainText('sona erer');
    await onay.getByRole('button', { name: 'Yenilemeyi iptal et' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Otomatik yenileme iptal edildi.' }),
    ).toBeVisible();
    await expect(page.getByTestId('abonelik-durum')).toContainText(
      'Otomatik yenileme iptal edildi',
    );
    await expect(page.getByRole('button', { name: 'Otomatik yenilemeyi iptal et' })).toHaveCount(0);
  });

  test('fatura bilgisi: odeme once bunu ister, VKN dogrulanir, kaydedilir', async ({
    page,
    isMobile,
  }) => {
    await abonelikAc(page, 'deneme', isMobile);
    await page.getByTestId('plan-koc').getByRole('button', { name: 'Koç için abone ol' }).click();
    await expect(page.getByText('önce fatura bilgilerini kaydet')).toBeVisible();

    await doldur(page, '1111111115');
    await page.getByRole('button', { name: 'Fatura bilgilerini kaydet' }).click();
    await expect(page.getByText(/Geçerli bir VKN/)).toBeVisible();
    await page.getByLabel(/Vergi kimlik no/).fill('1111111114');
    await page.getByRole('button', { name: 'Fatura bilgilerini kaydet' }).click();
    await expect(page.getByText('Fatura bilgilerin kaydedildi.')).toBeVisible();
  });

  test('odeme baslat -> sahte donus -> aktif (kisa yoklama)', async ({ page, isMobile }) => {
    await abonelikAc(page, 'deneme', isMobile);
    await expect(page.getByTestId('abonelik-durum')).toContainText('gün kaldı');
    await doldur(page);
    await page.getByRole('button', { name: 'Fatura bilgilerini kaydet' }).click();
    await expect(page.getByText('Fatura bilgilerin kaydedildi.')).toBeVisible();

    await page.getByRole('radio', { name: 'Yıllık' }).click();
    await page.getByTestId('plan-koc').getByRole('button', { name: 'Koç için abone ol' }).click();
    // Sahte saglayici sayfasi: BFF mock'u donus adresine gider, oradan /abonelik?odeme=basarili.
    await expect(page).toHaveURL(/\/kurum-kuzey\/abonelik$/);
    await expect(page.getByTestId('odeme-sonucu')).toBeVisible();
    await expect(page.getByTestId('odeme-sonucu')).toContainText('Aboneliğin etkinleştirildi', {
      timeout: 15_000,
    });
    const durum = page.getByTestId('abonelik-durum');
    await expect(durum).toContainText('Mevcut plan: Koç');
    await expect(durum.getByText('Aktif', { exact: true })).toBeVisible();
    await expect(page.getByTestId('odeme-gecmisi').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('fatura-gecmisi')).toContainText('e-Arşiv fatura');
    expect(await ihlaller(page)).toEqual([]);
  });

  test('odeme basarisiz donusu mesaj verir', async ({ page, isMobile }) => {
    await abonelikAc(page, 'aktif', isMobile);
    await page.goto('/abonelik?odeme=basarisiz');
    await expect(page).toHaveURL(/\/kurum-kuzey\/abonelik$/);
    await expect(page.getByText(/Ödeme tamamlanamadı/)).toBeVisible();
  });

  test('magaza aboneligi: bilgi var, web odeme dugmesi yok', async ({ page, isMobile }) => {
    await abonelikAc(page, 'magaza', isMobile);
    await expect(page.getByTestId('magaza-bilgisi')).toContainText('App Store');
    await expect(page.getByRole('button', { name: /abone ol|dönem sonunda geç/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Otomatik yenilemeyi iptal et' })).toHaveCount(0);
  });
});

test.describe('limit ve aski deneyimi', () => {
  test('ogrenci limiti dolu: 402 plan_limiti penceresi, sahibe abonelik baglantisi', async ({
    page,
    isMobile,
  }) => {
    await abonelikSenaryosu(page, 'limit-dolu');
    await girisYap(page, 'Kuzey Yıldızı');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Öğrenciler' })
      .click();
    await page.getByRole('button', { name: 'Davet oluştur' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Daveti oluştur' }).click();
    const pencere = page.getByRole('dialog', { name: 'Planını yükselt' });
    await expect(pencere.getByTestId('limit-ozeti')).toContainText('15 / 15');
    await pencere.getByRole('link', { name: 'Planı yükselt' }).click();
    await expect(page).toHaveURL(/\/kurum-kuzey\/abonelik$/);
    await expect(
      page.getByRole('progressbar', { name: /Öğrenci kullanımı: 15 \/ 15/ }),
    ).toBeVisible();
    await expect(page.getByText('15 / 15 · Sınıra ulaştın')).toBeVisible();
  });

  test('16. ogrenci davet kabulu: davetliye anlasilir mesaj', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/davet/limitdolu${'x'.repeat(30)}`);
    await page.getByRole('button', { name: 'Daveti kabul et' }).click();
    await expect(page.getByRole('heading', { name: 'Davet şu an kabul edilemiyor' })).toBeVisible();
  });

  test('askida abonelik: salt-okunur afisi, veri gorunur, sahibe abonelik baglantisi', async ({
    page,
  }) => {
    await abonelikSenaryosu(page, 'askida');
    await girisYap(page, 'Kuzey Yıldızı');
    const afis = page.getByRole('region', { name: 'Askıda' });
    await expect(afis).toContainText('yalnızca görüntüleyebilirsin');
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
    await afis.getByRole('link', { name: 'Aboneliğe git' }).click();
    await expect(page).toHaveURL(/\/kurum-kuzey\/abonelik$/);
    await expect(page.getByTestId('abonelik-durum')).toContainText('askıda');
    expect(await ihlaller(page)).toEqual([]);
  });

  test('platform askisi: aciklama ekrani', async ({ page }) => {
    await abonelikSenaryosu(page, 'platform-askida');
    await girisYap(page, 'Kuzey Yıldızı');
    await expect(
      page.getByRole('heading', { name: 'Kurumunun hesabı askıya alındı' }),
    ).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
  });

  test('deneme bitisine 3 gun: sahibe afis', async ({ page }) => {
    await abonelikSenaryosu(page, 'deneme-bitiyor');
    await girisYap(page, 'Kuzey Yıldızı');
    await expect(page.getByRole('region', { name: 'Deneme' })).toContainText('2 gün kaldı');
  });

  test('deneme uzun: afis yok', async ({ page }) => {
    await abonelikSenaryosu(page, 'deneme');
    await girisYap(page, 'Kuzey Yıldızı');
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Deneme' })).toHaveCount(0);
  });
});

test.describe('platform mesaji', () => {
  test('kapatilir ve mesaj kimligine gore hatirlanir', async ({ page }) => {
    await platformMesaji(page, 'kritik');
    await page.goto('/giris');
    const afis = page.getByRole('alert').filter({ hasText: 'Planlı bakım' });
    await expect(afis).toBeVisible();
    await afis.getByRole('button', { name: 'Mesajı kapat' }).click();
    await expect(afis).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Planlı bakım' })).toHaveCount(0);
    // Farkli mesaj (baska kimlik) yine gorunur.
    await platformMesaji(page, 'bilgi');
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: 'Yeni özellik' })).toBeVisible();
  });

  test('mesaj yoksa afis yok', async ({ page }) => {
    await page.goto('/giris');
    await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
    await expect(page.locator('[data-onem]')).toHaveCount(0);
  });
});
