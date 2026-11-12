import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withDatabase } from '../test/global-setup.js';
import { dbYok, testDb } from '../test/yardimcilar.js';
import { migrate } from './migrate.js';

describe.skipIf(dbYok())('migrations (sifirdan)', () => {
  const urls = testDb();
  const ad = `kopru_medya_mig_${String(process.pid)}`;
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
    expect(ilk).toEqual(['0001_temel.sql', '0002_medya.sql', '0003_saklama_olay_at.sql']);
    expect(await migrate({ url: ownerUrl })).toEqual([]);
    owner = postgres(ownerUrl, { max: 2, onnotice: () => undefined });
  });

  it('outbox ve processed_events olusur, tohum politikalari yuklenir', async () => {
    const t = await owner<{ n: number }[]>`
      select count(*)::int n from information_schema.tables
       where table_schema = 'ortak' and table_name in ('outbox', 'processed_events')`;
    expect(t[0]?.n).toBe(2);
    const p = await owner<{ n: number }[]>`select count(*)::int n from medya.saklama_politikalari`;
    expect(p[0]?.n).toBe(9);
  });

  it('degistirilmis migration reddedilir', async () => {
    await owner`update ortak.migrasyonlar set sha256 = 'x' where id = '0001_temel.sql'`;
    await expect(migrate({ url: ownerUrl })).rejects.toThrow(/değiştirilmiş/);
  });
});
