import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap, panelAc, sifirla } from './yardimcilar';

async function ihlaller(page: Page) {
  // Sayfa geçişinde <title> ayrıca akar; tarama başlıktan önce çalışırsa document-title yanlış alarm verir.
  await expect(page).toHaveTitle(/.+/);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

/** Sayfa yatayda taşmamalı (geniş tablolar kendi içinde kayar). */
async function tasmaYok(page: Page) {
  const tasma = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(tasma).toBeLessThanOrEqual(0);
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`erişilebilirlik ve taşma (${tema})`, () => {
    test.use({ colorScheme: tema });

    test.beforeEach(async ({ page }) => {
      await sifirla(page);
    });

    test('giriş ve ikinci adım ekranları', async ({ page }) => {
      await page.goto('/giris');
      await expect(page.getByRole('heading', { name: 'Platform girişi' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.getByRole('tab', { name: 'E-posta' }).click();
      expect(await ihlaller(page)).toEqual([]);

      await page.getByRole('tab', { name: 'Telefon' }).click();
      await girisYap(page);
      await expect(page.getByRole('button', { name: 'Kurulumu başlat' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
      await expect(page.getByRole('img', { name: 'İki adımlı doğrulama QR kodu' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
    });

    test('panel sayfaları', async ({ page }) => {
      await panelAc(page);
      const sayfalar: { yol: string; baslik: string }[] = [
        { yol: '/kurumlar', baslik: 'Kurumlar' },
        { yol: '/denetim', baslik: 'Denetim kayıtları' },
        { yol: '/saglik', baslik: 'Sistem sağlığı' },
        { yol: '/mesajlar', baslik: 'Bakım ve duyurular' },
        { yol: '/mufredat', baslik: 'Müfredat editörü' },
        { yol: '/motivasyon', baslik: 'Motivasyon ayarları' },
        { yol: '/taklit', baslik: 'Taklit oturumu' },
      ];
      for (const s of sayfalar) {
        await page.goto(s.yol);
        await expect(page.getByRole('heading', { name: s.baslik, level: 1 })).toBeVisible();
        // Veri gelsin
        await expect(page.getByText('Yükleniyor…')).toHaveCount(0);
        expect(await ihlaller(page), s.yol).toEqual([]);
        await tasmaYok(page);
      }
    });

    test('kurum detayı, müfredat editörü ve motivasyon düzenleme', async ({ page }) => {
      await panelAc(page);
      await page.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
      await expect(
        page.getByRole('heading', { name: 'Ege Işık Dershanesi', level: 1 }),
      ).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      // Onay penceresi açıkken
      await page.getByRole('button', { name: 'Kapat: Finans' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();

      await page.goto('/mufredat/lgs');
      await expect(page.getByText('Sayılar ve İşlemler')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
      await page.getByRole('tab', { name: 'Fark' }).click();
      expect(await ihlaller(page)).toEqual([]);

      await page.goto('/motivasyon');
      await page.getByRole('button', { name: 'Düzenle' }).click();
      await expect(page.getByLabel('Yoklamada geldi: XP')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
    });
  });
}
