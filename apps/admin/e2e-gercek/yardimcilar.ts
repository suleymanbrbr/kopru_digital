import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

export const EKRAN_DIZINI = process.env.GERCEK_EKRAN_DIZINI ?? 'docs/ekranlar';
mkdirSync(EKRAN_DIZINI, { recursive: true });

export function ortam(ad: string): string {
  const v = process.env[ad];
  if (!v) throw new Error(`${ad} tanımlı değil (bkz. scripts/gercek-akis.sh)`);
  return v;
}

/** RFC 6238 TOTP (SHA-1, 6 hane, 30 sn); `sir` base32. */
export function totp(sir: string, adimKaydir = 0): string {
  const alfabe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bit = 0;
  let deger = 0;
  const bayt: number[] = [];
  for (const ch of sir.replace(/[\s=]/g, '').toUpperCase()) {
    deger = ((deger << 5) | alfabe.indexOf(ch)) & 0xffff;
    bit += 5;
    if (bit >= 8) {
      bayt.push((deger >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  const sayac = Math.floor(Date.now() / 30_000) + adimKaydir;
  const mesaj = Buffer.alloc(8);
  mesaj.writeBigUInt64BE(BigInt(sayac));
  const h = createHmac('sha1', Buffer.from(bayt)).update(mesaj).digest();
  const o = (h[h.length - 1] ?? 0) & 15;
  const n =
    (((h[o] ?? 0) & 127) << 24) |
    ((h[o + 1] ?? 0) << 16) |
    ((h[o + 2] ?? 0) << 8) |
    (h[o + 3] ?? 0);
  return String(n % 1_000_000).padStart(6, '0');
}

const sonAdim = new Map<string, number>();

/**
 * Bu anın TOTP kodu; aynı adım iki kez kabul edilmediğinden (tekrar oynatma koruması) önceki kodla aynı
 * adımdaysak sonraki adımı bekler.
 */
export async function yeniKod(sir: string): Promise<string> {
  const simdi = Math.floor(Date.now() / 30_000);
  const onceki = sonAdim.get(sir) ?? -1;
  if (simdi <= onceki) {
    await new Promise((r) => setTimeout(r, (onceki + 1) * 30_000 - Date.now() + 500));
  }
  sonAdim.set(sir, Math.floor(Date.now() / 30_000));
  return totp(sir);
}

let sayac = 0;
/** Ekran görüntüsü: `docs/ekranlar/NN-ad.png` (sıra numarası çağrı sırasına göre). */
export async function ekran(page: Page, ad: string, secenek: { tamSayfa?: boolean } = {}) {
  sayac += 1;
  const dosya = `${String(sayac).padStart(2, '0')}-${ad}.png`;
  await page.screenshot({ path: join(EKRAN_DIZINI, dosya), fullPage: secenek.tamSayfa ?? true });
}

export async function epostaIleGir(page: Page, eposta: string, parola: string) {
  await page.goto('/giris');
  await page.getByRole('tab', { name: 'E-posta' }).click();
  await page.getByLabel('E-posta adresi').fill(eposta);
  await page.getByLabel('Parola').fill(parola);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/dogrulama$/);
}

/** İlk kurulum: QR ekranı görüntüsü alınır, TOTP betikte üretilir. Döndürdüğü değer: kurulum anahtarı. */
export async function ikinciAdimKur(page: Page, goruntu?: string): Promise<string> {
  await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
  await expect(page.getByRole('img', { name: 'İki adımlı doğrulama QR kodu' })).toBeVisible();
  const sir =
    (await page
      .getByText(/^[A-Z2-7]{16,}$/)
      .first()
      .textContent()) ?? '';
  expect(sir.length).toBeGreaterThanOrEqual(16);
  if (goruntu) await ekran(page, goruntu);
  await page.getByRole('checkbox', { name: /Yedek kodları güvenli bir yere kaydettim/ }).check();
  await page.getByLabel('Doğrulama kodu').fill(await yeniKod(sir));
  await page.getByRole('button', { name: 'Kurulumu onayla' }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);
  return sir;
}

export async function menuGit(page: Page, ad: string) {
  const menuDugmesi = page.getByRole('button', { name: 'Menü', exact: true });
  if (await menuDugmesi.isVisible()) await menuDugmesi.click();
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('link', { name: ad })
    .click();
}
