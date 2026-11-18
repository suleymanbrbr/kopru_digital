import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda bildirim kutusu ve tercihleri: zil rozeti, acilir liste, derin baglantilar, bildirimler
 * sayfasi (suzgec, okundu, arsivle, tumunu oku, daha fazla), tercih matrisi, sessiz saat, ders
 * hatirlatma ve hata geri alma. Mock veri sunucu surecinde ortaktir; durumlu testler yalniz masaustu
 * projesinde ve sirayla calisir (ogrenci `Atlas`, ogretmen `Ege`); mobil projesi yalniz durumdan bagimsiz
 * duzen ve erisilebilirlik denetimlerini `Kuzey` kurumunda yapar.
 */

async function ihlaller(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function axeIkiTema(page: Page) {
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    expect(await ihlaller(page), tema).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

const zil = (page: Page) => page.getByTestId('bildirim-zili').filter({ visible: true });
const rozet = (page: Page) => page.getByTestId('bildirim-rozeti').filter({ visible: true });

test.describe('ogrenci (Atlas)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('zil: rozet, acilir liste, derin baglanti ve tumunu gor', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await expect(rozet(page)).toHaveText('3');
    await expect(zil(page)).toHaveAccessibleName('Bildirimler, 3 okunmamış');

    await zil(page).click();
    const acilir = page.getByRole('dialog', { name: 'Son bildirimler' });
    await expect(acilir.getByTestId('bildirim-satiri')).toHaveCount(8);
    await expect(acilir.getByText('Yeni ödev')).toBeVisible();
    await expect(acilir.getByText(/^\d+ dk önce$/).first()).toBeVisible();

    // Soru bildirimi ogrenciyi "Soru sor" ekranindaki soruya goturur ve okundu isaretler.
    await acilir.getByRole('link', { name: /Sorun cevaplandı/ }).click();
    await expect(page).toHaveURL(/\/kurum-atlas\/soru-sor\/[0-9a-f-]{36}$/);
    await expect(rozet(page)).toHaveText('2');

    // "Tumunu gor"
    await zil(page).click();
    await page.getByRole('link', { name: 'Tümünü gör' }).click();
    await expect(page).toHaveURL(/\/kurum-atlas\/bildirimler$/);
    await expect(page.getByRole('heading', { name: 'Bildirimler', level: 1 })).toBeVisible();
  });

  test('bildirimler sayfasi: suzgec, okundu, arsivle, daha fazla, tumunu oku, bos durum', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/kurum-atlas/bildirimler');
    const satirlar = page.getByTestId('bildirim-satiri');
    await expect(satirlar.first()).toBeVisible();
    // 20 + "Daha fazla yukle" (26 - 1 arsivli degil; toplam 26)
    await expect(satirlar).toHaveCount(20);
    await page.getByRole('button', { name: 'Daha fazla yükle' }).click();
    await expect(satirlar).toHaveCount(26);
    await expect(page.getByRole('button', { name: 'Daha fazla yükle' })).toBeHidden();
    await axeIkiTema(page);

    // Derin baglantisi bilinmeyen bildirim ayni sayfada kalir.
    await page.getByRole('link', { name: /Kuruma hoş geldin/ }).click();
    await expect(page).toHaveURL(/\/kurum-atlas\/bildirimler$/);

    // Okunmamis suzgeci.
    await page.getByRole('button', { name: /^Okunmamış/ }).click();
    await expect(satirlar).toHaveCount(2);
    await page.getByRole('button', { name: /“Yeni ödev” bildirimini okundu işaretle/ }).click();
    await expect(satirlar).toHaveCount(1);
    await expect(rozet(page)).toHaveText('1');

    // Arsivle: okunmamis oge hem listeden hem sayidan duser.
    await page
      .getByRole('button', { name: /“Serini koru!” bildirimini arşivle/ })
      .first()
      .click();
    await expect(satirlar).toHaveCount(0);
    await expect(rozet(page)).toBeHidden();
    await expect(page.getByText('Okunmamış bildirimin yok.')).toBeVisible();

    // Tumu: onbellekteki iki sayfa korunur; arsivlenen yok (26 - 1 = 25).
    await page.getByRole('button', { name: 'Tümü', exact: true }).click();
    await expect(satirlar).toHaveCount(25);
    await expect(page.getByRole('button', { name: 'Tümünü okundu yap' })).toBeDisabled();
  });

  test('tercihler: matris, kilitli hucre, hata geri alma, sessiz saat, hatirlatma kalici', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/kurum-atlas/bildirimler');
    await page.getByRole('main').getByRole('link', { name: 'Bildirim tercihleri' }).click();
    await expect(page).toHaveURL(/\/kurum-atlas\/ayarlar\/bildirimler$/);
    await expect(
      page.getByRole('heading', { name: 'Bildirim tercihleri', level: 1 }),
    ).toBeVisible();

    const soruPush = page.getByRole('checkbox', { name: 'Soru sor: Anlık bildirim' });
    await expect(soruPush).toBeChecked();
    // Kilitli: gelen kutusu ve sistem kategorisi.
    await expect(page.getByRole('checkbox', { name: 'Soru sor: Gelen kutusu' })).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'Hesap ve güvenlik: Anlık bildirim' }),
    ).toBeDisabled();
    // E-posta yalniz abonelik ve sistem icin.
    await expect(page.getByRole('checkbox', { name: 'Abonelik: E-posta' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Ödev: E-posta' })).toHaveCount(0);
    await axeIkiTema(page);

    // Hata: iyimser guncelleme geri alinir ve uyari gosterilir.
    await page.route('**/api/bildirim/kurumlar/*/tercihler', (r) =>
      r.request().method() === 'PUT'
        ? r.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'sunucu_hatasi', message: 'x' } }),
          })
        : r.continue(),
    );
    await soruPush.click();
    await expect(page.getByText('Tercih kaydedilemedi. Değişiklik geri alındı.')).toBeVisible();
    await expect(soruPush).toBeChecked();
    await page.unroute('**/api/bildirim/kurumlar/*/tercihler');

    // Basari: kalici.
    await soruPush.click();
    await expect(soruPush).not.toBeChecked();
    await page.getByLabel('Başlangıç').fill('23:30');
    await page.getByLabel('Bitiş').fill('06:45');
    await page.getByLabel('Ders hatırlatma süresi').selectOption({ label: '30 dakika önce' });
    await page.getByTestId('sessiz-gun-7').click(); // Pazar kapali
    await expect(page.getByTestId('sessiz-gun-7')).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(
      page.getByRole('checkbox', { name: 'Soru sor: Anlık bildirim' }),
    ).not.toBeChecked();
    await expect(page.getByLabel('Başlangıç')).toHaveValue('23:30');
    await expect(page.getByLabel('Bitiş')).toHaveValue('06:45');
    await expect(page.getByLabel('Ders hatırlatma süresi')).toHaveValue('30');
    await expect(page.getByTestId('sessiz-gun-7')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('sessiz-gun-1')).toHaveAttribute('aria-pressed', 'true');

    // Sessiz saati kapat: alanlar pasiflesir.
    await page.getByTestId('sessiz-acik').click();
    await expect(page.getByLabel('Başlangıç')).toBeDisabled();
    // Ayni saat uyari verir ve gonderilmez.
    await page.getByTestId('sessiz-acik').click();
    await page.getByLabel('Bitiş').fill('23:30');
    await expect(page.getByText('Başlangıç ve bitiş saati aynı olamaz.')).toBeVisible();
    await axeIkiTema(page);
  });

  test('yan menuden bildirim tercihlerine gidilir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.getByRole('link', { name: 'Bildirim tercihleri' }).click();
    await expect(page).toHaveURL(/\/ayarlar\/bildirimler$/);
  });
});

test.describe('ogretmen (Ege)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('rol bazli derin baglantilar', async ({ page }) => {
    await girisYap(page, 'Ege');
    await expect(rozet(page)).toHaveText('3');
    await page.goto('/kurum-ege/bildirimler');
    const hedef = async (ad: RegExp) =>
      page.getByRole('link', { name: ad }).first().getAttribute('href');
    expect(await hedef(/Yeni soru geldi/)).toMatch(/^\/kurum-ege\/sorular\/[0-9a-f-]{36}$/);
    expect(await hedef(/Yoklama bekliyor/)).toBe('/kurum-ege/yoklama');
    expect(await hedef(/Ödev teslim edildi/)).toBe('/kurum-ege/odevler');
    expect(await hedef(/Düşük ders kredisi/)).toBe('/kurum-ege/finans');
    expect(await hedef(/Yeni duyuru/)).toBe(
      '/kurum-ege/duyurular/00000000-0000-4000-8000-0000000d0001',
    );

    await page.getByRole('link', { name: /Yeni soru geldi/ }).click();
    await expect(page).toHaveURL(/\/kurum-ege\/sorular\/[0-9a-f-]{36}$/);
  });
});

test.describe('dar ekran ve duzen (Kuzey)', () => {
  test('zil ust cubukta, sayfalar yatay tasmaz, erisilebilir', async ({ page }) => {
    await girisYap(page, 'Kuzey');
    await expect(zil(page)).toBeVisible();
    await zil(page).click();
    const acilir = page.getByRole('dialog', { name: 'Son bildirimler' });
    await expect(acilir).toBeVisible();
    await expect(acilir.getByRole('link', { name: 'Tümünü gör' })).toBeVisible();
    await page.keyboard.press('Escape');

    for (const yol of ['bildirimler', 'ayarlar/bildirimler']) {
      await page.goto(`/kurum-kuzey/${yol}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(400);
      const tasma = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(tasma, yol).toBeLessThanOrEqual(0);
      await axeIkiTema(page);
    }
  });
});
