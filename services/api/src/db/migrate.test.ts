import { IZIN_KODLARI, ROLLER, ROL_IZINLERI } from '@kopru/contracts';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withDatabase } from '../test/global-setup.js';
import { dbYok, testDb } from '../test/yardimcilar.js';
import { migrate } from './migrate.js';

describe.skipIf(dbYok())('migrations (sifirdan)', () => {
  const urls = testDb();
  const ad = `kopru_api_mig_${String(process.pid)}`;
  let owner: postgres.Sql;
  let ownerUrl = '';

  beforeAll(async () => {
    if (!urls) return;
    const admin = postgres(urls.adminUrl, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`drop database if exists ${ad} with (force)`);
    await admin.unsafe(`create database ${ad}`);
    await admin.end();
    ownerUrl = withDatabase(urls.adminUrl, ad);
  });

  afterAll(async () => {
    await owner.end();
    if (!urls) return;
    const admin = postgres(urls.adminUrl, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`drop database if exists ${ad} with (force)`);
    await admin.end();
  });

  it('bos veritabaninda uygulanir, ikinci calistirma bir sey yapmaz', async () => {
    const ilk = await migrate({ url: ownerUrl });
    expect(ilk.length).toBeGreaterThanOrEqual(3);
    expect(await migrate({ url: ownerUrl })).toEqual([]);
    owner = postgres(ownerUrl, { max: 2, onnotice: () => undefined });
  });

  it('roller: api_app BYPASSRLS degil, api_sistem BYPASSRLS, hicbiri superuser degil', async () => {
    const roller = await owner<
      { rolname: string; rolbypassrls: boolean; rolsuper: boolean; rolcanlogin: boolean }[]
    >`
      select rolname, rolbypassrls, rolsuper, rolcanlogin from pg_roles
      where rolname in ('api_owner', 'api_app', 'api_sistem') order by rolname`;
    expect(roller).toEqual([
      { rolname: 'api_app', rolbypassrls: false, rolsuper: false, rolcanlogin: true },
      { rolname: 'api_owner', rolbypassrls: false, rolsuper: false, rolcanlogin: false },
      { rolname: 'api_sistem', rolbypassrls: true, rolsuper: false, rolcanlogin: true },
    ]);
  });

  it('kurum_id sutunu olan her tabloda RLS ENABLE + FORCE (outbox haric)', async () => {
    const eksik = await owner<{ tablo: string }[]>`
      select n.nspname || '.' || c.relname as tablo
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
      join pg_namespace n on n.oid = c.relnamespace
      where a.attname = 'kurum_id' and not a.attisdropped
        and n.nspname in ('hesap', 'ortak')
        and not (c.relrowsecurity and c.relforcerowsecurity)
        and (n.nspname || '.' || c.relname) <> 'ortak.outbox'`;
    expect(eksik).toEqual([]);
    const kurumlar = await owner<{ f: boolean }[]>`
      select relforcerowsecurity f from pg_class where oid = 'hesap.kurumlar'::regclass`;
    expect(kurumlar[0]?.f).toBe(true);
  });

  it('tablolar api_owner sahipligindedir, api_app tablo sahibi degildir', async () => {
    const sahipler = await owner<{ sahip: string }[]>`
      select distinct pg_get_userbyid(c.relowner) sahip from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('hesap', 'ortak') and c.relkind = 'r'`;
    expect(sahipler).toEqual([{ sahip: 'api_owner' }]);
  });

  it('uzantilar kurulu', async () => {
    const ext = await owner<{ extname: string }[]>`
      select extname from pg_extension where extname in ('pgcrypto','citext','btree_gist','pg_trgm') order by 1`;
    expect(ext.map((e) => e.extname)).toEqual(['btree_gist', 'citext', 'pg_trgm', 'pgcrypto']);
  });

  it('outbox ve processed_events olusur', async () => {
    const t = await owner<{ n: number }[]>`
      select count(*)::int n from information_schema.tables
      where table_schema = 'ortak' and table_name in ('outbox', 'processed_events')`;
    expect(t[0]?.n).toBe(2);
  });

  it('rol/izin tablolari contracts sabitiyle birebir ayni', async () => {
    const roller = await owner<{ kod: string }[]>`select kod from hesap.roller order by kod`;
    expect(roller.map((r) => r.kod)).toEqual([...ROLLER].sort());
    const izinler = await owner<{ kod: string }[]>`select kod from hesap.izinler order by kod`;
    expect(izinler.map((r) => r.kod)).toEqual([...IZIN_KODLARI].sort());
    const eslemeler = await owner<{ rol_kodu: string; izin_kodu: string; kapsam: string }[]>`
      select rol_kodu, izin_kodu, kapsam from hesap.rol_izinleri`;
    const beklenen = ROLLER.flatMap((rol) =>
      Object.entries(ROL_IZINLERI[rol]).map(([izin, kapsam]) => `${rol}|${izin}|${kapsam}`),
    ).sort();
    expect(eslemeler.map((e) => `${e.rol_kodu}|${e.izin_kodu}|${e.kapsam}`).sort()).toEqual(
      beklenen,
    );
  });

  it('tohum: yer tutucu KVKK metni yayinlanmis ve degistirilemez', async () => {
    const [metin] = await owner<{ id: string; baslik: string }[]>`
      select id, baslik from hesap.riza_metinleri where tur = 'kvkk_aydinlatma'`;
    expect(metin?.baslik).toContain('YER TUTUCU');
    await expect(
      owner`update hesap.riza_metinleri set govde_markdown = 'x' where id = ${metin?.id ?? ''}`,
    ).rejects.toThrow(/yayinlanmis_riza_metni_degistirilemez/);
  });

  it('degistirilmis migration reddedilir', async () => {
    await owner`update ortak.migrasyonlar set sha256 = 'x' where id = '0001_temel.sql'`;
    await expect(migrate({ url: ownerUrl })).rejects.toThrow(/değiştirilmiş/);
  });
});
