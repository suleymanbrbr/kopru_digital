import { createDb, withTenant, type Database, type Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { duyuruDagitimIsi } from './duyuru-isi.js';
import { sonradanKatilanaDagit } from './duyuru.js';
import { T0, aliciKur, cihazEkle, dk, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testDb,
  testServisi,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';

/** 10 Kasim 2026 12:30 Istanbul: sessiz saat disi. */
const SIMDI = dk(T0, 30);

describe.skipIf(dbYok())('duyurular (gercek PostgreSQL, bildirim_app)', () => {
  let o: Ortam;
  let servis: Service;
  let sistemDb: Database;

  const url = (kurum: string, ek = '') => `/v1/bildirim/kurumlar/${kurum}/duyurular${ek}`;
  const git = async (
    k: Kimlik,
    yontem: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    yol: string,
    govde?: unknown,
  ) =>
    servis.app.inject({
      method: yontem,
      url: yol,
      headers: yetki(await kullaniciTokeni(k)),
      ...(govde === undefined ? {} : { payload: govde as object }),
    });

  // --- Tohumlama ------------------------------------------------------------------------------
  const uye = async (
    kurumId: string,
    rol: Kimlik['rol'],
    s: { kademeId?: string; durum?: string } = {},
  ) => {
    const a = await aliciKur(o, { kurumId, rol, ...(s.durum ? { durum: s.durum } : {}) });
    if (s.kademeId) {
      await o.sistem`update bildirim.uyelik_kopyalari set kademe_id = ${s.kademeId} where uyelik_id = ${a.uyelikId}`;
    }
    return { ...a, rol };
  };
  const kademe = async (kurumId: string) => {
    const id = uuidv7();
    await o.sistem`insert into bildirim.kademe_kopyalari (kademe_id, kurum_id, ad, son_olay_at, son_olay_id)
                   values (${id}, ${kurumId}, 'K', now(), ${uuidv7()})`;
    return id;
  };
  const grup = async (kurumId: string, kademeId: string | null = null) => {
    const id = uuidv7();
    await o.sistem`insert into bildirim.grup_kopyalari (grup_id, kurum_id, kademe_id, tur, ad, durum, son_olay_at, son_olay_id)
                   values (${id}, ${kurumId}, ${kademeId}, 'grup', 'G', 'aktif', now(), ${uuidv7()})`;
    return id;
  };
  const grubaKat = async (
    kurumId: string,
    grupId: string,
    ogrenci: string,
    bitis: string | null = null,
  ) => {
    await o.sistem`insert into bildirim.grup_uyesi_kopyalari
      (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
      values (${grupId}, ${ogrenci}, ${kurumId}, ${uuidv7()}, '2026-01-01', ${bitis}, now(), ${uuidv7()})`;
  };
  const ata = async (kurumId: string, grupId: string, ogretmen: string) => {
    await o.sistem`insert into bildirim.atama_kopyalari
      (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, son_olay_at, son_olay_id)
      values (${uuidv7()}, ${kurumId}, ${grupId}, ${ogretmen}, 'mat', '2026-01-01', now(), ${uuidv7()})`;
  };
  const modulAyari = async (kurumId: string, kapsam: string, kapsamId: string, acik: boolean) => {
    await o.sistem`insert into bildirim.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kurumId}, 'duyuru', ${kapsam}, ${kapsamId}, ${acik}, now(), ${uuidv7()})`;
  };

  /** Kurum: yonetici, ogretmen (atamali grup g1), g2 (atamasiz), g1'de iki ogrenci, g2'de bir ogrenci. */
  async function dunya() {
    const kurumId = uuidv7();
    const yonetici = await uye(kurumId, 'yonetici');
    const ogretmen = await uye(kurumId, 'ogretmen');
    const g1 = await grup(kurumId);
    const g2 = await grup(kurumId);
    await ata(kurumId, g1, ogretmen.uyelikId);
    const o1 = await uye(kurumId, 'ogrenci');
    const o2 = await uye(kurumId, 'ogrenci');
    const o3 = await uye(kurumId, 'ogrenci');
    await grubaKat(kurumId, g1, o1.uyelikId);
    await grubaKat(kurumId, g1, o2.uyelikId);
    await grubaKat(kurumId, g2, o3.uyelikId);
    return { kurumId, yonetici, ogretmen, g1, g2, o1, o2, o3 };
  }

  const olustur = (k: Kimlik, ek: Record<string, unknown>) =>
    git(k, 'POST', url(k.kurumId), { baslik: 'Başlık', govde: 'Gövde metni', ...ek });
  const yayinla = async (k: Kimlik, id: string) => git(k, 'POST', url(k.kurumId, `/${id}/yayinla`));
  async function yayinli(k: Kimlik, ek: Record<string, unknown>) {
    const r = await olustur(k, ek);
    expect(r.statusCode, r.body).toBe(201);
    const id = r.json<{ id: string }>().id;
    const y = await yayinla(k, id);
    expect(y.statusCode, y.body).toBe(200);
    return y.json<{ id: string; alici_sayisi: number; okunan_sayisi: number; durum: string }>();
  }
  const aliciIdleri = async (duyuruId: string) =>
    (
      await o.sistem<
        { alici_id: string }[]
      >`select alici_id from bildirim.duyuru_alicilari where duyuru_id = ${duyuruId}`
    ).map((r) => r.alici_id);

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => SIMDI });
    await servis.app.ready();
    const urls = testDb();
    if (!urls) throw new Error('testDb yok');
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await servis.stop();
    await o.kapat();
  });

  describe('yetki', () => {
    it('ogretmen kendi grubuna yazar; baska gruba, kademe ve kuruma 403', async () => {
      const w = await dunya();
      expect((await olustur(w.ogretmen, { hedef_turu: 'grup', hedef_id: w.g1 })).statusCode).toBe(
        201,
      );
      const baska = await olustur(w.ogretmen, { hedef_turu: 'grup', hedef_id: w.g2 });
      expect(baska.statusCode).toBe(403);
      expect(baska.json()).toMatchObject({ error: { code: 'yasak' } });
      const kd = await kademe(w.kurumId);
      expect((await olustur(w.ogretmen, { hedef_turu: 'kademe', hedef_id: kd })).statusCode).toBe(
        403,
      );
      expect((await olustur(w.ogretmen, { hedef_turu: 'kurum' })).statusCode).toBe(403);
    });

    it('yonetici her hedefe yazar; ogrenci yazamaz (izin_yok); veli goremez', async () => {
      const w = await dunya();
      const kd = await kademe(w.kurumId);
      expect((await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g2 })).statusCode).toBe(
        201,
      );
      expect((await olustur(w.yonetici, { hedef_turu: 'kademe', hedef_id: kd })).statusCode).toBe(
        201,
      );
      expect((await olustur(w.yonetici, { hedef_turu: 'kurum' })).statusCode).toBe(201);
      const r = await olustur(w.o1, { hedef_turu: 'grup', hedef_id: w.g1 });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ error: { code: 'izin_yok' } });
      const veli = await uye(w.kurumId, 'veli');
      expect((await git(veli, 'GET', url(w.kurumId))).statusCode).toBe(403);
      expect((await git(w.o1, 'GET', url(w.kurumId, '/yonetim'))).statusCode).toBe(403);
    });

    it('atamasi biten ogretmen yayinlayamaz; baskasinin taslagini goremez (404)', async () => {
      const w = await dunya();
      const r = await olustur(w.ogretmen, { hedef_turu: 'grup', hedef_id: w.g1 });
      const id = r.json<{ id: string }>().id;
      await o.sistem`update bildirim.atama_kopyalari set bitis_tarihi = '2026-11-01' where grup_id = ${w.g1}`;
      expect((await yayinla(w.ogretmen, id)).statusCode).toBe(403);
      await o.sistem`update bildirim.atama_kopyalari set bitis_tarihi = null where grup_id = ${w.g1}`;
      const digeri = await uye(w.kurumId, 'ogretmen');
      await ata(w.kurumId, w.g1, digeri.uyelikId);
      expect((await yayinla(digeri, id)).statusCode).toBe(404);
      expect((await git(digeri, 'DELETE', url(w.kurumId, `/${id}`))).statusCode).toBe(404);
      expect((await yayinla(w.yonetici, id)).statusCode).toBe(200);
    });

    it('dogrulama: baslik 200, govde 4000, hedef_id zorunlulugu, bilinmeyen grup 404', async () => {
      const w = await dunya();
      expect(
        (await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1, baslik: 'x'.repeat(201) }))
          .statusCode,
      ).toBe(400);
      expect(
        (await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1, govde: 'x'.repeat(4001) }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await olustur(w.yonetici, {
            hedef_turu: 'grup',
            hedef_id: w.g1,
            baslik: 'x'.repeat(200),
            govde: 'x'.repeat(4000),
          })
        ).statusCode,
      ).toBe(201);
      expect((await olustur(w.yonetici, { hedef_turu: 'grup' })).statusCode).toBe(400);
      expect(
        (await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: uuidv7() })).statusCode,
      ).toBe(404);
      expect(
        (await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1, hedef_roller: ['veli'] }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe('modul', () => {
    it('duyuru modulu kurumda ya da grupta kapaliysa yayin reddedilir (modul_kapali), taslak serbest', async () => {
      const w = await dunya();
      const r = await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1 });
      expect(r.statusCode).toBe(201);
      const id = r.json<{ id: string }>().id;
      await modulAyari(w.kurumId, 'grup', w.g1, false);
      const y = await yayinla(w.yonetici, id);
      expect(y.statusCode).toBe(403);
      expect(y.json()).toMatchObject({ error: { code: 'modul_kapali' } });
      // Baska grup etkilenmez.
      expect((await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g2 })).statusCode).toBe(
        201,
      );
      await o.sistem`delete from bildirim.modul_ayari_kopyalari where kurum_id = ${w.kurumId}`;
      await modulAyari(w.kurumId, 'kurum', w.kurumId, false);
      expect((await yayinla(w.yonetici, id)).statusCode).toBe(403);
      await o.sistem`update bildirim.modul_ayari_kopyalari set acik = true where kurum_id = ${w.kurumId}`;
      expect((await yayinla(w.yonetici, id)).statusCode).toBe(200);
    });
  });

  describe('yayin ve fan-out', () => {
    it('grup: etkin ogrenciler (bitmis uye, askidaki uyelik, yazar haric); kutu bildirimi ve duyurularim', async () => {
      const w = await dunya();
      const bitmis = await uye(w.kurumId, 'ogrenci');
      await grubaKat(w.kurumId, w.g1, bitmis.uyelikId, '2026-11-01');
      const askida = await uye(w.kurumId, 'ogrenci', { durum: 'askida' });
      await grubaKat(w.kurumId, w.g1, askida.uyelikId);
      const d = await yayinli(w.ogretmen, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Sınav haftası',
      });
      expect(d).toMatchObject({ durum: 'yayinda', alici_sayisi: 2, okunan_sayisi: 0 });
      expect((await aliciIdleri(d.id)).sort()).toEqual([w.o1.uyelikId, w.o2.uyelikId].sort());

      const kutu = await o.sistem<{ baslik: string; kategori: string; derin_baglanti: string }[]>`
        select baslik, kategori, derin_baglanti from bildirim.bildirimler where alici_id = ${w.o1.uyelikId}`;
      expect(kutu).toEqual([
        { baslik: 'Sınav haftası', kategori: 'duyuru', derin_baglanti: `kopru://duyuru/${d.id}` },
      ]);
      const liste = await git(w.o1, 'GET', url(w.kurumId));
      expect(liste.json()).toMatchObject({
        toplam: 1,
        ogeler: [{ id: d.id, baslik: 'Sınav haftası', okundu_at: null }],
      });
      // Hedef disindaki ogrenci gormez ve tekil okuyamaz.
      expect((await git(w.o3, 'GET', url(w.kurumId))).json()).toMatchObject({ toplam: 0 });
      expect((await git(w.o3, 'GET', url(w.kurumId, `/${d.id}`))).statusCode).toBe(404);
      expect((await git(w.o3, 'POST', url(w.kurumId, `/${d.id}/okundu`))).statusCode).toBe(404);
      // Tekrar yayin 409.
      expect((await yayinla(w.ogretmen, d.id)).statusCode).toBe(409);
    });

    it('push: genel metin, duyuru basligi push satirina girmez; push_gonderildi=false push uretmez', async () => {
      const w = await dunya();
      await cihazEkle(o, w.o1.kullaniciId);
      const d = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Ayşe için özel veli toplantısı',
      });
      const push = await o.sistem<{ baslik: string; govde: string; durum: string }[]>`
        select g.baslik, g.govde, g.durum from bildirim.gonderimler g
          join bildirim.bildirimler b on b.id = g.bildirim_id and b.kurum_id = g.kurum_id
         where b.alici_id = ${w.o1.uyelikId} and g.kanal = 'push' and g.durum <> 'atlandi'`;
      expect(push).toHaveLength(1);
      expect(push[0]?.baslik).toBe('Yeni duyuru');
      expect(push[0]?.govde).toBe('Kurum için yeni bir duyuru var.');
      expect(JSON.stringify(push)).not.toContain('Ayşe');
      expect(d.id).toBeTruthy();

      const w2 = await dunya();
      await cihazEkle(o, w2.o1.kullaniciId);
      await yayinli(w2.yonetici, { hedef_turu: 'grup', hedef_id: w2.g1, push_gonderildi: false });
      const yok = await o.sistem<{ n: number }[]>`
        select count(*)::int n from bildirim.gonderimler where kurum_id = ${w2.kurumId}`;
      expect(yok[0]?.n).toBe(0);
      expect(
        (await o.sistem`select 1 from bildirim.bildirimler where alici_id = ${w2.o1.uyelikId}`)
          .length,
      ).toBe(1);
    });

    it('kademe ve kurum hedefleri; hedef_roller suzgeci', async () => {
      const kurumId = uuidv7();
      const yonetici = await uye(kurumId, 'yonetici');
      const kd = await kademe(kurumId);
      const kd2 = await kademe(kurumId);
      const a1 = await uye(kurumId, 'ogrenci', { kademeId: kd });
      const a2 = await uye(kurumId, 'ogrenci', { kademeId: kd });
      const a3 = await uye(kurumId, 'ogrenci', { kademeId: kd2 });
      const t1 = await uye(kurumId, 'ogretmen', { kademeId: kd });
      const t2 = await uye(kurumId, 'ogretmen');

      const kademeDuyuru = await yayinli(yonetici, { hedef_turu: 'kademe', hedef_id: kd });
      expect((await aliciIdleri(kademeDuyuru.id)).sort()).toEqual(
        [a1.uyelikId, a2.uyelikId].sort(),
      );
      const ikisi = await yayinli(yonetici, {
        hedef_turu: 'kademe',
        hedef_id: kd,
        hedef_roller: ['ogrenci', 'ogretmen'],
      });
      expect((await aliciIdleri(ikisi.id)).sort()).toEqual(
        [a1.uyelikId, a2.uyelikId, t1.uyelikId].sort(),
      );

      const kurumDuyuru = await yayinli(yonetici, { hedef_turu: 'kurum' });
      expect((await aliciIdleri(kurumDuyuru.id)).sort()).toEqual(
        [a1.uyelikId, a2.uyelikId, a3.uyelikId].sort(),
      );
      const sadeceOgretmen = await yayinli(yonetici, {
        hedef_turu: 'kurum',
        hedef_roller: ['ogretmen'],
      });
      expect((await aliciIdleri(sadeceOgretmen.id)).sort()).toEqual(
        [t1.uyelikId, t2.uyelikId].sort(),
      );
    });

    it('grup duyurusu ogretmen rolunu atamadan cozer', async () => {
      const w = await dunya();
      const d = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        hedef_roller: ['ogrenci', 'ogretmen'],
      });
      expect((await aliciIdleri(d.id)).sort()).toEqual(
        [w.o1.uyelikId, w.o2.uyelikId, w.ogretmen.uyelikId].sort(),
      );
    });
  });

  describe('liste, guncelleme, arsiv, silme', () => {
    it('duyurularim: sabit ustte, suresi gecen ve arsivlenen gizli; okunmamis suzgeci', async () => {
      const w = await dunya();
      const a = await yayinli(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1, baslik: 'A' });
      const b = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'B',
        sabit: true,
      });
      const c = await yayinli(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1, baslik: 'C' });
      const gecmis = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'D',
        bitis_at: new Date(SIMDI.getTime() + 60_000).toISOString(),
      });
      // Zaman ilerleyince (bitis gecti) gizlenir: bitisi veritabaninda geriye cek.
      await o.sistem`update bildirim.duyurular set bitis_at = ${new Date(SIMDI.getTime() - 1000)} where id = ${gecmis.id}`;
      await o.sistem`update bildirim.bildirimler set gecerlilik_bitis_at = ${new Date(SIMDI.getTime() - 1000)}
                      where kurum_id = ${w.kurumId} and tekil_anahtar = ${`duyuru_yayinlandi:${gecmis.id}`}`;
      expect((await git(w.yonetici, 'POST', url(w.kurumId, `/${c.id}/arsivle`))).statusCode).toBe(
        200,
      );

      const r = await git(w.o1, 'GET', url(w.kurumId));
      const j = r.json<{ ogeler: { id: string; baslik: string }[]; toplam: number }>();
      expect(j.ogeler.map((x) => x.baslik)).toEqual(['B', 'A']);
      expect(j.toplam).toBe(2);
      await git(w.o1, 'POST', url(w.kurumId, `/${a.id}/okundu`));
      const okunmamis = await git(w.o1, 'GET', url(w.kurumId, '?okunmamis=true'));
      expect(okunmamis.json<{ ogeler: { id: string }[] }>().ogeler.map((x) => x.id)).toEqual([
        b.id,
      ]);
      // Arsivlenen duyurunun kutu bildirimi gizlenir.
      const kutu = await git(w.o1, 'GET', `/v1/bildirim/kurumlar/${w.kurumId}/kutu`);
      expect(
        kutu
          .json<{ ogeler: { baslik: string }[] }>()
          .ogeler.map((x) => x.baslik)
          .sort(),
      ).toEqual(['A', 'B']);
    });

    it('yonetim listesi: ogretmen yalniz kendi duyurularini, yonetici hepsini gorur (sayaclarla)', async () => {
      const w = await dunya();
      await yayinli(w.ogretmen, { hedef_turu: 'grup', hedef_id: w.g1, baslik: 'Hocadan' });
      await yayinli(w.yonetici, { hedef_turu: 'kurum', baslik: 'Yoneticiden' });
      const h = (await git(w.ogretmen, 'GET', url(w.kurumId, '/yonetim'))).json<{
        ogeler: { baslik: string; alici_sayisi: number }[];
        toplam: number;
      }>();
      expect(h.ogeler.map((x) => x.baslik)).toEqual(['Hocadan']);
      expect(h.ogeler[0]?.alici_sayisi).toBe(2);
      const y = (await git(w.yonetici, 'GET', url(w.kurumId, '/yonetim'))).json<{
        toplam: number;
      }>();
      expect(y.toplam).toBe(2);
      const taslak = await git(w.yonetici, 'GET', url(w.kurumId, '/yonetim?durum=taslak'));
      expect(taslak.json()).toMatchObject({ toplam: 0 });
    });

    it('taslak serbest guncellenir; yayindakinde yalniz sabit ve bitis (bitis kutuyu da gunceller); arsivde 409', async () => {
      const w = await dunya();
      const r = await olustur(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1 });
      const id = r.json<{ id: string }>().id;
      const p = await git(w.yonetici, 'PATCH', url(w.kurumId, `/${id}`), {
        baslik: 'Yeni',
        hedef_turu: 'kurum',
      });
      expect(p.statusCode, p.body).toBe(200);
      expect(p.json()).toMatchObject({ baslik: 'Yeni', hedef_turu: 'kurum', hedef_id: w.kurumId });
      expect((await yayinla(w.yonetici, id)).statusCode).toBe(200);
      expect(
        (await git(w.yonetici, 'PATCH', url(w.kurumId, `/${id}`), { baslik: 'Degisti' }))
          .statusCode,
      ).toBe(409);
      const bitis = new Date(SIMDI.getTime() + 3_600_000).toISOString();
      const s = await git(w.yonetici, 'PATCH', url(w.kurumId, `/${id}`), {
        sabit: true,
        bitis_at: bitis,
      });
      expect(s.json()).toMatchObject({ sabit: true });
      const gb = await o.sistem<{ g: Date | null }[]>`
        select gecerlilik_bitis_at g from bildirim.bildirimler where alici_id = ${w.o1.uyelikId}`;
      expect(gb[0]?.g?.toISOString()).toBe(bitis);
      expect(
        (
          await git(w.yonetici, 'PATCH', url(w.kurumId, `/${id}`), {
            bitis_at: new Date(SIMDI.getTime() - 1000).toISOString(),
          })
        ).statusCode,
      ).toBe(400);
      expect((await git(w.yonetici, 'POST', url(w.kurumId, `/${id}/arsivle`))).statusCode).toBe(
        200,
      );
      expect(
        (await git(w.yonetici, 'PATCH', url(w.kurumId, `/${id}`), { sabit: false })).statusCode,
      ).toBe(409);
      expect((await git(w.yonetici, 'POST', url(w.kurumId, `/${id}/arsivle`))).statusCode).toBe(
        409,
      );
    });

    it('yumusak silme: listede ve kutuda gizlenir, okundu 404', async () => {
      const w = await dunya();
      const d = await yayinli(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1 });
      expect((await git(w.yonetici, 'DELETE', url(w.kurumId, `/${d.id}`))).json()).toEqual({
        id: d.id,
        silindi: true,
      });
      expect((await git(w.o1, 'GET', url(w.kurumId))).json()).toMatchObject({ toplam: 0 });
      expect((await git(w.o1, 'POST', url(w.kurumId, `/${d.id}/okundu`))).statusCode).toBe(404);
      expect((await git(w.yonetici, 'GET', url(w.kurumId, `/${d.id}`))).statusCode).toBe(404);
      const kutu = await git(w.o1, 'GET', `/v1/bildirim/kurumlar/${w.kurumId}/kutu`);
      expect(kutu.json()).toMatchObject({ ogeler: [] });
      const satir = await o.sistem<
        { s: Date | null }[]
      >`select silindi_at s from bildirim.duyurular where id = ${d.id}`;
      expect(satir[0]?.s).not.toBeNull();
    });
  });

  describe('okundu sayaci', () => {
    it('ilk okuma sayaci artirir, tekrar artirmaz; kutudaki bildirim de okundu olur; okuyanlar listesi', async () => {
      const w = await dunya();
      const d = await yayinli(w.ogretmen, { hedef_turu: 'grup', hedef_id: w.g1 });
      const r1 = await git(w.o1, 'POST', url(w.kurumId, `/${d.id}/okundu`));
      expect(r1.statusCode).toBe(200);
      const ilk = r1.json<{ okundu_at: string }>().okundu_at;
      const r2 = await git(w.o1, 'POST', url(w.kurumId, `/${d.id}/okundu`));
      expect(r2.json<{ okundu_at: string }>().okundu_at).toBe(ilk);
      const det = (await git(w.ogretmen, 'GET', url(w.kurumId, `/${d.id}`))).json<{
        yonetim: { okunan_sayisi: number; alici_sayisi: number };
      }>();
      expect(det.yonetim).toMatchObject({ okunan_sayisi: 1, alici_sayisi: 2 });
      const kutu = await o.sistem<{ okundu_at: Date | null }[]>`
        select okundu_at from bildirim.bildirimler where alici_id = ${w.o1.uyelikId}`;
      expect(kutu[0]?.okundu_at).not.toBeNull();
      const diger = await o.sistem<{ okundu_at: Date | null }[]>`
        select okundu_at from bildirim.bildirimler where alici_id = ${w.o2.uyelikId}`;
      expect(diger[0]?.okundu_at).toBeNull();

      const oku = await git(w.ogretmen, 'GET', url(w.kurumId, `/${d.id}/okuyanlar`));
      expect(oku.json()).toMatchObject({
        okuyanlar: [{ alici_id: w.o1.uyelikId }],
        okunan_sayisi: 1,
        alici_sayisi: 2,
      });
      expect((await git(w.o1, 'GET', url(w.kurumId, `/${d.id}/okuyanlar`))).statusCode).toBe(403);
      // Baska bir ogretmen (yazar degil) okuyanlari goremez.
      const yabanci = await uye(w.kurumId, 'ogretmen');
      expect((await git(yabanci, 'GET', url(w.kurumId, `/${d.id}/okuyanlar`))).statusCode).toBe(
        404,
      );
    });

    it('eszamanli okuma sayaci bir kez artirir; iki farkli alici iki kez', async () => {
      const w = await dunya();
      const d = await yayinli(w.yonetici, { hedef_turu: 'grup', hedef_id: w.g1 });
      const sonuc = await Promise.all(
        Array.from({ length: 8 }, () => git(w.o1, 'POST', url(w.kurumId, `/${d.id}/okundu`))),
      );
      expect(sonuc.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
      await Promise.all([
        git(w.o2, 'POST', url(w.kurumId, `/${d.id}/okundu`)),
        git(w.o2, 'POST', url(w.kurumId, `/${d.id}/okundu`)),
        git(w.o1, 'POST', url(w.kurumId, `/${d.id}/okundu`)),
      ]);
      const [s] = await o.sistem<{ okunan: number; dolu: number }[]>`
        select d.okunan_sayisi as okunan, (select count(*)::int from bildirim.duyuru_alicilari a
                where a.duyuru_id = d.id and a.okundu_at is not null) as dolu
          from bildirim.duyurular d where d.id = ${d.id}`;
      expect(s).toEqual({ okunan: 2, dolu: 2 });
    });
  });

  describe('sonradan katilan uye', () => {
    it('sabit ya da son 14 gun icindeki, suresi gecmemis duyurular yeni uyeye push olmadan eklenir', async () => {
      const w = await dunya();
      const yeni = await uye(w.kurumId, 'ogrenci');
      await cihazEkle(o, yeni.kullaniciId);
      const yeniDuyuru = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Yeni',
      });
      const eskiSabit = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'EskiSabit',
        sabit: true,
      });
      const eski = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Eski',
      });
      const suresiGecmis = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Gecmis',
        sabit: true,
      });
      const baskaGrup = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g2,
        baslik: 'BaskaGrup',
      });
      const arsiv = await yayinli(w.yonetici, {
        hedef_turu: 'grup',
        hedef_id: w.g1,
        baslik: 'Arsiv',
      });
      await git(w.yonetici, 'POST', url(w.kurumId, `/${arsiv.id}/arsivle`));
      const yirmiGunOnce = new Date(SIMDI.getTime() - 20 * 86_400_000);
      await o.sistem`update bildirim.duyurular set yayin_at = ${yirmiGunOnce} where id in (${eskiSabit.id}, ${eski.id}, ${suresiGecmis.id})`;
      await o.sistem`update bildirim.duyurular set bitis_at = ${new Date(SIMDI.getTime() - 1000)} where id = ${suresiGecmis.id}`;

      const sayi = await withTenant(o.app, { kurumId: w.kurumId }, async (tx) => {
        await grubaKatTx(tx, w.kurumId, w.g1, yeni.uyelikId);
        return sonradanKatilanaDagit(
          tx,
          { kurumId: w.kurumId, grupId: w.g1, ogrenciId: yeni.uyelikId, bitisTarihi: null },
          SIMDI,
        );
      });
      expect(sayi).toBe(2);
      const liste = (await git(yeni, 'GET', url(w.kurumId))).json<{
        ogeler: { baslik: string }[];
      }>();
      expect(liste.ogeler.map((x) => x.baslik)).toEqual(['EskiSabit', 'Yeni']);
      const kutu = await o.sistem<
        { baslik: string }[]
      >`select baslik from bildirim.bildirimler where alici_id = ${yeni.uyelikId}`;
      expect(kutu.map((k) => k.baslik).sort()).toEqual(['EskiSabit', 'Yeni']);
      // Push yok (cihazi olsa da).
      const push = await o.sistem<
        { n: number }[]
      >`select count(*)::int n from bildirim.gonderimler where alici_kullanici_id = ${yeni.kullaniciId}`;
      expect(push[0]?.n).toBe(0);
      const say = await o.sistem<
        { alici: number }[]
      >`select alici_sayisi alici from bildirim.duyurular where id = ${yeniDuyuru.id}`;
      expect(say[0]?.alici).toBe(3);
      expect(baskaGrup.id).toBeTruthy();
      // Idempotent: ayni olay tekrar gelirse yeni satir yok.
      const tekrar = await withTenant(o.app, { kurumId: w.kurumId }, (tx) =>
        sonradanKatilanaDagit(
          tx,
          { kurumId: w.kurumId, grupId: w.g1, ogrenciId: yeni.uyelikId, bitisTarihi: null },
          SIMDI,
        ),
      );
      expect(tekrar).toBe(0);
      // Bitmis uyelik duyuru almaz.
      const ayrilan = await uye(w.kurumId, 'ogrenci');
      const hic = await withTenant(o.app, { kurumId: w.kurumId }, (tx) =>
        sonradanKatilanaDagit(
          tx,
          {
            kurumId: w.kurumId,
            grupId: w.g1,
            ogrenciId: ayrilan.uyelikId,
            bitisTarihi: '2026-11-01',
          },
          SIMDI,
        ),
      );
      expect(hic).toBe(0);
    });

    async function grubaKatTx(_tx: unknown, kurumId: string, grupId: string, ogrenci: string) {
      await grubaKat(kurumId, grupId, ogrenci);
    }
  });

  describe('kiraci izolasyonu', () => {
    it('baska kurum yolu 403; baska kurumun duyurusu id ile de 404; RLS satirlari gizler', async () => {
      const a = await dunya();
      const b = await dunya();
      const d = await yayinli(a.yonetici, { hedef_turu: 'grup', hedef_id: a.g1 });
      expect((await git(b.yonetici, 'GET', url(a.kurumId))).statusCode).toBe(403);
      expect((await git(b.yonetici, 'GET', url(b.kurumId, `/${d.id}`))).statusCode).toBe(404);
      expect((await git(b.yonetici, 'POST', url(b.kurumId, `/${d.id}/yayinla`))).statusCode).toBe(
        404,
      );
      expect((await git(b.yonetici, 'DELETE', url(b.kurumId, `/${d.id}`))).statusCode).toBe(404);
      expect((await git(b.o1, 'POST', url(b.kurumId, `/${d.id}/okundu`))).statusCode).toBe(404);
      const gorunen = await withTenant(o.app, { kurumId: b.kurumId }, async (tx) => ({
        duyuru: await tx.execute(`select 1 from bildirim.duyurular where id = '${d.id}'` as never),
        alici: await tx.execute(
          `select 1 from bildirim.duyuru_alicilari where duyuru_id = '${d.id}'` as never,
        ),
      }));
      expect(gorunen.duyuru).toHaveLength(0);
      expect(gorunen.alici).toHaveLength(0);
      // Baska kurum baglaminda yazma RLS WITH CHECK ile reddedilir.
      await expect(
        withTenant(o.app, { kurumId: b.kurumId }, (tx) =>
          tx.execute(
            `insert into bildirim.duyurular (id, kurum_id, baslik, govde, hedef_turu, hedef_id, yazar_id)
             values ('${uuidv7()}', '${a.kurumId}', 'x', 'y', 'kurum', '${a.kurumId}', '${uuidv7()}')` as never,
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe('buyuk hedef (2500 alici)', () => {
    it('alici satirlari tek islemde yazilir, kutu bildirimi worker partilerinde uretilir (sure olculur)', async () => {
      const kurumId = uuidv7();
      const yonetici = await uye(kurumId, 'yonetici');
      await o.sistem`insert into bildirim.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
        select gen_random_uuid(), ${kurumId}, gen_random_uuid(), 'ogrenci', 'aktif', now(), gen_random_uuid()
          from generate_series(1, 2500)`;
      const t0 = performance.now();
      const r = await olustur(yonetici, { hedef_turu: 'kurum' });
      const id = r.json<{ id: string }>().id;
      const y = await yayinla(yonetici, id);
      const yayinMs = Math.round(performance.now() - t0);
      expect(y.statusCode, y.body).toBe(200);
      expect(y.json()).toMatchObject({ alici_sayisi: 2500, dagitim_tamam: false });
      const [s0] = await o.sistem<
        { n: number }[]
      >`select count(*)::int n from bildirim.bildirimler where kurum_id = ${kurumId}`;
      expect(s0?.n).toBe(0);

      const t1 = performance.now();
      let toplam = 0;
      for (let tur = 0; tur < 50; tur++) {
        const s = await duyuruDagitimIsi({ sistem: sistemDb, uygulama: o.app, simdi: () => SIMDI });
        toplam += s.bildirim;
        if (s.duyuru === 0) break;
      }
      const dagitimMs = Math.round(performance.now() - t1);
      console.info(
        `[duyuru 2500 alici] yayin istegi ${String(yayinMs)} ms, worker dagitimi ${String(dagitimMs)} ms`,
      );
      expect(toplam).toBe(2500);
      const [s1] = await o.sistem<
        { n: number }[]
      >`select count(*)::int n from bildirim.bildirimler where kurum_id = ${kurumId}`;
      expect(s1?.n).toBe(2500);
      const [d] = await o.sistem<
        { tamam: boolean }[]
      >`select (dagitim_tamam_at is not null) tamam from bildirim.duyurular where id = ${id}`;
      expect(d?.tamam).toBe(true);
      // Ikinci tur bir sey yapmaz (idempotent).
      expect(
        (await duyuruDagitimIsi({ sistem: sistemDb, uygulama: o.app, simdi: () => SIMDI }))
          .bildirim,
      ).toBe(0);
      // Yayin istegi makul surede doner (alici satirlari toplu).
      expect(yayinMs).toBeLessThan(10_000);
    }, 180_000);
  });
});
