import { deflateSync } from 'node:zlib';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

import { durumluTest as test, girisYap } from './yardimcilar';

/**
 * Mock modda gunluk soru takibi ve konu analizi. Roller kurumdan gelir: `Atlas` ogrenci, `Ege` ogretmen,
 * `Mavi` yonetici. Tohum ("Cağlar Yildiz"): Tam sayilarin negatif kuvvetleri konusunda kolay %90 / orta %60 /
 * zor %25 ("orta seviyede zorlaniyor"), Rasyonel sayilarda "birebir ders gerekebilir". Durumlu akislar yalniz
 * masaustunde ve sirali kosar; salt okunur kontroller (axe iki tema, mobil tasma) ikisinde de.
 */

const KONU = 'Tam sayıların negatif kuvvetleri';
const AYRAC = Date.now().toString(36);

/** Gecerli, kucuk bir PNG uretir (tarayicida cozulup JPEG'e cevrilir). */
function pngUret(genislik = 64, yukseklik = 48): Buffer {
  const crcTablosu = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTablosu[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parca = (tur: string, veri: Buffer) => {
    const uzunluk = Buffer.alloc(4);
    uzunluk.writeUInt32BE(veri.length);
    const govde = Buffer.concat([Buffer.from(tur, 'ascii'), veri]);
    const sonu = Buffer.alloc(4);
    sonu.writeUInt32BE(crc(govde));
    return Buffer.concat([uzunluk, govde, sonu]);
  };
  const baslik = Buffer.alloc(13);
  baslik.writeUInt32BE(genislik, 0);
  baslik.writeUInt32BE(yukseklik, 4);
  baslik.writeUInt8(8, 8);
  baslik.writeUInt8(2, 9);
  const satir = Buffer.concat([Buffer.from([0]), Buffer.alloc(genislik * 3, 200)]);
  const ham = Buffer.concat(Array.from({ length: yukseklik }, () => satir));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', baslik),
    parca('IDAT', deflateSync(ham)),
    parca('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = pngUret();

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

/** Ogretmen: ogrenci listesinden "Cağlar Yildiz" kartina, "Konu analizi" sekmesine. */
async function ogrenciKonuAnalizi(page: Page) {
  await page.goto(`/${kok(page)}/ogrenciler`);
  await page.getByRole('link', { name: 'Çağlar Yıldız' }).first().click();
  await expect(page.getByRole('heading', { name: 'Çağlar Yıldız', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Konu analizi' }).click();
  await expect(page.getByTestId('isi-haritasi')).toBeVisible();
}

test.describe('ogrenci: soru cozdum (15 sn akisi), duzelt, sil, kendi analizi', () => {
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');
  test.describe.configure({ mode: 'serial' });

  test('Bugun ekranindan hizli giris: klavyeyle kayit, son secimler hatirlanir', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.getByRole('link', { name: /Soru çözdüm/ }).click();
    await expect(page.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();

    // Tohumdan son kullanilanlar: ders, konu ve zorluk hazir; odak "Dogru" alaninda.
    await expect(page.getByLabel('Ders', { exact: true })).toHaveValue('matematik');
    await expect(page.getByRole('radio', { name: 'Kolay' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Doğru', exact: true })).toBeFocused();

    // 15 sn akisi: yalniz D/Y yazilir ve Enter ile kaydedilir.
    await page.keyboard.type('8');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2');
    await expect(page.getByTestId('kayit-toplam')).toHaveText('Toplam: 10 soru');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Kaydedildi: 10 soru.' })).toBeVisible();

    // Ikinci kayit: baska konu, zor, kitaptan test, fotografli; sonraki kayit bu secimleri hatirlar.
    await page.getByRole('button', { name: 'Bir kayıt daha ekle' }).click();
    await page.getByRole('button', { name: /^Konu / }).click();
    await page.getByRole('searchbox', { name: 'Konu ara' }).fill('rasyonel');
    await page
      .getByRole('group', { name: 'Konu seçimi' })
      .getByRole('button', { name: 'Rasyonel sayılar' })
      .click();
    await page.locator('label', { hasText: /^Zor$/ }).click();
    await page.getByLabel('Kaynak türü').selectOption('test');
    await page
      .getByLabel('Kitap', { exact: true })
      .selectOption({ label: 'Ornek Matematik Soru Bankası' });
    await page.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 2 (25 soru)' });
    await page.getByRole('textbox', { name: 'Doğru', exact: true }).fill('3');
    await page.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('6');
    await page.getByRole('textbox', { name: 'Boş', exact: true }).fill('1');
    await page.getByTestId('foto-girdisi').setInputFiles({
      name: 'yanlis.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    // Fotograf yuklenip hazir olana kadar "Kaydet" etkin olmaz.
    await expect(page.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Kaydedildi: 10 soru.' })).toBeVisible();

    await page.getByRole('button', { name: 'Bir kayıt daha ekle' }).click();
    await expect(page.getByRole('button', { name: /^Konu .*Rasyonel sayılar/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Zor' })).toBeChecked();
    await expect(page.getByLabel('Test', { exact: true })).toHaveValue(/.+/);
  });

  test('kayitlarim: ayni gun duzeltilir ve silinir, onceki gun kilitlidir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/${kok(page)}/gunluk-soru`);
    await expect(page.getByRole('heading', { name: 'Soru takibim', level: 1 })).toBeVisible();
    const bugunku = page
      .getByTestId('kayit-satiri')
      .filter({ hasText: 'Rasyonel sayılar' })
      .first();
    await expect(bugunku).toContainText('3 D · 6 Y · 1 B');
    await expect(bugunku).toContainText('1 fotoğraf');
    // Onceki gunlerin kayitlari kilitli.
    await expect(page.getByText('Yalnızca girildiği gün düzeltilebilir').first()).toBeVisible();

    await bugunku.getByRole('button', { name: /kaydını düzelt/ }).click();
    const pencere = page.getByRole('dialog', { name: 'Kaydı düzelt' });
    await pencere.getByRole('textbox', { name: 'Doğru', exact: true }).fill('5');
    await pencere.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('4');
    await pencere.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(page.getByText('Kayıt güncellendi.')).toBeVisible();
    await expect(
      page.getByTestId('kayit-satiri').filter({ hasText: 'Rasyonel sayılar' }).first(),
    ).toContainText('5 D · 4 Y · 1 B');

    const silinecek = page
      .getByTestId('kayit-satiri')
      .filter({ hasText: '8 D · 2 Y · 0 B' })
      .first();
    await silinecek.getByRole('button', { name: /kaydını sil/ }).click();
    await page.getByRole('button', { name: 'Evet, sil' }).click();
    await expect(page.getByText('Kayıt silindi.')).toBeVisible();
    await expect(
      page.getByTestId('kayit-satiri').filter({ hasText: '8 D · 2 Y · 0 B' }),
    ).toHaveCount(0);
  });

  test('kendi konu analizim: bant tespiti var, oneri ve gorev ver yok', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/${kok(page)}/gunluk-soru?sekme=analiz`);
    const harita = page.getByTestId('isi-haritasi');
    await expect(harita).toBeVisible();
    const satir = harita.getByRole('row').filter({ hasText: KONU });
    await expect(satir).toContainText('Orta seviyede zorlanıyor');
    await expect(
      satir.getByRole('button', { name: /Kolay: 20 soru çözüldü, 18 doğru, başarı %90, iyi/ }),
    ).toBeVisible();
    await expect(
      satir.getByRole('button', { name: /Zor: 16 soru çözüldü, 4 doğru, başarı %25, zayıf/ }),
    ).toBeVisible();
    // Ogrenci gorunumunde oneriler ve "Gorev ver" yoktur.
    await expect(page.getByRole('heading', { name: 'Öneriler' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Görev ver/ })).toHaveCount(0);
    await expect(page.getByText('Birebir ders gerekebilir')).toHaveCount(0);
    await expect(page.getByText(/görev öner/)).toHaveCount(0);
  });

  test('plan gorevinden "bu gorev icin kayit gir" baglantisi formu on dolu acar', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(`/${kok(page)}/planlar`);
    await page
      .getByRole('link', { name: /görevi için soru kaydı gir/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();
    await expect(page.getByText(/Plan görevi: Matematik · \d+ soru/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Doğru', exact: true }).fill('4');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Kaydedildi: 4 soru.' })).toBeVisible();
  });
});

test.describe('ogretmen: konu analizi, hucre ayrintisi, gorev ver, grup, kaynak kitap', () => {
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');
  test.describe.configure({ mode: 'serial' });

  test('ogrenci kartinda konu analizi: isi haritasi, bant, oneriler, haftalik ozet', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await ogrenciKonuAnalizi(page);
    await expect(page.getByTestId('haftalik-ozet')).toBeVisible();
    const harita = page.getByTestId('isi-haritasi');
    const satir = harita.getByRole('row').filter({ hasText: KONU });
    await expect(satir).toContainText('Orta seviyede zorlanıyor');
    // Erisilebilir: renk yaninda yuzde, sayi ve seviye metni.
    const orta = satir.getByRole('button', {
      name: /Orta: 20 soru çözüldü, 12 doğru, başarı %60, orta/,
    });
    await expect(orta).toContainText('%60');
    await expect(orta).toContainText('12/20 doğru');
    await expect(orta).toContainText('orta');
    // Yeterli verisi olmayan konu "Veri az"; birebir ders isareti.
    await expect(harita.getByRole('row').filter({ hasText: 'Kareköklü' })).toContainText('Veri az');
    await expect(harita.getByRole('row').filter({ hasText: 'Rasyonel sayılar' })).toContainText(
      'Birebir ders gerekebilir',
    );
    const oneriler = page.getByTestId('oneriler');
    await expect(oneriler).toContainText(`${KONU}: orta seviyeden 20 soruluk görev öner`);
    await expect(oneriler).toContainText('Birebir ders gerekebilir');
  });

  test('hucre ayrintisi kayitlari ve fotograflari gosterir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await ogrenciKonuAnalizi(page);
    await page
      .getByTestId('isi-haritasi')
      .getByRole('button', { name: new RegExp(`${KONU}, Zor: 16 soru çözüldü`) })
      .click();
    const pencere = page.getByRole('dialog', { name: `${KONU} · Zor` });
    await expect(
      pencere.getByTestId('hucre-kayitlari').getByRole('listitem').first(),
    ).toBeVisible();
    await expect(pencere.getByText('2 D · 5 Y · 1 B')).toBeVisible();
    await expect(pencere.getByRole('img')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(pencere).toHaveCount(0);
  });

  test('oneriden gorev ver: plana ve odeve, ogretmen onayiyla', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await ogrenciKonuAnalizi(page);
    await page.getByRole('button', { name: `${KONU} için görev ver` }).click();
    const pencere = page.getByRole('dialog', { name: 'Görev ver' });
    await expect(pencere.getByLabel('Soru sayısı')).toHaveValue('20');
    await pencere.getByRole('button', { name: 'Onayla ve ver' }).click();
    await expect(pencere.getByTestId('gorev-verildi')).toContainText(`Plana eklendi: ${KONU}`);
    // Odev yolu birim testlerinde (gunluk-soru-mock.test.ts) denenir: paylasilan mock durumunda ayni
    // konulu bir odev, ogrenme.spec.ts'in odev listesi arayanlarini bozar.
    await expect(pencere.getByRole('link', { name: 'Planı aç' })).toBeVisible();
  });

  test('grup/sinif gorunumu: konu ortalamalari ve en cok zorlanilan konular', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto(`/${kok(page)}/gruplar`);
    await page
      .getByRole('link', { name: /9-A Sınıfı/ })
      .first()
      .click();
    const kart = page.getByTestId('grup-konu-analizi');
    await expect(kart.getByRole('heading', { name: 'Konu analizi' })).toBeVisible();
    await expect(kart.getByTestId('en-cok-zorlanilan')).toContainText(KONU);
    await expect(kart.getByRole('row').filter({ hasText: KONU })).toContainText('%');
  });

  test('kaynak kitap: tanimla, test ekle, pasiflestir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.goto(`/${kok(page)}/kaynak-kitaplar`);
    await expect(page.getByRole('heading', { name: 'Kaynak kitaplar', level: 1 })).toBeVisible();
    await expect(page.getByTestId('kitap-karti').first()).toBeVisible();

    const ad = `Deneme Bankası ${AYRAC}`;
    await page.getByRole('button', { name: 'Kitap ekle' }).click();
    const form = page.getByRole('dialog', { name: 'Kitap ekle' });
    await form.getByLabel('Kitap adı').fill(ad);
    await form.getByLabel('Yayınevi (isteğe bağlı)').fill('Y Yayınları');
    await form.getByLabel('Ders').selectOption('biyoloji');
    await form.getByLabel('Testler').fill('Test 1, 20\nTest 2, 25');
    await form.getByRole('button', { name: 'Kitabı ekle' }).click();
    await expect(page.getByText(`Kitap eklendi: ${ad}.`)).toBeVisible();
    const kart = page.getByTestId('kitap-karti').filter({ hasText: ad });
    await expect(kart).toContainText('2 test · 45 soru');

    await kart.getByRole('button', { name: `${ad} testlerini göster` }).click();
    await expect(kart.getByTestId('kitap-testleri')).toContainText('Test 2 · 25 soru');
    await kart.getByLabel('Test ekle').first().fill('Test 3, 30');
    await kart.getByRole('button', { name: 'Test ekle' }).click();
    await expect(kart.getByTestId('kitap-testleri')).toContainText('Test 3 · 30 soru');
    await kart.getByRole('button', { name: 'Test 3 testini sil' }).click();
    await page.getByRole('button', { name: 'Evet, sil' }).click();
    await expect(kart.getByTestId('kitap-testleri')).not.toContainText('Test 3');

    await kart.getByRole('button', { name: 'Pasifleştir' }).click();
    await expect(page.getByText('Kitap pasifleştirildi')).toBeVisible();
    await expect(page.getByTestId('kitap-karti').filter({ hasText: ad })).toHaveCount(0);
    await page.getByLabel('Pasif kitapları da göster').check();
    await expect(page.getByTestId('kitap-karti').filter({ hasText: ad })).toContainText('Pasif');
  });
});

/** Salt okunur sayfalar: axe iki temada ve dar ekranda yatay tasma olmamali (iki projede de). */
for (const tema of ['light', 'dark'] as const) {
  test.describe(`gunluk soru erisilebilirlik ve duzen (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('ogrenci: soru cozdum formu ve konu analizim', async ({ page }) => {
      await girisYap(page, 'Atlas Etüt Merkezi');
      await page.goto(`/${kok(page)}/soru-cozdum`);
      await expect(page.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();
      await expect(page.getByLabel('Ders', { exact: true })).toHaveValue('matematik');
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.goto(`/${kok(page)}/gunluk-soru?sekme=analiz`);
      await expect(page.getByTestId('isi-haritasi')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
    });

    test('ogretmen: ogrenci kartinda konu analizi, grup ve kaynak kitaplar', async ({ page }) => {
      await girisYap(page, 'Ege Işık Dershanesi');
      await ogrenciKonuAnalizi(page);
      await expect(page.getByTestId('oneriler')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.goto(`/${kok(page)}/gruplar`);
      await page
        .getByRole('link', { name: /9-A Sınıfı/ })
        .first()
        .click();
      await expect(page.getByTestId('grup-konu-analizi')).toBeVisible();
      await expect(page.getByTestId('en-cok-zorlanilan')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);

      await page.goto(`/${kok(page)}/kaynak-kitaplar`);
      await expect(page.getByTestId('kitap-karti').first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await tasmaYok(page);
    });
  });
}
