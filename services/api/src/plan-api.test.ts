import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { haftaBaslangici, planBugunu, tarihEkle } from './modules/ogrenme/plan-zaman.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface Gorev {
  id: string;
  plan_id: string;
  ogrenci_id: string;
  hafta_baslangic: string;
  gun: string;
  brans_kodu: string;
  baslik: string | null;
  hedef_turu: string;
  hedef_miktar: number;
  gerceklesen_miktar: number | null;
  durum: string;
  tamamlandi_at: string | null;
  devreden_gorev_id: string | null;
  sira: number;
  surum: number;
}
interface PlanDetay {
  ogrenci_id: string;
  hafta_baslangic: string;
  kilitli: boolean;
  plan: {
    id: string;
    durum: string;
    surum: number;
    hazirlayan_id: string;
    yayin_at: string | null;
    not: string | null;
  } | null;
  gorevler: Gorev[];
}
interface Sablon {
  id: string;
  ad: string;
  gorevler: { gun_sirasi: number; brans_kodu: string; hedef_miktar: number }[];
}
interface Ozet {
  dersler: {
    brans_kodu: string;
    soru: { planlanan: number; gerceklesen: number };
    dakika: { planlanan: number; gerceklesen: number };
    gorev_sayisi: number;
    tamam_sayisi: number;
  }[];
  toplam: {
    soru: { planlanan: number; gerceklesen: number };
    dakika: { planlanan: number; gerceklesen: number };
    gorev_sayisi: number;
    tamam_sayisi: number;
  };
}
interface Toplu {
  olusturulan: number;
  atlanan: number;
  planlar: { ogrenci_id: string; plan_id: string; sonuc: string }[];
}

const YASAK_ALANLAR = [
  'baslik',
  'gorunen_ad',
  'ad',
  'telefon',
  'telefon_e164',
  'eposta',
  'not',
  'aciklama',
];

// Hafta ve gun sunucuda Europe/Istanbul takvimiyle hesaplanir; testler ayni fonksiyonla beklenen degeri kurar.
const BU = haftaBaslangici(planBugunu());
const SONRAKI = tarihEkle(BU, 7);
const gun = (n: number, hafta = BU) => tarihEkle(hafta, n);

describe.skipIf(dbYok())('haftalik plan API', () => {
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

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;

  const istek = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    kurumId: string,
    token: string,
    yol: string,
    payload?: unknown,
  ) =>
    y.app.inject({
      method,
      url: `/v1/ogrenme/kurumlar/${kurumId}${yol}`,
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const olaylar = (kurumId: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox
      where kurum_id = ${kurumId} and subject = 'evt.ogrenme.plan_gorevi.guncellendi.v1'
      order by created_at, id`;

  /** Girisli ogrenci (grubun uyesi). */
  async function girisliOgrenci(s: Kurulum): Promise<Uye> {
    const o = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [o.uyelikId]);
    return o;
  }

  async function planAc(s: Kurulum, ogrenciId: string, hafta = BU, token = s.hoca.token) {
    const res = await istek('POST', s.k.kurumId, token, '/planlar', {
      ogrenci_id: ogrenciId,
      hafta_baslangic: hafta,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<PlanDetay>();
  }

  const gorevGovde = (ek: Record<string, unknown> = {}) => ({
    gun: gun(1),
    brans_kodu: 'matematik',
    hedef_turu: 'soru',
    hedef_miktar: 20,
    ...ek,
  });

  async function gorevEkle(
    s: Kurulum,
    planId: string,
    ek: Record<string, unknown> = {},
    token = s.hoca.token,
  ) {
    const res = await istek(
      'POST',
      s.k.kurumId,
      token,
      `/planlar/${planId}/gorevler`,
      gorevGovde(ek),
    );
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Gorev>();
  }

  async function yayinla(s: Kurulum, planId: string) {
    const res = await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/yayinla`, {});
    expect(res.statusCode, res.body).toBe(200);
    return res.json<PlanDetay>();
  }

  /** Yayindaki plan + tek gorev (Sali, 20 soru). */
  async function hazir(
    s: Kurulum,
    ogrenciId: string,
    hafta = BU,
    ek: Record<string, unknown> = {},
  ) {
    const p = await planAc(s, ogrenciId, hafta);
    const planId = p.plan?.id ?? '';
    const g = await gorevEkle(s, planId, { gun: gun(1, hafta), ...ek });
    await yayinla(s, planId);
    return { planId, gorev: g };
  }

  const gerceklesenYaz = (
    s: Kurulum,
    token: string,
    gorevId: string,
    miktar: number,
    surum?: number,
  ) =>
    istek('PUT', s.k.kurumId, token, `/gorevler/${gorevId}/gerceklesen`, {
      gerceklesen_miktar: miktar,
      ...(surum === undefined ? {} : { surum }),
    });

  const gorevOku = async (gorevId: string): Promise<Gorev> => {
    const [r] = await sistem<Gorev[]>`select * from ogrenme.plan_gorevleri where id = ${gorevId}`;
    if (!r) throw new Error('gorev yok');
    return r;
  };

  describe('plan olusturma, yetki ve kapsam', () => {
    it('ogretmen plan olusturur (taslak); Pazartesi disi 422; ayni hafta ikinci plan 409', async () => {
      const s = await y.kur();
      const ogr = s.ogrenciler[0] ?? '';
      const p = await planAc(s, ogr);
      expect(p.plan).toMatchObject({
        durum: 'taslak',
        hazirlayan_id: s.hoca.uyelikId,
        yayin_at: null,
      });
      expect(p.hafta_baslangic).toBe(BU);
      expect(p.gorevler).toEqual([]);
      const sali = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar', {
        ogrenci_id: s.ogrenciler[1],
        hafta_baslangic: gun(1),
      });
      expect(sali.statusCode).toBe(422);
      expect(hataKodu(sali)).toBe('hafta_pazartesi_degil');
      const tekrar = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar', {
        ogrenci_id: ogr,
        hafta_baslangic: BU,
      });
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('plan_zaten_var');
    });

    it('plan yoksa bos iskelet doner; hafta herhangi bir gun verilebilir', async () => {
      const s = await y.kur();
      const ogr = s.ogrenciler[0] ?? '';
      const bos = await istek('GET', s.k.kurumId, s.hoca.token, `/ogrenciler/${ogr}/plan`);
      expect(bos.statusCode, bos.body).toBe(200);
      expect(bos.json<PlanDetay>()).toMatchObject({
        hafta_baslangic: BU,
        plan: null,
        gorevler: [],
        kilitli: false,
      });
      await planAc(s, ogr);
      const cuma = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenciler/${ogr}/plan?hafta=${gun(4)}`,
      );
      expect(cuma.json<PlanDetay>().plan?.durum).toBe('taslak');
      expect(cuma.json<PlanDetay>().hafta_baslangic).toBe(BU);
    });

    it('ogrenci gorev ekleyemez, plan olusturamaz, hedefi degistiremez (403); ogretmen gerceklesen yazamaz (403)', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { planId, gorev } = await hazir(s, ogr.uyelikId);
      const ekle = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/planlar/${planId}/gorevler`,
        gorevGovde(),
      );
      expect(ekle.statusCode).toBe(403);
      const olustur = await istek('POST', s.k.kurumId, ogr.token, '/planlar', {
        ogrenci_id: ogr.uyelikId,
        hafta_baslangic: SONRAKI,
      });
      expect(olustur.statusCode).toBe(403);
      const hedef = await istek('PATCH', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}`, {
        hedef_miktar: 1,
      });
      expect(hedef.statusCode).toBe(403);
      expect(hataKodu(hedef)).toBe('izin_yok');
      const sil = await istek('DELETE', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}`);
      expect(sil.statusCode).toBe(403);
      // ogretmen ve sahip gerceklesen yazamaz
      for (const token of [s.hoca.token, s.k.token]) {
        const res = await gerceklesenYaz(s, token, gorev.id, 20);
        expect(res.statusCode, res.body).toBe(403);
        expect(hataKodu(res)).toBe('izin_yok');
      }
      expect((await gorevOku(gorev.id)).gerceklesen_miktar).toBeNull();
      expect((await gorevOku(gorev.id)).hedef_miktar).toBe(20);
    });

    it('ogretmen yalniz atandigi gruptaki ogrenciye plan yazar; kapsam disi 404; sahip her ogrenciye', async () => {
      const s = await y.kur();
      const baska = await y.grupAc(s.k, 'grup', 'Grup B');
      const [disari] = await y.topluOgrenci(s.k.kurumId, 1);
      await y.gruba(s.k, baska.id, [disari ?? '']);
      const yasak = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar', {
        ogrenci_id: disari,
        hafta_baslangic: BU,
      });
      expect(yasak.statusCode).toBe(404);
      const oku = await istek('GET', s.k.kurumId, s.hoca.token, `/ogrenciler/${disari}/plan`);
      expect(oku.statusCode).toBe(404);
      const sahip = await planAc(s, disari ?? '', BU, s.k.token);
      expect(sahip.plan?.durum).toBe('taslak');
      // baska grubun planina, gorevine, ozetine ogretmen erisemez
      const planId = sahip.plan?.id ?? '';
      const g = await gorevEkle(s, planId, {}, s.k.token);
      for (const res of [
        await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}`),
        await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}/ozet`),
        await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/yayinla`, {}),
        await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/gorevler`, gorevGovde()),
        await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${g.id}`, { hedef_miktar: 3 }),
        await istek('DELETE', s.k.kurumId, s.hoca.token, `/gorevler/${g.id}`),
      ]) {
        expect(res.statusCode, res.body).toBe(404);
      }
    });

    it('gorun/dogrulama: gun hafta disinda 422, gecersiz brans 422, hedef 0 400', async () => {
      const s = await y.kur();
      const p = await planAc(s, s.ogrenciler[0] ?? '');
      const planId = p.plan?.id ?? '';
      const disinda = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/planlar/${planId}/gorevler`,
        gorevGovde({ gun: gun(7) }),
      );
      expect(disinda.statusCode).toBe(422);
      expect(hataKodu(disinda)).toBe('gun_hafta_disinda');
      const brans = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/planlar/${planId}/gorevler`,
        gorevGovde({ brans_kodu: 'yok_boyle_bir_brans' }),
      );
      expect(brans.statusCode).toBe(422);
      const sifir = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/planlar/${planId}/gorevler`,
        gorevGovde({ hedef_miktar: 0 }),
      );
      expect(sifir.statusCode).toBe(400);
    });
  });

  describe('yayin ve ogrenci gorunurlugu', () => {
    it('yayinlanmamis plan ogrenciye gorunmez; yayinlaninca gorunur; yayin tekrari etkisiz', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const p = await planAc(s, ogr.uyelikId);
      const planId = p.plan?.id ?? '';
      const g = await gorevEkle(s, planId);
      const taslakPlanim = await istek('GET', s.k.kurumId, ogr.token, '/planim');
      expect(taslakPlanim.statusCode).toBe(200);
      expect(taslakPlanim.json<PlanDetay>()).toMatchObject({ plan: null, gorevler: [] });
      const taslakGun = await istek('GET', s.k.kurumId, ogr.token, `/gorevlerim?gun=${g.gun}`);
      expect(taslakGun.json<{ gorevler: Gorev[] }>().gorevler).toHaveLength(0);
      const yaz = await gerceklesenYaz(s, ogr.token, g.id, 5);
      expect(yaz.statusCode).toBe(404);
      const ozet = await istek('GET', s.k.kurumId, ogr.token, `/planlar/${planId}/ozet`);
      expect(ozet.statusCode).toBe(404);
      // ogretmen taslagi gorur
      const hoca = await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}`);
      expect(hoca.json<PlanDetay>().gorevler).toHaveLength(1);

      const yayinda = await yayinla(s, planId);
      expect(yayinda.plan?.durum).toBe('yayinda');
      expect(yayinda.plan?.yayin_at).not.toBeNull();
      const planim = await istek('GET', s.k.kurumId, ogr.token, '/planim');
      expect(planim.json<PlanDetay>().plan?.id).toBe(planId);
      expect(planim.json<PlanDetay>().gorevler).toHaveLength(1);
      const bugun = await istek('GET', s.k.kurumId, ogr.token, `/gorevlerim?gun=${g.gun}`);
      expect(bugun.json<{ gorevler: Gorev[] }>().gorevler.map((x) => x.id)).toEqual([g.id]);
      const tekrar = await yayinla(s, planId);
      expect(tekrar.plan?.yayin_at).toBe(yayinda.plan?.yayin_at);
      expect(tekrar.plan?.surum).toBe(yayinda.plan?.surum);
    });

    it('ogrenci yalniz kendi gorevini gorur/yazar; baska ogrencinin gorevi 404; ogretmen uclari 403', async () => {
      const s = await y.kur();
      const a = await girisliOgrenci(s);
      const b = await girisliOgrenci(s);
      const { gorev } = await hazir(s, a.uyelikId);
      const baskasi = await gerceklesenYaz(s, b.token, gorev.id, 5);
      expect(baskasi.statusCode).toBe(404);
      const devret = await istek('POST', s.k.kurumId, b.token, `/gorevler/${gorev.id}/devret`, {});
      expect(devret.statusCode).toBe(404);
      const bBugun = await istek('GET', s.k.kurumId, b.token, `/gorevlerim?gun=${gorev.gun}`);
      expect(bBugun.json<{ gorevler: Gorev[] }>().gorevler).toHaveLength(0);
      const ogretmenUcu = await istek(
        'GET',
        s.k.kurumId,
        a.token,
        `/ogrenciler/${a.uyelikId}/plan`,
      );
      expect(ogretmenUcu.statusCode).toBe(403);
      // ogretmenin ogrenci uclari
      const hocaPlanim = await istek('GET', s.k.kurumId, s.hoca.token, '/planim');
      expect(hocaPlanim.statusCode).toBe(403);
    });

    it('Bugun ekrani: gun verilmezse sunucunun Istanbul gunu kullanilir; devredilenler listelenmez', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const bugun = planBugunu();
      const p = await planAc(s, ogr.uyelikId, haftaBaslangici(bugun));
      const planId = p.plan?.id ?? '';
      const bugunGorev = await gorevEkle(s, planId, { gun: bugun, sira: 2 });
      const bugunIlk = await gorevEkle(s, planId, { gun: bugun, sira: 1, brans_kodu: 'fizik' });
      await gorevEkle(s, planId, {
        gun:
          tarihEkle(haftaBaslangici(bugun), 6) === bugun
            ? tarihEkle(bugun, -1)
            : tarihEkle(bugun, 1),
      });
      await yayinla(s, planId);
      const res = await istek('GET', s.k.kurumId, ogr.token, '/gorevlerim');
      expect(res.statusCode, res.body).toBe(200);
      const j = res.json<{ gun: string; gorevler: Gorev[] }>();
      expect(j.gun).toBe(bugun);
      expect(j.gorevler.map((g) => g.id)).toEqual([bugunIlk.id, bugunGorev.id]); // sira'ya gore
    });
  });

  describe('gerceklesen, durum ve olay', () => {
    it('durum sunucuda hesaplanir (kismen, tamam, yapilmadi); olaylar kimlik/sayi tasir, kisisel veri yok', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev } = await hazir(s, ogr.uyelikId, BU, { baslik: 'Turev ozel notu' });
      const kismen = await gerceklesenYaz(s, ogr.token, gorev.id, 10);
      expect(kismen.statusCode, kismen.body).toBe(200);
      expect(kismen.json<Gorev>()).toMatchObject({
        gerceklesen_miktar: 10,
        durum: 'kismen',
        tamamlandi_at: null,
      });
      const tamam = await gerceklesenYaz(s, ogr.token, gorev.id, 25);
      expect(tamam.json<Gorev>().durum).toBe('tamam');
      expect(tamam.json<Gorev>().tamamlandi_at).not.toBeNull();
      const sifir = await gerceklesenYaz(s, ogr.token, gorev.id, 0);
      expect(sifir.json<Gorev>()).toMatchObject({ durum: 'yapilmadi', tamamlandi_at: null });
      const tam = await gerceklesenYaz(s, ogr.token, gorev.id, 20);
      expect(tam.json<Gorev>().durum).toBe('tamam'); // >= hedef sinirinda

      const olay = await olaylar(s.k.kurumId);
      expect(olay).toHaveLength(4);
      expect(olay.map((o) => [o.payload.data.onceki_durum, o.payload.data.durum])).toEqual([
        ['bekliyor', 'kismen'],
        ['kismen', 'tamam'],
        ['tamam', 'yapilmadi'],
        ['yapilmadi', 'tamam'],
      ]);
      const ilk = olay[0]?.payload.data ?? {};
      expect(ilk).toMatchObject({
        gorev_id: gorev.id,
        ogrenci_id: ogr.uyelikId,
        hafta_baslangic: BU,
        gun: gun(1),
        brans_kodu: 'matematik',
        hedef_turu: 'soru',
        hedef_miktar: 20,
        gerceklesen_miktar: 10,
        onceki_gerceklesen_miktar: null,
      });
      for (const o of olay) {
        expect(Object.keys(o.payload.data).filter((a) => YASAK_ALANLAR.includes(a))).toEqual([]);
        expect(JSON.stringify(o.payload)).not.toContain('Turev ozel notu');
      }
    });

    it('ayni deger tekrar yazilirsa surum ve olay artmaz (cevrimdisi tekrar guvenli); eski surumle farkli deger 409', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev } = await hazir(s, ogr.uyelikId);
      const ilk = await gerceklesenYaz(s, ogr.token, gorev.id, 8, gorev.surum);
      expect(ilk.statusCode, ilk.body).toBe(200);
      const surum = ilk.json<Gorev>().surum;
      expect(surum).toBe(gorev.surum + 1);
      // Cevrimdisi kuyruk ayni istegi (eski surumle) tekrar gonderir: 200, degisiklik yok
      const tekrar = await gerceklesenYaz(s, ogr.token, gorev.id, 8, gorev.surum);
      expect(tekrar.statusCode, tekrar.body).toBe(200);
      expect(tekrar.json<Gorev>().surum).toBe(surum);
      expect(await olaylar(s.k.kurumId)).toHaveLength(1);
      expect(Number((await gorevOku(gorev.id)).surum)).toBe(surum);
      // Farkli deger + eski surum: cakisma
      const eski = await gerceklesenYaz(s, ogr.token, gorev.id, 9, gorev.surum);
      expect(eski.statusCode).toBe(409);
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      expect(await olaylar(s.k.kurumId)).toHaveLength(1);
      const dogru = await gerceklesenYaz(s, ogr.token, gorev.id, 9, surum);
      expect(dogru.statusCode).toBe(200);
      expect(await olaylar(s.k.kurumId)).toHaveLength(2);
    });

    it('negatif miktar 400; ogretmen hedefi degisince gerceklesen girilmisse durum yeniden hesaplanir ve olay yazilir', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev } = await hazir(s, ogr.uyelikId);
      expect((await gerceklesenYaz(s, ogr.token, gorev.id, -1)).statusCode).toBe(400);
      await gerceklesenYaz(s, ogr.token, gorev.id, 10); // kismen
      // sadece baslik degisir: durum ayni, olay yok
      const baslik = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`, {
        baslik: 'Yeni ad',
      });
      expect(baslik.statusCode, baslik.body).toBe(200);
      expect(await olaylar(s.k.kurumId)).toHaveLength(1);
      // hedef 10'a insin: gerceklesen 10 >= 10 -> tamam
      const hedef = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`, {
        hedef_miktar: 10,
      });
      expect(hedef.json<Gorev>()).toMatchObject({ durum: 'tamam', gerceklesen_miktar: 10 });
      expect(hedef.json<Gorev>().tamamlandi_at).not.toBeNull();
      const olay = await olaylar(s.k.kurumId);
      expect(olay).toHaveLength(2);
      expect(olay[1]?.payload.data).toMatchObject({
        onceki_durum: 'kismen',
        durum: 'tamam',
        hedef_miktar: 10,
        onceki_gerceklesen_miktar: 10,
        gerceklesen_miktar: 10,
      });
      // gerceklesen alani ogretmen uclarindan degistirilemez (strict olmasa da yok sayilir)
      const zorla = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`, {
        gerceklesen_miktar: 0,
      });
      expect(zorla.statusCode).toBe(200);
      expect((await gorevOku(gorev.id)).gerceklesen_miktar).toBe(10);
    });

    it('gorev duzenleme: iyimser kilit (eski surum 409), gun hafta disina tasinamaz', async () => {
      const s = await y.kur();
      const p = await planAc(s, s.ogrenciler[0] ?? '');
      const g = await gorevEkle(s, p.plan?.id ?? '');
      const ilk = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${g.id}`, {
        hedef_miktar: 30,
        surum: g.surum,
      });
      expect(ilk.statusCode, ilk.body).toBe(200);
      expect(ilk.json<Gorev>().surum).toBe(g.surum + 1);
      const eski = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${g.id}`, {
        hedef_miktar: 40,
        surum: g.surum,
      });
      expect(eski.statusCode).toBe(409);
      expect(hataKodu(eski)).toBe('surum_cakismasi');
      const disari = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${g.id}`, {
        gun: gun(8),
      });
      expect(disari.statusCode).toBe(422);
      expect(hataKodu(disari)).toBe('gun_hafta_disinda');
    });

    it('gorev silme: taslakta serbest; yayindayken gerceklesen yoksa silinir, varsa 409', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const p = await planAc(s, ogr.uyelikId);
      const planId = p.plan?.id ?? '';
      const taslakGorev = await gorevEkle(s, planId);
      const silTaslak = await istek(
        'DELETE',
        s.k.kurumId,
        s.hoca.token,
        `/gorevler/${taslakGorev.id}`,
      );
      expect(silTaslak.statusCode).toBe(204);
      const a = await gorevEkle(s, planId);
      const b = await gorevEkle(s, planId, { gun: gun(2) });
      await yayinla(s, planId);
      await gerceklesenYaz(s, ogr.token, b.id, 5);
      const silYayinda = await istek('DELETE', s.k.kurumId, s.hoca.token, `/gorevler/${a.id}`);
      expect(silYayinda.statusCode).toBe(204);
      const silGerceklesenli = await istek(
        'DELETE',
        s.k.kurumId,
        s.hoca.token,
        `/gorevler/${b.id}`,
      );
      expect(silGerceklesenli.statusCode).toBe(409);
      expect(hataKodu(silGerceklesenli)).toBe('gorev_silinemez');
      expect((await gorevOku(b.id)).id).toBe(b.id);
    });

    it('ogretmen notu yazilir ve silinir; yayindaki planda da', async () => {
      const s = await y.kur();
      const { planId } = await hazir(s, s.ogrenciler[0] ?? '');
      const yaz = await istek('PUT', s.k.kurumId, s.hoca.token, `/planlar/${planId}/not`, {
        not: 'Bu hafta turev agirlikli.',
      });
      expect(yaz.statusCode, yaz.body).toBe(200);
      expect(yaz.json<PlanDetay>().plan?.not).toBe('Bu hafta turev agirlikli.');
      const sil = await istek('PUT', s.k.kurumId, s.hoca.token, `/planlar/${planId}/not`, {
        not: null,
      });
      expect(sil.json<PlanDetay>().plan?.not).toBeNull();
    });
  });

  describe('hafta kilidi', () => {
    it('hafta sonu + 14 gun sonra yazma 409 plan_kilitli; sinirdaki hafta hala yazilabilir', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const acik = tarihEkle(BU, -14); // Pazar = BU-8, son yazilabilir gun = BU+6 >= bugun
      const kilitli = tarihEkle(BU, -21); // son yazilabilir gun = BU-1 < bugun
      const acikPlan = await planAc(s, ogr.uyelikId, acik);
      expect(acikPlan.kilitli).toBe(false);
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar', {
        ogrenci_id: s.ogrenciler[0],
        hafta_baslangic: kilitli,
      });
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('plan_kilitli');
      // kilitli haftanin plani/gorevi dogrudan seed edilir (zaman gecmis gibi)
      const plan = (
        await sistem<{ id: string }[]>`
          insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id, durum, yayin_at)
          values (gen_random_uuid(), ${s.k.kurumId}, ${ogr.uyelikId}, ${kilitli}, ${s.hoca.uyelikId}, 'yayinda', now())
          returning id`
      )[0];
      const gorevId =
        (
          await sistem<{ id: string }[]>`
          insert into ogrenme.plan_gorevleri (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, ekleyen_id)
          values (gen_random_uuid(), ${s.k.kurumId}, ${plan?.id ?? ''}, ${ogr.uyelikId}, ${kilitli}, ${gun(1, kilitli)}, 'matematik', 'soru', 20, ${s.hoca.uyelikId})
          returning id`
        )[0]?.id ?? '';
      const oku = await istek('GET', s.k.kurumId, ogr.token, `/planim?hafta=${kilitli}`);
      expect(oku.json<PlanDetay>().kilitli).toBe(true);
      expect(oku.json<PlanDetay>().gorevler).toHaveLength(1); // okuma serbest
      const yazOgrenci = await gerceklesenYaz(s, ogr.token, gorevId, 5);
      expect(yazOgrenci.statusCode).toBe(409);
      expect(hataKodu(yazOgrenci)).toBe('plan_kilitli');
      const duzenle = await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorevId}`, {
        hedef_miktar: 5,
      });
      expect(hataKodu(duzenle)).toBe('plan_kilitli');
      const sil = await istek('DELETE', s.k.kurumId, s.hoca.token, `/gorevler/${gorevId}`);
      expect(hataKodu(sil)).toBe('plan_kilitli');
      const ekle = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/planlar/${plan?.id}/gorevler`,
        gorevGovde({ gun: gun(2, kilitli) }),
      );
      expect(hataKodu(ekle)).toBe('plan_kilitli');
      const devret = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorevId}/devret`, {});
      expect(hataKodu(devret)).toBe('plan_kilitli');
      expect((await gorevOku(gorevId)).gerceklesen_miktar).toBeNull();
      // ayni deger tekrari (zaten yazilmis) kilitte de zararsiz: burada deger yok, 409 kalir
    });
  });

  describe('kopyala, toplu plan ve sablon', () => {
    it('kopyala: gerceklesen ve durum sifirlanir, gunler kayar, devredilenler gelmez; hedefte plan doluysa 409', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const p = await planAc(s, ogr.uyelikId);
      const planId = p.plan?.id ?? '';
      const a = await gorevEkle(s, planId, { gun: gun(0), hedef_miktar: 20 });
      const b = await gorevEkle(s, planId, {
        gun: gun(2),
        brans_kodu: 'fizik',
        hedef_turu: 'dakika',
        hedef_miktar: 45,
      });
      const c = await gorevEkle(s, planId, { gun: gun(3), hedef_miktar: 10 });
      await yayinla(s, planId);
      await gerceklesenYaz(s, ogr.token, a.id, 20);
      await gerceklesenYaz(s, ogr.token, b.id, 15);
      const devir = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${c.id}/devret`, {});
      expect(devir.statusCode, devir.body).toBe(201);

      const kopya = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/planlar/${planId}/kopyala`,
        {},
      );
      expect(kopya.statusCode, kopya.body).toBe(201);
      const k = kopya.json<PlanDetay>();
      expect(k.hafta_baslangic).toBe(SONRAKI);
      expect(k.plan).toMatchObject({ durum: 'taslak', hazirlayan_id: s.hoca.uyelikId });
      // a, b ve c'nin devir yavrusu (Pazartesi->Cuma?) kopyalanir; c (devredildi) kopyalanmaz
      const kaynakGorevler = (
        await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}`)
      ).json<PlanDetay>().gorevler;
      const beklenen = kaynakGorevler.filter((g) => g.durum !== 'devredildi');
      expect(k.gorevler).toHaveLength(beklenen.length);
      expect(k.gorevler.length).toBe(3); // a, b ve devir yavrusu
      for (const g of k.gorevler) {
        expect(g).toMatchObject({
          gerceklesen_miktar: null,
          durum: 'bekliyor',
          tamamlandi_at: null,
          devreden_gorev_id: null,
          hafta_baslangic: SONRAKI,
        });
      }
      const kopyaA = k.gorevler.find((g) => g.gun === gun(0, SONRAKI));
      expect(kopyaA).toMatchObject({ brans_kodu: 'matematik', hedef_miktar: 20 });
      const kopyaB = k.gorevler.find((g) => g.brans_kodu === 'fizik');
      expect(kopyaB).toMatchObject({
        hedef_turu: 'dakika',
        hedef_miktar: 45,
        gun: gun(2, SONRAKI),
      });
      // kaynak plan degismedi
      expect((await gorevOku(a.id)).gerceklesen_miktar).toBe(20);
      // ikinci kopyalama: hedefte gorev var
      const dolu = await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/kopyala`, {});
      expect(dolu.statusCode).toBe(409);
      expect(hataKodu(dolu)).toBe('plan_dolu');
      // ayni haftaya ya da Pazartesi olmayan haftaya kopyalanmaz
      const ayni = await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/kopyala`, {
        hedef_hafta_baslangic: BU,
      });
      expect(ayni.statusCode).toBe(422);
      const sali = await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/kopyala`, {
        hedef_hafta_baslangic: gun(1, tarihEkle(BU, 14)),
      });
      expect(hataKodu(sali)).toBe('hafta_pazartesi_degil');
    });

    it('toplu plan: gruptaki etkin ogrencilere ayni gorevler; tekrar idempotent; plani olan atlanir; yeni gelen eklenir', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const [o1, o2, o3] = s.ogrenciler;
      await planAc(s, o2 ?? ''); // o2'nin plani onceden var
      const govde = {
        grup_id: s.grup.id,
        hafta_baslangic: BU,
        gorevler: [
          { gun_sirasi: 0, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 30 },
          { gun_sirasi: 2, brans_kodu: 'fizik', hedef_turu: 'dakika', hedef_miktar: 40 },
        ],
        yayinla: true,
      };
      const ilk = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', govde);
      expect(ilk.statusCode, ilk.body).toBe(200);
      const j = ilk.json<Toplu>();
      expect(j).toMatchObject({ olusturulan: 2, atlanan: 1 });
      expect(j.planlar.find((p) => p.ogrenci_id === o2)?.sonuc).toBe('zaten_var');
      expect(j.planlar.find((p) => p.ogrenci_id === o1)?.sonuc).toBe('olusturuldu');
      const sayim = async () => {
        const [r] = await sistem<{ planlar: number; gorevler: number }[]>`
          select (select count(*)::int from ogrenme.haftalik_planlar where kurum_id = ${s.k.kurumId} and hafta_baslangic = ${BU}) as planlar,
                 (select count(*)::int from ogrenme.plan_gorevleri where kurum_id = ${s.k.kurumId} and hafta_baslangic = ${BU}) as gorevler`;
        return r;
      };
      expect(await sayim()).toEqual({ planlar: 3, gorevler: 4 }); // o2'nin plani bos kalir
      const o1Plan = await istek('GET', s.k.kurumId, s.hoca.token, `/ogrenciler/${o1}/plan`);
      expect(o1Plan.json<PlanDetay>().plan?.durum).toBe('yayinda');
      expect(o1Plan.json<PlanDetay>().gorevler.map((g) => g.gun)).toEqual([gun(0), gun(2)]);
      // tekrar: yeni plan ya da gorev yok
      const tekrar = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', govde);
      expect(tekrar.json<Toplu>()).toMatchObject({ olusturulan: 0, atlanan: 3 });
      expect(await sayim()).toEqual({ planlar: 3, gorevler: 4 });
      // sonradan gruba katilan ogrenci yalniz kendisi icin plan alir
      const [yeni] = await y.topluOgrenci(s.k.kurumId, 1, 'Yeni');
      await y.gruba(s.k, s.grup.id, [yeni ?? '']);
      const uc = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', govde);
      expect(uc.json<Toplu>()).toMatchObject({ olusturulan: 1, atlanan: 3 });
      expect(await sayim()).toEqual({ planlar: 4, gorevler: 6 });
      expect(o3).toBeTruthy();
    });

    it('toplu plan: sablondan; baska grup 404; sablon ve gorevler birlikte 400; taslak varsayilan', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const sablon = await istek('POST', s.k.kurumId, s.hoca.token, '/plan-sablonlari', {
        ad: 'LGS Hafta',
        gorevler: [
          { gun_sirasi: 4, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 50 },
        ],
      });
      expect(sablon.statusCode, sablon.body).toBe(201);
      const sid = sablon.json<Sablon>().id;
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', {
        grup_id: s.grup.id,
        hafta_baslangic: SONRAKI,
        sablon_id: sid,
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<Toplu>().olusturulan).toBe(2);
      const o = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenciler/${s.ogrenciler[0]}/plan?hafta=${SONRAKI}`,
      );
      expect(o.json<PlanDetay>().plan?.durum).toBe('taslak');
      expect(o.json<PlanDetay>().gorevler[0]).toMatchObject({
        gun: gun(4, SONRAKI),
        hedef_miktar: 50,
      });
      const ikisi = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', {
        grup_id: s.grup.id,
        hafta_baslangic: SONRAKI,
        sablon_id: sid,
        gorevler: [{ gun_sirasi: 0, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 1 }],
      });
      expect(ikisi.statusCode).toBe(400);
      const baska = await y.grupAc(s.k, 'grup', 'Grup B');
      const yasak = await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', {
        grup_id: baska.id,
        hafta_baslangic: SONRAKI,
        sablon_id: sid,
      });
      expect(yasak.statusCode).toBe(404);
    });

    it('sablon CRUD ve sablondan kur; baskasinin sablonu 404; dolu haftaya kurulmaz', async () => {
      const s = await y.kur();
      const olustur = await istek('POST', s.k.kurumId, s.hoca.token, '/plan-sablonlari', {
        ad: 'TYT Haftasi',
        aciklama: 'Genel tekrar',
        gorevler: [
          { gun_sirasi: 0, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 40 },
          { gun_sirasi: 6, brans_kodu: 'fizik', hedef_turu: 'dakika', hedef_miktar: 60 },
        ],
      });
      expect(olustur.statusCode, olustur.body).toBe(201);
      const sablon = olustur.json<Sablon>();
      expect(sablon.gorevler.map((g) => g.gun_sirasi)).toEqual([0, 6]);
      const liste = await istek('GET', s.k.kurumId, s.hoca.token, '/plan-sablonlari');
      expect(liste.json<{ sablonlar: Sablon[] }>().sablonlar.map((x) => x.id)).toEqual([sablon.id]);
      // sahip, hocanin sablonunu goremez
      expect(
        (await istek('GET', s.k.kurumId, s.k.token, `/plan-sablonlari/${sablon.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await istek('DELETE', s.k.kurumId, s.k.token, `/plan-sablonlari/${sablon.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await istek('GET', s.k.kurumId, s.k.token, '/plan-sablonlari')).json<{
          sablonlar: unknown[];
        }>().sablonlar,
      ).toHaveLength(0);

      const kur = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/plan-sablonlari/${sablon.id}/uygula`,
        {
          ogrenci_id: s.ogrenciler[0],
          hafta_baslangic: SONRAKI,
        },
      );
      expect(kur.statusCode, kur.body).toBe(201);
      const plan = kur.json<PlanDetay>();
      expect(plan.plan?.durum).toBe('taslak');
      expect(plan.gorevler.map((g) => [g.gun, g.brans_kodu, g.hedef_turu, g.hedef_miktar])).toEqual(
        [
          [gun(0, SONRAKI), 'matematik', 'soru', 40],
          [gun(6, SONRAKI), 'fizik', 'dakika', 60],
        ],
      );
      const dolu = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/plan-sablonlari/${sablon.id}/uygula`,
        {
          ogrenci_id: s.ogrenciler[0],
          hafta_baslangic: SONRAKI,
        },
      );
      expect(dolu.statusCode).toBe(409);
      expect(hataKodu(dolu)).toBe('plan_dolu');
      const sali = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        `/plan-sablonlari/${sablon.id}/uygula`,
        {
          ogrenci_id: s.ogrenciler[1],
          hafta_baslangic: gun(1, SONRAKI),
        },
      );
      expect(sali.statusCode).toBe(422);

      const guncel = await istek(
        'PATCH',
        s.k.kurumId,
        s.hoca.token,
        `/plan-sablonlari/${sablon.id}`,
        {
          ad: 'TYT Haftasi v2',
          gorevler: [
            { gun_sirasi: 3, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 25 },
          ],
        },
      );
      expect(guncel.statusCode, guncel.body).toBe(200);
      expect(guncel.json<Sablon>()).toMatchObject({ ad: 'TYT Haftasi v2' });
      expect(guncel.json<Sablon>().gorevler).toHaveLength(1);
      // kurulmus plan sablondan bagimsizdir
      const hala = await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${plan.plan?.id}`);
      expect(hala.json<PlanDetay>().gorevler).toHaveLength(2);
      expect(
        (await istek('DELETE', s.k.kurumId, s.hoca.token, `/plan-sablonlari/${sablon.id}`))
          .statusCode,
      ).toBe(204);
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, `/plan-sablonlari/${sablon.id}`)).statusCode,
      ).toBe(404);
      const [n] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.plan_sablon_gorevleri where sablon_id = ${sablon.id}`;
      expect(n?.n).toBe(0);
      const kotu = await istek('POST', s.k.kurumId, s.hoca.token, '/plan-sablonlari', {
        ad: 'Bozuk',
        gorevler: [{ gun_sirasi: 7, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 1 }],
      });
      expect(kotu.statusCode).toBe(400);
    });
  });

  describe('devret', () => {
    it('varsayilan ertesi gun: hedef = kalan, devreden_gorev_id dolu, eski gorev devredildi; cift devir 409', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev } = await hazir(s, ogr.uyelikId, BU, { gun: gun(1), hedef_miktar: 20 });
      await gerceklesenYaz(s, ogr.token, gorev.id, 5);
      const res = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {});
      expect(res.statusCode, res.body).toBe(201);
      const { eski, yeni } = res.json<{ eski: Gorev; yeni: Gorev }>();
      expect(eski).toMatchObject({ id: gorev.id, durum: 'devredildi', gerceklesen_miktar: 5 });
      expect(yeni).toMatchObject({
        gun: gun(2),
        hedef_miktar: 15,
        hedef_turu: 'soru',
        brans_kodu: 'matematik',
        devreden_gorev_id: gorev.id,
        gerceklesen_miktar: null,
        durum: 'bekliyor',
        plan_id: gorev.plan_id,
      });
      // olay: eski gorev kismen -> devredildi
      const olay = await olaylar(s.k.kurumId);
      expect(olay.at(-1)?.payload.data).toMatchObject({
        gorev_id: gorev.id,
        onceki_durum: 'kismen',
        durum: 'devredildi',
      });
      // cift devir
      const tekrar = await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        `/gorevler/${gorev.id}/devret`,
        {},
      );
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('gorev_zaten_devredildi');
      const [n] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.plan_gorevleri where devreden_gorev_id = ${gorev.id}`;
      expect(n?.n).toBe(1);
      // devredilmis gorevde gerceklesen yazilamaz, ogretmen de duzenleyemez/silemez
      expect((await gerceklesenYaz(s, ogr.token, gorev.id, 9)).statusCode).toBe(409);
      expect(
        hataKodu(
          await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`, {
            hedef_miktar: 3,
          }),
        ),
      ).toBe('gorev_zaten_devredildi');
      expect(
        hataKodu(await istek('DELETE', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`)),
      ).toBe('gorev_silinemez');
      // ogrenci yeni gorevi ertesi gun listesinde gorur, eski gorev listelenmez
      const g1 = await istek('GET', s.k.kurumId, ogr.token, `/gorevlerim?gun=${gun(1)}`);
      expect(g1.json<{ gorevler: Gorev[] }>().gorevler).toHaveLength(0);
      const g2 = await istek('GET', s.k.kurumId, ogr.token, `/gorevlerim?gun=${gun(2)}`);
      expect(g2.json<{ gorevler: Gorev[] }>().gorevler.map((g) => g.id)).toEqual([yeni.id]);
    });

    it('kalan en az 1; gerceklesen girilmemisse kalan hedeftir; hedef_gun verilebilir', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const a = await hazir(s, ogr.uyelikId, BU, { gun: gun(0), hedef_miktar: 20 });
      await gerceklesenYaz(s, ogr.token, a.gorev.id, 19);
      const r1 = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${a.gorev.id}/devret`, {
        hedef_gun: gun(4),
      });
      expect(r1.statusCode, r1.body).toBe(201);
      expect(r1.json<{ yeni: Gorev }>().yeni).toMatchObject({ hedef_miktar: 1, gun: gun(4) });
      // yeni gorev ayni plandaki baska gorev: gerceklesen yok -> kalan hedef
      const yeniId = r1.json<{ yeni: Gorev }>().yeni.id;
      const r2 = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${yeniId}/devret`, {});
      expect(r2.json<{ yeni: Gorev }>().yeni).toMatchObject({ hedef_miktar: 1, gun: gun(5) });
      // sifir yapilmis: kalan hedefin tamami
      const b = await gorevEkle(s, a.planId, { gun: gun(1), hedef_miktar: 12 });
      await gerceklesenYaz(s, ogr.token, b.id, 0);
      const r3 = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${b.id}/devret`, {});
      expect(r3.json<{ yeni: Gorev }>().yeni.hedef_miktar).toBe(12);
    });

    it('hedef gun gorevin gunuden sonra olmali (422); tamamlanan gorev devredilmez (409)', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev } = await hazir(s, ogr.uyelikId, BU, { gun: gun(2) });
      for (const hedef of [gun(2), gun(1)]) {
        const res = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {
          hedef_gun: hedef,
        });
        expect(res.statusCode).toBe(422);
        expect(hataKodu(res)).toBe('hedef_gun_gecersiz');
      }
      await gerceklesenYaz(s, ogr.token, gorev.id, 20);
      const tamam = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {});
      expect(tamam.statusCode).toBe(409);
      expect(hataKodu(tamam)).toBe('devretme_durumu_gecersiz');
    });

    it('Pazar gorevi sonraki haftanin planina gecer: plan yoksa yayinda acilir, varsa o plana eklenir', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { gorev, planId } = await hazir(s, ogr.uyelikId, BU, { gun: gun(6), hedef_miktar: 10 });
      const res = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {});
      expect(res.statusCode, res.body).toBe(201);
      const yeni = res.json<{ yeni: Gorev }>().yeni;
      expect(yeni).toMatchObject({
        gun: gun(0, SONRAKI),
        hafta_baslangic: SONRAKI,
        hedef_miktar: 10,
      });
      expect(yeni.plan_id).not.toBe(planId);
      const sonraki = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/ogrenciler/${ogr.uyelikId}/plan?hafta=${SONRAKI}`,
      );
      expect(sonraki.json<PlanDetay>().plan).toMatchObject({
        durum: 'yayinda',
        hazirlayan_id: ogr.uyelikId,
      });
      // ogretmen devri plandan gorur
      expect(sonraki.json<PlanDetay>().gorevler[0]?.devreden_gorev_id).toBe(gorev.id);
      // ikinci Pazar gorevi ayni plana eklenir (ikinci plan acilmaz)
      const g2 = await gorevEkle(s, planId, { gun: gun(6) });
      const r2 = await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${g2.id}/devret`, {});
      expect(r2.json<{ yeni: Gorev }>().yeni.plan_id).toBe(yeni.plan_id);
      expect(r2.json<{ yeni: Gorev }>().yeni.sira).toBe(1);
      const [n] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.haftalik_planlar where ogrenci_id = ${ogr.uyelikId} and hafta_baslangic = ${SONRAKI}`;
      expect(n?.n).toBe(1);
    });
  });

  describe('ozet', () => {
    it('ders bazinda planlanan/gerceklesen; soru ve dakika ayri; devredilen sadece yapilan kismi sayar', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const p = await planAc(s, ogr.uyelikId);
      const planId = p.plan?.id ?? '';
      const m1 = await gorevEkle(s, planId, { gun: gun(0), hedef_miktar: 20 });
      const m2 = await gorevEkle(s, planId, {
        gun: gun(1),
        hedef_miktar: 30,
        hedef_turu: 'dakika',
      });
      const m3 = await gorevEkle(s, planId, { gun: gun(2), hedef_miktar: 10 });
      const f1 = await gorevEkle(s, planId, { gun: gun(3), brans_kodu: 'fizik', hedef_miktar: 15 });
      await gorevEkle(s, planId, { gun: gun(4), brans_kodu: 'fizik', hedef_miktar: 25 }); // yapilmadi/bekliyor
      await yayinla(s, planId);
      await gerceklesenYaz(s, ogr.token, m1.id, 20); // tamam
      await gerceklesenYaz(s, ogr.token, m2.id, 10); // kismen (dakika)
      await gerceklesenYaz(s, ogr.token, m3.id, 4); // kismen, sonra devredilir
      await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${m3.id}/devret`, {
        hedef_gun: gun(5),
      });
      await gerceklesenYaz(s, ogr.token, f1.id, 0); // yapilmadi

      const res = await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}/ozet`);
      expect(res.statusCode, res.body).toBe(200);
      const o = res.json<Ozet>();
      const mat = o.dersler.find((d) => d.brans_kodu === 'matematik');
      const fiz = o.dersler.find((d) => d.brans_kodu === 'fizik');
      // matematik soru: m1 20/20 + m3 (devredildi) 4/4 + devir yavrusu 6/0 = 30 planlanan, 24 gerceklesen
      expect(mat?.soru).toEqual({ planlanan: 30, gerceklesen: 24 });
      expect(mat?.dakika).toEqual({ planlanan: 30, gerceklesen: 10 });
      // gorev sayisi: m1, m2, devir yavrusu (devredilen m3 sayilmaz) = 3; tamam: m1
      expect(mat?.gorev_sayisi).toBe(3);
      expect(mat?.tamam_sayisi).toBe(1);
      expect(fiz?.soru).toEqual({ planlanan: 40, gerceklesen: 0 });
      expect(fiz?.dakika).toEqual({ planlanan: 0, gerceklesen: 0 });
      expect(fiz?.gorev_sayisi).toBe(2);
      expect(o.toplam.soru).toEqual({ planlanan: 70, gerceklesen: 24 });
      expect(o.toplam.dakika).toEqual({ planlanan: 30, gerceklesen: 10 });
      expect(o.toplam.gorev_sayisi).toBe(5);
      expect(o.toplam.tamam_sayisi).toBe(1);
      // ogrenci kendi ozetini gorur
      const kendi = await istek('GET', s.k.kurumId, ogr.token, `/planlar/${planId}/ozet`);
      expect(kendi.statusCode).toBe(200);
      expect(kendi.json<Ozet>().toplam).toEqual(o.toplam);
      // baska ogrenci goremez
      const b = await girisliOgrenci(s);
      expect((await istek('GET', s.k.kurumId, b.token, `/planlar/${planId}/ozet`)).statusCode).toBe(
        404,
      );
    });
  });

  describe('modul ve denetim', () => {
    it('modul grup duzeyinde kapaliysa yazma 403 modul_kapali, okuma serbest', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { planId, gorev } = await hazir(s, ogr.uyelikId);
      const kapat = await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'haftalik_plan', kapsam: 'grup', kapsam_id: s.grup.id, acik: false },
      });
      expect(kapat.statusCode, kapat.body).toBe(200);
      const yazmalar = [
        await istek('POST', s.k.kurumId, s.hoca.token, `/planlar/${planId}/gorevler`, gorevGovde()),
        await istek('PATCH', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`, {
          hedef_miktar: 3,
        }),
        await istek('DELETE', s.k.kurumId, s.hoca.token, `/gorevler/${gorev.id}`),
        await istek('POST', s.k.kurumId, s.hoca.token, '/planlar', {
          ogrenci_id: s.ogrenciler[0],
          hafta_baslangic: SONRAKI,
        }),
        await istek('POST', s.k.kurumId, s.hoca.token, '/planlar/toplu', {
          grup_id: s.grup.id,
          hafta_baslangic: SONRAKI,
          gorevler: [
            { gun_sirasi: 0, brans_kodu: 'matematik', hedef_turu: 'soru', hedef_miktar: 5 },
          ],
        }),
        await gerceklesenYaz(s, ogr.token, gorev.id, 5),
        await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {}),
      ];
      for (const res of yazmalar) {
        expect(res.statusCode, res.body).toBe(403);
        expect(hataKodu(res)).toBe('modul_kapali');
      }
      const oku = await istek('GET', s.k.kurumId, s.hoca.token, `/planlar/${planId}`);
      expect(oku.statusCode).toBe(200);
      expect((await gorevOku(gorev.id)).gerceklesen_miktar).toBeNull();
      // modul acilinca yazma tekrar calisir
      await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'haftalik_plan', kapsam: 'grup', kapsam_id: s.grup.id, acik: null },
      });
      expect((await gerceklesenYaz(s, ogr.token, gorev.id, 5)).statusCode).toBe(200);
    });

    it('modul kurum duzeyinde kapaliysa tum uclar 403 modul_kapali', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'haftalik_plan', kapsam: 'kurum', acik: false },
      });
      for (const res of [
        await istek('GET', s.k.kurumId, s.hoca.token, `/ogrenciler/${s.ogrenciler[0]}/plan`),
        await istek('GET', s.k.kurumId, ogr.token, '/planim'),
        await istek('GET', s.k.kurumId, ogr.token, '/gorevlerim'),
        await istek('GET', s.k.kurumId, s.hoca.token, '/plan-sablonlari'),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(hataKodu(res)).toBe('modul_kapali');
      }
    });

    it('her yazma denetim kaydina dusar; kayitta serbest metin yok', async () => {
      const s = await y.kur();
      const ogr = await girisliOgrenci(s);
      const { planId, gorev } = await hazir(s, ogr.uyelikId, BU, { baslik: 'Gizli baslik' });
      await istek('PUT', s.k.kurumId, s.hoca.token, `/planlar/${planId}/not`, { not: 'Gizli not' });
      await gerceklesenYaz(s, ogr.token, gorev.id, 7);
      await istek('POST', s.k.kurumId, ogr.token, `/gorevler/${gorev.id}/devret`, {});
      const satirlar = await sistem<{ eylem: string; aktor_uyelik_id: string; sonra: unknown }[]>`
        select eylem, aktor_uyelik_id, sonra from hesap.denetim_kayitlari
        where kurum_id = ${s.k.kurumId} and eylem like 'plan.%' order by created_at, id`;
      expect(satirlar.map((r) => r.eylem)).toEqual([
        'plan.olustur',
        'plan.gorev_ekle',
        'plan.yayinla',
        'plan.not',
        'plan.gerceklesen',
        'plan.devret',
      ]);
      expect(satirlar[0]?.aktor_uyelik_id).toBe(s.hoca.uyelikId);
      expect(satirlar[4]?.aktor_uyelik_id).toBe(ogr.uyelikId);
      const metin = JSON.stringify(satirlar);
      expect(metin).not.toContain('Gizli');
    });
  });
});
