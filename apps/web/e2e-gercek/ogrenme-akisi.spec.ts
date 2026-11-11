import { expect, test, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { ogrenmeOrtaminiKur } from './yardimcilar-ogrenme';

/**
 * Gercek `api`ya karsi ogrenme akisi: kurum -> ogrenci ve grup -> odev yayinla -> ogrenci teslim ->
 * ogretmen incele -> plan kur ve yayinla -> ogrenci gerceklesen -> deneme gir ve gelisim.
 * `EKRAN_KAYDET=<dizin>` verilirse odev ozeti, plan haftasi, deneme tablo girisi ve gelisim grafigi
 * goruntuleri (acik ve koyu) yazilir. Ortam: `API_ADMIN_DATABASE_URL`, `API_URL`, `E2E_WEB_PORT`.
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
function pazartesi(): string {
  const t = bugun();
  const no = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date(Date.parse(`${t}T00:00:00Z`) - no * 86_400_000),
  );
}
function gunEtiketi(t: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(`${t}T00:00:00Z`));
}

/** Telefon + OTP ile girer (KVKK onceden kabul edilmis); tek kurum varsa secim atlanabilir. */
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

test('gercek api: odev, plan ve deneme akisi (ogretmen + ogrenci)', async ({ page, browser }) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(300_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: true });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const sahipTel = benzersizTelefon();
  let ogrTel = benzersizTelefon();
  while (ogrTel === sahipTel) ogrTel = benzersizTelefon();
  const ek = sahipTel.slice(-6);
  const o = await ogrenmeOrtaminiKur(sahipTel, ogrTel, ek);

  const ogrContext = await browser.newContext({ locale: 'tr-TR', timezoneId: IST });
  const ogr = await ogrContext.newPage();

  // --- Ogretmen (sahip): odev ver ---------------------------------------------------------------
  await girisYap(page, sahipTel, o.kurumAdi);
  await git(page, 'Ödevler', 'Ödevler');
  await expect(page.getByText('Henüz ödev vermedin')).toBeVisible();
  await page.getByRole('button', { name: 'İlk ödevini ver' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Grup', { exact: true }).selectOption({ label: o.grupAdi });
  await form.getByRole('button', { name: /Konu seç/ }).click();
  await form.getByLabel('Konu ara').fill('negatif');
  await form.getByRole('button', { name: /Tam sayıların negatif kuvvetleri/ }).click();
  await form.getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Ödev yayınlandı.')).toBeVisible();

  // --- Ogrenci: teslim ----------------------------------------------------------------------------
  await girisYap(ogr, ogrTel, o.kurumAdi);
  await git(ogr, 'Ödevlerim', 'Ödevlerim');
  await expect(ogr.getByText('Tam sayıların negatif kuvvetleri')).toBeVisible();
  await ogr.getByRole('button', { name: /ödevini teslim et/ }).click();
  const teslim = ogr.getByRole('dialog');
  await teslim.getByLabel('Doğru').fill('16');
  await teslim.getByLabel('Yanlış').fill('3');
  await teslim.getByRole('button', { name: 'Teslim et' }).click();
  await expect(ogr.getByText('Ödev teslim edildi.')).toBeVisible();

  // --- Ogretmen: ozet ve inceleme ----------------------------------------------------------------
  await git(page, 'Ödevler', 'Ödevler');
  await page.getByRole('button', { name: /ödevinin özeti/ }).click();
  const tablo = page.getByRole('table', { name: /teslim durumu/ });
  await expect(tablo.getByRole('row', { name: new RegExp(o.ogrenciAdi) })).toContainText(
    'Teslim edildi',
  );
  await expect(tablo.getByRole('row', { name: new RegExp(o.ogrenciAdi) })).toContainText('%80');
  await page.getByRole('button', { name: new RegExp(`${o.ogrenciAdi} teslimini incele`) }).click();
  const incele = page.getByRole('dialog');
  await incele.getByRole('radio', { name: 'Tamam' }).check();
  await incele.getByLabel('Kısa not').fill('Güzel çalışma.');
  await incele.getByRole('button', { name: 'İncelemeyi kaydet' }).click();
  await expect(page.getByText('İnceleme kaydedildi.')).toBeVisible();
  await expect(tablo.getByRole('row', { name: new RegExp(o.ogrenciAdi) })).toContainText(
    'İncelendi',
  );
  await goruntu(page, 'odev-ozeti');

  // Ogrenci inceleme sonucunu ve notunu gorur.
  await ogr.reload();
  await expect(ogr.getByText('İnceleme sonucu: Tamam')).toBeVisible();
  await expect(ogr.getByText('Güzel çalışma.')).toBeVisible();

  // --- Plan: kur ve yayinla --------------------------------------------------------------------------
  await git(page, 'Planlar', 'Planlar');
  await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  await page.getByRole('button', { name: 'Boş plan oluştur' }).click();
  await expect(page.getByText('Plan oluşturuldu.')).toBeVisible();
  const pzt = pazartesi();
  for (const [miktar, tur] of [
    ['30', 'soru'],
    ['45', 'dakika'],
  ] as const) {
    await page.getByRole('button', { name: `${gunEtiketi(pzt)} gününe görev ekle` }).click();
    const gorev = page.getByRole('dialog');
    if (tur === 'dakika') await gorev.getByRole('radio', { name: 'Süre hedefi' }).check();
    await gorev
      .getByRole('textbox', { name: tur === 'soru' ? 'Soru sayısı' : 'Dakika' })
      .fill(miktar);
    await gorev.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(page.getByText('Görev eklendi.')).toBeVisible();
  }
  await page.getByLabel('Plan notu').fill('Bu hafta üslü ifadelere odaklan.');
  await page.getByRole('button', { name: 'Notu kaydet' }).click();
  await expect(page.getByText('Not kaydedildi.')).toBeVisible();
  await page.getByRole('button', { name: 'Yayınla' }).click();
  await expect(page.getByText('Plan yayınlandı; öğrenci görebilir.')).toBeVisible();
  await goruntu(page, 'plan-haftasi');

  // --- Ogrenci: gerceklesen ---------------------------------------------------------------------------
  await git(ogr, 'Haftalık planım', 'Haftalık planım');
  await expect(ogr.getByText('Bu hafta üslü ifadelere odaklan.')).toBeVisible();
  const gun = ogr.getByRole('listitem', { name: gunEtiketi(pzt) });
  const soruGorevi = gun.getByRole('listitem').filter({ has: ogr.getByLabel(/yapılan soru/) });
  await soruGorevi.getByLabel(/yapılan soru/).fill('12');
  await soruGorevi.getByRole('button', { name: /gerçekleşenini kaydet/ }).click();
  await expect(soruGorevi.getByText('Kısmen')).toBeVisible();
  // Ogretmen gerceklesen degeri gorur (degistiremez: giris alani yok).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Planlar', level: 1 })).toBeVisible();
  await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  const ogretmenGun = page.getByRole('listitem', { name: gunEtiketi(pzt) });
  await expect(ogretmenGun.getByText('12 / 30 soru')).toBeVisible();
  await expect(ogretmenGun.getByLabel(/yapılan soru/)).toHaveCount(0);

  // --- Deneme: tek giris + tablo girisi + gelisim ---------------------------------------------------
  await git(page, 'Denemeler', 'Denemeler');
  const tek = page.getByRole('form', { name: 'Tek öğrenci için deneme girişi' });
  await tek.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  await tek.getByLabel('Sınav türü').selectOption('tyt');
  await tek.getByLabel('Deneme adı').fill('TYT 1');
  await tek
    .getByLabel(/ Doğru$/)
    .first()
    .fill('30');
  await tek
    .getByLabel(/ Yanlış$/)
    .first()
    .fill('4');
  await expect(tek.getByTestId('toplam-net')).toHaveText('29,00');
  await tek.getByRole('button', { name: 'Denemeyi kaydet' }).click();
  await expect(page.getByText('Deneme kaydedildi. Toplam net: 29,00.')).toBeVisible();

  await page.getByRole('tab', { name: 'Tablo girişi' }).click();
  await page.getByLabel('Grup', { exact: true }).selectOption({ label: o.grupAdi });
  await page.getByLabel('Sınav türü').selectOption('tyt');
  await page.getByLabel('Deneme adı').fill('TYT 2');
  const ilkDogru = page.getByLabel(new RegExp(`^${o.ogrenciAdi}, .*, Doğru$`)).first();
  await ilkDogru.fill('34');
  await ilkDogru.press('ArrowRight');
  await page.keyboard.type('2');
  await expect(page.getByRole('row', { name: new RegExp(o.ogrenciAdi) })).toContainText('33,50');
  await goruntu(page, 'deneme-tablo-girisi');
  await page.getByRole('button', { name: 'Hepsini kaydet' }).click();
  await expect(page.getByText('1 öğrencinin denemesi kaydedildi.')).toBeVisible();

  await page.getByRole('tab', { name: 'Gelişim' }).click();
  await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: o.ogrenciAdi });
  await page.getByLabel('Sınav türü').selectOption('tyt');
  await page.getByLabel('Sınıf ortalaması için grup').selectOption({ label: o.grupAdi });
  await expect(page.getByRole('img', { name: /TYT net gelişimi/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sınıf ortalaması' })).toBeVisible();
  await goruntu(page, 'deneme-gelisim');

  // Ogrenci: kendi denemeleri ve gelisimi.
  await git(ogr, 'Denemelerim', 'Denemelerim');
  await expect(ogr.getByText('TYT 1')).toBeVisible();
  await expect(ogr.getByText('TYT 2')).toBeVisible();
  await ogr.getByRole('tab', { name: 'Gelişimim' }).click();
  await ogr.getByLabel('Sınav türü').selectOption('tyt');
  await expect(ogr.getByRole('img', { name: /TYT net gelişimi/ })).toBeVisible();
  await expect(ogr.getByText('Sınıf ortalaması')).toHaveCount(0);

  await ogrContext.close();
});
