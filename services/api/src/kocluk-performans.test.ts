import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planBugunu } from './modules/ogrenme/index.js';
import { dersYardimcilari } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

/**
 * Sartname kalite citasi: "kocluk gorunumu 2 saniyede acilir". Gercekci tohum: 30 ogrencilik grup (her biri
 * 30 gun x 5 gunluk kayit = 4.500 kayit, 8 konu, 3 zorluk), hedef ogrenci icin 90 gun x 5 kayit, 3 kaynak
 * kitap (her biri 20 test), 2 yillik haftalik degerlendirme (4 ogretmen x 104 hafta), 30 kaynak onerisi,
 * 40 odev, haftalik plan. Hedef: tek istek (degerlendirme, kaynak, oneri, konu analizi, plan/odev) medyani < 2 sn.
 */
describe.skipIf(dbYok())('kocluk gorunumu performansi (gercekci tohum)', () => {
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

  it('koçluk gorunumu medyan < 2 sn', async () => {
    const y = dersYardimcilari({ t, sistem });
    const s = await y.kur({ ogrenciSayisi: 30 });
    const kurum = s.k.kurumId;
    const hedef = s.ogrenciler[0] ?? '';
    const bugun = planBugunu();
    const konular: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const id = uuidv7();
      await sistem`
        insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad)
        values (${id}, ${kurum}, 'biyoloji', 'unite', ${`Konu ${String(i + 1)}`})`;
      konular.push(id);
    }
    // Kaynak kitaplar ve testleri.
    const kitaplar: string[] = [];
    const testler: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const kitap = uuidv7();
      kitaplar.push(kitap);
      await sistem`
        insert into ogrenme.kaynak_kitaplar (id, kurum_id, ad, brans_kodu)
        values (${kitap}, ${kurum}, ${`Kitap ${String(i + 1)}`}, 'biyoloji')`;
      for (let j = 1; j <= 20; j += 1) {
        const test = uuidv7();
        testler.push(test);
        await sistem`
          insert into ogrenme.kaynak_kitap_testleri (id, kurum_id, kitap_id, sira, ad, soru_sayisi)
          values (${test}, ${kurum}, ${kitap}, ${j}, ${`Test ${String(j)}`}, 20)`;
      }
    }
    // Gunluk kayitlar: grup 30 gun, hedef ogrenci ek olarak 90 gun (testli kayitlar dahil).
    await sistem`
      insert into ogrenme.gunluk_soru_kayitlari
        (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, yanlis, bos, kaynak_test_id)
      select gen_random_uuid(), ${kurum}, o.id, (${bugun}::date - g.gun), 'biyoloji',
             (${konular}::uuid[])[1 + ((g.gun + k.n) % 8)],
             (array['kolay', 'orta', 'zor'])[1 + ((g.gun + k.n) % 3)],
             (3 + (g.gun * k.n) % 7), (1 + (g.gun + k.n) % 4), (g.gun % 2),
             (${testler}::uuid[])[1 + ((g.gun * 5 + k.n) % 60)]
        from unnest(${s.ogrenciler}::uuid[]) as o(id)
       cross join generate_series(0, 29) as g(gun)
       cross join generate_series(1, 5) as k(n)`;
    await sistem`
      insert into ogrenme.gunluk_soru_kayitlari
        (id, kurum_id, ogrenci_id, gun, brans_kodu, konu_id, zorluk, dogru, yanlis, bos, kaynak_metin)
      select gen_random_uuid(), ${kurum}, ${hedef}, (${bugun}::date - g.gun), 'biyoloji',
             (${konular}::uuid[])[1 + ((g.gun + k.n) % 8)], 'orta', 5, 3, 1, ${'Serbest kaynak'} || (g.gun % 6)
        from generate_series(30, 89) as g(gun) cross join generate_series(1, 5) as k(n)`;
    // Degerlendirmeler: 4 ogretmen x 104 hafta (hedef ogrenci icin) + oneriler + odevler + plan.
    await sistem`
      insert into ogrenme.ogretmen_degerlendirmeleri
        (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, calisma_duzeni, derse_katilim,
         odev_disiplini, anlama_duzeyi, yorum, ogrenci_gorur)
      select gen_random_uuid(), ${kurum}, ${hedef}, ${s.hoca.uyelikId},
             (date_trunc('week', ${bugun}::date)::date - (h.n * 7)), (date_trunc('week', ${bugun}::date)::date - (h.n * 7) + 6),
             1 + (h.n % 5), 1 + ((h.n + a.n) % 5), 1 + ((h.n * 3) % 5), 1 + ((h.n + 2) % 5),
             repeat('Uzun degerlendirme yorumu. ', 20), (h.n % 3 = 0)
        from generate_series(0, 103) as h(n) cross join generate_series(1, 4) as a(n)`;
    await sistem`
      insert into ogrenme.kaynak_onerileri (id, kurum_id, ogrenci_id, oneren_id, tur, kaynak_kitap_id, kaynak_test_id)
      select gen_random_uuid(), ${kurum}, ${hedef}, ${s.hoca.uyelikId}, 'kaynak_kitap_testi', ${kitaplar[0] ?? ''},
             (select id from ogrenme.kaynak_kitap_testleri where kitap_id = ${kitaplar[0] ?? ''} and sira = n.n)
        from generate_series(1, 20) as n(n)`;
    const odevId = uuidv7();
    await sistem`
      insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, konu_id, hedef_turu, hedef_id, durum, yayin_at, kaynak)
      values (${odevId}, ${kurum}, ${s.hoca.uyelikId}, 'Ödev', 'biyoloji', ${konular[0] ?? ''}, 'grup', ${s.grup.id}, 'yayinda', now(), 'Palme')`;
    await sistem`
      insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id, durum, yapilan_soru_sayisi, dogru_sayisi, yanlis_sayisi, teslim_at)
      select gen_random_uuid(), ${kurum}, ${odevId}, o.id, 'teslim_edildi', 20, 14, 6, now()
        from unnest(${s.ogrenciler}::uuid[]) as o(id)`;
    // ANALYZE yalniz tablo sahibinin yapabildigi bir islem; canlida autovacuum yapar.
    const sahip = postgres(urls?.ownerUrl ?? '', { max: 1, onnotice: () => undefined });
    await sahip.unsafe('analyze');
    await sahip.end();

    const url = `/v1/ogrenme/kurumlar/${kurum}/ogrenciler/${hedef}/kocluk`;
    const al = () => y.app.inject({ url, headers: bearer(s.hoca.token) });
    const ilk = await al(); // isinma
    expect(ilk.statusCode, ilk.body).toBe(200);
    const sureler: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const bas = performance.now();
      const res = await al();
      sureler.push(performance.now() - bas);
      expect(res.statusCode).toBe(200);
    }
    const ms = medyan(sureler);
    console.log(`[kocluk-performans] kocluk gorunumu medyan: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);

    const govde = ilk.json<{
      degerlendirmeler: { degerlendirmeler: unknown[]; sonraki_imlec: string | null };
      oneriler: unknown[];
      konu_analizi: { bransler: { toplam: { cozulen: number } }[] };
      kullanilan_kaynaklar: { kitaplar: unknown[]; serbest: unknown[] };
    }>();
    expect(govde.degerlendirmeler.degerlendirmeler).toHaveLength(20);
    expect(govde.degerlendirmeler.sonraki_imlec).toBeTruthy();
    expect(govde.oneriler).toHaveLength(20);
    expect(govde.konu_analizi.bransler[0]?.toplam.cozulen).toBeGreaterThan(0);
    expect(govde.kullanilan_kaynaklar.kitaplar.length).toBeGreaterThan(0);
    expect(govde.kullanilan_kaynaklar.serbest.length).toBeGreaterThan(0);
  }, 180_000);
});
