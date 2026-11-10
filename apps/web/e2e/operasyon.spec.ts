import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda takvim, yoklama ve finans ekranlari. Mock veri sunucu surecinde ortaktir; testler yalniz
 * masaustu projesinde, kurum basina ayri durumla ve kendi olusturduklari verilerle calisir.
 */
test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

const IST = 'Europe/Istanbul';

/** Istanbul yerel tarihi (`YYYY-MM-DD`), `gun` gun kaydirilmis. */
function tarih(gun = 0, simdi = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(
    new Date(simdi + gun * 86_400_000),
  );
}
function saat(simdi: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(simdi));
}
/** Bu haftanin Pazartesi'si + `gun`. */
function haftaGunu(gun: number): string {
  const bugun = tarih();
  const gunNo = (new Date(`${bugun}T00:00:00Z`).getUTCDay() + 6) % 7;
  return tarih(gun - gunNo);
}

/**
 * Tohum derslerin bir kismi "simdi"ye goredir (yoklama icin baslamis ders); sabit saatli bir islem
 * gunun saatine gore onlarla cakisabilir. Cakismayi sinayan test ayridir; burada uyari cikarsa onaylanir.
 */
async function cakismaVarsaOnayla(page: Page, dugme: string, basari: string | RegExp) {
  const onay = page.getByRole('button', { name: dugme });
  const sonuc = page.getByText(basari);
  await expect(sonuc.or(onay).first()).toBeVisible();
  if (await onay.isVisible()) await onay.click();
  await expect(sonuc).toBeVisible();
}

async function ihlaller(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  // Fare ustundeki ogelin gecis (transition) renkleri yanlis kontrast alarmi vermesin.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

async function takvimeGit(page: Page) {
  await page
    .getByRole('navigation', { name: 'Ana menü' })
    .getByRole('link', { name: 'Takvim' })
    .click();
  await expect(page.getByRole('heading', { name: 'Takvim', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: /haftasının dersleri/ })).toBeVisible();
}

/** Ders ekle formunu acar, alanlari doldurur. */
async function dersFormuDoldur(
  page: Page,
  alan: {
    grup: string;
    tarih: string;
    saat: string;
    baslik?: string;
    tekrarla?: { bitis: string };
  },
) {
  await page.getByRole('button', { name: 'Ders ekle' }).first().click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Grup veya öğrenci').selectOption({ label: alan.grup });
  await f.getByLabel('Gün', { exact: true }).fill(alan.tarih);
  await f.getByLabel('Saat', { exact: true }).fill(alan.saat);
  if (alan.baslik) await f.getByLabel('Başlık').fill(alan.baslik);
  if (alan.tekrarla) {
    await f.getByRole('checkbox', { name: 'Her hafta tekrarla' }).click();
    await f.getByLabel('Bitiş tarihi').fill(alan.tekrarla.bitis);
  }
  return f;
}

test.describe('takvim', () => {
  test.describe.configure({ mode: 'serial' });

  test('sahip: tekrarlayan ders ekler, cakismayi onaylar, tasir ve iptal eder', async ({
    page,
  }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await takvimeGit(page);
    // Tohum dersler gorunur (Sali ve Persembe 16:00).
    await expect(page.getByRole('button', { name: /16:00-17:00/ }).first()).toBeVisible();

    // Tekrarlayan ders: grup + tekrar + ekle.
    const seri = await dersFormuDoldur(page, {
      grup: 'LGS Hazırlık Grubu',
      tarih: tarih(8),
      saat: '10:00',
      tekrarla: { bitis: tarih(30) },
    });
    await seri.getByRole('button', { name: 'Dersi ekle' }).click();
    await cakismaVarsaOnayla(page, 'Yine de ekle', /\d+ ders eklendi\./);

    // Ogretmen cakismasi: ayni ogretmen, Sali 16:30 (tohum 16:00-17:00 ile cakisir).
    const cakisan = await dersFormuDoldur(page, {
      grup: '9-A Sınıfı',
      tarih: haftaGunu(1),
      saat: '16:30',
      baslik: 'Cakisma testi',
    });
    await cakisan.getByRole('button', { name: 'Dersi ekle' }).click();
    await expect(cakisan.getByRole('alert').filter({ hasText: 'Saat çakışıyor' })).toBeVisible();
    await cakisan.getByRole('button', { name: 'Yine de ekle' }).click();
    await expect(page.getByText('Ders eklendi.')).toBeVisible();

    // Tasi (yalniz bu).
    await page.getByRole('button', { name: /Cakisma testi/ }).click();
    const ayrinti = page.getByRole('dialog');
    await expect(ayrinti.getByText('Planlı')).toBeVisible();
    await ayrinti.getByRole('button', { name: 'Taşı' }).click();
    await ayrinti.getByLabel('Yeni saat').fill('18:30');
    await ayrinti.getByRole('button', { name: 'Taşı', exact: true }).click();
    await cakismaVarsaOnayla(page, 'Yine de taşı', 'Ders taşındı.');

    // Iptal: ogrenci kaynagi yalniz birebirde sunulur.
    await page.getByRole('button', { name: /Cakisma testi/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'İptal et' }).click();
    const iptal = page.getByRole('dialog');
    await expect(iptal.getByRole('option', { name: 'Öğrenci' })).toHaveCount(0);
    await iptal.getByLabel('Neden (isteğe bağlı)').fill('Hoca hasta');
    await iptal.getByRole('button', { name: 'Dersi iptal et' }).click();
    await expect(page.getByText('Ders iptal edildi.')).toBeVisible();
  });

  test('seri derste "bu ve sonrakiler" yalniz saati degistirir', async ({ page }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await takvimeGit(page);
    await page
      .getByRole('button', { name: /Üslü sayılar/ })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Taşı' }).click();
    const tasi = page.getByRole('dialog');
    await tasi.getByRole('radio', { name: /Bu ve sonraki dersler/ }).check();
    await expect(tasi.getByLabel('Yeni gün')).toBeDisabled();
    await tasi.getByLabel('Yeni saat').fill('15:00');
    await tasi.getByRole('button', { name: 'Taşı', exact: true }).click();
    await cakismaVarsaOnayla(page, 'Yine de taşı', /ders taşındı\./);
  });
});

test.describe('yoklama', () => {
  test.describe.configure({ mode: 'serial' });

  /** `saatOnce` saat once baslamis bir ders ekler (tohum derslerle cakismasin diye 5 ve 8 saat). */
  async function gecmisDersEkle(page: Page, grup: string, saatOnce: number) {
    const simdi = Date.now() - saatOnce * 3_600_000;
    const f = await dersFormuDoldur(page, { grup, tarih: tarih(0, simdi), saat: saat(simdi) });
    await f.getByRole('button', { name: 'Dersi ekle' }).click();
    // Tohum derslerden biriyle (ornegin bugun 20:00) saat cakisabilir; onaylanir.
    const yine = f.getByRole('button', { name: 'Yine de ekle' });
    await page.waitForTimeout(600);
    if (await yine.isVisible()) await yine.click();
    await expect(page.getByText('Ders eklendi.')).toBeVisible();
  }

  test('ogretmen: birebirde tek dokunusla geldi, grupta gelmeyeni isaretler, duzeltir', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await takvimeGit(page);
    await gecmisDersEkle(page, 'Çağlar Yıldız (birebir)', 5);
    await gecmisDersEkle(page, 'LGS Hazırlık Grubu', 8);

    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Yoklama' })
      .click();
    await expect(page.getByRole('heading', { name: 'Yoklama', level: 1 })).toBeVisible();

    // Grup: herkes varsayilan "Geldi"; biri gelmedi.
    const grupSatiri = page.getByRole('listitem').filter({ hasText: 'LGS Hazırlık Grubu' }).first();
    await grupSatiri.getByRole('button', { name: 'Yoklama al' }).click();
    const form = page.getByRole('dialog');
    const gruplar = form.getByRole('radiogroup');
    await expect(gruplar).toHaveCount(2);
    await expect(gruplar.first().getByRole('radio', { name: 'Geldi' })).toBeChecked();
    await gruplar.nth(1).getByText('Gelmedi').click();
    await form.getByRole('button', { name: 'Not ekle' }).first().click();
    await expect(form.getByLabel('Notu kim görsün?')).toHaveValue('ozel');
    await form.getByRole('button', { name: 'Yoklamayı kaydet' }).click();
    await expect(page.getByText(/Yoklama kaydedildi\./)).toBeVisible();

    // Birebir: tek dokunus.
    const birebir = page
      .getByRole('listitem')
      .filter({ hasText: 'Çağlar Yıldız (birebir)' })
      .first();
    await birebir.getByRole('button', { name: 'Yoklama al' }).click();
    await page.getByRole('dialog').getByText('Geldi', { exact: true }).click();
    await expect(page.getByText(/Yoklama kaydedildi\./)).toBeVisible();
    await expect(page.getByText(/kalan ders -?\d+/)).toBeVisible();

    // Duzeltme: takvimden ayni ders acilir, "Gelmedi"ye cevrilir.
    await takvimeGit(page);
    await page
      .getByRole('button', { name: /Yoklaması alındı/ })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yoklamayı düzelt' }).click();
    const duzelt = page.getByRole('dialog');
    await duzelt.getByText('Gelmedi', { exact: true }).first().click();
    await duzelt.getByRole('button', { name: 'Düzeltmeyi kaydet' }).click();
    await expect(page.getByText(/Yoklama kaydedildi\./)).toBeVisible();
  });

  test('bugun ekraninda yoklama bekleyen dersler ve "Yoklama al" gorunur', async ({ page }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await expect(page.getByRole('heading', { name: 'Yoklama bekleyen dersler' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yoklama al' }).first()).toBeVisible();
  });
});

test.describe('finans', () => {
  test.describe.configure({ mode: 'serial' });

  test('sahip: rozetler, suzgec, paket sat, odeme al ve iptal, model onerisi, hatirlatma, Excel', async ({
    page,
  }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Finans' })
      .click();
    await expect(page.getByRole('heading', { name: 'Finans', level: 1 })).toBeVisible();

    // Rozetler: renk degil metin de var.
    const liste = page.getByRole('region', { name: 'Öğrenciler' });
    await expect(liste.getByText('Ders kalmadı')).toBeVisible();
    await expect(liste.getByText(/2 ders kaldı, azalıyor/)).toBeVisible();
    await expect(liste.getByText('8 ders kaldı')).toBeVisible();
    await expect(liste.getByText('Borç ₺1.500,00')).toBeVisible();

    await page.getByRole('button', { name: 'Borçlu' }).click();
    await expect(liste.getByRole('link', { name: /Elif Şahin/ })).toBeVisible();
    await expect(liste.getByRole('link', { name: /Ayşe Demir/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Düşük kredi' }).click();
    await expect(liste.getByRole('link', { name: /Çağlar Yıldız/ })).toBeVisible();
    await page.getByRole('button', { name: 'Tümü' }).click();
    await page.getByLabel('Ada göre ara').fill('Zeynep');
    await expect(liste.getByRole('link', { name: /Zeynep Kaya/ })).toBeVisible();
    await expect(liste.getByRole('link', { name: /Ayşe Demir/ })).toHaveCount(0);

    // Paket sat (tamami).
    await page.getByLabel('Ada göre ara').fill('Ayşe');
    await liste.getByRole('link', { name: /Ayşe Demir/ }).click();
    await expect(page.getByRole('heading', { name: 'Ayşe Demir', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Paket sat' }).click();
    const sat = page.getByRole('dialog');
    await sat
      .getByLabel('Paket', { exact: true })
      .selectOption({ label: '8 Derslik Paket · 8 ders · ₺4.800,00' });
    await sat.getByRole('button', { name: 'Paketi sat' }).click();
    await expect(page.getByText(/Paket satıldı\. Kalan ders: 16\./)).toBeVisible();

    // Odeme al: gecersiz giris alan hatasi, gecerli giris kayit, iptal (neden zorunlu).
    await page.getByRole('button', { name: 'Ödeme al' }).click();
    const odeme = page.getByRole('dialog');
    await odeme.getByLabel('Tutar (TL)').fill('abc');
    await odeme.getByRole('button', { name: 'Ödemeyi kaydet' }).click();
    await expect(odeme.getByText(/Geçerli bir tutar yaz/)).toBeVisible();
    await odeme.getByLabel('Tutar (TL)').fill('1.500');
    await odeme.getByRole('button', { name: 'Ödemeyi kaydet' }).click();
    await expect(page.getByText('Ödeme kaydedildi: ₺1.500,00.')).toBeVisible();
    await page.getByRole('button', { name: 'Ödemeyi iptal et' }).first().click();
    const iptal = page.getByRole('alertdialog');
    await iptal.getByRole('button', { name: 'Ödemeyi iptal et' }).click();
    await expect(iptal.getByText('İptal nedenini yaz.')).toBeVisible();
    await iptal.getByLabel('İptal nedeni').fill('Yanlış giriş');
    await iptal.getByRole('button', { name: 'Ödemeyi iptal et' }).click();
    await expect(page.getByText('Ödeme iptal edildi.')).toBeVisible();

    // Tum hareketler (ayri sayfali defter).
    await page.getByRole('button', { name: 'Tüm hareketler' }).click();
    await expect(page.getByRole('dialog').getByText('Paket satışı').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // Modeli paket olmayan ogrenci: paket satisi model onerisi verir.
    await page.getByRole('main').getByRole('link', { name: 'Öğrenciler' }).click();
    await page.getByLabel('Ada göre ara').fill('Ahmet');
    await page
      .getByRole('region', { name: 'Öğrenciler' })
      .getByRole('link', { name: /Ahmet Güneş/ })
      .click();
    await page.getByRole('button', { name: 'Paket sat' }).click();
    const sat2 = page.getByRole('dialog');
    await sat2.getByLabel('Paket', { exact: true }).selectOption({ index: 1 });
    await sat2.getByRole('button', { name: 'Paketi sat' }).click();
    await expect(sat2.getByText(/ödeme modeli paket değil/i).first()).toBeVisible();
    await sat2.getByRole('button', { name: /Ödeme modelini “paket” yap/ }).click();
    await expect(sat2.getByText(/olarak güncellendi/)).toBeVisible();
    await sat2.getByRole('button', { name: 'Paketi sat' }).click();
    await expect(page.getByText(/Paket satıldı\./)).toBeVisible();

    // WhatsApp hatirlatmasi: kullanici tiklayana kadar hicbir sey acilmaz.
    await page.getByRole('main').getByRole('link', { name: 'Öğrenciler' }).click();
    await page.getByLabel('Ada göre ara').fill('Elif');
    await page
      .getByRole('region', { name: 'Öğrenciler' })
      .getByRole('link', { name: /Elif Şahin/ })
      .click();
    await page.getByRole('button', { name: 'WhatsApp hatırlatması' }).click();
    const wa = page.getByRole('dialog');
    await expect(wa.getByLabel('Mesaj')).toHaveValue(/₺1\.500,00/);
    await expect(wa.getByRole('link', { name: /WhatsApp’ta aç/ })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/905321110003\?text=/,
    );
  });

  test('sahip: ayarlar, paket sablonu, kredi politikasi ve Excel indirme', async ({ page }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Finans' })
      .click();
    await page.getByRole('button', { name: 'Ayarlar' }).click();

    await page.getByRole('button', { name: 'Paket ekle' }).click();
    const paket = page.getByRole('dialog');
    await paket.getByRole('button', { name: 'Paketi kaydet' }).click();
    await expect(paket.getByText('Paket adı gerekli.')).toBeVisible();
    await paket.getByLabel('Paket adı').fill('24 Derslik Paket');
    await paket.getByLabel('Ders sayısı').fill('24');
    await paket.getByLabel('Fiyat (TL)').fill('12.000');
    await paket.getByRole('button', { name: 'Paketi kaydet' }).click();
    await expect(page.getByText('Paket eklendi.')).toBeVisible();
    await expect(page.getByText('24 Derslik Paket')).toBeVisible();

    await page.getByLabel('Düşük kredi uyarı eşiği').fill('3');
    await page.getByRole('button', { name: 'Politikayı kaydet' }).click();
    await expect(page.getByText('Kredi politikası güncellendi.')).toBeVisible();

    const indirme = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel indir' }).click();
    const dosya = await indirme;
    expect(dosya.suggestedFilename()).toMatch(/\.xlsx$/);
    const yol = await dosya.path();
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(yol).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  test('ogretmen finans ekranini gorur ama ayarlari gormez', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Finans' })
      .click();
    await expect(page.getByRole('heading', { name: 'Finans', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ayarlar' })).toHaveCount(0);
  });
});

test.describe('ogrenci gorunumu', () => {
  test('ders programi salt okunur; fiyat, borc ve yonetim eylemleri yoktur', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(menu.getByRole('link', { name: 'Finans' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Yoklama' })).toHaveCount(0);
    await menu.getByRole('link', { name: 'Takvim' }).click();
    await expect(page.getByRole('region', { name: /haftasının dersleri/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ders ekle' })).toHaveCount(0);
    await page
      .getByRole('button', { name: /Üslü sayılar/ })
      .first()
      .click();
    const ayrinti = page.getByRole('dialog');
    await expect(ayrinti.getByRole('link', { name: /Bağlantıyı aç/ })).toBeVisible();
    await expect(
      ayrinti.getByRole('button', { name: /Taşı|İptal et|Düzenle|Yoklama/ }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    const govde =
      (await page.locator('body').innerText()) + (await page.locator('main').innerText());
    expect(govde).not.toMatch(/₺|borç|ücret|fiyat/i);

    // Finans sayfasi dogrudan acilsa bile erisim yok.
    await page.goto(page.url().replace(/\/takvim$/, '/finans'));
    await expect(page.getByText('Bu bölüme erişimin yok')).toBeVisible();
  });
});

for (const tema of ['light', 'dark'] as const) {
  test.describe(`operasyon erisilebilirlik (${tema})`, () => {
    test.use({ colorScheme: tema });

    test('takvim, ders formu, yoklama, finans listesi ve ogrenci karti ihlalsiz', async ({
      page,
    }) => {
      await girisYap(page, 'Kuzey Yıldızı Akademi');
      await takvimeGit(page);
      // Mock durumu testler arasi paylasilir: "bu ve sonrakiler" testi 16:00 derslerini tasir, bu ders sabit kalir.
      await expect(page.getByRole('button', { name: /Geometri tekrarı/ }).first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);

      await page.getByRole('button', { name: 'Ders ekle' }).first().click();
      await expect(page.getByRole('dialog').getByLabel('Grup veya öğrenci')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.keyboard.press('Escape');

      await page
        .getByRole('button', { name: /Geometri tekrarı/ })
        .first()
        .click();
      await expect(page.getByRole('dialog').getByText('Planlı').first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.keyboard.press('Escape');

      await page
        .getByRole('navigation', { name: 'Ana menü' })
        .getByRole('link', { name: 'Yoklama' })
        .click();
      await expect(page.getByRole('heading', { name: 'Yoklama', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Yoklama al' }).first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.getByRole('button', { name: 'Yoklama al' }).first().click();
      await expect(page.getByRole('dialog').getByRole('radiogroup').first()).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.keyboard.press('Escape');

      await page
        .getByRole('navigation', { name: 'Ana menü' })
        .getByRole('link', { name: 'Finans' })
        .click();
      await expect(page.getByText('Ders kalmadı')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
      await page.getByRole('link', { name: /Çağlar Yıldız/ }).click();
      await expect(page.getByRole('heading', { name: 'Çağlar Yıldız', level: 1 })).toBeVisible();
      await expect(page.getByTestId('bakiye')).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);

      await page.getByRole('main').getByRole('link', { name: 'Öğrenciler' }).click();
      await page.getByRole('button', { name: 'Ayarlar' }).click();
      await expect(page.getByRole('heading', { name: 'Aylık özet' })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    });
  });
}
