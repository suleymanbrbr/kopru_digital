import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { ogrenmeOrtaminiKur } from './yardimcilar-ogrenme';
import { api } from './yardimcilar-operasyon';

/**
 * Gercek `api` + `medya` + RustFS'e karsi odev ve haftalik plan ek dosyalari: ogretmen PDF ve fotograf
 * yukler (presigned PUT -> isleme -> hazir), odeve/plana baglar; ogrenci ekleri gorur ve gercek imzali
 * baglantidan indirir. Ortam: `API_ADMIN_DATABASE_URL`, `API_URL`, `MEDYA_URL`, `E2E_WEB_PORT`;
 * `EKRAN_KAYDET=<dizin>` ekran goruntuleri yazar. Medya servisi ve worker'i calismiyorsa atlanir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) {
    const medya = process.env.MEDYA_URL ?? 'http://localhost:4003';
    try {
      const y = await fetch(`${medya}/ready`, { signal: AbortSignal.timeout(3000) });
      if (!y.ok) atlamaNedeni = `medya ${medya}/ready ${String(y.status)} dondu`;
    } catch {
      atlamaNedeni = `medya ${medya} adresine ulasilamadi`;
    }
  }
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

const IST = 'Europe/Istanbul';
const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
function pazartesi(): string {
  const t = bugun();
  const no = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date(Date.parse(`${t}T00:00:00Z`) - no * 86_400_000),
  );
}

/** Gecerli en kucuk PDF (bayt imzasi `%PDF`). */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
);
/** 8x8 gecerli PNG (sharp ile yeniden kodlanir). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOQSzlBEmIY1ZAyGkpywzVpAADGmEoQdBsCvwAAAABJRU5ErkJggg==',
  'base64',
);

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
const menu = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' });
async function git(page: Page, baglanti: string, baslik: string) {
  await menu(page).getByRole('link', { name: baglanti, exact: true }).click();
  await expect(page.getByRole('heading', { name: baslik, level: 1 })).toBeVisible();
}

/** Imzali adresi gercekten indirir: durum 200 ve beklenen icerik turu. */
async function indir(page: Page, href: string, tur: RegExp) {
  const yanit = await page.request.get(href);
  expect(yanit.status(), href).toBe(200);
  expect(yanit.headers()['content-type'] ?? '').toMatch(tur);
  return (await yanit.body()).length;
}

test('gercek medya: odev ve plan ekleri (ogretmen yukler, ogrenci gorur ve indirir)', async ({
  page,
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(300_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string) => {
    if (!dizin) return;
    await p.mouse.move(0, 0);
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${dizin}/${ad}.png`, fullPage: true });
  };

  const sahipTel = benzersizTelefon();
  let ogrTel = benzersizTelefon();
  while (ogrTel === sahipTel) ogrTel = benzersizTelefon();
  const o = await ogrenmeOrtaminiKur(sahipTel, ogrTel, sahipTel.slice(-6));
  const ogrContext = await browser.newContext({ locale: 'tr-TR', timezoneId: IST });
  const ogr = await ogrContext.newPage();

  // --- Ogretmen: odeve PDF + fotograf ekler ------------------------------------------------------
  await girisYap(page, sahipTel, o.kurumAdi);
  await git(page, 'Ödevler', 'Ödevler');
  await page.getByRole('button', { name: 'İlk ödevini ver' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Grup', { exact: true }).selectOption({ label: o.grupAdi });
  await form.getByLabel('Başlık', { exact: true }).fill('Türev föyü');
  await form.getByTestId('ek-girdisi').setInputFiles([
    { name: 'turev-foyu.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'sayfa.png', mimeType: 'image/png', buffer: PNG },
  ]);
  const satirlar = form.getByTestId('ek-yukleme-ogesi');
  await expect(satirlar).toHaveCount(2);
  // Her ikisi de yuklenip medyada hazir olur (isleme worker'i): "Yüklendi" durumu.
  await expect(satirlar.getByText('Yüklendi', { exact: true })).toHaveCount(2, { timeout: 60_000 });
  await goruntu(page, 'odev-formu-ekler');
  await form.getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Ödev yayınlandı.')).toBeVisible();

  // --- Ogretmen: ozette ekleri gorur, uc dosyayi kaldirir ve yenisini ekler ----------------------
  await page.getByRole('button', { name: /ödevinin özeti/ }).click();
  const ekBolumu = page.getByRole('region', { name: 'Ek dosyalar' });
  await expect(ekBolumu.getByTestId('ek-ogesi')).toHaveCount(2);
  await expect(ekBolumu.getByText('PDF belgesi')).toBeVisible();
  await goruntu(page, 'odev-ozeti-ekler');
  await ekBolumu.getByRole('button', { name: 'Ek 2 dosyasını kaldır' }).click();
  await expect(ekBolumu.getByTestId('ek-ogesi')).toHaveCount(1);
  await ekBolumu.getByTestId('ek-girdisi').setInputFiles({
    name: 'cozumler.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(ekBolumu.getByTestId('ek-ogesi')).toHaveCount(2, { timeout: 60_000 });

  // --- Ogrenci: kartta "2 ek", acar, gercek indirir -----------------------------------------------
  await girisYap(ogr, ogrTel, o.kurumAdi);
  await git(ogr, 'Ödevlerim', 'Ödevlerim');
  const ekDugmesi = ogr.getByRole('button', { name: /2 ek/ });
  await expect(ekDugmesi).toBeVisible();
  await ekDugmesi.click();
  const baglantilar = ogr.getByRole('link', { name: /dosyasını aç/ });
  await expect(baglantilar).toHaveCount(2);
  for (const baglanti of await baglantilar.all()) {
    const href = (await baglanti.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https?:\/\//);
    expect(await indir(ogr, href, /pdf|png|octet-stream/)).toBeGreaterThan(50);
  }
  await goruntu(ogr, 'ogrenci-odevlerim-ekler');

  // --- Plan: ogretmen hazir plan PDF'i yukler -------------------------------------------------------
  await git(page, 'Planlar', 'Planlar');
  await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  await page.getByRole('button', { name: 'Boş plan oluştur' }).click();
  await expect(page.getByText('Plan oluşturuldu.')).toBeVisible();
  const planEk = page.getByRole('region', { name: 'Ek dosyalar' });
  await planEk.getByTestId('ek-girdisi').setInputFiles({
    name: 'hafta-plani.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(planEk.getByTestId('ek-ogesi')).toHaveCount(1, { timeout: 60_000 });
  await goruntu(page, 'plan-ekler-ogretmen');

  // Planin yayinlanabilmesi icin bir gorev (api); sonra ogretmen arayuzunden yayinla.
  const planlar = await api<{ plan: { id: string } | null }>(
    `/v1/ogrenme/kurumlar/${o.kurumId}/ogrenciler/${o.ogrenciUyelikId}/plan?hafta=${pazartesi()}`,
    { belirtec: o.sahipBelirteci, yontem: 'GET' },
  );
  const planId = planlar.plan?.id ?? '';
  expect(planId).toMatch(/^[0-9a-f-]{36}$/);
  await api(`/v1/ogrenme/kurumlar/${o.kurumId}/planlar/${planId}/gorevler`, {
    belirtec: o.sahipBelirteci,
    govde: { gun: pazartesi(), brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 20 },
  });
  await api(`/v1/ogrenme/kurumlar/${o.kurumId}/planlar/${planId}/yayinla`, {
    belirtec: o.sahipBelirteci,
    govde: {},
  });

  // --- Ogrenci: planda eki gorur ve indirir --------------------------------------------------------
  await git(ogr, 'Haftalık planım', 'Haftalık planım');
  const ogrPlanEk = ogr.getByRole('region', { name: 'Ek dosyalar' });
  await expect(ogrPlanEk.getByTestId('ek-ogesi')).toHaveCount(1);
  const planHref = (await ogrPlanEk.getByRole('link').getAttribute('href')) ?? '';
  expect(await indir(ogr, planHref, /pdf|octet-stream/)).toBeGreaterThan(50);
  await goruntu(ogr, 'plan-ekler-ogrenci');

  await ogrContext.close();
});
