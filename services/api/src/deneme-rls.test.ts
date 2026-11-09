import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/**
 * `ogrenme` deneme tablolari: karma RLS (deneme_kurallari), kiraci izolasyonu (denemeler, bolumler),
 * kisitlar ve uretilmis `net` sutunu. Uygulama rolu (`api_app`) ile.
 */
describe.skipIf(dbYok())('deneme tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const kuralA = uuidv7();
  const kuralB = uuidv7();
  const denemeA = uuidv7();
  const denemeB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  const kuralEkle = (id: string, kurum: string, kod: string) => sistem`
    insert into ogrenme.deneme_kurallari (id, kurum_id, kod, ad, yanlis_katsayisi, bolumler)
    values (${id}, ${kurum}, ${kod}, 'Ozel', 0.25,
            '[{"bolum_kodu":"a","brans_kodu":"matematik","ad":"A","soru_sayisi":10}]'::jsonb)`;
  const denemeEkle = (id: string, kurum: string, ogrenci: string, kural: string) => sistem`
    insert into ogrenme.denemeler (id, kurum_id, ogrenci_id, kural_id, kural_kodu, yanlis_katsayisi, ad,
                                   sinav_tarihi, giren_id, kaynak, onay_durumu, onaylayan_id, onay_at)
    values (${id}, ${kurum}, ${ogrenci}, ${kural}, 'ozel_x', 0.25, 'D', '2026-03-01', ${ogrenci}, 'ogrenci',
            'bekliyor', null, null)`;
  const bolumEkle = (denemeId: string, kurum: string, ek = {}) => {
    const b = { kod: 'a', brans: 'matematik', soru: 10, dogru: 8, yanlis: 2, bos: 0, ...ek };
    return sistem`
      insert into ogrenme.deneme_bolumleri (id, kurum_id, deneme_id, bolum_kodu, brans_kodu, soru_sayisi, dogru, yanlis, bos, katsayi)
      values (${uuidv7()}, ${kurum}, ${denemeId}, ${b.kod}, ${b.brans}, ${b.soru}, ${b.dogru}, ${b.yanlis}, ${b.bos}, 0.25)`;
  };

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const [kurum, kullanici, ogrenci] of [
      [kurumA, kullaniciA, ogrenciA],
      [kurumB, kullaniciB, ogrenciB],
    ] as const) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${kullanici})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${kullanici}, 'ogrenci')`;
    }
    await kuralEkle(kuralA, kurumA, 'ozel_a');
    await kuralEkle(kuralB, kurumB, 'ozel_b');
    await denemeEkle(denemeA, kurumA, ogrenciA, kuralA);
    await denemeEkle(denemeB, kurumB, ogrenciB, kuralB);
    await bolumEkle(denemeA, kurumA);
    await bolumEkle(denemeB, kurumB);
  });
  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  const idler = async (ctx: ReturnType<typeof ctxA>, tablo: string) =>
    (
      await withTenant(app, ctx, (tx) =>
        tx.execute<{ id: string }>(sql.raw(`select id from ogrenme.${tablo}`)),
      )
    ).map((r) => r.id);

  it('deneme_kurallari: global kurallar herkese, kurum ozel kurali yalniz sahibine gorunur', async () => {
    const rows = await withTenant(app, ctxA(), (tx) =>
      tx.execute<{ id: string; kod: string; kurum_id: string | null }>(
        sql`select id, kod, kurum_id from ogrenme.deneme_kurallari`,
      ),
    );
    const kodlar = rows.filter((r) => r.kurum_id === null).map((r) => r.kod);
    expect(kodlar).toEqual(
      expect.arrayContaining(['lgs', 'tyt', 'ayt_say', 'ayt_ea', 'ayt_soz', 'ayt_dil', 'ydt']),
    );
    expect(rows.map((r) => r.id)).toContain(kuralA);
    expect(rows.map((r) => r.id)).not.toContain(kuralB);
    const crafted = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`select id from ogrenme.deneme_kurallari where id = ${kuralB}`),
    );
    expect(crafted).toHaveLength(0);
  });

  it('deneme_kurallari: baglam yokken yalniz global kurallar gorunur (fail-closed)', async () => {
    const rows = await app.orm.execute<{ id: string; kurum_id: string | null }>(
      sql`select id, kurum_id from ogrenme.deneme_kurallari`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.every((r) => r.kurum_id === null)).toBe(true);
  });

  it('api_app global kurali yazamaz/degistiremez/silemez; baska kuruma yazamaz', async () => {
    const ekleGlobal = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.deneme_kurallari (id, kurum_id, kod, ad, yanlis_katsayisi, bolumler)
          values (${uuidv7()}, null, 'xyz', 'X', 0.25,
                  '[{"bolum_kodu":"a","brans_kodu":"matematik","ad":"A","soru_sayisi":10}]'::jsonb)`),
      ),
    );
    expect(ekleGlobal).toMatch(/row-level security/);
    const ekleB = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.deneme_kurallari (id, kurum_id, kod, ad, yanlis_katsayisi, bolumler)
          values (${uuidv7()}, ${kurumB}, 'ozel_zz', 'X', 0.25,
                  '[{"bolum_kodu":"a","brans_kodu":"matematik","ad":"A","soru_sayisi":10}]'::jsonb)`),
      ),
    );
    expect(ekleB).toMatch(/row-level security/);
    for (const id of [kuralB]) {
      const guncel = await withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql`update ogrenme.deneme_kurallari set ad = 'ele gecirildi' where id = ${id} returning id`,
        ),
      );
      expect(guncel).toHaveLength(0);
      const silinen = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`delete from ogrenme.deneme_kurallari where id = ${id} returning id`),
      );
      expect(silinen).toHaveLength(0);
    }
    const globalGuncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update ogrenme.deneme_kurallari set yanlis_katsayisi = 0.5 where kurum_id is null returning id`,
      ),
    );
    expect(globalGuncel).toHaveLength(0);
    const globalSil = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ogrenme.deneme_kurallari where kurum_id is null returning id`),
    );
    expect(globalSil).toHaveLength(0);
    const [lgs] = await sistem<{ k: string }[]>`
      select yanlis_katsayisi::text k from ogrenme.deneme_kurallari where kod = 'lgs' and kurum_id is null`;
    expect(lgs?.k).toBe('0.3333');
    // ozel kural kodu `ozel_` onekli, global degil: kisit
    const kod = await hataMetni(
      sistem`insert into ogrenme.deneme_kurallari (id, kurum_id, kod, ad, yanlis_katsayisi, bolumler)
        values (${uuidv7()}, ${kurumA}, 'tyt2', 'X', 0.25, '[{"a":1}]'::jsonb)`,
    );
    expect(kod).toMatch(/deneme_kurallari_kapsam_kod_chk/);
  });

  it('denemeler ve bolumler: A yalniz kendi satirlarini gorur; baglam yokken bos', async () => {
    expect(await idler(ctxA(), 'denemeler')).toEqual([denemeA]);
    const bolumKurumlari = await withTenant(app, ctxA(), (tx) =>
      tx.execute<{ kurum_id: string }>(sql`select kurum_id from ogrenme.deneme_bolumleri`),
    );
    expect(bolumKurumlari.map((b) => b.kurum_id)).toEqual([kurumA]);
    for (const tablo of ['denemeler', 'deneme_bolumleri']) {
      const bos = await app.orm.execute<{ n: number }>(
        sql.raw(`select count(*)::int n from ogrenme.${tablo}`),
      );
      expect(bos[0]?.n).toBe(0);
    }
    const crafted = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`select id from ogrenme.denemeler where id = ${denemeB}`),
    );
    expect(crafted).toHaveLength(0);
  });

  it('A, B kurumuna deneme/bolum yazamaz ve B satirini guncelleyemez/silemez', async () => {
    const ekle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.denemeler (id, kurum_id, ogrenci_id, kural_id, kural_kodu, yanlis_katsayisi, ad,
                                         sinav_tarihi, giren_id, kaynak)
          values (${uuidv7()}, ${kurumB}, ${ogrenciB}, ${kuralB}, 'ozel_b', 0.25, 'X', '2026-03-02', ${ogrenciB}, 'ogrenci')`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);
    const bolum = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.deneme_bolumleri (id, kurum_id, deneme_id, bolum_kodu, brans_kodu, soru_sayisi, dogru, yanlis, bos, katsayi)
          values (${uuidv7()}, ${kurumB}, ${denemeB}, 'b', 'matematik', 10, 5, 5, 0, 0.25)`),
      ),
    );
    expect(bolum).toMatch(/row-level security/);
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`update ogrenme.denemeler set ad = 'x' where id = ${denemeB} returning id`),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ogrenme.denemeler where id = ${denemeB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const [hala] = await sistem<
      { ad: string }[]
    >`select ad from ogrenme.denemeler where id = ${denemeB}`;
    expect(hala?.ad).toBe('D');
  });

  it('bolum kisitlari: toplam, negatif, tekil bolum_kodu; ayni brans iki bolum (Tarih-1/Tarih-2)', async () => {
    expect(
      await hataMetni(bolumEkle(denemeA, kurumA, { kod: 'x1', dogru: 5, yanlis: 5, bos: 5 })),
    ).toMatch(/deneme_bolumleri_toplam_chk/);
    expect(
      await hataMetni(bolumEkle(denemeA, kurumA, { kod: 'x2', dogru: -1, yanlis: 6, bos: 5 })),
    ).toMatch(/deneme_bolumleri_sayilar_chk/);
    expect(await hataMetni(bolumEkle(denemeA, kurumA))).toMatch(
      /deneme_bolumleri_deneme_id_bolum_kodu_uniq/,
    );
    await bolumEkle(denemeA, kurumA, { kod: 'tarih_1', brans: 'tarih' });
    await bolumEkle(denemeA, kurumA, { kod: 'tarih_2', brans: 'tarih' });
    // gecersiz brans: FK
    expect(await hataMetni(bolumEkle(denemeA, kurumA, { kod: 'x3', brans: 'yok_boyle' }))).toMatch(
      /deneme_bolumleri_brans_kodu_fk/,
    );
  });

  it('net: veritabani uretilmis sutunu (dogru - yanlis x katsayi, 2 ondalik); yazilamaz', async () => {
    await bolumEkle(denemeA, kurumA, { kod: 'n1', soru: 30, dogru: 20, yanlis: 1, bos: 9 });
    const [r] = await sistem<{ net: string }[]>`
      select net::text from ogrenme.deneme_bolumleri where deneme_id = ${denemeA} and bolum_kodu = 'n1'`;
    expect(r?.net).toBe('19.75');
    const yaz = await hataMetni(
      sistem`update ogrenme.deneme_bolumleri set net = 1 where deneme_id = ${denemeA} and bolum_kodu = 'n1'`,
    );
    expect(yaz).toMatch(/generated column|cannot be updated|can only be updated to DEFAULT/i);
  });

  it('deneme onay kisitlari: ogretmen girisi bekleyemez; onayli kayit onaylayan ister; red nedeni ister', async () => {
    const dene = (ek: string) =>
      hataMetni(
        sistem.unsafe(`
          insert into ogrenme.denemeler (id, kurum_id, ogrenci_id, kural_id, kural_kodu, yanlis_katsayisi, ad,
                                         sinav_tarihi, giren_id, kaynak, onay_durumu, onaylayan_id, onay_at, red_nedeni)
          values ('${uuidv7()}', '${kurumA}', '${ogrenciA}', '${kuralA}', 'ozel_a', 0.25, 'K${uuidv7()}',
                  '2026-04-01', '${ogrenciA}', ${ek})`),
      );
    expect(await dene(`'ogretmen', 'bekliyor', null, null, null`)).toMatch(
      /denemeler_ogretmen_onayli_chk/,
    );
    expect(await dene(`'ogrenci', 'onaylandi', null, null, null`)).toMatch(/denemeler_onay_chk/);
    expect(await dene(`'ogrenci', 'reddedildi', '${ogrenciA}', now(), null`)).toMatch(
      /denemeler_onay_chk/,
    );
    // ogrenci girisi baskasi adina olamaz
    expect(
      await hataMetni(sistem`
        insert into ogrenme.denemeler (id, kurum_id, ogrenci_id, kural_id, kural_kodu, yanlis_katsayisi, ad,
                                       sinav_tarihi, giren_id, kaynak)
        values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${kuralA}, 'ozel_a', 0.25, 'Z', '2026-04-02', ${uuidv7()}, 'ogrenci')`),
    ).toMatch(/denemeler_giren_id_fk|denemeler_kaynak_giren_chk/);
  });

  it('global kural tohumu: 7 kural, katsayilar ve brans kodlari gecerli, bolum kodlari tekil', async () => {
    const rows = await sistem<
      {
        kod: string;
        k: string;
        bolumler: { bolum_kodu: string; brans_kodu: string; soru_sayisi: number }[];
      }[]
    >`select kod, yanlis_katsayisi::text k, bolumler from ogrenme.deneme_kurallari where kurum_id is null order by kod`;
    expect(rows.map((r) => [r.kod, r.k])).toEqual([
      ['ayt_dil', '0.2500'],
      ['ayt_ea', '0.2500'],
      ['ayt_say', '0.2500'],
      ['ayt_soz', '0.2500'],
      ['lgs', '0.3333'],
      ['tyt', '0.2500'],
      ['ydt', '0.2500'],
    ]);
    const toplam = (kod: string) =>
      rows.find((r) => r.kod === kod)?.bolumler.reduce((t, b) => t + b.soru_sayisi, 0);
    expect(toplam('lgs')).toBe(90);
    expect(toplam('tyt')).toBe(120);
    expect(toplam('ayt_say')).toBe(80);
    expect(toplam('ayt_ea')).toBe(80);
    expect(toplam('ayt_soz')).toBe(80);
    expect(toplam('ydt')).toBe(80);
    for (const r of rows) {
      const kodlar = r.bolumler.map((b) => b.bolum_kodu);
      expect(new Set(kodlar).size).toBe(kodlar.length);
    }
    const soz = rows.find((r) => r.kod === 'ayt_soz')?.bolumler ?? [];
    expect(soz.filter((b) => b.brans_kodu === 'tarih').map((b) => b.bolum_kodu)).toEqual([
      'tarih_1',
      'tarih_2',
    ]);
  });
});
