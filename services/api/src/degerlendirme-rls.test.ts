import { createDb, withTenant, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbYok, hataMetni, rastgeleTelefon, testDb } from './test/yardimcilar.js';

const TABLOLAR = ['ogretmen_degerlendirmeleri', 'kaynak_onerileri'] as const;

/**
 * Ogretmen degerlendirmesi ve kaynak onerisi tablolari: kiraci izolasyonu (`api_app`, NOBYPASSRLS), RESTRICTIVE
 * ogrenci politikasi (ogrenci rolu gizli/geri cekilen satiri ASLA okuyamaz), silmenin kapali olmasi ve kisitlar.
 */
describe.skipIf(dbYok())(
  'ogrenme degerlendirme tablolari: RLS, ogrenci politikasi ve kisitlar',
  () => {
    const urls = testDb();
    const kurumA = uuidv7();
    const kurumB = uuidv7();
    const kullaniciA = uuidv7(); // sahip A
    const kullaniciB = uuidv7();
    const ogretmenA = uuidv7();
    const ogretmenKullaniciA = uuidv7();
    const ogrenciA = uuidv7();
    const ogrenciKullaniciA = uuidv7();
    const ogrenci2A = uuidv7();
    const ogrenci2KullaniciA = uuidv7();
    const ogrenciB = uuidv7();
    const ogretmenB = uuidv7();
    const gorunurA = uuidv7();
    const gizliA = uuidv7();
    const geriCekilenA = uuidv7();
    const digerOgrenciA = uuidv7();
    const degerB = uuidv7();
    const oneriA = uuidv7();
    const geriOneriA = uuidv7();
    const digerOneriA = uuidv7();
    const oneriB = uuidv7();
    let sistem: postgres.Sql;
    let app: Database;

    const ctxA = (roller: string[] = [], kullaniciId = kullaniciA) => ({
      kurumId: kurumA,
      kullaniciId,
      roller,
    });

    async function degerEkle(
      id: string,
      kurum: string,
      ogrenci: string,
      yazar: string,
      ek: {
        gorur?: boolean;
        geriCekildi?: boolean;
        yorum?: string | null;
        olcek?: number | null;
      } = {},
    ) {
      await sistem`
      insert into ogrenme.ogretmen_degerlendirmeleri
        (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, calisma_duzeni, yorum, ogrenci_gorur,
         geri_cekildi_at, geri_cekilen_id)
      values (${id}, ${kurum}, ${ogrenci}, ${yazar}, '2030-01-07', '2030-01-13', ${ek.olcek === undefined ? 3 : ek.olcek},
              ${ek.yorum === undefined ? 'yorum' : ek.yorum}, ${ek.gorur ?? false},
              ${ek.geriCekildi ? sistem`now()` : null}, ${ek.geriCekildi ? yazar : null})`;
    }
    async function oneriEkle(
      id: string,
      kurum: string,
      ogrenci: string,
      oneren: string,
      ek: { geriCekildi?: boolean } = {},
    ) {
      await sistem`
      insert into ogrenme.kaynak_onerileri
        (id, kurum_id, ogrenci_id, oneren_id, tur, baslik, geri_cekildi_at, geri_cekilen_id)
      values (${id}, ${kurum}, ${ogrenci}, ${oneren}, 'serbest', 'Kaynak',
              ${ek.geriCekildi ? sistem`now()` : null}, ${ek.geriCekildi ? oneren : null})`;
    }

    beforeAll(async () => {
      if (!urls) return;
      sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
      app = createDb({ url: urls.appUrl, max: 4 });
      for (const id of [
        kullaniciA,
        kullaniciB,
        ogretmenKullaniciA,
        ogrenciKullaniciA,
        ogrenci2KullaniciA,
      ]) {
        await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
      }
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurumA}, 'A', 'kurum', ${kullaniciA})`;
      await sistem`insert into hesap.kurumlar (id, ad, tur, olusturan_kullanici_id) values (${kurumB}, 'B', 'kurum', ${kullaniciB})`;
      const uye = (id: string, kurum: string, kullanici: string, rol: string) =>
        sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol) values (${id}, ${kurum}, ${kullanici}, ${rol})`;
      await uye(ogretmenA, kurumA, ogretmenKullaniciA, 'ogretmen');
      await uye(ogrenciA, kurumA, ogrenciKullaniciA, 'ogrenci');
      await uye(ogrenci2A, kurumA, ogrenci2KullaniciA, 'ogrenci');
      const ogrenciKullaniciB = uuidv7();
      const ogretmenKullaniciB = uuidv7();
      for (const id of [ogrenciKullaniciB, ogretmenKullaniciB]) {
        await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${id}, ${rastgeleTelefon()})`;
      }
      await uye(ogrenciB, kurumB, ogrenciKullaniciB, 'ogrenci');
      await uye(ogretmenB, kurumB, ogretmenKullaniciB, 'ogretmen');

      await degerEkle(gorunurA, kurumA, ogrenciA, ogretmenA, { gorur: true, yorum: 'GORUNUR' });
      await degerEkle(gizliA, kurumA, ogrenciA, ogretmenA, { gorur: false, yorum: 'GIZLI' });
      await degerEkle(geriCekilenA, kurumA, ogrenciA, ogretmenA, {
        gorur: true,
        geriCekildi: true,
        yorum: 'GERICEKILEN',
      });
      await degerEkle(digerOgrenciA, kurumA, ogrenci2A, ogretmenA, { gorur: true, yorum: 'DIGER' });
      await degerEkle(degerB, kurumB, ogrenciB, ogretmenB, { gorur: true, yorum: 'KURUMB' });
      await oneriEkle(oneriA, kurumA, ogrenciA, ogretmenA);
      await oneriEkle(geriOneriA, kurumA, ogrenciA, ogretmenA, { geriCekildi: true });
      await oneriEkle(digerOneriA, kurumA, ogrenci2A, ogretmenA);
      await oneriEkle(oneriB, kurumB, ogrenciB, ogretmenB);
    });

    afterAll(async () => {
      await app.close();
      await sistem.end();
    });

    it.each(TABLOLAR)(
      '%s: A baglami yalniz A satirlarini gorur; B icin hazirlanmis sorgu bos doner',
      async (tablo) => {
        const hepsi = await withTenant(app, ctxA(['ogretmen']), (tx) =>
          tx.execute<{ kurum_id: string }>(sql.raw(`select kurum_id from ogrenme.${tablo}`)),
        );
        expect(hepsi.length).toBeGreaterThan(0);
        expect(new Set(hepsi.map((r) => r.kurum_id))).toEqual(new Set([kurumA]));
        const crafted = await withTenant(app, ctxA(['ogretmen']), (tx) =>
          tx.execute(sql.raw(`select * from ogrenme.${tablo} where kurum_id = '${kurumB}'`)),
        );
        expect(crafted).toHaveLength(0);
      },
    );

    it.each(TABLOLAR)('%s: baglam yokken hicbir satir gorunmez (fail-closed)', async (tablo) => {
      const rows = await app.orm.execute<{ n: number }>(
        sql.raw(`select count(*)::int n from ogrenme.${tablo}`),
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('A baglamindan B kurumuna INSERT reddedilir (WITH CHECK), UPDATE B satirina etkisiz', async () => {
      const ekle = await hataMetni(
        withTenant(app, ctxA(['ogretmen']), (tx) =>
          tx.execute(sql`
          insert into ogrenme.ogretmen_degerlendirmeleri (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, yorum)
          values (${uuidv7()}, ${kurumB}, ${ogrenciB}, ${ogretmenB}, '2030-01-07', '2030-01-07', 'x')`),
        ),
      );
      expect(ekle).toMatch(/row-level security/);
      const guncel = await withTenant(app, ctxA(['ogretmen']), (tx) =>
        tx.execute(
          sql`update ogrenme.ogretmen_degerlendirmeleri set yorum = 'ele gecirildi' where id = ${degerB} returning id`,
        ),
      );
      expect(guncel).toHaveLength(0);
      const [b] = await sistem<
        { yorum: string }[]
      >`select yorum from ogrenme.ogretmen_degerlendirmeleri where id = ${degerB}`;
      expect(b?.yorum).toBe('KURUMB');
    });

    it('api_app, B kurumunun ogrencisine ya da kitabina A kurumu adina baglanamaz (bilesik FK)', async () => {
      const deger = await hataMetni(
        withTenant(app, ctxA(['ogretmen']), (tx) =>
          tx.execute(sql`
          insert into ogrenme.ogretmen_degerlendirmeleri (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, yorum)
          values (${uuidv7()}, ${kurumA}, ${ogrenciB}, ${ogretmenA}, '2030-01-07', '2030-01-07', 'x')`),
        ),
      );
      expect(deger).toMatch(/foreign key|violates/);
      const oneri = await hataMetni(
        withTenant(app, ctxA(['ogretmen']), (tx) =>
          tx.execute(sql`
          insert into ogrenme.kaynak_onerileri (id, kurum_id, ogrenci_id, oneren_id, tur, baslik)
          values (${uuidv7()}, ${kurumA}, ${ogrenciB}, ${ogretmenA}, 'serbest', 'x')`),
        ),
      );
      expect(oneri).toMatch(/foreign key|violates/);
    });

    describe('RESTRICTIVE ogrenci politikasi (oturumda `ogrenci` rolu)', () => {
      const ogrenciCtx = () => ctxA(['ogrenci'], ogrenciKullaniciA);

      it('ogrenci rolu YALNIZ kendine gorunur ve geri cekilmemis degerlendirmeyi okur (WHERE yazmasa bile)', async () => {
        const hepsi = await withTenant(app, ogrenciCtx(), (tx) =>
          tx.execute<{ id: string; yorum: string }>(
            sql`select id, yorum from ogrenme.ogretmen_degerlendirmeleri`,
          ),
        );
        expect(hepsi.map((r) => r.id)).toEqual([gorunurA]);
        // Hazirlanmis sorgular: gizli, geri cekilen ve baska ogrencinin satirlari bos doner.
        for (const id of [gizliA, geriCekilenA, digerOgrenciA]) {
          const r = await withTenant(app, ogrenciCtx(), (tx) =>
            tx.execute(sql`select * from ogrenme.ogretmen_degerlendirmeleri where id = ${id}`),
          );
          expect(r).toHaveLength(0);
        }
        // Gizli kaydi guncellemek/gormek de mumkun degil.
        const guncel = await withTenant(app, ogrenciCtx(), (tx) =>
          tx.execute(
            sql`update ogrenme.ogretmen_degerlendirmeleri set ogrenci_gorur = false where id = ${gizliA} returning id`,
          ),
        );
        expect(guncel).toHaveLength(0);
      });

      it('ogrenci rolu yalniz kendine onerilen ve geri cekilmemis kaynagi okur', async () => {
        const hepsi = await withTenant(app, ogrenciCtx(), (tx) =>
          tx.execute<{ id: string }>(sql`select id from ogrenme.kaynak_onerileri`),
        );
        expect(hepsi.map((r) => r.id)).toEqual([oneriA]);
      });

      it('personel rolleri (ogretmen) hepsini gorur; roller bos baglam (sistem disi kullanim) kisitsiz kalir', async () => {
        const hoca = await withTenant(app, ctxA(['ogretmen'], ogretmenKullaniciA), (tx) =>
          tx.execute<{ id: string }>(
            sql`select id from ogrenme.ogretmen_degerlendirmeleri order by id`,
          ),
        );
        expect(hoca.map((r) => r.id).sort()).toEqual(
          [gorunurA, gizliA, geriCekilenA, digerOgrenciA].sort(),
        );
      });
    });

    it('api_app degerlendirme ve onerileri SILEMEZ (geri cekme silme degildir); api_sistem silebilir (KVKK)', async () => {
      for (const [tablo, id] of [
        ['ogretmen_degerlendirmeleri', gizliA],
        ['kaynak_onerileri', oneriA],
      ] as const) {
        const hata = await hataMetni(
          withTenant(app, ctxA(['ogretmen']), (tx) =>
            tx.execute(sql.raw(`delete from ogrenme.${tablo} where id = '${id}'`)),
          ),
        );
        expect(hata).toMatch(/permission denied/);
      }
      const [{ n } = { n: 0 }] = await sistem<{ n: number }[]>`
      select count(*)::int n from ogrenme.ogretmen_degerlendirmeleri where id = ${gizliA}`;
      expect(n).toBe(1);
    });

    it('kisitlar: olcek 1-5, donem sirasi ve en cok 31 gun, bos icerik, tur/alan tutarliligi, url, geri cekme cifti', async () => {
      const dd = (ek: Parameters<typeof degerEkle>[4], id = uuidv7()) =>
        hataMetni(degerEkle(id, kurumA, ogrenciA, ogretmenA, ek));
      expect(await dd({ olcek: 6 })).toMatch(/ogretmen_degerlendirmeleri_olcek_chk/);
      expect(await dd({ olcek: 0 })).toMatch(/ogretmen_degerlendirmeleri_olcek_chk/);
      expect(await dd({ olcek: null, yorum: null })).toMatch(
        /ogretmen_degerlendirmeleri_icerik_chk/,
      );
      expect(await dd({ yorum: 'x'.repeat(4001) })).toMatch(/ogretmen_degerlendirmeleri_yorum_chk/);
      const donem = (bas: string, bit: string) =>
        hataMetni(sistem`
        insert into ogrenme.ogretmen_degerlendirmeleri (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, yorum)
        values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${ogretmenA}, ${bas}, ${bit}, 'x')`);
      expect(await donem('2030-01-10', '2030-01-09')).toMatch(
        /ogretmen_degerlendirmeleri_donem_chk/,
      );
      expect(await donem('2030-01-01', '2030-02-01')).toMatch(
        /ogretmen_degerlendirmeleri_donem_chk/,
      );
      // 31 gun (ucu dahil) gecerli.
      await sistem`
      insert into ogrenme.ogretmen_degerlendirmeleri (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, yorum)
      values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${ogretmenA}, '2030-01-01', '2030-01-31', 'x')`;
      const geriCift = await hataMetni(sistem`
      insert into ogrenme.ogretmen_degerlendirmeleri (id, kurum_id, ogrenci_id, yazar_id, donem_baslangic, donem_bitis, yorum, geri_cekildi_at)
      values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${ogretmenA}, '2030-01-01', '2030-01-01', 'x', now())`);
      expect(geriCift).toMatch(/ogretmen_degerlendirmeleri_geri_cekme_chk/);

      const oneri = (tur: string, _k: null, u: string | null, b: string | null) =>
        hataMetni(sistem`
        insert into ogrenme.kaynak_onerileri (id, kurum_id, ogrenci_id, oneren_id, tur, baglanti_url, baslik)
        values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${ogretmenA}, ${tur}, ${u}, ${b})`);
      expect(await oneri('serbest', null, null, null)).toMatch(/kaynak_onerileri_tur_alan_chk/);
      expect(await oneri('serbest', null, 'https://x.com', 'b')).toMatch(
        /kaynak_onerileri_tur_alan_chk/,
      );
      expect(await oneri('link', null, null, 'b')).toMatch(/kaynak_onerileri_tur_alan_chk/);
      expect(await oneri('kaynak_kitap', null, null, null)).toMatch(
        /kaynak_onerileri_tur_alan_chk/,
      );
      expect(await oneri('link', null, 'javascript:alert(1)', 'b')).toMatch(
        /kaynak_onerileri_url_chk/,
      );
      expect(await oneri('baska', null, null, 'b')).toMatch(/kaynak_onerileri_tur_chk/);
      await sistem`
      insert into ogrenme.kaynak_onerileri (id, kurum_id, ogrenci_id, oneren_id, tur, baglanti_url, baslik)
      values (${uuidv7()}, ${kurumA}, ${ogrenciA}, ${ogretmenA}, 'link', 'https://ornek.com/x', 'Baslik')`;
    });
  },
);
