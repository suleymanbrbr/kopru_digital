import { withTenant, withUser } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, hataMetni } from './test/yardimcilar.js';

/**
 * Kurum A ve B sistem rolu ile hazirlanir; tum sorgular `bildirim_app` (NOBYPASSRLS, tablo sahibi degil)
 * baglantisiyla yapilir: super kullanici RLS'i atladigi icin izolasyon yalniz uygulama rolunde anlamlidir.
 */
describe.skipIf(dbYok())('bildirim veritabani: roller, sema ve RLS (bildirim_app)', () => {
  let o: Ortam;
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const uyA = uuidv7();
  const uyB = uuidv7();
  const kullA = uuidv7();
  const kullB = uuidv7();
  const duyuruA = uuidv7();
  const duyuruB = uuidv7();

  /** `kurum_id` sutunlu, RLS'li tablolar (kopyalar dahil). */
  const KIRACI_TABLOLARI = [
    'atama_kopyalari',
    'bildirimler',
    'duyuru_alicilari',
    'duyurular',
    'gonderimler',
    'grup_kopyalari',
    'grup_uyesi_kopyalari',
    'kademe_kopyalari',
    'kullanici_ayarlari',
    'kurum_kopyalari',
    'modul_ayari_kopyalari',
    'sms_kullanimlari',
    'tercihler',
    'uyelik_kopyalari',
    'zamanlanmis_bildirimler',
  ];

  beforeAll(async () => {
    o = ortamKur();
    for (const [kurum, uy, kull, duyuru] of [
      [kurumA, uyA, kullA, duyuruA],
      [kurumB, uyB, kullB, duyuruB],
    ] as const) {
      await o.sistem`insert into bildirim.kurum_kopyalari (kurum_id, ad, durum, saat_dilimi, son_olay_at, son_olay_id)
                     values (${kurum}, 'K', 'aktif', 'Europe/Istanbul', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                     values (${uy}, ${kurum}, ${kull}, 'ogrenci', 'aktif', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.kademe_kopyalari (kademe_id, kurum_id, ad, son_olay_at, son_olay_id)
                     values (${uuidv7()}, ${kurum}, 'K', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.grup_kopyalari (grup_id, kurum_id, tur, ad, durum, son_olay_at, son_olay_id)
                     values (${uuidv7()}, ${kurum}, 'grup', 'G', 'aktif', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, son_olay_at, son_olay_id)
                     values (${uuidv7()}, ${uy}, ${kurum}, ${uuidv7()}, '2026-01-01', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, son_olay_at, son_olay_id)
                     values (${uuidv7()}, ${kurum}, ${uuidv7()}, ${uuidv7()}, 'matematik', '2026-01-01', now(), ${uuidv7()})`;
      await o.sistem`insert into bildirim.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                     values (${kurum}, 'duyuru', 'kurum', ${kurum}, true, now(), ${uuidv7()})`;
      const bildirimId = uuidv7();
      await o.sistem`insert into bildirim.bildirimler (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, kaynak_olay_id, tekil_anahtar)
                     values (${bildirimId}, ${kurum}, ${uy}, 'soru', 'x', 'B', 'G', ${uuidv7()}, 'a')`;
      await o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar)
                     values (${uuidv7()}, ${kurum}, ${bildirimId}, ${kull}, 'push', 'x', 'c1')`;
      await o.sistem`insert into bildirim.zamanlanmis_bildirimler (id, kurum_id, kaynak_turu, kaynak_id, alici_id, sablon_kodu, gonderim_at)
                     values (${uuidv7()}, ${kurum}, 'ders', ${uuidv7()}, ${uy}, 'ders_hatirlatma', now())`;
      await o.sistem`insert into bildirim.duyurular (id, kurum_id, baslik, govde, hedef_turu, hedef_id, yazar_id)
                     values (${duyuru}, ${kurum}, 'D', 'G', 'kurum', ${kurum}, ${uy})`;
      await o.sistem`insert into bildirim.duyuru_alicilari (id, kurum_id, duyuru_id, alici_id)
                     values (${uuidv7()}, ${kurum}, ${duyuru}, ${uy})`;
      await o.sistem`insert into bildirim.sms_kullanimlari (kurum_id, donem, adet) values (${kurum}, '2026-11-01', 1)`;
      await o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
                     values (${kull}, ${kurum}, 'odev', 'push', false)`;
      await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id) values (${kull}, ${kurum})`;
      await o.sistem`insert into bildirim.cihazlar (id, kullanici_id, platform, push_belirteci, cihaz_kimligi)
                     values (${uuidv7()}, ${kull}, 'ios', ${`tok-${kull}`}, ${`c-${kull}`})`;
    }
  });
  afterAll(async () => {
    await o.kapat();
  });

  it('roller: bildirim_app BYPASSRLS degil, bildirim_sistem BYPASSRLS, hicbiri superuser degil', async () => {
    const roller = await o.owner<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
      select rolname, rolbypassrls, rolsuper from pg_roles
       where rolname in ('bildirim_owner', 'bildirim_app', 'bildirim_sistem') order by rolname`;
    expect(roller.map((r) => ({ ...r }))).toEqual([
      { rolname: 'bildirim_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'bildirim_owner', rolbypassrls: false, rolsuper: false },
      { rolname: 'bildirim_sistem', rolbypassrls: true, rolsuper: false },
    ]);
  });

  it('kurum_id sutunlu her tabloda RLS ENABLE + FORCE ve kiraci politikasi var (outbox haric)', async () => {
    const eksik = await o.owner<{ tablo: string }[]>`
      select n.nspname || '.' || c.relname as tablo
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
        join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'kurum_id' and not a.attisdropped
         and n.nspname in ('bildirim', 'ortak') and c.relname <> 'outbox'
         and not (c.relrowsecurity and c.relforcerowsecurity
                  and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'kiraci_izolasyonu'))`;
    expect(eksik).toEqual([]);
    const var_ = await o.owner<{ tablo: string }[]>`
      select c.relname as tablo from pg_attribute a
        join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
        join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'kurum_id' and n.nspname = 'bildirim' order by c.relname`;
    expect(var_.map((t) => t.tablo)).toEqual([...KIRACI_TABLOLARI].sort());
  });

  it('cihazlar: RLS ENABLE + FORCE ve kullanici politikasi var', async () => {
    const [c] = await o.owner<{ rls: boolean; zorla: boolean; politikalar: string[] }[]>`
      select c.relrowsecurity as rls, c.relforcerowsecurity as zorla,
             array(select polname from pg_policy p where p.polrelid = c.oid order by polname) as politikalar
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'bildirim' and c.relname = 'cihazlar'`;
    expect(c).toMatchObject({ rls: true, zorla: true });
    expect(c?.politikalar).toContain('kullanici_izolasyonu');
  });

  it('kurum A baglami yalniz A satirlarini gorur; B satiri gorunmez', async () => {
    for (const tablo of KIRACI_TABLOLARI) {
      const satirlar = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute<{ kurum_id: string }>(
          sql`select kurum_id from ${sql.identifier('bildirim')}.${sql.identifier(tablo)}`,
        ),
      );
      expect(satirlar.length, tablo).toBeGreaterThan(0);
      expect(new Set(satirlar.map((s) => s.kurum_id)), tablo).toEqual(new Set([kurumA]));
    }
  });

  it('baglam yoksa hicbir kiraci satiri gorunmez (fail-closed)', async () => {
    for (const tablo of [...KIRACI_TABLOLARI, 'cihazlar']) {
      const r = await o.app.sql.unsafe(`select count(*)::int n from bildirim.${tablo}`);
      expect(r[0]?.n, tablo).toBe(0);
    }
  });

  it('baska kurum icin yazma reddedilir', async () => {
    const yaz = await hataMetni(
      withTenant(o.app, { kurumId: kurumA }, (tx) =>
        tx.execute(sql`insert into bildirim.bildirimler (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, kaynak_olay_id, tekil_anahtar)
                       values (${uuidv7()}, ${kurumB}, ${uyB}, 'soru', 'x', 'B', 'G', ${uuidv7()}, 'z')`),
      ),
    );
    expect(yaz).toMatch(/row-level security/);
    const guncelle = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
      tx.execute(
        sql`update bildirim.bildirimler set okundu_at = now() where kurum_id = ${kurumB} returning 1`,
      ),
    );
    expect(guncelle.length).toBe(0);
  });

  it('cihazlar: kullanici yalniz kendi cihazini gorur; kurum baglami cihaz gormez', async () => {
    const a = await withUser(o.app, { kullaniciId: kullA }, (tx) =>
      tx.execute<{ kullanici_id: string }>(sql`select kullanici_id from bildirim.cihazlar`),
    );
    expect(a.map((r) => r.kullanici_id)).toEqual([kullA]);
    const kurum = await withTenant(o.app, { kurumId: kurumA }, (tx) =>
      tx.execute(sql`select 1 from bildirim.cihazlar`),
    );
    expect(kurum.length).toBe(0);
  });

  it('cihazlar: baska kullanici icin yazma ve guncelleme reddedilir', async () => {
    const yaz = await hataMetni(
      withUser(o.app, { kullaniciId: kullA }, (tx) =>
        tx.execute(sql`insert into bildirim.cihazlar (id, kullanici_id, platform, push_belirteci, cihaz_kimligi)
                       values (${uuidv7()}, ${kullB}, 'ios', 'x-baska', 'c9')`),
      ),
    );
    expect(yaz).toMatch(/row-level security/);
    const guncelle = await withUser(o.app, { kullaniciId: kullA }, (tx) =>
      tx.execute(
        sql`update bildirim.cihazlar set aktif = false where kullanici_id = ${kullB} returning 1`,
      ),
    );
    expect(guncelle.length).toBe(0);
  });

  it('cihazlar: devir politikasi yalniz belirteci sunan istege, yalniz pasiflestirme izni verir', async () => {
    const belirtec = `tok-${kullB}`;
    // Belirtec sunulmadan baska kullanicinin satiri pasiflenemez.
    const yok = await withUser(o.app, { kullaniciId: kullA }, (tx) =>
      tx.execute(
        sql`update bildirim.cihazlar set aktif = false where push_belirteci = ${belirtec} returning 1`,
      ),
    );
    expect(yok.length).toBe(0);
    // Belirtec sunulursa pasiflenebilir ...
    const devir = await withUser(o.app, { kullaniciId: kullA }, async (tx) => {
      await tx.execute(sql`select set_config('app.devir_belirteci', ${belirtec}, true)`);
      return tx.execute(
        sql`update bildirim.cihazlar set aktif = false where push_belirteci = ${belirtec} returning 1`,
      );
    });
    expect(devir.length).toBe(1);
    await o.sistem`update bildirim.cihazlar set aktif = true where kullanici_id = ${kullB}`;
    // ... ama baska bir sutun (ornegin sahip) degistirilemez ya da silinemez.
    const sahiplen = await hataMetni(
      withUser(o.app, { kullaniciId: kullA }, async (tx) => {
        await tx.execute(sql`select set_config('app.devir_belirteci', ${belirtec}, true)`);
        return tx.execute(
          sql`update bildirim.cihazlar set kullanici_id = ${kullA} where push_belirteci = ${belirtec}`,
        );
      }),
    );
    expect(sahiplen).toMatch(/cihaz_sahibi_degistirilemez/);
    const sil = await withUser(o.app, { kullaniciId: kullA }, async (tx) => {
      await tx.execute(sql`select set_config('app.devir_belirteci', ${belirtec}, true)`);
      return tx.execute(
        sql`delete from bildirim.cihazlar where push_belirteci = ${belirtec} returning 1`,
      );
    });
    expect(sil.length).toBe(0);
  });

  it('tercihler ve ayarlar: kullanici kolu kendi satirini gorur, baska kullanici (baska kurum baglami) gormez', async () => {
    for (const tablo of ['tercihler', 'kullanici_ayarlari']) {
      const kendi = await withUser(o.app, { kullaniciId: kullA }, (tx) =>
        tx.execute<{ kullanici_id: string }>(
          sql`select kullanici_id from ${sql.identifier('bildirim')}.${sql.identifier(tablo)}`,
        ),
      );
      expect(
        kendi.map((r) => r.kullanici_id),
        tablo,
      ).toEqual([kullA]);
      const baska = await withTenant(o.app, { kurumId: kurumB, kullaniciId: kullB }, (tx) =>
        tx.execute<{ kullanici_id: string }>(
          sql`select kullanici_id from ${sql.identifier('bildirim')}.${sql.identifier(tablo)}`,
        ),
      );
      expect(
        baska.map((r) => r.kullanici_id),
        tablo,
      ).toEqual([kullB]);
    }
  });

  it('kisitlar: sistem kategorisi ve kapali kutu tercihi, esit olmayan sessiz saat ciftleri reddedilir', async () => {
    const sistem = await hataMetni(
      o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
               values (${kullA}, ${kurumA}, 'sistem', 'push', false)`,
    );
    expect(sistem).toMatch(/tercihler_sistem_chk/);
    const kutu = await hataMetni(
      o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
               values (${kullA}, ${kurumA}, 'odev', 'kutu', false)`,
    );
    expect(kutu).toMatch(/tercihler_kutu_chk/);
    const sessiz = await hataMetni(
      o.sistem`update bildirim.kullanici_ayarlari set sessiz_baslangic = '22:00' where kullanici_id = ${kullA}`,
    );
    expect(sessiz).toMatch(/kullanici_ayarlari_sessiz_chk/);
  });

  it('sablonlar: kisisel veri iceren push sablonu CHECK ile reddedilir', async () => {
    const hata = await hataMetni(
      o.sistem`insert into bildirim.sablonlar (id, kod, kategori, kanal, govde, kisisel_veri_iceriyor)
               values (${uuidv7()}, 'kisisel_deneme', 'soru', 'push', 'g', true)`,
    );
    expect(hata).toMatch(/sablonlar_kisisel_veri_chk/);
  });

  it('gonderimler: ayni bildirim ayni hedefe iki kez yazilamaz; atlama nedeni yalniz atlandi durumunda', async () => {
    const [b] = await o.sistem<
      { id: string }[]
    >`select id from bildirim.bildirimler where kurum_id = ${kurumA}`;
    const tekrar = await hataMetni(
      o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar)
               values (${uuidv7()}, ${kurumA}, ${b?.id ?? null}, ${kullA}, 'push', 'x', 'c1')`,
    );
    expect(tekrar).toMatch(/gonderimler_bildirim_id_kanal_hedef_uniq/);
    const neden = await hataMetni(
      o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar, durum, atlama_nedeni)
               values (${uuidv7()}, ${kurumA}, ${b?.id ?? null}, ${kullA}, 'push', 'x', 'c2', 'beklemede', 'kota')`,
    );
    expect(neden).toMatch(/gonderimler_atlama_durum_chk/);
  });

  it('gonderimler: bildirim silinince bildirim_id bosalir, gonderim satiri kalir', async () => {
    const kurum = uuidv7();
    const b = uuidv7();
    await o.sistem`insert into bildirim.bildirimler (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, kaynak_olay_id, tekil_anahtar)
                   values (${b}, ${kurum}, ${uuidv7()}, 'soru', 'x', 'B', 'G', ${uuidv7()}, 'sil')`;
    const g = uuidv7();
    await o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar)
                   values (${g}, ${kurum}, ${b}, ${uuidv7()}, 'push', 'x', 'c1')`;
    await o.sistem`delete from bildirim.bildirimler where id = ${b}`;
    const [s] = await o.sistem<{ bildirim_id: string | null; kurum_id: string }[]>`
      select bildirim_id, kurum_id from bildirim.gonderimler where id = ${g}`;
    expect(s).toEqual({ bildirim_id: null, kurum_id: kurum });
  });

  it('duyurular: okunan_sayisi alici_sayisini asamaz; kurum hedefi kurum_id olmali', async () => {
    const asim = await hataMetni(
      o.sistem`update bildirim.duyurular set okunan_sayisi = 1 where id = ${duyuruA}`,
    );
    expect(asim).toMatch(/duyurular_okunan_chk/);
    const hedef = await hataMetni(
      o.sistem`insert into bildirim.duyurular (id, kurum_id, baslik, govde, hedef_turu, hedef_id, yazar_id)
               values (${uuidv7()}, ${kurumA}, 'D', 'G', 'kurum', ${uuidv7()}, ${uyA})`,
    );
    expect(hedef).toMatch(/duyurular_kurum_hedef_chk/);
  });

  it('outbox: bildirim_app olay yazar ama guncelleyemez/silemez', async () => {
    const hata = await hataMetni(o.app.sql`update ortak.outbox set subject = 'x'`);
    expect(hata).toMatch(/permission denied/);
  });
});
