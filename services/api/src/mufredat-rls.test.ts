import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/** `ogrenme` mufredat tablolari: karma RLS (konular), kiraci izolasyonu (atamalar), kisitlar, tetikleyiciler. */
describe.skipIf(dbYok())('mufredat tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const globalUnite = uuidv7();
  const globalKonu = uuidv7();
  const konuA = uuidv7();
  const konuB = uuidv7();
  const atamaA = uuidv7();
  const atamaB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });
  const konuEkle = (
    id: string,
    kurum: string | null,
    ek: { ust?: string | null; seviye?: string; katalog?: string | null } = {},
  ) => sistem`
    insert into ogrenme.konular (id, kurum_id, katalog_kodu, brans_kodu, ust_id, seviye, ad, gecerli_surum_baslangic)
    values (${id}, ${kurum}, ${kurum === null ? (ek.katalog ?? 'ydt') : null}, 'matematik', ${ek.ust ?? null},
            ${ek.seviye ?? 'unite'}, 'Konu', ${kurum === null ? 1 : null})`;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const [kurum, kullanici] of [
      [kurumA, kullaniciA],
      [kurumB, kullaniciB],
    ] as const) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${kullanici})`;
    }
    await sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad, yayinlandi_at)
      values (${uuidv7()}, 'okul', 1, 'Okul 1', null)`;
    await konuEkle(globalUnite, null);
    await konuEkle(globalKonu, null, { ust: globalUnite, seviye: 'konu' });
    await konuEkle(konuA, kurumA);
    await konuEkle(konuB, kurumB);
    for (const [id, kurum] of [
      [atamaA, kurumA],
      [atamaB, kurumB],
    ] as const) {
      await sistem`insert into ogrenme.mufredat_atamalari (id, kurum_id, kapsam, kapsam_id, katalog_kodu, surum_no)
        values (${id}, ${kurum}, 'kurum', ${kurum}, 'okul', 1)`;
    }
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

  it('konular: global satirlar herkese, kurum satirlari yalniz sahibine gorunur', async () => {
    const gorunen = await idler(ctxA(), 'konular');
    expect(gorunen).toEqual(expect.arrayContaining([globalUnite, globalKonu, konuA]));
    expect(gorunen).not.toContain(konuB);
    const crafted = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`select id from ogrenme.konular where id = ${konuB}`),
    );
    expect(crafted).toHaveLength(0);
  });

  it('konular: baglam yokken yalniz global satirlar gorunur (fail-closed)', async () => {
    const rows = await app.orm.execute<{ id: string }>(sql`select id from ogrenme.konular`);
    const gorunen = rows.map((r) => r.id);
    expect(gorunen).toContain(globalUnite);
    expect(gorunen).not.toContain(konuA);
    expect(gorunen).not.toContain(konuB);
  });

  it('atamalar: A yalniz kendi atamasini gorur; baglam yokken bos', async () => {
    expect(await idler(ctxA(), 'mufredat_atamalari')).toEqual([atamaA]);
    const bos = await app.orm.execute<{ n: number }>(
      sql`select count(*)::int n from ogrenme.mufredat_atamalari`,
    );
    expect(bos[0]?.n).toBe(0);
  });

  it('api_app global satiri yazamaz, B kurumuna yazamaz; UPDATE B ve global satirina etkisiz', async () => {
    const ekleGlobal = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.konular (id, kurum_id, katalog_kodu, brans_kodu, seviye, ad, gecerli_surum_baslangic)
          values (${uuidv7()}, null, 'ydt', 'matematik', 'unite', 'X', 1)`),
      ),
    );
    expect(ekleGlobal).toMatch(/row-level security/);
    const ekleB = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad)
          values (${uuidv7()}, ${kurumB}, 'matematik', 'unite', 'X')`),
      ),
    );
    expect(ekleB).toMatch(/row-level security/);
    for (const id of [konuB, globalUnite]) {
      const guncel = await withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql`update ogrenme.konular set ad = 'ele gecirildi' where id = ${id} returning id`,
        ),
      );
      expect(guncel).toHaveLength(0);
    }
    // kendi satirini baska kuruma tasiyamaz
    const tasi = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`update ogrenme.konular set kurum_id = ${kurumB} where id = ${konuA}`),
      ),
    );
    expect(tasi).toMatch(/row-level security/);
    const [ad] = await sistem<
      { ad: string }[]
    >`select ad from ogrenme.konular where id in (${konuB}, ${globalUnite}) and ad = 'ele gecirildi'`;
    expect(ad).toBeUndefined();
  });

  it('DELETE yetkisi yok (konular); surumler api_app icin salt okunur; atamalar baska kuruma yazilamaz', async () => {
    expect(
      await hataMetni(
        withTenant(app, ctxA(), (tx) =>
          tx.execute(sql`delete from ogrenme.konular where id = ${konuA}`),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await hataMetni(
        withTenant(app, ctxA(), (tx) =>
          tx.execute(sql`
            insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad) values (${uuidv7()}, 'lgs', 99, 'x')`),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await hataMetni(
        withTenant(app, ctxA(), (tx) =>
          tx.execute(sql`
            insert into ogrenme.mufredat_atamalari (id, kurum_id, kapsam, kapsam_id, katalog_kodu, surum_no)
            values (${uuidv7()}, ${kurumB}, 'grup', ${uuidv7()}, 'okul', 1)`),
        ),
      ),
    ).toMatch(/row-level security/);
    const surumler = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`select id from ogrenme.mufredat_surumleri`),
    );
    expect(surumler.length).toBeGreaterThan(0);
  });

  it('ust-alt kapsam tetikleyicisi: global ustu global olmali, kurum konusu baska kurumun ustunu kullanamaz', async () => {
    const globalAltKurumUst = await hataMetni(
      konuEkle(uuidv7(), null, { ust: konuA, seviye: 'konu' }),
    );
    expect(globalAltKurumUst).toMatch(/konu_ust_kapsami/);
    const baskaKatalog = await hataMetni(
      konuEkle(uuidv7(), null, { ust: globalUnite, seviye: 'konu', katalog: 'tyt' }),
    );
    expect(baskaKatalog).toMatch(/konu_ust_kapsami/);
    const baskaKurum = await hataMetni(konuEkle(uuidv7(), kurumA, { ust: konuB, seviye: 'konu' }));
    expect(baskaKurum).toMatch(/konu_ust_kapsami/);
    // gecerli: kurum konusu global veya kendi kurumunun ustu altinda
    await konuEkle(uuidv7(), kurumA, { ust: globalUnite, seviye: 'konu' });
    await konuEkle(uuidv7(), kurumA, { ust: konuA, seviye: 'konu' });
    // ust_id guncellemesi de denetlenir
    const guncelle = await hataMetni(
      sistem`update ogrenme.konular set ust_id = ${konuB} where id = ${globalKonu}`,
    );
    expect(guncelle).toMatch(/konu_ust_kapsami/);
  });

  it('kisitlar: global/kurum alanlari, surum araligi, sinif seviyesi, katalog kodu, yayinli surum degismez', async () => {
    const globalEksik = await hataMetni(
      sistem`insert into ogrenme.konular (id, brans_kodu, seviye, ad) values (${uuidv7()}, 'matematik', 'unite', 'x')`,
    );
    expect(globalEksik).toMatch(/konular_global_chk/);
    const kurumKatalogLu = await hataMetni(
      sistem`insert into ogrenme.konular (id, kurum_id, katalog_kodu, brans_kodu, seviye, ad)
             values (${uuidv7()}, ${kurumA}, 'lgs', 'matematik', 'unite', 'x')`,
    );
    expect(kurumKatalogLu).toMatch(/konular_kurum_chk/);
    const aralik = await hataMetni(
      sistem`insert into ogrenme.konular (id, katalog_kodu, brans_kodu, seviye, ad, gecerli_surum_baslangic, gecerli_surum_bitis)
             values (${uuidv7()}, 'lgs', 'matematik', 'unite', 'x', 2, 2)`,
    );
    expect(aralik).toMatch(/konular_surum_araligi_chk/);
    const sinif = await hataMetni(
      sistem`insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad, sinif_seviyesi)
             values (${uuidv7()}, ${kurumA}, 'matematik', 'unite', 'x', 13)`,
    );
    expect(sinif).toMatch(/konular_sinif_seviyesi_chk/);
    await sistem`insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad, sinif_seviyesi)
                 values (${uuidv7()}, ${kurumA}, 'matematik', 'unite', 'x', 9)`;
    const katalog = await hataMetni(
      sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad) values (${uuidv7()}, 'xyz', 1, 'x')`,
    );
    expect(katalog).toMatch(/mufredat_surumleri_katalog_kodu_chk/);

    await sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad, yayinlandi_at)
                 values (${uuidv7()}, 'okul', 7, 'Yayinli', now())`;
    const degis = await hataMetni(
      sistem`update ogrenme.mufredat_surumleri set ad = 'degisti' where katalog_kodu = 'okul' and surum_no = 7`,
    );
    expect(degis).toMatch(/yayinli_surum_degismez/);
    const tekil = await hataMetni(
      sistem`insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad) values (${uuidv7()}, 'okul', 7, 'x')`,
    );
    expect(tekil).toMatch(/duplicate|uniq/);
  });

  it('atama tekilligi ve surum FK: ayni kapsam/katalog iki kez yazilamaz, olmayan surum atanamaz', async () => {
    const tekrar = await hataMetni(
      sistem`insert into ogrenme.mufredat_atamalari (id, kurum_id, kapsam, kapsam_id, katalog_kodu, surum_no)
             values (${uuidv7()}, ${kurumA}, 'kurum', ${kurumA}, 'okul', 1)`,
    );
    expect(tekrar).toMatch(/mufredat_atamalari_kapsam_uniq|duplicate/);
    const yok = await hataMetni(
      sistem`insert into ogrenme.mufredat_atamalari (id, kurum_id, kapsam, kapsam_id, katalog_kodu, surum_no)
             values (${uuidv7()}, ${kurumA}, 'grup', ${uuidv7()}, 'okul', 42)`,
    );
    expect(yok).toMatch(/mufredat_atamalari_surum_fk|foreign key/);
  });
});
