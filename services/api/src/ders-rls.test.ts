import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = ['ders_serileri', 'dersler', 'ders_katilimcilari'] as const;

/** `ders` tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve veritabani kisitlari. */
describe.skipIf(dbYok())('ders tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const grupA = uuidv7();
  const grupB = uuidv7();
  const ogretmenA = uuidv7();
  const ogretmenB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const seriA = uuidv7();
  const seriB = uuidv7();
  const dersA = uuidv7();
  const dersB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctx = (kurumId: string, kullaniciId: string) => ({ kurumId, kullaniciId });
  const ctxA = () => ctx(kurumA, kullaniciA);

  async function dersEkle(
    kurum: string,
    grup: string,
    ogretmen: string,
    ek: { id?: string; bas?: string; bit?: string; durum?: string; onayli?: boolean } = {},
  ) {
    const id = ek.id ?? uuidv7();
    const bas = ek.bas ?? '2030-01-07T10:00:00Z';
    const bit = ek.bit ?? '2030-01-07T11:00:00Z';
    await sistem`
      insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, durum, cakisma_onayli, iptal_at, iptal_kaynagi)
      values (${id}, ${kurum}, ${grup}, ${ogretmen}, 'matematik', ${bas}, ${bit}, ${bas}, ${ek.durum ?? 'planli'}, ${ek.onayli ?? false},
              ${ek.durum === 'iptal' ? new Date() : null}, ${ek.durum === 'iptal' ? 'ogretmen' : null})`;
    return id;
  }

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, grup, ogretmen, ogrenci, seri, ders] of [
      [kurumA, kullaniciA, grupA, ogretmenA, ogrenciA, seriA, dersA],
      [kurumB, kullaniciB, grupB, ogretmenB, ogrenciB, seriB, dersB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogretmen}, ${kurum}, ${sahip}, 'ogretmen')`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${grup}, ${kurum}, 'grup', 'G')`;
      await sistem`
        insert into ders.ders_serileri (id, kurum_id, grup_id, ogretmen_id, brans_kodu, tekrar_kurali, baslangic_tarihi, baslangic_saati, sure_dk, uretildi_son_tarih)
        values (${seri}, ${kurum}, ${grup}, ${ogretmen}, 'matematik', 'FREQ=WEEKLY', '2030-01-07', '10:00', 60, '2030-04-01')`;
      await dersEkle(kurum, grup, ogretmen, { id: ders });
      await sistem`insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id) values (${uuidv7()}, ${kurum}, ${ders}, ${ogrenci})`;
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
        tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from ders.${tablo}`)),
      );
      expect(hepsi.length).toBeGreaterThan(0);
      expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
      const crafted = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql.raw(`select * from ders.${tablo} where kurum_id = '${kurumB}'`)),
      );
      expect(crafted).toHaveLength(0);
    },
  );

  it.each(TABLOLAR)('%s: baglam yokken hicbir satir gorunmez (fail-closed)', async (tablo) => {
    const rows = await app.orm.execute<{ n: number }>(
      sql.raw(`select count(*)::int n from ders.${tablo}`),
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('A baglamindan B kurumuna INSERT reddedilir (WITH CHECK), UPDATE/DELETE B satirina etkisiz', async () => {
    const ekle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at)
          values (${uuidv7()}, ${kurumB}, ${grupB}, ${ogretmenB}, 'matematik', now(), now() + interval '1 hour', now())`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);

    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update ders.dersler set baslik = 'ele gecirildi' where id = ${dersB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ders.dersler where id = ${dersB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const katilimci = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ders.ders_katilimcilari where ders_id = ${dersB} returning id`),
    );
    expect(katilimci).toHaveLength(0);

    const [b] = await sistem<
      { baslik: string | null }[]
    >`select baslik from ders.dersler where id = ${dersB}`;
    expect(b?.baslik).toBeNull();
  });

  it('api_app, B kurumunun dersine A kurumu adina katilimci ekleyemez (bilesik FK + RLS)', async () => {
    const metin = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id)
          values (${uuidv7()}, ${kurumA}, ${dersB}, ${ogrenciA})`),
      ),
    );
    expect(metin).toMatch(/foreign key|violates/);
  });

  it('ogretmen cakismasi EXCLUDE: onaysiz planli cakisma reddedilir; onayli, iptal ve baska ogretmen serbest', async () => {
    const bas = '2030-02-04T10:00:00Z';
    const bit = '2030-02-04T11:00:00Z';
    await dersEkle(kurumA, grupA, ogretmenA, { bas, bit });
    const cakisma = await hataMetni(
      dersEkle(kurumA, grupA, ogretmenA, {
        bas: '2030-02-04T10:30:00Z',
        bit: '2030-02-04T11:30:00Z',
      }),
    );
    expect(cakisma).toMatch(/dersler_ogretmen_id_cakisma_excl|conflicting key/);
    // bitisik (ucuca) cakisma degil
    await dersEkle(kurumA, grupA, ogretmenA, { bas: bit, bit: '2030-02-04T12:00:00Z' });
    // onayli ve iptal edilmis dersler kisita girmez
    await dersEkle(kurumA, grupA, ogretmenA, { bas, bit, onayli: true });
    await dersEkle(kurumA, grupA, ogretmenA, { bas, bit, durum: 'iptal' });
    // ayni saatte baska ogretmen
    await dersEkle(kurumB, grupB, ogretmenB, { bas, bit });
  });

  it('seri sirasi benzersiz (idempotent uretim), CHECK kisitlari', async () => {
    const ekle = (sira: number) => sistem`
      insert into ders.dersler (id, kurum_id, grup_id, seri_id, seri_sirasi, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, cakisma_onayli)
      values (${uuidv7()}, ${kurumA}, ${grupA}, ${seriA}, ${sira}, ${ogretmenA}, 'matematik',
              '2031-03-03T10:00:00Z', '2031-03-03T11:00:00Z', '2031-03-03T10:00:00Z', true)`;
    await ekle(77);
    expect(await hataMetni(ekle(77))).toMatch(/dersler_seri_id_seri_sirasi_uniq|duplicate/);

    const bitisOnce = await hataMetni(
      dersEkle(kurumA, grupA, ogretmenA, {
        bas: '2032-01-01T11:00:00Z',
        bit: '2032-01-01T10:00:00Z',
      }),
    );
    expect(bitisOnce).toMatch(/dersler_zaman_chk/);
    const iptalsiz = await hataMetni(
      sistem`insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, durum)
             values (${uuidv7()}, ${kurumA}, ${grupA}, ${ogretmenA}, 'matematik', '2033-01-01T10:00:00Z', '2033-01-01T11:00:00Z', '2033-01-01T10:00:00Z', 'iptal')`,
    );
    expect(iptalsiz).toMatch(/dersler_iptal_chk/);
    const gecIptal = await hataMetni(
      sistem`insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, gec_iptal)
             values (${uuidv7()}, ${kurumA}, ${grupA}, ${ogretmenA}, 'matematik', '2034-01-01T10:00:00Z', '2034-01-01T11:00:00Z', '2034-01-01T10:00:00Z', true)`,
    );
    expect(gecIptal).toMatch(/dersler_gec_iptal_chk/);
  });

  it('surum ve updated_at tetikleyicileri: her UPDATE surumu artirir', async () => {
    const [once] = await sistem<
      { surum: number }[]
    >`select surum::int from ders.dersler where id = ${dersA}`;
    await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`update ders.dersler set baslik = 'x' where id = ${dersA}`),
    );
    const [sonra] = await sistem<
      { surum: number }[]
    >`select surum::int from ders.dersler where id = ${dersA}`;
    expect(sonra?.surum).toBe((once?.surum ?? 0) + 1);
  });
});
