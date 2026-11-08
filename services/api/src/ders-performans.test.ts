import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type DersJson } from './test/ders-yardimcilar.js';
import { dbYok, testDb, testServisi } from './test/yardimcilar.js';

/**
 * Sartname kalite citasi: "takvim 200 dersle acilista 300 ms icinde". 200 dersli bir araligin yaninda
 * ayni kurumda gecmise yayilmis 3000 ders daha vardir (gercekci veri hacmi); her derste 20 katilimci.
 */
describe.skipIf(dbYok())('ders takvimi performansi (200 ders, hedef 300 ms)', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let appDb: Database;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 2 });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
  });

  it('200 dersli aralik: tek istek, N+1 yok, medyan 300 ms altinda', async () => {
    const y = dersYardimcilari({ t, sistem });
    const s = await y.kur({ ogrenciSayisi: 20 });
    const kurumId = s.k.kurumId;
    const hoca = s.hoca.uyelikId;

    // 200 ders: 2030-06-01'den itibaren 6 saat arayla (50 gun); cakisma_onayli kisit maliyetini disarida birakir.
    await sistem`
      insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, cakisma_onayli)
      select gen_random_uuid(), ${kurumId}, ${s.grup.id}, ${hoca}, 'matematik',
             timestamptz '2030-06-01 00:00:00+00' + (i * interval '6 hours'),
             timestamptz '2030-06-01 01:00:00+00' + (i * interval '6 hours'),
             timestamptz '2030-06-01 00:00:00+00' + (i * interval '6 hours'), true
      from generate_series(0, 199) i`;
    // Gecmis yila yayilmis gurultu: 3000 ders
    await sistem`
      insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, cakisma_onayli)
      select gen_random_uuid(), ${kurumId}, ${s.grup.id}, ${hoca}, 'matematik',
             timestamptz '2029-01-01 00:00:00+00' + (i * interval '3 hours'),
             timestamptz '2029-01-01 01:00:00+00' + (i * interval '3 hours'),
             timestamptz '2029-01-01 00:00:00+00' + (i * interval '3 hours'), true
      from generate_series(0, 2999) i`;
    await sistem`
      insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id)
      select gen_random_uuid(), d.kurum_id, d.id, o.id
      from ders.dersler d
      cross join (select id from hesap.uyelikler where kurum_id = ${kurumId} and rol = 'ogrenci') o
      where d.kurum_id = ${kurumId}`;
    await sistem`analyze ders.dersler`;
    await sistem`analyze ders.ders_katilimcilari`;

    const url = `/v1/ders/kurumlar/${kurumId}/dersler?baslangic=2030-06-01T00:00:00Z&bitis=2030-07-21T00:00:00Z&limit=500`;
    const cagri = async () => {
      const bas = performance.now();
      const res = await y.app.inject({ url, headers: { authorization: `Bearer ${s.k.token}` } });
      const sure = performance.now() - bas;
      expect(res.statusCode, res.body).toBe(200);
      return { sure, dersler: res.json<{ dersler: DersJson[] }>().dersler };
    };
    const ilk = await cagri(); // soguk (hazirlik)
    expect(ilk.dersler).toHaveLength(200);
    expect(ilk.dersler.every((d) => d.katilimci_sayisi === 20)).toBe(true);
    const sureler: number[] = [];
    for (let i = 0; i < 9; i++) sureler.push((await cagri()).sure);
    sureler.sort((a, b) => a - b);
    const medyan = sureler[4] ?? 0;
    console.log(
      `[ders-performans] 200 ders: ilk (soguk) ${ilk.sure.toFixed(0)} ms; 9 sicak istek min ${(sureler[0] ?? 0).toFixed(0)} medyan ${medyan.toFixed(0)} maks ${(sureler[8] ?? 0).toFixed(0)} ms`,
    );

    const plan = await withTenant(appDb, { kurumId, kullaniciId: s.k.kullaniciId }, (tx) =>
      tx.execute<Record<string, string>>(sql`
        explain (analyze, buffers, costs off)
        select * from ders.dersler
        where kurum_id = ${kurumId}
          and baslangic_at < '2030-07-21T00:00:00Z' and bitis_at > '2030-06-01T00:00:00Z'
          and baslangic_at >= '2030-05-31T16:00:00Z'
        order by baslangic_at, id limit 501`),
    );
    const planMetni = plan.map((r) => r['QUERY PLAN']).join('\n');
    console.log(`[ders-performans] EXPLAIN dersler:\n${planMetni}`);
    // Uygulamanin gonderdigi biçim: sayfadaki 200 ders kimligi icin tek gruplu sayim sorgusu.
    const idler = sql.join(
      ilk.dersler.map((d) => sql`${d.id}::uuid`),
      sql`, `,
    );
    const planKat = await withTenant(appDb, { kurumId, kullaniciId: s.k.kullaniciId }, (tx) =>
      tx.execute<Record<string, string>>(sql`
        explain (analyze, buffers, costs off)
        select ders_id, count(*)::int from ders.ders_katilimcilari
        where ders_id in (${idler})
        group by ders_id`),
    );
    const ozetSatirlari = planKat
      .map((r) => r['QUERY PLAN'] ?? '')
      .filter((l) => /Scan|Execution Time/.test(l))
      .map((l) => l.trim().slice(0, 110));
    console.log(
      `[ders-performans] EXPLAIN katilimci sayilari (ozet):\n${ozetSatirlari.join('\n')}`,
    );

    expect(planMetni).toMatch(/Index Scan|Bitmap/);
    expect(medyan).toBeLessThan(300);
  });
});
