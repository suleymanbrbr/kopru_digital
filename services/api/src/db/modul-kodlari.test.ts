import { MODUL_KODLARI } from '@kopru/contracts';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { dbYok, testDb } from '../test/yardimcilar.js';

describe.skipIf(dbYok())('modul_ayarlari CHECK == @kopru/contracts MODUL_KODLARI', () => {
  const urls = testDb();
  const sql = postgres(urls?.ownerUrl ?? 'postgres://x', { max: 1, onnotice: () => undefined });
  afterAll(() => sql.end());

  it('veritabani yalnizca sozlesmedeki modul kodlarini kabul eder', async () => {
    const [satir] = await sql<{ tanim: string }[]>`
      select pg_get_constraintdef(oid) as tanim from pg_constraint
      where conname = 'modul_ayarlari_modul_kodu_chk'`;
    expect(satir, 'modul_ayarlari_modul_kodu_chk bulunamadi').toBeDefined();
    const kodlar = [...(satir?.tanim ?? '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(kodlar.sort()).toEqual([...MODUL_KODLARI].sort());
  });
});
