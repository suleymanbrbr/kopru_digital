import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withDatabase } from '../test/global-setup.js';
import { dbYok, testDb } from '../test/yardimcilar.js';
import { migrate } from './migrate.js';

describe.skipIf(dbYok())('migrations (sifirdan)', () => {
  const urls = testDb();
  const ad = `kopru_motivasyon_mig_${String(process.pid)}`;
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
    expect(ilk).toEqual([
      '0001_temel.sql',
      '0002_yapilandirma.sql',
      '0003_ogrenci_xp.sql',
      '0004_seri_rozet_karakter_odak.sql',
      '0006_odak_karakter.sql',
    ]);
    expect(await migrate({ url: ownerUrl })).toEqual([]);
    owner = postgres(ownerUrl, { max: 2, onnotice: () => undefined });
  });

  it('outbox ve processed_events olusur, tohumlar yuklenir', async () => {
    const t = await owner<{ n: number }[]>`
      select count(*)::int n from information_schema.tables
       where table_schema = 'ortak' and table_name in ('outbox', 'processed_events')`;
    expect(t[0]?.n).toBe(2);
    const sayi = async (tablo: string) =>
      (await owner<{ n: number }[]>`select count(*)::int n from ${owner(`motivasyon.${tablo}`)}`)[0]
        ?.n;
    expect(await sayi('xp_tavanlari')).toBe(5);
    expect(await sayi('xp_kurallari')).toBe(12);
    expect(await sayi('seviyeler')).toBe(60);
    expect(await sayi('rozet_tanimlari')).toBe(33);
    expect(await sayi('karakter_turleri')).toBe(3);
    expect(await sayi('karakter_asamalari')).toBe(15);
    expect(await sayi('beceri_tanimlari')).toBe(5);
    expect(await sayi('brans_beceri_eslemesi')).toBe(16);
    expect(await sayi('kozmetik_tanimlari')).toBe(12);
    expect(await sayi('motivasyon_ayarlari')).toBe(12);
  });

  it('degistirilmis migration reddedilir', async () => {
    await owner`update ortak.migrasyonlar set sha256 = 'x' where id = '0001_temel.sql'`;
    await expect(migrate({ url: ownerUrl })).rejects.toThrow(/değiştirilmiş/);
  });
});
