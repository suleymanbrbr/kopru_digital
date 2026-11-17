import { createDb, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BILDIRIM_SAKLAMA_GUN, CIHAZ_PASIF_GUN, GONDERIM_SAKLAMA_GUN, bakimIsi } from './bakim.js';
import { T0, ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';

const gunOnce = (gun: number) => new Date(T0.getTime() - gun * 86_400_000);

describe.skipIf(dbYok())('bakim isleri (bildirim_sistem)', () => {
  let o: Ortam;
  let sistemDb: Database;
  beforeAll(() => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) throw new Error('testDb yok');
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await o.kapat();
  });

  it('saklama sinirlari: 60 gun cihaz, 90 gun bildirim, 180 gun gonderim', () => {
    expect([CIHAZ_PASIF_GUN, BILDIRIM_SAKLAMA_GUN, GONDERIM_SAKLAMA_GUN]).toEqual([60, 90, 180]);
  });

  it('60 gundur gorulmeyen cihaz pasif olur, yakin zamanlilar etkin kalir; ikinci calistirma bir sey yapmaz', async () => {
    const kullanici = uuidv7();
    const ekle = async (gun: number) => {
      const id = uuidv7();
      await o.sistem`insert into bildirim.cihazlar (id, kullanici_id, platform, push_belirteci, cihaz_kimligi, son_gorulme_at)
                     values (${id}, ${kullanici}, 'ios', ${`t-${id}`}, ${id}, ${gunOnce(gun)})`;
      return id;
    };
    const eski = await ekle(61);
    const sinirda = await ekle(59);
    const yeni = await ekle(1);
    const ilk = await bakimIsi({ db: sistemDb, simdi: () => T0 });
    expect(ilk.pasiflenenCihaz).toBeGreaterThanOrEqual(1);
    const durum = async (id: string) =>
      (
        await o.sistem<{ aktif: boolean }[]>`select aktif from bildirim.cihazlar where id = ${id}`
      )[0]?.aktif;
    expect(await durum(eski)).toBe(false);
    expect(await durum(sinirda)).toBe(true);
    expect(await durum(yeni)).toBe(true);
    expect((await bakimIsi({ db: sistemDb, simdi: () => T0 })).pasiflenenCihaz).toBe(0);
  });

  it('90 gunden eski bildirim silinir (gonderim satiri kalir), 180 gunden eski gonderim silinir', async () => {
    const kurum = uuidv7();
    const kullanici = uuidv7();
    const bildirim = async (gun: number) => {
      const id = uuidv7();
      await o.sistem`insert into bildirim.bildirimler (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, kaynak_olay_id, tekil_anahtar, created_at)
                     values (${id}, ${kurum}, ${uuidv7()}, 'soru', 'x', 'B', 'G', ${uuidv7()}, ${id}, ${gunOnce(gun)})`;
      return id;
    };
    const gonderim = async (bildirimId: string | null, gun: number) => {
      const id = uuidv7();
      await o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar, durum, created_at)
                     values (${id}, ${kurum}, ${bildirimId}, ${kullanici}, 'push', 'x', ${id}, 'gonderildi', ${gunOnce(gun)})`;
      return id;
    };
    const eskiB = await bildirim(91);
    const yeniB = await bildirim(10);
    const eskiBninGonderimi = await gonderim(eskiB, 91); // 180 gunden yeni: kalmali
    const cokEskiGonderim = await gonderim(null, 181);
    const yeniGonderim = await gonderim(yeniB, 10);
    const ozet = await bakimIsi({ db: sistemDb, simdi: () => T0 });
    expect(ozet.silinenBildirim).toBeGreaterThanOrEqual(1);
    expect(ozet.silinenGonderim).toBeGreaterThanOrEqual(1);
    const var_ = async (tablo: 'bildirimler' | 'gonderimler', id: string) =>
      (
        await o.sistem<{ n: number }[]>`
          select count(*)::int n from ${o.sistem(`bildirim.${tablo}`)} where id = ${id}`
      )[0]?.n;
    expect(await var_('bildirimler', eskiB)).toBe(0);
    expect(await var_('bildirimler', yeniB)).toBe(1);
    expect(await var_('gonderimler', eskiBninGonderimi)).toBe(1);
    const [g] = await o.sistem<{ bildirim_id: string | null }[]>`
      select bildirim_id from bildirim.gonderimler where id = ${eskiBninGonderimi}`;
    expect(g?.bildirim_id).toBeNull();
    expect(await var_('gonderimler', cokEskiGonderim)).toBe(0);
    expect(await var_('gonderimler', yeniGonderim)).toBe(1);
  });
});
