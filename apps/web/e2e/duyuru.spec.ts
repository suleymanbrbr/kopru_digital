import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

import { girisYap, test } from './yardimcilar';

/**
 * Mock modda duyurular (alici ve yazar) ve "Bugun" ekranlari. Mock veri sunucu surecinde ortaktir: durumlu
 * testler yalniz masaustu projesinde ve sirayla calisir (ogrenci `Atlas`, ogretmen `Ege`, yonetici `Mavi`);
 * mobil projesi yalniz durumdan bagimsiz duzen ve erisilebilirlik denetimlerini yapar.
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

async function yatayTasmaYok(page: Page) {
  const tasma = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(tasma).toBeLessThanOrEqual(1);
}

const DUYURU_1 = '00000000-0000-4000-8000-0000000d0001';

test.describe('ogrenci: duyurular (Atlas)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('Bugun: duyuru karti, buyuk dugmeler ve "Bugun ne yapmaliyim" kaydirmadan gorunur', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    const kart = page.getByTestId('bugun-duyuru-karti');
    await expect(kart).toContainText('Deneme sınavı takvimi açıklandı');
    await expect(kart).toContainText('Sabit');
    await expect(page.getByRole('link', { name: /^Odaklan/ })).toBeInViewport();
    await expect(page.getByRole('link', { name: /^Soru sor/ }).first()).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Bugünkü görevler' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Cevaplanan sorularım' })).toBeVisible();
    await expect(page.getByTestId('gun-hedefi')).toBeVisible();
    await expect(page.getByText('Sıradaki', { exact: true })).toBeVisible();
    await axeIkiTema(page);
  });

  test('Duyurular: yan menude var; sabit uste, okunmamis vurgulu, suzgec calisir', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Duyurular' })
      .click();
    await expect(page).toHaveURL(/\/kurum-atlas\/duyurular$/);
    const satirlar = page.getByTestId('duyuru-satiri');
    await expect(satirlar).toHaveCount(4);
    await expect(satirlar.first()).toHaveAttribute('data-sabit', 'true');
    await expect(satirlar.first()).toHaveAttribute('data-okunmamis', 'true');
    await expect(satirlar.nth(1)).toContainText('Cuma etüdü saati değişti');
    await expect(satirlar.nth(2)).toHaveAttribute('data-okunmamis', 'false');
    // Yazma yetkisi yok: yeni duyuru ve yonetim sekmesi gorunmez.
    await expect(page.getByRole('button', { name: 'Yeni duyuru' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Yönetim' })).toHaveCount(0);
    await axeIkiTema(page);

    await page.getByRole('button', { name: 'Okunmamış', exact: true }).click();
    await expect(satirlar).toHaveCount(2);
    await page.getByRole('button', { name: 'Hepsi' }).click();
    await expect(satirlar).toHaveCount(4);
  });

  test('acinca okundu isaretlenir; baglanti guvenli, javascript: metin kalir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/kurum-atlas/duyurular');
    await page.getByRole('link', { name: /Deneme sınavı takvimi açıklandı/ }).click();
    await expect(page).toHaveURL(new RegExp(`/kurum-atlas/duyurular/${DUYURU_1}$`));
    const detay = page.getByTestId('duyuru-detay');
    await expect(
      detay.getByRole('heading', { name: 'Deneme sınavı takvimi açıklandı' }),
    ).toBeVisible();
    const baglanti = detay.getByRole('link', { name: /ornek\.kurum\.test\/deneme-takvimi/ });
    await expect(baglanti).toHaveAttribute('href', 'https://ornek.kurum.test/deneme-takvimi');
    await expect(baglanti).toHaveAttribute('target', '_blank');
    await expect(baglanti).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByTestId('duyuru-yonetim')).toHaveCount(0);
    await axeIkiTema(page);

    // Liste: bu duyuru artik okunmus, okunmamis suzgeci 1 satir kalir.
    await page.getByRole('link', { name: 'Duyurulara dön' }).click();
    const satirlar = page.getByTestId('duyuru-satiri');
    await expect(satirlar.first()).toHaveAttribute('data-okunmamis', 'false');
    await page.getByRole('button', { name: 'Okunmamış', exact: true }).click();
    await expect(satirlar).toHaveCount(1);

    // javascript: metni baglanti olmaz.
    await page.getByRole('button', { name: 'Hepsi' }).click();
    await page.getByRole('link', { name: /Kütüphane kuralları/ }).click();
    const kutuphane = page.getByTestId('duyuru-detay');
    await expect(
      kutuphane.getByRole('link', { name: /ornek\.kurum\.test\/kutuphane/ }),
    ).toHaveCount(1);
    await expect(kutuphane.getByRole('link')).toHaveCount(1);
    await expect(kutuphane).toContainText('javascript:alert(1)');
  });

  test('derin baglanti: bildirimdeki "Yeni duyuru" ilgili duyuruyu acar', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/kurum-atlas/bildirimler');
    await page
      .getByRole('link', { name: /Yeni duyuru/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/kurum-atlas/duyurular/${DUYURU_1}$`));
    await expect(page.getByTestId('duyuru-detay')).toBeVisible();
  });

  test('olmayan duyuru anlasilir hata gosterir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto('/kurum-atlas/duyurular/00000000-0000-4000-8000-0000000d0099');
    await expect(page.getByText('Duyuru açılamadı')).toBeVisible();
    await expect(page.getByText('Duyuru bulunamadı.')).toBeVisible();
  });
});

test.describe('ogretmen: duyuru yazma (Ege)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('form dogrulamasi, sayaclar; gruba yayinla (onayda "yaklasik N ogrenci") ve duzenle/arsivle/sil', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto('/kurum-ege/duyurular');
    await expect(page.getByTestId('duyuru-satiri').first()).toBeVisible();
    await page.getByRole('button', { name: 'Yeni duyuru' }).click();
    const form = page.getByRole('dialog', { name: 'Yeni duyuru' });
    await expect(form).toBeVisible();
    // Ogretmen kurum hedefi secemez.
    await expect(form.getByLabel('Kime gidecek?')).toHaveCount(0);

    // Bos form: alan hatalari.
    await form.getByRole('button', { name: 'Yayınla' }).click();
    await expect(form.getByText('Başlık boş olamaz.')).toBeVisible();
    await expect(form.getByText('Metin boş olamaz.')).toBeVisible();
    await expect(form.getByText('Bir grup seçmelisin.')).toBeVisible();

    // Sayaclar
    await form.getByLabel('Başlık').fill('Cuma sınavı hazırlığı');
    await expect(form.getByText('21 / 200 karakter')).toBeVisible();
    await form.getByLabel('Metin').fill('Konu özetleri: https://ornek.kurum.test/ozet. Başarılar!');
    await expect(form.getByText(/^\d+ \/ 4000 karakter$/)).toBeVisible();
    await form.getByLabel('Grup', { exact: true }).selectOption({ label: '9-A Sınıfı' });
    await form.getByRole('checkbox', { name: 'Listenin en üstünde sabit tut' }).click();

    // Yayin onayi
    await form.getByRole('button', { name: 'Yayınla' }).click();
    const onay = page.getByRole('alertdialog', { name: 'Duyuru yayınlansın mı?' });
    await expect(onay).toContainText('9-A Sınıfı grubundaki yaklaşık 6 öğrenciye gidecek');
    await onay.getByRole('button', { name: 'Yayınla' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Duyuru yayınlandı/ })).toBeVisible();

    // Yonetim listesi: yayinda, hedef ve okunan/alici
    const satir = page
      .getByTestId('duyuru-yonetim-satiri')
      .filter({ hasText: 'Cuma sınavı hazırlığı' });
    await expect(satir).toContainText('Yayında');
    await expect(satir).toContainText('Grup: 9-A Sınıfı');
    await expect(satir.getByTestId('duyuru-okunan')).toHaveText('0 / 6 okudu');
    await expect(satir).toContainText('Sabit');

    // Ayrinti: yonetim bolumu, sabit/bitis duzenleme
    await satir.getByRole('link').click();
    const yonetim = page.getByTestId('duyuru-yonetim');
    await expect(yonetim).toBeVisible();
    await expect(yonetim.getByTestId('duyuru-okunan-ozet')).toHaveText('0 / 6 okudu');
    await yonetim.getByRole('checkbox', { name: 'Üstte sabit tut' }).click();
    await expect(
      yonetim.getByRole('status').filter({ hasText: 'Duyuru güncellendi.' }),
    ).toBeVisible();
    await yonetim.getByLabel('Bitiş zamanı').fill('2999-01-01T10:00');
    await yonetim.getByRole('button', { name: 'Kaydet' }).click();
    await expect(yonetim.getByRole('button', { name: 'Bitişi kaldır' })).toBeVisible();
    // Gecmis bitis kaydedilemez.
    await yonetim.getByLabel('Bitiş zamanı').fill('2020-01-01T10:00');
    await expect(yonetim.getByText('Bitiş zamanı gelecekte olmalı.')).toBeVisible();
    await expect(yonetim.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    await axeIkiTema(page);

    // Arsivle (onayla), sonra sil (onayla) ve listeye don
    await yonetim.getByRole('button', { name: 'Arşivle' }).click();
    await page
      .getByRole('alertdialog', { name: 'Duyuru arşivlensin mi?' })
      .getByRole('button', { name: 'Arşivle' })
      .click();
    await expect(yonetim.getByText('Duyuru arşivlendi.')).toBeVisible();
    await expect(yonetim.getByRole('button', { name: 'Arşivle' })).toHaveCount(0);
    await yonetim.getByRole('button', { name: 'Sil' }).click();
    await page
      .getByRole('alertdialog', { name: 'Duyuru silinsin mi?' })
      .getByRole('button', { name: 'Sil' })
      .click();
    await expect(page).toHaveURL(/\/kurum-ege\/duyurular$/);
  });

  test('taslak kaydet, duzenle ve yayinla; yayinlandiktan sonra kendi gelen kutusuna dusmez', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto('/kurum-ege/duyurular');
    await expect(page.getByTestId('duyuru-satiri').first()).toBeVisible();
    const gelen = await page.getByTestId('duyuru-satiri').count();
    await page.getByRole('button', { name: 'Yeni duyuru' }).click();
    const form = page.getByRole('dialog', { name: 'Yeni duyuru' });
    await form.getByLabel('Başlık').fill('Taslak deneme');
    await form.getByLabel('Metin').fill('İlk metin');
    await form.getByLabel('Grup', { exact: true }).selectOption({ label: 'LGS Hazırlık Grubu' });
    await form.getByRole('button', { name: 'Taslak kaydet' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Taslak kaydedildi.' })).toBeVisible();
    const satir = page.getByTestId('duyuru-yonetim-satiri').filter({ hasText: 'Taslak deneme' });
    await expect(satir).toContainText('Taslak');
    await satir.getByRole('link').click();

    const yonetim = page.getByTestId('duyuru-yonetim');
    await yonetim.getByRole('button', { name: 'Düzenle' }).click();
    const duzenle = page.getByRole('dialog', { name: 'Taslağı düzenle' });
    await expect(duzenle.getByLabel('Başlık')).toHaveValue('Taslak deneme');
    await duzenle.getByLabel('Metin').fill('Düzeltilmiş metin');
    await duzenle.getByRole('button', { name: 'Taslak kaydet' }).click();
    await expect(page.getByTestId('duyuru-detay')).toContainText('Düzeltilmiş metin');

    await yonetim.getByRole('button', { name: 'Yayınla' }).click();
    const onay = page.getByRole('alertdialog', { name: 'Duyuru yayınlansın mı?' });
    await expect(onay).toContainText('LGS Hazırlık Grubu grubundaki yaklaşık 2 öğrenciye');
    await onay.getByRole('button', { name: 'Yayınla' }).click();
    await expect(yonetim.getByText(/Duyuru yayınlandı/)).toBeVisible();
    await expect(yonetim.getByTestId('duyuru-okunan-ozet')).toHaveText('0 / 2 okudu');

    await page.goto('/kurum-ege/duyurular');
    await expect(page.getByTestId('duyuru-satiri').first()).toBeVisible();
    await expect(page.getByTestId('duyuru-satiri')).toHaveCount(gelen);
  });

  test('okuyanlar listesi uyelik kimliklerini adlara cevirir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto('/kurum-ege/duyurular');
    await page.getByRole('button', { name: 'Yönetim' }).click();
    await page.getByRole('link', { name: /Yarınki sınav için hazırlık notu/ }).click();
    const yonetim = page.getByTestId('duyuru-yonetim');
    await expect(yonetim.getByTestId('duyuru-okunan-ozet')).toHaveText('2 / 6 okudu');
    await page.getByRole('button', { name: 'Okuyanları göster' }).click();
    const liste = page.getByTestId('duyuru-okuyanlar');
    await expect(liste.getByRole('listitem')).toHaveCount(2);
    await expect(liste).toContainText('Ayşe Demir');
    await expect(liste).toContainText('Çağlar Yıldız');
  });

  test('Bugun: yoklamasi alinmamis ders isaretli, tek tikla yoklama; hizli eylemler formu acar', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    const dersler = page.getByTestId('bugun-dersleri');
    await expect(dersler.locator('[data-yoklama-bekliyor="true"]').first()).toContainText(
      'Yoklama bekliyor',
    );
    await dersler
      .getByRole('button', { name: /^Yoklama al/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bugun-duyuru-karti')).toContainText('Öğretmenler toplantısı');

    const eylemler = page.getByTestId('bugun-hizli-eylemler');
    await eylemler.getByRole('link', { name: 'Ders ekle' }).click();
    await expect(page).toHaveURL(/\/kurum-ege\/takvim$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/kurum-ege/bugun');
    await page.getByTestId('bugun-hizli-eylemler').getByRole('link', { name: 'Ödev ver' }).click();
    await expect(page).toHaveURL(/\/kurum-ege\/odevler$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/kurum-ege/bugun');
    await page
      .getByTestId('bugun-hizli-eylemler')
      .getByRole('link', { name: 'Öğrenci ekle' })
      .click();
    await expect(page).toHaveURL(/\/kurum-ege\/ogrenciler$/);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('yonetici: tum kuruma duyuru (Mavi)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('hedef olarak tum kurum secilir; grup alani kalkar; onayda kisi sayisi verilmez', async ({
    page,
  }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await page.goto('/kurum-mavi/duyurular');
    await page.getByRole('button', { name: 'Yönetim' }).click();
    await expect(page.getByTestId('duyuru-yonetim-satiri').first()).toBeVisible();
    await page.getByRole('button', { name: 'Yeni duyuru' }).click();
    const form = page.getByRole('dialog', { name: 'Yeni duyuru' });
    await form.getByLabel('Kime gidecek?').selectOption('kurum');
    await expect(form.getByLabel('Grup', { exact: true })).toHaveCount(0);
    await form.getByLabel('Başlık').fill('Bayram programı');
    await form.getByLabel('Metin').fill('Kurum bayram süresince kapalıdır.');
    await form.getByRole('checkbox', { name: 'Öğretmenler' }).click();
    await form.getByRole('button', { name: 'Yayınla' }).click();
    const onay = page.getByRole('alertdialog', { name: 'Duyuru yayınlansın mı?' });
    await expect(onay).toContainText('Tüm kurum hedefindeki seçili alıcılara gidecek');
    await onay.getByRole('button', { name: 'Yayınla' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Duyuru yayınlandı/ })).toBeVisible();
    await expect(
      page.getByTestId('duyuru-yonetim-satiri').filter({ hasText: 'Bayram programı' }),
    ).toContainText('Tüm kurum');
  });
});

test.describe('duyurular: dar ekran ve erisilebilirlik (Kuzey)', () => {
  test('liste, yonetim gorunumu ve form tasmaz; axe temiz', async ({ page }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await page.goto('/kurum-kuzey/duyurular');
    await expect(page.getByRole('heading', { name: 'Duyurular', level: 1 })).toBeVisible();
    await yatayTasmaYok(page);
    await axeIkiTema(page);
    await page.getByRole('button', { name: 'Yönetim' }).click();
    await expect(page.getByTestId('duyuru-yonetim-satiri').first()).toBeVisible();
    await yatayTasmaYok(page);
    await axeIkiTema(page);
    await page.getByRole('button', { name: 'Yeni duyuru' }).click();
    await expect(page.getByRole('dialog', { name: 'Yeni duyuru' })).toBeVisible();
    await axeIkiTema(page);
  });
});
