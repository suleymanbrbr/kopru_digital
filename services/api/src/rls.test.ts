import { createDb, withTenant, withUser, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/** A ve B kurumlari sistem rolu ile hazirlanir; sorgular `api_app` (NOBYPASSRLS) ile yapilir. */
describe.skipIf(dbYok())('RLS kiraci izolasyonu (api_app)', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const kullaniciCift = uuidv7(); // her iki kurumda uye
  const grupA = uuidv7();
  const grupB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB, kullaniciCift]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164)
                   values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, ad, sahip] of [
      [kurumA, 'Kurum A', kullaniciA],
      [kurumB, 'Kurum B', kullaniciB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, ${ad}, 'kurum', ${sahip})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${uuidv7()}, ${kurum}, ${sahip}, 'sahip')`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${uuidv7()}, ${kurum}, ${kullaniciCift}, 'ogretmen')`;
    }
    await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${grupA}, ${kurumA}, 'grup', 'A grubu')`;
    await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${grupB}, ${kurumB}, 'grup', 'B grubu')`;
  });

  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  const ctx = (kurumId: string, kullaniciId: string) => ({ kurumId, kullaniciId });

  it('A baglami yalnizca A satirlarini gorur; crafted B sorgusu bos doner', async () => {
    const hepsi = await withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
      tx.execute<{ ad: string }>(sql`select ad from hesap.gruplar`),
    );
    expect(hepsi.map((r) => r.ad)).toEqual(['A grubu']);

    const crafted = await withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
      tx.execute(sql`select * from hesap.gruplar where kurum_id = ${kurumB} or id = ${grupB}`),
    );
    expect(crafted).toHaveLength(0);

    const kurumSatiri = await withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
      tx.execute(sql`select id from hesap.kurumlar where id = ${kurumB}`),
    );
    expect(kurumSatiri).toHaveLength(0);
  });

  it('baglam yokken hicbir kiraci satiri gorunmez (fail-closed)', async () => {
    for (const tablo of ['gruplar', 'uyelikler', 'kurumlar', 'subeler', 'modul_ayarlari']) {
      const rows = await app.orm.execute<{ n: number }>(
        sql.raw(`select count(*)::int n from hesap.${tablo}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  it('A baglamindan B kurumuna INSERT reddedilir (WITH CHECK)', async () => {
    const metin = await hataMetni(
      withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
        tx.execute(
          sql`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${uuidv7()}, ${kurumB}, 'grup', 'sizinti')`,
        ),
      ),
    );
    expect(metin).toMatch(/row-level security/);
  });

  it('A baglami B satirini guncelleyemez/silemez (0 satir etkilenir)', async () => {
    const guncel = await withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
      tx.execute(
        sql`update hesap.gruplar set ad = 'ele gecirildi' where id = ${grupB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
      tx.execute(sql`delete from hesap.gruplar where id = ${grupB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const [b] = await sistem`select ad from hesap.gruplar where id = ${grupB}`;
    expect(b?.ad).toBe('B grubu');
  });

  it('bileşik FK: A kurumu satiri B kurumunun grubuna baglanamaz', async () => {
    await expect(
      sistem`insert into hesap.davetler (id, kurum_id, kanal, rol, belirtec_hash, grup_id, davet_eden_id, expires_at)
             values (${uuidv7()}, ${kurumA}, 'baglanti', 'ogrenci', ${Buffer.from(uuidv7())}, ${grupB},
                     (select id from hesap.uyelikler where kurum_id = ${kurumA} and rol = 'sahip'), now() + interval '1 day')`,
    ).rejects.toThrow(/davetler_grup_id_fk/);
  });

  it('kullanici kolu: cift uye kullanici kendi uyeliklerini her iki kurumda gorur ama degistiremez', async () => {
    const liste = await withUser(app, { kullaniciId: kullaniciCift }, (tx) =>
      tx.execute<{ kurum_id: string }>(sql`select kurum_id from hesap.uyelikler`),
    );
    expect(liste.map((r) => r.kurum_id).sort()).toEqual([kurumA, kurumB].sort());

    const guncel = await withUser(app, { kullaniciId: kullaniciCift }, (tx) =>
      tx.execute(
        sql`update hesap.uyelikler set rol = 'sahip' where kullanici_id = ${kullaniciCift} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    // baska kullanicinin uyeligi kullanici kolunda gorunmez
    const baska = await withUser(app, { kullaniciId: kullaniciA }, (tx) =>
      tx.execute(sql`select id from hesap.uyelikler where kullanici_id = ${kullaniciB}`),
    );
    expect(baska).toHaveLength(0);
  });

  it('api_app: defter UPDATE/DELETE yok, taklit kayitlari ve api_owner erisimi yok', async () => {
    expect(await hataMetni(app.orm.execute(sql`delete from hesap.rizalar`))).toMatch(
      /permission denied/,
    );
    expect(
      await hataMetni(app.orm.execute(sql`update hesap.denetim_kayitlari set neden = 'x'`)),
    ).toMatch(/permission denied/);
    expect(await hataMetni(app.orm.execute(sql`select * from hesap.taklit_kayitlari`))).toMatch(
      /permission denied/,
    );
    expect(await hataMetni(app.orm.execute(sql`set role api_owner`))).toMatch(
      /permission denied|must be member|cannot/,
    );
    expect(await hataMetni(app.orm.execute(sql`set role api_sistem`))).toMatch(
      /permission denied|must be member|cannot/,
    );
    expect(await hataMetni(app.orm.execute(sql`update ortak.outbox set sent_at = now()`))).toMatch(
      /permission denied/,
    );
  });

  it('api_sistem RLS atlar (BYPASSRLS)', async () => {
    const [r] =
      await sistem`select count(*)::int n from hesap.gruplar where id in (${grupA}, ${grupB})`;
    expect(r?.n).toBe(2);
  });

  it('SECURITY DEFINER davet_coz: kiraci baglami olmadan yalnizca dar kimlik doner', async () => {
    const hash = Buffer.from(uuidv7().replaceAll('-', ''), 'hex');
    const [eden] = await sistem<
      { id: string }[]
    >`select id from hesap.uyelikler where kurum_id = ${kurumA} and rol = 'sahip'`;
    await sistem`insert into hesap.davetler (id, kurum_id, kanal, rol, belirtec_hash, davet_eden_id, expires_at)
                 values (${uuidv7()}, ${kurumA}, 'baglanti', 'ogrenci', ${hash}, ${eden?.id ?? ''}, now() + interval '1 day')`;
    const bulunan = await app.orm.execute<{ kurum_id: string; durum: string }>(
      sql`select * from hesap.davet_coz(${hash})`,
    );
    expect(bulunan).toHaveLength(1);
    expect(bulunan[0]?.kurum_id).toBe(kurumA);
    // tablonun kendisine dogrudan erisim yine kapali
    expect(await app.orm.execute(sql`select * from hesap.davetler`)).toHaveLength(0);
  });

  it('son sahip ayrilamaz (ertelenmis kisit)', async () => {
    const metin = await hataMetni(
      withTenant(app, ctx(kurumA, kullaniciA), (tx) =>
        tx.execute(
          sql`update hesap.uyelikler set durum = 'ayrildi', ayrildi_at = now() where kurum_id = ${kurumA} and rol = 'sahip'`,
        ),
      ),
    );
    expect(metin).toMatch(/son_sahip_ayrilamaz/);
  });
});
