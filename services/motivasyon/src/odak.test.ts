import {
  MotivasyonOgrenciDurumuSema,
  OdakBitirYanitiSema,
  OdakOturumuSema,
} from '@kopru/contracts';
import { createDb, type Database, type Service } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acikOdakTemizle } from './odak-isler.js';
import { odakOlayId, uuidv5 } from './odak-ortak.js';
import { T0, dk, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testDb,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';

const sql_sayac = (ogrenciId: string) =>
  sql`select count(*)::int as n from motivasyon.odak_oturumlari where ogrenci_id = ${ogrenciId}`;

describe('uuidv5', () => {
  it('RFC 9562 ornegi ve odak olay kimligi kararli', () => {
    // RFC 4122/9562 bilinen deger: uuidv5("www.example.com", DNS ad alani)
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    const id = uuidv7();
    expect(odakOlayId(id)).toBe(odakOlayId(id));
    expect(odakOlayId(id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
  });
});

describe.skipIf(dbYok())('odak oturumlari (kullanici JWT, motivasyon_app)', () => {
  let o: Ortam;
  let servis: Service;
  let sistemDb: Database;
  let an = T0;
  const kurumId = uuidv7();
  const ogretmen = yeniKimlik('ogretmen', kurumId);
  const taban = `/v1/motivasyon/kurumlar/${kurumId}`;

  const istek = async (
    k: Kimlik,
    method: 'GET' | 'POST',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    servis.app.inject({
      method,
      url: `${taban}${url}`,
      headers: yetki(await kullaniciTokeni(k)),
      ...(payload ? { payload } : {}),
    });
  const baslat = (k: Kimlik, ek: Record<string, unknown> = {}, id = uuidv7()) =>
    istek(k, 'POST', '/odak-oturumlari', { istemci_id: id, mod: '25_5', ...ek });
  const bitir = (k: Kimlik, id: string, ek: Record<string, unknown> = { durum: 'tamam' }) =>
    istek(k, 'POST', `/odak-oturumlari/${id}/bitir`, ek);
  const benim = async (k: Kimlik) =>
    MotivasyonOgrenciDurumuSema.parse((await istek(k, 'GET', '/benim')).json());
  const hata = (r: { json: () => unknown }) => (r.json() as { error: { code: string } }).error.code;
  const yeniOgrenci = () => yeniKimlik('ogrenci', kurumId);

  beforeAll(() => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => an });
    const urls = testDb();
    if (urls) sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await servis.stop();
    await sistemDb.close();
    await o.kapat();
  });

  it('baslat: idempotent istemci_id, tek acik oturum (409 + acik oturum bilgisi)', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    const r1 = await baslat(ogr, { brans_kodu: 'matematik', cihaz: 'iPhone' }, id);
    expect(r1.statusCode).toBe(201);
    const o1 = OdakOturumuSema.parse(r1.json());
    expect(o1).toMatchObject({
      istemci_id: id,
      planlanan_dk: 25,
      durum: 'devam',
      gerceklesen_sn: 0,
      bitis_at: null,
      brans_kodu: 'matematik',
      cihaz: 'iPhone',
      baslangic_at: T0.toISOString(),
    });
    // Ayni istemci_id: ayni oturum, 200
    const r2 = await baslat(ogr, { mod: 'serbest', planlanan_dk: 90 }, id);
    expect(r2.statusCode).toBe(200);
    expect(OdakOturumuSema.parse(r2.json()).id).toBe(o1.id);
    // Baska istemci_id: 409 + mevcut oturum
    const r3 = await baslat(ogr);
    expect(r3.statusCode).toBe(409);
    expect(hata(r3)).toBe('acik_oturum_var');
    expect(
      r3.json<{ error: { details: { oturum: { id: string } } } }>().error.details.oturum.id,
    ).toBe(o1.id);
    // acik oturum
    const acik = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
      oturum: { id: string };
    }>();
    expect(acik.oturum.id).toBe(o1.id);
    // yalniz bir devam satiri
    const [satir] = await o.sistem<{ n: number }[]>`
      select count(*)::int as n from motivasyon.odak_oturumlari where ogrenci_id = ${ogr.uyelikId}`;
    expect(satir?.n).toBe(1);
  });

  it('mod dogrulamasi: serbest planlanan_dk ister, sabit mod uyusmazligi reddedilir', async () => {
    const ogr = yeniOgrenci();
    expect((await baslat(ogr, { mod: 'serbest' })).statusCode).toBe(400);
    expect((await baslat(ogr, { mod: 'serbest', planlanan_dk: 4 })).statusCode).toBe(400);
    expect((await baslat(ogr, { mod: 'serbest', planlanan_dk: 181 })).statusCode).toBe(400);
    expect((await baslat(ogr, { mod: '25_5', planlanan_dk: 30 })).statusCode).toBe(400);
    const r = await baslat(ogr, { mod: '50_10' });
    expect(OdakOturumuSema.parse(r.json()).planlanan_dk).toBe(50);
  });

  it('bitir: sure, XP, aktivite ve sayac; ayni oturumu tekrar bitirmek ikinci XP vermez', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    await baslat(ogr, { brans_kodu: 'matematik' }, id);
    an = dk(T0, 25);
    const r = await bitir(ogr, id);
    expect(r.statusCode).toBe(200);
    const b = OdakBitirYanitiSema.parse(r.json());
    expect(b.oturum).toMatchObject({
      durum: 'tamam',
      gerceklesen_sn: 1500,
      bitis_at: an.toISOString(),
    });
    expect(b.kazanim).toMatchObject({ xp: 25, yeni_rozetler: [] });

    const d = await benim(ogr);
    expect(d.toplam_xp).toBe(25);
    expect(d.bugun.tavanlar.find((t) => t.kod === 'odak')).toEqual({
      kod: 'odak',
      kullanilan: 25,
      ust_sinir: 120,
    });
    expect(d.beceriler.find((x) => x.kod === 'sayisal')?.puan).toBe(25);
    const [akt] = await o.sistem<{ odak_sn: number }[]>`
      select odak_sn from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${ogr.uyelikId}`;
    expect(akt?.odak_sn).toBe(1500);
    const [say] = await o.sistem<{ deger: number }[]>`
      select deger::int from motivasyon.ogrenci_sayaclari
       where ogrenci_id = ${ogr.uyelikId} and sayac_kodu = 'toplam_odak_dk'`;
    expect(say?.deger).toBe(25);
    const [h] = await o.sistem<{ kaynak_olay_id: string }[]>`
      select kaynak_olay_id from motivasyon.xp_hareketleri
       where ogrenci_id = ${ogr.uyelikId} and kural_kodu = 'odak_oturumu'`;
    expect(h?.kaynak_olay_id).toBe(odakOlayId(b.oturum.id));

    // tekrar: durum ayni, XP ayni, aktivite/sayac ayni
    an = dk(T0, 40);
    const r2 = OdakBitirYanitiSema.parse((await bitir(ogr, id, { durum: 'yarida' })).json());
    expect(r2.oturum).toMatchObject({ durum: 'tamam', gerceklesen_sn: 1500 });
    expect(r2.kazanim.xp).toBe(25);
    expect((await benim(ogr)).toplam_xp).toBe(25);
    const [akt2] = await o.sistem<{ odak_sn: number }[]>`
      select odak_sn from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${ogr.uyelikId}`;
    expect(akt2?.odak_sn).toBe(1500);
    // eszamanli ikili bitirme de tek XP
    const id2 = uuidv7();
    an = dk(T0, 60);
    await baslat(ogr, {}, id2);
    an = dk(T0, 85);
    const iki = await Promise.all([bitir(ogr, id2), bitir(ogr, id2)]);
    expect(iki.map((x) => x.statusCode)).toEqual([200, 200]);
    expect((await benim(ogr)).toplam_xp).toBe(50);
  });

  it('sure ust siniri: planlanan*60+60 sn ve en cok 3 saat', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    await baslat(ogr, {}, id); // 25 dk planli
    an = dk(T0, 300); // 5 saat sonra bitir
    const b = OdakBitirYanitiSema.parse((await bitir(ogr, id)).json());
    expect(b.oturum.gerceklesen_sn).toBe(25 * 60 + 60);
    expect(b.kazanim.xp).toBe(26);

    // 180 dk planli, 5 saat acik kaldi: 3 saat; XP gunluk tavan 120 (26 kullanildi -> 94 kalir)
    an = dk(T0, 600);
    const id2 = uuidv7();
    await baslat(ogr, { mod: 'serbest', planlanan_dk: 180 }, id2);
    an = dk(T0, 900);
    const b2 = OdakBitirYanitiSema.parse((await bitir(ogr, id2)).json());
    expect(b2.oturum.gerceklesen_sn).toBe(180 * 60);
    expect(b2.kazanim.xp).toBe(94);
    const d = await benim(ogr);
    expect(d.toplam_xp).toBe(120);
    expect(d.bugun.tavanlar.find((t) => t.kod === 'odak')?.kullanilan).toBe(120);
    // tavan dolu: yeni oturum XP vermez ama aktivite sayaci artar
    an = dk(T0, 905);
    const id3 = uuidv7();
    await baslat(ogr, { mod: '50_10' }, id3);
    an = dk(T0, 955);
    const b3 = OdakBitirYanitiSema.parse((await bitir(ogr, id3)).json());
    expect(b3.oturum.gerceklesen_sn).toBe(3000);
    expect(b3.kazanim.xp).toBe(0);
    expect((await benim(ogr)).toplam_xp).toBe(120);
    const [akt] = await o.sistem<{ odak_sn: number }[]>`
      select sum(odak_sn)::int as odak_sn from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${ogr.uyelikId}`;
    expect(akt?.odak_sn).toBe(1560 + 10800 + 3000);
  });

  it('cevrimdisi bitis: istemcinin bitis_at degeri kabul edilir, [baslangic, simdi] araligina sikistirilir', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    await baslat(ogr, {}, id);
    // 2 saat sonra eşitlenir; istemci 25. dakikada bitirmişti
    an = dk(T0, 120);
    const b = OdakBitirYanitiSema.parse(
      (await bitir(ogr, id, { durum: 'tamam', bitis_at: dk(T0, 25).toISOString() })).json(),
    );
    expect(b.oturum).toMatchObject({ gerceklesen_sn: 1500, bitis_at: dk(T0, 25).toISOString() });
    expect(b.kazanim.xp).toBe(25);

    // gelecekteki bitis simdiye cekilir
    const id2 = uuidv7();
    an = dk(T0, 200);
    await baslat(ogr, {}, id2);
    an = dk(T0, 210);
    const b2 = OdakBitirYanitiSema.parse(
      (await bitir(ogr, id2, { durum: 'tamam', bitis_at: dk(T0, 400).toISOString() })).json(),
    );
    expect(b2.oturum).toMatchObject({ gerceklesen_sn: 600, bitis_at: an.toISOString() });

    // baslangictan once bitis baslangica cekilir: 0 sn, XP yok
    const id3 = uuidv7();
    an = dk(T0, 300);
    await baslat(ogr, {}, id3);
    an = dk(T0, 310);
    const b3 = OdakBitirYanitiSema.parse(
      (await bitir(ogr, id3, { durum: 'tamam', bitis_at: dk(T0, 100).toISOString() })).json(),
    );
    expect(b3.oturum).toMatchObject({ gerceklesen_sn: 0, bitis_at: dk(T0, 300).toISOString() });
    expect(b3.kazanim.xp).toBe(0);
  });

  it('cevrimdisi baslangic: gecmis baslangic_at kabul edilir; gelecek ve 24 saatten eski 422', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    const r = await baslat(ogr, { baslangic_at: dk(T0, -30).toISOString() }, id);
    expect(r.statusCode).toBe(201);
    expect(OdakOturumuSema.parse(r.json()).baslangic_at).toBe(dk(T0, -30).toISOString());
    const b = OdakBitirYanitiSema.parse(
      (await bitir(ogr, id, { durum: 'tamam', bitis_at: T0.toISOString() })).json(),
    );
    expect(b.oturum.gerceklesen_sn).toBe(1560); // 30 dk gecti; ust sinir planlanan*60+60

    const gelecek = await baslat(ogr, { baslangic_at: dk(T0, 10).toISOString() });
    expect(gelecek.statusCode).toBe(422);
    expect(hata(gelecek)).toBe('baslangic_gecersiz');
    const eski = await baslat(ogr, { baslangic_at: dk(T0, -25 * 60).toISOString() });
    expect(eski.statusCode).toBe(422);
  });

  it('yarida: 60 sn altinda XP yok, 60 sn ve ustu orantili XP', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    await baslat(ogr, {}, id);
    an = new Date(T0.getTime() + 45_000);
    const kisa = OdakBitirYanitiSema.parse((await bitir(ogr, id, { durum: 'yarida' })).json());
    expect(kisa.oturum).toMatchObject({ durum: 'yarida', gerceklesen_sn: 45 });
    expect(kisa.kazanim.xp).toBe(0);

    an = dk(T0, 10);
    const id2 = uuidv7();
    await baslat(ogr, {}, id2);
    an = dk(T0, 17.5);
    const uzun = OdakBitirYanitiSema.parse((await bitir(ogr, id2, { durum: 'yarida' })).json());
    expect(uzun.oturum.gerceklesen_sn).toBe(450);
    expect(uzun.kazanim.xp).toBe(7); // floor(450 / 60)
    expect((await benim(ogr)).toplam_xp).toBe(7);
  });

  it('bilinmeyen oturum 404; son oturumlar yeniden eskiye', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    expect((await bitir(ogr, uuidv7())).statusCode).toBe(404);
    const a = uuidv7();
    const b = uuidv7();
    await baslat(ogr, {}, a);
    an = dk(T0, 30);
    await bitir(ogr, a);
    await baslat(ogr, {}, b);
    const l = (await istek(ogr, 'GET', '/odak-oturumlari?limit=5')).json<{
      oturumlar: { istemci_id: string; durum: string }[];
    }>();
    expect(l.oturumlar.map((x) => [x.istemci_id, x.durum])).toEqual([
      [b, 'devam'],
      [a, 'tamam'],
    ]);
    // baska ogrencinin oturumu gorunmez / bitirilemez
    const baska = yeniOgrenci();
    expect((await bitir(baska, b)).statusCode).toBe(404);
    expect(
      (await istek(baska, 'GET', '/odak-oturumlari')).json<{ oturumlar: unknown[] }>().oturumlar,
    ).toEqual([]);
  });

  it('6 saatten uzun devam oturumlari yarida olur (worker isi); acik oturum sayilmaz; yeni baslatma serbest', async () => {
    an = T0;
    const ogr = yeniOgrenci();
    const id = uuidv7();
    await baslat(ogr, {}, id);
    an = dk(T0, 5 * 60 + 59);
    expect(await acikOdakTemizle({ db: sistemDb }, an)).toBe(0);
    an = dk(T0, 6 * 60 + 1);
    const acik = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{ oturum: unknown }>();
    expect(acik.oturum).toBeNull();
    expect(await acikOdakTemizle({ db: sistemDb }, an)).toBeGreaterThanOrEqual(1);
    const [s] = await o.sistem<{ durum: string; gerceklesen_sn: number; bitis_at: Date }[]>`
      select durum, gerceklesen_sn, bitis_at from motivasyon.odak_oturumlari where ogrenci_id = ${ogr.uyelikId}`;
    expect(s).toMatchObject({ durum: 'yarida', gerceklesen_sn: 0 });
    expect(s?.bitis_at.toISOString()).toBe(dk(T0, 25).toISOString());
    expect(await acikOdakTemizle({ db: sistemDb }, an)).toBe(0); // idempotent
    // zaten kapanmis oturum tekrar bitirilince degismez, XP yok
    const r = OdakBitirYanitiSema.parse((await bitir(ogr, id)).json());
    expect(r.oturum.durum).toBe('yarida');
    expect(r.kazanim.xp).toBe(0);
    expect((await benim(ogr)).toplam_xp).toBe(0);

    // worker henuz calismadiysa baslatma eski acik oturumu kendisi kapatir
    const ogr2 = yeniOgrenci();
    an = T0;
    await baslat(ogr2);
    an = dk(T0, 7 * 60);
    expect((await baslat(ogr2)).statusCode).toBe(201);
  });

  it('yetki: ogretmen/veli 403 izin_yok; baska kurum yolu 403; modul kapaliysa 403 modul_kapali', async () => {
    an = T0;
    const veli = yeniKimlik('veli', kurumId);
    for (const k of [ogretmen, veli]) {
      const r = await baslat(k);
      expect(r.statusCode).toBe(403);
      expect(hata(r)).toBe('izin_yok');
    }
    const ogr = yeniOgrenci();
    const baskaKurum = await servis.app.inject({
      method: 'POST',
      url: `/v1/motivasyon/kurumlar/${uuidv7()}/odak-oturumlari`,
      headers: yetki(await kullaniciTokeni(ogr)),
      payload: { istemci_id: uuidv7(), mod: '25_5' },
    });
    expect(baskaKurum.statusCode).toBe(403);
    expect(
      (await servis.app.inject({ method: 'GET', url: `${taban}/odak-oturumlari` })).statusCode,
    ).toBe(401);

    const id = uuidv7();
    await baslat(ogr, {}, id);
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kurumId}, 'oyunlastirma', 'kurum', ${kurumId}, false, now(), ${uuidv7()})`;
    try {
      for (const r of [
        await baslat(ogr),
        await bitir(ogr, id),
        await istek(ogr, 'GET', '/odak-oturumlari/acik'),
        await istek(ogr, 'GET', '/odak-oturumlari'),
      ]) {
        expect(r.statusCode).toBe(403);
        expect(hata(r)).toBe('modul_kapali');
      }
    } finally {
      await o.sistem`delete from motivasyon.modul_ayari_kopyalari where kurum_id = ${kurumId}`;
    }
  });

  describe('dogrulanmamis sure (geriye donuk baslangic hile korumasi)', () => {
    const geri = (ogr: Kimlik, dkOnce: number, ek: Record<string, unknown> = {}) =>
      baslat(ogr, { baslangic_at: dk(an, -dkOnce).toISOString(), ...ek });
    const sonuc = (r: { json: () => unknown }) => OdakBitirYanitiSema.parse(r.json());
    const aktivite = async (ogr: Kimlik) =>
      (
        await o.sistem<{ n: number }[]>`
          select coalesce(sum(odak_sn), 0)::int as n from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${ogr.uyelikId}`
      )[0]?.n;

    it('aninda 3 saat geriye: en cok 30 dk (+2 dk kayma payi) XP ve aktivite', async () => {
      an = T0;
      const ogr = yeniOgrenci();
      await geri(ogr, 180, { mod: 'serbest', planlanan_dk: 180 });
      const ist = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      expect(ist.oturum.istemci_id).toBeTruthy();
      const b = sonuc(await bitir(ogr, ist.oturum.istemci_id));
      expect(b.oturum.gerceklesen_sn).toBe(10800); // oturumda gorunur
      expect(b.kazanim).toMatchObject({
        xp: 32,
        dogrulanmamis_sayilan_sn: 1800,
        dogrulanmamis_sayilmayan_sn: 10680 - 1800,
      });
      expect(await aktivite(ogr)).toBe(1920);
      const [say] = await o.sistem<{ deger: number }[]>`
        select deger::int from motivasyon.ogrenci_sayaclari where ogrenci_id = ${ogr.uyelikId} and sayac_kodu = 'toplam_odak_dk'`;
      expect(say?.deger).toBe(32);
    });

    it('ayni gun ikinci geriye donuk oturum: kalan pay', async () => {
      an = T0;
      const ogr = yeniOgrenci();
      await geri(ogr, 20, { mod: 'serbest', planlanan_dk: 60 });
      const acik1 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      const b1 = sonuc(await bitir(ogr, acik1.oturum.istemci_id));
      expect(b1.kazanim).toMatchObject({
        dogrulanmamis_sayilan_sn: 1080,
        dogrulanmamis_sayilmayan_sn: 0,
        xp: 20,
      });
      await geri(ogr, 60, { mod: 'serbest', planlanan_dk: 90 });
      const acik2 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      const b2 = sonuc(await bitir(ogr, acik2.oturum.istemci_id));
      // kalan pay 1800 - 1080 = 720; + 120 sn kayma payi
      expect(b2.kazanim).toMatchObject({
        dogrulanmamis_sayilan_sn: 720,
        dogrulanmamis_sayilmayan_sn: 3480 - 720,
        xp: 14,
      });
      expect((await benim(ogr)).toplam_xp).toBe(34);
      // pay bitti: ucuncu geriye donuk oturum yalniz kayma payi kadar sayilir
      await geri(ogr, 40, { mod: 'serbest', planlanan_dk: 60 });
      const acik3 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      const b3 = sonuc(await bitir(ogr, acik3.oturum.istemci_id));
      expect(b3.kazanim).toMatchObject({ dogrulanmamis_sayilan_sn: 0, xp: 2 });
    });

    it('cevrimici baslatilip 50 dk suren oturum tam 50; karisik (10 dk geriye + 40 dk dogrulanmis) 50', async () => {
      an = T0;
      const ogr = yeniOgrenci();
      const id = uuidv7();
      await baslat(ogr, { mod: '50_10' }, id);
      an = dk(T0, 50);
      const b = sonuc(await bitir(ogr, id));
      expect(b.oturum.gerceklesen_sn).toBe(3000);
      expect(b.kazanim).toMatchObject({
        xp: 50,
        dogrulanmamis_sayilan_sn: 0,
        dogrulanmamis_sayilmayan_sn: 0,
      });

      an = dk(T0, 100);
      const ogr2 = yeniOgrenci();
      const id2 = uuidv7();
      await baslat(ogr2, { mod: '50_10', baslangic_at: dk(an, -10).toISOString() }, id2);
      an = dk(an, 40);
      const m = sonuc(await bitir(ogr2, id2));
      expect(m.oturum.gerceklesen_sn).toBe(3000);
      expect(m.kazanim).toMatchObject({
        xp: 50,
        dogrulanmamis_sayilan_sn: 480,
        dogrulanmamis_sayilmayan_sn: 0,
      });
    });

    it('eszamanli iki bitirme payi asmaz', async () => {
      an = T0;
      const ogr = yeniOgrenci();
      await geri(ogr, 120, { mod: 'serbest', planlanan_dk: 180 });
      const acik = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      const iki = await Promise.all([
        bitir(ogr, acik.oturum.istemci_id),
        bitir(ogr, acik.oturum.istemci_id),
      ]);
      expect(iki.map((r) => r.statusCode)).toEqual([200, 200]);
      const [t] = await o.sistem<{ s: number; n: number }[]>`
        select sum(dogrulanmamis_sayilan_sn)::int as s, count(*)::int as n from motivasyon.odak_oturumlari where ogrenci_id = ${ogr.uyelikId}`;
      expect(t).toEqual({ s: 1800, n: 1 });
      expect((await benim(ogr)).toplam_xp).toBe(32);
      expect(await aktivite(ogr)).toBe(1920);
    });

    it('ertesi gun (04:00) pay yenilenir', async () => {
      an = T0;
      const ogr = yeniOgrenci();
      await geri(ogr, 180, { mod: 'serbest', planlanan_dk: 180 });
      const a1 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      expect(sonuc(await bitir(ogr, a1.oturum.istemci_id)).kazanim.dogrulanmamis_sayilan_sn).toBe(
        1800,
      );
      an = new Date('2026-11-11T00:30:00.000Z'); // 03:30 Istanbul: hala ayni oyunlastirma gunu
      await geri(ogr, 180, { mod: 'serbest', planlanan_dk: 180 });
      const a2 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      expect(sonuc(await bitir(ogr, a2.oturum.istemci_id)).kazanim.dogrulanmamis_sayilan_sn).toBe(
        0,
      );
      an = new Date('2026-11-11T01:30:00.000Z'); // 04:30 Istanbul: yeni gun
      await geri(ogr, 180, { mod: 'serbest', planlanan_dk: 180 });
      const a3 = (await istek(ogr, 'GET', '/odak-oturumlari/acik')).json<{
        oturum: { istemci_id: string };
      }>();
      expect(sonuc(await bitir(ogr, a3.oturum.istemci_id)).kazanim.dogrulanmamis_sayilan_sn).toBe(
        1800,
      );
    });
  });

  it('RLS: baska kurumun oturumlari motivasyon_app ile gorunmez', async () => {
    const ogr = yeniOgrenci();
    await baslat(ogr);
    const baska = await o.isle(uuidv7(), (tx) => tx.execute(sql_sayac(ogr.uyelikId)));
    expect((baska[0] as { n: number }).n).toBe(0);
    const kendi = await o.isle(kurumId, (tx) => tx.execute(sql_sayac(ogr.uyelikId)));
    expect((kendi[0] as { n: number }).n).toBe(1);
  });
});
