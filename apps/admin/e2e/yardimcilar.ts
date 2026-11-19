import { expect, type Page } from '@playwright/test';

/** Mock sabitleri (`src/sunucu/mock/index.ts`). */
export const KOD = '123456';
export const YONETICI_TELEFON = '532 123 45 67';
export const DESTEK_TELEFON = '501 123 45 67';
export const ROLSUZ_TELEFON = '500 123 45 67';
export const IP_YASAK_TELEFON = '502 123 45 67';

/** Paylasimli mock durumunu basa alir (testler sirayla calisir). */
export async function sifirla(page: Page) {
  const yanit = await page.request.post('/api/mock/sifirla');
  expect(yanit.ok()).toBe(true);
}

/** Telefon + OTP ile girer; ikinci adim ekraninda (`/dogrulama`) biter. */
export async function girisYap(page: Page, telefon = YONETICI_TELEFON) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numarası').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kod').fill(KOD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/dogrulama$/);
}

/** Ilk kurulum: QR + yedek kodlar + ilk kod. Kurum listesinde biter. */
export async function ikinciAdimKur(page: Page) {
  await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
  await expect(page.getByRole('img', { name: 'İki adımlı doğrulama QR kodu' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Yedek kodları güvenli bir yere kaydettim/ }).check();
  await page.getByLabel('Doğrulama kodu').fill(KOD);
  await page.getByRole('button', { name: 'Kurulumu onayla' }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);
}

/** Giris + (kurulu degilse) kurulum veya (kuruluysa) kod girisi; panelde biter. */
export async function panelAc(page: Page, telefon = YONETICI_TELEFON) {
  await girisYap(page, telefon);
  const kur = page.getByRole('button', { name: 'Kurulumu başlat' });
  // Ben yanıtı gelene kadar iki ekrandan biri görünür olur.
  await expect(kur.or(page.getByLabel('Doğrulama kodu'))).toBeVisible();
  if (await kur.isVisible().catch(() => false)) {
    await ikinciAdimKur(page);
  } else {
    await page.getByLabel('Doğrulama kodu').fill(KOD);
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
    await expect(page).toHaveURL(/\/kurumlar$/);
  }
  await expect(page.getByRole('heading', { name: 'Kurumlar', level: 1 })).toBeVisible();
}

/** Mobil genislikte menu kapaliysa acar (masaustunde kenar cubugu zaten gorunur). */
export async function menuGit(page: Page, ad: string) {
  const menuDugmesi = page.getByRole('button', { name: 'Menü', exact: true });
  if (await menuDugmesi.isVisible()) await menuDugmesi.click();
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('link', { name: ad })
    .click();
}

/** Mobilde kenar çubuğu menü düğmesinin arkasındadır; açık değilse açar. */
export async function menuAc(page: Page) {
  const menuDugmesi = page.getByRole('button', { name: 'Menü', exact: true });
  if (await menuDugmesi.isVisible()) await menuDugmesi.click();
}
