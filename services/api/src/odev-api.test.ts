import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface OdevJson {
  id: string;
  baslik: string;
  durum: string;
  tur: string;
  kaynak: string | null;
  fan_out_durum: string;
  atanan_sayisi: number;
  veren_id: string;
  hedef_turu: string;
  surum: number;
}
interface SatirJson {
  id: string;
  odev_id: string;
  durum: string;
  gec_teslim: boolean;
  yapilan_soru_sayisi: number | null;
  dogru_sayisi: number | null;
  inceleme_sonucu: string | null;
  inceleme_notu: string | null;
  ogrenci_notu: string | null;
}
interface OzetJson {
  odev: OdevJson;
  sayilar: Record<string, number | null>;
  ogrenciler: {
    ogrenci_odev_id: string;
    ogrenci_id: string;
    gorunen_ad: string | null;
    durum: string;
    gec_teslim: boolean;
    dogru_orani: number | null;
  }[];
}

const YASAK_ALANLAR = [
  'baslik',
  'gorunen_ad',
  'ad',
  'telefon',
  'telefon_e164',
  'eposta',
  'not',
  'ogrenci_notu',
  'inceleme_notu',
  'aciklama',
];

describe.skipIf(dbYok())('odev API: yayin, fan-out, teslim, inceleme, sablon', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const api = (kurumId: string, yol: string) => `/v1/ogrenme/kurumlar/${kurumId}${yol}`;
  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;
  const yarin = () => new Date(Date.now() + 86_400_000).toISOString();

  const istek = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    kurumId: string,
    token: string,
    yol: string,
    payload?: unknown,
  ) =>
    y.app.inject({
      method,
      url: api(kurumId, yol),
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const govde = (s: Kurulum, ek: Record<string, unknown> = {}) => ({
    baslik: 'Turev test 4',
    brans_kodu: 'matematik',
    tur: 'soru',
    kaynak: 'X Yayinlari Test 4',
    hedef_turu: 'grup',
    hedef_id: s.grup.id,
    son_teslim_at: yarin(),
    hedef_soru_sayisi: 20,
    ...ek,
  });

  /** Ogretmen adina odev olusturup yayinlar. */
  async function yayinda(s: Kurulum, ek: Record<string, unknown> = {}, token = s.hoca.token) {
    const olustur = await istek('POST', s.k.kurumId, token, '/odevler', govde(s, ek));
    expect(olustur.statusCode, olustur.body).toBe(201);
    const o = olustur.json<OdevJson>();
    const yayin = await istek('POST', s.k.kurumId, token, `/odevler/${o.id}/yayinla`, {});
    expect(yayin.statusCode, yayin.body).toBe(200);
    return yayin.json<OdevJson>();
  }

  const olaylar = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject} order by created_at, id`;

  const satirSayisi = async (odevId: string) => {
    const [r] = await sistem<{ n: number }[]>`
      select count(*)::int n from ogrenme.ogrenci_odevleri where odev_id = ${odevId}`;
    return r?.n ?? 0;
  };

  /** Girisli ogrenci (grup uyesi). */
  async function girisliOgrenci(s: Kurulum): Promise<Uye> {
    const o = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [o.uyelikId]);
    return o;
  }

  const satirBul = async (odevId: string, ogrenciId: string) => {
    const [r] = await sistem<{ id: string }[]>`
      select id from ogrenme.ogrenci_odevleri where odev_id = ${odevId} and ogrenci_id = ${ogrenciId}`;
    if (!r) throw new Error('ogrenci satiri yok');
    return r.id;
  };

  describe('olusturma ve yetki', () => {
    it('taslak olusturur; tur/kaynak yazilir; ogretmen kendi gruplarina verir, baskasina 404', async () => {
      const s = await y.kur();
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s));
      expect(res.statusCode, res.body).toBe(201);
      const o = res.json<OdevJson>();
      expect(o).toMatchObject({
        durum: 'taslak',
        tur: 'soru',
        kaynak: 'X Yayinlari Test 4',
        fan_out_durum: 'bekliyor',
        atanan_sayisi: 0,
        veren_id: s.hoca.uyelikId,
      });
      // atanmadigi grup: kapsam disi 404
      const baska = await y.grupAc(s.k, 'grup', 'Grup B');
      const disari = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/odevler',
        govde(s, { hedef_id: baska.id }),
      );
      expect(disari.statusCode).toBe(404);
      // yonetici (sahip) her gruba verebilir
      const sahip = await istek(
        'POST',
        s.k.kurumId,
        s.k.token,
        '/odevler',
        govde(s, { hedef_id: baska.id }),
      );
      expect(sahip.statusCode, sahip.body).toBe(201);
    });

    it('kademe ve kurum hedefi ogretmene 403, sahibe serbest; gecersiz tur 400', async () => {
      const s = await y.kur();
      const kurumHedef = { hedef_turu: 'kurum', hedef_id: undefined };
      const ogretmen = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/odevler',
        govde(s, kurumHedef),
      );
      expect(ogretmen.statusCode).toBe(403);
      const sahip = await istek('POST', s.k.kurumId, s.k.token, '/odevler', govde(s, kurumHedef));
      expect(sahip.statusCode, sahip.body).toBe(201);
      expect(sahip.json<OdevJson>().hedef_turu).toBe('kurum');
      const kademe = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/odevler',
        govde(s, { hedef_turu: 'kademe', hedef_id: uuidv7() }),
      );
      expect(kademe.statusCode).toBe(403);
      const tur = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/odevler',
        govde(s, { tur: 'x' }),
      );
      expect(tur.statusCode).toBe(400);
    });

    it('taslak guncellenir, yayindaki guncellenemez (409), eski surum 409', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const olustur = await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s));
      const o = olustur.json<OdevJson>();
      const eski = await istek('PATCH', s.k.kurumId, s.hoca.token, `/odevler/${o.id}`, {
        baslik: 'Yeni',
        surum: o.surum + 5,
      });
      expect(eski.statusCode).toBe(409);
      const ok = await istek('PATCH', s.k.kurumId, s.hoca.token, `/odevler/${o.id}`, {
        baslik: 'Yeni baslik',
        tur: 'sayfa',
        kaynak: null,
        surum: o.surum,
      });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json<OdevJson>()).toMatchObject({
        baslik: 'Yeni baslik',
        tur: 'sayfa',
        kaynak: null,
      });
      await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/yayinla`, {});
      const yayindaki = await istek('PATCH', s.k.kurumId, s.hoca.token, `/odevler/${o.id}`, {
        baslik: 'Degismez',
      });
      expect(yayindaki.statusCode).toBe(409);
      expect(hataKodu(yayindaki)).toBe('odev_taslak_degil');
    });

    it('ogrenci odev olusturamaz (403)', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ogr = await girisliOgrenci(s);
      const res = await istek('POST', s.k.kurumId, ogr.token, '/odevler', govde(s));
      expect(res.statusCode).toBe(403);
    });
  });

  describe('yayin ve fan-out', () => {
    it('yayin: ogrenci satirlari, atanan_sayisi, fan_out tamamlandi, tek olay (kisisel veri yok), denetim', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const o = await yayinda(s, { baslik: 'Gizli Ayse baslik', aciklama: 'ozel aciklama' });
      expect(o).toMatchObject({ durum: 'yayinda', fan_out_durum: 'tamamlandi', atanan_sayisi: 3 });
      expect(await satirSayisi(o.id)).toBe(3);
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.yayinlandi.v1');
      expect(olay).toHaveLength(1);
      const veri = olay[0]?.payload.data ?? {};
      expect(veri).toMatchObject({
        odev_id: o.id,
        parca_no: 1,
        parca_sayisi: 1,
        hedef_turu: 'grup',
      });
      expect((veri.ogrenci_idleri as string[]).sort()).toEqual([...s.ogrenciler].sort());
      for (const alan of YASAK_ALANLAR) expect(veri).not.toHaveProperty(alan);
      expect(JSON.stringify(olay)).not.toContain('Gizli Ayse');
      const [d] = await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.denetim_kayitlari
        where kurum_id = ${s.k.kurumId} and eylem = 'odev.yayinla' and hedef_id = ${o.id}`;
      expect(d?.n).toBe(1);
    });

    it('iki kez yayin yeni satir ve olay yaratmaz (idempotent)', async () => {
      const s = await y.kur({ ogrenciSayisi: 4 });
      const o = await yayinda(s);
      const tekrar = await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/yayinla`, {});
      expect(tekrar.statusCode).toBe(200);
      expect(tekrar.json<OdevJson>().atanan_sayisi).toBe(4);
      expect(await satirSayisi(o.id)).toBe(4);
      expect(await olaylar(s.k.kurumId, 'evt.ogrenme.odev.yayinlandi.v1')).toHaveLength(1);
    });

    it('250 ogrenci: 500luk fan-out tek islemde, olay 200+50 parcalanir', async () => {
      const s = await y.kur({ ogrenciSayisi: 250 });
      const o = await yayinda(s);
      expect(o.atanan_sayisi).toBe(250);
      expect(await satirSayisi(o.id)).toBe(250);
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.yayinlandi.v1');
      expect(olay).toHaveLength(2);
      const parcalar = olay.map((e) => e.payload.data);
      expect(
        parcalar.map((p) => (p.ogrenci_idleri as string[]).length).sort((a, b) => a - b),
      ).toEqual([50, 200]);
      expect(new Set(parcalar.map((p) => p.parca_sayisi))).toEqual(new Set([2]));
      expect(parcalar.map((p) => p.parca_no).sort()).toEqual([1, 2]);
      const hepsi = parcalar.flatMap((p) => p.ogrenci_idleri as string[]);
      expect(new Set(hepsi).size).toBe(250);
    });

    it('ogrenci hedefi tek satir; kademe ve kurum hedefi sahip tarafindan fan-out edilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const tek = await yayinda(s, { hedef_turu: 'ogrenci', hedef_id: s.ogrenciler[0] });
      expect(tek.atanan_sayisi).toBe(1);
      const kurum = await yayinda(s, { hedef_turu: 'kurum', hedef_id: undefined }, s.k.token);
      expect(kurum.atanan_sayisi).toBe(3);
      const [kademe] = await sistem<{ id: string }[]>`
        insert into hesap.kademeler (id, kurum_id, ad) values (${uuidv7()}, ${s.k.kurumId}, 'Lise 12') returning id`;
      await sistem`update hesap.uyelikler set kademe_id = ${kademe?.id ?? ''} where id = ${s.ogrenciler[1] ?? ''}`;
      const k = await yayinda(s, { hedef_turu: 'kademe', hedef_id: kademe?.id }, s.k.token);
      expect(k.atanan_sayisi).toBe(1);
    });

    it('gecmis son teslim tarihli taslak yayinlanamaz (422)', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const olustur = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/odevler',
        govde(s, { son_teslim_at: new Date(Date.now() - 3_600_000).toISOString() }),
      );
      const o = olustur.json<OdevJson>();
      const res = await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/yayinla`, {});
      expect(res.statusCode).toBe(422);
    });

    it('atama-esitle: sonradan katilana satir acar; ikinci cagri yeni satir yaratmaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const o = await yayinda(s);
      const [yeni] = await y.topluOgrenci(s.k.kurumId, 1, 'Sonradan');
      await y.gruba(s.k, s.grup.id, [yeni ?? '']);
      const bir = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/odevler/${o.id}/atama-esitle`,
        {},
      );
      expect(bir.statusCode, bir.body).toBe(200);
      expect(bir.json()).toMatchObject({ eklenen: 1, yeniden_acilan: 0, atanan_sayisi: 3 });
      const iki = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/odevler/${o.id}/atama-esitle`,
        {},
      );
      expect(iki.json()).toMatchObject({ eklenen: 0, yeniden_acilan: 0, atanan_sayisi: 3 });
      expect(await satirSayisi(o.id)).toBe(3);
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.yayinlandi.v1');
      expect(olay).toHaveLength(2);
      expect(olay[1]?.payload.data.ogrenci_idleri).toEqual([yeni]);
      const [g] = await sistem<{ atanan_sayisi: number }[]>`
        select atanan_sayisi from ogrenme.odevler where id = ${o.id}`;
      expect(g?.atanan_sayisi).toBe(3);
    });

    it('atama-esitle taslakta 409', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const olustur = await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s));
      const res = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/odevler/${olustur.json<OdevJson>().id}/atama-esitle`,
        {},
      );
      expect(res.statusCode).toBe(409);
    });
  });

  describe('teslim', () => {
    it('teslim: durum, sayilar, olay (not yok), yalniz kendi satiri; ikinci teslim 409', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ogr = await girisliOgrenci(s);
      const diger = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const baskasi = await istek(
        'POST',
        s.k.kurumId,
        diger.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 5,
        },
      );
      expect(baskasi.statusCode).toBe(404);
      const asiri = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 10,
          dogru_sayisi: 8,
          yanlis_sayisi: 3,
        },
      );
      expect(asiri.statusCode).toBe(422);
      const res = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 20,
          dogru_sayisi: 15,
          yanlis_sayisi: 3,
          bos_sayisi: 2,
          ogrenci_notu: 'Ozel ogrenci notu zor soru',
        },
      );
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<SatirJson>()).toMatchObject({
        durum: 'teslim_edildi',
        gec_teslim: false,
        dogru_sayisi: 15,
      });
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.teslim_edildi.v1');
      expect(olay).toHaveLength(1);
      const veri = olay[0]?.payload.data ?? {};
      expect(veri).toMatchObject({
        ogrenci_odev_id: satirId,
        ogrenci_id: ogr.uyelikId,
        yapilan_soru_sayisi: 20,
        gec_teslim: false,
        yeniden_teslim: false,
        dosya_sayisi: 0,
      });
      for (const alan of YASAK_ALANLAR) expect(veri).not.toHaveProperty(alan);
      expect(JSON.stringify(olay)).not.toContain('Ozel ogrenci notu');
      const tekrar = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 20,
        },
      );
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('teslim_durumu_gecersiz');
    });

    it('gec_teslim sunucuda: son teslim gecmisse isaretlenir', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const o = await yayinda(s);
      const gecmis = new Date(Date.now() - 3_600_000);
      await sistem`update ogrenme.ogrenci_odevleri set son_teslim_at = ${gecmis} where odev_id = ${o.id}`;
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const res = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 5,
        },
      );
      expect(res.json<SatirJson>().gec_teslim).toBe(true);
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.teslim_edildi.v1');
      expect(olay[0]?.payload.data.gec_teslim).toBe(true);
    });

    it('kapali odevde teslim 409 odev_kapali; kapat idempotent', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const kapat = await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/kapat`, {});
      expect(kapat.json<OdevJson>().durum).toBe('kapali');
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/kapat`, {})).statusCode,
      ).toBe(200);
      const res = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 1,
        },
      );
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('odev_kapali');
      const yayin = await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/yayinla`, {});
      expect(yayin.statusCode).toBe(409);
    });

    it('taslak odevin kapatilmasi 409; ogretmen baskasinin odevini kapatamaz (403)', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, hoca2.uyelikId);
      const taslak = await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s));
      const id = taslak.json<OdevJson>().id;
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, `/odevler/${id}/kapat`, {})).statusCode,
      ).toBe(409);
      const baskasi = await istek('POST', s.k.kurumId, hoca2.token, `/odevler/${id}/yayinla`, {});
      expect(baskasi.statusCode).toBe(403);
    });
  });

  describe('inceleme', () => {
    async function teslimEdilmis() {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const teslim = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 10,
          dogru_sayisi: 7,
        },
      );
      expect(teslim.statusCode, teslim.body).toBe(200);
      return { s, ogr, o, satirId };
    }

    it('tamam -> incelendi, olay (not yok), ogrenci kendi sonucunu gorur; tekrar incelenemez (409)', async () => {
      const { s, ogr, o, satirId } = await teslimEdilmis();
      const res = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'tamam',
          not: 'Cok iyi, ozel yorum',
        },
      );
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<SatirJson>()).toMatchObject({ durum: 'incelendi', inceleme_sonucu: 'tamam' });
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.incelendi.v1');
      expect(olay).toHaveLength(1);
      const veri = olay[0]?.payload.data ?? {};
      expect(veri).toMatchObject({
        ogrenci_odev_id: satirId,
        odev_id: o.id,
        ogrenci_id: ogr.uyelikId,
        inceleyen_id: s.hoca.uyelikId,
        inceleme_sonucu: 'tamam',
      });
      for (const alan of YASAK_ALANLAR) expect(veri).not.toHaveProperty(alan);
      expect(JSON.stringify(olay)).not.toContain('ozel yorum');
      const listem = await istek('GET', s.k.kurumId, ogr.token, '/odevlerim');
      const kendi = listem.json<{ odevler: SatirJson[] }>().odevler[0];
      expect(kendi?.inceleme_notu).toBe('Cok iyi, ozel yorum');
      const tekrar = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'eksik',
        },
      );
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('inceleme_durumu_gecersiz');
    });

    it('tekrar -> tekrar_istendi; ogrenci yeniden teslim eder (yeniden_teslim, inceleme temizlenir)', async () => {
      const { s, ogr, satirId } = await teslimEdilmis();
      const res = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'tekrar',
          not: 'Son 3 soruyu tekrar coz',
        },
      );
      expect(res.json<SatirJson>().durum).toBe('tekrar_istendi');
      const yeniden = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 10,
          dogru_sayisi: 9,
        },
      );
      expect(yeniden.statusCode, yeniden.body).toBe(200);
      expect(yeniden.json<SatirJson>()).toMatchObject({
        durum: 'teslim_edildi',
        inceleme_sonucu: null,
        inceleme_notu: null,
        dogru_sayisi: 9,
      });
      const olay = await olaylar(s.k.kurumId, 'evt.ogrenme.odev.teslim_edildi.v1');
      expect(olay.map((e) => e.payload.data.yeniden_teslim)).toEqual([false, true]);
    });

    it('teslim edilmemis satir incelenemez (409); ogrenci inceleyemez (403)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const bos = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'tamam',
        },
      );
      expect(bos.statusCode).toBe(409);
      const ogrenci = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'tamam',
        },
      );
      expect(ogrenci.statusCode).toBe(403);
    });

    it('ayni gruptaki baska ogretmen gorur ama degistiremez/inceleyemez (403); grubu olmayan ogretmen 404', async () => {
      const { s, satirId, o } = await teslimEdilmis();
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, hoca2.uyelikId, 'fizik');
      const disari = await y.davetliUye(s.k, 'ogretmen');
      const ozet2 = await istek('GET', s.k.kurumId, hoca2.token, `/odevler/${o.id}/ozet`);
      expect(ozet2.statusCode, ozet2.body).toBe(200);
      const inceleme = await istek(
        'POST',
        s.k.kurumId,
        hoca2.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'tamam',
        },
      );
      expect(inceleme.statusCode).toBe(403);
      const kapat = await istek('POST', s.k.kurumId, hoca2.token, `/odevler/${o.id}/kapat`, {});
      expect(kapat.statusCode).toBe(403);
      // listede yalniz kendi odevleri
      const liste = await istek('GET', s.k.kurumId, hoca2.token, '/odevler');
      expect(liste.json<{ odevler: OdevJson[] }>().odevler).toHaveLength(0);
      // atamasi olmayan ogretmen odevi hic goremez
      expect((await istek('GET', s.k.kurumId, disari.token, `/odevler/${o.id}`)).statusCode).toBe(
        404,
      );
      expect(
        (
          await istek('POST', s.k.kurumId, disari.token, `/ogrenci-odevleri/${satirId}/inceleme`, {
            sonuc: 'tamam',
          })
        ).statusCode,
      ).toBe(404);
      // yonetici (sahip) kapsamindaki her odevi inceleyebilir
      const sahip = await istek(
        'POST',
        s.k.kurumId,
        s.k.token,
        `/ogrenci-odevleri/${satirId}/inceleme`,
        {
          sonuc: 'eksik',
        },
      );
      expect(sahip.statusCode, sahip.body).toBe(200);
    });
  });

  describe('gorunurluk ve liste', () => {
    it('ogrenci yalniz kendi satirini gorur; ogretmen uclari ogrenciye 403', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const a = await girisliOgrenci(s);
      const b = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirA = await satirBul(o.id, a.uyelikId);
      const satirB = await satirBul(o.id, b.uyelikId);
      await istek('POST', s.k.kurumId, b.token, `/ogrenci-odevleri/${satirB}/teslim`, {
        yapilan_soru_sayisi: 4,
        dogru_sayisi: 4,
        ogrenci_notu: 'b nin notu',
      });
      const liste = await istek('GET', s.k.kurumId, a.token, '/odevlerim');
      expect(liste.statusCode, liste.body).toBe(200);
      const satirlar = liste.json<{ odevler: SatirJson[] }>().odevler;
      expect(satirlar.map((r) => r.id)).toEqual([satirA]);
      expect(liste.body).not.toContain('b nin notu');
      expect(liste.body).not.toContain(satirB);
      for (const [yontem, yol] of [
        ['GET', '/odevler'],
        ['GET', `/odevler/${o.id}`],
        ['GET', `/odevler/${o.id}/ozet`],
      ] as const) {
        const res = await istek(yontem, s.k.kurumId, a.token, yol);
        expect(res.statusCode, yol).toBe(403);
      }
      // ogretmen /odevlerim kullanamaz
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/odevlerim')).statusCode).toBe(403);
    });

    it('taslak odev ogrenciye gorunmez; sayfalama ve durum suzgeci', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s, { baslik: 'taslak' }));
      for (let i = 0; i < 3; i++) await yayinda(s, { baslik: `O ${String(i)}` });
      const ogrListe = await istek('GET', s.k.kurumId, ogr.token, '/odevlerim');
      expect(ogrListe.json<{ odevler: unknown[] }>().odevler).toHaveLength(3);
      const sayfa1 = await istek('GET', s.k.kurumId, s.hoca.token, '/odevler?limit=2');
      const j1 = sayfa1.json<{ odevler: OdevJson[]; sonraki_imlec: string | null }>();
      expect(j1.odevler).toHaveLength(2);
      expect(j1.sonraki_imlec).not.toBeNull();
      const sayfa2 = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/odevler?limit=2&imlec=${j1.sonraki_imlec ?? ''}`,
      );
      const j2 = sayfa2.json<{ odevler: OdevJson[]; sonraki_imlec: string | null }>();
      expect(j2.odevler).toHaveLength(2);
      expect(j2.sonraki_imlec).toBeNull();
      const taslaklar = await istek('GET', s.k.kurumId, s.hoca.token, '/odevler?durum=taslak');
      expect(taslaklar.json<{ odevler: OdevJson[] }>().odevler).toHaveLength(1);
      const sahip = await istek('GET', s.k.kurumId, s.k.token, '/odevler?limit=200');
      expect(sahip.json<{ odevler: OdevJson[] }>().odevler).toHaveLength(4);
    });

    it('ozet: 30 kisilik sinif tek istekte; sayilar, ad, dogru orani', async () => {
      const s = await y.kur({ ogrenciSayisi: 30 });
      const o = await yayinda(s);
      // 3 ogrenci teslim eder (sistem yoluyla), 1 i incelenir
      const [a, b, c] = s.ogrenciler as [string, string, string];
      await sistem`update ogrenme.ogrenci_odevleri set durum = 'teslim_edildi', teslim_at = now(),
        yapilan_soru_sayisi = 10, dogru_sayisi = 8 where odev_id = ${o.id} and ogrenci_id = ${a}`;
      await sistem`update ogrenme.ogrenci_odevleri set durum = 'teslim_edildi', teslim_at = now(), gec_teslim = true,
        yapilan_soru_sayisi = 10, dogru_sayisi = 4 where odev_id = ${o.id} and ogrenci_id = ${b}`;
      await sistem`update ogrenme.ogrenci_odevleri set durum = 'incelendi', teslim_at = now(), incelendi_at = now(),
        inceleme_sonucu = 'tamam', yapilan_soru_sayisi = 20 where odev_id = ${o.id} and ogrenci_id = ${c}`;
      const bas = performance.now();
      const res = await istek('GET', s.k.kurumId, s.hoca.token, `/odevler/${o.id}/ozet`);
      const sure = performance.now() - bas;
      console.warn(`[odev ozet] 30 ogrenci: ${sure.toFixed(1)} ms`);
      expect(res.statusCode, res.body).toBe(200);
      const j = res.json<OzetJson>();
      expect(j.ogrenciler).toHaveLength(30);
      expect(j.ogrenciler.every((r) => r.gorunen_ad !== null)).toBe(true);
      expect(j.sayilar).toMatchObject({
        atanan: 30,
        atandi: 27,
        teslim_edildi: 2,
        incelendi: 1,
        gec_teslim: 1,
        ortalama_dogru_orani: 0.6,
      });
      const ra = j.ogrenciler.find((r) => r.ogrenci_id === a);
      expect(ra?.dogru_orani).toBe(0.8);
      expect(sure).toBeLessThan(1000);
    });
  });

  describe('modul', () => {
    it('odev modulu grupta kapaliysa yazma 403 modul_kapali (olusturma, yayin, teslim)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const o = await yayinda(s);
      const satirId = await satirBul(o.id, ogr.uyelikId);
      const taslak = (
        await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s))
      ).json<OdevJson>();
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${s.k.kurumId}, 'odev', 'grup', ${s.grup.id}, false)`;
      const yeni = await istek('POST', s.k.kurumId, s.hoca.token, '/odevler', govde(s));
      expect(yeni.statusCode).toBe(403);
      expect(hataKodu(yeni)).toBe('modul_kapali');
      const yayin = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/odevler/${taslak.id}/yayinla`,
        {},
      );
      expect(yayin.statusCode).toBe(403);
      const teslim = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/ogrenci-odevleri/${satirId}/teslim`,
        {
          yapilan_soru_sayisi: 1,
        },
      );
      expect(teslim.statusCode).toBe(403);
      expect(hataKodu(teslim)).toBe('modul_kapali');
    });
  });

  describe('sablon', () => {
    it('CRUD; her ogretmen yalniz kendi sablonunu gorur (baskasi 404)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const hoca2 = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, hoca2.uyelikId);
      const olustur = await istek('POST', s.k.kurumId, s.hoca.token, '/odev-sablonlari', {
        baslik: 'Haftalik tekrar',
        brans_kodu: 'matematik',
        tur: 'sayfa',
        kaynak: 'Y Yayinlari',
        hedef_soru_sayisi: 30,
      });
      expect(olustur.statusCode, olustur.body).toBe(201);
      const sb = olustur.json<{ id: string; ogretmen_id: string; tur: string }>();
      expect(sb).toMatchObject({ ogretmen_id: s.hoca.uyelikId, tur: 'sayfa' });
      const liste = await istek('GET', s.k.kurumId, s.hoca.token, '/odev-sablonlari');
      expect(liste.json<{ sablonlar: unknown[] }>().sablonlar).toHaveLength(1);
      const baskaListe = await istek('GET', s.k.kurumId, hoca2.token, '/odev-sablonlari');
      expect(baskaListe.json<{ sablonlar: unknown[] }>().sablonlar).toHaveLength(0);
      for (const yontem of ['GET', 'PATCH', 'DELETE'] as const) {
        const res = await istek(
          yontem,
          s.k.kurumId,
          hoca2.token,
          `/odev-sablonlari/${sb.id}`,
          yontem === 'PATCH' ? { baslik: 'x' } : undefined,
        );
        expect(res.statusCode, yontem).toBe(404);
      }
      const guncel = await istek('PATCH', s.k.kurumId, s.hoca.token, `/odev-sablonlari/${sb.id}`, {
        baslik: 'Yeni ad',
        kaynak: null,
      });
      expect(guncel.json()).toMatchObject({ baslik: 'Yeni ad', kaynak: null });
      expect(
        (
          await istek('POST', s.k.kurumId, s.hoca.token, '/odev-sablonlari', {
            baslik: 'x',
            brans_kodu: 'yok_boyle_brans',
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (await istek('DELETE', s.k.kurumId, s.hoca.token, `/odev-sablonlari/${sb.id}`)).statusCode,
      ).toBe(204);
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, `/odev-sablonlari/${sb.id}`)).statusCode,
      ).toBe(404);
    });

    it('ogrenci sablon kullanamaz (403)', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      expect((await istek('GET', s.k.kurumId, ogr.token, '/odev-sablonlari')).statusCode).toBe(403);
    });
  });
});
