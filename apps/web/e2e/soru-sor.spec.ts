import { deflateSync } from 'node:zlib';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda "soru sor": ogrenci fotografla sorar -> ogretmen metin + cizimli fotografla cevaplar -> ogrenci
 * "anladim" der; kota dolu; yonetici ayar ve masa. Soru deposu kurumlar arasi ortaktir, bu yuzden durumlu
 * akis tek sirali senaryodur ve yalniz masaustu projesinde kosar. Salt okunur sayfa kontrolleri ikisinde de.
 */

const AYRAC = Date.now().toString(36);
const NOT = `Burada takıldım ${AYRAC}`;
const CEVAP = `Ters işlem yapalım ${AYRAC}`;

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

const YOLLAR: Record<string, string> = { 'Soru sor': 'soru-sor', Sorular: 'sorular' };

/** Masaustunde yan menuden, dar ekranda (menu cekmecede) adrese giderek. */
async function menu(page: Page, ad: string) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const kok = new URL(page.url()).pathname.split('/')[1] ?? '';
    await page.goto(`/${kok}/${YOLLAR[ad] ?? ''}`);
    return;
  }
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: ad }).click();
}

async function ihlaller(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  await page.mouse.move(0, 0);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function soruSor(page: Page, not: string) {
  await menu(page, 'Soru sor');
  await expect(page.getByRole('heading', { name: 'Soru sor', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Yeni soru' }).click();
  await page
    .getByTestId('foto-girdisi')
    .setInputFiles({ name: 'defter.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('foto-ogesi')).toHaveCount(1);
  await page.getByLabel('Ders', { exact: true }).selectOption('matematik');
  await page.getByLabel('Burada takıldım').fill(not);
  await expect(page.getByText('Yüklendi')).toBeVisible({ timeout: 20_000 });
  // Kirp/dondur onizlemesi cizilir; dondurup uygulayinca yeniden yuklenir.
  await page.getByRole('button', { name: /Kırp \/ döndür/ }).click();
  const onizleme = page.getByRole('img', { name: 'Kırpma çerçevesi önizlemesi' });
  await expect
    .poll(() =>
      onizleme.evaluate(
        (c: HTMLCanvasElement) => c.getContext('2d')?.getImageData(1, 1, 1, 1).data[3] ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sağa döndür' }).click();
  await page.getByRole('button', { name: 'Uygula' }).click();
  await expect(page.getByText('Yüklendi')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Soruyu gönder' }).click();
  await expect(page.getByRole('heading', { name: 'Sorun gönderildi' })).toBeVisible();
}

test.describe('soru sor akisi', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('yonetici: gunluk kotayi 2 yapar, masa olusturur, olcum ve bildirimleri gorur', async ({
    page,
  }) => {
    await girisYap(page, 'Mavi');
    await menu(page, 'Sorular');
    await expect(page.getByRole('heading', { name: 'Sorular', level: 1 })).toBeVisible();

    await page.getByRole('tab', { name: 'Ayarlar' }).click();
    const gunluk = page.getByLabel('Günlük soru hakkı', { exact: true });
    await gunluk.fill('2');
    await page.getByRole('button', { name: 'Ayarları kaydet' }).click();
    await expect(page.getByText('Ayarlar kaydedildi.')).toBeVisible();

    await page.getByRole('tab', { name: 'Soru masaları' }).click();
    await page.getByRole('button', { name: 'Yeni masa' }).click();
    const form = page.getByRole('form', { name: 'Yeni masa' });
    await form.getByLabel('Masa adı').fill(`Masa ${AYRAC}`);
    await form.getByLabel('Ders').selectOption('fizik');
    await form.getByRole('button', { name: 'Masayı oluştur' }).click();
    await expect(page.getByText('Masa oluşturuldu.')).toBeVisible();
    const kart = page.getByTestId('masa-karti').filter({ hasText: `Masa ${AYRAC}` });
    await expect(kart).toBeVisible();
    await kart.getByRole('button', { name: 'Pasife al' }).click();
    await expect(page.getByText('Masa pasife alındı.')).toBeVisible();

    await page.getByRole('tab', { name: 'Ölçüm' }).click();
    await expect(page.getByTestId('olcum-ozeti')).toBeVisible();
    await page.getByRole('tab', { name: 'Bildirimler' }).click();
    await expect(page.getByText('Bildirim yok')).toBeVisible();
    await page.getByRole('tab', { name: 'Tüm yazışmalar' }).click();
    await expect(page.getByTestId('soru-satiri').first()).toBeVisible();
  });

  test('ogrenci: fotografli soru sorar, tahmini sure ve kalan hak gorunur', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await soruSor(page, NOT);
    await expect(page.getByTestId('tahmini-sure')).toContainText('Tahmini cevap süresi');
    await expect(page.getByText('Bugün 1 soru hakkın kaldı.')).toBeVisible();
  });

  test('ogretmen: bekleyen soruyu metin ve cizimli fotografla cevaplar', async ({ page }) => {
    await girisYap(page, 'Ege');
    await expect(page.getByTestId('bugun-soru-sayisi')).toBeVisible();
    await menu(page, 'Sorular');
    await expect(page.getByRole('tab', { name: /Cevap bekleyen \(\d+\)/ })).toBeVisible();
    await expect(page.getByTestId('menu-bekleyen-sayi')).toBeVisible();

    await page.getByRole('link', { name: new RegExp(NOT) }).click();
    await expect(page.getByRole('heading', { name: NOT, level: 1 })).toBeVisible();

    await page.getByLabel('Cevap metni').fill(CEVAP);
    await page.getByRole('button', { name: 'Fotoğraf üzerine çiz' }).click();
    const tuval = page.getByTestId('cizim-tuvali');
    await expect(tuval).toBeVisible();
    await expect(page.getByRole('button', { name: 'Silgi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Geri al' })).toBeDisabled();
    const k = await tuval.boundingBox();
    if (!k) throw new Error('tuval yok');
    await page.mouse.move(k.x + k.width * 0.2, k.y + k.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(k.x + k.width * 0.5, k.y + k.height * 0.5, { steps: 6 });
    await page.mouse.move(k.x + k.width * 0.8, k.y + k.height * 0.4, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Geri al' })).toBeEnabled();
    await page.getByRole('button', { name: 'Geri al' }).click();
    await expect(page.getByRole('button', { name: 'Yinele' })).toBeEnabled();
    await page.getByRole('button', { name: 'Yinele' }).click();
    await page.getByRole('button', { name: 'Çizimi kaydet' }).click();
    await expect(page.getByTestId('cevap-eki')).toHaveCount(1);
    await expect(page.getByText('Yüklendi')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Cevabı gönder' }).click();
    await expect(page.getByText('Cevabın öğrenciye gönderildi.')).toBeVisible();
    await expect(page.getByTestId('mesaj').filter({ hasText: CEVAP })).toBeVisible();
    await expect(page.getByText('Çizimli fotoğraf')).toBeVisible();

    await menu(page, 'Sorular');
    await page.getByRole('tab', { name: 'Cevapladığım sorular' }).click();
    await expect(page.getByRole('link', { name: new RegExp(NOT) })).toBeVisible();
  });

  test('ogrenci: cevabi ve cizimli fotografi gorur, anladim der', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await menu(page, 'Soru sor');
    await page.getByRole('tab', { name: 'Sorularım' }).click();
    // Arama ve durum suzgeci
    await page.getByLabel('Ara', { exact: true }).fill(AYRAC);
    await page.getByRole('link', { name: new RegExp(NOT) }).click();
    await expect(page.getByText('Cevaplandı').first()).toBeVisible();
    await expect(page.getByTestId('mesaj').filter({ hasText: CEVAP })).toBeVisible();
    const cizimli = page.getByRole('img', { name: '1. çizimli fotoğraf' });
    await expect(cizimli).toBeVisible();
    await expect
      .poll(() => cizimli.evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBeGreaterThan(0);
    // Buyutme penceresi
    await page.getByRole('button', { name: /1\. çizimli fotoğraf/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Anladım' }).click();
    await expect(page.getByText('Süper! Soru çözüldü olarak işaretlendi.')).toBeVisible();
    await expect(page.getByText('Çözüldü').first()).toBeVisible();
    // Cozulmus soru yeniden acilabilir
    await page.getByRole('button', { name: 'Yeniden aç' }).click();
    await page.getByLabel('Neyi anlamadın?').fill('Bir adım daha açıklar mısın?');
    await page.getByRole('button', { name: 'Takip sorusunu gönder' }).click();
    await expect(page.getByText('Soru yeniden açıldı; takip sorun gönderildi.')).toBeVisible();
    await expect(page.getByText('Takip sorusu bekliyor').first()).toBeVisible();

    await page.getByRole('button', { name: 'Uygunsuz içerik bildir' }).click();
    const pencere = page.getByRole('dialog');
    await pencere.getByLabel('Neden').selectOption('diger');
    await pencere.getByRole('button', { name: 'Bildir' }).click();
    await expect(page.getByText(/Bildirimin yöneticiye iletildi/)).toBeVisible();
  });

  test('ogrenci: kota dolunca acik mesaj ve sifirlanma zamani, gonder kapali', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await soruSor(page, `Kota sorusu ${AYRAC}`);
    await page.getByRole('button', { name: 'Yeni soru sor' }).click();
    await expect(page.getByTestId('kota-bilgisi')).toContainText('Bugünkü soru hakkın doldu.');
    await expect(page.getByTestId('kota-bilgisi')).toContainText('yenilenir');
    await page
      .getByTestId('foto-girdisi')
      .setInputFiles({ name: 'd.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('Ders', { exact: true }).selectOption('matematik');
    await expect(page.getByText('Yüklendi')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Soruyu gönder' })).toBeDisabled();
  });

  test('yonetici bildirimi gorur ve kapatir', async ({ page }) => {
    await girisYap(page, 'Mavi');
    await menu(page, 'Sorular');
    await page.getByRole('tab', { name: 'Bildirimler' }).click();
    const liste = page.getByTestId('bildirim-listesi');
    await expect(liste.getByText('Diğer').first()).toBeVisible();
    await liste.getByRole('button', { name: 'Bildirimi kapat' }).first().click();
    const pencere = page.getByRole('dialog');
    await pencere.getByLabel('Not (isteğe bağlı)').fill('İncelendi');
    await pencere.getByRole('button', { name: 'Bildirimi kapat' }).click();
    await expect(page.getByText('Bildirim kapatıldı.')).toBeVisible();
  });

  test('ogretmen: bugun cevap veremiyorum anahtari', async ({ page }) => {
    await girisYap(page, 'Ege');
    await menu(page, 'Sorular');
    const anahtar = page.getByRole('switch', { name: 'Bugün cevap veremiyorum' });
    await expect(anahtar).toHaveAttribute('aria-checked', 'false');
    await anahtar.click();
    await expect(anahtar).toHaveAttribute('aria-checked', 'true');
    await anahtar.click();
    await expect(anahtar).toHaveAttribute('aria-checked', 'false');
  });
});

for (const tema of ['light', 'dark'] as const) {
  test.describe(`soru sor sayfalari (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('ogrenci: soru sor formu ve arsiv', async ({ page }) => {
      await girisYap(page, 'Atlas');
      await menu(page, 'Soru sor');
      await expect(page.getByRole('heading', { name: 'Soru sor', level: 1 })).toBeVisible();
      await expect(page.getByTestId('foto-birakma-alani')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.getByRole('tab', { name: 'Sorularım' }).click();
      await expect(page.getByTestId('soru-listesi')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });

    test('ogretmen ve yonetici: sorular sayfalari', async ({ page }) => {
      await girisYap(page, 'Mavi');
      await menu(page, 'Sorular');
      await expect(page.getByTestId('soru-listesi')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      for (const sekme of ['Ayarlar', 'Soru masaları', 'Ölçüm']) {
        await page.getByRole('tab', { name: sekme }).click();
        await page.waitForTimeout(300);
        expect(await ihlaller(page), sekme).toEqual([]);
      }
    });
  });
}

test('klavye: foto secici dugmeleri odaklanabilir ve etiketli', async ({ page }) => {
  await girisYap(page, 'Atlas');
  await menu(page, 'Soru sor');
  const sec = page.getByRole('button', { name: 'Fotoğraf seç', exact: true });
  await sec.focus();
  await expect(sec).toBeFocused();
  await expect(page.getByRole('button', { name: 'Fotoğraf çek', exact: true })).toBeVisible();
  await expect(page.getByLabel('Burada takıldım')).toBeVisible();
});
