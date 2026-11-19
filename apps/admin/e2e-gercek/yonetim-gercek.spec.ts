import { expect, test } from '@playwright/test';

import { ekran, epostaIleGir, ikinciAdimKur, menuGit, ortam, yeniKod } from './yardimcilar';

/** İlk testte kurulan yönetici 2FA anahtarı (testler sırayla ve aynı süreçte çalışır). */
let yoneticiSir = '';

/**
 * Gerçek api + motivasyon ile panel akışları (mock kapalı). Önkoşul: `scripts/gercek-akis.sh`.
 * Ekran görüntüleri `docs/ekranlar/` altına yazılır.
 */
test.describe.configure({ mode: 'serial' });

test('yönetici: giriş → 2FA → kurum → modül → denetim → taklit → sağlık → mesaj', async ({
  page,
}) => {
  const yonetici = ortam('GERCEK_YONETICI');
  const parola = ortam('GERCEK_PAROLA');
  const kurum = ortam('GERCEK_KURUM1');

  await page.goto('/giris');
  await expect(page.getByRole('heading', { name: 'Platform girişi' })).toBeVisible();
  await ekran(page, 'giris');

  await epostaIleGir(page, yonetici, parola);

  // 2FA olmadan müfredat/motivasyon uçları servislerde kapalı (`plat_2fa_exp` yok; BFF ek kapı koymaz).
  const motivasyon = await page.request.get('/api/platform/motivasyon/ayarlar');
  expect(motivasyon.status()).toBe(403);
  expect(((await motivasyon.json()) as { error: { code: string } }).error.code).toBe(
    'ikinci_adim_gerekli',
  );
  const kurumlarOnce = await page.request.get('/api/platform/kurumlar');
  expect(kurumlarOnce.status()).toBe(403);
  await page.goto('/kurumlar');
  await expect(page).toHaveURL(/\/dogrulama$/);

  yoneticiSir = await ikinciAdimKur(page, 'ikinci-adim-kurulum');
  await ekran(page, 'kurum-listesi');

  // Kurum ara → detay
  await page.getByLabel('Kurum ara').fill(kurum);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  const tablo = page.getByRole('region', { name: 'Kurum listesi' });
  await expect(tablo.getByRole('link', { name: kurum })).toBeVisible();
  await ekran(page, 'kurum-arama');
  await tablo.getByRole('link', { name: kurum }).click();
  await expect(page.getByRole('heading', { name: kurum, level: 1 })).toBeVisible();
  await expect(page.getByText('Aktif üye')).toBeVisible();
  await ekran(page, 'kurum-detay');

  // Modül kapat: neden zorunlu
  await page.getByRole('button', { name: 'Kapat: Takvim' }).click();
  const pencere = page.getByRole('dialog');
  await pencere.getByLabel(/Neden/).fill('Müşteri talebiyle geçici kapatma (panel denemesi)');
  await ekran(page, 'modul-kapat-onay', { tamSayfa: false });
  await pencere.getByRole('button', { name: 'Onayla' }).click();
  await expect(page.getByText('Değişiklik kaydedildi ve denetim kaydına yazıldı.')).toBeVisible();
  await expect(
    page.getByRole('row', { name: /Takvim/ }).getByText('Kapalı', { exact: true }),
  ).toBeVisible();

  // Geri aç (kurum ayarını sil: varsayılana dön)
  await page.getByRole('button', { name: 'Varsayılana döndür: Takvim' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Deneme bitti, varsayılana dönüş');
  await page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
  await expect(
    page.getByRole('row', { name: /Takvim/ }).getByText('Açık', { exact: true }),
  ).toBeVisible();

  // Beta bayrağı
  await page.getByLabel('Özellik kodu').fill('pilot_ekran');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Pilot kurum beta erişimi');
  await page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
  await expect(page.getByText('pilot_ekran', { exact: true })).toBeVisible();
  await ekran(page, 'kurum-detay-beta');

  // Denetimde gör
  await menuGit(page, 'Denetim kayıtları');
  await page.getByLabel('Eylem', { exact: true }).fill('platform.modul_ayarla');
  await page.getByRole('button', { name: 'Süz' }).click();
  const denetim = page.getByRole('region', { name: 'Denetim kayıtları' });
  await expect(
    denetim.getByText('Müşteri talebiyle geçici kapatma (panel denemesi)'),
  ).toBeVisible();
  await ekran(page, 'denetim-modul');
  await page.getByRole('button', { name: 'Temizle' }).click();
  await expect(
    denetim.locator('code', { hasText: 'platform.ikinci_adim_onayla' }).first(),
  ).toBeVisible();
  await ekran(page, 'denetim-tumu');

  // Taklit: hedef kurumun sahibi, salt okunur okumalar, sonlandır
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('link', { name: 'Kurumlar' })
    .click();
  await page.getByLabel('Kurum ara').fill(kurum);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await page.getByRole('link', { name: kurum }).click();
  await page.getByRole('button', { name: 'Taklit başlat' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Müşteri şikayetini incelemek için');
  await page.getByRole('dialog').getByRole('button', { name: 'Taklidi başlat' }).click();
  await expect(page).toHaveURL(/\/taklit$/);
  await expect(page.getByRole('timer')).toHaveText(/^1[45]:\d\d$/);
  await page.getByRole('button', { name: 'Kimlik (hesap/ben)' }).click();
  await expect(page.getByLabel('Sonuç')).toContainText('kullanici');
  await page.getByRole('button', { name: 'Etkin modüller' }).click();
  await expect(page.getByLabel('Sonuç')).toContainText('moduller');
  await ekran(page, 'taklit');
  await page.getByRole('button', { name: 'Taklidi sonlandır' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Taklidi sonlandır' }).click();
  await expect(page.getByText('Etkin taklit oturumu yok.')).toBeVisible();
  // Sonlanmış belirteçle okuma artık yapılamaz (cerez silindi)
  const okuma = await page.request.get('/api/taklit/okuma/hesap/ben');
  expect(okuma.status()).toBe(404);

  // Sistem sağlığı
  await menuGit(page, 'Sistem sağlığı');
  await expect(page.getByRole('heading', { name: 'Olay kutusu (outbox)' })).toBeVisible();
  await expect(page.getByText('Bekleyen olay')).toBeVisible();
  await ekran(page, 'saglik');

  // Bakım mesajı: yayınla, kimliksiz uçtan oku, iptal et
  await menuGit(page, 'Bakım ve duyurular');
  await page.getByLabel('Başlık').fill('Planlı bakım');
  await page.getByLabel('Metin').fill('Cumartesi 02:00-03:00 arası kısa bir bakım yapılacak.');
  await page.getByLabel('Önem').selectOption('uyari');
  await page.getByLabel('Bitiş', { exact: true }).fill('2031-01-01T10:00');
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yayınla', exact: true }).click();
  await expect(page.getByText('Mesaj yayınlandı.')).toBeVisible();
  const herkese = await page.request.get(`${ortam('GERCEK_API_URL')}/v1/platform-mesaji`);
  expect(((await herkese.json()) as { mesaj: { baslik: string } | null }).mesaj?.baslik).toBe(
    'Planlı bakım',
  );
  await ekran(page, 'mesajlar');
  await page.getByRole('button', { name: 'İptal et: Planlı bakım' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'İptal et' }).click();
  await expect(page.getByText('Mesaj kaldırıldı.')).toBeVisible();
});

test('belirteç: 2FA sonrası /auth/token plat_2fa_exp taşır; öncesinde servisler 403 verir', async () => {
  const api = ortam('GERCEK_API_URL');
  const mot = ortam('GERCEK_MOTIVASYON_URL');
  const json = { 'content-type': 'application/json' };
  const giris = await fetch(`${api}/auth/eposta/giris`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ eposta: ortam('GERCEK_BELIRTEC'), parola: ortam('GERCEK_PAROLA') }),
  });
  const oturum = ((await giris.json()) as { oturum_belirteci: string }).oturum_belirteci;
  const token = async () => {
    const r = await fetch(`${api}/auth/token`, {
      method: 'POST',
      headers: { ...json, authorization: `Bearer ${oturum}` },
      body: '{}',
    });
    const jwt = ((await r.json()) as { access_token: string }).access_token;
    const claims = JSON.parse(
      Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString(),
    ) as Record<string, unknown>;
    return { jwt, claims };
  };
  const bearer = (jwt: string) => ({ ...json, authorization: `Bearer ${jwt}` });

  const once = await token();
  expect(once.claims.plat).toBe('yonetici');
  expect(once.claims.plat_2fa_exp).toBeUndefined();
  const motOnce = await fetch(`${mot}/platform/motivasyon/ayarlar`, { headers: bearer(once.jwt) });
  expect(motOnce.status).toBe(403);
  expect(((await motOnce.json()) as { error: { code: string } }).error.code).toBe(
    'ikinci_adim_gerekli',
  );
  const mufOnce = await fetch(`${api}/platform/mufredat/kataloglar`, { headers: bearer(once.jwt) });
  expect(mufOnce.status).toBe(403);
  expect(((await mufOnce.json()) as { error: { code: string } }).error.code).toBe(
    'ikinci_adim_gerekli',
  );

  const kur = (await (
    await fetch(`${api}/platform/ikinci-adim/kur`, {
      method: 'POST',
      headers: bearer(once.jwt),
      body: '{}',
    })
  ).json()) as { sir: string };
  const onayla = await fetch(`${api}/platform/ikinci-adim/onayla`, {
    method: 'POST',
    headers: bearer(once.jwt),
    body: JSON.stringify({ kod: await yeniKod(kur.sir) }),
  });
  expect(onayla.status).toBe(200);

  const sonra = await token();
  expect(typeof sonra.claims.plat_2fa_exp).toBe('number');
  expect(sonra.claims.plat_2fa_exp as number).toBeGreaterThan(Date.now() / 1000);
  expect(
    (await fetch(`${mot}/platform/motivasyon/ayarlar`, { headers: bearer(sonra.jwt) })).status,
  ).toBe(200);
  expect(
    (await fetch(`${api}/platform/mufredat/kataloglar`, { headers: bearer(sonra.jwt) })).status,
  ).toBe(200);
});

test('yönetici: abonelik düzeltmesi ve platform askısı', async ({ page }) => {
  const kurum = ortam('GERCEK_KURUM2');
  await epostaIleGir(page, ortam('GERCEK_YONETICI'), ortam('GERCEK_PAROLA'));
  await page.getByLabel('Doğrulama kodu').fill(await yeniKod(yoneticiSir));
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);
  await page.getByLabel('Kurum ara').fill(kurum);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await page.getByRole('link', { name: kurum }).click();

  const abonelik = page.getByRole('region', { name: 'Abonelik', exact: true });
  await expect(abonelik.getByText('Deneme', { exact: true }).first()).toBeVisible();
  await ekran(page, 'abonelik-ozet');

  // Denemeyi uzat
  await abonelik.getByRole('button', { name: 'Denemeyi uzat' }).click();
  await page.getByRole('dialog').getByLabel('Gün sayısı').fill('7');
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Müşteri talebi üzerine deneme uzatma');
  await ekran(page, 'abonelik-deneme-uzat-onay', { tamSayfa: false });
  await page.getByRole('dialog').getByRole('button', { name: 'Denemeyi uzat' }).click();
  await expect(page.getByText('Abonelik işlemi kaydedildi ve denetime yazıldı.')).toBeVisible();

  // Kurumsal aktivasyon
  await abonelik.getByRole('button', { name: 'Kurumsal aktivasyon' }).click();
  const akt = page.getByRole('dialog');
  await akt.getByLabel('Sözleşme numarası').fill('S-2026-0142');
  await akt.getByLabel(/Fiyat/).fill('4.999,00');
  await akt.getByLabel(/Neden/).fill('Teklif ve fatura ile kurumsal aktivasyon');
  await ekran(page, 'abonelik-kurumsal-onay', { tamSayfa: false });
  await akt.getByRole('button', { name: 'Kurumsal aktivasyon' }).click();
  await expect(abonelik.getByText('Kurumsal', { exact: true }).first()).toBeVisible();
  await expect(abonelik.getByText('Aktif', { exact: true }).first()).toBeVisible();
  await ekran(page, 'abonelik-kurumsal');

  // Aboneliği askıya al + platform askısı al/aç: abonelik kilitliyse kurum askıda kalır
  await abonelik.getByRole('button', { name: 'Aboneliği askıya al' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Ödeme anlaşmazlığı: abonelik askıda');
  await page.getByRole('dialog').getByRole('button', { name: 'Aboneliği askıya al' }).click();
  await expect(abonelik.getByText(/Abonelik kilitli/)).toBeVisible();

  const aski = page.getByRole('region', { name: 'Platform askısı', exact: true });
  await aski.getByRole('button', { name: 'Platform askısına al' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Platform askısı denemesi');
  await page.getByRole('dialog').getByRole('button', { name: 'Platform askısına al' }).click();
  await expect(page.getByText('Kurum platform askısına alındı.')).toBeVisible();
  await ekran(page, 'platform-aski');
  await aski.getByRole('button', { name: 'Askıyı aç' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Platform askısı denemesi bitti');
  await page.getByRole('dialog').getByRole('button', { name: 'Askıyı aç' }).click();
  await expect(page.getByText('Platform askısı kaldırıldı.')).toBeVisible();
  await expect(page.getByText(/Abonelik de kilitli/)).toBeVisible();
  await ekran(page, 'platform-aski-acildi-kilitli');

  // Düzelt: ek süre ver (kilitli abonelik yeniden yazılabilir olur)
  await abonelik.getByRole('button', { name: 'Ek süre ver' }).click();
  await page.getByRole('dialog').getByLabel('Gün sayısı').fill('5');
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Ödeme bekleniyor: ek süre tanındı');
  await page.getByRole('dialog').getByRole('button', { name: 'Ek süre ver' }).click();
  await expect(page.getByText('Abonelik işlemi kaydedildi ve denetime yazıldı.')).toBeVisible();
  await expect(abonelik.getByText('Ek süre', { exact: true }).first()).toBeVisible();
  await ekran(page, 'abonelik-ek-sure');

  // Denetimde abonelik işlemleri
  await menuGit(page, 'Denetim kayıtları');
  const denetim = page.getByRole('region', { name: 'Denetim kayıtları' });
  await expect(
    denetim.locator('code', { hasText: 'platform.abonelik_kurumsal_aktivasyon' }).first(),
  ).toBeVisible();
  await expect(
    denetim.locator('code', { hasText: 'platform.kurum_askiya_al' }).first(),
  ).toBeVisible();
  await ekran(page, 'denetim-abonelik');
});

test('yönetici: müfredat editörü (taslak → işlemler → fark → yayın)', async ({ page }) => {
  await epostaIleGir(page, ortam('GERCEK_YONETICI'), ortam('GERCEK_PAROLA'));
  // Aynı kullanıcı, yeni oturum: 2FA kuruluydu, kod girişi (aynı TOTP adımı tekrar kullanılamaz: sonraki adım)
  await page.getByLabel('Doğrulama kodu').fill(await yeniKod(yoneticiSir));
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);

  await menuGit(page, 'Müfredat editörü');
  await expect(page.getByRole('heading', { name: 'Müfredat editörü', level: 1 })).toBeVisible();
  await ekran(page, 'mufredat-kataloglar');
  await page.getByRole('link', { name: 'Aç: LGS' }).click();
  await page.getByRole('button', { name: 'Taslak aç' }).click();
  await page.getByRole('dialog').getByLabel('Taslak adı').fill('2026-2027 LGS (panel denemesi)');
  await page.getByRole('dialog').getByRole('button', { name: 'Taslak aç' }).click();
  await expect(page.getByText('Taslak açıldı.')).toBeVisible();

  // Ünite ekle
  const not = (metin: string) => page.getByRole('dialog').getByLabel('Değişiklik notu').fill(metin);
  await page.getByRole('button', { name: 'Konu ekle', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('Ad', { exact: true }).fill('Sayılar ve İşlemler');
  await page.getByRole('dialog').getByLabel('Branş kodu').fill('matematik');
  await page.getByRole('dialog').getByLabel('Sınıf seviyesi (5–12, isteğe bağlı)').fill('8');
  await not('Yeni müfredat ünitesi');
  await page.getByRole('dialog').getByRole('button', { name: 'Konu ekle', exact: true }).click();
  await expect(page.getByText('İşlem taslağa yazıldı.')).toBeVisible();
  await expect(page.getByText('Sayılar ve İşlemler')).toBeVisible();

  // Altına konu ekle
  await page.getByRole('button', { name: 'Konu ekle: Sayılar ve İşlemler' }).click();
  await page.getByRole('dialog').getByLabel('Ad', { exact: true }).fill('Üslü İfadeler');
  await not('Ünite altına konu');
  await page.getByRole('dialog').getByRole('button', { name: 'Konu ekle', exact: true }).click();
  await expect(page.getByText('Üslü İfadeler')).toBeVisible();

  // Adlandır
  await page.getByRole('button', { name: 'Yeniden adlandır: Üslü İfadeler' }).click();
  await page.getByRole('dialog').getByLabel('Yeni ad').fill('Üslü Sayılar');
  await not('Resmi adıyla düzeltildi');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Yeniden adlandır', exact: true })
    .click();
  await expect(page.getByText('Üslü Sayılar', { exact: true })).toBeVisible();
  await ekran(page, 'mufredat-agac');

  // Fark
  await page.getByRole('tab', { name: 'Fark' }).click();
  await expect(page.getByRole('heading', { name: 'Eklenen' })).toBeVisible();
  await ekran(page, 'mufredat-fark');

  // Yayın onayı
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/Taslakta \d+ işlem var\./)).toBeVisible();
  await ekran(page, 'mufredat-yayin-onay', { tamSayfa: false });
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Yayınla', exact: true }).click();
  await expect(page.getByText(/Sürüm yayınlandı\./)).toBeVisible();
  await expect(page.getByText(/Yayınlanmış sürüm salt okunur/)).toBeVisible();
  await ekran(page, 'mufredat-yayinlandi');
});

test('yönetici: motivasyon ayarları (düzenle → uyarı → doğrulama hatası → geri al)', async ({
  page,
}) => {
  await epostaIleGir(page, ortam('GERCEK_YONETICI'), ortam('GERCEK_PAROLA'));
  await page.getByLabel('Doğrulama kodu').fill(await yeniKod(yoneticiSir));
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);

  await menuGit(page, 'Motivasyon ayarları');
  await expect(page.getByText(/Geçerli sürüm: \d+/)).toBeVisible();
  const ilkSurum = Number(
    (await page.getByText(/Geçerli sürüm: \d+/).textContent())?.replace(/\D/g, '') ?? '1',
  );
  const kurallar = page.getByRole('region', { name: 'XP kuralları' });
  await expect(kurallar.getByRole('row', { name: /Yoklamada geldi/ })).toContainText('20');
  await ekran(page, 'motivasyon');

  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByLabel('Yoklamada geldi: XP').fill('5');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Panel denemesi: yoklama XP düşürüldü');
  await page.getByRole('dialog').getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(page.getByText(`Sürüm ${String(ilkSurum + 1)} kaydedildi.`)).toBeVisible();
  const uyari = page.getByRole('status').filter({ hasText: 'Uyarılar' });
  await expect(uyari).toBeVisible();
  await ekran(page, 'motivasyon-uyari');

  // Tavanı aşan değer: 422 ayar_gecersiz, alan bazında
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByLabel('Yoklamada geldi: XP').fill('450');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Panel denemesi: tavanı aşan değer');
  await page.getByRole('dialog').getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Ayar değerleri geçersiz.',
  );
  await ekran(page, 'motivasyon-dogrulama-hatasi', { tamSayfa: false });
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  // Geri al: ilk sürümün değerleri
  await page.getByRole('button', { name: `Bu sürüme geri al (${String(ilkSurum)})` }).click();
  await page.getByRole('dialog').getByLabel(/Neden/).fill('Panel denemesi: önceki değerlere dönüş');
  await page.getByRole('dialog').getByRole('button', { name: 'Bu sürüme geri al' }).click();
  await expect(
    page.getByText(
      new RegExp(`Sürüm ${String(ilkSurum)} değerleri yeni sürüm ${String(ilkSurum + 2)}`),
    ),
  ).toBeVisible();
  await expect(kurallar.getByRole('row', { name: /Yoklamada geldi/ })).toContainText('20');
  await ekran(page, 'motivasyon-geri-al');
});

test('görünüm: koyu tema ve mobil genişlik', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await epostaIleGir(page, ortam('GERCEK_YONETICI'), ortam('GERCEK_PAROLA'));
  await page.getByLabel('Doğrulama kodu').fill(await yeniKod(yoneticiSir));
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click();
  await expect(page).toHaveURL(/\/kurumlar$/);
  await expect(page.getByRole('link', { name: ortam('GERCEK_KURUM1') })).toBeVisible();
  await ekran(page, 'kurumlar-koyu');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: ortam('GERCEK_KURUM1') })).toBeVisible();
  const tasma = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(tasma).toBeLessThanOrEqual(0);
  await ekran(page, 'kurumlar-mobil');
});

test('destek rolü: salt okur; platform rolü olmayan hesap açık hata görür', async ({
  page,
  browser,
}) => {
  const parola = ortam('GERCEK_PAROLA');
  await epostaIleGir(page, ortam('GERCEK_DESTEK'), parola);
  await ikinciAdimKur(page);
  await menuGit(page, 'Kurumlar');
  const gezinme = page.getByRole('navigation', { name: 'Ana gezinme' });
  await expect(gezinme.getByRole('link', { name: 'Denetim kayıtları' })).toHaveCount(0);
  await page.getByLabel('Kurum ara').fill(ortam('GERCEK_KURUM1'));
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await page.getByRole('link', { name: ortam('GERCEK_KURUM1') }).click();
  await expect(page.getByText(/Destek rolü yalnızca okuyabilir/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Kapat: / })).toHaveCount(0);
  await ekran(page, 'destek-rolu');
  // Doğrudan yönetici ucu: api 403 platform_izin_yok
  const denetim = await page.request.get('/api/platform/denetim');
  expect(denetim.status()).toBe(403);
  expect(((await denetim.json()) as { error: { code: string } }).error.code).toBe(
    'platform_izin_yok',
  );

  const baglam = await browser.newContext();
  const sayfa = await baglam.newPage();
  await sayfa.goto(`${test.info().project.use.baseURL ?? ''}/giris`);
  await sayfa.getByRole('tab', { name: 'E-posta' }).click();
  await sayfa.getByLabel('E-posta adresi').fill(`sahip1-${ortam('GERCEK_RUN')}@example.com`);
  await sayfa.getByLabel('Parola').fill(parola);
  await sayfa.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(sayfa.getByRole('heading', { name: 'Platform yetkiniz yok' })).toBeVisible();
  await ekran(sayfa, 'yetki-yok');
  await baglam.close();
});
