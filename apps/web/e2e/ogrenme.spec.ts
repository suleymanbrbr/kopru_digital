import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { xlsxOku, xlsxYaz } from '../src/sunucu/xlsx-mini';
import { girisYap } from './yardimcilar';

/**
 * Mock modda ogrenme ekranlari: mufredat, odev, haftalik plan, deneme. Mock veri sunucu surecinde
 * ortaktir; kurum basina ayri durum vardir: `Ege` ogretmen, `Mavi` yonetici (deneme kapali), `Atlas`
 * ogrenci, `Kuzey` sahip. Yalniz masaustu projesinde, kurum basina serial calisir.
 */
test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

const IST = 'Europe/Istanbul';

function tarih(gun = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(
    new Date(Date.now() + gun * 86_400_000),
  );
}
function haftaGunu(gun: number): string {
  const bugun = tarih();
  const no = (new Date(`${bugun}T00:00:00Z`).getUTCDay() + 6) % 7;
  return tarih(gun - no);
}
/** `2026-11-09` -> bilesendeki `gunEtiketi` ile ayni metin ("9 Kasım Pazartesi"). */
function gunEtiketi(t: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date(`${t}T00:00:00Z`));
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' });
async function git(page: Page, baglanti: string, baslik: string) {
  await menu(page).getByRole('link', { name: baglanti, exact: true }).click();
  await expect(page.getByRole('heading', { name: baslik, level: 1 })).toBeVisible();
}

async function ihlaller(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const sonuc = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return sonuc.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

/** Acik ve koyu temada axe ihlali olmamali. */
async function axeIkiTema(page: Page) {
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    expect(await ihlaller(page), tema).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe('odev', () => {
  test.describe.configure({ mode: 'serial' });

  test('ogretmen: odev verir, yayinlar, ozeti gorur ve teslimi inceler', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Ödevler', 'Ödevler');
    await expect(page.getByText('Üslü ifadeler test 4')).toBeVisible();
    await expect(page.getByText('Kareköklü ifadeler (taslak)')).toBeVisible();

    // Yeni odev: grup varsayilan dolu; konu 2 etkilesim (ac + sec).
    await page.getByRole('button', { name: 'Yeni ödev' }).first().click();
    const form = page.getByRole('dialog');
    await expect(form.getByLabel('Grup', { exact: true })).toHaveValue(/.+/);
    await form.getByRole('button', { name: /Konu seç/ }).click();
    await form.getByLabel('Konu ara').fill('NEGATIF');
    await form.getByRole('button', { name: /Tam sayıların negatif kuvvetleri/ }).click();
    await expect(form.getByLabel('Başlık')).toHaveValue('Tam sayıların negatif kuvvetleri');
    await form.getByRole('button', { name: 'Yayınla' }).click();
    await expect(page.getByText('Ödev yayınlandı.')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Ödev listesi' })
        .getByText('Tam sayıların negatif kuvvetleri'),
    ).toBeVisible();

    // Kullanimdan kalkan konu secicide sunulmaz.
    await page.getByRole('button', { name: 'Yeni ödev' }).first().click();
    const form2 = page.getByRole('dialog');
    await form2.getByRole('button', { name: /Konu seç/ }).click();
    await form2.getByLabel('Konu ara').fill('eski müfredat');
    await expect(form2.getByText('Aramana uyan konu yok.')).toBeVisible();
    // Sablon olarak kaydet.
    await form2.getByLabel('Başlık').fill('Şablon ödevi');
    await form2.getByRole('button', { name: 'Şablon olarak kaydet' }).click();
    await expect(form2.getByText('"Şablon ödevi" şablon olarak kaydedildi.')).toBeVisible();
    await form2.getByRole('button', { name: 'Vazgeç' }).click();
    await page.getByRole('tab', { name: 'Şablonlar' }).click();
    await expect(page.getByText('Şablon ödevi')).toBeVisible();
    await page.getByRole('button', { name: 'Şablon ödevi şablonuyla ödev ver' }).click();
    await expect(page.getByRole('dialog').getByLabel('Başlık')).toHaveValue('Şablon ödevi');
    await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
    await page.getByRole('button', { name: 'Şablon ödevi şablonunu sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByText('Şablon silindi.')).toBeVisible();

    // Ozet: 30 kisilik sinifin teslim durumu tek ekranda.
    await page.getByRole('tab', { name: 'Ödevler' }).click();
    await page.getByRole('button', { name: 'Üslü ifadeler test 4 ödevinin özeti' }).click();
    const tablo = page.getByRole('table', { name: /teslim durumu/ });
    await expect(tablo).toBeVisible();
    await expect(tablo.getByRole('row')).toHaveCount(7); // baslik + 6 ogrenci
    await expect(tablo.getByRole('row', { name: /Ayşe Demir/ })).toContainText('Teslim edildi');
    await expect(tablo.getByRole('row', { name: /Ayşe Demir/ })).toContainText('%85');
    await expect(tablo.getByRole('row', { name: /Çağlar Yıldız/ })).toContainText('Bekliyor');
    await expect(
      page.getByRole('button', { name: 'Çağlar Yıldız teslimini incele' }),
    ).toBeDisabled();
    await axeIkiTema(page);

    await page.getByRole('button', { name: 'Ayşe Demir teslimini incele' }).click();
    const incele = page.getByRole('dialog');
    await expect(incele.getByText('Son soruda zorlandım.')).toBeVisible();
    await incele.getByRole('radio', { name: 'Tekrar yapsın' }).check();
    await incele.getByLabel('Kısa not').fill('Son soruyu tekrar çöz.');
    await incele.getByRole('button', { name: 'İncelemeyi kaydet' }).click();
    await expect(page.getByText('İnceleme kaydedildi.')).toBeVisible();
    await expect(tablo.getByRole('row', { name: /Ayşe Demir/ })).toContainText('Tekrar istendi');

    // Sonradan katilanlari ekle: hepsi zaten atanmis.
    await page.getByRole('button', { name: 'Sonradan katılanları ekle' }).click();
    await expect(page.getByText('Eklenecek yeni öğrenci yok.')).toBeVisible();

    // Taslak yayinla (listeye don).
    await page.getByRole('button', { name: 'Listeye dön' }).click();
    await page.getByRole('button', { name: 'Kareköklü ifadeler (taslak) ödevini yayınla' }).click();
    await expect(page.getByText('Ödev yayınlandı.')).toBeVisible();
    // Durum suzgeci.
    await page.getByLabel('Durum', { exact: true }).selectOption('taslak');
    await expect(page.getByText('Bu durumda ödev yok')).toBeVisible();

    // Bugun: bekleyen isler karti.
    await menu(page).getByRole('link', { name: 'Bugün', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Bekleyen işler' })).toBeVisible();
  });

  test('ogrenci: odevini 3 etkilesimde teslim eder, baskasinin verisini gormez', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Ödevlerim', 'Ödevlerim');
    await expect(page.getByText('Üslü ifadeler test 4')).toBeVisible();
    // Taslak odev ogrenciye gorunmez.
    await expect(page.getByText('Kareköklü ifadeler (taslak)')).toHaveCount(0);
    await axeIkiTema(page);

    await page.getByRole('button', { name: 'Üslü ifadeler test 4 ödevini teslim et' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByLabel('Yapılan soru')).toHaveValue('20');
    await form.getByLabel('Doğru').fill('15');
    await form.getByLabel('Yanlış').fill('3');
    await form.getByRole('button', { name: 'Teslim et' }).click();
    await expect(page.getByText('Ödev teslim edildi.')).toBeVisible();
    await expect(page.getByText('Teslim: 20 soru · doğru 15 · yanlış 3 · boş -')).toBeVisible();

    // Baskasinin sonucu, ozeti ve ortalamasi yok.
    await expect(page.getByText('Ayşe Demir')).toHaveCount(0);
    await expect(page.getByText('Ortalama doğru oranı')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /teslimini incele/ })).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Ödevler', exact: true })).toHaveCount(0);

    // Bugun: yaklasan odevler karti.
    await menu(page).getByRole('link', { name: 'Bugün', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Yaklaşan ödevler' })).toBeVisible();
  });
});

test.describe('haftalik plan', () => {
  test.describe.configure({ mode: 'serial' });

  test('ogretmen: plan kurar, sablondan kurar, kopyalar, toplu verir, yayinlar; kilitli hafta salt okunur', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Planlar', 'Planlar');
    await expect(page.getByText('Önce bir öğrenci seç')).toBeVisible();

    // Bos plan + gorev ekle + sablon olarak kaydet.
    await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: 'Elif Şahin' });
    await expect(page.getByText('Haftayı hızlıca kur')).toBeVisible();
    await page.getByRole('button', { name: 'Boş plan oluştur' }).click();
    await expect(page.getByText('Plan oluşturuldu.')).toBeVisible();
    const pazartesi = haftaGunu(0);
    await page.getByRole('button', { name: `${gunEtiketi(pazartesi)} gününe görev ekle` }).click();
    const gorev = page.getByRole('dialog');
    await gorev.getByRole('textbox', { name: 'Soru sayısı' }).fill('25');
    await gorev.getByRole('button', { name: /Konu seç/ }).click();
    await gorev.getByLabel('Konu ara').fill('bilimsel');
    await gorev
      .getByRole('button', { name: /Bilimsel gösterim/ })
      .first()
      .click();
    await gorev.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(page.getByText('Görev eklendi.')).toBeVisible();
    const gun = page.getByRole('listitem', { name: gunEtiketi(pazartesi) });
    await expect(gun.getByText('25 soru')).toBeVisible();
    await expect(gun.getByText('Bilimsel gösterim')).toBeVisible();
    await page.getByRole('button', { name: 'Şablon olarak kaydet' }).click();
    await expect(page.getByText('Şablon olarak kaydedildi.')).toBeVisible();

    // Baska ogrenci: sablondan kur (2 dakikanin cok altinda: sec + kur).
    await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: 'Zeynep Kaya' });
    await page.getByLabel('Şablondan kur', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Şablondan kur' }).click();
    await expect(page.getByText('Plan şablondan kuruldu.')).toBeVisible();
    await expect(
      page.getByRole('listitem', { name: gunEtiketi(pazartesi) }).getByText('25 soru'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Yayınla' }).click();
    await expect(page.getByText('Plan yayınlandı; öğrenci görebilir.')).toBeVisible();
    await expect(page.getByText('Yayında', { exact: true }).first()).toBeVisible();

    // Ogretmen notu.
    await page.getByLabel('Plan notu').fill('Bu hafta bilimsel gösterim.');
    await page.getByRole('button', { name: 'Notu kaydet' }).click();
    await expect(page.getByText('Not kaydedildi.')).toBeVisible();

    // Haftalik ozet: planlanan / gerceklesen.
    const ozet = page.getByRole('table', { name: 'Ders bazında planlanan ve gerçekleşen' });
    await expect(ozet.getByRole('row', { name: /Matematik/ })).toContainText('0 / 25');
    await axeIkiTema(page);

    // Gecen haftayi kopyala: sonraki haftada Elif'in plani yok; bu hafta var.
    await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: 'Elif Şahin' });
    await page.getByRole('button', { name: 'Sonraki hafta' }).click();
    await page.getByRole('button', { name: 'Geçen haftayı kopyala' }).click();
    await expect(page.getByText('Geçen haftanın görevleri kopyalandı.')).toBeVisible();
    await expect(
      page.getByRole('listitem', { name: gunEtiketi(haftaGunu(7)) }).getByText('25 soru'),
    ).toBeVisible();

    // Gruba toplu plan (bu haftanin sablonuyla); plani olana dokunulmaz.
    await page.getByRole('button', { name: 'Bu hafta' }).click();
    await page.getByRole('button', { name: 'Gruba toplu plan' }).click();
    const toplu = page.getByRole('dialog');
    await toplu.getByLabel('Grup', { exact: true }).selectOption({ label: '9-A Sınıfı' });
    await toplu.getByLabel('Şablon', { exact: true }).selectOption({ index: 1 });
    await toplu.getByRole('button', { name: 'Plan ver' }).click();
    await expect(page.getByText(/öğrenciye plan verildi/)).toBeVisible();

    // Kilitli hafta: salt okunur.
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Önceki hafta' }).click();
    await expect(page.getByText('Bu hafta kilitli', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Görev ekle/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Yayınla' })).toHaveCount(0);
  });

  test('ogrenci: haftasini gorur, gerceklesen girer, yarina tasir; hedefi degistiremez', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Haftalık planım', 'Haftalık planım');
    await expect(page.getByText('Bu hafta üslü ifadelere odaklan.')).toBeVisible();
    // Ogrenci hedef duzenleme/ekleme/silme denetimi gormez.
    await expect(page.getByRole('button', { name: /Görev ekle|Düzenle|Sil/ })).toHaveCount(0);

    const pazartesi = haftaGunu(0);
    const sali = haftaGunu(1);
    const carsamba = haftaGunu(2);
    const pzt = page.getByRole('listitem', { name: gunEtiketi(pazartesi) });
    // Geometri gorevi (Pazartesi, 2. gorev): yarina tasi.
    await pzt.getByRole('button', { name: 'Geometri görevini yarına taşı' }).click();
    await expect(page.getByText('Geometri görevi yarına taşındı.')).toBeVisible();
    await expect(pzt.getByText('Devredildi')).toBeVisible();
    await expect(
      page.getByRole('listitem', { name: gunEtiketi(sali) }).getByText('Devredilen görev'),
    ).toBeVisible();

    // Carsamba matematik: tek dokunusla tamamlandi.
    const crs = page.getByRole('listitem', { name: gunEtiketi(carsamba) });
    await crs.getByRole('button', { name: 'Matematik görevini tamamladım' }).click();
    await expect(page.getByText('Matematik için yaptığın kaydedildi.')).toBeVisible();
    await expect(crs.getByText('Tamam', { exact: true })).toBeVisible();

    // Cuma: kismen (girilen miktar).
    const cuma = page.getByRole('listitem', { name: gunEtiketi(haftaGunu(4)) });
    await cuma.getByLabel('Matematik: yapılan soru').fill('12');
    await cuma.getByRole('button', { name: 'Matematik gerçekleşenini kaydet' }).click();
    await expect(cuma.getByText('Kısmen')).toBeVisible();

    // Ders bazinda ozet.
    const ozet = page.getByRole('table', { name: 'Ders bazında planlanan ve gerçekleşen' });
    await expect(ozet.getByRole('row', { name: /Matematik/ })).toContainText('/');
    await axeIkiTema(page);

    // Bugun: bugunku gorevler.
    await menu(page).getByRole('link', { name: 'Bugün', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Bugünkü görevler' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Bugünkü görevler' }).getByRole('listitem').first(),
    ).toBeVisible();
  });
});

test.describe('deneme', () => {
  test.describe.configure({ mode: 'serial' });

  test('ogretmen: tek giris net anlik, alan dogrulamasi, kayit', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Denemeler', 'Denemeler');
    const form = page.getByRole('form', { name: 'Tek öğrenci için deneme girişi' });
    await form.getByLabel('Öğrenci', { exact: true }).selectOption({ label: 'Elif Şahin' });
    await expect(form.getByLabel('Sınav türü')).toHaveValue('lgs');

    // Net anlik (LGS katsayisi 0,3333): 17d/3y -> 16,00; 17d/1y -> 16,67.
    await form.getByLabel('Türkçe Doğru').fill('17');
    await form.getByLabel('Türkçe Yanlış').fill('3');
    await expect(form.getByTestId('toplam-net')).toHaveText('16,00');
    await form.getByLabel('Türkçe Yanlış').fill('1');
    await expect(form.getByTestId('toplam-net')).toHaveText('16,67');

    // Alan dogrulamasi: dogru + yanlis soru sayisini asamaz.
    await form.getByLabel('Türkçe Doğru').fill('18');
    await form.getByLabel('Türkçe Yanlış').fill('5');
    await expect(form.getByRole('alert').filter({ hasText: 'en fazla 20' })).toBeVisible();
    await expect(form.getByTestId('toplam-net')).toHaveText('-');
    await form.getByLabel('Türkçe Yanlış').fill('1');
    await form.getByLabel('Türkçe Doğru').fill('17');
    await form.getByLabel('Türkçe Boş').fill('5');
    await expect(form.getByRole('alert').filter({ hasText: 'tam 20' })).toBeVisible();
    await form.getByLabel('Türkçe Boş').fill('');

    await form.getByLabel('Deneme adı').fill('Kasım LGS denemesi');
    await form.getByRole('button', { name: 'Denemeyi kaydet' }).click();
    await expect(page.getByText('Deneme kaydedildi. Toplam net: 16,67.')).toBeVisible();
    await axeIkiTema(page);
  });

  test('ogretmen: tablo girisi klavye ile, hata satiri, toplu kayit', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Denemeler', 'Denemeler');
    await page.getByRole('tab', { name: 'Tablo girişi' }).click();
    await page.getByLabel('Grup', { exact: true }).selectOption({ label: '9-A Sınıfı' });
    await page.getByLabel('Sınav türü').selectOption('tyt');
    await page.getByLabel('Deneme adı').fill('TYT tablo denemesi');

    // Ilk hucreye yaz, oklarla gez; Enter bir alt satira iner.
    const hucre = (ad: string, bolum: string, alan: 'Doğru' | 'Yanlış') =>
      page.getByLabel(`${ad}, ${bolum}, ${alan}`);
    await hucre('Ayşe Demir', 'Türkçe', 'Doğru').fill('30');
    await hucre('Ayşe Demir', 'Türkçe', 'Doğru').press('ArrowRight');
    await expect(hucre('Ayşe Demir', 'Türkçe', 'Yanlış')).toBeFocused();
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await expect(hucre('Çağlar Yıldız', 'Türkçe', 'Yanlış')).toBeFocused();
    await page.keyboard.type('2');
    await page.keyboard.press('Shift+Enter');
    await expect(hucre('Ayşe Demir', 'Türkçe', 'Yanlış')).toBeFocused();
    await hucre('Çağlar Yıldız', 'Türkçe', 'Doğru').fill('36');
    // Net satirda anlik: 30 - 4 * 0,25 = 29,00.
    await expect(page.getByRole('row', { name: /Ayşe Demir/ })).toContainText('29,00');
    await expect(page.getByText('2 / 6 öğrenci için sonuç girildi.')).toBeVisible();
    await axeIkiTema(page);

    // Hatali satir: bolumu asan deger kaydi engeller.
    await hucre('Elif Şahin', 'Türkçe', 'Doğru').fill('99');
    await page.getByRole('button', { name: 'Hepsini kaydet' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '1 satırda hata var' })).toBeVisible();
    await hucre('Elif Şahin', 'Türkçe', 'Doğru').fill('');
    await page.getByRole('button', { name: 'Hepsini kaydet' }).click();
    await expect(page.getByText('2 öğrencinin denemesi kaydedildi.')).toBeVisible();
  });

  test('ogretmen: Excel sablonu iner (PK), yukleme satir hatalarini gosterir', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Denemeler', 'Denemeler');
    await page.getByRole('tab', { name: 'Excel' }).click();
    await page.getByLabel('Sınav türü').selectOption('tyt');

    const indirme = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel şablonunu indir' }).click();
    const dosya = await indirme;
    expect(dosya.suggestedFilename()).toMatch(/\.xlsx$/);
    const yol = await dosya.path();
    const bayt = readFileSync(yol);
    expect(bayt.subarray(0, 2).toString('latin1')).toBe('PK');
    await expect(page.getByText('Şablon indirildi.')).toBeVisible();

    // Doldurulmamis sablon: tum satirlar atlanir.
    const ad = page.getByLabel('Deneme adı');
    await ad.fill('Excel TYT denemesi');
    await page.getByLabel('Doldurulmuş Excel dosyası').setInputFiles(yol);
    await page.getByRole('button', { name: 'Yükle', exact: true }).click();
    await expect(page.getByText('0 deneme kaydedildi, 10 puansız satır atlandı.')).toBeVisible();

    // Bolumu asan puan: satir hatasi gosterilir, hicbiri kaydedilmez.
    const satirlar = xlsxOku(new Uint8Array(bayt)) ?? [];
    const baslik = satirlar[0] ?? [];
    const dogru = baslik.indexOf('turkce_dogru');
    const hatali = satirlar.map((s, i) =>
      i === 2 ? baslik.map((_, c) => (c === dogru ? 77 : (s[c] ?? null))) : s,
    );
    await page.getByLabel('Doldurulmuş Excel dosyası').setInputFiles({
      name: 'hatali.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(xlsxYaz(hatali)),
    });
    await page.getByRole('button', { name: 'Yükle', exact: true }).click();
    const hata = page.getByRole('alert').filter({ hasText: 'satırda hata var' });
    await expect(hata).toBeVisible();
    await expect(hata.getByRole('row', { name: /^3/ })).toContainText('Türkçe');

    // Gecerli puan: kaydedilir.
    const iyi = satirlar.map((s, i) =>
      i === 1 ? baslik.map((_, c) => (c === dogru ? 30 : (s[c] ?? null))) : s,
    );
    await page.getByLabel('Doldurulmuş Excel dosyası').setInputFiles({
      name: 'iyi.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(xlsxYaz(iyi)),
    });
    await page.getByRole('button', { name: 'Yükle', exact: true }).click();
    await expect(page.getByText('1 deneme kaydedildi, 9 puansız satır atlandı.')).toBeVisible();
  });

  test('ogretmen: onay kuyrugu onaylar, gelisim grafigi ve sinif ortalamasi gorunur', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Denemeler', 'Denemeler');
    await page.getByRole('tab', { name: /Onay kuyruğu/ }).click();
    await expect(page.getByText('Ayşe Demir · TYT Deneme (öğrenci girişi)')).toBeVisible();
    await page
      .getByRole('button', { name: 'Ayşe Demir TYT Deneme (öğrenci girişi) sonucunu onayla' })
      .click();
    await expect(page.getByText('Deneme onaylandı.')).toBeVisible();
    await expect(page.getByText('Onay bekleyen deneme yok')).toBeVisible();

    await page.getByRole('tab', { name: 'Gelişim' }).click();
    await page.getByLabel('Öğrenci', { exact: true }).selectOption({ label: 'Çağlar Yıldız' });
    await page.getByLabel('Sınav türü').selectOption('tyt');
    await page.getByLabel('Sınıf ortalaması için grup').selectOption({ label: '9-A Sınıfı' });
    await expect(page.getByRole('img', { name: /TYT net gelişimi/ })).toBeVisible();
    await expect(page.getByText('Son 5 ortalama').first()).toBeVisible();
    await page.getByLabel('Bölüm çizgisi').selectOption({ label: 'Türkçe' });
    await expect(page.getByRole('img', { name: /Türkçe/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Sınıf ortalaması' })).toBeVisible();
    await page.getByText('Tablo olarak göster').click();
    await expect(page.getByRole('table', { name: /TYT net gelişimi/ })).toBeVisible();
    await axeIkiTema(page);
  });

  test('sahip: red nedeni zorunlu, ayar acilip kapanir', async ({ page }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await git(page, 'Denemeler', 'Denemeler');
    await page.getByRole('tab', { name: /Onay kuyruğu/ }).click();
    await page
      .getByRole('button', { name: 'Ayşe Demir TYT Deneme (öğrenci girişi) sonucunu reddet' })
      .click();
    const pencere = page.getByRole('alertdialog');
    await pencere.getByRole('button', { name: 'Reddet' }).click();
    await expect(pencere.getByText('Red nedenini yaz.')).toBeVisible();
    await pencere.getByLabel('Red nedeni').fill('Sayıları tekrar kontrol et.');
    await pencere.getByRole('button', { name: 'Reddet' }).click();
    await expect(page.getByText('Deneme reddedildi.')).toBeVisible();

    await page.getByRole('tab', { name: 'Ayarlar' }).click();
    const kutu = page.getByRole('checkbox', { name: /Öğrenci kendi denemesini girebilir/ });
    await expect(kutu).toBeChecked();
    await kutu.click();
    await expect(page.getByText('Ayar kaydedildi.')).toBeVisible();
    await expect(kutu).not.toBeChecked();
  });

  test('ogrenci: kendi sonucunu girer (onay bekliyor), gelisimini gorur, baskasini gormez', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Denemelerim', 'Denemelerim');
    await expect(page.getByText('TYT Deneme 3')).toBeVisible();
    await expect(page.getByText('Ayşe Demir')).toHaveCount(0);
    await expect(
      page.getByRole('tab', { name: /Onay kuyruğu|Tablo girişi|Excel|Ayarlar/ }),
    ).toHaveCount(0);
    await axeIkiTema(page);

    await page.getByRole('tab', { name: 'Sonuç gir' }).click();
    const form = page.getByRole('form', { name: 'Deneme sonucunu gir' });
    await expect(form.getByLabel('Öğrenci', { exact: true })).toHaveCount(0);
    await form.getByLabel('Sınav türü').selectOption('tyt');
    await form.getByLabel('Deneme adı').fill('Kendi TYT denemem');
    await form.getByLabel('Türkçe Doğru').fill('38');
    await form.getByLabel('Türkçe Yanlış').fill('2');
    await expect(form.getByTestId('toplam-net')).toHaveText('37,50');
    await form.getByRole('button', { name: 'Öğretmen onayına gönder' }).click();
    await expect(page.getByText('Sonucun öğretmenin onayına gönderildi.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Kendi TYT denemem' })).toContainText(
      'Onay bekliyor',
    );

    await page.getByRole('tab', { name: 'Gelişimim' }).click();
    await page.getByLabel('Sınav türü').selectOption('tyt');
    await expect(page.getByRole('img', { name: /TYT net gelişimi/ })).toBeVisible();
    await expect(page.getByText('Sınıf ortalaması')).toHaveCount(0);
    await axeIkiTema(page);
  });
});

test.describe('mufredat ve modul gorunurlugu', () => {
  test.describe.configure({ mode: 'serial' });

  test('sahip: kurum konusu ekler, arsivler; arsivli konu secicide sunulmaz', async ({ page }) => {
    await girisYap(page, 'Kuzey Yıldızı Akademi');
    await git(page, 'Müfredat', 'Müfredat');
    await expect(page.getByText('Üslü İfadeler').first()).toBeVisible();
    await expect(page.getByText('Katalog konuları değiştirilemez')).toHaveCount(0);

    await page.getByRole('button', { name: 'Kurum konusu ekle' }).first().click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Ders', { exact: true }).selectOption({ label: 'Matematik' });
    await form.getByLabel('Konu adı').fill('Kurum özel ünitesi');
    await form.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(page.getByText('Konu eklendi.')).toBeVisible();
    const satir = page.getByRole('listitem').filter({ hasText: 'Kurum özel ünitesi' }).first();
    await expect(satir.getByText('Kurum konusu')).toBeVisible();

    // Katalog konusunda islem dugmesi yok; arama Turkce duyarsiz.
    await page.getByLabel('Konu ara').fill('USLU');
    await expect(page.getByText('Tam sayıların negatif kuvvetleri')).toBeVisible();
    await page.getByLabel('Konu ara').fill('');

    await page.getByRole('button', { name: 'Kurum özel ünitesi konusunu arşivle' }).click();
    await expect(page.getByText(/Konu arşivlendi/)).toBeVisible();
    await expect(satir.getByText('Arşivde', { exact: true })).toBeVisible();
    await axeIkiTema(page);

    // Secicide arsivli konu sunulmaz.
    await git(page, 'Ödevler', 'Ödevler');
    await page.getByRole('button', { name: 'Yeni ödev' }).first().click();
    const odev = page.getByRole('dialog');
    await odev.getByRole('button', { name: /Konu seç/ }).click();
    await odev.getByLabel('Konu ara').fill('özel ünitesi');
    await expect(odev.getByText('Aramana uyan konu yok.')).toBeVisible();
    // Sahip tum kuruma odev verebilir.
    await expect(odev.getByRole('radio', { name: 'Tüm kurum' })).toBeVisible();
  });

  test('ogretmen: konu yonetemez, tum kuruma odev veremez', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await git(page, 'Müfredat', 'Müfredat');
    await expect(page.getByText('Üslü İfadeler').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kurum konusu ekle' })).toHaveCount(0);
    await git(page, 'Ödevler', 'Ödevler');
    await page.getByRole('button', { name: 'Yeni ödev' }).first().click();
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Tüm kurum' })).toHaveCount(0);
  });

  test('yonetici: deneme modulu kapaliysa menuden ve sayfadan kalkar', async ({ page }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await expect(menu(page).getByRole('link', { name: 'Ödevler', exact: true })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Planlar', exact: true })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Denemeler', exact: true })).toHaveCount(0);
    await page.goto(page.url().replace(/bugun$/, 'denemeler'));
    await expect(
      page.getByText('Bu modül kurumunda kapalı', { exact: false }).first(),
    ).toBeVisible();
    // Bugun ekraninda onay bekleyen deneme satiri yok.
    await page.goto(page.url().replace(/denemeler$/, 'bugun'));
    await expect(page.getByTestId('bekleyen-deneme')).toHaveCount(0);
  });

  test('ogrenci: personel sayfalarina erisemez', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await expect(menu(page).getByRole('link', { name: 'Müfredat', exact: true })).toHaveCount(0);
    await page.goto(page.url().replace(/bugun$/, 'odevler'));
    await expect(page.getByText('Bu bölüme erişimin yok', { exact: false }).first()).toBeVisible();
  });
});
