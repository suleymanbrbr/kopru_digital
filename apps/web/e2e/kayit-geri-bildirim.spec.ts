import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda ders kayitlari, materyaller ve ders sonu geri bildirimi. Kayit/geri bildirim mock deposu
 * kurumlar arasi ortaktir (ogretmen kurumunda eklenen kayit ogrenci kurumunda gorunur), bu yuzden
 * durumlu akis tek sirali senaryodur ve yalniz masaustu projesinde kosar. Tarihler "bugun"e goredir.
 */

const AYRAC = Date.now().toString(36);
const KAYIT_BASLIGI = `Deneme kaydı ${AYRAC}`;
const ZOOM_ADRESI = `https://us02web.zoom.us/rec/share/${AYRAC}`;
const DRIVE_ADRESI = `https://drive.google.com/file/d/${AYRAC}/view`;

async function menu(page: Page, ad: string) {
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: ad }).click();
}

async function denklemlerDersiniAc(page: Page) {
  await menu(page, 'Takvim');
  await expect(page.getByRole('region', { name: /haftasının dersleri/ })).toBeVisible();
  await page
    .getByRole('button', { name: /Denklemler/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Kayıtlar' })).toBeVisible();
  return dialog;
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

test.describe('kayit ve geri bildirim akisi', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('ogretmen: ders detayinda yapistir-kaydet ile kayit ekler', async ({ page }) => {
    await girisYap(page, 'Ege');
    const dialog = await denklemlerDersiniAc(page);

    await dialog.getByRole('button', { name: 'Kayıt ekle' }).click();
    const form = dialog.getByRole('form', { name: 'Kayıt ekle' });
    await form.getByLabel('Bağlantılar').fill(`${ZOOM_ADRESI}\n${DRIVE_ADRESI}`);
    // Saglayici istemcide taninir; Drive icin paylasim uyarisi gosterilir.
    await expect(form.getByText('Zoom', { exact: true })).toBeVisible();
    await expect(form.getByText('Google Drive', { exact: true })).toBeVisible();
    await expect(
      form.getByText('Paylaşım ayarını kontrol et; öğrencin erişemezse kaydı açamaz.'),
    ).toBeVisible();
    await form.getByLabel('1. bağlantının başlığı (isteğe bağlı)').fill(KAYIT_BASLIGI);
    await form.getByLabel('1. bağlantının Zoom parolası (isteğe bağlı)').fill('Parola-1');
    await form.getByRole('button', { name: 'Kaydet', exact: true }).click();

    await expect(dialog.getByText('2 bağlantı eklendi. Öğrencilere görünür.')).toBeVisible();
    const satir = dialog.getByTestId('kaynak-satiri').filter({ hasText: KAYIT_BASLIGI });
    await expect(satir).toBeVisible();
    await expect(satir.getByText('Parolalı')).toBeVisible();
    await expect(satir.getByRole('link', { name: /Kaydı aç/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    // Basligi bos birakilan baglanti otomatik adlandirilir.
    await expect(dialog.getByText('Google Drive ders kaydı').first()).toBeVisible();
  });

  test('ogrenci: kaydi gorur, izledim isaretler, acilmiyor bildirir', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await menu(page, 'Kayıtlarım');
    await expect(page.getByRole('heading', { name: 'Kayıtlarım', level: 1 })).toBeVisible();

    const satir = page.getByTestId('kayit-satiri').filter({ hasText: KAYIT_BASLIGI });
    await expect(satir).toBeVisible();
    await expect(satir.getByText('İzlenmedi')).toBeVisible();
    // Izlenmemisler ustte.
    await expect(page.getByTestId('kayit-satiri').first().getByText('İzlenmedi')).toBeVisible();

    await satir.getByRole('button', { name: new RegExp(KAYIT_BASLIGI) }).click();
    await expect(satir.getByText('Parola-1')).toBeVisible();
    await expect(satir.getByRole('button', { name: 'Parolayı kopyala' })).toBeVisible();
    const ac = satir.getByRole('link', { name: /Kaydı aç/ });
    await expect(ac).toHaveAttribute('target', '_blank');
    await expect(ac).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(ac).toHaveAttribute('href', ZOOM_ADRESI);

    await satir.getByRole('button', { name: 'İzledim', exact: true }).click();
    await expect(satir.getByText('İzledin olarak işaretli')).toBeVisible();

    await satir.getByRole('button', { name: 'Açılmıyor', exact: true }).click();
    const form = satir.getByRole('form', { name: 'Kayıt açılmıyor mu?' });
    await form.getByLabel('Ne oldu?').selectOption('parola_yanlis');
    await form.getByLabel('Açıklama (isteğe bağlı)').fill('Parola kabul edilmiyor');
    await form.getByRole('button', { name: 'Öğretmenime bildir' }).click();
    await expect(page.getByText(/Öğretmenine bildirildi/)).toBeVisible();
  });

  test('ogrenci: sunucu sayfalama, tur suzgeci ve bozuk uyarisi', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await menu(page, 'Kayıtlarım');
    const satirlar = page.getByTestId('kayit-satiri');
    await expect(satirlar.first()).toBeVisible();
    const ilk = await satirlar.count();
    await page.getByRole('button', { name: 'Daha fazla yükle' }).click();
    await expect.poll(() => satirlar.count()).toBeGreaterThan(ilk);

    await expect(
      satirlar
        .filter({ hasText: 'Denklemler: tahta çözümleri (Drive)' })
        .getByText('Açılmıyor olabilir'),
    ).toBeVisible();

    await page.getByLabel('Tür').selectOption('kayit');
    await expect(satirlar.filter({ hasText: 'Haftalık ders notu' })).toHaveCount(0);
    await expect(satirlar.filter({ hasText: KAYIT_BASLIGI })).toBeVisible();
    await page.getByRole('button', { name: 'Süzgeçleri temizle' }).click();
    await page.getByLabel('Başlangıç tarihi').fill('2999-01-01');
    await expect(page.getByText('Bu süzgeçlere uyan kayıt yok')).toBeVisible();
  });

  test('ogretmen: izleyenleri ve acilmiyor bildirimini gorur, cozer, kaydi siler', async ({
    page,
  }) => {
    await girisYap(page, 'Ege');
    const dialog = await denklemlerDersiniAc(page);
    const satir = dialog.getByTestId('kaynak-satiri').filter({ hasText: KAYIT_BASLIGI });

    await expect(satir.getByText('1 izleyen')).toBeVisible();
    await satir.getByRole('button', { name: 'İzleyenler' }).click();
    const izleyenler = satir.getByRole('region', { name: 'İzleyenler' });
    await expect(izleyenler.getByText('Çağlar Yıldız')).toBeVisible();
    await expect(izleyenler.getByText('İzlemeyenler')).toBeVisible();

    await satir.getByRole('button', { name: /Açılmıyor bildirimleri \(1\)/ }).click();
    const sorunlar = satir.getByRole('region', { name: 'Açılmıyor bildirimleri' });
    await expect(sorunlar.getByText('Parola çalışmıyor: Parola kabul edilmiyor')).toBeVisible();
    await sorunlar.getByRole('button', { name: 'Çözüldü olarak işaretle' }).click();
    await expect(sorunlar.getByText('Çözüldü', { exact: true })).toBeVisible();
    await expect(
      satir.getByRole('button', { name: 'Açılmıyor bildirimleri', exact: true }),
    ).toBeVisible();

    // Gizle / goster.
    await satir.getByRole('button', { name: 'Gizle' }).click();
    await expect(satir.getByText('Gizli', { exact: true })).toBeVisible();
    await satir.getByRole('button', { name: 'Göster' }).click();

    // Duzenle.
    await satir.getByRole('button', { name: 'Düzenle' }).click();
    const duzenle = page.getByRole('dialog').last();
    await expect(duzenle.getByLabel('Zoom parolası')).toHaveValue('Parola-1');
    await duzenle.getByLabel('Başlık').fill(`${KAYIT_BASLIGI} (düzenlendi)`);
    await duzenle.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(dialog.getByText('Kayıt güncellendi.')).toBeVisible();
    const yeni = dialog.getByTestId('kaynak-satiri').filter({ hasText: 'düzenlendi' });
    await expect(yeni).toBeVisible();

    // Onayli silme: iki kayit da silinir.
    await yeni.getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('geri alınamaz');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(dialog.getByText('Kayıt silindi.')).toBeVisible();
    await expect(dialog.getByText(`${KAYIT_BASLIGI} (düzenlendi)`)).toHaveCount(0);
  });

  test('ogrenci: Bugun kartinda tek dokunusla geri bildirim verir ve degistirir', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas');
    // Haftanin gunune gore birden cok bitmis ders bekleyebilir; ilk ogeyle calisilir.
    const bolge = page.getByRole('region', { name: 'Dersin nasıldı?' });
    await expect(bolge).toBeVisible();
    const kart = bolge.getByTestId('geri-bildirim-ogesi').first();
    await expect(kart.getByText('Bugünkü ders nasıldı?')).toBeVisible();
    await kart.getByRole('button', { name: 'Kısmen' }).click();
    await expect(kart.getByText(/Teşekkürler, öğretmenin görecek/)).toBeVisible();
    await expect(kart.getByRole('button', { name: 'Kısmen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Degistirme + istege bagli ayrinti.
    await kart.getByRole('button', { name: 'Anlamadım' }).click();
    await expect(kart.getByRole('button', { name: 'Anlamadım' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await kart.getByRole('button', { name: 'Zorlandığın konuyu ya da not ekle' }).click();
    await kart.getByLabel('Not (isteğe bağlı)').fill('Üslü ifadeler karıştı');
    await kart.getByRole('button', { name: 'Ayrıntıyı kaydet' }).click();
    await expect(kart.getByText('Ayrıntı da kaydedildi.')).toBeVisible();
  });

  test('ogretmen: ders detayinda ogrenci geri bildirimlerini gorur', async ({ page }) => {
    await girisYap(page, 'Ege');
    await menu(page, 'Takvim');
    await page
      .getByRole('button', { name: /Denklemler/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    const bolum = dialog.getByRole('region', { name: 'Öğrenci geri bildirimleri' });
    await expect(bolum).toBeVisible();
    await expect(bolum.getByText('Ayşe Demir')).toBeVisible();
    await expect(bolum.getByText('Mehmet Öztürk')).toBeVisible();
    // Yuzdeler ve etiketler renge dayanmaz.
    await expect(bolum.getByText('Anlamadım').first()).toBeVisible();
    // Ogrenci kendi cevabini mock'ta ayri kurumda verdi; seed ozeti en az 4 cevap icerir.
    await expect(bolum.getByText(/öğrenciden \d+ tanesi cevapladı/)).toBeVisible();
  });

  test('yonetici: grup sayfasinda materyal ekler', async ({ page }) => {
    await girisYap(page, 'Mavi');
    await menu(page, 'Gruplar');
    await page
      .getByRole('link', { name: /9-A Sınıfı/ })
      .first()
      .click();
    const bolum = page.getByRole('region', { name: 'Materyaller' });
    await expect(bolum).toBeVisible();
    await bolum.getByRole('button', { name: 'Materyal ekle' }).click();
    const form = bolum.getByRole('form', { name: 'Materyal ekle' });
    await form.getByLabel('Bağlantılar').fill(`https://www.youtube.com/watch?v=${AYRAC}`);
    await form.getByLabel('Kimler görsün?').selectOption('ogretmen');
    await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bolum.getByText('1 materyal eklendi.')).toBeVisible();
    await expect(bolum.getByText('YouTube materyali')).toBeVisible();
    await expect(bolum.getByText('Yalnız öğretmen').first()).toBeVisible();
  });

  test('yonetici: Kayitlar sayfasi suzgecle listeler; ozet sayfasi oranlari gosterir', async ({
    page,
  }) => {
    await girisYap(page, 'Mavi');
    await menu(page, 'Kayıtlar');
    await expect(page.getByRole('heading', { name: 'Kayıtlar', level: 1 })).toBeVisible();
    await expect(page.getByText('Denklemler: Zoom kaydı')).toBeVisible();
    await page.getByLabel('Tür').selectOption('materyal');
    await expect(page.getByText('Denklemler: Zoom kaydı')).toHaveCount(0);
    await expect(page.getByText('Üslü sayılar konu anlatımı')).toBeVisible();
    await page.getByLabel('Durum').selectOption('bozuk');
    await expect(page.getByText('Bu süzgeçlere uyan kayıt yok')).toBeVisible();

    await menu(page, 'Geri bildirim');
    await expect(
      page.getByRole('heading', { name: 'Geri bildirim özeti', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/Toplam \d+ geri bildirim/)).toBeVisible();
    await expect(page.getByRole('table', { name: 'Öğretmenlere göre' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Branşlara göre' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^%\d+/ }).first()).toBeVisible();
    await page.getByLabel('Başlangıç tarihi').fill('2999-01-01');
    await page.getByLabel('Bitiş tarihi').fill('2999-01-05');
    await expect(page.getByText('Bu aralıkta geri bildirim yok')).toBeVisible();
  });

  test('ogretmen: ogrenci kartinda son geri bildirimler; ozet sayfasini gormez', async ({
    page,
  }) => {
    await girisYap(page, 'Ege');
    await expect(
      page
        .getByRole('navigation', { name: 'Ana menü' })
        .getByRole('link', { name: 'Geri bildirim' }),
    ).toHaveCount(0);
    await menu(page, 'Finans');
    await page
      .getByRole('link', { name: /Çağlar Yıldız/ })
      .first()
      .click();
    const kart = page.getByRole('region', { name: 'Son geri bildirimler' });
    await expect(kart).toBeVisible();
    await expect(kart.getByText('Kısmen').first()).toBeVisible();
  });
});

test.describe('erisilebilirlik ve yerlesim', () => {
  test('Kayitlarim: ihlal yok, yatay tasma yok, klavyeyle satir acilir', async ({ page }) => {
    await girisYap(page, 'Atlas');
    await page.goto('/kurum-atlas/kayitlarim');
    await expect(page.getByRole('heading', { name: 'Kayıtlarım', level: 1 })).toBeVisible();
    await expect(page.getByTestId('kayit-satiri').first()).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(tasma).toBeLessThanOrEqual(0);

    const dugme = page.getByTestId('kayit-satiri').first().getByRole('button').first();
    await dugme.focus();
    await page.keyboard.press('Enter');
    await expect(dugme).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: /Kaydı aç/ }).first()).toBeVisible();
    expect(await ihlaller(page)).toEqual([]);
  });

  test('Kayitlar ve Geri bildirim ozeti: ihlal yok, yatay tasma yok', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Menu yolu masaustu icin');
    await girisYap(page, 'Kuzey');
    for (const [ad, baslik] of [
      ['Kayıtlar', 'Kayıtlar'],
      ['Geri bildirim', 'Geri bildirim özeti'],
    ] as const) {
      await menu(page, ad);
      await expect(page.getByRole('heading', { name: baslik, level: 1 })).toBeVisible();
      expect(await ihlaller(page)).toEqual([]);
    }
  });
});
