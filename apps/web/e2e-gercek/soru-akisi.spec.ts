import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { kayitOrtaminiKur } from './yardimcilar-kayit';

/**
 * Gercek `api` + gercek `medya` (+ S3) ile "soru sor" (solo hoca kurumu; soru sahibin kuyruguna duser): ogrenci gercek bir fotografla (kirp/dondur, isaret) soru
 * sorar -> sahip (cevaplayici) fotograf uzerine cizim + sesli anlatim (MediaRecorder, sahte mikrofon) + metinle
 * cevaplar -> ogrenci cizimli fotografi gorur, sesi dinler, "anladim" der. Fotograf ve ses tarayicidan
 * dogrudan presigned adrese PUT edilir. `EKRAN_KAYDET=<dizin>` verilirse goruntuler yazilir.
 * On kosul: api (API_URL), medya (web `MEDYA_URL`), iki worker, S3 ve medya `CORS_ORIGINS` = web adresi.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

async function girisYap(page: Page, telefon: string, kurumAdi: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  await page.waitForURL(/\/(kurum-sec|[0-9a-f-]{36}\/bugun)$/);
  // Tek uyelikte kurum secimi kendiliginden gecilir; birden cok uyelikte kurum adina tiklanir.
  await page.waitForURL(/\/[0-9a-f-]{36}\/bugun$/, { timeout: 8000 }).catch(async () => {
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
  });
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' });

/** Tarayicida "defter sayfasi" gibi bir fotograf cizer; JPEG baytlarini dondurur (kameradan gelen 3000 px). */
async function defterFotografi(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 3000;
    c.height = 2250;
    const x = c.getContext('2d');
    if (!x) throw new Error('canvas');
    x.fillStyle = '#fffdf6';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#bcd0e8';
    x.lineWidth = 4;
    for (let y = 300; y < c.height; y += 150) {
      x.beginPath();
      x.moveTo(120, y);
      x.lineTo(c.width - 120, y);
      x.stroke();
    }
    x.fillStyle = '#1d4ed8';
    x.font = '120px Georgia, serif';
    x.fillText('2x + 5 = 17', 300, 280);
    x.fillText('2x = 17 - 5', 300, 580);
    x.fillText('2x = 12  ?', 300, 730);
    x.fillStyle = '#555';
    x.font = '90px Georgia, serif';
    x.fillText('burada takildim: neden 17 - 5?', 300, 1030);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1] ?? '';
  });
  return Buffer.from(b64, 'base64');
}

async function tuvaldeCiz(page: Page) {
  const tuval = page.getByTestId('cizim-tuvali');
  await expect(tuval).toBeVisible();
  // Gorsel yuklenip tuval boyutlanana kadar bekle.
  await expect.poll(async () => (await tuval.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  const k = await tuval.boundingBox();
  if (!k) throw new Error('tuval yok');
  await page.mouse.move(k.x + k.width * 0.1, k.y + k.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(k.x + k.width * 0.45, k.y + k.height * 0.45, { steps: 10 });
  await page.mouse.move(k.x + k.width * 0.6, k.y + k.height * 0.4, { steps: 10 });
  await page.mouse.up();
}

test('gercek api + medya: fotografli soru, cizimli ve sesli cevap, anladim', async ({
  page,
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(420_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string, tam = true) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: tam });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const sahipTelefon = benzersizTelefon();
  const ogrTelefon = benzersizTelefon();
  const ek = sahipTelefon.slice(-6);
  const o = await kayitOrtaminiKur(sahipTelefon, ogrTelefon, ek);
  const NOT = `Neden 17 - 5 yapıyoruz? ${ek}`;
  const CEVAP = `Her iki taraftan 5 çıkarıyoruz. ${ek}`;

  // --- Ogrenci: fotografli soru ---------------------------------------------------------------
  const ogrBaglam = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 900 },
  });
  const ogr = await ogrBaglam.newPage();
  await girisYap(ogr, ogrTelefon, o.kurumAdi);
  await menu(ogr).getByRole('link', { name: 'Soru sor' }).click();
  await expect(ogr.getByRole('heading', { name: 'Soru sor', level: 1 })).toBeVisible();
  await expect(ogr.getByTestId('kota-bilgisi')).toContainText('Bugün 3 soru hakkın kaldı.');
  await goruntu(ogr, 'soru-sor-bos-form');

  const foto = await defterFotografi(ogr);
  await ogr
    .getByTestId('foto-girdisi')
    .setInputFiles({ name: 'defter.jpg', mimeType: 'image/jpeg', buffer: foto });
  await expect(ogr.getByTestId('foto-ogesi')).toHaveCount(1);
  await expect(ogr.getByText('Yüklendi')).toBeVisible({ timeout: 60_000 });

  // Dondur + kirp (yan donus ve ust kirpma), sonra isaret
  await ogr.getByRole('button', { name: /Kırp \/ döndür/ }).click();
  await goruntu(ogr, 'soru-sor-kirp-dondur', false);
  await ogr.getByRole('slider', { name: /^Alt/ }).fill('10');
  await ogr.getByRole('button', { name: 'Uygula' }).click();
  await expect(ogr.getByText('Yüklendi')).toBeVisible({ timeout: 60_000 });
  await ogr.getByRole('button', { name: /İşaret ekle/ }).click();
  await tuvaldeCiz(ogr);
  await goruntu(ogr, 'soru-sor-isaret', false);
  await ogr.getByRole('button', { name: 'Çizimi kaydet' }).click();
  await expect(ogr.getByText('Üzerine işaret eklendi')).toBeVisible();
  await expect(ogr.getByText('Yüklendi')).toHaveCount(2, { timeout: 60_000 });

  await ogr.getByLabel('Ders', { exact: true }).selectOption('matematik');
  await ogr.getByLabel('Burada takıldım').fill(NOT);
  await goruntu(ogr, 'soru-sor-hazir-form');
  await ogr.getByRole('button', { name: 'Soruyu gönder' }).click();
  await expect(ogr.getByRole('heading', { name: 'Sorun gönderildi' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(ogr.getByText('Bugün 2 soru hakkın kaldı.')).toBeVisible();
  await goruntu(ogr, 'soru-sor-gonderildi', false);

  // --- Cevaplayici (sahip): kuyruk, cizim + ses + metin ---------------------------------------
  // Sahte mikrofon: WebAudio osilatoru gercek bir MediaStream verir; MediaRecorder ve yukleme gercektir.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const osilator = ac.createOscillator();
      const hedef = ac.createMediaStreamDestination();
      osilator.connect(hedef);
      osilator.start();
      await ac.resume();
      return hedef.stream;
    };
  });
  await girisYap(page, sahipTelefon, o.kurumAdi);
  await expect(page.getByTestId('bugun-soru-sayisi')).toHaveText('1');
  await goruntu(page, 'personel-bugun-soru-karti', false);
  await menu(page)
    .getByRole('link', { name: /Sorular/ })
    .click();
  await expect(page.getByTestId('soru-satiri')).toHaveCount(1);
  await goruntu(page, 'personel-bekleyen-sorular');
  await page.getByTestId('soru-satiri').filter({ hasText: ek }).click();
  await expect(page.getByRole('heading', { name: NOT, level: 1 })).toBeVisible();
  // Ogrencinin gonderdigi fotograf yuklendi (adresler medyadan geldi)
  const fotograf = page.getByTestId('soru-fotograflari').getByRole('img').first();
  await expect(fotograf).toBeVisible();
  await expect
    .poll(() => fotograf.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 30_000 })
    .toBeGreaterThan(100);
  await goruntu(page, 'personel-soru-detay');

  await page.getByLabel('Cevap metni').fill(CEVAP);
  await page.getByRole('button', { name: 'Fotoğraf üzerine çiz' }).click();
  await tuvaldeCiz(page);
  await goruntu(page, 'personel-cizim', false);
  await page.getByRole('button', { name: 'Çizimi kaydet' }).click();
  await expect(page.getByTestId('cevap-eki')).toHaveCount(1);

  await page.getByRole('button', { name: 'Sesli anlatım kaydet' }).click();
  await expect(page.getByTestId('ses-suresi')).toBeVisible();
  await page.waitForTimeout(3500);
  await goruntu(page, 'personel-ses-kaydi', false);
  await page.getByRole('button', { name: 'Kaydı durdur' }).click();
  await expect(page.getByLabel('Kaydı dinle')).toBeVisible();
  await page.getByLabel('Derste konuşalım').check();
  // Cizim fotografi + ses `Yüklendi`: iki yukleme tamamlanmadan gonder acilmaz
  await expect(page.getByRole('button', { name: 'Cevabı gönder' })).toBeEnabled({
    timeout: 90_000,
  });
  await goruntu(page, 'personel-cevap-formu');
  await page.getByRole('button', { name: 'Cevabı gönder' }).click();
  await expect(page.getByText('Cevabın öğrenciye gönderildi.')).toBeVisible({ timeout: 60_000 });
  await goruntu(page, 'personel-cevaplandi');

  // --- Ogrenci: gorur, dinler, anladim --------------------------------------------------------
  await ogr.reload();
  await menu(ogr).getByRole('link', { name: 'Soru sor' }).click();
  await ogr.getByRole('tab', { name: 'Sorularım' }).click();
  await goruntu(ogr, 'ogrenci-sorularim');
  await ogr.getByTestId('soru-satiri').filter({ hasText: ek }).click();
  await expect(ogr.getByText('Cevaplandı').first()).toBeVisible();
  await expect(ogr.getByTestId('mesaj').filter({ hasText: CEVAP })).toBeVisible();
  const cizimli = ogr.getByRole('img', { name: '1. çizimli fotoğraf' }).first();
  await expect
    .poll(() => cizimli.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 30_000 })
    .toBeGreaterThan(100);
  const ses = ogr.getByLabel('Sesli anlatım');
  await expect(ses).toBeVisible();
  await expect
    .poll(() => ses.evaluate((a: HTMLAudioElement) => a.readyState), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  // Sure bilgisi: medya sure_sn dondurdu (webm basliksiz olsa bile)
  await expect(ogr.getByText(/Süre: 0:0[2-9]|Süre: 0:[1-5]\d/).first()).toBeVisible();
  await goruntu(ogr, 'ogrenci-soru-detay');
  await ogr.getByRole('button', { name: 'Anladım' }).click();
  await expect(ogr.getByText('Süper! Soru çözüldü olarak işaretlendi.')).toBeVisible();
  await goruntu(ogr, 'ogrenci-anladim');

  // Dar ekran
  await ogr.setViewportSize({ width: 390, height: 844 });
  await goruntu(ogr, 'ogrenci-soru-detay-dar');
  await ogr.goto(ogr.url().replace(/\/soru-sor\/.*/, '/soru-sor'));
  await expect(ogr.getByRole('heading', { name: 'Soru sor', level: 1 })).toBeVisible();
  await goruntu(ogr, 'soru-sor-dar');
  await ogrBaglam.close();
});
