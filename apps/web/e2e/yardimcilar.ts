import { expect, test as temel, type Page } from '@playwright/test';

/**
 * E2E'nin tek "simdi"si: `playwright.config.ts` gercek saate sabit bir kayma (`E2E_KAYMA_MS`) hesaplar,
 * mock sunucu (`mockSimdi`) ve tarayici ayni kaymayi kullanir. Testlerde `Date.now()` yerine `simdi()`.
 */
export function simdi(): number {
  return Date.now() + Number(process.env.E2E_KAYMA_MS ?? 0);
}

/**
 * Tum spec dosyalari bunu kullanir (dogrudan `@playwright/test`'ten `test` degil): her sayfanin saati
 * sunucudaki mock saatle ayni olur. Saat akmaya devam eder; `page.clock.fastForward` calisir.
 */
export const test = temel.extend({
  context: async ({ context }, kullan) => {
    await context.clock.install({ time: simdi() });
    await kullan(context);
  },
});

/** Telefon -> OTP -> KVKK -> kurum secimi akisini calistirir ve secilen kurumun Bugun ekraninda biter. */
export async function girisYap(page: Page, kurumAdi: string, opsiyon: { kvkkOnay?: boolean } = {}) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill('532 123 45 67');
  await page.getByRole('button', { name: 'Kod gönder' }).click();

  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill('123456');
  await expect(page).toHaveURL(/\/kvkk$/);

  if (opsiyon.kvkkOnay !== false) {
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
    await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
    await expect(page).toHaveURL(/\/kurum-sec$/);
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
    await expect(page).toHaveURL(/\/kurum-[a-z]+\/bugun$/);
  }
}

/**
 * Abonelik mock senaryosu (`mock_senaryo` cerezi): teste ozel anahtar kullanilir, paralel testler ve
 * masaustu/mobil projeleri birbirinin durumunu bozmaz. Giristen once cagrilir.
 */
export async function abonelikSenaryosu(page: Page, senaryo: string): Promise<void> {
  const anahtar = `e${Math.random().toString(36).slice(2, 10)}`;
  await page.context().addCookies([
    {
      name: 'mock_senaryo',
      value: `${anahtar}:${senaryo}`,
      url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_MOCK_PORT ?? '3000'}`,
    },
  ]);
}

/** Platform mesaji mock'u (`mock_platform_mesaji`: bilgi | uyari | kritik). */
export async function platformMesaji(
  page: Page,
  onem: 'bilgi' | 'uyari' | 'kritik',
): Promise<void> {
  await page.context().addCookies([
    {
      name: 'mock_platform_mesaji',
      value: onem,
      url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_MOCK_PORT ?? '3000'}`,
    },
  ]);
}
