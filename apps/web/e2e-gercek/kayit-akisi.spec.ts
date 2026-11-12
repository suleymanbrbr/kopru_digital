import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { kayitOrtaminiKur } from './yardimcilar-kayit';

/**
 * Gercek `api`ya karsi ders kayitlari ve geri bildirim akisi (solo hoca + ogrenci):
 * hoca derse Zoom (parolali) ve Drive baglantisi ekler -> ogrenci Bugun'de geri bildirim verir, Kayitlarim'da
 * parolayi gorur, "izledim" ve "acilmiyor" der -> hoca izleyeni ve bildirimi gorur, cozer; geri bildirim
 * ders detayinda ve ozet sayfasinda gorunur. `EKRAN_KAYDET=<dizin>` verilirse goruntuler yazilir.
 * Api'de `API_KAYNAK_PAROLA_ANAHTARI` tanimli olmali (parolali kayit icin).
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

async function girisYap(page: Page, telefon: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  await page.waitForURL(/\/(kurum-sec|[0-9a-f-]{36}\/bugun)$/);
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' });

test('gercek api: ders kaydi, izleme, acilmiyor ve ders sonu geri bildirimi', async ({
  page,
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(300_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string, tam = true) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: tam });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const sahipTelefon = benzersizTelefon();
  const ogrTelefon = benzersizTelefon();
  const ek = sahipTelefon.slice(-6);
  const o = await kayitOrtaminiKur(sahipTelefon, ogrTelefon, ek);

  // --- Hoca: derse kayit ekler ------------------------------------------------------------------
  await girisYap(page, sahipTelefon);
  await menu(page).getByRole('link', { name: 'Takvim' }).click();
  await page
    .getByRole('button', { name: /Denklemler/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Kayıtlar' })).toBeVisible();
  await expect(dialog.getByText(/Bu derse henüz kayıt eklenmedi/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Kayıt ekle' }).click();
  const form = dialog.getByRole('form', { name: 'Kayıt ekle' });
  await form
    .getByLabel('Bağlantılar')
    .fill(`https://us02web.zoom.us/rec/share/${ek}\nhttps://drive.google.com/file/d/${ek}/view`);
  await expect(form.getByText(/Paylaşım ayarını kontrol et/)).toBeVisible();
  await form.getByLabel('1. bağlantının başlığı (isteğe bağlı)').fill('Denklemler Zoom kaydı');
  await form.getByLabel('1. bağlantının Zoom parolası (isteğe bağlı)').fill('Kopru#2026');
  await goruntu(page, 'kayit-ekle-formu', false);
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog.getByText('2 bağlantı eklendi. Öğrencilere görünür.')).toBeVisible();
  const zoomSatiri = dialog
    .getByTestId('kaynak-satiri')
    .filter({ hasText: 'Denklemler Zoom kaydı' });
  await expect(zoomSatiri.getByText('Parolalı')).toBeVisible();
  await expect(zoomSatiri.getByText('0 izleyen')).toBeVisible();
  await goruntu(page, 'ders-kayitlari', false);
  await page.keyboard.press('Escape');

  // --- Ogrenci: Bugun kartı, Kayitlarim -------------------------------------------------------------
  const ogrBaglam = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 800 },
  });
  const ogr = await ogrBaglam.newPage();
  await girisYap(ogr, ogrTelefon);
  const kart = ogr.getByRole('region', { name: 'Dersin nasıldı?' });
  await expect(kart).toBeVisible();
  await goruntu(ogr, 'ogrenci-bugun-geri-bildirim', false);
  await kart.getByRole('button', { name: 'Anladım' }).click();
  await expect(kart.getByText(/Teşekkürler, öğretmenin görecek/)).toBeVisible();
  await goruntu(ogr, 'ogrenci-bugun-geri-bildirim-verildi', false);

  await menu(ogr).getByRole('link', { name: 'Kayıtlarım' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kayıtlarım', level: 1 })).toBeVisible();
  const satir = ogr.getByTestId('kayit-satiri').filter({ hasText: 'Denklemler Zoom kaydı' });
  await expect(satir.getByText('İzlenmedi')).toBeVisible();
  await satir.getByRole('button', { name: /Denklemler Zoom kaydı/ }).click();
  await expect(satir.getByText('Kopru#2026')).toBeVisible();
  await expect(satir.getByRole('link', { name: /Kaydı aç/ })).toHaveAttribute('target', '_blank');
  await goruntu(ogr, 'ogrenci-kayitlarim', false);
  await satir.getByRole('button', { name: 'İzledim', exact: true }).click();
  await expect(satir.getByText('İzledin olarak işaretli')).toBeVisible();
  await satir.getByRole('button', { name: 'Açılmıyor', exact: true }).click();
  const sorun = satir.getByRole('form', { name: 'Kayıt açılmıyor mu?' });
  await sorun.getByLabel('Açıklama (isteğe bağlı)').fill('Parola olmadan açılmıyor');
  await sorun.getByRole('button', { name: 'Öğretmenime bildir' }).click();
  await expect(ogr.getByText(/Öğretmenine bildirildi/)).toBeVisible();
  // Ikinci bildirim sunucuda 409; arayuz bildirdigini soyler.
  await ogr.reload();
  await ogr
    .getByTestId('kayit-satiri')
    .filter({ hasText: 'Denklemler Zoom kaydı' })
    .getByRole('button', { name: /Denklemler Zoom kaydı/ })
    .click();
  await expect(ogr.getByText('Bu kayıt için öğretmenine bildirdin.')).toBeVisible();
  // Dar ekran.
  await ogr.setViewportSize({ width: 390, height: 844 });
  await goruntu(ogr, 'ogrenci-kayitlarim-dar', false);
  await ogrBaglam.close();

  // --- Hoca: izleyen, bildirim, cozum, geri bildirim, ozet --------------------------------------
  await page.reload();
  await menu(page).getByRole('link', { name: 'Takvim' }).click();
  await page
    .getByRole('button', { name: /Denklemler/ })
    .first()
    .click();
  const d2 = page.getByRole('dialog');
  const s2 = d2.getByTestId('kaynak-satiri').filter({ hasText: 'Denklemler Zoom kaydı' });
  await expect(s2.getByText('1 izleyen')).toBeVisible();
  await s2.getByRole('button', { name: 'İzleyenler' }).click();
  await expect(
    s2.getByRole('region', { name: 'İzleyenler' }).getByText(o.ogrenciAdi),
  ).toBeVisible();
  await s2.getByRole('button', { name: /Açılmıyor bildirimleri \(1\)/ }).click();
  await expect(s2.getByText(/Parola olmadan açılmıyor/)).toBeVisible();
  await expect(s2.getByText('Açılmıyor', { exact: true }).first()).toBeVisible();
  await goruntu(page, 'ders-kayitlari-izleyen-bildirim', false);
  await s2.getByRole('button', { name: 'Çözüldü olarak işaretle' }).click();
  await expect(
    s2
      .getByRole('region', { name: 'Açılmıyor bildirimleri' })
      .getByText('Çözüldü', { exact: true }),
  ).toBeVisible();
  const gb = d2.getByRole('region', { name: 'Öğrenci geri bildirimleri' });
  await expect(gb.getByText(o.ogrenciAdi)).toBeVisible();
  await expect(gb.getByText('Anladım').first()).toBeVisible();
  await goruntu(page, 'ders-geri-bildirimleri', false);
  await page.keyboard.press('Escape');

  // Kurum Kayitlar sayfasi.
  await menu(page).getByRole('link', { name: 'Kayıtlar' }).click();
  await expect(page.getByRole('heading', { name: 'Kayıtlar', level: 1 })).toBeVisible();
  await expect(page.getByText('Denklemler Zoom kaydı')).toBeVisible();
  await expect(page.getByText('Google Drive ders kaydı')).toBeVisible();
  await goruntu(page, 'kayitlar-sayfasi');

  // Geri bildirim ozeti.
  await menu(page).getByRole('link', { name: 'Geri bildirim' }).click();
  await expect(page.getByRole('heading', { name: 'Geri bildirim özeti', level: 1 })).toBeVisible();
  await expect(page.getByText('Toplam 1 geri bildirim')).toBeVisible();
  await goruntu(page, 'geri-bildirim-ozeti');

  // Grup sayfasinda materyal.
  await menu(page).getByRole('link', { name: 'Gruplar' }).click();
  await page
    .getByRole('link', { name: /8-A Matematik/ })
    .first()
    .click();
  const materyal = page.getByRole('region', { name: 'Materyaller' });
  await materyal.getByRole('button', { name: 'Materyal ekle' }).click();
  const mf = materyal.getByRole('form', { name: 'Materyal ekle' });
  await mf.getByLabel('Bağlantılar').fill(`https://www.youtube.com/watch?v=${ek}`);
  await mf.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(materyal.getByText('1 materyal eklendi.')).toBeVisible();
  await expect(materyal.getByText('YouTube materyali')).toBeVisible();
  await goruntu(page, 'grup-materyalleri');
});
