import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { girisYap } from './yardimcilar';

/**
 * Mock modda motivasyon ekranlari: karakter secimi, yuva, odak, XP geri bildirimi (ogrenci `Atlas`);
 * haftanin yildizi, seri duraklatma, ogrenci ozeti (ogretmen `Ege`); modul kapali (yonetici `Mavi`).
 * Mock veri sunucu surecinde ortaktir; durumlu testler yalniz masaustu projesinde ve sirayla calisir.
 * Mobil projesi yalniz durumdan bagimsiz duzen ve erisilebilirlik denetimlerini yapar.
 */

const IST = 'Europe/Istanbul';
function tarih(gun = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(
    new Date(Date.now() + gun * 86_400_000),
  );
}
function haftaGunu(gun: number): string {
  const no = (new Date(`${tarih()}T00:00:00Z`).getUTCDay() + 6) % 7;
  return tarih(gun - no);
}
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

test.describe('ogrenci', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('karakter secer (uygunsuz ad anlasilir hata verir), yuvayi gorur', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    // Bugun: karakter henuz secilmemis, secime davet edilir.
    const kart = page.getByRole('region', { name: 'Yol arkadaşın' });
    await expect(kart.getByText('Henüz bir yol arkadaşın yok.')).toBeVisible();
    await kart.getByRole('link', { name: 'Yol arkadaşını seç' }).click();

    await expect(page.getByRole('heading', { name: 'Yol arkadaşını seç', level: 1 })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Kıvılcım/ })).toBeChecked();
    // Secilen turun 5 asamasi onizlenir.
    const onizleme = page.getByRole('region', { name: /nasıl büyür/ });
    await expect(onizleme.getByRole('listitem')).toHaveCount(5);
    await page.getByRole('radio', { name: /Dinamo/ }).check({ force: true });
    await expect(page.getByRole('region', { name: 'Dinamo nasıl büyür?' })).toBeVisible();
    await axeIkiTema(page);

    // Uygunsuz ad: sunucu 422 verir, hata anlasilir ve ad alaninda kalinir.
    await page.getByLabel('Yol arkadaşının adı').fill('Hitler');
    await page.getByRole('button', { name: 'Bu arkadaşı seç' }).click();
    await expect(page.getByText(/Bu ad kullanılamıyor/)).toBeVisible();
    await page.getByLabel('Yol arkadaşının adı').fill('Pamuk');
    await page.getByRole('button', { name: 'Bu arkadaşı seç' }).click();

    await expect(page.getByRole('heading', { name: 'Yuva', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pamuk', level: 2 })).toBeVisible();
    await expect(page.getByTestId('seviye')).toHaveText(/^Seviye \d+$/);
    await expect(page.getByRole('img', { name: /Dinamo, aşama 2/ }).first()).toBeVisible();
  });

  test('yuva: seviye, radar, seri takvimi, rozetler, kostum dolabi, hareketler, yildizlar', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Karakterim', 'Yuva');
    // Seviye ve ilerleme cubugu.
    await expect(page.getByTestId('toplam-xp')).toHaveText(/^\d+ XP$/);
    await expect(
      page.getByRole('progressbar', { name: 'Sonraki seviyeye ilerleme' }),
    ).toBeVisible();
    await expect(page.getByText(/Seviye \d+ için \d+ XP kaldı/)).toBeVisible();

    // Radar: gorsel gizli, 5 beceri okunabilir listede.
    await expect(page.getByTestId('radar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('radar-liste').getByRole('listitem')).toHaveCount(5);
    await expect(page.getByTestId('radar-liste')).toContainText('Sayısal');

    // Seri: alev + 35 gunluk takvim; suclayan dil yok.
    await expect(page.getByTestId('seri-mesaji')).toHaveText(/^1[56] günlük serindesin$/);
    await expect(page.locator('[data-durum]')).toHaveCount(35);
    await expect(page.locator('[data-durum="dondurma"]')).toHaveAttribute(
      'aria-label',
      /Dondurma kullanıldı/,
    );
    await expect(page.locator('[data-durum="duraklatma"]').first()).toHaveAttribute(
      'aria-label',
      /Öğretmenin arası/,
    );
    await expect(page.getByText(/kaçırdın/i)).toHaveCount(0);

    // Rozetler: kazanilan ve kilitli (ilerlemeli); gizli rozet listelenmez.
    await expect(page.getByTestId('rozet-kazanilan')).toContainText('Bir Haftalık Seri');
    await expect(page.getByTestId('rozet-kilitli')).toContainText('Bir Aylık Seri');
    await expect(page.getByTestId('rozet-kilitli')).toContainText('23 / 30');
    await expect(page.getByText('Yüz Saat Odak')).toHaveCount(0);

    // Kostum dolabi: kusan / cikar; kilitli olanin kosulu yazili.
    await expect(page.getByText('100 günlük seriye ulaşınca açılır.')).toBeVisible();
    await page.getByRole('button', { name: 'Kasket kostümünü giydir' }).click();
    await expect(page.getByRole('button', { name: 'Kasket kostümünü çıkar' })).toBeVisible();
    await expect(page.getByTestId('kusanim-sapka')).toBeVisible();
    await page.getByRole('button', { name: 'Kasket kostümünü çıkar' }).click();
    await expect(page.getByRole('button', { name: 'Kasket kostümünü giydir' })).toBeVisible();
    await expect(page.getByTestId('kusanim-sapka')).toHaveCount(0);

    await expect(page.getByTestId('hareketler').getByRole('listitem').first()).toBeVisible();
    await expect(page.getByTestId('yildizlarim')).toContainText('Öğretmenin notu');
    await axeIkiTema(page);
  });

  test('odak: sekme yenilenince oturum surer, erken bitirilebilir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Odak', 'Odak');
    await page.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByRole('heading', { name: 'Odak oturumu sürüyor' })).toBeVisible();
    await expect(page.getByTestId('odak-sayac')).toHaveText(/^2[45]:\d\d$/);
    await axeIkiTema(page);

    // Sekme kapatilip acilinca sunucudaki acik oturum surdurulur.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Odak oturumu sürüyor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Başlat' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Yarıda bırak' }).click();
    await expect(page.getByRole('heading', { name: 'Oturumu erken bitirdin' })).toBeVisible();
    await expect(page.getByTestId('odak-sonuc')).toContainText('0 dakika odaklandın ve 0 XP');
    await page.getByRole('button', { name: 'Yeni oturum' }).click();
    await expect(page.getByRole('button', { name: 'Başlat' })).toBeVisible();
  });

  test('odak: serbest sure bitince +XP ucar, seviye atlayinca kutlama acilir', async ({ page }) => {
    await page.clock.install();
    await girisYap(page, 'Atlas Etüt Merkezi');
    // Yuva: sonraki seviyeye kalan XP okunur; odak suresi onu asacak sekilde secilir (en az 5 dk).
    await git(page, 'Karakterim', 'Yuva');
    const kalanMetni = await page.getByText(/Seviye \d+ için \d+ XP kaldı/).textContent();
    const kalan = Number(/için (\d+) XP/.exec(kalanMetni ?? '')?.[1]);
    const dk = Math.min(180, Math.max(5, kalan));

    await git(page, 'Odak', 'Odak');
    await page.getByRole('radio', { name: /Serbest/ }).check({ force: true });
    await page.getByLabel('Süre (dakika)').fill(String(dk));
    await page.getByLabel(/Ne üzerinde çalışacaksın/).selectOption({ label: 'Matematik' });
    await page.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByTestId('odak-sayac')).toHaveText(/^(\d+:)?\d\d:\d\d$/);

    await page.clock.fastForward(dk * 60_000 + 2000);
    await expect(page.getByRole('heading', { name: 'Süre doldu' })).toBeVisible();
    await expect(page.getByTestId('odak-sayac')).toHaveText('00:00');
    await page.getByRole('button', { name: 'Oturumu bitir' }).click();
    await expect(page.getByRole('heading', { name: 'Oturumu tamamladın' })).toBeVisible();
    await expect(page.getByTestId('odak-sonuc')).toContainText(
      `${String(dk)} dakika odaklandın ve ${String(dk)} XP`,
    );
    // Merkezi XP geri bildirimi: ucan rozet ve seviye atlama kutlamasi.
    await expect(page.getByTestId('xp-rozeti')).toHaveText(`+${String(dk)} XP`);
    const kutlama = page.getByRole('dialog');
    // Kalan XP 180 dk sinirini asmiyorsa oturum seviye atlatir.
    if (kalan <= 180) {
      await expect(kutlama.getByRole('heading', { name: /^Seviye \d+!$/ })).toBeVisible();
      await kutlama.getByRole('button', { name: 'Harika' }).click();
      await expect(kutlama).toHaveCount(0);
    }
    await expect(page.getByText('Son oturumların')).toBeVisible();
  });

  test('plan gorevi +XP ucurur; azaltilmis harekette animasyon yok, bugun karti guncellenir', async ({
    page,
  }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await git(page, 'Haftalık planım', 'Haftalık planım');
    const cuma = page.getByRole('listitem', { name: gunEtiketi(haftaGunu(4)) });
    await cuma.getByLabel('Matematik: yapılan soru').fill('13');
    await cuma.getByRole('button', { name: 'Matematik gerçekleşenini kaydet' }).click();
    await expect(page.getByTestId('xp-rozeti')).toHaveText('+5 XP');

    // Azaltilmis hareket: ayni rozet, animasyon sinifi yok.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Haftalık planım', level: 1 })).toBeVisible();
    const cuma2 = page.getByRole('listitem', { name: gunEtiketi(haftaGunu(4)) });
    await cuma2.getByLabel('Matematik: yapılan soru').fill('14');
    await cuma2.getByRole('button', { name: 'Matematik gerçekleşenini kaydet' }).click();
    const rozet = page.getByTestId('xp-rozeti');
    await expect(rozet).toHaveText('+5 XP');
    await expect(rozet).not.toHaveClass(/xp-uc/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Bugun: karakter, seri alevi, gunun hedef cubugu (plan hedefi tamam) ve bugunku XP.
    await menu(page).getByRole('link', { name: 'Bugün', exact: true }).click();
    const bugun = page.getByRole('region', { name: 'Yol arkadaşın' });
    await expect(bugun.getByText('Pamuk')).toBeVisible();
    await expect(bugun.getByTestId('bugun-seviye')).toHaveText(/^Seviye \d+$/);
    await expect(bugun.getByText(/Bugün \d+ XP kazandın/)).toBeVisible();
    await expect(bugun.getByText('16 günlük serindesin')).toBeVisible();
    await expect(bugun.getByRole('status')).toContainText('Bugünkü hedefini tamamladın');
    await expect(bugun.getByRole('progressbar')).toHaveCount(4);
    await axeIkiTema(page);
  });
});

test.describe('ogretmen', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Durumlu mock veri: yalniz masaustu projesi');

  test('haftanin yildizi verir (hak, 409 mesajlari), seri duraklatir ve iptal eder', async ({
    page,
  }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await page.getByRole('link', { name: 'Gruplar' }).first().click();
    await page.getByRole('link', { name: /9-A Sınıfı/ }).click();

    const yildiz = page.getByRole('region', { name: 'Haftanın yıldızı' });
    await expect(yildiz).toBeVisible();
    await expect(yildiz.getByText('Kalan hak: 3 / 3')).toBeVisible();
    await axeIkiTema(page);

    await yildiz.getByLabel('Öğrenci').selectOption({ label: 'Ayşe Demir' });
    await yildiz.getByLabel(/Gerekçe/).fill('Ödevlerini hiç aksatmadı.');
    await yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' }).click();
    await expect(yildiz.getByText('Ayşe Demir haftanın yıldızı seçildi (+50 XP).')).toBeVisible();
    await expect(yildiz.getByText('Kalan hak: 2 / 3')).toBeVisible();
    await expect(yildiz.getByTestId('verilen-yildizlar')).toContainText(
      'Ödevlerini hiç aksatmadı.',
    );

    // Ayni ogrenci ayni hafta ikinci kez: 409 anlasilir mesaj.
    await yildiz.getByLabel('Öğrenci').selectOption({ label: 'Ayşe Demir' });
    await yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' }).click();
    await expect(yildiz.getByRole('alert')).toContainText(
      'Bu öğrenci bu hafta zaten haftanın yıldızı seçildi.',
    );

    // Haftalik hak biter: 3. yildizdan sonra form kapanir ve neden yazilir.
    for (const ad of ['Çağlar Yıldız', 'Elif Şahin']) {
      await yildiz.getByLabel('Öğrenci').selectOption({ label: ad });
      await yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' }).click();
      await expect(yildiz.getByText(`${ad} haftanın yıldızı seçildi (+50 XP).`)).toBeVisible();
    }
    await expect(yildiz.getByText('Kalan hak: 0 / 3')).toBeVisible();
    await expect(yildiz.getByText(/hakkını kullandın/).first()).toBeVisible();
    await expect(yildiz.getByRole('button', { name: 'Haftanın yıldızı yap' })).toBeDisabled();

    // Seri duraklatma: tarih araligi dogrulanir, eklenir, listelenir, iptal edilir.
    const dur = page.getByRole('region', { name: 'Seri duraklatma' });
    await dur.getByLabel('Başlangıç').fill(tarih(1));
    await dur.getByLabel('Bitiş').fill(tarih(40));
    await dur.getByRole('button', { name: 'Duraklatma ekle' }).click();
    await expect(dur.getByText('Duraklatma en çok 31 gün olabilir.')).toBeVisible();
    await dur.getByLabel('Bitiş').fill(tarih(10));
    await dur.getByLabel(/Neden/).fill('Ara tatil');
    await dur.getByRole('button', { name: 'Duraklatma ekle' }).click();
    await expect(dur.getByText(/için seri duraklatıldı\./)).toBeVisible();
    const liste = dur.getByTestId('duraklatmalar');
    await expect(liste.getByRole('listitem')).toHaveCount(1);
    await expect(liste).toContainText('Ara tatil');

    // Cakisan aralik: 409.
    await dur.getByLabel('Başlangıç').fill(tarih(5));
    await dur.getByLabel('Bitiş').fill(tarih(8));
    await dur.getByRole('button', { name: 'Duraklatma ekle' }).click();
    await expect(dur.getByRole('alert')).toContainText('zaten bir duraklatma var');

    await dur.getByRole('button', { name: /duraklatmasını iptal et/ }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Duraklatmayı iptal et' })
      .click();
    await expect(dur.getByText('Duraklatma iptal edildi.')).toBeVisible();
    await expect(dur.getByText('Bu grup için etkin bir duraklatma yok.')).toBeVisible();
    await axeIkiTema(page);
  });

  test('ogrenci motivasyon ozetini gorur (seviye, radar, seri, rozet)', async ({ page }) => {
    await girisYap(page, 'Ege Işık Dershanesi');
    await menu(page).getByRole('link', { name: 'Öğrenciler', exact: true }).click();
    await page.getByRole('link', { name: 'Ayşe Demir motivasyon özeti' }).click();
    await expect(page.getByRole('heading', { name: 'Ayşe Demir', level: 1 })).toBeVisible();
    const ozet = page.getByTestId('ogrenci-ozeti');
    await expect(ozet).toBeVisible();
    await expect(ozet.getByText('Seviye', { exact: true })).toBeVisible();
    await expect(ozet.getByText('Rozet', { exact: true })).toBeVisible();
    await expect(ozet.getByTestId('radar-liste').getByRole('listitem')).toHaveCount(5);
    await axeIkiTema(page);
  });

  test('oyunlastirma kapaliyken motivasyon arayuzu gizlenir', async ({ page }) => {
    await girisYap(page, 'Mavi Kule Kurs Merkezi');
    await menu(page).getByRole('link', { name: 'Öğrenciler', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Öğrenciler', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /motivasyon özeti/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Gruplar' }).first().click();
    await page.getByRole('link', { name: /9-A Sınıfı/ }).click();
    await expect(page.getByRole('heading', { name: '9-A Sınıfı', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Haftanın yıldızı' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Seri duraklatma' })).toHaveCount(0);
  });
});

test.describe('duzen (masaustu ve mobil)', () => {
  test('yuva ya da secim ekrani tasmaz ve erisilebilir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(page.url().replace(/\/bugun$/, '/karakterim'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Yuva|Yol arkadaşını seç/);
    await page.waitForTimeout(400);
    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(tasma).toBeLessThanOrEqual(1);
    await axeIkiTema(page);
  });

  test('odak ekrani tasmaz ve erisilebilir', async ({ page }) => {
    await girisYap(page, 'Atlas Etüt Merkezi');
    await page.goto(page.url().replace(/\/bugun$/, '/odak'));
    await expect(page.getByRole('heading', { name: 'Odak', level: 1 })).toBeVisible();
    await page.waitForTimeout(400);
    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(tasma).toBeLessThanOrEqual(1);
    await axeIkiTema(page);
  });
});
