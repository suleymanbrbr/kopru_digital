import { expect, test, type Locator, type Page } from '@playwright/test';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { ogrenmeOrtaminiKur, ogretmenEkle } from './yardimcilar-ogrenme';
import { api } from './yardimcilar-operasyon';

/**
 * Gercek `api` (+ bildirim servisi, api ve bildirim isci surecleri, NATS) ile ogretmen degerlendirmesi, kaynak onerisi
 * ve koçluk gorunumu: kurum, grup, iki ogretmen (matematik, fizik) ve ogrenci -> A ogretmeni Bugun kartindan
 * ogrenciye gider, gorunur bir degerlendirme yazar ve kitaptan test onerir -> B ogretmeni A'nin yazdigini gorur,
 * gizli bir degerlendirme yazar ve serbest kaynak onerir -> ogrenci YALNIZ gorunur olani ve iki oneriyi gorur,
 * bildirim kutusunda 3 bildirim (genel metin) ve baglantilar "Ogretmenim" sekmesine gider -> ogrenci oneriyle
 * kayit girer -> koçluk gorunumunde "Basladi" ve olcek ortalamalari -> geri cekme (ogrenci artik gormez).
 * `EKRAN_KAYDET=<dizin>` verilirse `kocluk-*.png` goruntuleri (acik ve koyu) yazilir.
 * Ortam: `API_ADMIN_DATABASE_URL`, `API_URL`, `BILDIRIM_URL`, `E2E_WEB_PORT`.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

const IST = 'Europe/Istanbul';
const GIZLI = 'Sadece ogretmenler gorsun: ozel not';
const GORUNUR = 'Derslere düzenli katılıyor, ödevlerini zamanında getiriyor.';

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

const kok = (page: Page) => new URL(page.url()).pathname.split('/')[1] ?? '';

async function olcekSec(pencere: Locator, olcek: string, puan: number) {
  await pencere
    .getByRole('group', { name: olcek })
    .locator('label', { hasText: new RegExp(`^${String(puan)}$`) })
    .click();
}

test('gercek api: degerlendirme, kaynak onerisi, bildirim ve koçluk gorunumu (iki ogretmen + ogrenci)', async ({
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
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${dizin}/kocluk-${ad}-${tema}.png`, fullPage: true });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const telefonlar = new Set<string>();
  const yeniTelefon = () => {
    let t = benzersizTelefon();
    while (telefonlar.has(t)) t = benzersizTelefon();
    telefonlar.add(t);
    return t;
  };
  const sahipTel = yeniTelefon();
  const ogrTel = yeniTelefon();
  const ek = sahipTel.slice(-6);
  const o = await ogrenmeOrtaminiKur(sahipTel, ogrTel, ek);
  const hocaA = await ogretmenEkle(o, yeniTelefon(), `Ayşe Matematik ${ek}`, 'matematik');
  const hocaB = await ogretmenEkle(o, yeniTelefon(), `Mehmet Fizik ${ek}`, 'fizik');

  // Kurumun kaynak kitabi (sahip, api): kitaptan test onerisi icin.
  const kitapAdi = `Soru Bankası ${ek}`;
  await api(`/v1/ogrenme/kurumlar/${o.kurumId}/kaynak-kitaplar`, {
    belirtec: o.sahipBelirteci,
    govde: {
      ad: kitapAdi,
      brans_kodu: 'matematik',
      testler: [
        { ad: 'Test 1', soru_sayisi: 20 },
        { ad: 'Test 2', soru_sayisi: 25 },
      ],
    },
  });

  const baglam = () =>
    browser.newContext({
      locale: 'tr-TR',
      timezoneId: IST,
      viewport: { width: 1280, height: 900 },
    });
  const ctxB = await baglam();
  const sayfaB = await ctxB.newPage();
  const ctxOgr = await baglam();
  const ogr = await ctxOgr.newPage();

  // --- Ogretmen A: Bugun hatirlatma karti -> koçluk + yazma penceresi ---------------------------------
  await girisYap(page, hocaA.telefon, o.kurumAdi);
  const kart = page.getByTestId('degerlendirme-hatirlatma');
  await expect(
    page.getByRole('heading', { name: 'Bu hafta değerlendirmesi olmayan öğrencilerim' }),
  ).toBeVisible();
  await expect(kart).toContainText(o.ogrenciAdi);
  await expect(kart).toContainText('Henüz yazılmadı');
  await goruntu(page, 'bugun-hatirlatma');
  await kart.getByRole('link', { name: `${o.ogrenciAdi} için değerlendirme yaz` }).click();
  await expect(page).toHaveURL(/\/ogrenciler\/[0-9a-f-]{36}\?sekme=kocluk&yaz=1$/);
  const yaz = page.getByRole('dialog', { name: 'Değerlendirme yaz' });
  await expect(yaz).toBeVisible();
  await expect(yaz.getByRole('switch', { name: 'Öğrenci görsün' })).not.toBeChecked();
  await olcekSec(yaz, 'Çalışma düzeni', 5);
  await olcekSec(yaz, 'Derse katılım', 4);
  await olcekSec(yaz, 'Anlama düzeyi', 4);
  await yaz.getByRole('textbox', { name: 'Yorum' }).fill(GORUNUR);
  await yaz.getByRole('switch', { name: 'Öğrenci görsün' }).check();
  await goruntu(page, 'degerlendirme-formu');
  await yaz.getByRole('button', { name: 'Kaydet' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Değerlendirme kaydedildi.' }),
  ).toBeVisible();
  await expect(page.getByTestId('degerlendirme-satiri')).toHaveCount(1);
  await expect(page.getByTestId('degerlendirme-satiri')).toContainText('Öğrenci görüyor');

  // A: kitaptan test onerir.
  await page.getByRole('button', { name: 'Kaynak öner' }).click();
  const oner = page.getByRole('dialog', { name: 'Kaynak öner' });
  await oner.getByLabel('Kaynak türü').selectOption('kaynak_kitap_testi');
  await oner.getByLabel('Kaynak kitap').selectOption({ label: kitapAdi });
  await oner.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 1 (20 soru)' });
  await oner.getByLabel('Not (isteğe bağlı)').fill('Önce bu testi çöz.');
  await goruntu(page, 'oneri-formu');
  await oner.getByRole('button', { name: 'Öner' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kaynak önerildi.' })).toBeVisible();
  const aOneri = page.getByTestId('oneri-satiri').filter({ hasText: `${kitapAdi} · Test 1` });
  await expect(aOneri).toContainText('Henüz başlamadı');

  // --- Ogretmen B: A'nin yazdigini gorur; gizli degerlendirme + serbest oneri -------------------------
  await girisYap(sayfaB, hocaB.telefon, o.kurumAdi);
  await sayfaB.goto(`/${kok(sayfaB)}/ogrenciler`);
  await sayfaB.getByRole('link', { name: `${o.ogrenciAdi} koçluk görünümü` }).click();
  await expect(sayfaB.getByTestId('kocluk')).toBeVisible();
  const aninki = sayfaB.getByTestId('degerlendirme-satiri').filter({ hasText: GORUNUR });
  await expect(aninki).toContainText(hocaA.ad);
  await expect(aninki.getByRole('button')).toHaveCount(0);
  await expect(sayfaB.getByTestId('oneri-satiri')).toContainText(`${kitapAdi} · Test 1`);

  await sayfaB.getByRole('button', { name: 'Değerlendirme yaz' }).click();
  const yazB = sayfaB.getByRole('dialog', { name: 'Değerlendirme yaz' });
  await yazB.getByLabel('Ders (isteğe bağlı)').selectOption('fizik');
  await olcekSec(yazB, 'Çalışma düzeni', 3);
  await olcekSec(yazB, 'Ödev disiplini', 2);
  await olcekSec(yazB, 'Anlama düzeyi', 3);
  await yazB.getByRole('textbox', { name: 'Yorum' }).fill(GIZLI);
  await yazB.getByRole('button', { name: 'Kaydet' }).click();
  await expect(sayfaB.getByTestId('degerlendirme-satiri')).toHaveCount(2);
  await expect(sayfaB.getByText('Öğrenciye kapalı', { exact: true })).toHaveCount(1);

  await sayfaB.getByRole('button', { name: 'Kaynak öner' }).click();
  const onerB = sayfaB.getByRole('dialog', { name: 'Kaynak öner' });
  await onerB.getByLabel('Kaynak türü').selectOption('serbest');
  await onerB.getByLabel('Başlık').fill(`Fizik çıkmış sorular ${ek}`);
  await onerB.getByRole('button', { name: 'Öner' }).click();
  await expect(sayfaB.getByTestId('oneri-satiri')).toHaveCount(2);

  // --- Ogrenci: yalniz gorunur olan degerlendirme + iki oneri; bildirim kutusu -------------------------
  await girisYap(ogr, ogrTel, o.kurumAdi);
  await ogr.goto(`/${kok(ogr)}/bildirimler`);
  await expect(ogr.getByRole('heading', { name: 'Bildirimler', level: 1 })).toBeVisible();
  // Olay -> bildirim isci sureci asenkron: bildirimler gelene kadar bekle.
  await expect
    .poll(
      async () => {
        await ogr.reload();
        await ogr.getByRole('heading', { name: 'Bildirimler', level: 1 }).waitFor();
        await ogr.waitForLoadState('networkidle');
        return ogr.getByTestId('bildirim-satiri').count();
      },
      { timeout: 60_000, intervals: [1500] },
    )
    .toBe(3);
  await expect(ogr.getByText('Yeni değerlendirme', { exact: true })).toHaveCount(1);
  await expect(ogr.getByText('Yeni kaynak önerisi', { exact: true })).toHaveCount(2);
  // Bildirim metinleri genel: yorum ve kaynak adi yok.
  await expect(ogr.getByText(GIZLI)).toHaveCount(0);
  await expect(ogr.getByText(GORUNUR)).toHaveCount(0);
  await goruntu(ogr, 'bildirimler-ogrenci');

  // Derin baglanti: dogru sayfaya (Soru takibim > Ogretmenim) gider.
  await ogr.getByRole('link', { name: /Yeni değerlendirme/ }).click();
  await expect(ogr).toHaveURL(/\/gunluk-soru\?sekme=ogretmenim$/);
  const sekme = ogr.getByTestId('ogretmenim');
  await expect(sekme.getByTestId('degerlendirme-satiri')).toHaveCount(1);
  await expect(sekme.getByTestId('degerlendirme-satiri')).toContainText(GORUNUR);
  await expect(sekme.getByTestId('degerlendirme-satiri')).toContainText(hocaA.ad);
  await expect(ogr.getByText(GIZLI)).toHaveCount(0);
  await expect(sekme.getByTestId('oneri-satiri')).toHaveCount(2);
  await expect(sekme.getByTestId('oneri-satiri').filter({ hasText: kitapAdi })).toContainText(
    hocaA.ad,
  );
  await goruntu(ogr, 'ogrenci-ogretmenim');

  // --- Ogrenci: oneriden "Soru cozdum" -> kayit -----------------------------------------------------
  await sekme
    .getByTestId('oneri-satiri')
    .filter({ hasText: kitapAdi })
    .getByRole('link', { name: 'Günlük kayıtta kullan' })
    .click();
  await expect(ogr.getByRole('heading', { name: 'Soru çözdüm', level: 1 })).toBeVisible();
  await expect(ogr.getByLabel('Kaynak türü')).toHaveValue('test');
  await expect(ogr.getByLabel('Kitap', { exact: true })).toHaveValue(/.+/);
  await expect(ogr.getByLabel('Ders', { exact: true })).toHaveValue('matematik');
  await ogr.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 1 (20 soru)' });
  await ogr.getByRole('button', { name: /^Konu / }).click();
  await ogr.getByRole('searchbox', { name: 'Konu ara' }).fill('negatif');
  await ogr
    .getByRole('group', { name: 'Konu seçimi' })
    .getByRole('button', { name: 'Tam sayıların negatif kuvvetleri' })
    .first()
    .click();
  await ogr.getByRole('textbox', { name: 'Doğru', exact: true }).fill('14');
  await ogr.getByRole('textbox', { name: 'Yanlış', exact: true }).fill('4');
  await ogr.getByRole('textbox', { name: 'Boş', exact: true }).fill('2');
  await goruntu(ogr, 'ogrenci-oneriyle-kayit');
  await ogr.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ogr.getByRole('heading', { name: 'Kaydedildi: 20 soru.' })).toBeVisible();

  // --- Ogretmen A: "Basladi" ve olcek ortalamalari ----------------------------------------------------
  // Yazma penceresi kapaninca `?yaz=1` adresten kalkar: yenileme pencereyi yeniden acmaz.
  await expect(page).toHaveURL(/sekme=kocluk$/);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const aOneri2 = page.getByTestId('oneri-satiri').filter({ hasText: `${kitapAdi} · Test 1` });
  await expect(aOneri2).toContainText('Başladı');
  await expect(aOneri2).toContainText('1 kayıt');
  await expect(
    page.getByTestId('oneri-satiri').filter({ hasText: 'Fizik çıkmış sorular' }),
  ).toContainText('Henüz başlamadı');
  await expect(page.getByTestId('kullanilan-kitap')).toContainText(kitapAdi);
  await expect(page.getByTestId('kullanilan-kitap')).toContainText('1 / 2 test');
  // Ortalama: A (5,4,-,4) ve B (3,-,2,3) -> calisma 4, katilim 4, odev 2, anlama 3,5.
  const ortalama = page
    .getByRole('table', { name: 'Son 4 haftanın ölçek ortalamaları (1-5)' })
    .getByRole('row', { name: /4 hafta ortalaması/ });
  const hucreler = ortalama.getByRole('cell');
  await expect(hucreler.nth(0)).toHaveText('2');
  await expect(hucreler.nth(1)).toContainText('4');
  await expect(hucreler.nth(2)).toContainText('4');
  await expect(hucreler.nth(3)).toContainText('2');
  await expect(hucreler.nth(4)).toContainText('3,5');
  await expect(page.getByTestId('kocluk-konu-ozeti')).toContainText('Çözülen soru');
  await goruntu(page, 'ogretmen-kocluk');

  // Bugun kartinda bu ogrenci artik yok (ikisi de yazti; kart "hepsi tamam" der).
  await page.goto(`/${kok(page)}/bugun`);
  await expect(
    page.getByText('Bu hafta tüm öğrencilerin için değerlendirme yazdın.'),
  ).toBeVisible();

  // --- Duzenle ve geri cek --------------------------------------------------------------------------
  await page.goto(`/${kok(page)}/ogrenciler`);
  await page.getByRole('link', { name: `${o.ogrenciAdi} koçluk görünümü` }).click();
  const benimki = page.getByTestId('degerlendirme-satiri').filter({ hasText: GORUNUR });
  await benimki.getByRole('button', { name: /Düzenle/ }).click();
  const duzen = page.getByRole('dialog', { name: 'Değerlendirmeyi düzenle' });
  await duzen.getByRole('textbox', { name: 'Yorum' }).fill(`${GORUNUR} (güncellendi)`);
  await duzen.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Değerlendirme güncellendi.' }),
  ).toBeVisible();
  await ogr.goto(`/${kok(ogr)}/gunluk-soru?sekme=ogretmenim`);
  await expect(ogr.getByTestId('degerlendirme-satiri')).toContainText('(güncellendi)');

  await page
    .getByTestId('degerlendirme-satiri')
    .filter({ hasText: '(güncellendi)' })
    .getByRole('button', { name: /Geri çek/ })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Değerlendirme geri çekilsin mi?' })
    .getByRole('button', { name: 'Geri çek' })
    .click();
  await expect(page.getByTestId('degerlendirme-satiri')).toHaveCount(1);
  await goruntu(page, 'geri-cekildi');
  // Ogrenci artik hicbir degerlendirme gormez; B'nin gizli yorumu zaten gorunmuyordu.
  await ogr.reload();
  await expect(ogr.getByTestId('degerlendirme-satiri')).toHaveCount(0);
  await expect(ogr.getByText('Henüz paylaşılan bir değerlendirme yok')).toBeVisible();
  await expect(ogr.getByText(GIZLI)).toHaveCount(0);

  // Ogrenci, personel koçluk ucunu kullanamaz (403).
  const ogrDurum = await ogr.evaluate(
    async ([k, id]) => {
      const r = await fetch(`/api/ogrenme/kurumlar/${String(k)}/ogrenciler/${String(id)}/kocluk`, {
        credentials: 'same-origin',
      });
      return r.status;
    },
    [kok(ogr), o.ogrenciUyelikId],
  );
  expect([401, 403]).toContain(ogrDurum);

  await ctxB.close();
  await ctxOgr.close();
});
