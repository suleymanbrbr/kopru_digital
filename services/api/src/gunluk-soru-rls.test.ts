import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = [
  'kaynak_kitaplar',
  'kaynak_kitap_testleri',
  'gunluk_soru_kayitlari',
  'gunluk_soru_dosyalari',
] as const;

/** Gunluk soru takibi tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve veritabani kisitlari. */
describe.skipIf(dbYok())('ogrenme gunluk soru tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const kitapA = uuidv7();
  const kitapB = uuidv7();
  const testA = uuidv7();
  const testB = uuidv7();
  const kayitA = uuidv7();
  const kayitB = uuidv7();
  const konu = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  async function kayitEkle(
    kurum: string,
    ogrenci: string,
    ek: {
      id?: string;
      zorluk?: string;
      dogru?: number;
      yanlis?: number;
      bos?: number;
      test?: string | null;
      metin?: string | null;
      istek?: string | null;
    } = {},
  ) {
    const id = ek.id ?? uuidv7();
    await sistem`
      insert into ogrenme.gunluk_soru_kayitlari
        (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, kaynak_test_id, kaynak_metin, dogru, yanlis, bos, istek_id)
      values (${id}, ${kurum}, ${ogrenci}, '2030-01-08', 'matematik', ${konu}, ${ek.zorluk ?? 'orta'},
              ${ek.test ?? null}, ${ek.metin ?? null}, ${ek.dogru ?? 5}, ${ek.yanlis ?? 3}, ${ek.bos ?? 2},
              ${ek.istek ?? null})`;
    return id;
  }

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, ogrenci, kitap, test, kayit] of [
      [kurumA, kullaniciA, ogrenciA, kitapA, testA, kayitA],
      [kurumB, kullaniciB, ogrenciB, kitapB, testB, kayitB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`insert into ogrenme.kaynak_kitaplar (id, kurum_id, ad, brans_kodu) values (${kitap}, ${kurum}, 'Kitap', 'matematik')`;
      await sistem`insert into ogrenme.kaynak_kitap_testleri (id, kurum_id, kitap_id, sira, ad, soru_sayisi) values (${test}, ${kurum}, ${kitap}, 1, 'Test 1', 20)`;
      await kayitEkle(kurum, ogrenci, { id: kayit, test });
      await sistem`insert into ogrenme.gunluk_soru_dosyalari (id, kurum_id, kayit_id, medya_dosya_id) values (${uuidv7()}, ${kurum}, ${kayit}, ${uuidv7()})`;
    }
  });

  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  it.each(TABLOLAR)(
    '%s: A baglami yalniz A satirlarini gorur, B icin hazirlanmis sorgu bos doner',
    async (tablo) => {
      const hepsi = await withTenant(app, ctxA(), (tx) =>
        tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from ogrenme.${tablo}`)),
      );
      expect(hepsi.length).toBeGreaterThan(0);
      expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
      const crafted = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql.raw(`select * from ogrenme.${tablo} where kurum_id = '${kurumB}'`)),
      );
      expect(crafted).toHaveLength(0);
    },
  );

  it.each(TABLOLAR)('%s: baglam yokken hicbir satir gorunmez (fail-closed)', async (tablo) => {
    const rows = await app.orm.execute<{ n: number }>(
      sql.raw(`select count(*)::int n from ogrenme.${tablo}`),
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('A baglamindan B kurumuna INSERT reddedilir (WITH CHECK), UPDATE/DELETE B satirina etkisiz', async () => {
    const ekle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.gunluk_soru_kayitlari (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru)
          values (${uuidv7()}, ${kurumB}, ${ogrenciB}, '2030-01-08', 'matematik', ${konu}, 'kolay', 1)`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update ogrenme.gunluk_soru_kayitlari set dogru = 99 where id = ${kayitB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ogrenme.gunluk_soru_kayitlari where id = ${kayitB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const [b] = await sistem<
      { dogru: number }[]
    >`select dogru from ogrenme.gunluk_soru_kayitlari where id = ${kayitB}`;
    expect(b?.dogru).toBe(5);
  });

  it('api_app, B kurumunun testine ya da kaydina A kurumu adina baglanamaz (bilesik FK)', async () => {
    const test = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.gunluk_soru_kayitlari (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, kaynak_test_id)
          values (${uuidv7()}, ${kurumA}, ${ogrenciA}, '2030-01-08', 'matematik', ${konu}, 'kolay', 1, ${testB})`),
      ),
    );
    expect(test).toMatch(/foreign key|violates/);
    const dosya = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.gunluk_soru_dosyalari (id, kurum_id, kayit_id, medya_dosya_id)
          values (${uuidv7()}, ${kurumA}, ${kayitB}, ${uuidv7()})`),
      ),
    );
    expect(dosya).toMatch(/foreign key|violates/);
  });

  it('gunluk_soru_kayitlari: aynalanan toplam, zorluk, sayilar, kaynak ve istek_id kisitlari', async () => {
    expect(await hataMetni(kayitEkle(kurumA, ogrenciA, { zorluk: 'cok_zor' }))).toMatch(
      /gunluk_soru_kayitlari_zorluk_chk/,
    );
    expect(await hataMetni(kayitEkle(kurumA, ogrenciA, { dogru: -1 }))).toMatch(
      /gunluk_soru_kayitlari_sayilar_chk/,
    );
    expect(await hataMetni(kayitEkle(kurumA, ogrenciA, { dogru: 0, yanlis: 0, bos: 0 }))).toMatch(
      /gunluk_soru_kayitlari_toplam_chk/,
    );
    expect(
      await hataMetni(kayitEkle(kurumA, ogrenciA, { dogru: 400, yanlis: 100, bos: 1 })),
    ).toMatch(/gunluk_soru_kayitlari_toplam_chk/);
    expect(await hataMetni(kayitEkle(kurumA, ogrenciA, { test: testA, metin: 'Serbest' }))).toMatch(
      /gunluk_soru_kayitlari_kaynak_chk/,
    );
    const [k] = await sistem<{ toplam: number }[]>`
      select toplam from ogrenme.gunluk_soru_kayitlari where id = ${kayitA}`;
    expect(k?.toplam).toBe(10);
    const istek = uuidv7();
    await kayitEkle(kurumA, ogrenciA, { istek });
    expect(await hataMetni(kayitEkle(kurumA, ogrenciA, { istek }))).toMatch(
      /gunluk_soru_kayitlari_istek_id_uniq|duplicate/,
    );
  });

  it('kaynak_kitap_testleri ve dosyalar: sira ve soru sayisi kisitlari, dosya tekil', async () => {
    const testEkle = (sira: number, soru: number) =>
      hataMetni(sistem`
        insert into ogrenme.kaynak_kitap_testleri (id, kurum_id, kitap_id, sira, ad, soru_sayisi)
        values (${uuidv7()}, ${kurumA}, ${kitapA}, ${sira}, 'T', ${soru})`);
    expect(await testEkle(1, 10)).toMatch(/kaynak_kitap_testleri_kitap_id_sira_uniq|duplicate/);
    expect(await testEkle(0, 10)).toMatch(/kaynak_kitap_testleri_sira_chk/);
    expect(await testEkle(2, 0)).toMatch(/kaynak_kitap_testleri_soru_sayisi_chk/);
    const [d] = await sistem<{ medya_dosya_id: string }[]>`
      select medya_dosya_id from ogrenme.gunluk_soru_dosyalari where kayit_id = ${kayitA}`;
    const ayni = await hataMetni(sistem`
      insert into ogrenme.gunluk_soru_dosyalari (id, kurum_id, kayit_id, medya_dosya_id, sira)
      values (${uuidv7()}, ${kurumA}, ${kayitA}, ${d?.medya_dosya_id ?? ''}, 1)`);
    expect(ayni).toMatch(/gunluk_soru_dosyalari_medya_dosya_id_uniq|duplicate/);
    const sira = await hataMetni(sistem`
      insert into ogrenme.gunluk_soru_dosyalari (id, kurum_id, kayit_id, medya_dosya_id, sira)
      values (${uuidv7()}, ${kurumA}, ${kayitA}, ${uuidv7()}, 5)`);
    expect(sira).toMatch(/gunluk_soru_dosyalari_sira_chk/);
  });
});
