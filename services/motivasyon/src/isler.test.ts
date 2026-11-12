import { createDb, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gunlukTemizlik, haftalikSifirla } from './isler.js';
import { ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';

describe.skipIf(dbYok())('zamanlanmis isler (motivasyon_sistem)', () => {
  let o: Ortam;
  let sistemDb: Database;
  beforeAll(() => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) return;
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await o.kapat();
  });

  const guncelHafta = async (tz: string) =>
    (
      await o.sistem<{ hafta: string }[]>`
        select (date_trunc('week', ((now() at time zone ${tz}) - interval '4 hours'))::date)::text as hafta`
    )[0]?.hafta ?? '';

  it('haftalik sifirlama: eski haftanin bu_hafta_xp degeri sifirlanir, guncel hafta korunur; idempotent', async () => {
    const kurum = uuidv7();
    const eski = uuidv7();
    const guncel = uuidv7();
    const hafta = await guncelHafta('Europe/Istanbul');
    await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, bu_hafta_xp, hafta_baslangic)
                   values (${uuidv7()}, ${kurum}, ${eski}, 70, ${hafta}::date - 7),
                          (${uuidv7()}, ${kurum}, ${guncel}, 30, ${hafta}::date)`;
    const oku = async (ogr: string) =>
      (
        await o.sistem<{ bu_hafta_xp: number; hafta: string }[]>`
          select bu_hafta_xp, hafta_baslangic::text as hafta from motivasyon.ogrenci_durumlari where ogrenci_id = ${ogr}`
      )[0];
    expect(await haftalikSifirla({ db: sistemDb })).toBeGreaterThanOrEqual(1);
    expect(await oku(eski)).toEqual({ bu_hafta_xp: 0, hafta });
    expect(await oku(guncel)).toEqual({ bu_hafta_xp: 30, hafta });
    await haftalikSifirla({ db: sistemDb });
    expect(await oku(eski)).toEqual({ bu_hafta_xp: 0, hafta });
    expect(await oku(guncel)).toEqual({ bu_hafta_xp: 30, hafta });
  });

  it('haftalik sifirlama kurumun saat dilimini kullanir', async () => {
    const kurum = uuidv7();
    const ogr = uuidv7();
    await o.sistem`insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
                   values (${kurum}, 'kurum', 'aktif', 'Pacific/Kiritimati', now(), ${uuidv7()})`;
    const hafta = await guncelHafta('Pacific/Kiritimati');
    await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, bu_hafta_xp, hafta_baslangic)
                   values (${uuidv7()}, ${kurum}, ${ogr}, 40, ${hafta}::date - 7)`;
    await haftalikSifirla({ db: sistemDb });
    const [d] = await o.sistem<{ bu_hafta_xp: number; hafta: string }[]>`
      select bu_hafta_xp, hafta_baslangic::text as hafta from motivasyon.ogrenci_durumlari where ogrenci_id = ${ogr}`;
    expect(d).toEqual({ bu_hafta_xp: 0, hafta });
  });

  it('gunluk temizlik: 30 gunden eski processed_events silinir', async () => {
    const eski = uuidv7();
    const yeni = uuidv7();
    await o.sistem`insert into ortak.processed_events (tuketici, olay_id, islenme_zamani)
                   values ('motivasyon.xp', ${eski}, now() - interval '31 days'),
                          ('motivasyon.xp', ${yeni}, now())`;
    expect(await gunlukTemizlik({ db: sistemDb })).toBeGreaterThanOrEqual(1);
    const kalan = await o.sistem<{ olay_id: string }[]>`
      select olay_id from ortak.processed_events where olay_id in (${eski}, ${yeni})`;
    expect(kalan.map((k) => k.olay_id)).toEqual([yeni]);
  });
});
