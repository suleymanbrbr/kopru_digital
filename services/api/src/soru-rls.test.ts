import { medyaDosyaHazirV1 } from '@kopru/contracts';
import { createDb, kiraciBaglaminiAyarla, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { medyaKopyasiniIsle } from './sistem/medya-kopya-tuketici.js';
import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = [
  'ogrenme.soru_masalari',
  'ogrenme.soru_masasi_uyeleri',
  'ogrenme.soru_ayarlari',
  'ogrenme.soru_ogretmen_durumlari',
  'ogrenme.sorular',
  'ogrenme.soru_dosyalari',
  'ogrenme.soru_mesajlari',
  'ogrenme.soru_mesaj_ekleri',
  'ogrenme.soru_kota_sayaclari',
  'ogrenme.soru_bildirimleri',
  'ortak.medya_dosya_kopyalari',
] as const;

/** Soru sor tablolari icin kiraci izolasyonu (`api_app`, NOBYPASSRLS) ve medya kopyasi tuketicisi. */
describe.skipIf(dbYok())('soru sor tablolari: RLS izolasyonu', () => {
  const urls = testDb();
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const kullaniciA = uuidv7();
  const kullaniciB = uuidv7();
  const medyaB = uuidv7();
  let sistem: postgres.Sql;
  let app: Database;

  const ctxA = () => ({ kurumId: kurumA, kullaniciId: kullaniciA });

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    for (const id of [kullaniciA, kullaniciB]) {
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
    }
    for (const [kurum, kullanici] of [
      [kurumA, kullaniciA],
      [kurumB, kullaniciB],
    ] as const) {
      const ogretmen = uuidv7();
      const ogrenci = uuidv7();
      const ogrenciKullanici = uuidv7();
      const masa = uuidv7();
      const soru = uuidv7();
      const mesaj = uuidv7();
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurum}, 'Kurum', 'kurum', ${kullanici})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogretmen}, ${kurum}, ${kullanici}, 'ogretmen')`;
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${ogrenciKullanici}, ${rastgeleTelefon()})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${ogrenci}, ${kurum}, ${ogrenciKullanici}, 'ogrenci')`;
      await sistem`insert into ogrenme.soru_masalari (id, kurum_id, brans_kodu, ad) values (${masa}, ${kurum}, 'fizik', 'Masa')`;
      await sistem`insert into ogrenme.soru_masasi_uyeleri (id, kurum_id, masa_id, ogretmen_id) values (${uuidv7()}, ${kurum}, ${masa}, ${ogretmen})`;
      await sistem`insert into ogrenme.soru_ayarlari (id, kurum_id) values (${uuidv7()}, ${kurum})`;
      await sistem`insert into ogrenme.soru_ogretmen_durumlari (id, kurum_id, ogretmen_id) values (${uuidv7()}, ${kurum}, ${ogretmen})`;
      await sistem`insert into ogrenme.sorular (id, kurum_id, ogrenci_id, brans_kodu, yonlendirme, atanan_ogretmen_id, kota_donemi)
        values (${soru}, ${kurum}, ${ogrenci}, 'matematik', 'atanan_ogretmen', ${ogretmen}, current_date)`;
      await sistem`insert into ogrenme.soru_dosyalari (id, kurum_id, soru_id, medya_dosya_id) values (${uuidv7()}, ${kurum}, ${soru}, ${kurum === kurumB ? medyaB : uuidv7()})`;
      await sistem`insert into ogrenme.soru_mesajlari (id, kurum_id, soru_id, yazar_id, yazar_rolu, tur, metin, sira)
        values (${mesaj}, ${kurum}, ${soru}, ${ogrenci}, 'ogrenci', 'soru', 'metin', 1)`;
      await sistem`insert into ogrenme.soru_mesaj_ekleri (id, kurum_id, mesaj_id, tur, medya_dosya_id) values (${uuidv7()}, ${kurum}, ${mesaj}, 'fotograf', ${uuidv7()})`;
      await sistem`insert into ogrenme.soru_kota_sayaclari (kurum_id, ogrenci_id, donem_turu, donem, kullanilan) values (${kurum}, ${ogrenci}, 'gun', current_date, 1)`;
      await sistem`insert into ogrenme.soru_bildirimleri (id, kurum_id, soru_id, bildiren_id, neden) values (${uuidv7()}, ${kurum}, ${soru}, ${ogrenci}, 'uygunsuz')`;
      await sistem`insert into ortak.medya_dosya_kopyalari (id, kurum_id, sahip_kullanici_id, tur, durum, mime_tipi, boyut_bayt, kaynak_olay_id)
        values (${kurum === kurumB ? medyaB : uuidv7()}, ${kurum}, ${kullanici}, 'soru_fotografi', 'hazir', 'image/jpeg', 10, ${uuidv7()})`;
    }
  });

  afterAll(async () => {
    await app.close();
    await sistem.end();
  });

  it.each(TABLOLAR)(
    '%s: A baglami yalniz A satirlarini gorur, B icin sorgu bos doner',
    async (tablo) => {
      const hepsi = await withTenant(app, ctxA(), (tx) =>
        tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from ${tablo}`)),
      );
      expect(hepsi.length).toBeGreaterThan(0);
      expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
      const crafted = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql.raw(`select * from ${tablo} where kurum_id = '${kurumB}'`)),
      );
      expect(crafted).toHaveLength(0);
      // Baglam yokken (kurum secilmemis) hicbir satir gorunmez.
      const baglamsiz = await app.orm.execute(sql.raw(`select 1 from ${tablo}`));
      expect(baglamsiz).toHaveLength(0);
    },
  );

  it.each(TABLOLAR)(
    '%s: A baglami B kurumu icin satir ekleyemez, B satirini guncelleyemez/silemez',
    async (tablo) => {
      // `select * ... for update` ile B satiri RLS nedeniyle hic secilmez: guncelleme/silme 0 satir.
      const guncel = await withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql.raw(
            `update ${tablo} set kurum_id = kurum_id where kurum_id = '${kurumB}' returning 1`,
          ),
        ),
      );
      expect(guncel).toHaveLength(0);
      const silinen = await withTenant(app, ctxA(), (tx) =>
        tx.execute(sql.raw(`delete from ${tablo} where kurum_id = '${kurumB}' returning 1`)),
      );
      expect(silinen).toHaveLength(0);
    },
  );

  it('sorular: A baglami B kurumu adina soru yazamaz (RLS with check)', async () => {
    const mesaj = await hataMetni(
      withTenant(app, ctxA(), (tx) =>
        tx.execute(
          sql`insert into ogrenme.soru_ayarlari (id, kurum_id) values (${uuidv7()}, ${kurumB}::uuid)`,
        ),
      ),
    );
    expect(mesaj).toMatch(/row-level security|soru_ayarlari/i);
  });

  describe('medya kopyasi tuketici islemcisi (api_app, kiraci: olaydan)', () => {
    const olay = (kurumId: string, dosyaId: string, ek: { id?: string } = {}) =>
      medyaDosyaHazirV1.create({
        id: ek.id ?? uuidv7(),
        kurumId,
        actor: { tur: 'servis', id: 'medya' },
        correlationId: 'k',
        data: {
          dosya_id: dosyaId,
          sahip_kullanici_id: kullaniciA,
          sahip_uyelik_id: uuidv7(),
          tur: 'soru_fotografi',
          mime_tipi: 'image/png',
          boyut_bayt: 500,
          genislik: 10,
          yukseklik: 20,
          sure_sn: null,
          kucuk_resim_var: true,
        },
      });
    const isle = (o: ReturnType<typeof olay>) =>
      withTenant(app, { kurumId: o.kurumId }, (tx) => medyaKopyasiniIsle(tx, o));

    it('uygulama rolu RLS altindadir (BYPASSRLS degil)', async () => {
      const [r] = await withTenant(app, ctxA(), (tx) =>
        tx.execute<{ rolbypassrls: boolean; current_user: string }>(
          sql`select rolbypassrls, current_user from pg_roles where rolname = current_user`,
        ),
      );
      expect(r).toMatchObject({ rolbypassrls: false, current_user: 'api_app' });
    });

    it('hazir olayi kopya olusturur; ayni olay tekrar isleyince ve eski olay yeni durumu ezmez', async () => {
      const dosya = uuidv7();
      const yeni = olay(kurumA, dosya);
      await isle(yeni);
      await isle(yeni);
      const eski = olay(kurumA, dosya, { id: '00000000-0000-7000-8000-000000000001' });
      await isle(eski);
      const [k] = await sistem<
        { kaynak_olay_id: string; durum: string; mime_tipi: string; n: number }[]
      >`
        select kaynak_olay_id, durum, mime_tipi, (select count(*)::int from ortak.medya_dosya_kopyalari where id = ${dosya}) n
        from ortak.medya_dosya_kopyalari where id = ${dosya}`;
      expect(k).toMatchObject({
        kaynak_olay_id: yeni.id,
        durum: 'hazir',
        mime_tipi: 'image/png',
        n: 1,
      });
    });

    it('silindi kalicidir: sonraki hazir olayi geri acmaz; yok sayilan silindi (kopya yok) hata vermez', async () => {
      const dosya = uuidv7();
      await isle(olay(kurumA, dosya));
      await withTenant(app, { kurumId: kurumA }, (tx) =>
        medyaKopyasiniIsle(tx, {
          id: uuidv7(),
          type: 'medya.dosya.silindi',
          version: 1,
          occurredAt: new Date().toISOString(),
          kurumId: kurumA,
          actor: { tur: 'servis', id: 'medya' },
          correlationId: 'k',
          data: {
            dosya_id: dosya,
            tur: 'soru_fotografi',
            silme_nedeni: 'soru_cozuldu',
            silindi_at: new Date().toISOString(),
          },
        }),
      );
      await isle(olay(kurumA, dosya));
      const [k] = await sistem<
        { durum: string }[]
      >`select durum from ortak.medya_dosya_kopyalari where id = ${dosya}`;
      expect(k?.durum).toBe('silindi');
    });

    it('baska kurumun olayi baska kurumun kopyasina yazamaz', async () => {
      // medyaB kurum B'ye ait. Kurum A baglaminda calisan tuketici ayni dosya kimligiyle yazmayi dener.
      const hata = await hataMetni(isle(olay(kurumA, medyaB)));
      expect(hata).toMatch(/row-level security/i);
      const [b] = await sistem<{ kurum_id: string; mime_tipi: string }[]>`
        select kurum_id, mime_tipi from ortak.medya_dosya_kopyalari where id = ${medyaB}`;
      expect(b).toEqual({ kurum_id: kurumB, mime_tipi: 'image/jpeg' });
      // Olay kurum A, ama islem baglami B: satir yazilamaz (with check).
      const capraz = await hataMetni(
        withTenant(app, { kurumId: kurumB }, (tx) =>
          medyaKopyasiniIsle(tx, olay(kurumA, uuidv7())),
        ),
      );
      expect(capraz).toMatch(/row-level security/i);
      // Baglam ayarlanmamissa hicbir sey yazilamaz.
      const baglamsiz = await hataMetni(
        app.orm.transaction(async (tx) => {
          await kiraciBaglaminiAyarla(tx, { kurumId: kurumA });
          await tx.execute(sql`select set_config('app.kurum_id', '', true)`);
          await medyaKopyasiniIsle(tx, olay(kurumA, uuidv7()));
        }),
      );
      expect(baglamsiz).toMatch(/row-level security/i);
    });
  });
});
