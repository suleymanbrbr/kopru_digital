import { expect, test } from '@playwright/test';

import { menuGit, panelAc, sifirla } from './yardimcilar';

test.beforeEach(async ({ page }) => {
  await sifirla(page);
});

test('motivasyon: ayar değiştir → uyarı → doğrulama hatası → geri al', async ({ page }) => {
  await panelAc(page);
  await menuGit(page, 'Motivasyon ayarları');
  await expect(page.getByRole('heading', { name: 'Motivasyon ayarları', level: 1 })).toBeVisible();
  await expect(page.getByText('Geçerli sürüm: 1')).toBeVisible();
  const kurallar = page.getByRole('region', { name: 'XP kuralları' });
  await expect(kurallar.getByRole('row', { name: /Yoklamada geldi/ })).toContainText('20');

  // Değişiklik: yoklama XP'si 20 → 5 (varsayımı bozar: uyarı)
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByLabel('Yoklamada geldi: XP').fill('5');
  await expect(page.getByText('1 değişiklik')).toBeVisible();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  const pencere = page.getByRole('dialog');
  await expect(pencere.getByText('Yoklamada geldi · xp: 5')).toBeVisible();
  const onay = pencere.getByRole('button', { name: 'Değişiklikleri kaydet' });
  await expect(onay).toBeDisabled();
  await pencere.getByLabel(/Neden/).fill('Deneme ayarı');
  await onay.click();
  await expect(page.getByText('Sürüm 2 kaydedildi.')).toBeVisible();
  const uyari = page.getByRole('status').filter({ hasText: 'Uyarılar' });
  await expect(uyari).toContainText('haftalık XP');
  await expect(page.getByText('Geçerli sürüm: 2')).toBeVisible();

  // Doğrulama hatası: tavanı aşan değer reddedilir, alan bazında gösterilir
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByLabel('Yoklamada geldi: XP').fill('400');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Çok yüksek deneme');
  await page.getByRole('dialog').getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Ayar değerleri geçersiz.',
  );
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'kurallar.yoklama_geldi.xp',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.getByText('bağlı olduğu günlük tavanı (300) aşamaz.')).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  // Geri al: sürüm 1'in değerleriyle yeni sürüm (geçmiş silinmez)
  await page.getByRole('button', { name: 'Bu sürüme geri al (1)' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Önceki değerlere dönüş');
  await page.getByRole('dialog').getByRole('button', { name: 'Bu sürüme geri al' }).click();
  await expect(page.getByText('Sürüm 1 değerleri yeni sürüm 3 olarak uygulandı.')).toBeVisible();
  await expect(kurallar.getByRole('row', { name: /Yoklamada geldi/ })).toContainText('20');
  const gecmis = page.getByRole('region', { name: 'Ayar sürümleri' });
  await expect(gecmis.getByText('Önceki değerlere dönüş')).toBeVisible();
  await expect(gecmis.getByText('Sürüm 1 geri alındı')).toBeVisible();
});

test('taklit: başlat → kalan süre → salt okunur okuma → sonlandır', async ({ page }) => {
  await panelAc(page);
  await page.getByRole('link', { name: 'Ege Işık Dershanesi' }).click();
  await page.getByRole('button', { name: 'Taklit başlat' }).click();

  const pencere = page.getByRole('dialog');
  await expect(pencere.getByText(/En çok 15 dakika süren/)).toBeVisible();
  const baslat = pencere.getByRole('button', { name: 'Taklidi başlat' });
  await expect(baslat).toBeDisabled();
  await pencere.getByLabel(/Neden/).fill('Müşteri şikayetini incelemek için');
  await baslat.click();

  await expect(page).toHaveURL(/\/taklit$/);
  await expect(page.getByRole('heading', { name: 'Taklit oturumu başladı' })).toBeVisible();
  await expect(page.getByText('Salt okunur', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^1[45]:\d\d$/);

  await page.getByRole('button', { name: 'Kimlik (hesap/ben)' }).click();
  await expect(page.getByLabel('Sonuç')).toContainText('Mock Sahip');
  await page.getByRole('button', { name: 'Etkin modüller' }).click();
  await expect(page.getByLabel('Sonuç')).toContainText('takvim');

  await page.getByRole('button', { name: 'Taklidi sonlandır' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Taklidi sonlandır' }).click();
  await expect(page.getByText('Taklit oturumu sonlandırıldı.')).toBeVisible();
  await expect(page.getByText('Etkin taklit oturumu yok.')).toBeVisible();

  // Denetimde başlatma ve okuma kayıtları görünür
  await menuGit(page, 'Denetim kayıtları');
  const denetim = page.getByRole('region', { name: 'Denetim kayıtları' });
  await expect(denetim.getByText('platform.taklit_baslat')).toBeVisible();
  await expect(denetim.getByText('taklit.istek').first()).toBeVisible();
});

test('bakım mesajı: yayınla ve iptal et', async ({ page }) => {
  await panelAc(page);
  await menuGit(page, 'Bakım ve duyurular');
  await page.getByLabel('Başlık').fill('Planlı bakım');
  await page.getByLabel('Metin').fill('Cumartesi 02:00-03:00 arası bakım yapılacak.');
  await page.getByLabel('Önem').selectOption('uyari');
  await page.getByLabel('Bitiş', { exact: true }).fill('2031-01-01T10:00');
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yayınla', exact: true }).click();
  await expect(page.getByText('Mesaj yayınlandı.')).toBeVisible();

  const liste = page.getByRole('region', { name: 'Yayınlanan mesajlar' });
  const satir = liste.getByRole('row', { name: /Planlı bakım/ });
  await expect(satir.getByText('Yayında')).toBeVisible();
  await satir.getByRole('button', { name: 'İptal et: Planlı bakım' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'İptal et' }).click();
  await expect(page.getByText('Mesaj kaldırıldı.')).toBeVisible();
  await expect(
    liste.getByRole('row', { name: /Planlı bakım/ }).getByText('İptal edildi'),
  ).toBeVisible();
});

test('sistem sağlığı', async ({ page }) => {
  await panelAc(page);
  await menuGit(page, 'Sistem sağlığı');
  await expect(page.getByRole('heading', { name: 'Olay kutusu (outbox)' })).toBeVisible();
  await expect(page.getByText('Bekleyen olay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HTTP istekleri' })).toBeVisible();
});
