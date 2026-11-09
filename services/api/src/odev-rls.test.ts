import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = ['odevler', 'ogrenci_odevleri', 'odev_sablonlari'] as const;

/** `ogrenme` odev tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve veritabani kisitlari. */
describe.skipIf(dbYok())('ogrenme odev tablolari: RLS izolasyonu ve kisitlar', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const ogretmenA = uuidv7();
  const ogretmenB = uuidv7();
  const ogrenciA = uuidv7();
  const ogrenciB = uuidv7();
  const odevA = uuidv7();
  const odevB = uuidv7();
  const satirA = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  interface OdevEk {
    hedef_id?: string;
    durum?: string;
    tur?: string;
    kaynak?: string;
    hedef_soru_sayisi?: number;
  }

  async function odevEkle(kurum: string, veren: string, ek: OdevEk = {}) {
    const id = uuidv7();
    const durum = ek.durum ?? 'taslak';
    await sistem`
      insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, hedef_turu, hedef_id, durum, yayin_at, tur, kaynak, hedef_soru_sayisi)
      values (${id}, ${kurum}, ${veren}, 'Ödev', 'matematik', 'kurum', ${ek.hedef_id ?? kurum}, ${durum},
              ${durum === 'taslak' ? null : new Date()}, ${ek.tur ?? 'soru'}, ${ek.kaynak ?? null}, ${ek.hedef_soru_sayisi ?? null})`;
    return id;
  }

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, ogretmen, ogrenci, odev] of [
      [kurumA, kullaniciA, ogretmenA, ogrenciA, odevA],
      [kurumB, kullaniciB, ogretmenB, ogrenciB, odevB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogretmen}, ${kurum}, ${sahip}, 'ogretmen')`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`
        insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, hedef_turu, hedef_id)
        values (${odev}, ${kurum}, ${ogretmen}, 'Ödev', 'matematik', 'kurum', ${kurum})`;
      await sistem`
        insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id)
        values (${kurum === kurumA ? satirA : uuidv7()}, ${kurum}, ${odev}, ${ogrenci})`;
      await sistem`
        insert into ogrenme.odev_sablonlari (id, kurum_id, ogretmen_id, baslik, brans_kodu)
        values (${uuidv7()}, ${kurum}, ${ogretmen}, 'Şablon', 'matematik')`;
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
          insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, hedef_turu, hedef_id)
          values (${uuidv7()}, ${kurumB}, ${ogretmenB}, 'x', 'matematik', 'kurum', ${kurumB})`),
      ),
    );
    expect(ekle).toMatch(/row-level security/);
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql`update ogrenme.odevler set baslik = 'ele gecirildi' where id = ${odevB} returning id`,
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql`delete from ogrenme.odevler where id = ${odevB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const [b] = await sistem<
      { baslik: string }[]
    >`select baslik from ogrenme.odevler where id = ${odevB}`;
    expect(b?.baslik).toBe('Ödev');
  });

  it('api_app, B kurumunun odevine A kurumu adina ogrenci satiri acamaz (bilesik FK + RLS)', async () => {
    const metin = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id)
          values (${uuidv7()}, ${kurumA}, ${odevB}, ${ogrenciA})`),
      ),
    );
    expect(metin).toMatch(/foreign key|violates/);
  });

  it('ogrenci satiri (odev_id, ogrenci_id) tekil: fan-out tekrar calisinca coğalmaz', async () => {
    const metin = await hataMetni(sistem`
      insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id)
      values (${uuidv7()}, ${kurumA}, ${odevA}, ${ogrenciA})`);
    expect(metin).toMatch(/ogrenci_odevleri_odev_id_ogrenci_id_uniq|duplicate/);
    const [n] = await sistem<{ n: number }[]>`
      with e as (
        insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id)
        values (${uuidv7()}, ${kurumA}, ${odevA}, ${ogrenciA})
        on conflict (odev_id, ogrenci_id) do nothing returning id)
      select count(*)::int n from e`;
    expect(n?.n).toBe(0);
  });

  it('odevler CHECK kisitlari: tur, kaynak, hedef, durum/yayin_at', async () => {
    expect(await hataMetni(odevEkle(kurumA, ogretmenA, { tur: 'x' }))).toMatch(/odevler_tur_chk/);
    expect(await hataMetni(odevEkle(kurumA, ogretmenA, { kaynak: 'k'.repeat(201) }))).toMatch(
      /odevler_kaynak_chk/,
    );
    expect(await hataMetni(odevEkle(kurumA, ogretmenA, { hedef_id: uuidv7() }))).toMatch(
      /odevler_hedef_kurum_chk/,
    );
    expect(await hataMetni(odevEkle(kurumA, ogretmenA, { hedef_soru_sayisi: 0 }))).toMatch(
      /odevler_hedef_soru_sayisi_chk/,
    );
    await odevEkle(kurumA, ogretmenA, { tur: 'serbest', kaynak: 'Z', durum: 'yayinda' });
    const yayinsiz = await hataMetni(sistem`
      insert into ogrenme.odevler (id, kurum_id, veren_id, baslik, brans_kodu, hedef_turu, hedef_id, durum)
      values (${uuidv7()}, ${kurumA}, ${ogretmenA}, 'x', 'matematik', 'kurum', ${kurumA}, 'yayinda')`);
    expect(yayinsiz).toMatch(/odevler_yayin_chk/);
  });

  it('ogrenci_odevleri CHECK: dogru+yanlis+bos <= yapilan, negatif yok, teslim_at/durum tutarli', async () => {
    const guncelle = (kume: string) =>
      hataMetni(
        sistem.unsafe(`update ogrenme.ogrenci_odevleri set ${kume} where id = '${satirA}'`).then(),
      );
    expect(
      await guncelle(
        'yapilan_soru_sayisi = 10, dogru_sayisi = 6, yanlis_sayisi = 3, bos_sayisi = 2',
      ),
    ).toMatch(/ogrenci_odevleri_toplam_chk/);
    expect(await guncelle('yapilan_soru_sayisi = 10, yanlis_sayisi = -1')).toMatch(
      /ogrenci_odevleri_sayilar_chk/,
    );
    expect(await guncelle("durum = 'teslim_edildi'")).toMatch(/ogrenci_odevleri_teslim_at_chk/);
    expect(await guncelle("durum = 'incelendi', teslim_at = now()")).toMatch(
      /ogrenci_odevleri_incelendi_at_chk/,
    );
    expect(await guncelle("inceleme_sonucu = 'belki'")).toMatch(
      /ogrenci_odevleri_inceleme_sonucu_chk/,
    );
  });
});
