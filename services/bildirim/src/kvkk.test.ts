import {
  hesapKullaniciDegistiV1,
  hesapKullaniciSilindiV1,
  KULLANICI_DUZEYI_KURUM_ID,
} from '@kopru/contracts';
import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { kullaniciDegisti, kullaniciSilindi, kvkkVeri } from './kvkk.js';
import { aliciKur, cihazEkle, ortamKur, type Ortam } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';

const zarf = {
  kurumId: KULLANICI_DUZEYI_KURUM_ID,
  actor: { tur: 'sistem' as const, id: 'kvkk' },
  correlationId: 'c',
};

describe.skipIf(dbYok())(
  'bildirim KVKK: kullanici kopyasi, temizlik, disa aktarma (gercek PostgreSQL)',
  () => {
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

    async function veriKur() {
      const a = await aliciKur(o);
      const b = await aliciKur(o, { kurumId: a.kurumId });
      for (const x of [a, b]) {
        await cihazEkle(o, x.kullaniciId);
        await o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
                     values (${x.kullaniciId}, ${x.kurumId}, 'ders', 'push', false)`;
        await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id) values (${x.kullaniciId}, ${x.kurumId})`;
        const bid = uuidv7();
        await o.sistem`insert into bildirim.bildirimler (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, kaynak_olay_id, tekil_anahtar)
                     values (${bid}, ${x.kurumId}, ${x.uyelikId}, 'ders', 'ders_x', 'Ders', 'Yarin ders var', ${uuidv7()}, ${uuidv7()})`;
        await o.sistem`insert into bildirim.gonderimler (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar, hedef_maske)
                     values (${uuidv7()}, ${x.kurumId}, ${bid}, ${x.kullaniciId}, 'push', 'ders_x', 'h', 'Expo***')`;
      }
      return { a, b };
    }
    const sayi = async (tablo: string, kosul: string, deger: string) => {
      const [r] = await o.sistem.unsafe(
        `select count(*)::int n from bildirim.${tablo} where ${kosul} = $1`,
        [deger],
      );
      return (r as unknown as { n: number }).n;
    };

    it('silindi: kullanicinin kutusu, cihaz, tercih, ayar, gonderim silinir; baskasininki kalir; idempotent', async () => {
      const { a, b } = await veriKur();
      const olay = hesapKullaniciSilindiV1.create({
        ...zarf,
        data: {
          kullanici_id: a.kullaniciId,
          uyelik_idleri: [a.uyelikId],
          anonimlestirildi_at: new Date().toISOString(),
        },
      });
      const ozet = await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay));
      expect(ozet).toEqual({ cihaz: 1, bildirim: 1, gonderim: 1 });
      for (const [tablo, kol] of [
        ['cihazlar', 'kullanici_id'],
        ['tercihler', 'kullanici_id'],
        ['kullanici_ayarlari', 'kullanici_id'],
        ['gonderimler', 'alici_kullanici_id'],
      ] as const) {
        expect(await sayi(tablo, kol, a.kullaniciId), tablo).toBe(0);
        expect(await sayi(tablo, kol, b.kullaniciId), `${tablo} (baska kullanici)`).toBe(1);
      }
      expect(await sayi('bildirimler', 'alici_id', a.uyelikId)).toBe(0);
      expect(await sayi('bildirimler', 'alici_id', b.uyelikId)).toBe(1);
      const [k] =
        await o.sistem`select durum from bildirim.kullanici_kopyalari where kullanici_id = ${a.kullaniciId}`;
      expect(k?.durum).toBe('silindi');
      // Tekrar: etkisiz.
      expect(await sistemDb.orm.transaction((tx) => kullaniciSilindi(tx, olay))).toEqual({
        cihaz: 0,
        bildirim: 0,
        gonderim: 0,
      });
    });

    it('degisti: kopya yazilir, eski olay ezmez, silinmis kullaniciyi geri getirmez', async () => {
      const kid = uuidv7();
      const t = (dk: number) => new Date(Date.now() + dk * 60_000);
      const yeni = hesapKullaniciDegistiV1.create({
        ...zarf,
        occurredAt: t(2),
        data: { kullanici_id: kid, dil: 'tr', durum: 'askida', degisen_alanlar: ['durum'] },
      });
      const eski = hesapKullaniciDegistiV1.create({
        ...zarf,
        occurredAt: t(1),
        data: { kullanici_id: kid, dil: 'tr', durum: 'aktif', degisen_alanlar: ['olusturuldu'] },
      });
      await sistemDb.orm.transaction((tx) => kullaniciDegisti(tx, yeni));
      await sistemDb.orm.transaction((tx) => kullaniciDegisti(tx, eski));
      const [k] =
        await o.sistem`select durum from bildirim.kullanici_kopyalari where kullanici_id = ${kid}`;
      expect(k?.durum).toBe('askida');
      await sistemDb.orm.transaction((tx) =>
        kullaniciSilindi(
          tx,
          hesapKullaniciSilindiV1.create({
            ...zarf,
            occurredAt: t(3),
            data: { kullanici_id: kid, uyelik_idleri: [], anonimlestirildi_at: t(3).toISOString() },
          }),
        ),
      );
      await sistemDb.orm.transaction((tx) =>
        kullaniciDegisti(
          tx,
          hesapKullaniciDegistiV1.create({
            ...zarf,
            occurredAt: t(4),
            data: { kullanici_id: kid, dil: 'tr', durum: 'aktif', degisen_alanlar: ['durum'] },
          }),
        ),
      );
      const [s] =
        await o.sistem`select durum from bildirim.kullanici_kopyalari where kullanici_id = ${kid}`;
      expect(s?.durum).toBe('silindi');
    });

    it('disa aktarma: yalniz kullanicinin kendi verisi (kurum baglaminda RLS)', async () => {
      const { a, b } = await veriKur();
      const v = await withTenant(o.app, { kurumId: a.kurumId, kullaniciId: a.kullaniciId }, (tx) =>
        kvkkVeri(tx, {
          kurum_id: a.kurumId,
          kullanici_id: a.kullaniciId,
          uyelik_idleri: [a.uyelikId],
        }),
      );
      expect(v.cihazlar).toHaveLength(1);
      expect(v.bildirimler).toHaveLength(1);
      expect(v.tercihler).toHaveLength(1);
      expect(JSON.stringify(v)).not.toContain('ExponentPushToken');
      const baskasi = await withTenant(
        o.app,
        { kurumId: a.kurumId, kullaniciId: a.kullaniciId },
        (tx) =>
          kvkkVeri(tx, {
            kurum_id: a.kurumId,
            kullanici_id: b.kullaniciId,
            uyelik_idleri: [b.uyelikId],
          }),
      );
      // Baska kullanicinin cihazi RLS ile gorunmez; kutu/tercih sorgusu kurum RLS'i icinde ayrica kimlikle suzulur.
      expect(baskasi.cihazlar).toHaveLength(0);
    });
  },
);
