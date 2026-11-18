import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { benzersizTelefon, ortamSorunu, otpSiniriniTemizle, sonOtpKodu } from './yardimcilar';
import { api, belirtecAl, rizaKabul } from './yardimcilar-operasyon';

/**
 * Gercek `api` + gercek `bildirim` (+ iki worker, ayri NATS) ile duyuru akisi: kurum (tur `kurum`), grup, grup
 * atamali ogretmen ve iki ogrenci -> ogretmen web'de gruba duyuru yazar ve yayinlar -> ogrenci zilde ve
 * Duyurular'da gorur, acar (okundu) -> ogretmen "1 / 2 okudu" ve okuyanin adini gorur -> ogretmen arsivler ->
 * ogrenciden kalkar. `EKRAN_KAYDET=<dizin>` verilirse goruntuler yazilir.
 * On kosul: api (API_URL) + worker, bildirim (BILDIRIM_URL, varsayilan 4002) + worker, ayni NATS; bildirim
 * veritabanina yonetici baglantisi (`BILDIRIM_ADMIN_DATABASE_URL`) hesap olaylarinin kopyalara ulasmasini
 * beklemek icin okunur.
 */

const BILDIRIM_URL = process.env.BILDIRIM_URL ?? 'http://localhost:4002';
const BILDIRIM_ADMIN_DB_URL =
  process.env.BILDIRIM_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/bildirim';

let atlamaNedeni: string | null = null;
test.beforeAll(async () => {
  atlamaNedeni = await ortamSorunu();
  if (atlamaNedeni === null) {
    try {
      const y = await fetch(`${BILDIRIM_URL}/ready`, { signal: AbortSignal.timeout(3000) });
      if (!y.ok) atlamaNedeni = `bildirim ${BILDIRIM_URL} /ready ${String(y.status)} dondu`;
    } catch {
      atlamaNedeni = `bildirim ${BILDIRIM_URL} adresine ulasilamadi (bildirim servisi calismiyor)`;
    }
  }
  if (atlamaNedeni === null) await otpSiniriniTemizle();
});

async function telefonlaGir(telefon: string) {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { govde: { telefon, kod } },
  );
  const ilk = await belirtecAl(oturum);
  await rizaKabul(ilk);
  return { oturum, ilk };
}

/** Telefonla giris yapar, daveti kabul eder; uyelik kimligini ve kurum baglamli belirteci dondurur. */
async function davetliKatil(telefon: string, davetBelirteci: string, kurumId: string) {
  const { oturum, ilk } = await telefonlaGir(telefon);
  const { uyelik_id: uyelikId } = await api<{ uyelik_id: string }>('/v1/hesap/davetler/kabul', {
    belirtec: ilk,
    govde: { belirtec: davetBelirteci },
  });
  return { uyelikId, belirtec: await belirtecAl(oturum, kurumId) };
}

async function bildirimGet<T>(belirtec: string, yol: string): Promise<T> {
  const y = await fetch(`${BILDIRIM_URL}/v1/bildirim/${yol}`, {
    headers: { authorization: `Bearer ${belirtec}` },
  });
  return (await y.json()) as T;
}

async function kutuSayisi(belirtec: string, kurumId: string): Promise<number> {
  return (
    await bildirimGet<{ okunmamis: number }>(belirtec, `kurumlar/${kurumId}/kutu/okunmamis-sayisi`)
  ).okunmamis;
}

async function kopyalarHazir(kurumId: string, ogretmenUyelikId: string): Promise<void> {
  const sql = postgres(BILDIRIM_ADMIN_DB_URL, { max: 1 });
  try {
    for (let i = 0; i < 120; i += 1) {
      const [g] = await sql<{ n: number }[]>`
        select count(*)::int as n from bildirim.grup_uyesi_kopyalari where kurum_id = ${kurumId}`;
      const [a] = await sql<{ n: number }[]>`
        select count(*)::int as n from bildirim.atama_kopyalari
         where kurum_id = ${kurumId} and ogretmen_id = ${ogretmenUyelikId}`;
      if (g?.n === 2 && a?.n === 1) return;
      await new Promise((coz) => setTimeout(coz, 500));
    }
    throw new Error('hesap olaylari bildirim kopyalarina ulasmadi');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function girisYap(page: Page, telefon: string, kurumAdi: string) {
  await page.goto('/giris');
  await page.getByLabel('Telefon numaran').fill(telefon);
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  await page.getByLabel('SMS ile gelen 6 haneli kodu gir').fill(await sonOtpKodu(telefon));
  await page.waitForURL(/\/(kurum-sec|[0-9a-f-]{36}\/bugun)$/);
  await page.waitForURL(/\/[0-9a-f-]{36}\/bugun$/, { timeout: 8000 }).catch(async () => {
    await page.getByRole('button', { name: new RegExp(kurumAdi) }).click();
  });
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}\/bugun$/);
}

test("gercek api + bildirim: ogretmen gruba duyuru yazar, ogrenci zilde ve Duyurular'da gorur, acar, ogretmen 1/2 okudu gorur", async ({
  browser,
}) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(300_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string, tam = false) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: tam });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  // --- Ortam: kurum, grup, ogretmen (atamali), iki ogrenci --------------------------------------
  const sahipTel = benzersizTelefon();
  const hocaTel = benzersizTelefon();
  const ogr1Tel = benzersizTelefon();
  const ogr2Tel = benzersizTelefon();
  const ek = sahipTel.slice(-6);
  const kurumAdi = `Duyuru Kurumu ${ek}`;
  const sahip0 = await telefonlaGir(sahipTel);
  const { kurum } = await api<{ kurum: { id: string } }>('/v1/hesap/kurumlar', {
    belirtec: sahip0.ilk,
    govde: { ad: kurumAdi, tur: 'kurum' },
  });
  const kurumId = kurum.id;
  const sahip = await belirtecAl(sahip0.oturum, kurumId);
  const h = `/v1/hesap/kurumlar/${kurumId}`;
  const grupAdi = `11-A Matematik ${ek}`;
  const grup = await api<{ id: string }>(`${h}/gruplar`, {
    belirtec: sahip,
    govde: { tur: 'grup', ad: grupAdi },
  });
  const davet = (rol: string, hedefAd: string) =>
    api<{ belirtec: string }>(`${h}/davetler`, {
      belirtec: sahip,
      govde: { kanal: 'baglanti', rol, hedef_ad: hedefAd },
    });
  const hocaAdi = `Ayşe Hoca ${ek}`;
  const ogr1Adi = `Deniz Yılmaz ${ek}`;
  const ogr2Adi = `Mert Kaya ${ek}`;
  const hoca = await davetliKatil(hocaTel, (await davet('ogretmen', hocaAdi)).belirtec, kurumId);
  const ogr1 = await davetliKatil(ogr1Tel, (await davet('ogrenci', ogr1Adi)).belirtec, kurumId);
  const ogr2 = await davetliKatil(ogr2Tel, (await davet('ogrenci', ogr2Adi)).belirtec, kurumId);
  await api(`${h}/gruplar/${grup.id}/atamalar`, {
    belirtec: sahip,
    govde: { ogretmen_id: hoca.uyelikId, brans_kodu: 'matematik' },
  });
  await api(`${h}/gruplar/${grup.id}/uyeler`, {
    belirtec: sahip,
    govde: { ogrenci_idleri: [ogr1.uyelikId, ogr2.uyelikId] },
  });
  await kopyalarHazir(kurumId, hoca.uyelikId);

  const baslik = `Cuma deneme sınavı ${ek}`;
  const baglanti = 'https://ornek.example/sinav';

  // --- Web: ogretmen duyuruyu yazar ve yayinlar -----------------------------------------------------
  const hocaCtx = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 900 },
  });
  const hocaSayfa = await hocaCtx.newPage();
  await girisYap(hocaSayfa, hocaTel, kurumAdi);
  await hocaSayfa
    .getByRole('navigation', { name: 'Ana menü' })
    .getByRole('link', { name: 'Duyurular' })
    .click();
  await expect(hocaSayfa).toHaveURL(/\/duyurular$/);
  await expect(hocaSayfa.getByRole('button', { name: 'Yeni duyuru' })).toBeVisible();
  await hocaSayfa.getByRole('button', { name: 'Yeni duyuru' }).click();
  const form = hocaSayfa.getByRole('dialog', { name: 'Yeni duyuru' });
  // Ogretmen kurum hedefi secemez; kademe hedefi yok.
  await expect(form.getByLabel('Kime gidecek?')).toHaveCount(0);
  await form.getByLabel('Başlık').fill(baslik);
  await form
    .getByLabel('Metin')
    .fill(`Cuma 10:00'da deneme sınavı var. Ayrıntı: ${baglanti} Başarılar!`);
  await form.getByLabel('Grup', { exact: true }).selectOption({ label: grupAdi });
  await form.getByRole('checkbox', { name: 'Listenin en üstünde sabit tut' }).click();
  await goruntu(hocaSayfa, 'duyuru-formu-gercek');
  await form.getByRole('button', { name: 'Yayınla' }).click();
  const onay = hocaSayfa.getByRole('alertdialog', { name: 'Duyuru yayınlansın mı?' });
  await expect(onay).toContainText(`${grupAdi} grubundaki yaklaşık 2 öğrenciye gidecek`);
  await onay.getByRole('button', { name: 'Yayınla' }).click();
  await expect(
    hocaSayfa.getByRole('status').filter({ hasText: /Duyuru yayınlandı/ }),
  ).toBeVisible();
  const yonetimSatiri = hocaSayfa.getByTestId('duyuru-yonetim-satiri').filter({ hasText: baslik });
  await expect(yonetimSatiri).toContainText('Yayında');
  await expect(yonetimSatiri).toContainText(`Grup: ${grupAdi}`);
  await expect(yonetimSatiri.getByTestId('duyuru-okunan')).toHaveText('0 / 2 okudu');
  await goruntu(hocaSayfa, 'duyurular-yonetim-gercek');

  // Duyuru kimligi (ayrinti adresinden)
  await yonetimSatiri.getByRole('link').click();
  await expect(hocaSayfa).toHaveURL(/\/duyurular\/[0-9a-f-]{36}$/);
  const duyuruId = /\/duyurular\/([0-9a-f-]{36})$/.exec(hocaSayfa.url())?.[1] ?? '';
  expect(duyuruId).not.toBe('');
  await expect(hocaSayfa.getByTestId('duyuru-okunan-ozet')).toHaveText('0 / 2 okudu');

  // --- Web: ogrenci zilde ve Duyurular'da gorur, acar --------------------------------------------------
  await expect.poll(() => kutuSayisi(ogr1.belirtec, kurumId), { timeout: 60_000 }).toBe(1);
  const ogrCtx = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 800 },
  });
  const ogrSayfa = await ogrCtx.newPage();
  await girisYap(ogrSayfa, ogr1Tel, kurumAdi);
  const rozet = ogrSayfa.getByTestId('bildirim-rozeti').filter({ visible: true });
  await expect(rozet).toHaveText('1');
  // Bugun: sabit duyuru karti
  const kart = ogrSayfa.getByTestId('bugun-duyuru-karti');
  await expect(kart).toContainText(baslik);
  await expect(kart).toContainText('Sabit');
  await goruntu(ogrSayfa, 'bugun-ogrenci-duyuru-gercek');

  await ogrSayfa.getByTestId('bildirim-zili').filter({ visible: true }).click();
  const acilir = ogrSayfa.getByRole('dialog', { name: 'Son bildirimler' });
  await expect(acilir.getByRole('link', { name: new RegExp(baslik) })).toBeVisible();
  await goruntu(ogrSayfa, 'bildirim-zil-duyuru-gercek');
  await acilir.getByRole('link', { name: new RegExp(baslik) }).click();
  await expect(ogrSayfa).toHaveURL(new RegExp(`/duyurular/${duyuruId}$`));
  const detay = ogrSayfa.getByTestId('duyuru-detay');
  await expect(detay.getByRole('heading', { name: baslik })).toBeVisible();
  const link = detay.getByRole('link', { name: /ornek\.example\/sinav/ });
  await expect(link).toHaveAttribute('href', baglanti);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(ogrSayfa.getByTestId('duyuru-yonetim')).toHaveCount(0);
  await goruntu(ogrSayfa, 'duyuru-detay-ogrenci-gercek');
  // Okundu: zil rozeti kalkar (kutu bildirimi de okunur)
  await expect(rozet).toHaveCount(0);
  await expect.poll(() => kutuSayisi(ogr1.belirtec, kurumId)).toBe(0);

  // Duyurular listesi: sabit, okunmus
  await ogrSayfa.getByRole('link', { name: 'Duyurulara dön' }).click();
  const satir = ogrSayfa.getByTestId('duyuru-satiri').filter({ hasText: baslik });
  await expect(satir).toHaveAttribute('data-sabit', 'true');
  await expect(satir).toHaveAttribute('data-okunmamis', 'false');
  await goruntu(ogrSayfa, 'duyurular-ogrenci-gercek', true);

  // Servis tarafi: okundu sayaci 1, ikinci ogrenci hala okunmamis goruyor
  const sayac = await bildirimGet<{ okunan_sayisi: number; alici_sayisi: number }>(
    sahip,
    `kurumlar/${kurumId}/duyurular/${duyuruId}/okuyanlar`,
  );
  expect([sayac.okunan_sayisi, sayac.alici_sayisi]).toEqual([1, 2]);
  expect(await kutuSayisi(ogr2.belirtec, kurumId)).toBe(1);

  // --- Web: ogretmen "1 / 2 okudu" ve okuyanin adini gorur ----------------------------------------------
  await hocaSayfa.reload();
  await expect(hocaSayfa.getByTestId('duyuru-okunan-ozet')).toHaveText('1 / 2 okudu');
  await hocaSayfa.getByRole('button', { name: 'Okuyanları göster' }).click();
  const okuyanlar = hocaSayfa.getByTestId('duyuru-okuyanlar');
  await expect(okuyanlar.getByRole('listitem')).toHaveCount(1);
  await expect(okuyanlar).toContainText(ogr1Adi);
  await expect(okuyanlar).not.toContainText(ogr2Adi);
  await goruntu(hocaSayfa, 'duyuru-detay-yazar-gercek', true);

  // Arsivle: ogrencinin listesinden ve kutusundan kalkar
  await hocaSayfa.getByRole('button', { name: 'Arşivle' }).click();
  await hocaSayfa
    .getByRole('alertdialog', { name: 'Duyuru arşivlensin mi?' })
    .getByRole('button', { name: 'Arşivle' })
    .click();
  await expect(hocaSayfa.getByText('Duyuru arşivlendi.')).toBeVisible();
  await ogrSayfa.reload();
  await expect(ogrSayfa.getByTestId('duyuru-satiri').filter({ hasText: baslik })).toHaveCount(0);
  await expect(ogrSayfa.getByText('Henüz duyuru yok')).toBeVisible();

  await hocaCtx.close();
  await ogrCtx.close();
});
