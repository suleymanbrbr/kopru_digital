import {
  KarakterTurleriYanitiSema,
  KarakterYanitiSema,
  KozmetiklerYanitiSema,
  MotivasyonOgrenciDurumuSema,
} from '@kopru/contracts';
import type { Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())('karakter ve kozmetik (kullanici JWT, motivasyon_app)', () => {
  let o: Ortam;
  let servis: Service;
  const kurumId = uuidv7();
  const taban = `/v1/motivasyon/kurumlar/${kurumId}`;
  const yeniOgrenci = () => yeniKimlik('ogrenci', kurumId);
  const istek = async (
    k: Kimlik,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    servis.app.inject({
      method,
      url: `${taban}${url}`,
      headers: yetki(await kullaniciTokeni(k)),
      ...(payload ? { payload } : {}),
    });
  const sec = (k: Kimlik, tur = 'kivilcim', ad = 'Pırıl') =>
    istek(k, 'POST', '/karakter', { tur_kodu: tur, ad });
  const karakter = async (k: Kimlik) =>
    KarakterYanitiSema.parse((await istek(k, 'GET', '/karakter')).json()).karakter;
  const hata = (r: { json: () => unknown }) => (r.json() as { error: { code: string } }).error.code;
  const seviyeYaz = (k: Kimlik, seviye: number) =>
    o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, seviye)
             values (${uuidv7()}, ${kurumId}, ${k.uyelikId}, ${seviye})
             on conflict (kurum_id, ogrenci_id) do update set seviye = ${seviye}`;
  const sahipYap = (k: Kimlik, kod: string) =>
    o.sistem`insert into motivasyon.ogrenci_kozmetikleri (id, kurum_id, ogrenci_id, kozmetik_kodu)
             values (${uuidv7()}, ${kurumId}, ${k.uyelikId}, ${kod})`;

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => T0 });
    await servis.app.ready();
  });
  afterAll(async () => {
    await servis.stop();
    await o.kapat();
  });

  it('turler: 3 tur, 5 asama, esikler tanim tablosundan', async () => {
    const r = KarakterTurleriYanitiSema.parse(
      (await istek(yeniOgrenci(), 'GET', '/karakter/turler')).json(),
    );
    expect(r.turler.map((t) => t.kod)).toEqual(['dinamo', 'kivilcim', 'sedir']);
    for (const t of r.turler) {
      expect(t.asamalar.map((a) => a.gereken_seviye)).toEqual([1, 5, 12, 25, 40]);
      expect(t.asamalar.every((a) => a.ad.length > 0)).toBe(true);
    }
  });

  it('sec: ilk secim 201, asama mevcut seviyeden; tekrar secim 409; benim karakter alani dolar', async () => {
    const ogr = yeniOgrenci();
    expect(await karakter(ogr)).toBeNull();
    const r = await sec(ogr, 'sedir', '  Meşe   Baba ');
    expect(r.statusCode).toBe(201);
    const k = KarakterYanitiSema.parse(r.json()).karakter;
    expect(k).toMatchObject({
      tur_kodu: 'sedir',
      ad: 'Meşe Baba',
      asama: 1,
      sonraki_asama_seviyesi: 5,
      tur_degistirme_hakki: 1,
      kusanilanlar: [],
    });
    expect(k?.tur_adi).toBe('Sedir');
    const r2 = await sec(ogr, 'dinamo', 'Baska');
    expect(r2.statusCode).toBe(409);
    expect(hata(r2)).toBe('karakter_zaten_secildi');
    const d = MotivasyonOgrenciDurumuSema.parse((await istek(ogr, 'GET', '/benim')).json());
    expect(d.karakter).toMatchObject({
      tur_kodu: 'sedir',
      ad: 'Meşe Baba',
      asama: 1,
      kusanilanlar: [],
    });

    // yuksek seviyeli ogrenci secimde dogru asamayla baslar (seviye 12 -> asama 3)
    const ileri = yeniOgrenci();
    await seviyeYaz(ileri, 12);
    expect((await karakter(ileri)) ?? null).toBeNull();
    const k2 = KarakterYanitiSema.parse((await sec(ileri)).json()).karakter;
    expect(k2).toMatchObject({ asama: 3, sonraki_asama_seviyesi: 25 });
  });

  it('uygunsuz ad 422 karakter_adi_uygunsuz (secim ve ad degistirme); gecersiz tur 422; uzun ad 400', async () => {
    const ogr = yeniOgrenci();
    for (const ad of ['Siktir', 'o r o s p u', 'ab!c', '😀']) {
      const r = await sec(ogr, 'kivilcim', ad);
      expect(r.statusCode, ad).toBe(422);
      expect(hata(r)).toBe('karakter_adi_uygunsuz');
    }
    expect(await karakter(ogr)).toBeNull();
    expect(hata(await sec(ogr, 'ejderha', 'Ali'))).toBe('karakter_turu_gecersiz');
    expect((await sec(ogr, 'kivilcim', 'x'.repeat(25))).statusCode).toBe(400);
    expect((await sec(ogr, 'kivilcim', '   ')).statusCode).toBe(400);
    await sec(ogr, 'kivilcim', 'Ali');
    const r = await istek(ogr, 'PATCH', '/karakter/ad', { ad: 'Amk' });
    expect(r.statusCode).toBe(422);
    expect(hata(r)).toBe('karakter_adi_uygunsuz');
    expect((await karakter(ogr))?.ad).toBe('Ali');
  });

  it('ad degistirme: sinirsiz; karakter yoksa 422', async () => {
    const ogr = yeniOgrenci();
    expect(hata(await istek(ogr, 'PATCH', '/karakter/ad', { ad: 'Yeni' }))).toBe(
      'karakter_secilmemis',
    );
    await sec(ogr, 'kivilcim', 'Ali');
    for (const ad of ['Veli', 'Selin 2', 'Ali']) {
      const r = await istek(ogr, 'PATCH', '/karakter/ad', { ad });
      expect(KarakterYanitiSema.parse(r.json()).karakter?.ad).toBe(ad);
    }
  });

  it('tur degistirme tek sefer; asama ve kusanimlar korunur', async () => {
    const ogr = yeniOgrenci();
    expect(hata(await istek(ogr, 'PATCH', '/karakter/tur', { tur_kodu: 'dinamo' }))).toBe(
      'karakter_secilmemis',
    );
    await seviyeYaz(ogr, 5);
    await sec(ogr, 'kivilcim', 'Ali');
    expect((await karakter(ogr))?.asama).toBe(2);
    await sahipYap(ogr, 'sapka_kasket');
    await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: 'sapka_kasket' });

    expect(hata(await istek(ogr, 'PATCH', '/karakter/tur', { tur_kodu: 'kivilcim' }))).toBe(
      'ayni_tur',
    );
    expect(hata(await istek(ogr, 'PATCH', '/karakter/tur', { tur_kodu: 'ejderha' }))).toBe(
      'karakter_turu_gecersiz',
    );
    const r = await istek(ogr, 'PATCH', '/karakter/tur', { tur_kodu: 'dinamo' });
    expect(r.statusCode).toBe(200);
    const k = KarakterYanitiSema.parse(r.json()).karakter;
    expect(k).toMatchObject({
      tur_kodu: 'dinamo',
      asama: 2,
      tur_degistirme_hakki: 0,
      kusanilanlar: [{ slot: 'sapka', kozmetik_kodu: 'sapka_kasket' }],
    });
    const r2 = await istek(ogr, 'PATCH', '/karakter/tur', { tur_kodu: 'sedir' });
    expect(r2.statusCode).toBe(409);
    expect(hata(r2)).toBe('tur_degistirme_hakki_yok');
    expect((await karakter(ogr))?.tur_kodu).toBe('dinamo');
  });

  it('kozmetikler: sahip/kilitli ve acilma kosulu; kusan / cikar kurallari', async () => {
    const ogr = yeniOgrenci();
    // karakter yokken kusanilamaz
    expect(
      hata(
        await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: 'sapka_kasket' }),
      ),
    ).toBe('karakter_secilmemis');
    await sec(ogr);
    const liste = KozmetiklerYanitiSema.parse(
      (await istek(ogr, 'GET', '/karakter/kozmetikler')).json(),
    ).kozmetikler;
    expect(liste).toHaveLength(12);
    expect(liste.every((x) => !x.sahip && !x.kusanildi && x.acildi_at === null)).toBe(true);
    expect(
      liste.every((x) =>
        Object.keys(x.acilma_kosulu).some((a) => ['rozet', 'seviye', 'seri'].includes(a)),
      ),
    ).toBe(true);
    const rozetli = liste.find((x) => x.acilma_kosulu.rozet);
    expect(rozetli?.acilma_kosulu.rozet_adi).toBeTruthy();

    const sapkalar = liste.filter((x) => x.slot === 'sapka').map((x) => x.kod);
    const gozlukler = liste.filter((x) => x.slot === 'gozluk').map((x) => x.kod);
    expect(sapkalar.length).toBeGreaterThanOrEqual(1);
    expect(gozlukler.length).toBeGreaterThanOrEqual(1);
    const sapka = sapkalar.at(0) ?? '';
    const gozluk = gozlukler.at(0) ?? '';

    // sahip olunmayan 422
    const yok = await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: sapka });
    expect(yok.statusCode).toBe(422);
    expect(hata(yok)).toBe('kozmetik_sahip_degil');
    expect(
      hata(await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: 'yok_boyle' })),
    ).toBe('kozmetik_sahip_degil');

    await sahipYap(ogr, sapka);
    await sahipYap(ogr, gozluk);
    // slot uyusmazligi 422
    const slot = await istek(ogr, 'PUT', '/karakter/kusanimlar/gozluk', { kozmetik_kodu: sapka });
    expect(slot.statusCode).toBe(422);
    expect(hata(slot)).toBe('kozmetik_slot_uyusmuyor');
    expect(
      hata(await istek(ogr, 'PUT', '/karakter/kusanimlar/yuzuk', { kozmetik_kodu: sapka })),
    ).toBe('dogrulama_hatasi');

    const k1 = KarakterYanitiSema.parse(
      (await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: sapka })).json(),
    ).karakter;
    expect(k1?.kusanilanlar).toEqual([{ slot: 'sapka', kozmetik_kodu: sapka }]);
    // tekrar kusanmak idempotent
    await istek(ogr, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: sapka });
    const k2 = KarakterYanitiSema.parse(
      (await istek(ogr, 'PUT', '/karakter/kusanimlar/gozluk', { kozmetik_kodu: gozluk })).json(),
    ).karakter;
    expect(k2?.kusanilanlar.map((x) => x.slot)).toEqual(['gozluk', 'sapka']);

    const l2 = KozmetiklerYanitiSema.parse(
      (await istek(ogr, 'GET', '/karakter/kozmetikler')).json(),
    ).kozmetikler;
    expect(l2.find((x) => x.kod === sapka)).toMatchObject({ sahip: true, kusanildi: true });
    expect(l2.find((x) => x.kod === sapka)?.acildi_at).toBeTruthy();

    const d = MotivasyonOgrenciDurumuSema.parse((await istek(ogr, 'GET', '/benim')).json());
    expect(d.karakter?.kusanilanlar).toHaveLength(2);

    // cikar (idempotent)
    const c = KarakterYanitiSema.parse(
      (await istek(ogr, 'DELETE', '/karakter/kusanimlar/sapka')).json(),
    ).karakter;
    expect(c?.kusanilanlar).toEqual([{ slot: 'gozluk', kozmetik_kodu: gozluk }]);
    expect((await istek(ogr, 'DELETE', '/karakter/kusanimlar/sapka')).statusCode).toBe(200);
    // baskasinin kozmetigi giyilemez
    const baska = yeniOgrenci();
    await sec(baska);
    expect(
      hata(await istek(baska, 'PUT', '/karakter/kusanimlar/sapka', { kozmetik_kodu: sapka })),
    ).toBe('kozmetik_sahip_degil');
  });

  it('ogretmen/veli 403; baska kurum 403; modul kapaliysa 403 modul_kapali', async () => {
    for (const rol of ['ogretmen', 'veli', 'yonetici'] as const) {
      const r = await istek(yeniKimlik(rol, kurumId), 'GET', '/karakter');
      expect(r.statusCode).toBe(403);
      expect(hata(r)).toBe('izin_yok');
    }
    const ogr = yeniOgrenci();
    const baska = await servis.app.inject({
      method: 'GET',
      url: `/v1/motivasyon/kurumlar/${uuidv7()}/karakter`,
      headers: yetki(await kullaniciTokeni(ogr)),
    });
    expect(baska.statusCode).toBe(403);
    expect((await servis.app.inject({ method: 'GET', url: `${taban}/karakter` })).statusCode).toBe(
      401,
    );

    await sec(ogr);
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kurumId}, 'oyunlastirma', 'kurum', ${kurumId}, false, now(), ${uuidv7()})`;
    try {
      for (const [m, u, p] of [
        ['GET', '/karakter/turler', undefined],
        ['GET', '/karakter', undefined],
        ['POST', '/karakter', { tur_kodu: 'kivilcim', ad: 'Ali' }],
        ['PATCH', '/karakter/ad', { ad: 'Veli' }],
        ['PATCH', '/karakter/tur', { tur_kodu: 'dinamo' }],
        ['GET', '/karakter/kozmetikler', undefined],
        ['DELETE', '/karakter/kusanimlar/sapka', undefined],
      ] as const) {
        const r = await istek(ogr, m, u, p);
        expect(r.statusCode, `${m} ${u}`).toBe(403);
        expect(hata(r)).toBe('modul_kapali');
      }
    } finally {
      await o.sistem`delete from motivasyon.modul_ayari_kopyalari where kurum_id = ${kurumId}`;
    }
    expect(await karakter(ogr)).not.toBeNull();
  });

  it('es zamanli iki secim: biri 201, digeri 409 (tek karakter satiri)', async () => {
    const ogr = yeniOgrenci();
    const [a, b] = await Promise.all([sec(ogr, 'kivilcim', 'Ali'), sec(ogr, 'dinamo', 'Veli')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const [n] = await o.sistem<{ n: number }[]>`
      select count(*)::int as n from motivasyon.ogrenci_karakterleri where ogrenci_id = ${ogr.uyelikId}`;
    expect(n?.n).toBe(1);
  });
});
