import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

import { girisYap, test } from './yardimcilar';

/**
 * Mock modda ogretmen degerlendirmeleri, onerilen kaynaklar ve ogrenci koçluk gorunumu. Roller kurumdan gelir:
 * `Ege` ogretmen (Burcu Tekin), `Mavi` yonetici, `Atlas` ogrenci (Cağlar Yildiz). Tohum: iki ogretmenden dort
 * degerlendirme (biri ogrenciye gorunur) ve uc kaynak onerisi (baslamamis kitap, baslamis serbest, link).
 * Durumlu akislar yalniz masaustunde ve sirali kosar; salt okunur kontroller (axe iki tema, mobil tasma) ikisinde.
 */

const OGRENCI = 'Çağlar Yıldız';

async function ihlaller(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function tasmaYok(page: Page) {
  const tasan = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(tasan).toBeLessThanOrEqual(1);
}

const kok = (page: Page) => new URL(page.url()).pathname.split('/')[1] ?? '';

/** Ogretmen/yonetici: ogrenci listesinden "Cağlar Yildiz" kartinin Koçluk sekmesine. */
async function kocluguAc(page: Page) {
  await page.goto(`/${kok(page)}/ogrenciler`);
  await page.getByRole('link', { name: `${OGRENCI} koçluk görünümü` }).click();
  await expect(page.getByRole('heading', { name: OGRENCI, level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Koçluk' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('kocluk')).toBeVisible();
}

const satirlar = (page: Page) => page.getByTestId('degerlendirme-satiri');
const oneriSatirlari = (page: Page) => page.getByTestId('oneri-satiri');

/** Olcek radyosu gorsel olarak etiketle secilir (girdi `sr-only`). */
async function olcekSec(pencere: Locator, olcek: string, puan: number) {
  await pencere
    .getByRole('group', { name: olcek })
    .locator('label', { hasText: new RegExp(`^${String(puan)}$`) })
    .click();
}

test.describe('ogretmen (Ege): koçluk gorunumu, degerlendirme, oneri, hatirlatma', () => {
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');
  test.describe.configure({ mode: 'serial' });

  test('ogrenci kartinin varsayilan sekmesi Koçluk: iki ogretmenin yazdiklari, egilim, kaynaklar', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await kocluguAc(page);

    // Zaman cizelgesi: dort kayit, iki ogretmen; biri ogrenciye gorunur.
    await expect(satirlar(page)).toHaveCount(4);
    await expect(satirlar(page).filter({ hasText: 'Burcu Tekin (sen)' })).toHaveCount(2);
    await expect(satirlar(page).filter({ hasText: 'Hasan Polat' })).toHaveCount(2);
    await expect(page.getByText('Öğrenci görüyor', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Öğrenciye kapalı', { exact: true })).toHaveCount(3);
    const gorunur = satirlar(page).filter({ hasText: 'Öğrenci görüyor' });
    await expect(gorunur).toContainText('Derslere düzenli katılıyor');
    await expect(gorunur).toContainText('Çalışma düzeni: 4/5');
    // Baska ogretmenin kaydi: duzenle/geri cek yok.
    const baskasi = satirlar(page).filter({ hasText: 'Geçen haftaki konuları tekrar' });
    await expect(baskasi.getByRole('button')).toHaveCount(0);
    // Kendi yeni kaydi: duzenle + geri cek.
    await expect(gorunur.getByRole('button', { name: /Düzenle/ })).toBeVisible();
    await expect(gorunur.getByRole('button', { name: /Geri çek/ })).toBeVisible();

    // Son 4 haftanin olcek egilimi: erisilebilir tablo.
    const tablo = page.getByRole('table', { name: 'Son 4 haftanın ölçek ortalamaları (1-5)' });
    await expect(tablo.getByRole('row')).toHaveCount(6);
    await expect(tablo.getByRole('row', { name: /4 hafta ortalaması/ })).toContainText('4');

    // Kaynaklar: kullandigi (gunluk kayit), onerilen (baslama durumlariyla).
    await expect(page.getByTestId('kullanilan-kitap').first()).toContainText(
      'Ornek Matematik Soru Bankası',
    );
    await expect(page.getByTestId('kullanilan-kitap').first()).toContainText('1 / 3 test');
    await expect(oneriSatirlari(page)).toHaveCount(3);
    await expect(
      oneriSatirlari(page).filter({ hasText: 'Ornek Matematik Soru Bankası' }),
    ).toContainText('Henüz başlamadı');
    await expect(oneriSatirlari(page).filter({ hasText: 'Zor sorular fasikülü' })).toContainText(
      'Başladı',
    );
    await expect(
      oneriSatirlari(page).filter({ hasText: 'Üslü sayılar konu anlatımı' }),
    ).toContainText('Takip edilemez');
    await expect(
      oneriSatirlari(page)
        .filter({ hasText: 'Üslü sayılar' })
        .getByRole('link', { name: 'Bağlantıyı aç' }),
    ).toHaveAttribute('href', 'https://example.com/uslu-sayilar');

    // Konu analizi ozeti, sistem onerileri ve plan/odev.
    await expect(page.getByTestId('kocluk-konu-ozeti')).toContainText('Zayıf konular');
    await expect(page.getByTestId('kocluk-oneriler')).toContainText('görev öner');
    await expect(page.getByTestId('kocluk-plan-odev')).toBeVisible();

    // "Konu analizi" sekmesine baglanti.
    await page.getByRole('button', { name: 'Konu analizini aç' }).click();
    await expect(page.getByTestId('isi-haritasi')).toBeVisible();
  });

  test('degerlendirme yazma 30 sn akisi: bu hafta on secili, gorunurluk kapali, kaydet', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await kocluguAc(page);
    const basla = Date.now();
    await page.getByRole('button', { name: 'Değerlendirme yaz' }).click();
    const pencere = page.getByRole('dialog', { name: 'Değerlendirme yaz' });
    await expect(pencere.getByRole('radio', { name: /^Bu hafta/ })).toBeChecked();
    await expect(pencere.getByRole('switch', { name: 'Öğrenci görsün' })).not.toBeChecked();
    await expect(pencere).toContainText('yalnızca öğrencinin öğretmenleri ve kurum yöneticileri');

    // Bos kayit reddedilir.
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(pencere.getByText('Yorum yaz ya da en az bir ölçek seç.')).toBeVisible();

    await pencere.getByLabel('Ders (isteğe bağlı)').selectOption('matematik');
    await olcekSec(pencere, 'Çalışma düzeni', 5);
    await olcekSec(pencere, 'Derse katılım', 4);
    await pencere
      .getByRole('textbox', { name: 'Yorum' })
      .fill('Bu hafta çok verimli geçti, gizli not.');
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Değerlendirme kaydedildi.' }),
    ).toBeVisible();
    expect(Date.now() - basla).toBeLessThan(30_000);

    await expect(satirlar(page)).toHaveCount(5);
    const yeni = satirlar(page).first();
    await expect(yeni).toContainText('Burcu Tekin (sen)');
    await expect(yeni).toContainText('Bu hafta çok verimli geçti');
    await expect(yeni).toContainText('Öğrenciye kapalı');
    await expect(yeni).toContainText('Matematik');
    await expect(yeni).toContainText('Derse katılım: 4/5');
  });

  test('duzenleme: gorunurluk acilir; 409 mesajlari Turkce; sonra geri cekilir', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await kocluguAc(page);
    const yeni = satirlar(page).first();
    await expect(yeni).toContainText('Bu hafta çok verimli geçti');
    await yeni.getByRole('button', { name: /Düzenle/ }).click();
    const pencere = page.getByRole('dialog', { name: 'Değerlendirmeyi düzenle' });
    await pencere
      .getByRole('textbox', { name: 'Yorum' })
      .fill('Bu hafta çok verimli geçti (düzeltildi).');
    await pencere.getByRole('switch', { name: 'Öğrenci görsün' }).check();
    await expect(pencere).toContainText('öğrenci bu yorumu "Soru takibim" sayfasında okur');
    await pencere.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Değerlendirme güncellendi.' }),
    ).toBeVisible();
    await expect(satirlar(page).first()).toContainText('düzeltildi');
    await expect(page.getByText('Öğrenci görüyor', { exact: true })).toHaveCount(2);

    // 7 gunu gecen kayit duzenlenemez: duzenle dugmesi yoktur (kocluk yanitindaki `duzenlenebilir`).
    const eski = satirlar(page).filter({ hasText: 'Hafta boyunca istikrarlı çalıştı' });
    await expect(eski.getByRole('button', { name: /Düzenle/ })).toHaveCount(0);
    await expect(eski.getByRole('button', { name: /Geri çek/ })).toBeVisible();

    // Geri cekme onay ister; geri cekilen koçluk gorunumunden kalkar.
    await satirlar(page)
      .first()
      .getByRole('button', { name: /Geri çek/ })
      .click();
    const onay = page.getByRole('alertdialog', { name: 'Değerlendirme geri çekilsin mi?' });
    await expect(onay).toContainText('Bu işlem geri alınamaz');
    await onay.getByRole('button', { name: 'Geri çek' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Değerlendirme geri çekildi.' }),
    ).toBeVisible();
    await expect(satirlar(page)).toHaveCount(4);
    await expect(page.getByText('düzeltildi')).toHaveCount(0);
  });

  test('kaynak oner: kitaptan test, link dogrulamasi, serbest; geri cekme', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await kocluguAc(page);
    await page.getByRole('button', { name: 'Kaynak öner' }).click();
    const pencere = page.getByRole('dialog', { name: 'Kaynak öner' });

    // Kitaptan test
    await pencere.getByLabel('Kaynak türü').selectOption('kaynak_kitap_testi');
    await pencere.getByRole('button', { name: 'Öner' }).click();
    await expect(pencere.getByText('Bir kitap seç.')).toBeVisible();
    await pencere
      .getByLabel('Kaynak kitap')
      .selectOption({ label: 'Ornek Matematik Soru Bankası' });
    await pencere.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 2 (25 soru)' });
    await pencere.getByLabel('Not (isteğe bağlı)').fill('Önce yanlış yaptığın soruları tekrar et.');
    await pencere.getByRole('button', { name: 'Öner' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Kaynak önerildi.' })).toBeVisible();
    await expect(oneriSatirlari(page)).toHaveCount(4);
    const test2 = oneriSatirlari(page).filter({ hasText: 'Test 2' });
    await expect(test2).toContainText('Ornek Matematik Soru Bankası · Test 2');
    await expect(test2).toContainText('Önce yanlış yaptığın soruları tekrar et.');
    await expect(test2).toContainText('Henüz başlamadı');

    // Link: yalniz http/https
    await page.getByRole('button', { name: 'Kaynak öner' }).click();
    const ikinci = page.getByRole('dialog', { name: 'Kaynak öner' });
    await ikinci.getByLabel('Kaynak türü').selectOption('link');
    await ikinci.getByLabel('Bağlantı', { exact: true }).fill('javascript:alert(1)');
    await ikinci.getByLabel('Başlık').fill('Kötü bağlantı');
    await ikinci.getByRole('button', { name: 'Öner' }).click();
    await expect(
      ikinci.getByText('http ya da https ile başlayan geçerli bir adres gir.'),
    ).toBeVisible();
    await ikinci.getByLabel('Bağlantı', { exact: true }).fill('https://ornek.com/video');
    await ikinci.getByLabel('Başlık').fill('Konu anlatım videosu');
    await ikinci.getByRole('button', { name: 'Öner' }).click();
    await expect(oneriSatirlari(page)).toHaveCount(5);

    // Serbest metin
    await page.getByRole('button', { name: 'Kaynak öner' }).click();
    const ucuncu = page.getByRole('dialog', { name: 'Kaynak öner' });
    await ucuncu.getByLabel('Kaynak türü').selectOption('serbest');
    await ucuncu.getByLabel('Başlık').fill('Okul kütüphanesindeki çıkmış sorular');
    await ucuncu.getByRole('button', { name: 'Öner' }).click();
    await expect(oneriSatirlari(page)).toHaveCount(6);

    // Geri cekme (onerenin kendi onerisi)
    const serbest = oneriSatirlari(page).filter({ hasText: 'Okul kütüphanesindeki' });
    await serbest.getByRole('button', { name: 'Geri çek' }).click();
    await page
      .getByRole('alertdialog', { name: 'Öneri geri çekilsin mi?' })
      .getByRole('button', { name: 'Geri çek' })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Öneri geri çekildi.' })).toBeVisible();
    await expect(oneriSatirlari(page)).toHaveCount(5);
    // Baska ogretmenin onerisi (Hasan Polat): geri cekme yok.
    await expect(
      oneriSatirlari(page)
        .filter({ hasText: 'Hasan Polat' })
        .getByRole('button', { name: 'Geri çek' }),
    ).toHaveCount(0);
  });

  test('Bugun: degerlendirmesi olmayan ogrenciler karti; ogrenciye dokununca koçluk ve yazma penceresi', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    const kart = page.getByTestId('degerlendirme-hatirlatma');
    await expect(
      page.getByRole('heading', { name: 'Bu hafta değerlendirmesi olmayan öğrencilerim' }),
    ).toBeVisible();
    await expect(kart.getByRole('link')).toHaveCount(6); // 5 ogrenci + "Tum ogrenciler"
    await expect(kart).toContainText('Henüz yazılmadı');
    await expect(kart).toContainText('4 öğrenci daha var');
    // Bu hafta yazilmis olan ogrenci listede yok.
    await expect(kart.getByText(OGRENCI)).toHaveCount(0);

    await kart
      .getByRole('link', { name: /için değerlendirme yaz/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/ogrenciler\/[0-9a-f-]{36}\?sekme=kocluk&yaz=1$/);
    const pencere = page.getByRole('dialog', { name: 'Değerlendirme yaz' });
    await expect(pencere).toBeVisible();
    await olcekSec(pencere, 'Ödev disiplini', 3);
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Değerlendirme kaydedildi.' }),
    ).toBeVisible();

    // Kart yenilenince o ogrenci listeden duser (8 eksik: 4 gorunen + "3 ogrenci daha").
    await page.goto(`/${kok(page)}/bugun`);
    await expect(page.getByTestId('degerlendirme-hatirlatma')).toContainText('3 öğrenci daha var');
  });
});

test.describe('yonetici (Mavi): baska ogretmenin yorumunu geri cekebilir', () => {
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('yonetici duzenleyemez ama geri cekebilir', async ({ page }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await kocluguAc(page);
    const baskasi = satirlar(page).filter({ hasText: 'Geçen haftaki konuları tekrar' });
    await expect(baskasi.getByRole('button', { name: /Düzenle/ })).toHaveCount(0);
    await baskasi.getByRole('button', { name: /Geri çek/ }).click();
    await page
      .getByRole('alertdialog', { name: 'Değerlendirme geri çekilsin mi?' })
      .getByRole('button', { name: 'Geri çek' })
      .click();
    await expect(page.getByText('Geçen haftaki konuları tekrar')).toHaveCount(0);
  });
});

test.describe('ogrenci (Atlas): ogretmenimin yazdiklari ve onerdikleri', () => {
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');
  test.describe.configure({ mode: 'serial' });

  test('yalniz gorunur olan degerlendirme ve onerilen kaynaklar', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/${kok(page)}/gunluk-soru?sekme=ogretmenim`);
    await expect(page.getByRole('tab', { name: 'Öğretmenim' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const liste = page.getByTestId('ogretmenim');
    // Tek gorunur degerlendirme; gizli yorumlar hicbir yerde yok.
    await expect(liste.getByTestId('degerlendirme-satiri')).toHaveCount(1);
    await expect(liste.getByTestId('degerlendirme-satiri')).toContainText('Burcu Tekin');
    await expect(liste.getByTestId('degerlendirme-satiri')).toContainText(
      'Derslere düzenli katılıyor',
    );
    await expect(page.getByText('Geçen haftaki konuları tekrar')).toHaveCount(0);
    await expect(page.getByText('Hafta boyunca istikrarlı')).toHaveCount(0);
    // Gorunurluk bilgisi ve yazar kimligi ogrenciye acilmaz.
    await expect(liste.getByText('Öğrenci görüyor')).toHaveCount(0);

    // Oneriler
    await expect(liste.getByTestId('oneri-satiri')).toHaveCount(3);
    await expect(
      liste.getByTestId('oneri-satiri').filter({ hasText: 'Ornek Matematik' }),
    ).toContainText('Hasan Polat önerdi');
    await expect(liste.getByRole('link', { name: 'Bağlantıyı aç' })).toHaveAttribute(
      'href',
      'https://example.com/uslu-sayilar',
    );
    await expect(liste.getByRole('link', { name: 'Bağlantıyı aç' })).toHaveAttribute(
      'target',
      '_blank',
    );
    await expect(liste.getByRole('link', { name: 'Bağlantıyı aç' })).toHaveAttribute(
      'rel',
      /noopener/,
    );
  });

  test('oneriden "Soru cozdum": kaynak on secili; kayit girilince oneri baslamis olur', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/${kok(page)}/gunluk-soru?sekme=ogretmenim`);
    const oneri = page.getByTestId('oneri-satiri').filter({ hasText: 'Ornek Matematik' });
    await expect(oneri).not.toContainText('Başladı');
    await oneri.getByRole('link', { name: 'Günlük kayıtta kullan' }).click();
    await expect(page.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();
    // Kitap on secili (oneri), ders/konu onerinin dersi/konusu.
    await expect(page.getByLabel('Kaynak türü')).toHaveValue('test');
    await expect(page.getByLabel('Kitap', { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel('Ders', { exact: true })).toHaveValue('matematik');
    await expect(page.getByRole('button', { name: /^Konu .*Rasyonel sayılar/ })).toBeVisible();
    await page.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 1 (20 soru)' });
    await page.getByRole('textbox', { name: 'Doğru', exact: true }).fill('12');
    await page.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('6');
    await page.getByRole('textbox', { name: 'Boş', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Kaydedildi: 20 soru.' })).toBeVisible();

    await page.goto(`/${kok(page)}/gunluk-soru?sekme=ogretmenim`);
    await expect(
      page.getByTestId('oneri-satiri').filter({ hasText: 'Ornek Matematik' }),
    ).toContainText('Başladı');

    // Serbest oneri: metin on secilir.
    await page
      .getByTestId('oneri-satiri')
      .filter({ hasText: 'Zor sorular fasikülü' })
      .getByRole('link', { name: 'Günlük kayıtta kullan' })
      .click();
    await expect(page.getByLabel('Kaynak türü')).toHaveValue('serbest');
    await expect(page.getByLabel('Kaynak adı')).toHaveValue('Zor sorular fasikülü');
  });
});

/** Salt okunur sayfalar: axe iki temada ve dar ekranda yatay tasma olmamali (iki projede de). */
for (const tema of ['light', 'dark'] as const) {
  test.describe(`koçluk erisilebilirlik ve duzen (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('ogretmen: koçluk sekmesi, yazma ve oneri pencereleri, Bugun karti', async ({ page }) => {
      test.setTimeout(90_000);
      await girisYap(page, 'Ege Işık Dershanesi');
      await expect(page.getByTestId('degerlendirme-hatirlatma')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await kocluguAc(page);
      await expect(satirlar(page).first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.getByRole('button', { name: 'Değerlendirme yaz' }).click();
      await expect(page.getByRole('dialog', { name: 'Değerlendirme yaz' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Kaynak öner' }).click();
      await expect(page.getByRole('dialog', { name: 'Kaynak öner' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });

    test('ogrenci: Ogretmenim sekmesi', async ({ page }) => {
      await girisYap(page, 'Atlas Etüt Merkezi');
      await page.goto(`/${kok(page)}/gunluk-soru?sekme=ogretmenim`);
      await expect(page.getByTestId('ogretmenim')).toBeVisible();
      await expect(page.getByTestId('oneri-satiri').first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
    });
  });
}
