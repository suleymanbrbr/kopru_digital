import { MEDYA_TUR_KURALLARI, MEDYA_DOSYA_TURLERI } from '@kopru/contracts';
import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, testDb } from './test/yardimcilar.js';

/**
 * Kurum A ve B sistem rolu ile hazirlanir; tum sorgular `medya_app` (NOBYPASSRLS, tablo sahibi degil)
 * baglantisiyla yapilir: super kullanici RLS'i atladigi icin izolasyon yalniz uygulama rolunde anlamlidir.
 */
describe.skipIf(dbYok())('medya veritabani: roller, sema ve RLS (medya_app)', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const dosyaA = uuidv7();
  const dosyaB = uuidv7();
  let owner: postgres.Sql;
  let sistem: postgres.Sql;
  let app: Database;

  const dosya = (id: string, kurum: string, kullanici: string) => sistem`
    insert into medya.dosyalar
      (id, kurum_id, sahip_kullanici_id, sahip_uyelik_id, tur, mime_tipi, bildirilen_boyut_bayt,
       bildirilen_sha256, depolama_anahtari, istemci_anahtari, yukleme_son_at)
    values (${id}, ${kurum}, ${kullanici}, ${uuidv7()}, 'soru_fotografi', 'image/jpeg', 1000,
            decode(${'ab'.repeat(32)}, 'hex'), ${`${kurum}/soru_fotografi/2026/11/${id}`}, ${uuidv7()},
            now() + interval '15 minutes')`;

  beforeAll(async () => {
    if (!urls) return;
    owner = postgres(urls.ownerUrl, { max: 1, onnotice: () => undefined });
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    await dosya(dosyaA, kurumA, kullaniciA);
    await dosya(dosyaB, kurumB, uuidv7());
    await sistem`insert into medya.kurum_kotalari (id, kurum_id) values (${uuidv7()}, ${kurumA}), (${uuidv7()}, ${kurumB})`;
    await sistem`insert into medya.kurum_kopyalari (kurum_id) values (${kurumA}), (${kurumB})`;
    await sistem`insert into medya.kucuk_resimler (id, kurum_id, dosya_id, varyant, depolama_anahtari, genislik, yukseklik, boyut_bayt)
                 values (${uuidv7()}, ${kurumA}, ${dosyaA}, 'kucuk', ${`a-${dosyaA}`}, 10, 10, 100),
                        (${uuidv7()}, ${kurumB}, ${dosyaB}, 'kucuk', ${`b-${dosyaB}`}, 10, 10, 100)`;
  });

  afterAll(async () => {
    await app.close();
    await sistem.end();
    await owner.end();
  });

  const ctx = (kurumId: string) => ({ kurumId });

  it('roller: medya_app BYPASSRLS degil, medya_sistem BYPASSRLS, hicbiri superuser degil', async () => {
    const roller = await owner<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
      select rolname, rolbypassrls, rolsuper from pg_roles
       where rolname in ('medya_owner', 'medya_app', 'medya_sistem') order by rolname`;
    expect(roller).toEqual([
      { rolname: 'medya_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'medya_owner', rolbypassrls: false, rolsuper: false },
      { rolname: 'medya_sistem', rolbypassrls: true, rolsuper: false },
    ]);
  });

  it('kurum_id sutunlu her tabloda RLS ENABLE + FORCE (outbox haric)', async () => {
    const eksik = await owner<{ tablo: string }[]>`
      select n.nspname || '.' || c.relname as tablo
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
        join pg_namespace n on n.oid = c.relnamespace
       where a.attname = 'kurum_id' and not a.attisdropped and n.nspname in ('medya', 'ortak')
         and not (c.relrowsecurity and c.relforcerowsecurity)
         and (n.nspname || '.' || c.relname) <> 'ortak.outbox'`;
    expect(eksik).toEqual([]);
  });

  it('tablolar medya_owner sahipligindedir, medya_app sahip degildir', async () => {
    const sahipler = await owner<{ sahip: string }[]>`
      select distinct pg_get_userbyid(c.relowner) sahip from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('medya', 'ortak') and c.relkind = 'r'`;
    expect(sahipler).toEqual([{ sahip: 'medya_owner' }]);
  });

  it('saklama politikasi tohumu contracts MEDYA_TUR_KURALLARI ile birebir ayni', async () => {
    const satirlar = await owner<
      { tur: string; izinli_mime: string[]; azami_boyut_bayt: string; azami_sure_sn: number | null }[]
    >`select tur, izinli_mime, azami_boyut_bayt, azami_sure_sn from medya.saklama_politikalari order by tur`;
    expect(satirlar.map((s) => s.tur)).toEqual([...MEDYA_DOSYA_TURLERI].sort());
    for (const s of satirlar) {
      const k = MEDYA_TUR_KURALLARI[s.tur as keyof typeof MEDYA_TUR_KURALLARI];
      expect([...s.izinli_mime].sort()).toEqual([...k.izinli_mime].sort());
      expect(Number(s.azami_boyut_bayt)).toBe(k.azami_boyut_bayt);
      expect(s.azami_sure_sn).toBe('azami_sure_sn' in k ? k.azami_sure_sn : null);
      expect(s.izinli_mime).not.toContain('image/heic');
      expect(s.izinli_mime).not.toContain('image/svg+xml');
    }
  });

  it('A baglami yalniz A satirlarini gorur; crafted B sorgusu bos doner (tum kiraci tablolari)', async () => {
    for (const tablo of ['dosyalar', 'kucuk_resimler', 'kurum_kotalari', 'kurum_kopyalari']) {
      const satirlar = await withTenant(app, ctx(kurumA), (tx) =>
        tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from medya.${tablo}`)),
      );
      expect(satirlar.length, tablo).toBe(1);
      expect(satirlar[0]?.kurum_id).toBe(kurumA);
    }
    const crafted = await withTenant(app, ctx(kurumA), (tx) =>
      tx.execute(sql`select * from medya.dosyalar where kurum_id = ${kurumB} or id = ${dosyaB}`),
    );
    expect(crafted).toHaveLength(0);
  });

  it('baglam yokken hicbir kiraci satiri gorunmez (fail-closed)', async () => {
    for (const tablo of ['dosyalar', 'kucuk_resimler', 'kurum_kotalari', 'kurum_kopyalari']) {
      const r = await app.orm.execute<{ n: number }>(
        sql.raw(`select count(*)::int n from medya.${tablo}`),
      );
      expect(r[0]?.n, tablo).toBe(0);
    }
  });

  it('A baglamindan B kurumuna INSERT ve baska kurumun satirina UPDATE/DELETE etkisizdir', async () => {
    expect(
      await hataMetni(
        withTenant(app, ctx(kurumA), (tx) =>
          tx.execute(sql`insert into medya.kurum_kotalari (id, kurum_id) values (${uuidv7()}, ${kurumB})`),
        ),
      ),
    ).toMatch(/row-level security/i);
    const guncel = await withTenant(app, ctx(kurumA), (tx) =>
      tx.execute(sql`update medya.dosyalar set hata_kodu = 'bozuk_dosya' where id = ${dosyaB} returning id`),
    );
    expect(guncel).toHaveLength(0);
    const silinen = await withTenant(app, ctx(kurumA), (tx) =>
      tx.execute(sql`delete from medya.dosyalar where id = ${dosyaB} returning id`),
    );
    expect(silinen).toHaveLength(0);
    const hala = await sistem`select hata_kodu from medya.dosyalar where id = ${dosyaB}`;
    expect(hala[0]?.hata_kodu).toBeNull();
  });

  it('medya_app saklama politikasini ve outbox/processed_events gecmisini degistiremez', async () => {
    for (const ifade of [
      sql`update medya.saklama_politikalari set yetim_saat = 1`,
      sql`delete from ortak.processed_events`,
      sql`update ortak.outbox set sent_at = now()`,
      sql`delete from ortak.outbox`,
    ]) {
      expect(await hataMetni(app.orm.execute(ifade))).toMatch(/permission denied/);
    }
  });

  it('kisitlar: ayni istemci anahtari ve gecersiz durum reddedilir', async () => {
    const [satir] = await sistem<{ istemci_anahtari: string; sahip_kullanici_id: string }[]>`
      select istemci_anahtari, sahip_kullanici_id from medya.dosyalar where id = ${dosyaA}`;
    await expect(
      sistem`insert into medya.dosyalar
        (id, kurum_id, sahip_kullanici_id, sahip_uyelik_id, tur, mime_tipi, bildirilen_boyut_bayt,
         bildirilen_sha256, depolama_anahtari, istemci_anahtari, yukleme_son_at)
        values (${uuidv7()}, ${kurumA}, ${satir?.sahip_kullanici_id ?? ''}, ${uuidv7()}, 'avatar', 'image/png', 5,
                decode(${'cd'.repeat(32)}, 'hex'), ${`x/${uuidv7()}`}, ${satir?.istemci_anahtari ?? ''}, now())`,
    ).rejects.toThrow(/istemci_anahtari_uniq/);
    await expect(
      sistem`update medya.dosyalar set durum = 'hazir' where id = ${dosyaA}`,
    ).rejects.toThrow(/dosyalar_hazir_chk/);
    await expect(
      sistem`update medya.dosyalar set durum = 'silindi' where id = ${dosyaA}`,
    ).rejects.toThrow(/dosyalar_silindi_chk/);
  });
});
