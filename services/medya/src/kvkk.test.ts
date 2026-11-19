import { KULLANICI_DUZEYI_KURUM_ID, hesapKullaniciSilindiV1 } from '@kopru/contracts';
import { createDb, withTenant, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kullaniciSilindi, kvkkVeri } from './kvkk.js';
import { dbYok, testDb } from './test/yardimcilar.js';

describe.skipIf(dbYok())(
  'medya KVKK: kullanici dosyalari silinmeye planlanir (gercek PostgreSQL)',
  () => {
    const urls = testDb();
    let sistem: postgres.Sql;
    let sistemDb: Database;
    let appDb: Database;
    beforeAll(() => {
      if (!urls) return;
      sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
      sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
      appDb = createDb({ url: urls.appUrl, max: 2 });
    });
    afterAll(async () => {
      await sistem.end();
      await sistemDb.close();
      await appDb.close();
    });

    async function dosya(kurumId: string, kullaniciId: string, tur: string) {
      const id = uuidv7();
      await sistem`
      insert into medya.dosyalar
        (id, kurum_id, sahip_kullanici_id, sahip_uyelik_id, tur, mime_tipi, bildirilen_boyut_bayt,
         bildirilen_sha256, depolama_anahtari, istemci_anahtari, yukleme_son_at, durum,
         boyut_bayt, sha256, hazir_at)
      values (${id}, ${kurumId}, ${kullaniciId}, ${uuidv7()}, ${tur}, 'image/jpeg', 10,
              decode(${'ab'.repeat(32)}, 'hex'), ${`${kurumId}/${tur}/${id}`}, ${uuidv7()}, now(), 'hazir',
              10, decode(${'ab'.repeat(32)}, 'hex'), now())`;
      return id;
    }
    const plan = async (id: string) =>
      (
        await sistem`select silme_nedeni, silinecek_at <= now() as simdi from medya.dosyalar where id = ${id}`
      )[0];

    it('kullanicinin dosyalari (iki kurumda) silinmeye planlanir; kurum varliklari ve baskasinin dosyasi kalir', async () => {
      const kullanici = uuidv7();
      const baska = uuidv7();
      const k1 = uuidv7();
      const k2 = uuidv7();
      const foto = await dosya(k1, kullanici, 'soru_fotografi');
      const avatar = await dosya(k2, kullanici, 'avatar');
      const odevEki = await dosya(k1, kullanici, 'odev_eki');
      const logo = await dosya(k1, kullanici, 'kurum_logosu');
      const fatura = await dosya(k1, kullanici, 'fatura_pdf');
      const baskaFoto = await dosya(k1, baska, 'soru_fotografi');
      const olay = hesapKullaniciSilindiV1.create({
        kurumId: KULLANICI_DUZEYI_KURUM_ID,
        actor: { tur: 'sistem', id: 'kvkk' },
        correlationId: 'c',
        data: {
          kullanici_id: kullanici,
          uyelik_idleri: [],
          anonimlestirildi_at: new Date().toISOString(),
        },
      });
      expect(await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay))).toBe(2);
      for (const id of [foto, avatar])
        expect(await plan(id)).toMatchObject({ silme_nedeni: 'kullanici_silindi', simdi: true });
      for (const id of [odevEki, logo, fatura, baskaFoto])
        expect((await plan(id))?.silme_nedeni).not.toBe('kullanici_silindi');
      // Idempotent
      expect(await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay))).toBe(0);
    });

    it('disa aktarma: yalniz bu kullanicinin bu kurumdaki dosya kayitlari; depolama anahtari yok', async () => {
      const kullanici = uuidv7();
      const kurum = uuidv7();
      const id = await dosya(kurum, kullanici, 'soru_fotografi');
      await dosya(kurum, uuidv7(), 'soru_fotografi');
      await dosya(uuidv7(), kullanici, 'avatar');
      const v = await withTenant(appDb, { kurumId: kurum, kullaniciId: kullanici }, (tx) =>
        kvkkVeri(tx, { kurum_id: kurum, kullanici_id: kullanici }),
      );
      expect(v.dosyalar).toHaveLength(1);
      expect(v.dosyalar?.[0]?.id).toBe(id);
      expect(JSON.stringify(v)).not.toContain('depolama_anahtari');
      expect(JSON.stringify(v)).not.toContain(`${kurum}/soru_fotografi`);
    });
  },
);
