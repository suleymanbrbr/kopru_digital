import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = ['odev_ekleri', 'plan_ekleri'] as const;

/** Odev ve plan ek tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve veritabani kisitlari. */
describe.skipIf(dbYok())('ogrenme ek tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const odevA = uuidv7();
  const odevB = uuidv7();
  const planA = uuidv7();
  const planB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const [kurum, sahip, ogrenci, odev, plan] of [
      [kurumA, kullaniciA, ogrenciA, odevA, planA],
      [kurumB, kullaniciB, ogrenciB, odevB, planB],
    ] as const) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${sahip}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`
        insert into ogrenme.odevler (id, kurum_id, baslik, brans_kodu, hedef_turu, hedef_id, veren_id)
        values (${odev}, ${kurum}, 'Odev', 'matematik', 'kurum', ${kurum}, ${ogrenci})`;
      await sistem`
        insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id)
        values (${plan}, ${kurum}, ${ogrenci}, '2030-01-07', ${ogrenci})`;
      await sistem`insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id) values (${uuidv7()}, ${kurum}, ${odev}, ${uuidv7()})`;
      await sistem`insert into ogrenme.plan_ekleri (id, kurum_id, plan_id, medya_dosya_id) values (${uuidv7()}, ${kurum}, ${plan}, ${uuidv7()})`;
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
    const odevEkle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id)
          values (${uuidv7()}, ${kurumB}, ${odevB}, ${uuidv7()})`),
      ),
    );
    expect(odevEkle).toMatch(/row-level security/);
    const planEkle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.plan_ekleri (id, kurum_id, plan_id, medya_dosya_id)
          values (${uuidv7()}, ${kurumB}, ${planB}, ${uuidv7()})`),
      ),
    );
    expect(planEkle).toMatch(/row-level security/);
    for (const tablo of TABLOLAR) {
      const guncel = await withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql.raw(`update ogrenme.${tablo} set sira = 3 where kurum_id = '${kurumB}' returning id`),
        ),
      );
      expect(guncel, tablo).toHaveLength(0);
      const silinen = await withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql.raw(`delete from ogrenme.${tablo} where kurum_id = '${kurumB}' returning id`),
        ),
      );
      expect(silinen, tablo).toHaveLength(0);
      const [b] = await sistem<{ n: number }[]>`
        select count(*)::int n from ${sistem(`ogrenme.${tablo}`)} where kurum_id = ${kurumB}`;
      expect(b?.n, tablo).toBe(1);
    }
  });

  it('api_app, B kurumunun odevine/planina A kurumu adina ek baglayamaz (bilesik FK)', async () => {
    const odev = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id)
          values (${uuidv7()}, ${kurumA}, ${odevB}, ${uuidv7()})`),
      ),
    );
    expect(odev).toMatch(/foreign key|violates/);
    const plan = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.plan_ekleri (id, kurum_id, plan_id, medya_dosya_id)
          values (${uuidv7()}, ${kurumA}, ${planB}, ${uuidv7()})`),
      ),
    );
    expect(plan).toMatch(/foreign key|violates/);
  });

  it('kisitlar: medya dosyasi tek kayda baglanir, sira 0..9 ve kayit basina tekil', async () => {
    const dosya = uuidv7();
    await sistem`insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${odevA}, ${dosya}, 1)`;
    expect(
      await hataMetni(
        sistem`insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${odevA}, ${dosya}, 2)`,
      ),
    ).toMatch(/odev_ekleri_medya_dosya_id_uniq|duplicate/);
    expect(
      await hataMetni(
        sistem`insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${odevA}, ${uuidv7()}, 1)`,
      ),
    ).toMatch(/odev_ekleri_odev_id_sira_uniq|duplicate/);
    expect(
      await hataMetni(
        sistem`insert into ogrenme.odev_ekleri (id, kurum_id, odev_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${odevA}, ${uuidv7()}, 10)`,
      ),
    ).toMatch(/odev_ekleri_sira_chk/);
    expect(
      await hataMetni(
        sistem`insert into ogrenme.plan_ekleri (id, kurum_id, plan_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${planA}, ${uuidv7()}, -1)`,
      ),
    ).toMatch(/plan_ekleri_sira_chk/);
    const [p] = await sistem<{ medya_dosya_id: string }[]>`
      select medya_dosya_id from ogrenme.plan_ekleri where plan_id = ${planA} limit 1`;
    expect(
      await hataMetni(
        sistem`insert into ogrenme.plan_ekleri (id, kurum_id, plan_id, medya_dosya_id, sira) values (${uuidv7()}, ${kurumA}, ${planA}, ${p?.medya_dosya_id ?? ''}, 4)`,
      ),
    ).toMatch(/plan_ekleri_medya_dosya_id_uniq|duplicate/);
  });
});
