import { MODUL_KODLARI } from '@kopru/contracts';
import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

/** Tek satir bekleyen sorgu sonucu (yoksa test hatasi). */
function tek<T>(satirlar: T[]): T {
  const satir = satirlar[0];
  if (satir === undefined) throw new Error('beklenen satır yok');
  return satir;
}

const KIRACI_TABLOLARI = [
  'abonelikler',
  'abonelik_odemeleri',
  'kurum_fatura_bilgileri',
  'faturalar',
] as const;

/** `abonelik` kiraci tablolari icin izolasyon (`api_app`, NOBYPASSRLS), yetki ayrimi ve veritabani kisitlari. */
describe.skipIf(dbYok())('abonelik tablolari: RLS izolasyonu, yetkiler ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const abonelikA = uuidv7();
  const abonelikB = uuidv7();
  const odemeA = uuidv7();
  const odemeB = uuidv7();
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
    for (const [kurum, sahip, abonelik, odeme] of [
      [kurumA, kullaniciA, abonelikA, odemeA],
      [kurumB, kullaniciB, abonelikB, odemeB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
        values (${abonelik}, ${kurum}, ${planId}, 'iyzico', 'aktif', now(), now() + interval '30 days', 100)`;
      await sistem`insert into abonelik.abonelik_odemeleri
        (id, kurum_id, abonelik_id, kaynak, dis_islem_id, durum, tutar_kurus, kdv_kurus, donem_baslangic_at, donem_bitis_at, odeme_at)
        values (${odeme}, ${kurum}, ${abonelik}, 'iyzico', ${`islem_${odeme}`}, 'basarili', 120, 20, now(), now() + interval '30 days', now())`;
      await sistem`insert into abonelik.kurum_fatura_bilgileri (id, kurum_id, unvan, vergi_no, adres, eposta)
        values (${uuidv7()}, ${kurum}, 'Ünvan', '1234567890', '{"satir":"a","ilce":"b","il":"c"}'::jsonb, 'a@example.com')`;
      await sistem`insert into abonelik.faturalar
        (id, kurum_id, odeme_id, alici_unvan, alici_vergi_no, alici_adres, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani)
        values (${uuidv7()}, ${kurum}, ${odeme}, 'Ünvan', '1234567890', '{}'::jsonb, 100, 20, 120, 20)`;
    }
  });

  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  it.each(KIRACI_TABLOLARI)(
    '%s: A baglami yalniz A satirlarini gorur, B icin hazirlanmis sorgu bos doner',
    async (tablo) => {
      const hepsi = await withTenant(app, ctxA(), (tx) =>
        tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from abonelik.${tablo}`)),
      );
      expect(hepsi.length).toBeGreaterThan(0);
      expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
      const crafted = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql.raw(`select * from abonelik.${tablo} where kurum_id = '${kurumB}'`)),
      );
      expect(crafted).toHaveLength(0);
    },
  );

  it.each(KIRACI_TABLOLARI)(
    '%s: baglam yokken hicbir satir gorunmez (fail-closed)',
    async (tablo) => {
      const rows = await app.orm.execute<{ n: number }>(
        sql.raw(`select count(*)::int n from abonelik.${tablo}`),
      );
      expect(rows[0]?.n).toBe(0);
    },
  );

  it('uygulama rolu abonelik, odeme ve fatura tablolarina yazamaz (yazma yalniz _sistem)', async () => {
    for (const komut of [
      sql`insert into abonelik.abonelikler (id, kurum_id, plan_id, kaynak, durum, donem_baslangic_at, donem_bitis_at, fiyat_kurus)
          values (${uuidv7()}, ${kurumA}, ${planId}, 'iyzico', 'iptal', now(), now() + interval '1 day', 1)`,
      sql`update abonelik.abonelikler set durum = 'sona_erdi' where id = ${abonelikA}`,
      sql`delete from abonelik.abonelikler where id = ${abonelikA}`,
      sql`update abonelik.abonelik_odemeleri set tutar_kurus = 0 where id = ${odemeA}`,
      sql`delete from abonelik.faturalar where kurum_id = ${kurumA}`,
      sql`update abonelik.planlar set aktif = false`,
    ]) {
      expect(await hataMetni(withTenant(app, ctxA(), (tx) => tx.execute(komut)))).toMatch(
        /permission denied/,
      );
    }
    const [a] = await sistem<
      { durum: string }[]
    >`select durum from abonelik.abonelikler where id = ${abonelikA}`;
    expect(a?.durum).toBe('aktif');
  });

  it('plan katalogu herkese acik (RLS yok): uygulama rolu okur', async () => {
    const planlar = await withTenant(app, ctxA(), (tx) =>
      tx.execute<{ kod: string }>(sql`select kod from abonelik.planlar where aktif order by kod`),
    );
    expect(planlar.map((p) => p.kod)).toEqual(
      expect.arrayContaining(['baslangic', 'koc', 'ekip', 'kurum']),
    );
  });

  it('ham saglayici olaylari yalniz _sistem rolune aciktir', async () => {
    await sistem`insert into abonelik.abonelik_olaylari (id, kaynak, dis_olay_id, tur, ham_govde, imza_dogrulandi)
      values (${uuidv7()}, 'iyzico', ${`olay_${uuidv7()}`}, 'odeme', '{}', true)`;
    expect(
      await hataMetni(
        withTenant(app, ctxA(), (tx) => tx.execute(sql`select * from abonelik.abonelik_olaylari`)),
      ),
    ).toMatch(/permission denied/);
  });

  it('kurum_fatura_bilgileri: uygulama rolu kendi kurumunu yazar, B kurumu icin WITH CHECK reddeder; kurum basina tek satir', async () => {
    const ekle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`insert into abonelik.kurum_fatura_bilgileri (id, kurum_id, unvan, vergi_no, adres, eposta)
          values (${uuidv7()}, ${kurumB}, 'x', '1234567890', '{}'::jsonb, 'x@example.com')`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);
    const tekrar = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`insert into abonelik.kurum_fatura_bilgileri (id, kurum_id, unvan, vergi_no, adres, eposta)
          values (${uuidv7()}, ${kurumA}, 'x', '1234567890', '{}'::jsonb, 'x@example.com')`),
      ),
    );
    expect(tekrar).toMatch(/kurum_fatura_bilgileri_kurum_id_uniq|duplicate/);
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update abonelik.kurum_fatura_bilgileri set unvan = 'ele gecirildi' where kurum_id = ${kurumB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
  });

  it('kisitlar: vergi no deseni, fatura toplami, kesildi alanlari, odeme tekilligi, bilesik FK', async () => {
    expect(
      await hataMetni(
        sistem`update abonelik.kurum_fatura_bilgileri set vergi_no = '123' where kurum_id = ${kurumA}`,
      ),
    ).toMatch(/kurum_fatura_bilgileri_vergi_no_chk/);
    expect(
      await hataMetni(sistem`insert into abonelik.faturalar
        (id, kurum_id, odeme_id, tur, alici_unvan, alici_vergi_no, alici_adres, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani)
        values (${uuidv7()}, ${kurumA}, ${odemeA}, 'iade', 'x', '1234567890', '{}'::jsonb, 100, 20, 999, 20)`),
    ).toMatch(/faturalar_toplam_chk/);
    expect(
      await hataMetni(
        sistem`update abonelik.faturalar set durum = 'kesildi' where kurum_id = ${kurumA}`,
      ),
    ).toMatch(/faturalar_kesildi_chk/);
    // bir odemeye tek fatura (ayni tur)
    expect(
      await hataMetni(sistem`insert into abonelik.faturalar
        (id, kurum_id, odeme_id, alici_unvan, alici_vergi_no, alici_adres, matrah_kurus, kdv_kurus, toplam_kurus, kdv_orani)
        values (${uuidv7()}, ${kurumA}, ${odemeA}, 'x', '1234567890', '{}'::jsonb, 100, 20, 120, 20)`),
    ).toMatch(/faturalar_odeme_id_tur_uniq/);
    // odeme (kaynak, islem, durum) tekil
    expect(
      await hataMetni(sistem`insert into abonelik.abonelik_odemeleri
        (id, kurum_id, abonelik_id, kaynak, dis_islem_id, durum, tutar_kurus, kdv_kurus, donem_baslangic_at, donem_bitis_at, odeme_at)
        values (${uuidv7()}, ${kurumA}, ${abonelikA}, 'iyzico', ${`islem_${odemeA}`}, 'basarili', 1, 0, now(), now() + interval '1 day', now())`),
    ).toMatch(/abonelik_odemeleri_kaynak_dis_islem_id_durum_uniq/);
    // bilesik FK: B aboneligine A kurumu adina odeme acilamaz
    expect(
      await hataMetni(sistem`insert into abonelik.abonelik_odemeleri
        (id, kurum_id, abonelik_id, kaynak, dis_islem_id, durum, tutar_kurus, kdv_kurus, donem_baslangic_at, donem_bitis_at, odeme_at)
        values (${uuidv7()}, ${kurumA}, ${abonelikB}, 'iyzico', ${`x_${uuidv7()}`}, 'basarili', 1, 0, now(), now() + interval '1 day', now())`),
    ).toMatch(/abonelik_odemeleri_abonelik_id_fk|foreign key/);
    // ham webhook (kaynak, dis_olay_id) tekil
    const olayId = `tekil_${uuidv7()}`;
    await sistem`insert into abonelik.abonelik_olaylari (id, kaynak, dis_olay_id, tur, ham_govde, imza_dogrulandi)
      values (${uuidv7()}, 'apple', ${olayId}, 't', '{}', false)`;
    expect(
      await hataMetni(sistem`insert into abonelik.abonelik_olaylari (id, kaynak, dis_olay_id, tur, ham_govde, imza_dogrulandi)
        values (${uuidv7()}, 'apple', ${olayId}, 't', '{}', false)`),
    ).toMatch(/abonelik_olaylari_kaynak_dis_olay_id_uniq/);
    // (kaynak, dis_abonelik_id) tekil
    await sistem`update abonelik.abonelikler set dis_abonelik_id = 'ayni' where id = ${abonelikA}`;
    expect(
      await hataMetni(
        sistem`update abonelik.abonelikler set dis_abonelik_id = 'ayni' where id = ${abonelikB}`,
      ),
    ).toMatch(/abonelikler_kaynak_dis_abonelik_id_uniq/);
  });

  it('plan katalogu: (kod, surum) tekil, kurum turu CHECK; tohum 4 plan, Baslangic 15 ogrenci', async () => {
    expect(
      await hataMetni(sistem`insert into abonelik.planlar (id, kod, surum, ad, kurum_turu, aylik_fiyat_kurus, limitler, moduller)
        values (${uuidv7()}, 'baslangic', 1, 'x', 'bireysel', 1, '{}'::jsonb, '{}')`),
    ).toMatch(/planlar_kod_surum_uniq/);
    expect(
      await hataMetni(sistem`insert into abonelik.planlar (id, kod, surum, ad, kurum_turu, aylik_fiyat_kurus, limitler, moduller)
        values (${uuidv7()}, 'gecersiz_tur', 1, 'x', 'veli', 1, '{}'::jsonb, '{}')`),
    ).toMatch(/planlar_kurum_turu_chk/);
    const [b] = await sistem<{ max_ogrenci: number; kurum_turu: string; moduller: string[] }[]>`
      select (limitler->>'max_ogrenci')::int max_ogrenci, kurum_turu, moduller from abonelik.planlar where kod = 'baslangic' and surum = 1`;
    expect(b).toMatchObject({ max_ogrenci: 15, kurum_turu: 'bireysel' });
    // Plan kataloguna yazilan moduller sozlesmedeki kodlarla sinirlidir (modul_ayarlari ile ayni kume)
    const { gecersiz } = tek(
      await sistem<{ gecersiz: number }[]>`
      select count(*)::int gecersiz from abonelik.planlar p, unnest(p.moduller) m
      where m <> all(${[...MODUL_KODLARI]}::text[])`,
    );
    expect(gecersiz).toBe(0);
  });
});
