import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, sonOtpKodu } from './yardimcilar';
import { kalanDersOku, operasyonOrtaminiKur } from './yardimcilar-operasyon';

/**
 * Gercek `api`ya karsi takvim, yoklama ve finans akisi (solo hoca):
 * kurum kur -> ogrenci -> paket sat -> takvimde ders -> yoklama al -> kalan ders dustu ->
 * yoklamayi duzelt -> kredi geri geldi -> Excel indi (gecerli `PK` baslangicli).
 * `EKRAN_KAYDET=<dizin>` verilirse takvim, yoklama ve ogrenci karti goruntuleri (acik ve koyu) yazilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
});

const IST = 'Europe/Istanbul';

/** `YYYY-MM-DD` tarihinin haftasinin Pazartesi'si. */
function haftaBasi(tarih: string): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function yerel(simdi: number) {
  const p = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: IST, ...o });
  const [g, a, y] = p({ day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(simdi))
    .split('/');
  return {
    tarih: `${y ?? ''}-${a ?? ''}-${g ?? ''}`,
    saat: p({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(simdi)),
  };
}

test('gercek api: kurum, ogrenci, paket, ders, yoklama, duzeltme ve Excel', async ({ page }) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(240_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (ad: string) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };

  // --- Giris, KVKK ve on kosullar -----------------------------------------------------------
  const telefon = benzersizTelefon();
  const ek = telefon.slice(-6);
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  await expect(page).toHaveURL(/\/kvkk$/);
  await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
  await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
  await expect(page).toHaveURL(/\/kurum-sec$/);

  const o = await operasyonOrtaminiKur(telefon, ek);
  await page.reload();
  // Bireysel kurumda hoca iki uyelik tasir (sahip ve ogretmen); sahip uyeligiyle devam edilir.
  await page.getByRole('button', { name: new RegExp(`${o.kurumAdi}, Kurum sahibi`) }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);

  // Solo hoca kurum menulerini gormez; takvim, yoklama ve finans gorunur.
  const menu = page.getByRole('navigation', { name: 'Ana menü' });
  await expect(menu.getByRole('link', { name: 'Takvim' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Yoklama' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Finans' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Öğretmenler' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Sınıflar' })).toHaveCount(0);

  // --- Paket sat ----------------------------------------------------------------------------
  await menu.getByRole('link', { name: 'Finans' }).click();
  const liste = page.getByRole('region', { name: 'Öğrenciler' });
  await liste.getByRole('link', { name: new RegExp(o.ogrenciAdi) }).click();
  await expect(page.getByRole('heading', { name: o.ogrenciAdi, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Paket sat' }).click();
  const sat = page.getByRole('dialog');
  await sat.getByLabel('Paket', { exact: true }).selectOption({ index: 1 });
  await sat.getByRole('radio', { name: 'Sonra ödenecek' }).check();
  await sat.getByRole('button', { name: 'Paketi sat' }).click();
  await expect(page.getByText('Paket satıldı. Kalan ders: 8.')).toBeVisible();
  await expect(page.getByText('8 ders kaldı')).toBeVisible();
  expect(await kalanDersOku(o)).toBe(8);

  // --- Takvimde ders (bir saat once basladi) ---------------------------------------------------
  await menu.getByRole('link', { name: 'Takvim' }).click();
  await expect(page.getByRole('region', { name: /haftasının dersleri/ })).toBeVisible();
  const baslangic = yerel(Date.now() - 3_600_000);
  await page.getByRole('button', { name: 'Ders ekle' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Grup veya öğrenci').selectOption({ label: `${o.ogrenciAdi} (birebir)` });
  await form.getByLabel('Gün', { exact: true }).fill(baslangic.tarih);
  await form.getByLabel('Saat', { exact: true }).fill(baslangic.saat);
  await form.getByLabel('Branş').selectOption({ label: 'Matematik' });
  await form.getByLabel('Başlık').fill('Üslü sayılar');
  await form.getByRole('button', { name: 'Dersi ekle' }).click();
  await expect(page.getByText('Ders eklendi.')).toBeVisible();
  // Gece yarisini asan calistirmada ders onceki haftada kalabilir.
  const oncekiHafta = haftaBasi(baslangic.tarih) !== haftaBasi(yerel(Date.now()).tarih);
  if (oncekiHafta) await page.getByRole('button', { name: 'Önceki hafta' }).click();
  await expect(page.getByRole('button', { name: /Üslü sayılar/ })).toBeVisible();
  await goruntu('takvim');

  // --- Yoklama al: birebirde tek dokunus ---------------------------------------------------------
  await menu.getByRole('link', { name: 'Yoklama' }).click();
  await expect(page.getByRole('heading', { name: 'Yoklama', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Yoklama al' }).first().click();
  const yoklama = page.getByRole('dialog');
  await expect(yoklama.getByRole('radiogroup')).toBeVisible();
  await goruntu('yoklama');
  await yoklama.getByText('Geldi', { exact: true }).click();
  await expect(page.getByText(/Yoklama kaydedildi\./)).toBeVisible();
  await expect(page.getByText(/kalan ders 7/)).toBeVisible();
  expect(await kalanDersOku(o)).toBe(7);

  // --- Yoklamayi duzelt: izinli -> kredi geri gelir -----------------------------------------------
  await menu.getByRole('link', { name: 'Takvim' }).click();
  if (oncekiHafta) await page.getByRole('button', { name: 'Önceki hafta' }).click();
  await page.getByRole('button', { name: /Üslü sayılar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yoklamayı düzelt' }).click();
  const duzelt = page.getByRole('dialog');
  await duzelt.getByText('İzinli', { exact: true }).click();
  await duzelt.getByRole('button', { name: 'Düzeltmeyi kaydet' }).click();
  await expect(page.getByText(/Yoklama kaydedildi\./)).toBeVisible();
  expect(await kalanDersOku(o)).toBe(8);

  // --- Ogrenci karti ------------------------------------------------------------------------
  await menu.getByRole('link', { name: 'Finans' }).click();
  await page
    .getByRole('region', { name: 'Öğrenciler' })
    .getByRole('link', { name: new RegExp(o.ogrenciAdi) })
    .click();
  await expect(page.getByText('8 ders kaldı')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Son hareketler' })).toBeVisible();
  await page.getByRole('button', { name: 'Ödeme al' }).click();
  const odeme = page.getByRole('dialog');
  await odeme.getByLabel('Tutar (TL)').fill('1.500');
  await odeme.getByRole('button', { name: 'Ödemeyi kaydet' }).click();
  await expect(page.getByText('Ödeme kaydedildi: ₺1.500,00.')).toBeVisible();
  await expect(page.getByTestId('bakiye')).toHaveText('-₺3.300,00');
  await goruntu('ogrenci-karti');

  // --- Excel ---------------------------------------------------------------------------------
  await menu.getByRole('link', { name: 'Finans' }).click();
  await page.getByRole('button', { name: 'Ayarlar' }).click();
  const indirme = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel indir' }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/\.xlsx$/);
  const yol = await dosya.path();
  expect(readFileSync(yol).subarray(0, 2).toString('latin1')).toBe('PK');
  await expect(page.getByText('Excel dosyası indirildi.')).toBeVisible();
});
