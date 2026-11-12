import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { medyaMock, medyaMockOku, medyaMockSifirla, medyaMockYaz } from './medya-mock';
import { medyaVekili, medyaYoluIzinliMi } from './medya-vekil';
import { ogrenmeYoluIzinliMi } from './ogrenme-vekil';
import { soruMock, soruMockSifirla } from './soru-mock';

const OGRETMEN = 'kurum-ege';
const OGRENCI = 'kurum-atlas';
const YONETICI = 'kurum-mavi';
const KAYNAK = 'http://localhost:3000';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('soru izinli yollar (tam eslesme)', () => {
  it('ogrenci, ogretmen ve yonetim uclarini gecirir', () => {
    const uclar = [
      ['sorular'],
      ['sorular', 'x'],
      ['sorular', 'x', 'anladim'],
      ['sorular', 'x', 'takip'],
      ['sorular', 'x', 'bildir'],
      ['sorular', 'x', 'cevap'],
      ['sorularim'],
      ['soru-kotam'],
      ['gelen-sorular'],
      ['gelen-sorular', 'sayi'],
      ['cevapladigim-sorular'],
      ['soru-musaitligim'],
      ['soru-masalari'],
      ['soru-masalari', 'm'],
      ['soru-masalari', 'm', 'uyeler'],
      ['soru-masalari', 'm', 'uyeler', 'o'],
      ['soru-ayarlari'],
      ['yonetim', 'sorular'],
      ['soru-bildirimleri'],
      ['soru-bildirimleri', 'b', 'kapat'],
      ['soru-olcum'],
    ];
    for (const son of uclar) {
      expect(ogrenmeYoluIzinliMi(['kurumlar', OGRETMEN, ...son]), son.join('/')).toBe(true);
    }
  });

  it('listede olmayan, fazladan parcali ve yol gezen istekleri reddeder', () => {
    for (const son of [
      ['sorular', 'x', 'baska'],
      ['sorular', 'x', 'cevap', 'y'],
      ['sorularim', 'x'],
      ['gelen-sorular', 'x'],
      ['soru-ayarlari', 'x'],
      ['yonetim'],
      ['yonetim', 'diger'],
      ['soru-bildirimleri', 'b'],
      ['soru-masalari', 'm', 'uyeler', 'o', 'x'],
      ['sorular', '..', 'cevap'],
    ]) {
      expect(ogrenmeYoluIzinliMi(['kurumlar', OGRETMEN, ...son]), son.join('/')).toBe(false);
    }
  });
});

describe('medya izinli yollar ve vekil', () => {
  it('yalniz dosyalar, dosyalar/{id} ve dosyalar/{id}/tamam gecer', () => {
    for (const parcalar of [['dosyalar'], ['dosyalar', 'x'], ['dosyalar', 'x', 'tamam']]) {
      expect(medyaYoluIzinliMi(parcalar, 'POST'), parcalar.join('/')).toBe(true);
    }
    for (const parcalar of [
      [],
      ['ic', 'okuma-adresleri'],
      ['dosyalar', 'x', 'sil'],
      ['dosyalar', 'x', 'tamam', 'y'],
      ['dosyalar', '..', 'tamam'],
      ['saglik'],
    ]) {
      expect(medyaYoluIzinliMi(parcalar, 'POST'), parcalar.join('/')).toBe(false);
    }
  });

  const istek = (yol: string, ek: ConstructorParameters<typeof NextRequest>[1] = {}) =>
    new NextRequest(`http://localhost/api/medya/${yol}`, {
      headers: { authorization: 'Bearer tok', host: 'localhost' },
      ...ek,
    });

  it('yetkisiz istegi 401, izinsiz yolu 404 ile reddeder', async () => {
    const yetkisiz = await medyaVekili(new NextRequest('http://localhost/x', { method: 'POST' }), [
      'dosyalar',
    ]);
    expect(yetkisiz.status).toBe(401);
    expect((await medyaVekili(istek('x'), ['ic', 'okuma-adresleri'])).status).toBe(404);
  });

  it('MEDYA_URL adresine /v1/dosyalar ile iletir, Bearer ve govdeyi korur; govdesiz POST {} gider', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 202, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    vi.stubEnv('MEDYA_URL', 'http://medya.test:4003');
    await medyaVekili(
      istek('dosyalar', {
        method: 'POST',
        headers: {
          authorization: 'Bearer tok',
          'content-type': 'application/json',
          host: 'localhost',
        },
        body: '{"tur":"soru_fotografi"}',
      }),
      ['dosyalar'],
    );
    const [adres, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(adres).toBe('http://medya.test:4003/v1/dosyalar');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"tur":"soru_fotografi"}');

    await medyaVekili(istek('x', { method: 'POST' }), ['dosyalar', 'abc', 'tamam']);
    const [adres2, init2] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(adres2).toBe('http://medya.test:4003/v1/dosyalar/abc/tamam');
    expect(init2.body).toBe('{}');
  });

  it('medya ulasilamazsa 502 hizmet_kullanilamiyor verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('baglanti')));
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    const yanit = await medyaVekili(istek('dosyalar/x'), ['dosyalar', 'x']);
    expect(yanit.status).toBe(502);
  });
});

describe('medya mock: yukleme akisi', () => {
  beforeEach(() => {
    medyaMockSifirla();
  });
  const gonder = (yontem: string, yol: string, govde?: unknown) =>
    medyaMock({ yontem, yol, sorgu: new URLSearchParams(), govde, basliklar: {}, kaynak: KAYNAK });
  const yeni = (ek: Record<string, unknown> = {}) =>
    gonder('POST', 'dosyalar', {
      tur: 'soru_fotografi',
      mime_tipi: 'image/jpeg',
      boyut_bayt: 5,
      sha256: 'a'.repeat(64),
      istemci_anahtari: '0190a000-0000-7000-8000-0000000000cc',
      ...ek,
    });

  it('izin -> PUT -> tamam -> yoklama (once isleniyor, sonra hazir)', () => {
    const izin = yeni();
    expect(izin.durum).toBe(201);
    const govde = izin.govde as {
      dosya: { id: string; durum: string };
      yukleme: { url: string; basliklar: Record<string, string> };
    };
    expect(govde.dosya.durum).toBe('yukleme_bekliyor');
    expect(govde.yukleme.url).toBe(`${KAYNAK}/api/medya-mock/${govde.dosya.id}`);

    // PUT'tan once tamam: nesne yok
    expect(gonder('POST', `dosyalar/${govde.dosya.id}/tamam`).durum).toBe(409);
    expect(medyaMockYaz(govde.dosya.id, new Uint8Array([1, 2, 3, 4, 5]), 'image/jpeg')).toBe(true);
    const tamam = gonder('POST', `dosyalar/${govde.dosya.id}/tamam`);
    expect(tamam.durum).toBe(202);
    expect((tamam.govde as { durum: string }).durum).toBe('isleniyor');
    expect((gonder('GET', `dosyalar/${govde.dosya.id}`).govde as { durum: string }).durum).toBe(
      'isleniyor',
    );
    const hazir = gonder('GET', `dosyalar/${govde.dosya.id}`).govde as {
      durum: string;
      adresler: { asil_url: string };
    };
    expect(hazir.durum).toBe('hazir');
    expect(hazir.adresler.asil_url).toBe(`${KAYNAK}/api/medya-mock/${govde.dosya.id}`);
    expect(medyaMockOku(govde.dosya.id)?.bayt).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('ayni istemci_anahtari ayni dosyayi verir (200); farkli anahtar yeni dosya', () => {
    const a = yeni().govde as { dosya: { id: string } };
    const tekrar = yeni();
    expect(tekrar.durum).toBe(200);
    expect((tekrar.govde as { dosya: { id: string } }).dosya.id).toBe(a.dosya.id);
    const b = yeni({ istemci_anahtari: '0190a000-0000-7000-8000-0000000000dd' }).govde as {
      dosya: { id: string };
    };
    expect(b.dosya.id).not.toBe(a.dosya.id);
  });

  it('desteklenmeyen mime (HEIC, SVG) ve buyuk dosya reddedilir', () => {
    expect(yeni({ mime_tipi: 'image/heic' }).durum).toBe(422);
    expect(yeni({ mime_tipi: 'image/svg+xml' }).durum).toBe(422);
    expect(yeni({ boyut_bayt: 11 * 1024 * 1024 }).durum).toBe(413);
    expect(
      yeni({ tur: 'soru_ses', mime_tipi: 'audio/webm', boyut_bayt: 6 * 1024 * 1024 }).durum,
    ).toBe(413);
    expect(yeni({ tur: 'soru_ses', mime_tipi: 'audio/webm', boyut_bayt: 1000 }).durum).toBe(201);
  });
});

describe('soru mock', () => {
  beforeEach(() => {
    soruMockSifirla();
    medyaMockSifirla();
  });

  const istek = (kurum: string, yontem: string, yol: string, govde?: unknown, sorgu = '') => {
    const yanit = soruMock({
      yontem,
      yol: `kurumlar/${kurum}/${yol}`,
      sorgu: new URLSearchParams(sorgu),
      govde,
      basliklar: {},
      kaynak: KAYNAK,
    });
    if (!yanit) throw new Error('mock ilgilenmedi');
    return yanit;
  };

  /** Hazir bir medya dosyasi uretir. */
  function hazirDosya(tur = 'soru_fotografi', mime = 'image/jpeg', anahtar = crypto.randomUUID()) {
    const izin = medyaMock({
      yontem: 'POST',
      yol: 'dosyalar',
      sorgu: new URLSearchParams(),
      govde: {
        tur,
        mime_tipi: mime,
        boyut_bayt: 3,
        sha256: 'b'.repeat(64),
        istemci_anahtari: anahtar,
      },
      basliklar: {},
      kaynak: KAYNAK,
    }).govde as { dosya: { id: string } };
    medyaMockYaz(izin.dosya.id, new Uint8Array([1, 2, 3]), mime);
    const m = (yol: string, yontem: string) =>
      medyaMock({
        yontem,
        yol,
        sorgu: new URLSearchParams(),
        govde: undefined,
        basliklar: {},
        kaynak: KAYNAK,
      });
    m(`dosyalar/${izin.dosya.id}/tamam`, 'POST');
    m(`dosyalar/${izin.dosya.id}`, 'GET');
    m(`dosyalar/${izin.dosya.id}`, 'GET');
    return izin.dosya.id;
  }

  const sor = (govde: Record<string, unknown> = {}) =>
    istek(OGRENCI, 'POST', 'sorular', {
      brans_kodu: 'matematik',
      metin: 'burada takildim',
      fotograflar: [hazirDosya()],
      ...govde,
    });

  it('ogrenci soru sorar: 201, tahmini cevap ve kota doner; hazir olmayan dosya 409', () => {
    const yanit = sor();
    expect(yanit.durum).toBe(201);
    const g = yanit.govde as {
      durum: string;
      tekrar: boolean;
      fotograflar: { adres: { asil_url: string } }[];
      tahmini_cevap: { sure_sn: number | null; hedef_musait: boolean };
      kota: { gunluk_kalan: number; gunluk_limit: number };
    };
    expect(g).toMatchObject({ durum: 'acik', tekrar: false });
    expect(g.kota).toMatchObject({ gunluk_limit: 3, gunluk_kalan: 2 });
    expect(g.tahmini_cevap.hedef_musait).toBe(true);
    expect(g.fotograflar[0]?.adres.asil_url).toContain('/api/medya-mock/');

    const hazirDegil = istek(OGRENCI, 'POST', 'sorular', {
      brans_kodu: 'matematik',
      fotograflar: [crypto.randomUUID()],
    });
    expect(hazirDegil.durum).toBe(409);
    expect((hazirDegil.govde as { error: { code: string } }).error.code).toBe('dosya_hazir_degil');
  });

  it('ayni istek_id soruyu cogaltmaz (200, tekrar) ve kota harcamaz', () => {
    const istekId = crypto.randomUUID();
    const dosya = hazirDosya();
    const ilk = sor({ istek_id: istekId, fotograflar: [dosya] });
    const tekrar = sor({ istek_id: istekId, fotograflar: [dosya] });
    expect(tekrar.durum).toBe(200);
    expect((tekrar.govde as { tekrar: boolean; id: string }).tekrar).toBe(true);
    expect((tekrar.govde as { id: string }).id).toBe((ilk.govde as { id: string }).id);
    const kota = istek(OGRENCI, 'GET', 'soru-kotam').govde as { gunluk_kalan: number };
    expect(kota.gunluk_kalan).toBe(2);
  });

  it('gunluk kota dolunca 429 kota_asildi ve details.kota (sifirlanma) doner', () => {
    expect(sor().durum).toBe(201);
    expect(sor().durum).toBe(201);
    expect(sor().durum).toBe(201);
    const dolu = sor();
    expect(dolu.durum).toBe(429);
    const hata = (
      dolu.govde as {
        error: {
          code: string;
          details: {
            kota_turu: string;
            kota: { gunluk_kalan: number; gunluk_sifirlanma_at: string };
          };
        };
      }
    ).error;
    expect(hata.code).toBe('kota_asildi');
    expect(hata.details.kota_turu).toBe('gunluk');
    expect(hata.details.kota.gunluk_kalan).toBe(0);
    expect(Date.parse(hata.details.kota.gunluk_sifirlanma_at)).toBeGreaterThan(Date.now());
  });

  it('yonetici kotayi degistirince ogrenci kotasi degisir; sinirsiz null', () => {
    istek(YONETICI, 'PUT', 'soru-ayarlari', { gunluk_soru_limiti: 1 });
    expect(sor().durum).toBe(201);
    expect(sor().durum).toBe(429);
    istek(YONETICI, 'PUT', 'soru-ayarlari', { gunluk_soru_limiti: null });
    expect(sor().durum).toBe(201);
    expect(
      (istek(OGRENCI, 'GET', 'soru-kotam').govde as { gunluk_kalan: number | null }).gunluk_kalan,
    ).toBeNull();
  });

  it('ogrenci -> ogretmen cevaplar (metin + cizimli fotograf + ses) -> ogrenci anladim', () => {
    const soru = sor().govde as { id: string };
    // Ogretmenin kuyrugunda ve sayacta
    const kuyruk = istek(OGRETMEN, 'GET', 'gelen-sorular').govde as { sorular: { id: string }[] };
    expect(kuyruk.sorular.some((s) => s.id === soru.id)).toBe(true);
    const sayi = istek(OGRETMEN, 'GET', 'gelen-sorular/sayi').govde as { bekleyen: number };
    expect(sayi.bekleyen).toBeGreaterThanOrEqual(2);

    const detay = istek(OGRETMEN, 'GET', `sorular/${soru.id}`).govde as {
      fotograflar: { medya_dosya_id: string }[];
    };
    const kaynakFoto = detay.fotograflar[0]?.medya_dosya_id ?? '';
    const cizim = hazirDosya('soru_cizim', 'image/png');
    const ses = hazirDosya('soru_ses', 'audio/webm');
    const cevap = istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, {
      metin: 'Ters islem yapalim.',
      derste_konusalim: true,
      ekler: [
        {
          tur: 'cizimli_fotograf',
          medya_dosya_id: cizim,
          kaynak_dosya_id: kaynakFoto,
          cizim_verisi: { surum: 1, cizgiler: [] },
        },
        { tur: 'ses', medya_dosya_id: ses, sure_sn: 42 },
      ],
    });
    expect(cevap.durum).toBe(200);
    const c = cevap.govde as {
      durum: string;
      mesajlar: {
        tur: string;
        derste_konusalim: boolean;
        ekler: {
          tur: string;
          kaynak_dosya_id: string | null;
          sure_sn: number | null;
          adres: unknown;
        }[];
      }[];
    };
    expect(c.durum).toBe('cevaplandi');
    const yanit = c.mesajlar.find((m) => m.tur === 'cevap');
    expect(yanit?.derste_konusalim).toBe(true);
    expect(yanit?.ekler.map((e) => e.tur)).toEqual(['cizimli_fotograf', 'ses']);
    expect(yanit?.ekler[0]?.kaynak_dosya_id).toBe(kaynakFoto);
    expect(yanit?.ekler[1]?.sure_sn).toBe(42);
    expect(yanit?.ekler.every((e) => e.adres !== null)).toBe(true);

    // Cevaplandi soruya ikinci cevap yazilamaz
    expect(istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'x' }).durum).toBe(409);

    const anladim = istek(OGRENCI, 'POST', `sorular/${soru.id}/anladim`, {});
    expect((anladim.govde as { durum: string }).durum).toBe('cozuldu');
    // Cevapladigim arsivinde
    const arsiv = istek(OGRETMEN, 'GET', 'cevapladigim-sorular').govde as {
      sorular: { id: string }[];
    };
    expect(arsiv.sorular.some((s) => s.id === soru.id)).toBe(true);
  });

  it('bos cevap ve 180 sn ustu ses reddedilir', () => {
    const soru = sor().govde as { id: string };
    expect(istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, {}).durum).toBe(422);
    const ses = hazirDosya('soru_ses', 'audio/webm');
    const uzun = istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, {
      ekler: [{ tur: 'ses', medya_dosya_id: ses, sure_sn: 181 }],
    });
    expect(uzun.durum).toBe(400);
    istek(YONETICI, 'PUT', 'soru-ayarlari', { ses_azami_sn: 60 });
    const sinirli = istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, {
      ekler: [{ tur: 'ses', medya_dosya_id: ses, sure_sn: 90 }],
    });
    expect(sinirli.durum).toBe(422);
    expect((sinirli.govde as { error: { code: string } }).error.code).toBe('ses_cok_uzun');
  });

  it('halen anlamadim: takip sorusu, sinir ve cozulmus soruyu yeniden acma', () => {
    const soru = sor().govde as { id: string };
    istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'cevap' });
    const takip = istek(OGRENCI, 'POST', `sorular/${soru.id}/takip`, { metin: 'hala anlamadim' });
    expect(takip.govde as { durum: string; kalan_takip_hakki: number }).toMatchObject({
      durum: 'takip_bekliyor',
      kalan_takip_hakki: 2,
    });
    istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'tekrar' });
    istek(OGRENCI, 'POST', `sorular/${soru.id}/anladim`, {});
    const yeniden = istek(OGRENCI, 'POST', `sorular/${soru.id}/takip`, {
      metin: 'bir sorum daha var',
    });
    expect(yeniden.govde).toMatchObject({ durum: 'takip_bekliyor', yeniden_acilma_sayisi: 1 });
    istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'ucuncu' });
    istek(OGRENCI, 'POST', `sorular/${soru.id}/takip`, { metin: 'ucuncu takip' });
    istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'dorduncu' });
    const sinir = istek(OGRENCI, 'POST', `sorular/${soru.id}/takip`, { metin: 'dorduncu takip' });
    expect(sinir.durum).toBe(422);
    expect((sinir.govde as { error: { code: string } }).error.code).toBe('takip_limiti_asildi');
  });

  it('ogrenci baskasinin sorusunu goremez; ogrenci ogretmen uclarina giremez', () => {
    const baskasi = istek(OGRENCI, 'GET', 'sorularim').govde as {
      sorular: { ogrenci_id: string }[];
    };
    const benimki = new Set(baskasi.sorular.map((s) => s.ogrenci_id));
    expect(benimki.size).toBe(1);
    const gelen = istek(OGRENCI, 'GET', 'gelen-sorular');
    expect(gelen.durum).toBe(403);
    expect(istek(OGRETMEN, 'GET', 'soru-ayarlari').durum).toBe(403);
    expect(istek(OGRETMEN, 'GET', 'soru-masalari').durum).toBe(403);
  });

  it('arsiv suzgecleri: brans, durum ve Turkce harf duyarsiz arama', () => {
    const fizik = istek(OGRENCI, 'GET', 'sorularim', undefined, 'brans_kodu=fizik').govde as {
      sorular: { brans_kodu: string }[];
    };
    expect(fizik.sorular.length).toBeGreaterThan(0);
    expect(fizik.sorular.every((s) => s.brans_kodu === 'fizik')).toBe(true);
    const cozuldu = istek(OGRENCI, 'GET', 'sorularim', undefined, 'durum=cozuldu').govde as {
      sorular: { durum: string }[];
    };
    expect(cozuldu.sorular.every((s) => s.durum === 'cozuldu')).toBe(true);
    const arama = istek(OGRENCI, 'GET', 'sorularim', undefined, 'q=CARPANLARA').govde as {
      sorular: { baslik: string }[];
    };
    expect(arama.sorular.map((s) => s.baslik)).toContain('Çarpanlara ayırma');
  });

  it('musaitlik: ogretmen "bugun cevap veremiyorum" derse tahmin hedef_musait=false doner', () => {
    expect(istek(OGRETMEN, 'PUT', 'soru-musaitligim', { musait: false }).govde).toMatchObject({
      musait: false,
    });
    const g = sor().govde as { tahmini_cevap: { hedef_musait: boolean } };
    expect(g.tahmini_cevap.hedef_musait).toBe(false);
    istek(OGRETMEN, 'PUT', 'soru-musaitligim', { musait: true });
    expect((istek(OGRETMEN, 'GET', 'soru-musaitligim').govde as { musait: boolean }).musait).toBe(
      true,
    );
  });

  it('yonetici: masa olusturur, uye ekler-cikarir, pasife alir, siler; surum cakismasi 409', () => {
    const masa = istek(YONETICI, 'POST', 'soru-masalari', {
      brans_kodu: 'matematik',
      ad: 'Matematik masasi',
    });
    expect(masa.durum).toBe(201);
    const m = masa.govde as { id: string; surum: number };
    expect(
      istek(YONETICI, 'POST', 'soru-masalari', { brans_kodu: 'matematik', ad: 'Matematik masasi' })
        .durum,
    ).toBe(409);
    const ogretmenId = crypto.randomUUID();
    const eklendi = istek(YONETICI, 'POST', `soru-masalari/${m.id}/uyeler`, {
      ogretmen_id: ogretmenId,
    });
    expect((eklendi.govde as { uyeler: unknown[] }).uyeler).toHaveLength(1);
    expect(istek(YONETICI, 'DELETE', `soru-masalari/${m.id}/uyeler/${ogretmenId}`).durum).toBe(204);
    // Uye islemleri surumu artirir; guncel surum listeden okunur.
    const guncel = (
      istek(YONETICI, 'GET', 'soru-masalari').govde as { masalar: { surum: number }[] }
    ).masalar[0]?.surum;
    expect(guncel).toBeGreaterThan(m.surum);
    const eski = istek(YONETICI, 'PATCH', `soru-masalari/${m.id}`, {
      aktif: false,
      surum: guncel,
    });
    expect(eski.govde).toMatchObject({ aktif: false });
    expect(
      istek(YONETICI, 'PATCH', `soru-masalari/${m.id}`, { aktif: true, surum: m.surum }).durum,
    ).toBe(409);
    expect(istek(YONETICI, 'DELETE', `soru-masalari/${m.id}`).durum).toBe(204);
    expect(
      (istek(YONETICI, 'GET', 'soru-masalari').govde as { masalar: unknown[] }).masalar,
    ).toHaveLength(0);
  });

  it('bildirim: ogrenci bildirir, yonetici listeler ve kapatir; ayni kisi tekrar acmaz', () => {
    const soru = (istek(OGRENCI, 'GET', 'sorularim').govde as { sorular: { id: string }[] })
      .sorular[0];
    const id = soru?.id ?? '';
    const b = istek(OGRENCI, 'POST', `sorular/${id}/bildir`, { neden: 'uygunsuz', aciklama: 'x' });
    expect(b.durum).toBe(200);
    const bildirimId = (b.govde as { id: string }).id;
    expect(
      (istek(OGRENCI, 'POST', `sorular/${id}/bildir`, { neden: 'diger' }).govde as { id: string })
        .id,
    ).toBe(bildirimId);
    const liste = istek(YONETICI, 'GET', 'soru-bildirimleri').govde as {
      bildirimler: { id: string }[];
    };
    expect(liste.bildirimler.map((x) => x.id)).toEqual([bildirimId]);
    const kapali = istek(YONETICI, 'POST', `soru-bildirimleri/${bildirimId}/kapat`, {
      not: 'incelendi',
    });
    expect(kapali.govde).toMatchObject({ durum: 'kapandi', kapatma_notu: 'incelendi' });
    expect(
      (istek(YONETICI, 'GET', 'soru-bildirimleri').govde as { bildirimler: unknown[] }).bildirimler,
    ).toHaveLength(0);
    expect(
      (
        istek(YONETICI, 'GET', 'soru-bildirimleri', undefined, 'durum=kapandi').govde as {
          bildirimler: unknown[];
        }
      ).bildirimler,
    ).toHaveLength(1);
  });

  it('olcum: soru ve cevap sayilari, anladim orani, ogretmen ve brans kirilimi', () => {
    const soru = sor().govde as { id: string };
    istek(OGRETMEN, 'POST', `sorular/${soru.id}/cevap`, { metin: 'cevap' });
    istek(OGRENCI, 'POST', `sorular/${soru.id}/anladim`, {});
    const o = istek(YONETICI, 'GET', 'soru-olcum').govde as {
      soru_sayisi: number;
      cevaplanan: number;
      anladim: number;
      anladim_orani: number | null;
      ogretmenler: { gorunen_ad: string | null }[];
      branslar: { brans_kodu: string }[];
    };
    expect(o.soru_sayisi).toBeGreaterThanOrEqual(1);
    expect(o.cevaplanan).toBeGreaterThanOrEqual(1);
    expect(o.anladim).toBeGreaterThanOrEqual(1);
    expect(o.anladim_orani).toBeGreaterThan(0);
    expect(o.ogretmenler.length).toBeGreaterThan(0);
    expect(o.branslar.map((b) => b.brans_kodu)).toContain('matematik');
  });

  it('yonetim sorulari ogretmen suzgeciyle filtrelenir', () => {
    const hepsi = istek(YONETICI, 'GET', 'yonetim/sorular').govde as { sorular: unknown[] };
    expect(hepsi.sorular.length).toBeGreaterThanOrEqual(5);
    const hasan = istek(
      YONETICI,
      'GET',
      'yonetim/sorular',
      undefined,
      'ogretmen_id=0190a000-0000-7000-8000-000000000012',
    ).govde as {
      sorular: { brans_kodu: string }[];
    };
    expect(hasan.sorular.length).toBeGreaterThan(0);
    expect(hasan.sorular.every((s) => s.brans_kodu === 'fizik')).toBe(true);
  });
});
