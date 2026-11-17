import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { ogrenmeOrtaminiKur } from './yardimcilar-ogrenme';
import { api, belirtecAl } from './yardimcilar-operasyon';

/**
 * Gercek `api` + `motivasyon` (+ iki worker, NATS) ile motivasyon akisi: ogrenci karakter secer, odak
 * oturumu (sunucuda acik oturum surdurulur, bitirilince kazanim), plan gorevi tamamlayinca `+XP` ve seri
 * takvimi; ogretmen (sahip) haftanin yildizi verir ve seri duraklatir.
 * On kosul: `docs/gelistirme.md` motivasyon bolumu (api, motivasyon, worker'lar; hesap kopyalari icin
 * `olaylari-yeniden-yayimla` ya da yeni kurum). Ortam: `API_URL`, `MOTIVASYON_URL`, `E2E_WEB_PORT`.
 * `EKRAN_KAYDET=<dizin>` verilirse yuva, odak, bugun, grup goruntuleri (acik/koyu, masaustu ve dar) yazilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

const IST = 'Europe/Istanbul';
function bugun(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}
function gunEtiketi(t: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(`${t}T00:00:00Z`));
}
const gunEkle = (t: string, g: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date(Date.parse(`${t}T00:00:00Z`) + g * 86_400_000),
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

/** Yeniden OTP ile giris yapip kurum baglamli erisim belirteci alir (tarayicisiz API cagrilari icin). */
async function ogrenciBelirteci(telefon: string, kurumId: string): Promise<string> {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { govde: { telefon, kod } },
  );
  return belirtecAl(oturum, kurumId);
}

/** Motivasyon servisi: dogrudan istek (odak oturumunu gecmis bir baslangicla acmak icin). */
async function motivasyon<T>(
  yontem: string,
  yol: string,
  belirtec: string,
  govde?: unknown,
): Promise<T> {
  const taban = process.env.MOTIVASYON_URL ?? 'http://localhost:4001';
  const yanit = await fetch(`${taban}/v1/motivasyon/${yol}`, {
    method: yontem,
    headers: {
      authorization: `Bearer ${belirtec}`,
      ...(govde === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(govde === undefined ? {} : { body: JSON.stringify(govde) }),
  });
  if (!yanit.ok) throw new Error(`${yontem} ${yol} ${String(yanit.status)}: ${await yanit.text()}`);
  return (await yanit.json()) as T;
}

test('gercek api: karakter, odak, plan gorevi +XP, seri; ogretmen yildiz ve duraklatma', async ({
  page,
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(420_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${dizin}/motivasyon-${ad}-${tema}.png`, fullPage: true });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };
  /** Dar (telefon genisligi) goruntu: ayni sayfa 390 px'te. */
  const dar = async (p: Page, ad: string) => {
    if (!dizin) return;
    const eski = p.viewportSize();
    await p.setViewportSize({ width: 390, height: 844 });
    await goruntu(p, `dar-${ad}`);
    if (eski) await p.setViewportSize(eski);
  };

  const sahipTel = benzersizTelefon();
  let ogrTel = benzersizTelefon();
  while (ogrTel === sahipTel) ogrTel = benzersizTelefon();
  const ek = sahipTel.slice(-6);
  const o = await ogrenmeOrtaminiKur(sahipTel, ogrTel, ek);

  const ogrContext = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: IST,
    viewport: { width: 1280, height: 800 },
  });
  const ogr = await ogrContext.newPage();

  // --- Ogretmen (sahip): plan kur ve yayinla (ogrencinin plan gorevi olsun) ---------------------------
  await girisYap(page, sahipTel, o.kurumAdi);
  await git(page, 'Planlar', 'Planlar');
  await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  await page.getByRole('button', { name: 'Boş plan oluştur' }).click();
  await expect(page.getByText('Plan oluşturuldu.')).toBeVisible();
  const bugunTarih = bugun();
  // Plan haftanin (Pzt) basinda baslar; gorevi bugune ekle.
  await page.getByRole('button', { name: `${gunEtiketi(bugunTarih)} gününe görev ekle` }).click();
  const gorev = page.getByRole('dialog');
  await gorev.getByRole('textbox', { name: 'Soru sayısı' }).fill('10');
  await gorev.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText('Görev eklendi.')).toBeVisible();
  await page.getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Plan yayınlandı; öğrenci görebilir.')).toBeVisible();

  // --- Ogrenci: karakter secimi ---------------------------------------------------------------------
  await girisYap(ogr, ogrTel, o.kurumAdi);
  const kart = ogr.getByRole('region', { name: 'Yol arkadaşın' });
  await expect(kart.getByText('Henüz bir yol arkadaşın yok.')).toBeVisible();
  await goruntu(ogr, 'bugun-karaktersiz');
  await kart.getByRole('link', { name: 'Yol arkadaşını seç' }).click();
  await expect(ogr.getByRole('heading', { name: 'Yol arkadaşını seç', level: 1 })).toBeVisible();
  await ogr.getByRole('radio', { name: /Sedir/ }).check({ force: true });
  await goruntu(ogr, 'karakter-secimi');
  await dar(ogr, 'karakter-secimi');
  // Uygunsuz ad sunucuda reddedilir (422) ve anlasilir hata gosterilir.
  await ogr.getByLabel('Yol arkadaşının adı').fill('Hitler');
  await ogr.getByRole('button', { name: 'Bu arkadaşı seç' }).click();
  await expect(ogr.getByText(/Bu ad kullanılamıyor/)).toBeVisible();
  await ogr.getByLabel('Yol arkadaşının adı').fill('Fındık');
  await ogr.getByRole('button', { name: 'Bu arkadaşı seç' }).click();
  await expect(ogr.getByRole('heading', { name: 'Yuva', level: 1 })).toBeVisible();
  await expect(ogr.getByRole('heading', { name: 'Fındık', level: 2 })).toBeVisible();
  await expect(ogr.getByTestId('seviye')).toHaveText('Seviye 1');

  // --- Odak: sunucuda gecmis baslangicli acik oturum -> sekmede surdurulur, bitirilince kazanim -------
  const belirtec = await ogrenciBelirteci(ogrTel, o.kurumId);
  const istemciId = crypto.randomUUID().replace(/^(.{14})./, '$17'); // UUIDv7 bicimi
  await motivasyon('POST', `kurumlar/${o.kurumId}/odak-oturumlari`, belirtec, {
    istemci_id: istemciId,
    mod: 'serbest',
    planlanan_dk: 5,
    baslangic_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    cihaz: 'e2e',
  });
  await git(ogr, 'Odak', 'Odak');
  await expect(ogr.getByRole('heading', { name: 'Süre doldu' })).toBeVisible();
  await expect(ogr.getByTestId('odak-sayac')).toHaveText('00:00');
  await goruntu(ogr, 'odak-sayac');
  await ogr.getByRole('button', { name: 'Oturumu bitir' }).click();
  await expect(ogr.getByRole('heading', { name: 'Oturumu tamamladın' })).toBeVisible();
  await expect(ogr.getByTestId('odak-sonuc')).toContainText(/\d+ dakika odaklandın ve \d+ XP/);
  // Merkezi XP geri bildirimi (odak bitisi): ucan rozet.
  await expect(ogr.getByTestId('xp-rozeti')).toContainText(/\+\d+ XP/, { timeout: 20_000 });
  await goruntu(ogr, 'odak-sonuc');
  await dar(ogr, 'odak-sonuc');

  // --- Plan gorevi: tamamlayinca +XP, seri takvimi guncellenir ----------------------------------------
  await git(ogr, 'Haftalık planım', 'Haftalık planım');
  const gun = ogr.getByRole('listitem', { name: gunEtiketi(bugunTarih) });
  const soruGorevi = gun.getByRole('listitem').filter({ has: ogr.getByLabel(/yapılan soru/) });
  await soruGorevi.getByLabel(/yapılan soru/).fill('10');
  await soruGorevi.getByRole('button', { name: /gerçekleşenini kaydet/ }).click();
  await expect(soruGorevi.getByText('Tamam', { exact: true })).toBeVisible();
  await expect(ogr.getByTestId('xp-rozeti')).toContainText(/\+\d+ XP/, { timeout: 25_000 });

  await menu(ogr).getByRole('link', { name: 'Bugün', exact: true }).click();
  const bugunKart = ogr.getByRole('region', { name: 'Yol arkadaşın' });
  await expect(bugunKart.getByText('Fındık')).toBeVisible();
  await expect(bugunKart.getByText(/Bugün \d+ XP kazandın/)).toBeVisible();
  // Seri: plan gorevi esigi 1; gun aktif olur ve seri 1 gun (olay tuketicisi gecikebilir).
  await expect(bugunKart.getByText('1 günlük serindesin')).toBeVisible({ timeout: 20_000 });
  await expect(bugunKart.getByText('Bugünkü hedefini tamamladın')).toBeVisible();
  await goruntu(ogr, 'bugun');
  await dar(ogr, 'bugun');

  await git(ogr, 'Karakterim', 'Yuva');
  await expect(ogr.getByTestId('seri-mesaji')).toHaveText('1 günlük serindesin');
  await expect(ogr.locator('[data-durum]')).toHaveCount(35);
  await expect(ogr.locator('[data-bugun="true"]')).toHaveAttribute('data-durum', 'aktif');
  await expect(ogr.getByTestId('hareketler').getByRole('listitem').first()).toBeVisible();
  await goruntu(ogr, 'yuva');
  await dar(ogr, 'yuva');

  // --- Ogretmen (sahip): haftanin yildizi ve seri duraklatma ----------------------------------------
  await page.getByRole('link', { name: 'Gruplar' }).first().click();
  await page.getByRole('link', { name: new RegExp(o.grupAdi) }).click();
  const yildiz = page.getByRole('region', { name: 'Haftanın yıldızı' });
  await expect(yildiz).toBeVisible();
  await expect(yildiz.getByText('Sınırsız hak')).toBeVisible();
  await yildiz.getByLabel('Öğrenci').selectOption({ label: o.ogrenciAdi });
  await yildiz.getByLabel(/Gerekçe/).fill('Plan görevlerini zamanında yapıyor.');
  await yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' }).click();
  await expect(
    yildiz.getByText(`${o.ogrenciAdi} haftanın yıldızı seçildi (+50 XP).`),
  ).toBeVisible();
  await yildiz.getByLabel('Öğrenci').selectOption({ label: o.ogrenciAdi });
  await yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' }).click();
  await expect(yildiz.getByRole('alert')).toContainText('zaten haftanın yıldızı seçildi');

  const dur = page.getByRole('region', { name: 'Seri duraklatma' });
  await dur.getByLabel('Başlangıç').fill(gunEkle(bugunTarih, 2));
  await dur.getByLabel('Bitiş').fill(gunEkle(bugunTarih, 6));
  await dur.getByLabel(/Neden/).fill('Ara tatil');
  await dur.getByRole('button', { name: 'Duraklatma ekle' }).click();
  await expect(dur.getByText(/için seri duraklatıldı\./)).toBeVisible();
  await expect(dur.getByTestId('duraklatmalar')).toContainText('Ara tatil');
  await dur.getByLabel('Başlangıç').fill(gunEkle(bugunTarih, 4));
  await dur.getByLabel('Bitiş').fill(gunEkle(bugunTarih, 5));
  await dur.getByRole('button', { name: 'Duraklatma ekle' }).click();
  await expect(dur.getByRole('alert')).toContainText('zaten bir duraklatma var');
  await goruntu(page, 'grup-motivasyon');
  await dar(page, 'grup-motivasyon');

  // Ogretmen: ogrenci ozeti (seviye, radar, seri, rozet).
  await menu(page).getByRole('link', { name: 'Öğrenciler', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(`${o.ogrenciAdi} motivasyon özeti`) }).click();
  await expect(page.getByRole('heading', { name: o.ogrenciAdi, level: 1 })).toBeVisible();
  await expect(page.getByTestId('ogrenci-ozeti')).toBeVisible();
  await expect(page.getByTestId('radar-liste').getByRole('listitem')).toHaveCount(5);
  await goruntu(page, 'ogrenci-ozeti');

  // Ogrenci: haftanin yildizini yuvasinda gorur.
  await git(ogr, 'Karakterim', 'Yuva');
  await ogr.reload();
  await expect(ogr.getByTestId('yildizlarim')).toContainText('Plan görevlerini zamanında yapıyor.');
  await ogrContext.close();
});
