import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import {
  API_ADMIN_DB_URL,
  benzersizTelefon,
  kurumOlustur,
  ortamSorunu,
  otpSiniriniTemizle,
  sonOtpKodu,
} from './yardimcilar';

/**
 * Gercek `api` (`ODEME_IYZICO=sahte`, `WEB_URL` = bu web) + gercek veritabani: sahip olarak abonelik
 * ekrani, fatura bilgisi, odeme baslatma -> sahte donus (`/abonelik?odeme=`) -> aktif; SQL ile abonelik
 * askisi (salt-okunur afisi), platform askisi (aciklama ekrani) ve platform mesaji afisi.
 * `EKRAN_KAYDET=<dizin>` verilirse goruntuler `abonelik-*.png` olarak yazilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

test('gercek api: abonelik ekrani, odeme, askı ve platform mesaji', async ({ page }) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(180_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (ad: string) => {
    if (dizin) await page.screenshot({ path: `${dizin}/abonelik-${ad}.png`, fullPage: true });
  };
  const sql = postgres(API_ADMIN_DB_URL, { max: 1 });

  try {
    const telefon = benzersizTelefon();
    const kurumAdi = `Abonelik Kurumu ${telefon.slice(-4)}`;

    await page.goto('/giris');
    await page.getByLabel('Telefon numaran').fill(telefon);
    await page.getByRole('button', { name: 'Kod gönder' }).click();
    await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
    await expect(page).toHaveURL(/\/kvkk$/);
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/kurum-sec$/);
    await kurumOlustur(telefon, kurumAdi);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
    const kurumId = /\/([0-9a-f-]{36})\/bugun$/.exec(page.url())?.[1] ?? '';

    // 1) Abonelik ekrani: deneme, kullanim, planlar.
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Abonelik' })
      .click();
    await expect(page.getByRole('heading', { name: 'Abonelik', level: 1 })).toBeVisible();
    const durum = page.getByTestId('abonelik-durum');
    await expect(durum).toContainText('Deneme');
    await expect(durum).toContainText('gün kaldı');
    await expect(page.getByRole('progressbar').first()).toBeVisible();
    await goruntu('deneme');

    // 2) Fatura bilgisi yokken odeme baslatma: once fatura ister.
    await page
      .getByTestId('plan-kurum')
      .getByRole('button', { name: /için abone ol/ })
      .click();
    await expect(page.getByText('önce fatura bilgilerini kaydet')).toBeVisible();
    await page.getByLabel('Ünvan / ad soyad').fill('Abonelik Eğitim Ltd. Şti.');
    await page.getByLabel(/Vergi kimlik no/).fill('1111111115');
    await page.getByLabel('Adres', { exact: true }).fill('Moda Cd. 1');
    await page.getByLabel('İlçe').fill('Kadıköy');
    await page.getByLabel('İl', { exact: true }).fill('İstanbul');
    await page.getByLabel('Fatura e-postası').fill('fatura@abonelik.test');
    await page.getByRole('button', { name: 'Fatura bilgilerini kaydet' }).click();
    await expect(page.getByText(/Geçerli bir VKN/)).toBeVisible();
    await page.getByLabel(/Vergi kimlik no/).fill('1111111114');
    await page.getByRole('button', { name: 'Fatura bilgilerini kaydet' }).click();
    await expect(page.getByText('Fatura bilgilerin kaydedildi.')).toBeVisible();
    await goruntu('fatura');

    // 3) Odeme: sahte saglayici -> api donus -> /abonelik?odeme=basarili -> sahip kurum -> aktif.
    await page
      .getByTestId('plan-kurum')
      .getByRole('button', { name: /için abone ol/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${kurumId}/abonelik$`), { timeout: 30_000 });
    await expect(page.getByTestId('odeme-sonucu')).toContainText('Aboneliğin etkinleştirildi', {
      timeout: 30_000,
    });
    await expect(durum).toContainText('Aktif');
    await expect(page.getByTestId('odeme-gecmisi').getByRole('listitem')).toHaveCount(1);
    await goruntu('aktif');

    // 4) Plan degistir (donem sonunda) ve iptal.
    await page.getByRole('button', { name: 'Otomatik yenilemeyi iptal et' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Yenilemeyi iptal et' })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Otomatik yenileme iptal edildi.' }),
    ).toBeVisible();
    await goruntu('iptal-istendi');

    // 5) SQL ile abonelik askisi -> salt-okunur afisi, veri gorunur.
    await sql`update abonelik.abonelikler set durum = 'askida' where kurum_id = ${kurumId}`;
    await sql`update hesap.kurumlar set durum = 'askida' where id = ${kurumId}`;
    await page.reload();
    await page.getByRole('link', { name: 'Bugün' }).first().click();
    const afis = page.getByRole('region', { name: 'Askıda' });
    await expect(afis).toContainText('yalnızca görüntüleyebilirsin');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bugünkü dersler' })).toBeVisible();
    await goruntu('aski-afisi');
    await afis.getByRole('link', { name: 'Aboneliğe git' }).click();
    await expect(page.getByTestId('abonelik-durum')).toContainText('askıda');
    await goruntu('aski-abonelik');

    // 6) Platform askisi (403 kurum_askida): aciklama ekrani.
    await sql`update hesap.kurumlar set platform_askida_at = now(), platform_aski_nedeni = 'Deneme askısı' where id = ${kurumId}`;
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Kurumunun hesabı askıya alındı' }),
    ).toBeVisible();
    await goruntu('platform-aski');
    await sql`update hesap.kurumlar set platform_askida_at = null, platform_aski_nedeni = null where id = ${kurumId}`;

    // 7) Platform mesaji (kimliksiz uc) tum sayfalarda, giris dahil.
    await sql`
      insert into hesap.platform_mesajlari (id, baslik, metin, onem, baslangic_at, bitis_at)
      values (gen_random_uuid(), 'Planlı bakım', 'Bu gece 02:00 ile 03:00 arasında kısa bir bakım var.', 'uyari',
              now() - interval '1 hour', now() + interval '1 day')`;
    await page.goto('/giris');
    await expect(page).toHaveURL(/\/(giris|kurum-sec)$/);
    await expect(page.getByRole('status').filter({ hasText: 'Planlı bakım' })).toBeVisible();
    await goruntu('platform-mesaji');
  } finally {
    await sql`update hesap.platform_mesajlari set iptal_at = now() where iptal_at is null`;
    await sql.end({ timeout: 2 });
  }
});
