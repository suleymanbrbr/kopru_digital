import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = [
  'haftalik_planlar',
  'plan_gorevleri',
  'plan_sablonlari',
  'plan_sablon_gorevleri',
] as const;

const PAZARTESI = '2030-01-07';
const SALI = '2030-01-08';

/** `ogrenme` plan tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve veritabani kisitlari. */
describe.skipIf(dbYok())('ogrenme plan tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const ogretmenA = uuidv7();
  const ogretmenB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const planA = uuidv7();
  const planB = uuidv7();
  const gorevA = uuidv7();
  const sablonB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  async function planEkle(kurum: string, ogrenci: string, hazirlayan: string, hafta: string) {
    const id = uuidv7();
    await sistem`
      insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id)
      values (${id}, ${kurum}, ${ogrenci}, ${hafta}, ${hazirlayan})`;
    return id;
  }

  async function gorevEkle(
    kurum: string,
    plan: string,
    ogrenci: string,
    ekleyen: string,
    ek: { hafta?: string; gun?: string; devreden?: string | null; hedef?: number } = {},
  ) {
    const id = uuidv7();
    await sistem`
      insert into ogrenme.plan_gorevleri
        (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, devreden_gorev_id, ekleyen_id)
      values (${id}, ${kurum}, ${plan}, ${ogrenci}, ${ek.hafta ?? PAZARTESI}, ${ek.gun ?? SALI}, 'matematik', 'soru',
              ${ek.hedef ?? 20}, ${ek.devreden ?? null}, ${ekleyen})`;
    return id;
  }

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, ogretmen, ogrenci, plan] of [
      [kurumA, kullaniciA, ogretmenA, ogrenciA, planA],
      [kurumB, kullaniciB, ogretmenB, ogrenciB, planB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogretmen}, ${kurum}, ${sahip}, 'ogretmen')`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`
        insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id)
        values (${plan}, ${kurum}, ${ogrenci}, ${PAZARTESI}, ${ogretmen})`;
      await sistem`
        insert into ogrenme.plan_gorevleri
          (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, ekleyen_id)
        values (${kurum === kurumA ? gorevA : uuidv7()}, ${kurum}, ${plan}, ${ogrenci}, ${PAZARTESI}, ${SALI}, 'matematik', 'soru', 20, ${ogretmen})`;
      const sablon = kurum === kurumB ? sablonB : uuidv7();
      await sistem`
        insert into ogrenme.plan_sablonlari (id, kurum_id, ogretmen_id, ad) values (${sablon}, ${kurum}, ${ogretmen}, 'Şablon')`;
      await sistem`
        insert into ogrenme.plan_sablon_gorevleri (id, kurum_id, sablon_id, gun_sirasi, brans_kodu, hedef_turu, hedef_miktar)
        values (${uuidv7()}, ${kurum}, ${sablon}, 0, 'matematik', 'soru', 10)`;
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
          insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id)
          values (${uuidv7()}, ${kurumB}, ${ogrenciB}, ${'2030-01-14'}, ${ogretmenB})`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update ogrenme.haftalik_planlar set "not" = 'ele gecirildi' where id = ${planB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ogrenme.plan_sablonlari where id = ${sablonB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const [b] = await sistem<{ not: string | null }[]>`
      select "not" from ogrenme.haftalik_planlar where id = ${planB}`;
    expect(b?.not).toBeNull();
  });

  it('api_app, B kurumunun planina A kurumu adina gorev acamaz (bilesik FK + RLS)', async () => {
    const metin = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.plan_gorevleri
            (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, ekleyen_id)
          values (${uuidv7()}, ${kurumA}, ${planB}, ${ogrenciA}, ${PAZARTESI}, ${SALI}, 'matematik', 'soru', 5, ${ogretmenA})`),
      ),
    );
    expect(metin).toMatch(/plan_gorevleri_kurum_plan_fk|foreign key|violates/);
  });

  it('haftalik_planlar: hafta Pazartesi olmali (CHECK), (ogrenci, hafta) tekil', async () => {
    expect(await planEkle(kurumA, ogrenciA, ogretmenA, '2030-01-14')).toBeTruthy();
    expect(await hataMetni(planEkle(kurumA, ogrenciA, ogretmenA, SALI))).toMatch(
      /haftalik_planlar_pazartesi_chk/,
    );
    expect(await hataMetni(planEkle(kurumA, ogrenciA, ogretmenA, PAZARTESI))).toMatch(
      /haftalik_planlar_ogrenci_hafta_uniq|duplicate/,
    );
    const yayinsiz = await hataMetni(sistem`
      insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id, durum)
      values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${'2030-01-21'}, ${ogretmenA}, 'yayinda')`);
    expect(yayinsiz).toMatch(/haftalik_planlar_yayin_chk/);
  });

  it('plan_gorevleri: gun haftanin disinda olamaz; hafta plan ile ayni olmali (bilesik FK)', async () => {
    const disinda = await hataMetni(
      gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { gun: '2030-01-14' }),
    );
    expect(disinda).toMatch(/plan_gorevleri_gun_chk/);
    const oncesi = await hataMetni(
      gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { gun: '2030-01-06' }),
    );
    expect(oncesi).toMatch(/plan_gorevleri_gun_chk/);
    // Pazar son gecerli gun
    expect(await gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { gun: '2030-01-13' })).toBeTruthy();
    const haftaUyumsuz = await hataMetni(
      gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { hafta: '2030-01-14', gun: '2030-01-15' }),
    );
    expect(haftaUyumsuz).toMatch(/plan_gorevleri_plan_hafta_fk/);
  });

  it('plan_gorevleri CHECK: hedef > 0, gerceklesen >= 0, durum, tamam icin tamamlandi_at', async () => {
    expect(await hataMetni(gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { hedef: 0 }))).toMatch(
      /plan_gorevleri_hedef_miktar_chk/,
    );
    const guncelle = (kume: string) =>
      hataMetni(
        sistem.unsafe(`update ogrenme.plan_gorevleri set ${kume} where id = '${gorevA}'`).then(),
      );
    expect(await guncelle('gerceklesen_miktar = -1')).toMatch(/plan_gorevleri_gerceklesen_chk/);
    expect(await guncelle("durum = 'belki'")).toMatch(/plan_gorevleri_durum_chk/);
    expect(await guncelle("durum = 'tamam'")).toMatch(/plan_gorevleri_tamamlandi_chk/);
    expect(await guncelle("hedef_turu = 'sayfa'")).toMatch(/plan_gorevleri_hedef_turu_chk/);
  });

  it('devir: bir gorev yalniz bir kez devredilir (tekil indeks), kendini devredemez', async () => {
    const kaynak = await gorevEkle(kurumA, planA, ogrenciA, ogretmenA);
    await gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { devreden: kaynak });
    const ikinci = await hataMetni(
      gorevEkle(kurumA, planA, ogrenciA, ogretmenA, { devreden: kaynak }),
    );
    expect(ikinci).toMatch(/plan_gorevleri_devreden_gorev_id_uniq|duplicate/);
    const kendisi = await hataMetni(
      sistem
        .unsafe(`update ogrenme.plan_gorevleri set devreden_gorev_id = id where id = '${gorevA}'`)
        .then(),
    );
    expect(kendisi).toMatch(/plan_gorevleri_devreden_kendisi_chk/);
  });

  it('plan_sablon_gorevleri: gun sirasi 0-6, hedef > 0; sablon silinince gorevleri de silinir', async () => {
    const ekle = (gun: number, hedef: number) =>
      hataMetni(sistem`
        insert into ogrenme.plan_sablon_gorevleri (id, kurum_id, sablon_id, gun_sirasi, brans_kodu, hedef_turu, hedef_miktar)
        values (${uuidv7()}, ${kurumB}, ${sablonB}, ${gun}, 'matematik', 'dakika', ${hedef})`);
    expect(await ekle(7, 10)).toMatch(/plan_sablon_gorevleri_gun_sirasi_chk/);
    expect(await ekle(6, 0)).toMatch(/plan_sablon_gorevleri_hedef_miktar_chk/);
    await sistem`delete from ogrenme.plan_sablonlari where id = ${sablonB}`;
    const [n] = await sistem<{ n: number }[]>`
      select count(*)::int n from ogrenme.plan_sablon_gorevleri where sablon_id = ${sablonB}`;
    expect(n?.n).toBe(0);
  });
});
