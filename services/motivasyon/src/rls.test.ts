import { withTenant } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, hataMetni } from './test/yardimcilar.js';

/**
 * Kurum A ve B sistem rolu ile hazirlanir; tum sorgular `motivasyon_app` (NOBYPASSRLS, tablo sahibi degil)
 * baglantisiyla yapilir: super kullanici RLS'i atladigi icin izolasyon yalniz uygulama rolunde anlamlidir.
 */
describe.skipIf(dbYok())('motivasyon veritabani: roller, sema ve RLS (motivasyon_app)', () => {
  let o: Ortam;
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const ogrA = uuidv7();
  const ogrB = uuidv7();

  /** `kurum_id` sutunlu, RLS'li tablolar (kopyalar dahil). */
  const KIRACI_TABLOLARI = [
    'kurum_kopyalari',
    'uyelik_kopyalari',
    'grup_kopyalari',
    'grup_uyesi_kopyalari',
    'atama_kopyalari',
    'modul_ayari_kopyalari',
    'ogrenci_durumlari',
    'xp_hareketleri',
    'xp_gunluk_toplamlari',
    'ogrenci_gunluk_aktivite',
    'ogrenci_sayaclari',
    'beceri_puanlari',
    'xp_ozne_durumlari',
    'deneme_gecmisi',
    'seriler',
    'seri_gunleri',
    'seri_duraklatmalari',
    'haftanin_yildizlari',
    'ogrenci_rozetleri',
    'ogrenci_karakterleri',
    'ogrenci_kozmetikleri',
    'karakter_kusanimlari',
    'odak_oturumlari',
  ];

  beforeAll(async () => {
    o = ortamKur();
    for (const [kurum, ogr] of [
      [kurumA, ogrA],
      [kurumB, ogrB],
    ] as const) {
      await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, toplam_xp)
                     values (${uuidv7()}, ${kurum}, ${ogr}, 50)`;
      await o.sistem`insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
                     values (${kurum}, 'kurum', 'aktif', 'Europe/Istanbul', now(), ${uuidv7()})`;
      await o.sistem`insert into motivasyon.xp_hareketleri (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, xp, gun, olusma_at)
                     values (${uuidv7()}, ${kurum}, ${ogr}, 'yoklama_geldi', ${uuidv7()}, 20, '2026-11-10', now())`;
    }
  });
  afterAll(async () => {
    await o.kapat();
  });

  it('roller: motivasyon_app BYPASSRLS degil, motivasyon_sistem BYPASSRLS, hicbiri superuser degil', async () => {
    const roller = await o.owner<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
      select rolname, rolbypassrls, rolsuper from pg_roles
       where rolname in ('motivasyon_owner', 'motivasyon_app', 'motivasyon_sistem') order by rolname`;
    expect(roller.map((r) => ({ ...r }))).toEqual([
      { rolname: 'motivasyon_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'motivasyon_owner', rolbypassrls: false, rolsuper: false },
      { rolname: 'motivasyon_sistem', rolbypassrls: true, rolsuper: false },
    ]);
  });

  it('kurum_id sutunlu her tabloda RLS ENABLE + FORCE ve kiraci politikasi var (outbox haric)', async () => {
    const eksik = await o.owner<{ tablo: string }[]>`
      select n.nspname || '.' || c.relname as tablo
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
        join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'kurum_id' and not a.attisdropped
         and n.nspname in ('motivasyon', 'ortak') and c.relname <> 'outbox'
         and not (c.relrowsecurity and c.relforcerowsecurity
                  and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'kiraci_izolasyonu'))`;
    expect(eksik).toEqual([]);
    const var_ = await o.owner<{ tablo: string }[]>`
      select c.relname as tablo from pg_attribute a
        join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
        join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'kurum_id' and n.nspname = 'motivasyon' order by c.relname`;
    expect(var_.map((t) => t.tablo)).toEqual([...KIRACI_TABLOLARI].sort());
  });

  it('kurum A baglami yalniz A satirlarini gorur; B satiri gorunmez', async () => {
    for (const tablo of ['ogrenci_durumlari', 'xp_hareketleri', 'kurum_kopyalari']) {
      const satirlar = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute<{ kurum_id: string }>(
          sql`select kurum_id from ${sql.identifier('motivasyon')}.${sql.identifier(tablo)}`,
        ),
      );
      expect(satirlar.length).toBeGreaterThan(0);
      expect(new Set(satirlar.map((s) => s.kurum_id))).toEqual(new Set([kurumA]));
    }
  });

  it('kurum baglami yoksa hicbir satir gorunmez (fail-closed)', async () => {
    const r = await o.app.sql`select count(*)::int n from motivasyon.ogrenci_durumlari`;
    expect(r[0]?.n).toBe(0);
  });

  it('baska kurum icin yazma ve guncelleme reddedilir', async () => {
    const yaz = hataMetni(
      withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute(sql`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id)
                       values (${uuidv7()}, ${kurumB}, ${uuidv7()})`),
      ),
    );
    expect(await yaz).toMatch(/row-level security/);
    const guncelle = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
      tx.execute(
        sql`update motivasyon.ogrenci_durumlari set toplam_xp = 9999 where ogrenci_id = ${ogrB} returning id`,
      ),
    );
    expect(guncelle).toHaveLength(0);
    const b =
      await o.sistem`select toplam_xp::int from motivasyon.ogrenci_durumlari where ogrenci_id = ${ogrB}`;
    expect(b[0]?.toplam_xp).toBe(50);
  });

  it('xp defteri: uygulama rolu guncelleyemez/silemez (yetki) ve tetikleyici sistem rolunu da engeller', async () => {
    const guncelle = await hataMetni(
      withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute(sql`update motivasyon.xp_hareketleri set xp = 1 where kurum_id = ${kurumA}`),
      ),
    );
    expect(guncelle).toMatch(/permission denied/);
    const sil = await hataMetni(
      withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute(sql`delete from motivasyon.xp_hareketleri where kurum_id = ${kurumA}`),
      ),
    );
    expect(sil).toMatch(/permission denied/);
    await expect(
      o.sistem`update motivasyon.xp_hareketleri set xp = 1 where kurum_id = ${kurumA}`,
    ).rejects.toThrow(/permission denied/);
    await expect(
      o.owner`delete from motivasyon.xp_hareketleri where kurum_id = ${kurumA}`,
    ).rejects.toThrow(/defter_degistirilemez/);
  });

  it('xp defteri kisitlari: ters kayit biciimi, tekrar ve sifir xp', async () => {
    const id = uuidv7();
    const olayId = uuidv7();
    const ekle = (
      xp: number,
      ters: string | null,
      kural = 'odev_teslim',
      ozne: string | null = null,
    ) =>
      o.sistem`insert into motivasyon.xp_hareketleri
                 (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, kaynak_ozne_id, xp, gun, olusma_at, ters_cevrilen_id, neden)
               values (${uuidv7()}, ${kurumA}, ${ogrA}, ${kural}, ${uuidv7()}, ${ozne}, ${xp}, '2026-11-10', now(), ${ters},
                       ${ters ? 'test' : null})`;
    await o.sistem`insert into motivasyon.xp_hareketleri (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, kaynak_ozne_id, xp, gun, olusma_at)
                   values (${id}, ${kurumA}, ${ogrA}, 'odev_teslim', ${olayId}, ${id}, 15, '2026-11-10', now())`;
    await expect(ekle(0, null)).rejects.toThrow(/violates check constraint/);
    await expect(ekle(-5, null)).rejects.toThrow(/violates check constraint/);
    await expect(ekle(5, id)).rejects.toThrow(/xp_hareketleri_ters_chk/);
    // ayni (olay, kural) iki kez
    await expect(
      o.sistem`insert into motivasyon.xp_hareketleri (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, xp, gun, olusma_at)
               values (${uuidv7()}, ${kurumA}, ${ogrA}, 'odev_teslim', ${olayId}, 15, '2026-11-10', now())`,
    ).rejects.toThrow(/kaynak_olay_id_kural_kodu_uniq/);
    // ayni ozneden (ayni surum) ikinci pozitif kazanim
    await expect(ekle(15, null, 'odev_teslim', id)).rejects.toThrow(/ozne_tekrar_uniq/);
    // ters kayit bir kez
    await ekle(-15, id);
    await expect(ekle(-15, id)).rejects.toThrow(/ters_cevrilen_id_uniq/);
  });

  it('yapilandirma tablolari uygulama rolune salt okunur; sistem rolu degistirebilir', async () => {
    const oku = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int n from motivasyon.xp_kurallari`),
    );
    expect(oku[0]?.n).toBe(12);
    for (const s of [
      sql`update motivasyon.xp_kurallari set xp = 99`,
      sql`delete from motivasyon.rozet_tanimlari`,
      sql`insert into motivasyon.xp_tavanlari (kod, gunluk_ust_sinir) values ('x', 1)`,
      sql`update motivasyon.seviyeler set gereken_toplam_xp = 1`,
    ]) {
      expect(
        await hataMetni(withTenant(o.app, { kurumId: kurumA }, (tx) => tx.execute(s))),
      ).toMatch(/permission denied/);
    }
    const id = uuidv7();
    await o.sistem`insert into motivasyon.yapilandirma_gecmisi (id, tablo, anahtar, once, sonra, neden)
                   values (${id}, 'xp_kurallari', 'yoklama_geldi', '{"xp":20}', '{"xp":25}', 'deneme')`;
    await expect(
      o.sistem`update motivasyon.yapilandirma_gecmisi set neden = 'x' where id = ${id}`,
    ).rejects.toThrow();
    await expect(
      o.owner`delete from motivasyon.yapilandirma_gecmisi where id = ${id}`,
    ).rejects.toThrow(/defter_degistirilemez/);
  });

  it('kiraci tablolarinda bilesik FK: baska kurumun ogrencisine satir baglanamaz', async () => {
    const hata = await hataMetni(
      o.sistem`insert into motivasyon.ogrenci_sayaclari (ogrenci_id, sayac_kodu, kurum_id, deger)
               values (${ogrA}, 'toplam_soru', ${kurumB}, 1)`,
    );
    expect(hata).toMatch(/ogrenci_sayaclari_ogrenci_fk/);
  });

  it('rozet tekil, kusanim slot ve sahiplik kontrolu, odak tek devam oturumu, duraklatma cakismasi', async () => {
    await o.sistem`insert into motivasyon.ogrenci_rozetleri (id, kurum_id, ogrenci_id, rozet_kodu, kaynak_olay_id)
                   values (${uuidv7()}, ${kurumA}, ${ogrA}, 'odev_bronz', ${uuidv7()})`;
    await expect(
      o.sistem`insert into motivasyon.ogrenci_rozetleri (id, kurum_id, ogrenci_id, rozet_kodu, kaynak_olay_id)
               values (${uuidv7()}, ${kurumA}, ${ogrA}, 'odev_bronz', ${uuidv7()})`,
    ).rejects.toThrow(/ogrenci_rozetleri_ogrenci_id_rozet_kodu_uniq/);

    // sahip olunmayan kozmetik giyilemez
    await expect(
      o.sistem`insert into motivasyon.karakter_kusanimlari (ogrenci_id, slot, kurum_id, kozmetik_kodu)
               values (${ogrA}, 'sapka', ${kurumA}, 'sapka_kasket')`,
    ).rejects.toThrow(/karakter_kusanimlari_sahiplik_fk/);
    await o.sistem`insert into motivasyon.ogrenci_kozmetikleri (id, kurum_id, ogrenci_id, kozmetik_kodu)
                   values (${uuidv7()}, ${kurumA}, ${ogrA}, 'sapka_kasket')`;
    // slot uyusmazligi
    await expect(
      o.sistem`insert into motivasyon.karakter_kusanimlari (ogrenci_id, slot, kurum_id, kozmetik_kodu)
               values (${ogrA}, 'gozluk', ${kurumA}, 'sapka_kasket')`,
    ).rejects.toThrow(/kusanim_slot_uyusmuyor/);
    await o.sistem`insert into motivasyon.karakter_kusanimlari (ogrenci_id, slot, kurum_id, kozmetik_kodu)
                   values (${ogrA}, 'sapka', ${kurumA}, 'sapka_kasket')`;

    // odak: ayni anda tek devam oturumu, planlanan sure siniri
    const odak = (durum: string, dk = 25) =>
      o.sistem`insert into motivasyon.odak_oturumlari (id, kurum_id, ogrenci_id, istemci_id, baslangic_at, planlanan_dk, durum)
               values (${uuidv7()}, ${kurumA}, ${ogrA}, ${uuidv7()}, now(), ${dk}, ${durum})`;
    await odak('devam');
    await expect(odak('devam')).rejects.toThrow(/odak_oturumlari_ogrenci_id_devam_uniq/);
    await odak('tamam');
    await expect(odak('tamam', 4)).rejects.toThrow(/planlanan_dk_chk/);

    // seri duraklatma: cakisan aralik reddedilir, iptal edilen sayilmaz
    const grup = uuidv7();
    await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                   values (${grup}, ${kurumA}, 'grup', 'aktif', now(), ${uuidv7()})`;
    const dur = (b: string, e: string) =>
      o.sistem`insert into motivasyon.seri_duraklatmalari (id, kurum_id, grup_id, veren_ogretmen_id, baslangic_gun, bitis_gun)
               values (${uuidv7()}, ${kurumA}, ${grup}, ${uuidv7()}, ${b}::date, ${e}::date)`;
    await dur('2026-11-10', '2026-11-15');
    await expect(dur('2026-11-14', '2026-11-20')).rejects.toThrow(
      /seri_duraklatmalari_cakisma_excl/,
    );
    await expect(dur('2026-12-01', '2027-02-01')).rejects.toThrow(/seri_duraklatmalari_aralik_chk/);
  });

  it('haftanin yildizi: ogrenci haftada bir kez, hafta Pazartesi olmali', async () => {
    const yildiz = (hafta: string) =>
      o.sistem`insert into motivasyon.haftanin_yildizlari (id, kurum_id, ogrenci_id, veren_ogretmen_id, grup_id, hafta_baslangic)
               values (${uuidv7()}, ${kurumA}, ${ogrA}, ${uuidv7()}, ${uuidv7()}, ${hafta}::date)`;
    await yildiz('2026-11-09');
    await expect(yildiz('2026-11-09')).rejects.toThrow(/ogrenci_id_hafta_baslangic_uniq/);
    await expect(yildiz('2026-11-10')).rejects.toThrow(/haftanin_yildizlari_hafta_chk/);
  });
});
