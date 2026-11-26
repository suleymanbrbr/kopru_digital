import { deflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { ogrenmeOrtaminiKur } from './yardimcilar-ogrenme';

/**
 * Gercek `api` (+ motivasyon + medya) ile gunluk soru takibi: kurum, grup ve ogrenci -> ogrenci uc zorlukta
 * kayit girer (zor kayit fotografli; gercek medya hatti) -> ogretmen (sahip) ogrenci kartinda konu analizini
 * ve bant tespitini gorur, hucre ayrintisinda fotografi acar, "Gorev ver" ile plana gorev verir -> ogrencinin
 * planinda gorev gorunur, "bu gorev icin kayit gir" ile gorev dolar -> ogrencinin kendi analizinde oneri yok.
 * `EKRAN_KAYDET=<dizin>` verilirse `gunluk-soru-*.png` goruntuleri (acik ve koyu) yazilir.
 * Ortam: `API_ADMIN_DATABASE_URL`, `API_URL`, `E2E_WEB_PORT`; muhtevayi ornek mufredat tohumu saglar.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

const IST = 'Europe/Istanbul';
const KONU = 'Tam sayıların negatif kuvvetleri';
const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());

/** Gecerli, kucuk bir PNG uretir (tarayicida cozulup JPEG'e cevrilir). */
function pngUret(genislik = 160, yukseklik = 120): Buffer {
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
  const satir = Buffer.concat([Buffer.from([0]), Buffer.alloc(genislik * 3, 190)]);
  const ham = Buffer.concat(Array.from({ length: yukseklik }, () => satir));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', baslik),
    parca('IDAT', deflateSync(ham)),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

/** Telefon + OTP ile girer (KVKK onceden kabul edilmis); tek kurum varsa secim atlanabilir. */
async function girisYap(page: Page, telefon: string, kurumAdi: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  await page.waitForURL(/\/(kurum-sec|[0-9a-f-]{36}\/bugun)$/);
  if (page.url().endsWith('/kurum-sec')) {
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
  }
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
}

const kok = (page: Page) => new URL(page.url()).pathname.split('/')[1] ?? '';

test('gercek api: gunluk soru kaydi, konu analizi, gorev ver, plan (ogretmen + ogrenci)', async ({
  page,
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(300_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${dizin}/gunluk-soru-${ad}-${tema}.png`, fullPage: true });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const sahipTel = benzersizTelefon();
  let ogrTel = benzersizTelefon();
  while (ogrTel === sahipTel) ogrTel = benzersizTelefon();
  const ek = sahipTel.slice(-6);
  const o = await ogrenmeOrtaminiKur(sahipTel, ogrTel, ek);

  const ogrContext = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: IST,
    viewport: { width: 1280, height: 900 },
  });
  const ogr = await ogrContext.newPage();
  await ogr.setViewportSize({ width: 1280, height: 900 });

  // --- Ogretmen (sahip): kaynak kitap tanimlar -------------------------------------------------------
  await girisYap(page, sahipTel, o.kurumAdi);
  await page.goto(`/${kok(page)}/kaynak-kitaplar`);
  await expect(page.getByRole('heading', { name: 'Kaynak kitaplar', level: 1 })).toBeVisible();
  await expect(page.getByText('Henüz kaynak kitap yok')).toBeVisible();
  await page.getByRole('button', { name: 'Kitap ekle' }).first().click();
  const kitapFormu = page.getByRole('dialog', { name: 'Kitap ekle' });
  await kitapFormu.getByLabel('Kitap adı').fill(`Soru Bankası ${ek}`);
  await kitapFormu.getByLabel('Yayınevi (isteğe bağlı)').fill('Ornek Yayınları');
  await kitapFormu.getByLabel('Ders').selectOption('matematik');
  await kitapFormu.getByLabel('Testler').fill('Test 1, 20\nTest 2, 25\nTest 3, 20');
  await kitapFormu.getByRole('button', { name: 'Kitabı ekle' }).click();
  await expect(page.getByText(`Kitap eklendi: Soru Bankası ${ek}.`)).toBeVisible();
  await expect(page.getByTestId('kitap-karti')).toContainText('3 test · 65 soru');
  await goruntu(page, 'ogretmen-kaynak-kitaplar');

  // --- Ogrenci: uc zorlukta kayit (15 sn akisi) -----------------------------------------------------
  await girisYap(ogr, ogrTel, o.kurumAdi);
  await goruntu(ogr, 'ogrenci-bugun');
  await ogr.getByRole('link', { name: /Soru çözdüm/ }).click();
  await expect(ogr.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();

  const kayitGir = async (
    zorluk: 'Kolay' | 'Orta' | 'Zor',
    sayilar: [number, number, number],
    ek2: { foto?: boolean; kitap?: boolean; ilk?: boolean } = {},
  ) => {
    if (ek2.ilk) {
      await ogr.getByLabel('Ders', { exact: true }).selectOption('matematik');
      await ogr.getByRole('button', { name: /^Konu / }).click();
      await ogr.getByRole('searchbox', { name: 'Konu ara' }).fill('negatif');
      await ogr
        .getByRole('group', { name: 'Konu seçimi' })
        .getByRole('button', { name: KONU })
        .first()
        .click();
    }
    await ogr.locator('label', { hasText: new RegExp(`^${zorluk}$`) }).click();
    if (ek2.kitap) {
      await ogr.getByLabel('Kaynak türü').selectOption('test');
      await ogr.getByLabel('Kitap', { exact: true }).selectOption({ label: `Soru Bankası ${ek}` });
      await ogr.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 1 (20 soru)' });
    }
    await ogr.getByRole('textbox', { name: 'Doğru', exact: true }).fill(String(sayilar[0]));
    await ogr.getByRole('textbox', { name: 'Yanlış', exact: true }).fill(String(sayilar[1]));
    await ogr.getByRole('textbox', { name: 'Boş', exact: true }).fill(String(sayilar[2]));
    if (ek2.foto) {
      await ogr.getByTestId('foto-girdisi').setInputFiles({
        name: 'yanlis-sorular.png',
        mimeType: 'image/png',
        buffer: pngUret(),
      });
      await expect(ogr.getByText('Hazır').first()).toBeVisible({ timeout: 30_000 });
    }
  };

  await kayitGir('Kolay', [18, 2, 0], { ilk: true });
  await goruntu(ogr, 'ogrenci-form');
  await ogr.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kaydedildi: 20 soru.' })).toBeVisible();
  await goruntu(ogr, 'ogrenci-kaydedildi');

  await ogr.getByRole('button', { name: 'Bir kayıt daha ekle' }).click();
  // Son secimler hatirlandi: ders ve konu hazir.
  await expect(ogr.getByLabel('Ders', { exact: true })).toHaveValue('matematik');
  await expect(ogr.getByRole('button', { name: new RegExp(`^Konu .*${KONU}`) })).toBeVisible();
  await kayitGir('Orta', [12, 6, 2], { kitap: true });
  await ogr.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kaydedildi: 20 soru.' })).toBeVisible();

  await ogr.getByRole('button', { name: 'Bir kayıt daha ekle' }).click();
  await kayitGir('Zor', [4, 10, 2], { foto: true });
  await goruntu(ogr, 'ogrenci-form-fotografli');
  await ogr.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kaydedildi: 16 soru.' })).toBeVisible();

  // Kayitlarim: bugun duzeltilebilir (bir kaydi duzeltip silmeden once listeyi goster).
  await ogr.getByRole('link', { name: 'Kayıtlarıma git' }).click();
  await expect(ogr.getByRole('heading', { name: 'Soru takibim', level: 1 })).toBeVisible();
  const satirlar = ogr.getByTestId('kayit-satiri');
  await expect(satirlar).toHaveCount(3);
  await expect(satirlar.filter({ hasText: '1 fotoğraf' })).toHaveCount(1);
  await goruntu(ogr, 'ogrenci-kayitlar');
  await satirlar
    .filter({ hasText: '12 D · 6 Y · 2 B' })
    .getByRole('button', { name: /düzelt/ })
    .click();
  const duzelt = ogr.getByRole('dialog', { name: 'Kaydı düzelt' });
  await duzelt.getByRole('textbox', { name: 'Doğru', exact: true }).fill('12');
  await duzelt.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('6');
  await duzelt.getByRole('textbox', { name: 'Boş', exact: true }).fill('2');
  await duzelt.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(ogr.getByText('Kayıt güncellendi.')).toBeVisible();

  // --- Ogretmen: konu analizi, bant, hucre ayrintisi (fotograf), gorev ver -------------------------
  await page.goto(`/${kok(page)}/ogrenciler`);
  await page.getByRole('link', { name: o.ogrenciAdi }).first().click();
  await expect(page.getByRole('heading', { name: o.ogrenciAdi, level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Konu analizi' }).click();
  const harita = page.getByTestId('isi-haritasi');
  await expect(harita).toBeVisible();
  const satir = harita.getByRole('row').filter({ hasText: KONU });
  await expect(satir).toContainText('Orta seviyede zorlanıyor');
  await expect(
    satir.getByRole('button', { name: /Kolay: 20 soru çözüldü, 18 doğru, başarı %90/ }),
  ).toBeVisible();
  await expect(
    satir.getByRole('button', { name: /Orta: 20 soru çözüldü, 12 doğru, başarı %60/ }),
  ).toBeVisible();
  await expect(
    satir.getByRole('button', { name: /Zor: 16 soru çözüldü, 4 doğru, başarı %25/ }),
  ).toBeVisible();
  await expect(page.getByTestId('oneriler')).toContainText(
    `${KONU}: orta seviyeden 20 soruluk görev öner`,
  );
  await goruntu(page, 'ogretmen-konu-analizi');

  await satir.getByRole('button', { name: /Zor: 16 soru çözüldü/ }).click();
  const hucre = page.getByRole('dialog', { name: `${KONU} · Zor` });
  await expect(hucre.getByText('4 D · 10 Y · 2 B')).toBeVisible();
  const foto = hucre.getByRole('img').first();
  await expect(foto).toBeVisible();
  await expect
    .poll(() => foto.evaluate((e) => (e as HTMLImageElement).naturalWidth), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await goruntu(page, 'ogretmen-hucre-detayi');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: `${KONU} için görev ver` }).click();
  const gorev = page.getByRole('dialog', { name: 'Görev ver' });
  await gorev.getByLabel('Görev günü').fill(bugun());
  await goruntu(page, 'ogretmen-gorev-ver');
  await gorev.getByRole('button', { name: 'Onayla ve ver' }).click();
  await expect(gorev.getByTestId('gorev-verildi')).toContainText(`Plana eklendi: ${KONU}`);

  // Grup/sinif gorunumu.
  await page.goto(`/${kok(page)}/gruplar`);
  await page
    .getByRole('link', { name: new RegExp(o.grupAdi) })
    .first()
    .click();
  const grup = page.getByTestId('grup-konu-analizi');
  await expect(grup.getByTestId('en-cok-zorlanilan')).toContainText(KONU);
  await goruntu(page, 'ogretmen-grup-analizi');

  // --- Ogrenci: planda gorev, "kayit gir", gerceklesen -------------------------------------------
  await ogr.goto(`/${kok(ogr)}/planlar`);
  await expect(ogr.getByRole('heading', { name: 'Haftalık planım', level: 1 })).toBeVisible();
  await expect(ogr.getByText(KONU).first()).toBeVisible();
  await goruntu(ogr, 'ogrenci-plan');
  await ogr
    .getByRole('link', { name: /görevi için soru kaydı gir/ })
    .first()
    .click();
  await expect(ogr.getByText(/Plan görevi: Matematik · 20 soru/)).toBeVisible();
  await expect(ogr.getByRole('button', { name: new RegExp(`^Konu .*${KONU}`) })).toBeVisible();
  await ogr.getByRole('textbox', { name: 'Doğru', exact: true }).fill('17');
  await ogr.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('3');
  await ogr.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kaydedildi: 20 soru.' })).toBeVisible();
  await ogr.goto(`/${kok(ogr)}/planlar`);
  await expect(ogr.getByLabel(/yapılan soru/).first()).toHaveValue('20');

  // --- Ogrenci kendi analizi: oneri yok --------------------------------------------------------------
  await ogr.goto(`/${kok(ogr)}/gunluk-soru?sekme=analiz`);
  await expect(ogr.getByTestId('isi-haritasi')).toBeVisible();
  await expect(ogr.getByRole('heading', { name: 'Öneriler' })).toHaveCount(0);
  await expect(ogr.getByRole('button', { name: /Görev ver/ })).toHaveCount(0);
  await goruntu(ogr, 'ogrenci-analiz');

  // Kitaplarim: Test 1 cozuldu.
  await ogr.goto(`/${kok(ogr)}/gunluk-soru?sekme=kitaplar`);
  await expect(ogr.getByTestId('kitap-ilerleme')).toContainText('1/3 test çözüldü');
  await goruntu(ogr, 'ogrenci-kitaplar');
  await ogrContext.close();
});
