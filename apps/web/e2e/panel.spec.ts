import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda yonetici paneli (`/[kurumId]/panel`) ve modul ayarlari (`/[kurumId]/moduller`).
 * Deneme kurumlari: Mavi = yonetici (finans kapali), Kuzey = sahip (hepsi acik), Ege = ogretmen,
 * Atlas = ogrenci. Modul ayarlari mock deposu sunucuda ortaktir: o senaryo tek sirali ve yalniz masaustu.
 */

async function menu(page: Page, ad: string, isMobile = false) {
  if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: ad }).click();
}

async function panelAc(page: Page, kurum: string, isMobile: boolean) {
  await girisYap(page, kurum);
  // Tam sayfa yuklemesi oturumu yeniden kurar: menu baglantisiyla istemci icinde gidilir.
  await menu(page, 'Panel', isMobile);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible();
}

async function ihlaller(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

test.describe('yonetici paneli', () => {
  test('yonetici: gostergeler, donem secici ve sayiya tiklayinca alt liste', async ({
    page,
    isMobile,
  }) => {
    await panelAc(page, 'Mavi', isMobile);

    const kartlar = page.getByRole('region', { name: 'Kurum göstergeleri' });
    await expect(kartlar.getByText('Aktif öğrenci', { exact: true })).toBeVisible();
    await expect(kartlar.getByText('Devam oranı')).toBeVisible();
    await expect(kartlar.getByText('Plan tamamlama oranı')).toBeVisible();
    await expect(kartlar.getByText('Ödev teslim oranı')).toBeVisible();
    await expect(kartlar.getByText('Ortalama soru cevap süresi')).toBeVisible();
    await expect(kartlar.getByText('Ders sonu “anladım”')).toBeVisible();
    // Finans modulu Mavi'de kapali: finans karti yok.
    await expect(kartlar.getByText('Finans özeti')).toHaveCount(0);

    // Donem: varsayilan son 7 gun; 30'a gecince aralik uzar.
    const yedi = page.getByRole('button', { name: 'Son 7 gün' });
    await expect(yedi).toHaveAttribute('aria-pressed', 'true');
    const aralik7 = await page.getByText(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/).textContent();
    await page.getByRole('button', { name: 'Son 30 gün' }).click();
    await expect(page.getByRole('button', { name: 'Son 30 gün' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/)).not.toHaveText(
      aralik7 ?? '',
    );
    await yedi.click();

    // Kart tiklaninca altindaki liste acilir; ogrenci satiri ogrenci sayfasina gider.
    await kartlar.getByRole('button', { name: /Devam oranı/ }).click();
    const liste = page.getByTestId('alt-liste');
    await expect(liste.getByRole('heading', { name: 'Devam oranı · Tüm kurum' })).toBeVisible();
    await expect(liste.getByRole('table')).toBeVisible();
    expect(await liste.getByRole('row').count()).toBeGreaterThan(2);
    const ilk = liste.getByRole('link').first();
    await ilk.click();
    await expect(page).toHaveURL(/\/kurum-mavi\/ogrenciler\/[0-9a-f-]{36}$/);
  });

  test('grup tablosundaki sayi o grubun listesini acar; kapatinca odak sayiya doner', async ({
    page,
    isMobile,
  }) => {
    await panelAc(page, 'Mavi', isMobile);
    const tablo = page.getByRole('table', { name: 'Gruplar' });
    await expect(tablo.getByRole('row', { name: /9-A Sınıfı/ })).toBeVisible();
    const sayi = tablo.getByRole('button', { name: /^Devam oranı, 9-A Sınıfı:/ });
    await sayi.click();
    const liste = page.getByTestId('alt-liste');
    await expect(liste.getByRole('heading', { name: 'Devam oranı · 9-A Sınıfı' })).toBeVisible();
    await expect(sayi).toHaveAttribute('aria-pressed', 'true');

    // Aktif ogrenci sayisi da listeye iner (yalniz o grubun ogrencileri).
    await tablo.getByRole('button', { name: /^Aktif öğrenci, 9-A Sınıfı:/ }).click();
    await expect(
      liste.getByRole('heading', { name: 'Aktif öğrenciler · 9-A Sınıfı' }),
    ).toBeVisible();
    await expect(liste.getByRole('row')).toHaveCount(7); // baslik + 6 ogrenci

    await liste.getByRole('button', { name: 'Listeyi kapat' }).click();
    await expect(liste).toHaveCount(0);

    // Ogretmen tablosu ve soru suresi listesi.
    const ogretmenler = page.getByRole('table', { name: 'Öğretmenler' });
    await ogretmenler
      .getByRole('button', { name: /^Sorular, .+:/ })
      .first()
      .click();
    await expect(
      page
        .getByTestId('alt-liste')
        .getByText(/Cevap bekliyor|dk|sn/)
        .first(),
    ).toBeVisible();
  });

  test('sayiya tiklayinca alt liste kaydirilip gorunur olur ve odaklanir (asagi inmek gerekmez)', async ({
    page,
    isMobile,
  }) => {
    await panelAc(page, 'Mavi', isMobile);
    const tablo = page.getByRole('table', { name: 'Gruplar' });
    await tablo.getByRole('button', { name: /^Devam oranı, 9-A Sınıfı:/ }).click();
    const liste = page.getByTestId('alt-liste');
    const baslik = liste.getByRole('heading', { name: 'Devam oranı · 9-A Sınıfı' });
    await expect(baslik).toBeFocused();
    // Liste yuklenip uzadiktan sonra da baslik ve ilk satirlar ekranda kalir.
    await expect(liste.getByRole('table')).toBeVisible();
    await expect(baslik).toBeInViewport();
    await expect(liste.getByRole('row').nth(1)).toBeInViewport();
  });

  test('Excel indir: gercek .xlsx dosyasi iner', async ({ page, isMobile }) => {
    await panelAc(page, 'Mavi', isMobile);
    const indirme = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel indir' }).click();
    const dosya = await indirme;
    expect(dosya.suggestedFilename()).toBe('panel-son-7-gun.xlsx');
    await expect(
      page.getByRole('status').filter({ hasText: 'Excel dosyası indirildi.' }),
    ).toBeVisible();
  });

  test('sahip: finans ozeti karti ve modul ayarlari baglantisi gorunur', async ({
    page,
    isMobile,
  }) => {
    await panelAc(page, 'Kuzey', isMobile);
    const kartlar = page.getByRole('region', { name: 'Kurum göstergeleri' });
    await expect(kartlar.getByText('Finans özeti')).toBeVisible();
    await expect(kartlar.getByRole('link', { name: 'Finans ekranı' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Modül ayarları' })).toHaveAttribute(
      'href',
      /\/kurum-kuzey\/moduller$/,
    );
    await expect(page.getByRole('link', { name: 'Grupları yönet' })).toBeVisible();
  });

  test('ogretmen: yalniz atandigi gruplar; ogretmen tablosu, finans ve modul baglantisi yok', async ({
    page,
    isMobile,
  }) => {
    await panelAc(page, 'Ege', isMobile);
    const tablo = page.getByRole('table', { name: 'Gruplar' });
    await expect(tablo.getByRole('row')).toHaveCount(2); // baslik + atandigi tek grup
    await expect(tablo.getByRole('row', { name: /9-A Sınıfı/ })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Öğretmenler' })).toHaveCount(0);
    await expect(page.getByText('Finans özeti')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Modül ayarları' })).toHaveCount(0);
  });

  test('ogrenci menude panel gormez', async ({ page, isMobile }) => {
    await girisYap(page, 'Atlas');
    if (isMobile) await page.getByRole('button', { name: 'Menü' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Panel' }),
    ).toHaveCount(0);
  });

  test('erisilebilirlik: panel ve alt liste ihlalsiz', async ({ page, isMobile }) => {
    await panelAc(page, 'Kuzey', isMobile);
    await expect(page.getByRole('table', { name: 'Gruplar' })).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
    await page
      .getByRole('region', { name: 'Kurum göstergeleri' })
      .getByRole('button', { name: /Ödev teslim oranı/ })
      .click();
    await expect(page.getByTestId('alt-liste')).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
  });
});

test.describe('modul ayarlari', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('sahip bir modulu kapatir ve yeniden acar; grup duzeyi ust duzeye uyar', async ({
    page,
  }) => {
    await girisYap(page, 'Kuzey');
    await menu(page, 'Modüller');
    await expect(page.getByRole('heading', { name: 'Modüller', level: 1 })).toBeVisible();

    const odev = page.getByRole('switch', { name: /^Ödev:/ });
    await expect(odev).toHaveAttribute('aria-checked', 'true');
    await odev.click();
    await expect(page.getByRole('status').filter({ hasText: 'Ayar kaydedildi.' })).toBeVisible();
    await expect(page.getByRole('switch', { name: /^Ödev:/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // Grup duzeyi: kurumda kapali modul grup icin acilamaz.
    await page.getByLabel('Grup', { exact: true }).selectOption({ label: '9-A Sınıfı' });
    await expect(page.getByText('Kurumda kapalı').first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: /^Ödev:/ })).toBeDisabled();

    // Yeniden ac; sonra tek grup icin kapat.
    await page.getByRole('switch', { name: /^Ödev:/ }).click();
    await expect(page.getByRole('switch', { name: /^Ödev:/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const grupOdev = page.getByRole('combobox', { name: /^Ödev:/ });
    await expect(grupOdev).toBeEnabled();
    await grupOdev.selectOption('kapali');
    await expect(grupOdev).toHaveValue('kapali');
    await grupOdev.selectOption('miras');
    await expect(grupOdev).toHaveValue('miras');
    expect(await ihlaller(page)).toEqual([]);
  });

  test('yonetici panelden modul ayarlarina gider', async ({ page }) => {
    await girisYap(page, 'Mavi');
    await menu(page, 'Panel');
    await page.getByRole('link', { name: 'Modül ayarları' }).click();
    await expect(page.getByRole('heading', { name: 'Modüller', level: 1 })).toBeVisible();
  });
});
