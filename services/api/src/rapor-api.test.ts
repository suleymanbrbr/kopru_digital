import type {
  DersRaporOzetSema,
  HesapRaporOgrencilerSema,
  HesapRaporOzetSema,
  OgrenmeRaporOzetSema,
  RaporOgrenciOraniListeSema,
  RaporOdevListeSema,
  RaporSoruListeSema,
} from '@kopru/contracts';
import ExcelJS from 'exceljs';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { dersYardimcilari, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { kaynakYardimcilari } from './test/kaynak-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

type Hesap = z.infer<typeof HesapRaporOzetSema>;
type HesapOgrenciler = z.infer<typeof HesapRaporOgrencilerSema>;
type Ders = z.infer<typeof DersRaporOzetSema>;
type Ogrenme = z.infer<typeof OgrenmeRaporOzetSema>;

/**
 * Yonetici paneli gostergeleri: bilinen tohumla beklenen oranlar (sayilar elle hesaplanmistir), kapsam ve
 * kiraci izolasyonu, modul kapali, alt listeler ve Excel.
 *
 * Tohum (kurum A, "bugun" = kurum yerel gunu):
 *  - G1 (ogretmen T1): O1, O2.   G2 (ogretmen T2): O3.   O4 grupsuz.
 *  - Ders G1 (dun, T1): O1 geldi, O2 gelmedi.   Ders G2 (iki gun once, T2): O3 gec.
 *    => devam kurum 2/3, G1 1/2, G2 1/1, T1 1/2, T2 1/1.
 *  - Geri bildirim: G1 dersi O1 anladim; G2 dersi O3 kismen => anladim kurum 1/2.
 *  - Odev G1 (T1, teslim dun): O1 teslim_edildi, O2 atandi. Yarinki ve 40 gun onceki odev paydaya girmez.
 *    => odev kurum 1/2.   Odev G2 (T2, teslim dun): O3 incelendi => G2 1/1; kurum 2/3.
 *  - Plan (dun): O1 2 tamam + 1 yapilmadi, O3 1 tamam, 1 devredildi (paydaya girmez) => plan 3/4.
 *  - Soru: O1 (T1, 600 sn), O2 (T1, 1800 sn), O3 cevap bekliyor => 3 soru, 2 cevaplanan, ort 1200, medyan 1200.
 *  - Etkin ogrenci (son 7 gun): O1, O2, O3 (yoklama) => 3; O4 yok.
 */
describe.skipIf(dbYok())('panel rapor gostergeleri API', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;
  let k: ReturnType<typeof kaynakYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
    k = kaynakYardimcilari(y, sistem);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  interface Tohum {
    s: Kurulum;
    t2: Uye;
    g2: string;
    o: [string, string, string, string];
    dersG1: string;
    dersG2: string;
  }

  /** Gunun yerel (Europe/Istanbul) tarihi `gunOnce` gun oncesi, saat `saat`: `timestamptz`. */
  const zaman = (gunOnce: number, saat = 10) =>
    sistem<{ z: Date }[]>`
      select (((now() at time zone 'Europe/Istanbul')::date - ${gunOnce}::int)::timestamp
        + make_interval(hours => ${saat}::int)) at time zone 'Europe/Istanbul' as z`.then(
      (r) => new Date(r[0]?.z ?? 0),
    );

  async function ders(
    s: Kurulum,
    grupId: string,
    ogretmenId: string,
    gunOnce: number,
    yoklamalar: Record<string, 'geldi' | 'gelmedi' | 'gec' | 'izinli'>,
    geriBildirim: Record<string, 'anladim' | 'kismen' | 'anlamadim'> = {},
  ): Promise<string> {
    const id = uuidv7();
    const bas = await zaman(gunOnce, 10);
    const bit = await zaman(gunOnce, 11);
    await sistem`insert into ders.dersler (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at,
      bitis_at, ilk_baslangic_at, durum, cakisma_onayli)
      values (${id}, ${s.k.kurumId}, ${grupId}, ${ogretmenId}, 'matematik', ${bas}, ${bit}, ${bas},
        'tamamlandi', true)`;
    for (const [ogr, durum] of Object.entries(yoklamalar)) {
      await sistem`insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id)
        values (${uuidv7()}, ${s.k.kurumId}, ${id}, ${ogr})`;
      await sistem`insert into ders.yoklamalar (id, kurum_id, ders_id, ogrenci_id, durum, gec_dakika,
        isaretleyen_id, isaretlenme_at)
        values (${uuidv7()}, ${s.k.kurumId}, ${id}, ${ogr}, ${durum}, ${durum === 'gec' ? 10 : null},
          ${ogretmenId}, ${bit})`;
    }
    for (const [ogr, deger] of Object.entries(geriBildirim)) {
      await sistem`insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger)
        values (${uuidv7()}, ${s.k.kurumId}, ${id}, ${ogr}, ${deger})`;
    }
    return id;
  }

  async function odev(
    s: Kurulum,
    grupId: string,
    verenId: string,
    baslik: string,
    gunOnce: number,
    satirlar: Record<string, 'atandi' | 'teslim_edildi' | 'incelendi'>,
  ) {
    const id = uuidv7();
    const son = await zaman(gunOnce, 21);
    await sistem`insert into ogrenme.odevler (id, kurum_id, baslik, brans_kodu, hedef_turu, hedef_id,
      veren_id, son_teslim_at, durum, yayin_at, fan_out_durum, atanan_sayisi)
      values (${id}, ${s.k.kurumId}, ${baslik}, 'matematik', 'grup', ${grupId}, ${verenId}, ${son},
        'yayinda', ${son}::timestamptz - interval '3 days', 'tamamlandi', ${Object.keys(satirlar).length})`;
    for (const [ogr, durum] of Object.entries(satirlar)) {
      await sistem`insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id, durum,
        son_teslim_at, teslim_at, incelendi_at)
        values (${uuidv7()}, ${s.k.kurumId}, ${id}, ${ogr}, ${durum}, ${son},
          ${durum === 'atandi' ? null : son}, ${durum === 'incelendi' ? son : null})`;
    }
  }

  async function plan(
    s: Kurulum,
    ogrenciId: string,
    hazirlayanId: string,
    gorevler: { durum: 'tamam' | 'yapilmadi' | 'devredildi' }[],
  ) {
    const planId = uuidv7();
    const [g] = await sistem<{ gun: string; hafta: string }[]>`
      select ((now() at time zone 'Europe/Istanbul')::date - 1)::text as gun,
        date_trunc('week', (now() at time zone 'Europe/Istanbul')::date - 1)::date::text as hafta`;
    await sistem`insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic,
      hazirlayan_id, durum, yayin_at) values (${planId}, ${s.k.kurumId}, ${ogrenciId}, ${g?.hafta ?? ''},
      ${hazirlayanId}, 'yayinda', now())`;
    for (const gorev of gorevler) {
      await sistem`insert into ogrenme.plan_gorevleri (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic,
        gun, brans_kodu, hedef_turu, hedef_miktar, durum, tamamlandi_at, ekleyen_id)
        values (${uuidv7()}, ${s.k.kurumId}, ${planId}, ${ogrenciId}, ${g?.hafta ?? ''}, ${g?.gun ?? ''},
          'matematik', 'soru', 10, ${gorev.durum}, ${gorev.durum === 'tamam' ? new Date() : null},
          ${hazirlayanId})`;
    }
  }

  async function soru(s: Kurulum, ogrenciId: string, cevapSn: number | null, cevaplayanId: string) {
    const olusma = await zaman(2, 12);
    await sistem`insert into ogrenme.sorular (id, kurum_id, created_at, ogrenci_id, brans_kodu, yonlendirme,
      durum, kota_donemi, son_hareket_at, ilk_cevap_at, ilk_cevaplayan_id)
      values (${uuidv7()}, ${s.k.kurumId}, ${olusma}, ${ogrenciId}, 'matematik', 'yonetici',
        ${cevapSn === null ? 'acik' : 'cevaplandi'}, ${olusma}::date, ${olusma},
        ${cevapSn === null ? null : sistem`${olusma}::timestamptz + make_interval(secs => ${cevapSn})`},
        ${cevapSn === null ? null : cevaplayanId})`;
  }

  async function tohumla(): Promise<Tohum> {
    const s = await y.kur({ ogrenciSayisi: 2 });
    const [o1, o2] = s.ogrenciler as [string, string];
    const t2 = await y.davetliUye(s.k, 'ogretmen');
    const g2 = (await y.grupAc(s.k, 'grup', 'Grup B')).id;
    await y.ata(s.k, g2, t2.uyelikId);
    const [o3 = '', o4 = ''] = await y.topluOgrenci(s.k.kurumId, 2, 'Diger');
    await y.gruba(s.k, g2, [o3]);
    const t1 = s.hoca.uyelikId;

    const dersG1 = await ders(
      s,
      s.grup.id,
      t1,
      1,
      { [o1]: 'geldi', [o2]: 'gelmedi' },
      { [o1]: 'anladim' },
    );
    const dersG2 = await ders(
      s,
      g2,
      t2.uyelikId,
      2,
      { [o3]: 'gec' },
      {
        [o3]: 'kismen',
      },
    );

    await odev(s, s.grup.id, t1, 'Ödev 1', 1, { [o1]: 'teslim_edildi', [o2]: 'atandi' });
    await odev(s, s.grup.id, t1, 'Gelecek ödev', -1, { [o1]: 'atandi', [o2]: 'atandi' });
    await odev(s, s.grup.id, t1, 'Eski ödev', 40, { [o1]: 'atandi', [o2]: 'atandi' });
    await odev(s, g2, t2.uyelikId, 'Ödev 2', 1, { [o3]: 'incelendi' });

    await plan(s, o1, t1, [{ durum: 'tamam' }, { durum: 'tamam' }, { durum: 'yapilmadi' }]);
    await plan(s, o3, t2.uyelikId, [{ durum: 'tamam' }, { durum: 'devredildi' }]);

    await soru(s, o1, 600, t1);
    await soru(s, o2, 1800, t1);
    await soru(s, o3, null, t1);

    return { s, t2, g2, o: [o1, o2, o3, o4], dersG1, dersG2 };
  }

  const al = (s: Kurulum, token: string, modul: string, yol: string) =>
    y.app.inject({
      url: `/v1/${modul}/kurumlar/${s.k.kurumId}/rapor/${yol}`,
      headers: bearer(token),
    });
  const json = async <T>(s: Kurulum, token: string, modul: string, yol: string): Promise<T> => {
    const res = await al(s, token, modul, yol);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<T>();
  };

  let tohum: Tohum;
  beforeAll(async () => {
    if (!urls) return;
    tohum = await tohumla();
  }, 60_000);

  describe('gostergeler (sahip, kurum kapsami)', () => {
    it('hesap: aktif ogrenci ile grup ve ogretmen dizini', async () => {
      const { s, g2 } = tohum;
      const h = await json<Hesap>(s, s.k.token, 'hesap', 'ozet');
      expect(h.donem_gun).toBe(7);
      expect(h.kapsam).toBe('kurum');
      expect(h.kurum).toEqual({ aktif_ogrenci: 4, grup_sayisi: 2, ogretmen_sayisi: 2 });
      expect(h.gruplar.map((g) => [g.ad, g.aktif_ogrenci]).sort()).toEqual([
        ['Grup A', 2],
        ['Grup B', 1],
      ]);
      expect(h.gruplar.find((g) => g.grup_id === g2)?.aktif_ogrenci).toBe(1);
      expect(h.ogretmenler.map((o) => [o.grup_sayisi, o.aktif_ogrenci]).sort()).toEqual([
        [1, 1],
        [1, 2],
      ]);
    });

    it('ders: devam ve anladim oranlari, grup ve ogretmen kirilimi', async () => {
      const { s, g2, t2 } = tohum;
      const d = await json<Ders>(s, s.k.token, 'ders', 'ozet');
      expect(d.kurum.devam).toEqual({ pay: 2, payda: 3, oran: 0.6667 });
      expect(d.kurum.anladim).toEqual({ pay: 1, payda: 2, oran: 0.5 });
      const g1 = d.gruplar.find((g) => g.grup_id === s.grup.id);
      expect(g1?.devam).toEqual({ pay: 1, payda: 2, oran: 0.5 });
      expect(g1?.anladim).toEqual({ pay: 1, payda: 1, oran: 1 });
      expect(d.gruplar.find((g) => g.grup_id === g2)?.devam).toEqual({
        pay: 1,
        payda: 1,
        oran: 1,
      });
      expect(d.ogretmenler.find((o) => o.ogretmen_id === s.hoca.uyelikId)?.devam).toEqual({
        pay: 1,
        payda: 2,
        oran: 0.5,
      });
      expect(d.ogretmenler.find((o) => o.ogretmen_id === t2.uyelikId)?.anladim).toEqual({
        pay: 0,
        payda: 1,
        oran: 0,
      });
    });

    it('ogrenme: odev, plan, soru ve etkin ogrenci', async () => {
      const { s, g2, t2 } = tohum;
      const o = await json<Ogrenme>(s, s.k.token, 'ogrenme', 'ozet');
      expect(o.kurum.odev).toEqual({ pay: 2, payda: 3, oran: 0.6667 });
      expect(o.kurum.plan).toEqual({ pay: 3, payda: 4, oran: 0.75 });
      expect(o.kurum.soru).toEqual({
        soru_sayisi: 3,
        cevaplanan: 2,
        ortalama_ilk_cevap_sn: 1200,
        medyan_ilk_cevap_sn: 1200,
      });
      expect(o.kurum.etkin_ogrenci).toBe(3);
      expect(o.gruplar.find((g) => g.grup_id === s.grup.id)?.odev).toEqual({
        pay: 1,
        payda: 2,
        oran: 0.5,
      });
      expect(o.gruplar.find((g) => g.grup_id === g2)?.odev).toEqual({ pay: 1, payda: 1, oran: 1 });
      expect(o.gruplar.find((g) => g.grup_id === g2)?.etkin_ogrenci).toBe(1);
      expect(o.ogretmenler.find((x) => x.ogretmen_id === t2.uyelikId)?.plan).toEqual({
        pay: 1,
        payda: 1,
        oran: 1,
      });
      expect(o.ogretmenler.find((x) => x.ogretmen_id === s.hoca.uyelikId)?.soru).toMatchObject({
        cevaplanan: 2,
        ortalama_ilk_cevap_sn: 1200,
      });
    });

    it('donem 30 gun: eski odev (40 gun once) yine disarida; donem 7 gunde dunku veriler icerde', async () => {
      const { s } = tohum;
      const o = await json<Ogrenme>(s, s.k.token, 'ogrenme', 'ozet?donem=30');
      expect(o.donem_gun).toBe(30);
      expect(o.kurum.odev?.payda).toBe(3);
    });

    it('gecersiz donem 400', async () => {
      const { s } = tohum;
      expect((await al(s, s.k.token, 'ders', 'ozet?donem=14')).statusCode).toBe(400);
    });
  });

  describe('alt listeler', () => {
    it('odev: teslim edilmeyen satirlar; grup ve ogretmen suzgeci', async () => {
      const { s, g2, o } = tohum;
      const l = await json<z.infer<typeof RaporOdevListeSema>>(s, s.k.token, 'ogrenme', 'odev');
      expect(l.toplam_satir).toBe(1);
      expect(l.satirlar[0]).toMatchObject({ ogrenci_id: o[1], baslik: 'Ödev 1', durum: 'atandi' });
      expect(l.satirlar[0]?.gorunen_ad).toBeTruthy();
      const g = await json<z.infer<typeof RaporOdevListeSema>>(
        s,
        s.k.token,
        'ogrenme',
        `odev?grup_id=${g2}`,
      );
      expect(g.toplam_satir).toBe(0);
    });

    it('devam: en dusuk devam once, ayrinti sayilari', async () => {
      const { s, o } = tohum;
      const l = await json<z.infer<typeof RaporOgrenciOraniListeSema>>(
        s,
        s.k.token,
        'ders',
        'devam',
      );
      expect(l.toplam_satir).toBe(3);
      expect(l.satirlar[0]).toMatchObject({
        ogrenci_id: o[1],
        pay: 0,
        payda: 1,
        ayrinti: { geldi: 0, gec: 0, gelmedi: 1, izinli: 0 },
      });
    });

    it('anladim, plan ve soru listeleri', async () => {
      const { s, o } = tohum;
      const a = await json<z.infer<typeof RaporOgrenciOraniListeSema>>(
        s,
        s.k.token,
        'ders',
        'anladim',
      );
      expect(a.satirlar.map((r) => r.ogrenci_id)).toEqual([o[2], o[0]]);
      const p = await json<z.infer<typeof RaporOgrenciOraniListeSema>>(
        s,
        s.k.token,
        'ogrenme',
        'plan',
      );
      expect(p.satirlar[0]).toMatchObject({
        ogrenci_id: o[0],
        pay: 2,
        payda: 3,
        ayrinti: { tamam: 2, yapilmadi: 1 },
      });
      const q = await json<z.infer<typeof RaporSoruListeSema>>(s, s.k.token, 'ogrenme', 'soru');
      expect(q.toplam_satir).toBe(3);
      expect(q.satirlar[0]).toMatchObject({ ogrenci_id: o[2], ilk_cevap_sn: null });
    });

    it('hesap ogrenci listesi: tum aktif, grup ve ogretmen suzgeci', async () => {
      const { s, g2, t2, o } = tohum;
      const hepsi = await json<HesapOgrenciler>(s, s.k.token, 'hesap', 'ogrenciler');
      expect(hepsi.toplam_satir).toBe(4);
      const grup = await json<HesapOgrenciler>(s, s.k.token, 'hesap', `ogrenciler?grup_id=${g2}`);
      expect(grup.satirlar.map((r) => r.ogrenci_id)).toEqual([o[2]]);
      expect(grup.satirlar[0]?.gruplar).toEqual(['Grup B']);
      const hoca = await json<HesapOgrenciler>(
        s,
        s.k.token,
        'hesap',
        `ogrenciler?ogretmen_id=${t2.uyelikId}`,
      );
      expect(hoca.toplam_satir).toBe(1);
    });
  });

  describe('kapsam, izin ve kiraci izolasyonu', () => {
    it('ogretmen yalniz atandigi grubu gorur; baska grup suzgeci bos doner', async () => {
      const { s, g2, o } = tohum;
      const d = await json<Ders>(s, s.hoca.token, 'ders', 'ozet');
      expect(d.kapsam).toBe('grup');
      expect(d.kurum.devam).toEqual({ pay: 1, payda: 2, oran: 0.5 });
      expect(d.gruplar.map((g) => g.grup_id)).toEqual([s.grup.id]);
      const h = await json<Hesap>(s, s.hoca.token, 'hesap', 'ozet');
      expect(h.kurum.aktif_ogrenci).toBe(2);
      expect(h.gruplar.map((g) => g.grup_id)).toEqual([s.grup.id]);
      const od = await json<Ogrenme>(s, s.hoca.token, 'ogrenme', 'ozet');
      expect(od.kurum.etkin_ogrenci).toBe(2);
      expect(od.kurum.soru?.soru_sayisi).toBe(2);
      const baska = await json<z.infer<typeof RaporOgrenciOraniListeSema>>(
        s,
        s.hoca.token,
        'ders',
        `devam?grup_id=${g2}`,
      );
      expect(baska.toplam_satir).toBe(0);
      const ogrListe = await json<HesapOgrenciler>(s, s.hoca.token, 'hesap', 'ogrenciler');
      expect(ogrListe.satirlar.map((r) => r.ogrenci_id).sort()).toEqual([o[0], o[1]].sort());
    });

    it('ogrenci ve gruba atanmamis ogretmen izin_yok / bos', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await k.ogrenciEkle(s);
      for (const modul of ['hesap', 'ders', 'ogrenme']) {
        const res = await al(s, ogr.token, modul, 'ozet');
        expect(res.statusCode, modul).toBe(403);
      }
      const yeniHoca = await y.davetliUye(s.k, 'ogretmen');
      const bos = await json<Ders>(s, yeniHoca.token, 'ders', 'ozet');
      expect(bos.kurum.devam).toEqual({ pay: 0, payda: 0, oran: null });
      expect(bos.gruplar).toEqual([]);
    });

    it('baska kurumun verisi gorunmez ve kurum_id uyusmazligi 403', async () => {
      const { s } = tohum;
      const b = await y.kur({ ogrenciSayisi: 1 });
      const kendi = await json<Hesap>(b, b.k.token, 'hesap', 'ozet');
      expect(kendi.kurum.aktif_ogrenci).toBe(1);
      expect(kendi.gruplar.map((g) => g.grup_id)).toEqual([b.grup.id]);
      const dB = await json<Ders>(b, b.k.token, 'ders', 'ozet');
      expect(dB.kurum.devam).toEqual({ pay: 0, payda: 0, oran: null });
      const oB = await json<Ogrenme>(b, b.k.token, 'ogrenme', 'ozet');
      expect(oB.kurum.soru?.soru_sayisi).toBe(0);
      expect(oB.kurum.etkin_ogrenci).toBe(0);
      // B'nin sahibi A'nin raporunu isteyemez.
      for (const modul of ['hesap', 'ders', 'ogrenme']) {
        const res = await y.app.inject({
          url: `/v1/${modul}/kurumlar/${s.k.kurumId}/rapor/ozet`,
          headers: bearer(b.k.token),
        });
        expect(res.statusCode, modul).toBe(403);
      }
      // A'nin grup kimligi B'nin listesinde sonuc vermez.
      const l = await json<z.infer<typeof RaporOgrenciOraniListeSema>>(
        b,
        b.k.token,
        'ders',
        `devam?grup_id=${s.grup.id}`,
      );
      expect(l.toplam_satir).toBe(0);
    });
  });

  describe('modul kapali ve Excel', () => {
    it('modul kapaliysa gosterge null, alt liste 403 modul_kapali', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      await k.modulKapat(s, 'odev');
      await k.modulKapat(s, 'yoklama');
      const o = await json<Ogrenme>(s, s.k.token, 'ogrenme', 'ozet');
      expect(o.kurum.odev).toBeNull();
      expect(o.kurum.plan).not.toBeNull();
      const d = await json<Ders>(s, s.k.token, 'ders', 'ozet');
      expect(d.kurum.devam).toBeNull();
      expect(d.kurum.anladim).not.toBeNull();
      const l = await al(s, s.k.token, 'ogrenme', 'odev');
      expect(l.statusCode).toBe(403);
      expect(l.json<{ error: { code: string } }>().error.code).toBe('modul_kapali');
    });

    it('Excel: gercek .xlsx, panelle ayni sayilar, ogretmene yalniz kendi gruplari', async () => {
      const { s } = tohum;
      const res = await al(s, s.k.token, 'ogrenme', 'disa-aktar?donem=7');
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      const kitap = new ExcelJS.Workbook();
      await kitap.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
      expect(kitap.worksheets.map((w) => w.name)).toEqual([
        'Kurum özeti',
        'Gruplar',
        'Öğretmenler',
      ]);
      const ozet = kitap.getWorksheet('Kurum özeti');
      const deger = (ad: string) => {
        let v: unknown;
        ozet?.eachRow((r) => {
          if (r.getCell(1).value === ad) v = r.getCell(2).value;
        });
        return v;
      };
      expect(deger('Aktif öğrenci')).toBe(4);
      expect(deger('Devam oranı')).toBeCloseTo(0.6667, 4);
      expect(deger('Plan tamamlama oranı')).toBe(0.75);
      expect(deger('Soru sayısı')).toBe(3);
      const gruplar = kitap.getWorksheet('Gruplar');
      expect(gruplar?.rowCount).toBe(3);
      const hocaRes = await al(s, s.hoca.token, 'ogrenme', 'disa-aktar');
      expect(hocaRes.statusCode).toBe(200);
      const hocaKitap = new ExcelJS.Workbook();
      await hocaKitap.xlsx.load(hocaRes.rawPayload as unknown as ArrayBuffer);
      expect(hocaKitap.getWorksheet('Gruplar')?.rowCount).toBe(2);
      const s2 = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await k.ogrenciEkle(s2);
      expect((await al(s2, ogr.token, 'ogrenme', 'disa-aktar')).statusCode).toBe(403);
    });
  });
});
