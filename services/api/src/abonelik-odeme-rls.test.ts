import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/** `abonelik.odeme_oturumlari` (migration 0019) icin kiraci izolasyonu ve yetki ayrimi (`api_app`, NOBYPASSRLS). */
describe.skipIf(dbYok())('abonelik.odeme_oturumlari: RLS izolasyonu, yetkiler ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const oturumA = uuidv7();
  const oturumB = uuidv7();
  let planId = '';
  let sistem: postgres.Sql;
  let app: Database;
  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    const [p] = await sistem<{ id: string }[]>`
      select id from abonelik.planlar where kod = 'kurum' and surum = 1`;
    planId = p?.id ?? '';
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, oturum] of [
      [kurumA, kullaniciA, oturumA],
      [kurumB, kullaniciB, oturumB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into abonelik.odeme_oturumlari (id, kurum_id, kaynak, dis_islem_id, plan_id, periyot, tutar_kurus, kdv_kurus)
        values (${oturum}, ${kurum}, 'iyzico', ${`tok_${oturum}`}, ${planId}, 'aylik', 599880, 99980)`;
    }
  });
  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  it('A baglami yalniz A oturumunu gorur; B icin hazirlanmis sorgu bos doner', async () => {
    const hepsi = await withTenant(app, ctxA(), (tx) =>
      tx.execute<{ kurum_id: string }>(sql`select kurum_id from abonelik.odeme_oturumlari`),
    );
    expect(hepsi.length).toBeGreaterThan(0);
    expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
    const crafted = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`select * from abonelik.odeme_oturumlari where kurum_id = ${kurumB}`),
    );
    expect(crafted).toHaveLength(0);
  });

  it('baglam yokken hicbir satir gorunmez (fail-closed)', async () => {
    const rows = await app.orm.execute<{ n: number }>(
      sql`select count(*)::int n from abonelik.odeme_oturumlari`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('uygulama rolu yazamaz (yazma yalniz _sistem)', async () => {
    for (const komut of [
      sql`insert into abonelik.odeme_oturumlari (id, kurum_id, kaynak, plan_id, periyot, tutar_kurus, kdv_kurus)
          values (${uuidv7()}, ${kurumA}, 'iyzico', ${planId}, 'aylik', 1, 0)`,
      sql`update abonelik.odeme_oturumlari set durum = 'tamamlandi' where id = ${oturumA}`,
      sql`delete from abonelik.odeme_oturumlari where id = ${oturumA}`,
    ]) {
      expect(await hataMetni(withTenant(app, ctxA(), (tx) => tx.execute(komut)))).toMatch(
        /permission denied/,
      );
    }
  });

  it('kisitlar: kaynak, periyot, durum, tutar ve saglayici belirteci tekilligi', async () => {
    const ekle = (
      kaynak: string,
      periyot: string,
      durum: string,
      tutar: number,
      kdv: number,
      token: string,
    ) => sistem`insert into abonelik.odeme_oturumlari (id, kurum_id, kaynak, dis_islem_id, plan_id, periyot, durum, tutar_kurus, kdv_kurus)
        values (${uuidv7()}, ${kurumA}, ${kaynak}, ${token}, ${planId}, ${periyot}, ${durum}, ${tutar}, ${kdv})`;
    expect(await hataMetni(ekle('apple', 'aylik', 'bekliyor', 1, 0, 'a'))).toMatch(
      /odeme_oturumlari_kaynak_chk/,
    );
    expect(await hataMetni(ekle('iyzico', 'haftalik', 'bekliyor', 1, 0, 'b'))).toMatch(
      /odeme_oturumlari_periyot_chk/,
    );
    expect(await hataMetni(ekle('iyzico', 'aylik', 'x', 1, 0, 'c'))).toMatch(
      /odeme_oturumlari_durum_chk/,
    );
    expect(await hataMetni(ekle('iyzico', 'aylik', 'bekliyor', 10, 11, 'd'))).toMatch(
      /odeme_oturumlari_tutar_chk/,
    );
    expect(await hataMetni(ekle('iyzico', 'aylik', 'bekliyor', 1, 0, `tok_${oturumA}`))).toMatch(
      /odeme_oturumlari_kaynak_dis_islem_id_uniq/,
    );
  });
});
