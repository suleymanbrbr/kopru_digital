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

/**
 * Durumlu mock yalitimi (`mock_durum` cerezi; motivasyon, gunluk soru, degerlendirme/koçluk mock'lari):
 * durumlu spec'ler kendi durumunu kullanir; baska spec'lerin eylemleri (XP, odak, soru kaydi, degerlendirme
 * vb.) onu etkilemez (ve tersi). Anahtar `describe` basina (dosya + ust basliklar), `--repeat-each` tekrari
 * basina ve isci basina turetilir: seri `describe` icindeki testler durumu paylasir, ayni testin tekrari ve
 * basarisiz olup yeniden denenen grup (yeni isci) temiz durumla baslar. Cerez yalniz mock modunda okunur.
 */
const iscininTuzu = Math.random().toString(36).slice(2, 8);

function karma(metin: string): string {
  let h = 5381;
  for (const c of metin) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export const durumluTest = test.extend({
  context: async ({ context }, kullan, testInfo) => {
    const grup = [testInfo.file, ...testInfo.titlePath.slice(1, -1)].join('|');
    await context.addCookies([
      {
        name: 'mock_durum',
        value: `d${iscininTuzu}${String(testInfo.repeatEachIndex)}${karma(grup)}`.slice(0, 32),
        url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_MOCK_PORT ?? '3000'}`,
      },
    ]);
    await kullan(context);
  },
});
