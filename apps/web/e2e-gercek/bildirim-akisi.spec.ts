import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import {
  API_ADMIN_DB_URL,
  benzersizTelefon,
  ortamSorunu,
  otpSiniriniTemizle,
  sonOtpKodu,
} from './yardimcilar';
import { kayitOrtaminiKur } from './yardimcilar-kayit';
import { api, belirtecAl, rizaKabul } from './yardimcilar-operasyon';

/**
 * Gercek `api` + gercek `bildirim` (+ iki worker, ayri NATS) ile gelen kutusu ve tercihler: ogrenci iki soru
 * sorar, sahip (solo hoca) cevaplar, NATS'a bir seri hatirlatmasi olayi yayimlanir -> web'de zil rozeti 3,
 * acilir liste, derin baglanti (soru), okundu / tumunu oku, bildirimler sayfasi, tercih matrisi, sessiz saat ve
 * ders hatirlatma (api'den dogrulanir). `EKRAN_KAYDET=<dizin>` verilirse goruntuler yazilir.
 * On kosul: api (API_URL) + worker, bildirim (web `BILDIRIM_URL`, varsayilan 4002) + worker, ayni NATS
 * (`NATS_URL`; seri olayi icin). Soru fotografi icin medya servisi yerine `medya.dosya.hazir.v1` outbox
 * olayi yazilir (bildirim-akisi.sh ile ayni yontem).
 */

const BILDIRIM_URL = process.env.BILDIRIM_URL ?? 'http://localhost:4002';

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

function uuidv7(): string {
  const b = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i += 1) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function telefonlaBelirtec(telefon: string, kurumId: string): Promise<string> {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { govde: { telefon, kod } },
  );
  const erisim = await belirtecAl(oturum, kurumId);
  await rizaKabul(erisim);
  return erisim;
}

/** Soru fotografi icin medya servisi yerine `medya.dosya.hazir.v1` outbox olayi (api DB). */
async function sahteFotograf(kurumId: string, kullaniciId: string): Promise<string> {
  const sql = postgres(API_ADMIN_DB_URL, { max: 1 });
  try {
    const dosyaId = uuidv7();
    const olay = {
      id: uuidv7(),
      type: 'medya.dosya.hazir',
      version: 1,
      occurredAt: new Date().toISOString(),
      kurumId,
      actor: { tur: 'servis', id: 'medya' },
      correlationId: 'web-bildirim-akisi',
      data: {
        dosya_id: dosyaId,
        sahip_kullanici_id: kullaniciId,
        sahip_uyelik_id: kullaniciId,
        tur: 'soru_fotografi',
        mime_tipi: 'image/jpeg',
        boyut_bayt: 350_000,
        genislik: 800,
        yukseklik: 600,
        sure_sn: null,
        kucuk_resim_var: true,
      },
    };
    await sql`insert into ortak.outbox (id, kurum_id, subject, payload)
      values (${olay.id}, ${kurumId}, 'evt.medya.dosya.hazir.v1', ${sql.json(olay)})`;
    for (let i = 0; i < 40; i += 1) {
      const [s] = await sql<{ n: number }[]>`
        select count(*)::int as n from ortak.medya_dosya_kopyalari where id = ${dosyaId}`;
      if (s?.n === 1) return dosyaId;
      await new Promise((coz) => setTimeout(coz, 500));
    }
    throw new Error('medya kopyasi olusmadi');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function kutuSayisi(belirtec: string, kurumId: string): Promise<number> {
  const y = await fetch(`${BILDIRIM_URL}/v1/bildirim/kurumlar/${kurumId}/kutu/okunmamis-sayisi`, {
    headers: { authorization: `Bearer ${belirtec}` },
  });
  return ((await y.json()) as { okunmamis: number }).okunmamis;
}

async function bildirimGet<T>(belirtec: string, yol: string): Promise<T> {
  const y = await fetch(`${BILDIRIM_URL}/v1/bildirim/${yol}`, {
    headers: { authorization: `Bearer ${belirtec}` },
  });
  return (await y.json()) as T;
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

test('gercek api + bildirim: zil, kutu, derin baglanti, okundu, tercihler', async ({ browser }) => {
  test.skip(atlamaNedeni !== null, atlamaNedeni ?? '');
  test.setTimeout(240_000);
  const dizin = process.env.EKRAN_KAYDET;
  const goruntu = async (p: Page, ad: string, tam = true) => {
    if (!dizin) return;
    for (const tema of ['light', 'dark'] as const) {
      await p.emulateMedia({ colorScheme: tema });
      await p.mouse.move(0, 0);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${dizin}/${ad}-${tema}.png`, fullPage: tam });
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };

  const sahipTelefon = benzersizTelefon();
  const ogrTelefon = benzersizTelefon();
  const ek = sahipTelefon.slice(-6);
  const o = await kayitOrtaminiKur(sahipTelefon, ogrTelefon, ek);
  const sahip = await telefonlaBelirtec(sahipTelefon, o.kurumId);
  const ogr = await telefonlaBelirtec(ogrTelefon, o.kurumId);

  // --- Bildirim uret: iki soru + cevap, bir seri hatirlatmasi -----------------------------------
  const sql = postgres(API_ADMIN_DB_URL, { max: 1 });
  const [uyelik] = await sql<{ kullanici_id: string }[]>`
    select kullanici_id from hesap.uyelikler where id = ${o.ogrenciUyelikId}`;
  await sql.end({ timeout: 1 });
  if (!uyelik) throw new Error('ogrenci uyeligi yok');
  const sorular: string[] = [];
  for (const baslik of ['Denklem sorusu', 'Eşitsizlik sorusu']) {
    const foto = await sahteFotograf(o.kurumId, uyelik.kullanici_id);
    const { id } = await api<{ id: string }>(`/v1/ogrenme/kurumlar/${o.kurumId}/sorular`, {
      belirtec: ogr,
      govde: { brans_kodu: 'matematik', baslik, metin: 'Burada takıldım', fotograflar: [foto] },
    });
    await api(`/v1/ogrenme/kurumlar/${o.kurumId}/sorular/${id}/cevap`, {
      belirtec: sahip,
      govde: { metin: 'Önce sadeleştir, sonra çöz.' },
    });
    sorular.push(id);
  }
  execFileSync(
    'pnpm',
    [
      '--silent',
      'exec',
      'tsx',
      'scripts/olay-yayinla.ts',
      'seri-risk',
      o.kurumId,
      o.ogrenciUyelikId,
      new Date(Date.now() + 3 * 3_600_000).toISOString(),
      '6',
    ],
    {
      cwd: new URL('../../../services/bildirim', import.meta.url).pathname,
      env: { ...process.env, NATS_URL: process.env.NATS_URL ?? 'nats://localhost:4932' },
    },
  );
  await expect.poll(() => kutuSayisi(ogr, o.kurumId), { timeout: 60_000 }).toBe(3);

  // --- Web: ogrenci -------------------------------------------------------------------------------
  const ctx = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 900 },
  });
  const w = await ctx.newPage();
  await girisYap(w, ogrTelefon, o.kurumAdi);
  const zil = w.getByTestId('bildirim-zili').filter({ visible: true });
  const rozet = w.getByTestId('bildirim-rozeti').filter({ visible: true });
  await expect(rozet).toHaveText('3');
  await expect(zil).toHaveAccessibleName('Bildirimler, 3 okunmamış');

  await zil.click();
  const acilir = w.getByRole('dialog', { name: 'Son bildirimler' });
  await expect(acilir.getByTestId('bildirim-satiri')).toHaveCount(3);
  await expect(acilir.getByText('Sorun cevaplandı')).toHaveCount(2);
  await expect(acilir.getByText('Serini koru!').first()).toBeVisible();
  await goruntu(w, 'bildirim-zil-acilir', false);

  // Derin baglanti: soru bildirimi -> ogrencinin sorusu; okundu isaretlenir.
  await acilir
    .getByRole('link', { name: /Sorun cevaplandı/ })
    .first()
    .click();
  await expect(w).toHaveURL(new RegExp(`/${o.kurumId}/soru-sor/(${sorular.join('|')})$`));
  await expect(rozet).toHaveText('2');
  await expect.poll(() => kutuSayisi(ogr, o.kurumId)).toBe(2);

  // Bildirimler sayfasi
  await w.goto(`/${o.kurumId}/bildirimler`);
  await expect(w.getByTestId('bildirim-satiri')).toHaveCount(3);
  await goruntu(w, 'bildirimler-liste');
  await w.getByRole('button', { name: /^Okunmamış/ }).click();
  await expect(w.getByTestId('bildirim-satiri')).toHaveCount(2);
  await goruntu(w, 'bildirimler-okunmamis');
  await w.getByRole('button', { name: /“Serini koru!” bildirimini okundu işaretle/ }).click();
  await expect(w.getByTestId('bildirim-satiri')).toHaveCount(1);
  await expect.poll(() => kutuSayisi(ogr, o.kurumId)).toBe(1);
  await w.getByRole('button', { name: 'Tümünü okundu yap' }).click();
  await expect(w.getByText('Okunmamış bildirimin yok.')).toBeVisible();
  await expect(rozet).toBeHidden();
  await expect.poll(() => kutuSayisi(ogr, o.kurumId)).toBe(0);
  await goruntu(w, 'bildirimler-bos-okunmamis');

  // Arsivle
  await w.getByRole('button', { name: 'Tümü', exact: true }).click();
  await expect(w.getByTestId('bildirim-satiri')).toHaveCount(3);
  await w.getByRole('button', { name: /“Serini koru!” bildirimini arşivle/ }).click();
  await expect(w.getByTestId('bildirim-satiri')).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (await bildirimGet<{ ogeler: unknown[] }>(ogr, `kurumlar/${o.kurumId}/kutu`)).ogeler.length,
    )
    .toBe(2);

  // --- Tercihler ----------------------------------------------------------------------------------
  await w.getByRole('main').getByRole('link', { name: 'Bildirim tercihleri' }).click();
  await expect(w).toHaveURL(new RegExp(`/${o.kurumId}/ayarlar/bildirimler$`));
  const soruPush = w.getByRole('checkbox', { name: 'Soru sor: Anlık bildirim' });
  await expect(soruPush).toBeChecked();
  await goruntu(w, 'tercihler');
  await soruPush.click();
  await expect(soruPush).not.toBeChecked();
  await w.getByLabel('Başlangıç').fill('23:30');
  await w.getByLabel('Bitiş').fill('06:45');
  await w.getByLabel('Ders hatırlatma süresi').selectOption({ label: '30 dakika önce' });
  await w.getByTestId('sessiz-gun-7').click();

  // api'deki gercek durum
  await expect
    .poll(
      async () =>
        (
          await bildirimGet<{ tercihler: { kategori: string; kanal: string; acik: boolean }[] }>(
            ogr,
            `kurumlar/${o.kurumId}/tercihler`,
          )
        ).tercihler.find((t) => t.kategori === 'soru' && t.kanal === 'push')?.acik,
    )
    .toBe(false);
  await expect
    .poll(async () => bildirimGet(ogr, `kurumlar/${o.kurumId}/ayarlar`))
    .toMatchObject({
      sessiz_baslangic: '23:30',
      sessiz_bitis: '06:45',
      sessiz_gunler: [1, 2, 3, 4, 5, 6],
      ders_hatirlatma_dk: 30,
    });
  await w.reload();
  await expect(w.getByRole('checkbox', { name: 'Soru sor: Anlık bildirim' })).not.toBeChecked();
  await expect(w.getByLabel('Başlangıç')).toHaveValue('23:30');
  await expect(w.getByLabel('Ders hatırlatma süresi')).toHaveValue('30');
  await goruntu(w, 'tercihler-degisti');

  // Kilitli hucre api'de de 400 (arayuz kapatmaya izin vermez, sunucu da reddeder)
  const kilitli = await fetch(`${BILDIRIM_URL}/v1/bildirim/kurumlar/${o.kurumId}/tercihler`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${ogr}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tercihler: [{ kategori: 'sistem', kanal: 'push', acik: false }] }),
  });
  expect(kilitli.status).toBe(400);
  await ctx.close();

  // --- Dar ekran (mobil goruntu) --------------------------------------------------------------------
  const mobil = await browser.newContext({
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const m = await mobil.newPage();
  await girisYap(m, ogrTelefon, o.kurumAdi);
  await m.goto(`/${o.kurumId}/bildirimler`);
  await expect(m.getByTestId('bildirim-satiri')).toHaveCount(2);
  await goruntu(m, 'dar-bildirimler');
  await m.getByTestId('bildirim-zili').filter({ visible: true }).click();
  await expect(m.getByRole('dialog', { name: 'Son bildirimler' })).toBeVisible();
  await goruntu(m, 'dar-zil-acilir', false);
  await m.keyboard.press('Escape');
  await m.goto(`/${o.kurumId}/ayarlar/bildirimler`);
  await expect(m.getByRole('heading', { name: 'Bildirim tercihleri', level: 1 })).toBeVisible();
  await goruntu(m, 'dar-tercihler');
  await mobil.close();

  // Sahip (hoca) ayri hesap: kutusu bos, ogrencinin bildirimlerini goremez.
  expect(await kutuSayisi(sahip, o.kurumId)).toBe(0);
});
