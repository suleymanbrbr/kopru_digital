import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  benzersizTelefon,
  epostaDogrulandiMi,
  epostaKaydiVeBaglanti,
  kurumOlustur,
  ortamSorunu,
  otpSiniriniTemizle,
  sonOtpKodu,
} from './yardimcilar';

/**
 * Gercek `api`ya karsi hesap akislari:
 *  1. sahip kurum kurar, sinif olusturur, kod uretir; ikinci kullanici kodla katilir; sahip onaylar.
 *  2. sahip baglanti daveti uretir; ucuncu kullanici OTURUMSUZ baslar, giris + KVKK sonrasi kuruma girer.
 *  3. oturumlar listesinden diger oturum sonlandirilir; tum oturumlar kapatilinca girise donulur.
 * `EKRAN_KAYDET=<dizin>` verilirse ekran goruntuleri o dizine yazilir.
 */

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
});
test.beforeEach(async () => {
  if (atlamaNedeni === null) {
    await otpSiniriniTemizle();
    // `/auth/token` IP basina dakikada 60 istekle sinirli; her sayfa yuklemesi bir token ister.
    await new Promise((coz) => setTimeout(coz, 8000));
  }
});

async function otpGiris(page: Page, telefon: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  const kod = await sonOtpKodu(telefon);
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(kod);
}

async function kvkkOnayla(page: Page) {
  await expect(page).toHaveURL(/\/kvkk$/);
  await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click();
  await page.getByRole('button', { name: 'Kabul et ve devam et' }).click();
}

/** Sahip: giris, KVKK, api ile kurum, kurumu secip Bugun'e girer. Ikinci bir oturum da acilmis olur. */
async function sahipOlarakGir(page: Page, kurumAdi: string) {
  const telefon = benzersizTelefon();
  await otpGiris(page, telefon);
  await kvkkOnayla(page);
  await expect(page).toHaveURL(/\/kurum-sec$/, { timeout: 20_000 });
  await kurumOlustur(telefon, kurumAdi);
  await page.reload();
  await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
  return telefon;
}

async function yeniKullanici(browser: Browser, tema: 'light' | 'dark') {
  const baglam = await browser.newContext({ colorScheme: tema, locale: 'tr-TR' });
  return { baglam, sayfa: await baglam.newPage() };
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`gercek api hesap akislari (${tema})`, () => {
    test.beforeEach(() => {
      test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
    });

    const goruntuAl = (page: Page) => async (ad: string) => {
      const dizin = process.env.EKRAN_KAYDET;
      if (dizin) await page.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: true });
    };

    test('sinif kodu: sahip kod uretir, ikinci kullanici katilir, sahip onaylar', async ({
      page,
      browser,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      const goruntu = goruntuAl(page);
      const kurumAdi = `Kod Kurumu ${String(Date.now()).slice(-5)}`;
      await sahipOlarakGir(page, kurumAdi);

      // Gruplar: bos durum, sonra iki grup olustur.
      await page.getByRole('link', { name: 'Gruplar' }).first().click();
      await expect(page.getByRole('heading', { name: 'Gruplar', level: 1 })).toBeVisible();
      await expect(page.getByText('Henüz grup yok')).toBeVisible();

      for (const [ad, tur] of [
        ['9-A Sınıfı', 'Sınıf'],
        ['Matematik Etüdü', 'Etüt'],
      ] as const) {
        await page.getByRole('button', { name: 'Grup oluştur' }).first().click();
        const pencere = page.getByRole('dialog');
        await pencere.getByLabel('Grup adı').fill(ad);
        await pencere.getByLabel('Tür').selectOption({ label: tur });
        await pencere.getByRole('button', { name: 'Grup oluştur' }).click();
        await expect(page.getByRole('link', { name: new RegExp(ad) })).toBeVisible();
      }
      await expect(page.getByText(`"Matematik Etüdü" grubu oluşturuldu.`)).toBeVisible();
      await goruntu('gruplar');

      // Etut grubunda katilim kodu bolumu yoktur; sinifta kod uretilir.
      await page.getByRole('link', { name: /Matematik Etüdü/ }).click();
      await expect(page.getByRole('heading', { name: 'Matematik Etüdü', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Katılım kodu' })).toHaveCount(0);
      await page.getByRole('link', { name: 'Gruplara dön' }).click();

      await page.getByRole('link', { name: /9-A Sınıfı/ }).click();
      await expect(page.getByText('Etkin kod yok')).toBeVisible();
      await page.getByRole('button', { name: 'Kod üret' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Kod üret' }).click();
      const kodKutusu = page.getByTestId('katilim-kodu');
      await expect(kodKutusu).toBeVisible();
      const kod = ((await kodKutusu.textContent()) ?? '').replace(/\s/g, '');
      expect(kod).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);

      // Ikinci kullanici: kod kucuk harf ve bosluklu girilir.
      const ikinci = await yeniKullanici(browser, tema);
      const b = ikinci.sayfa;
      await otpGiris(b, benzersizTelefon());
      await kvkkOnayla(b);
      await expect(b).toHaveURL(/\/kurum-sec$/);
      await b.getByRole('link', { name: 'Sınıf koduyla katıl' }).first().click();
      await expect(b).toHaveURL(/\/sinif-kodu$/);
      const yanlis = b.getByLabel('Sınıf kodu');
      await yanlis.fill('ABCD0000');
      await b.getByRole('button', { name: 'İstek gönder' }).click();
      await expect(b.getByText('Kod 8 karakter olmalı')).toBeVisible();
      await yanlis.fill(`${kod.slice(0, 4).toLowerCase()} ${kod.slice(4).toLowerCase()}`);
      await b.getByRole('button', { name: 'İstek gönder' }).click();
      await expect(b.getByRole('status').filter({ hasText: 'öğretmenine iletildi' })).toBeVisible();
      await expect(b.getByText('9-A Sınıfı').first()).toBeVisible();

      // Sahip: bekleyen istek gorunur ve onaylanir.
      await page.reload();
      await expect(page.getByText('1 bekleyen istek')).toBeVisible();
      await goruntu('grup-detay');
      await page.getByRole('button', { name: /isteğini onayla/ }).click();
      await expect(page.getByText('sınıfa eklendi')).toBeVisible();
      await expect(page.getByText('Bekleyen istek yok.')).toBeVisible();
      await expect(page.getByText('1 öğrenci').first()).toBeVisible();
      await expect(page.getByText('Sınıf koduyla')).toBeVisible();

      // Ogrenci: onay gorunur ve kurum listesinde kurum belirir.
      await b.reload();
      await b.getByRole('button', { name: 'Kurum listesine dön' }).click();
      await expect(b).toHaveURL(/\/kurum-sec$/);
      await expect(b.getByRole('button', { name: new RegExp(kurumAdi) })).toBeVisible();
      await ikinci.baglam.close();
    });

    test('davet baglantisi: oturumsuz baslayan kullanici giris ve KVKK sonrasi kuruma girer', async ({
      page,
      browser,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      const goruntu = goruntuAl(page);
      const kurumAdi = `Davet Kurumu ${String(Date.now()).slice(-5)}`;
      await sahipOlarakGir(page, kurumAdi);

      await page.getByRole('link', { name: 'Öğrenciler' }).first().click();
      await expect(page.getByRole('heading', { name: 'Öğrenciler', level: 1 })).toBeVisible();
      await expect(page.getByText('Henüz davet yok')).toBeVisible();
      await page.getByRole('button', { name: 'Davet oluştur' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Daveti oluştur' }).click();
      const baglantiKutusu = page.locator('#davet-baglantisi');
      await expect(baglantiKutusu).toBeVisible();
      const baglanti = await baglantiKutusu.inputValue();
      expect(baglanti).toMatch(/\/davet\/.{20,}$/);
      await expect(page.getByText('yalnızca şimdi gösterilir')).toBeVisible();
      await goruntu('davet');
      await page.getByRole('button', { name: 'Tamam' }).click();
      await expect(page.locator('li').getByText('Bekliyor').first()).toBeVisible();

      // Toplu davet (SMS): biri gecerli, biri gecersiz telefon; satir bazli sonuc.
      await page.getByRole('button', { name: 'Toplu davet' }).click();
      const toplu = page.getByRole('dialog');
      await toplu
        .getByLabel('Kişiler')
        .fill(`Ayşe Demir, ${benzersizTelefon()}\nHatalı Satır, 123`);
      await toplu.getByRole('button', { name: '2 kişiyi davet et' }).click();
      await expect(toplu.getByText('1 başarılı, 1 hatalı')).toBeVisible();
      await toplu.getByRole('button', { name: 'Tamam' }).click();

      // Ucuncu kullanici: oturumsuz bagimsiz tarayici baglami.
      const ucuncu = await yeniKullanici(browser, tema);
      const c = ucuncu.sayfa;
      await c.goto(baglanti);
      await expect(c).toHaveURL(/\/giris$/);
      await otpGiris(c, benzersizTelefon());
      await kvkkOnayla(c);
      await expect(c).toHaveURL(/\/davet\/.+$/);
      await expect(c.getByRole('heading', { name: 'Kuruma davet edildin' })).toBeVisible();
      await expect(c.getByRole('button', { name: 'Daveti kabul et' })).toBeVisible();
      await goruntuAl(c)('davet-kabul');
      await c.getByRole('button', { name: 'Daveti kabul et' }).click();
      await expect(c).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
      await expect(c.getByText(kurumAdi).first()).toBeVisible();

      // Ayni baglanti tek kullanimlikti: tekrar acildiginda aciklayici ekran.
      await c.goto(baglanti);
      await c.getByRole('button', { name: 'Daveti kabul et' }).click();
      await expect(
        c.getByRole('heading', { name: /Bu davet geçerli değil|Bu kurumda zaten üyesin/ }),
      ).toBeVisible();
      await ucuncu.baglam.close();

      // Sahip: davet "Kabul edildi" olarak listelenir.
      await page.reload();
      await page.getByLabel('Durum süzgeci').selectOption({ label: 'Kabul edildi' });
      await expect(page.locator('li').getByText('Kabul edildi').first()).toBeVisible();
    });

    test('oturumlarim: diger oturum sonlandirilir, tum oturumlar kapatilinca girise donulur', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      const goruntu = goruntuAl(page);
      await sahipOlarakGir(page, `Oturum Kurumu ${String(Date.now()).slice(-5)}`);

      await page.getByRole('link', { name: 'Oturumlarım' }).first().click();
      await expect(page.getByRole('heading', { name: 'Oturumlarım', level: 1 })).toBeVisible();
      const satirlar = page.getByRole('listitem').filter({ hasText: 'Son kullanım' });
      await expect(satirlar).toHaveCount(2);
      await expect(page.getByText('Bu oturum', { exact: true })).toBeVisible();
      await goruntu('oturumlar');

      await page.getByRole('button', { name: /oturumunu sonlandır/ }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Oturumu sonlandır' })
        .click();
      await expect(satirlar).toHaveCount(1);
      await expect(page.getByText('Oturum sonlandırıldı.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Diğer tüm oturumları kapat' })).toBeDisabled();

      await page.getByRole('button', { name: 'Tüm oturumları kapat', exact: true }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Hepsini kapat ve çık' })
        .click();
      await expect(page).toHaveURL(/\/giris$/);
      await page.goto('/kurum-sec');
      await expect(page).toHaveURL(/\/giris$/);
    });

    test('e-posta dogrulama: baglanti web sayfasina gider, dogrular; gecersiz baglantida yeniden gonderme', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      const goruntu = goruntuAl(page);
      const eposta = `dogrula${String(Date.now())}${tema}@ornek.test`;
      const baglanti = await epostaKaydiVeBaglanti(eposta);
      expect(new URL(baglanti).pathname).toBe('/eposta-dogrula');
      expect(await epostaDogrulandiMi(eposta)).toBe(false);

      await page.goto(baglanti);
      await expect(page.getByRole('heading', { name: 'E-posta adresin doğrulandı' })).toBeVisible();
      await goruntu('eposta-dogrula');
      expect(await epostaDogrulandiMi(eposta)).toBe(true);

      // Bozuk baglanti: gecersiz ekran ve yeniden gonderme.
      await page.goto('/eposta-dogrula?belirtec=gecersiz-belirtec-xyz-123');
      await expect(
        page.getByRole('heading', { name: 'Bağlantı geçersiz ya da süresi dolmuş' }),
      ).toBeVisible();
      await page.getByLabel('E-posta adresin').fill(eposta);
      await page.getByRole('button', { name: 'Yeni bağlantı gönder' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'yeni bir doğrulama' }),
      ).toBeVisible();
    });
  });
}
