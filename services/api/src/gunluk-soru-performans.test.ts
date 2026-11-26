import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planBugunu } from './modules/ogrenme/index.js';
import { dersYardimcilari } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

/**
 * Sartname kalite citasi: "ogretmen bir ogrencinin 30 gunluk konu analizini 2 saniyede acar; 30 kisilik
 * sinif gorunumu 3 saniyede". Tohum: 30 ogrenci x 30 gun x gunde 5 kayit (4.500 kayit, 8 konu, 3 zorluk) ve
 * ogrenci basina 10 konulu odev teslimi. Hedef: her uc medyan, kalite citasinin altinda (sinirlar test
 * ortaminin yavasligina payli; olculen degerler `console.log` ile yazilir).
 */
describe.skipIf(dbYok())('gunluk soru analizi performansi (30 ogrenci x 30 gun x 5 kayit)', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const medyan = (n: number[]) => [...n].sort((a, b) => a - b)[Math.floor(n.length / 2)] ?? 0;

  it('30 gunluk ogrenci analizi < 2 sn, 30 kisilik sinif gorunumu < 3 sn', async () => {
    const y = dersYardimcilari({ t, sistem });
    const s = await y.kur({ ogrenciSayisi: 30 });
    const bugun = planBugunu();
    const konular: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const id = uuidv7();
      await sistem`
        insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad)
        values (${id}, ${s.k.kurumId}, 'biyoloji', 'unite', ${`Konu ${String(i + 1)}`})`;
      konular.push(id);
    }
    await sistem`
      insert into ogrenme.gunluk_soru_kayitlari
        (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, yanlis, bos)
      select gen_random_uuid(), ${s.k.kurumId}, o.id, (${bugun}::date - g.gun), 'biyoloji',
             (${konular}::uuid[])[1 + ((g.gun + k.n) % 8)],
             (array['kolay', 'orta', 'zor'])[1 + ((g.gun + k.n) % 3)],
             (3 + (g.gun * k.n) % 7), (1 + (g.gun + k.n) % 4), (g.gun % 2)
        from unnest(${s.ogrenciler}::uuid[]) as o(id)
       cross join generate_series(0, 29) as g(gun)
       cross join generate_series(1, 5) as k(n)`;
    const odevId = uuidv7();
    await sistem`
      insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, konu_id, hedef_turu, hedef_id, durum, yayin_at)
      values (${odevId}, ${s.k.kurumId}, ${s.hoca.uyelikId}, 'Ödev', 'biyoloji', ${konular[0] ?? ''}, 'grup', ${s.grup.id}, 'yayinda', now())`;
    await sistem`
      insert into ogrenme.ogrenci_odevleri
        (id, kurum_id, odev_id, ogrenci_id, durum, yapilan_soru_sayisi, dogru_sayisi, yanlis_sayisi, teslim_at)
      select gen_random_uuid(), ${s.k.kurumId}, ${odevId}, o.id, 'teslim_edildi', 20, 14, 6, now()
        from unnest(${s.ogrenciler}::uuid[]) as o(id)`;
    // ANALYZE yalniz tablo sahibinin (migration rolu) yapabildigi bir islem; canlida autovacuum yapar.
    const sahip = postgres(urls?.ownerUrl ?? '', { max: 1, onnotice: () => undefined });
    await sahip.unsafe('analyze');
    await sahip.end();

    const [sayi] = await sistem<{ n: number }[]>`
      select count(*)::int n from ogrenme.gunluk_soru_kayitlari where kurum_id = ${s.k.kurumId}`;
    expect(sayi?.n).toBe(4500);

    const base = `/v1/ogrenme/kurumlar/${s.k.kurumId}`;
    const ogrenciUrl = `${base}/ogrenciler/${s.ogrenciler[0] ?? ''}/gunluk-soru/analiz?brans_kodu=biyoloji&donem=30`;
    const sinifUrl = `${base}/gunluk-soru/sinif-analizi?grup_id=${s.grup.id}&brans_kodu=biyoloji&donem=30`;
    const al = (url: string) => y.app.inject({ url, headers: bearer(s.hoca.token) });
    // Isinma (plan onbellegi, ilk baglantilar)
    expect((await al(ogrenciUrl)).statusCode).toBe(200);
    expect((await al(sinifUrl)).statusCode).toBe(200);

    const olc = async (url: string) => {
      const sureler: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const bas = performance.now();
        const res = await al(url);
        sureler.push(performance.now() - bas);
        expect(res.statusCode).toBe(200);
      }
      return medyan(sureler);
    };
    const ogrenciMs = await olc(ogrenciUrl);
    const sinifMs = await olc(sinifUrl);
    console.log(
      `[gunluk-soru-performans] ogrenci 30 gun: ${ogrenciMs.toFixed(0)} ms | sinif (30 kisi): ${sinifMs.toFixed(0)} ms`,
    );
    expect(ogrenciMs).toBeLessThan(2000);
    expect(sinifMs).toBeLessThan(3000);

    const govde = (await al(ogrenciUrl)).json<{
      konular: unknown[];
      toplam: { cozulen: number };
    }>();
    expect(govde.konular.length).toBe(8);
    expect(govde.toplam.cozulen).toBeGreaterThan(0);
  }, 180_000);
});
