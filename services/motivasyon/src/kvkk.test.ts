import { KULLANICI_DUZEYI_KURUM_ID, hesapKullaniciSilindiV1 } from '@kopru/contracts';
import { createDb, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ANONIM_KARAKTER_ADI, kullaniciSilindi, kvkkVeri } from './kvkk.js';
import { ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';

describe.skipIf(dbYok())('motivasyon KVKK: silme temizligi ve disa aktarma (gercek PostgreSQL)', () => {
  let o: Ortam;
  let sistemDb: Database;
  beforeAll(() => {
    o = ortamKur();
    sistemDb = createDb({ url: testDb()?.sistemUrl ?? '', max: 2 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await o.kapat();
  });

  async function ogrenciKur(kurumId: string, ad: string) {
    const ogrenciId = uuidv7();
    const [kural] = await o.sistem`select kod from motivasyon.xp_kurallari limit 1`;
    const [tur] = await o.sistem`select kod from motivasyon.karakter_turleri limit 1`;
    await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, toplam_xp) values (${uuidv7()}, ${kurumId}, ${ogrenciId}, 50)`;
    await o.sistem`insert into motivasyon.xp_hareketleri (id, kurum_id, ogrenci_id, kural_kodu, kaynak_olay_id, xp, gun, olusma_at)
                   values (${uuidv7()}, ${kurumId}, ${ogrenciId}, ${kural?.kod as string}, ${uuidv7()}, 50, current_date, now())`;
    await o.sistem`insert into motivasyon.ogrenci_karakterleri (id, kurum_id, ogrenci_id, tur_kodu, ad)
                   values (${uuidv7()}, ${kurumId}, ${ogrenciId}, ${tur?.kod as string}, ${ad})`;
    await o.sistem`insert into motivasyon.odak_oturumlari (id, kurum_id, ogrenci_id, istemci_id, baslangic_at, planlanan_dk, cihaz, durum, bitis_at, gerceklesen_sn)
                   values (${uuidv7()}, ${kurumId}, ${ogrenciId}, ${uuidv7()}, now(), 25, 'Ayse''nin telefonu', 'tamam', now(), 1500)`;
    return ogrenciId;
  }

  it('silindi: karakter adi anonimlesir, cihaz silinir, XP defteri anonim kalir; baska ogrenciye dokunmaz; idempotent', async () => {
    const kurumId = uuidv7();
    const a = await ogrenciKur(kurumId, 'Ayse');
    const b = await ogrenciKur(kurumId, 'Mehmet');
    const olay = hesapKullaniciSilindiV1.create({
      kurumId: KULLANICI_DUZEYI_KURUM_ID,
      actor: { tur: 'sistem', id: 'kvkk' },
      correlationId: 'c',
      data: { kullanici_id: uuidv7(), uyelik_idleri: [a], anonimlestirildi_at: new Date().toISOString() },
    });
    expect(await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay))).toMatchObject({ karakter: 1, odak: 1 });
    const kar = async (id: string) => (await o.sistem`select ad from motivasyon.ogrenci_karakterleri where ogrenci_id = ${id}`)[0]?.ad;
    expect(await kar(a)).toBe(ANONIM_KARAKTER_ADI);
    expect(await kar(b)).toBe('Mehmet');
    const cihaz = async (id: string) => (await o.sistem`select cihaz from motivasyon.odak_oturumlari where ogrenci_id = ${id}`)[0]?.cihaz;
    expect(await cihaz(a)).toBeNull();
    expect(await cihaz(b)).not.toBeNull();
    const [xp] = await o.sistem`select count(*)::int n from motivasyon.xp_hareketleri where ogrenci_id = ${a}`;
    expect(xp?.n).toBe(1);
    expect(await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay))).toMatchObject({ karakter: 0, odak: 0 });
  });

  it('disa aktarma: yalniz verilen uyelikler ve kurum', async () => {
    const kurumId = uuidv7();
    const a = await ogrenciKur(kurumId, 'Ayse');
    const b = await ogrenciKur(kurumId, 'Mehmet');
    const v = await o.isle(kurumId, (tx) => kvkkVeri(tx, { kurum_id: kurumId, uyelik_idleri: [a] }));
    expect(v.xp_ozeti).toHaveLength(1);
    expect(v.xp_hareketleri).toHaveLength(1);
    expect(v.karakter).toEqual([expect.objectContaining({ ad: 'Ayse' })]);
    expect(JSON.stringify(v)).not.toContain('Mehmet');
    expect(JSON.stringify(v)).not.toContain(b);
    // Baska kurum baglaminda bos.
    const baska = await o.isle(uuidv7(), (tx) => kvkkVeri(tx, { kurum_id: kurumId, uyelik_idleri: [a] }));
    expect(baska.xp_ozeti).toHaveLength(0);
  });
});
