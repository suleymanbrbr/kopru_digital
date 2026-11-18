import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withDatabase } from '../test/global-setup.js';
import { dbYok, testDb } from '../test/yardimcilar.js';
import { migrate } from './migrate.js';

describe.skipIf(dbYok())('migrations (sifirdan)', () => {
  const urls = testDb();
  const ad = `kopru_bildirim_mig_${String(process.pid)}`;
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
    expect(ilk).toEqual(['0001_temel.sql', '0002_bildirim.sql', '0003_ders_planlari.sql']);
    expect(await migrate({ url: ownerUrl })).toEqual([]);
    owner = postgres(ownerUrl, { max: 2, onnotice: () => undefined });
  });

  it('outbox, processed_events ve sema tablolari olusur', async () => {
    const t = await owner<{ n: number }[]>`
      select count(*)::int n from information_schema.tables
       where table_schema = 'ortak' and table_name in ('outbox', 'processed_events')`;
    expect(t[0]?.n).toBe(2);
    const tablolar = await owner<{ tablo: string }[]>`
      select table_name as tablo from information_schema.tables
       where table_schema = 'bildirim' and table_type = 'BASE TABLE' order by 1`;
    expect(tablolar.map((r) => r.tablo)).toEqual(
      [
        'atama_kopyalari',
        'bildirimler',
        'cihazlar',
        'ders_planlari',
        'duyuru_alicilari',
        'duyurular',
        'gonderimler',
        'grup_kopyalari',
        'grup_uyesi_kopyalari',
        'kademe_kopyalari',
        'kullanici_ayarlari',
        'kullanici_kopyalari',
        'kurum_kopyalari',
        'modul_ayari_kopyalari',
        'sablonlar',
        'sms_kullanimlari',
        'tercihler',
        'uyelik_kopyalari',
        'zamanlanmis_bildirimler',
      ].sort(),
    );
  });

  it('degistirilmis migration reddedilir', async () => {
    await owner`update ortak.migrasyonlar set sha256 = 'x' where id = '0001_temel.sql'`;
    await expect(migrate({ url: ownerUrl })).rejects.toThrow(/değiştirilmiş/);
  });
});
