import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = [
  'geri_bildirimler',
  'ders_kaynaklari',
  'ders_kaynagi_alicilari',
  'ders_kaynagi_izlemeleri',
  'ders_kaynagi_sorunlari',
] as const;

/** Geri bildirim ve kaynak tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve kisitlar. */
describe.skipIf(dbYok())('geri bildirim ve kaynak tablolari: RLS izolasyonu ve kisitlar', () => {
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
  const dersA = uuidv7();
  const dersB = uuidv7();
  const kaynakA = uuidv7();
  const kaynakB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, sahip, grup, ogretmen, ogrenci, ders, kaynak] of [
      [kurumA, kullaniciA, grupA, ogretmenA, ogrenciA, dersA, kaynakA],
      [kurumB, kullaniciB, grupB, ogretmenB, ogrenciB, dersB, kaynakB],
    ] as const) {
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${sahip})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogretmen}, ${kurum}, ${sahip}, 'ogretmen')`;
      const ogrenciKullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad) values (${grup}, ${kurum}, 'grup', 'G')`;
      await sistem`
        insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at)
        values (${ders}, ${kurum}, ${grup}, ${ogretmen}, 'matematik', '2030-01-07T10:00:00Z', '2030-01-07T11:00:00Z', '2030-01-07T10:00:00Z')`;
      await sistem`insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id) values (${uuidv7()}, ${kurum}, ${ders}, ${ogrenci})`;
      await sistem`
        insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger)
        values (${uuidv7()}, ${kurum}, ${ders}, ${ogrenci}, 'anladim')`;
      await sistem`
        insert into ders.ders_kaynaklari (id, kurum_id, tur, ders_id, grup_id, baslik, saglayici, url, gorunurluk, ekleyen_id)
        values (${kaynak}, ${kurum}, 'kayit', ${ders}, ${grup}, 'K', 'zoom', 'https://zoom.us/rec/x', 'secili_ogrenciler', ${ogretmen})`;
      await sistem`insert into ders.ders_kaynagi_alicilari (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurum}, ${kaynak}, ${ogrenci})`;
      await sistem`insert into ders.ders_kaynagi_izlemeleri (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurum}, ${kaynak}, ${ogrenci})`;
      await sistem`insert into ders.ders_kaynagi_sorunlari (id, kurum_id, kaynak_id, bildiren_id, neden) values (${uuidv7()}, ${kurum}, ${kaynak}, ${ogrenci}, 'acilmiyor')`;
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

  it.each(TABLOLAR)('%s: A baglami B satirini guncelleyemez/silemez', async (tablo) => {
    // `tur`/`durum` gibi sutun adlari tablodan tabloya degisir: yalniz `kurum_id` kosulu ve no-op guncelleme.
    const guncel = await withTenant(app, ctxA(), (tx) =>
      tx.execute(
        sql.raw(
          `update ders.${tablo} set updated_at = now() where kurum_id = '${kurumB}' returning id`,
        ),
      ),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctxA(), (tx) =>
      tx.execute(sql.raw(`delete from ders.${tablo} where kurum_id = '${kurumB}' returning id`)),
    );
    expect(silinen).toHaveLength(0);
    const [b] = await sistem<{ n: number }[]>`
      select count(*)::int n from ders.${sistem(tablo)} where kurum_id = ${kurumB}`;
    expect(b?.n).toBeGreaterThan(0);
  });

  it('A baglamindan B kurumuna INSERT reddedilir (WITH CHECK) ve B kaynagina A adina alici/izleme/sorun eklenemez', async () => {
    const kaynakEkle = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ders.ders_kaynaklari (id, kurum_id, tur, ders_id, grup_id, baslik, saglayici, url, ekleyen_id)
          values (${uuidv7()}, ${kurumB}, 'kayit', ${dersB}, ${grupB}, 'K', 'zoom', 'https://zoom.us/x', ${ogretmenB})`),
      ),
    );
    expect(kaynakEkle).toMatch(/row-level security/);
    const geriBildirim = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(sql`
          insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger)
          values (${uuidv7()}, ${kurumB}, ${dersB}, ${ogrenciB}, 'kismen')`),
      ),
    );
    expect(geriBildirim).toMatch(/row-level security|violates/);
    // Bilesik FK: A kurumu adina B'nin kaynagina satir eklenemez.
    for (const ekle of [
      sql`insert into ders.ders_kaynagi_alicilari (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurumA}, ${kaynakB}, ${ogrenciA})`,
      sql`insert into ders.ders_kaynagi_izlemeleri (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurumA}, ${kaynakB}, ${ogrenciA})`,
      sql`insert into ders.ders_kaynagi_sorunlari (id, kurum_id, kaynak_id, bildiren_id, neden) values (${uuidv7()}, ${kurumA}, ${kaynakB}, ${ogrenciA}, 'diger')`,
    ]) {
      const metin = await hataMetni(withTenant(app, ctxA(), (tx) => tx.execute(ekle)));
      expect(metin).toMatch(/foreign key|violates/);
    }
  });

  it('geri bildirim: katilimci degil FK, ders+ogrenci tekil, CHECK kisitlari', async () => {
    const katilimciDegil = await hataMetni(
      sistem`insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger) values (${uuidv7()}, ${kurumA}, ${dersA}, ${ogretmenA}, 'anladim')`,
    );
    expect(katilimciDegil).toMatch(/geri_bildirimler_katilimci_fk|foreign key/);
    const cift = await hataMetni(
      sistem`insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger) values (${uuidv7()}, ${kurumA}, ${dersA}, ${ogrenciA}, 'kismen')`,
    );
    expect(cift).toMatch(/geri_bildirimler_ders_id_ogrenci_id_uniq|duplicate/);
    const deger = await hataMetni(
      sistem`update ders.geri_bildirimler set deger = 'belki' where ders_id = ${dersA}`,
    );
    expect(deger).toMatch(/geri_bildirimler_deger_chk/);
    const uzunNot = await hataMetni(
      sistem`update ders.geri_bildirimler set "not" = ${'x'.repeat(501)} where ders_id = ${dersA}`,
    );
    expect(uzunNot).toMatch(/geri_bildirimler_not_chk/);
  });

  it('kaynak: https zorunlu, <=2000, saglayici/gorunurluk/durum CHECK, kayit derssiz olamaz', async () => {
    const ekle = (ek: { url?: string; saglayici?: string; tur?: string; dersId?: string | null }) =>
      sistem`
        insert into ders.ders_kaynaklari (id, kurum_id, tur, ders_id, grup_id, baslik, saglayici, url, ekleyen_id)
        values (${uuidv7()}, ${kurumA}, ${ek.tur ?? 'materyal'}, ${ek.dersId ?? null}, ${grupA}, 'K',
                ${ek.saglayici ?? 'diger'}, ${ek.url ?? 'https://ornek.com/a'}, ${ogretmenA})`;
    expect(await hataMetni(ekle({ url: 'http://ornek.com/a' }))).toMatch(/ders_kaynaklari_url_chk/);
    expect(await hataMetni(ekle({ url: `https://ornek.com/${'a'.repeat(2000)}` }))).toMatch(
      /ders_kaynaklari_url_chk/,
    );
    expect(await hataMetni(ekle({ saglayici: 'dropbox' }))).toMatch(
      /ders_kaynaklari_saglayici_chk/,
    );
    expect(await hataMetni(ekle({ tur: 'kayit', dersId: null }))).toMatch(
      /ders_kaynaklari_kayit_ders_chk/,
    );
    await ekle({}); // dersten bagimsiz materyal serbest
    const gorunurluk = await hataMetni(
      sistem`update ders.ders_kaynaklari set gorunurluk = 'herkes' where id = ${kaynakA}`,
    );
    expect(gorunurluk).toMatch(/ders_kaynaklari_gorunurluk_chk/);
  });

  it('izleme ve alici tekil; sorun yalniz ACIK iken tekil (cozulunce yenisi acilabilir)', async () => {
    const izleme = await hataMetni(
      sistem`insert into ders.ders_kaynagi_izlemeleri (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurumA}, ${kaynakA}, ${ogrenciA})`,
    );
    expect(izleme).toMatch(/ders_kaynagi_izlemeleri_kaynak_id_ogrenci_id_uniq|duplicate/);
    const alici = await hataMetni(
      sistem`insert into ders.ders_kaynagi_alicilari (id, kurum_id, kaynak_id, ogrenci_id) values (${uuidv7()}, ${kurumA}, ${kaynakA}, ${ogrenciA})`,
    );
    expect(alici).toMatch(/ders_kaynagi_alicilari_kaynak_id_ogrenci_id_uniq|duplicate/);
    const ikinciAcik = await hataMetni(
      sistem`insert into ders.ders_kaynagi_sorunlari (id, kurum_id, kaynak_id, bildiren_id, neden) values (${uuidv7()}, ${kurumA}, ${kaynakA}, ${ogrenciA}, 'diger')`,
    );
    expect(ikinciAcik).toMatch(/ders_kaynagi_sorunlari_acik_uniq|duplicate/);
    await sistem`update ders.ders_kaynagi_sorunlari set durum = 'cozuldu', cozuldu_at = now() where kaynak_id = ${kaynakA}`;
    await sistem`insert into ders.ders_kaynagi_sorunlari (id, kurum_id, kaynak_id, bildiren_id, neden) values (${uuidv7()}, ${kurumA}, ${kaynakA}, ${ogrenciA}, 'diger')`;
    const neden = await hataMetni(
      sistem`update ders.ders_kaynagi_sorunlari set neden = 'baska' where kaynak_id = ${kaynakA}`,
    );
    expect(neden).toMatch(/ders_kaynagi_sorunlari_neden_chk/);
    const cozumsuz = await hataMetni(
      sistem`update ders.ders_kaynagi_sorunlari set durum = 'cozuldu' where kaynak_id = ${kaynakA} and durum = 'acik'`,
    );
    expect(cozumsuz).toMatch(/ders_kaynagi_sorunlari_cozum_chk/);
  });
});
