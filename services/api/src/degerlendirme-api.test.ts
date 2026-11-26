import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { haftaBaslangici, planBugunu, tarihEkle } from './modules/ogrenme/index.js';
import { kvkkSilmeIsle } from './sistem/kvkk-silme.js';
import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface Deger {
  id: string;
  ogrenci_id: string;
  yazar_id: string;
  yazar_ad: string | null;
  donem_baslangic: string;
  donem_bitis: string;
  calisma_duzeni: number | null;
  yorum: string | null;
  ogrenci_gorur: boolean;
  geri_cekildi_at: string | null;
  benim: boolean;
  duzenlenebilir: boolean;
  surum: number;
}
interface Oneri {
  id: string;
  tur: string;
  kaynak_kitap_id: string | null;
  kaynak_kitap_ad: string | null;
  kaynak_test_id: string | null;
  baglanti_url: string | null;
  baslik: string | null;
  basladi: boolean | null;
  kayit_sayisi: number;
  son_kullanim_gun: string | null;
  geri_cekildi_at: string | null;
  benim: boolean;
}
interface Kitap {
  id: string;
  testler: { id: string }[];
}

const BUGUN = planBugunu();
const BU_HAFTA = haftaBaslangici(BUGUN);
const GIZLI = 'GIZLI-YORUM-ASLA-GORUNMEMELI';
const GORUNUR = 'Gorunur yorum: derslere duzenli katiliyor.';

describe.skipIf(dbYok())('ogretmen degerlendirmeleri, onerilen kaynaklar ve kocluk API', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000', LOG_LEVEL: 'error' });
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
    y = dersYardimcilari({ t, sistem });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await sistemDb.close();
  });

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;
  const istek = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  interface Ortam {
    s: Kurulum;
    ogrenci: Uye;
    ogrenci2: Uye;
    hoca2: Uye; // ayni gruba atanmis ikinci ogretmen
    yabanci: Uye; // hicbir gruba atanmamis ogretmen
    disOgrenci: string; // gruba uye olmayan ogrenci
    konu: string;
    kitap: Kitap;
  }

  async function ortamKur(): Promise<Ortam> {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const ogrenci = await y.davetliUye(s.k, 'ogrenci');
    const ogrenci2 = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId, ogrenci2.uyelikId]);
    const hoca2 = await y.davetliUye(s.k, 'ogretmen');
    await y.ata(s.k, s.grup.id, hoca2.uyelikId, 'fizik');
    const yabanci = await y.davetliUye(s.k, 'ogretmen');
    const [disOgrenci] = await y.topluOgrenci(s.k.kurumId, 1, 'Dis');
    const konu = uuidv7();
    await sistem`
      insert into ogrenme.konular (id, kurum_id, brans_kodu, seviye, ad)
      values (${konu}, ${s.k.kurumId}, 'biyoloji', 'unite', 'Genetik')`;
    const kitapRes = await istek('POST', s.k.kurumId, s.hoca.token, '/kaynak-kitaplar', {
      ad: 'Biyoloji Soru Bankasi',
      brans_kodu: 'biyoloji',
      testler: [
        { ad: 'Test 1', soru_sayisi: 20 },
        { ad: 'Test 2', soru_sayisi: 20 },
      ],
    });
    expect(kitapRes.statusCode, kitapRes.body).toBe(201);
    return {
      s,
      ogrenci,
      ogrenci2,
      hoca2,
      yabanci,
      disOgrenci: disOgrenci ?? '',
      konu,
      kitap: kitapRes.json<Kitap>(),
    };
  }

  const degerYaz = async (
    o: Ortam,
    token: string,
    ek: Record<string, unknown> = {},
    ogrenciId = o.ogrenci.uyelikId,
  ) =>
    istek('POST', o.s.k.kurumId, token, `/ogrenciler/${ogrenciId}/degerlendirmeler`, {
      donem_baslangic: BU_HAFTA,
      donem_bitis: tarihEkle(BU_HAFTA, 6),
      calisma_duzeni: 4,
      yorum: GIZLI,
      ...ek,
    });
  const degerAc = async (o: Ortam, token: string, ek: Record<string, unknown> = {}) => {
    const res = await degerYaz(o, token, ek);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Deger>();
  };
  const outbox = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject}
      order by created_at, id`;

  const ogrenciGet = (o: Ortam, yol: string, uye = o.ogrenci) =>
    istek('GET', o.s.k.kurumId, uye.token, yol);

  // --- Yazma: yetki ve kapsam ------------------------------------------------------------------

  it('yazma: ogretmen kendi ogrencisine yazar; olcek/yorum/donem dogrulanir; kapsam disi 404, ogrenci 403, sahip kurum', async () => {
    const o = await ortamKur();
    const d = await degerAc(o, o.s.hoca.token);
    expect(d).toMatchObject({
      ogrenci_id: o.ogrenci.uyelikId,
      yazar_id: o.s.hoca.uyelikId,
      ogrenci_gorur: false,
      benim: true,
      duzenlenebilir: true,
      geri_cekildi_at: null,
      donem_baslangic: BU_HAFTA,
    });
    // Tek gun: bitis verilmezse baslangic.
    const tek = await degerAc(o, o.s.hoca.token, {
      donem_bitis: undefined,
      donem_baslangic: BUGUN,
    });
    expect(tek.donem_bitis).toBe(BUGUN);
    // Sahip (kurum kapsami) de yazabilir.
    expect((await degerYaz(o, o.s.k.token)).statusCode).toBe(201);

    // Dogrulama.
    for (const kotu of [
      { calisma_duzeni: 6 },
      { calisma_duzeni: 0 },
      { yorum: undefined, calisma_duzeni: undefined },
    ]) {
      expect((await degerYaz(o, o.s.hoca.token, kotu)).statusCode).toBe(400);
    }
    const gelecek = await degerYaz(o, o.s.hoca.token, {
      donem_baslangic: tarihEkle(BUGUN, 3),
      donem_bitis: tarihEkle(BUGUN, 4),
    });
    expect(gelecek.statusCode).toBe(422);
    expect(hataKodu(gelecek)).toBe('donem_gecersiz');
    const uzun = await degerYaz(o, o.s.hoca.token, {
      donem_baslangic: tarihEkle(BUGUN, -40),
      donem_bitis: BUGUN,
    });
    expect(hataKodu(uzun)).toBe('donem_gecersiz');
    const ters = await degerYaz(o, o.s.hoca.token, {
      donem_baslangic: BUGUN,
      donem_bitis: tarihEkle(BUGUN, -1),
    });
    expect(hataKodu(ters)).toBe('donem_gecersiz');

    // Kapsam: ilgisiz ogretmen ve gruba uye olmayan ogrenci 404; ogrenci rolu 403.
    expect((await degerYaz(o, o.yabanci.token)).statusCode).toBe(404);
    expect((await degerYaz(o, o.s.hoca.token, {}, o.disOgrenci)).statusCode).toBe(404);
    expect((await degerYaz(o, o.ogrenci.token)).statusCode).toBe(403);
    expect((await degerYaz(o, o.ogrenci.token, {}, o.ogrenci2.uyelikId)).statusCode).toBe(403);
    // Gizli degerlendirmede olay yok.
    expect(await outbox(o.s.k.kurumId, 'evt.ogrenme.degerlendirme.yayimlandi.v1')).toHaveLength(0);
  });

  it('personel listesi: ogrencinin TUM ogretmenleri birbirinin degerlendirmesini gorur; ilgisiz ogretmen 404; ogrenci 403', async () => {
    const o = await ortamKur();
    const d1 = await degerAc(o, o.s.hoca.token, { yorum: 'hoca yorumu' });
    const d2 = await degerAc(o, o.hoca2.token, { yorum: 'hoca2 yorumu', brans_kodu: 'fizik' });
    const yol = `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler`;
    for (const token of [o.s.hoca.token, o.hoca2.token, o.s.k.token]) {
      const res = await istek('GET', o.s.k.kurumId, token, yol);
      expect(res.statusCode, res.body).toBe(200);
      const l = res.json<{ degerlendirmeler: Deger[]; sonraki_imlec: string | null }>();
      expect(l.degerlendirmeler.map((x) => x.id)).toEqual([d2.id, d1.id]);
      expect(l.degerlendirmeler.find((x) => x.id === d1.id)?.benim).toBe(token === o.s.hoca.token);
    }
    expect((await istek('GET', o.s.k.kurumId, o.yabanci.token, yol)).statusCode).toBe(404);
    const disOgrenciYol = `/ogrenciler/${o.disOgrenci}/degerlendirmeler`;
    expect((await istek('GET', o.s.k.kurumId, o.s.hoca.token, disOgrenciYol)).statusCode).toBe(404);
    expect((await istek('GET', o.s.k.kurumId, o.ogrenci.token, yol)).statusCode).toBe(403);
    // Sayfalama.
    const s1 = await istek('GET', o.s.k.kurumId, o.s.hoca.token, `${yol}?limit=1`);
    const p1 = s1.json<{ degerlendirmeler: Deger[]; sonraki_imlec: string | null }>();
    expect(p1.degerlendirmeler.map((x) => x.id)).toEqual([d2.id]);
    expect(p1.sonraki_imlec).toBeTruthy();
    const s2 = await istek(
      'GET',
      o.s.k.kurumId,
      o.s.hoca.token,
      `${yol}?limit=1&imlec=${p1.sonraki_imlec ?? ''}`,
    );
    const p2 = s2.json<{ degerlendirmeler: Deger[]; sonraki_imlec: string | null }>();
    expect(p2.degerlendirmeler.map((x) => x.id)).toEqual([d1.id]);
    expect(p2.sonraki_imlec).toBeNull();
  });

  // --- Ogrenci gorunurlugu (kritik) ------------------------------------------------------------

  it('ogrenci YALNIZ gorunur ve geri cekilmemis degerlendirmeyi gorur; gizli yorum hicbir uctan alinamaz', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const gizli = await degerAc(o, o.s.hoca.token); // varsayilan: gorunmez
    const gorunur = await degerAc(o, o.hoca2.token, { ogrenci_gorur: true, yorum: GORUNUR });
    const geriCekilecek = await degerAc(o, o.s.hoca.token, {
      ogrenci_gorur: true,
      yorum: 'GERI-CEKILEN-YORUM',
    });
    expect(
      (await istek('POST', kurum, o.s.hoca.token, `/degerlendirmeler/${geriCekilecek.id}/geri-cek`))
        .statusCode,
    ).toBe(200);
    // Baska ogrenciye gorunur yazilan da bu ogrenciye gelmez.
    const diger = await degerYaz(
      o,
      o.s.hoca.token,
      { ogrenci_gorur: true, yorum: 'DIGER-OGRENCI-YORUMU' },
      o.ogrenci2.uyelikId,
    );
    expect(diger.statusCode).toBe(201);

    const res = await ogrenciGet(o, '/degerlendirmelerim');
    expect(res.statusCode, res.body).toBe(200);
    const l = res.json<{ degerlendirmeler: Record<string, unknown>[] }>();
    expect(l.degerlendirmeler.map((x) => x.id)).toContain(gorunur.id);
    expect(l.degerlendirmeler).toHaveLength(1);
    for (const gizliAlan of [GIZLI, 'GERI-CEKILEN-YORUM', 'DIGER-OGRENCI-YORUMU']) {
      expect(res.body).not.toContain(gizliAlan);
    }
    expect(res.body).not.toContain(gizli.id);
    expect(res.body).not.toContain(geriCekilecek.id);
    // Sade yuzey: gorunurluk bayragi, yazar kimligi ve surum yok.
    for (const kayit of l.degerlendirmeler) {
      expect(kayit).not.toHaveProperty('ogrenci_gorur');
      expect(kayit).not.toHaveProperty('yazar_id');
      expect(kayit).not.toHaveProperty('surum');
    }
    expect(l.degerlendirmeler.find((x) => x.id === gorunur.id)?.yazar_ad).toBeDefined();

    // Ogrenci rolunun personel uclari: hepsi 403 ve govdede gizli yorum yok.
    const yasakliGet = [
      `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler`,
      `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler?geri_cekilenler=true`,
      `/ogrenciler/${o.ogrenci.uyelikId}/kocluk`,
      `/ogrenciler/${o.ogrenci.uyelikId}/kaynak-onerileri`,
      '/degerlendirme-hatirlatma',
    ];
    for (const yol of yasakliGet) {
      const r = await ogrenciGet(o, yol);
      expect(r.statusCode, yol).toBe(403);
      expect(r.body).not.toContain(GIZLI);
    }
    const yazma = await istek('PATCH', kurum, o.ogrenci.token, `/degerlendirmeler/${gizli.id}`, {
      ogrenci_gorur: true,
    });
    expect(yazma.statusCode).toBe(403);
    const geri = await istek(
      'POST',
      kurum,
      o.ogrenci.token,
      `/degerlendirmeler/${gorunur.id}/geri-cek`,
    );
    expect(geri.statusCode).toBe(403);
    // Ogretmen /degerlendirmelerim ucunu kullanamaz (ogrenci ucu).
    expect((await istek('GET', kurum, o.s.hoca.token, '/degerlendirmelerim')).statusCode).toBe(403);

    // Yazar gorunurlugu sonradan kapatirsa ogrenci artik gormez.
    const kapat = await istek('PATCH', kurum, o.hoca2.token, `/degerlendirmeler/${gorunur.id}`, {
      ogrenci_gorur: false,
    });
    expect(kapat.statusCode, kapat.body).toBe(200);
    const sonra = await ogrenciGet(o, '/degerlendirmelerim');
    expect(sonra.body).not.toContain(GORUNUR);
    // Ikinci ogrenci kendi gorunur kaydini gorur, digerininkini gormez.
    const o2 = await ogrenciGet(o, '/degerlendirmelerim', o.ogrenci2);
    expect(o2.body).toContain('DIGER-OGRENCI-YORUMU');
    expect(o2.body).not.toContain(GIZLI);
  });

  it('olay: gorunur degerlendirmede bir kez yayimlanir ve yorum metni/ad icermez; gizliyi sonradan acinca da bir kez', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const a = await degerAc(o, o.s.hoca.token, { ogrenci_gorur: true, yorum: GORUNUR });
    const b = await degerAc(o, o.s.hoca.token, { yorum: GIZLI });
    let olaylar = await outbox(kurum, 'evt.ogrenme.degerlendirme.yayimlandi.v1');
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]?.payload.data).toEqual({
      degerlendirme_id: a.id,
      ogrenci_id: o.ogrenci.uyelikId,
      yazar_id: o.s.hoca.uyelikId,
    });
    expect(JSON.stringify(olaylar)).not.toContain('Gorunur yorum');
    // Gizliyi ac: olay; tekrar kapat/ac: yeni olay yok.
    for (const gorur of [true, false, true]) {
      const r = await istek('PATCH', kurum, o.s.hoca.token, `/degerlendirmeler/${b.id}`, {
        ogrenci_gorur: gorur,
      });
      expect(r.statusCode, r.body).toBe(200);
    }
    olaylar = await outbox(kurum, 'evt.ogrenme.degerlendirme.yayimlandi.v1');
    expect(olaylar.map((x) => x.payload.data.degerlendirme_id)).toEqual([a.id, b.id]);
    expect(JSON.stringify(olaylar)).not.toContain('GIZLI');
  });

  // --- Duzenleme ve geri cekme -----------------------------------------------------------------

  it('duzenleme: yalniz yazar (digerleri 403, kapsam disi 404), 7 gun sonra 409, geri cekilmis 409, surum cakismasi 409', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const d = await degerAc(o, o.s.hoca.token);
    const yol = `/degerlendirmeler/${d.id}`;
    const ok = await istek('PATCH', kurum, o.s.hoca.token, yol, {
      calisma_duzeni: 2,
      yorum: 'duzeltildi',
      surum: d.surum,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<Deger>()).toMatchObject({ calisma_duzeni: 2, yorum: 'duzeltildi' });
    expect(ok.json<Deger>().surum).toBeGreaterThan(d.surum);
    const eskiSurum = await istek('PATCH', kurum, o.s.hoca.token, yol, {
      yorum: 'x',
      surum: d.surum,
    });
    expect(eskiSurum.statusCode).toBe(409);
    expect(hataKodu(eskiSurum)).toBe('surum_cakismasi');

    // null alani temizler, ama en az bir icerik kalmali.
    const temizle = await istek('PATCH', kurum, o.s.hoca.token, yol, { calisma_duzeni: null });
    expect(temizle.statusCode).toBe(200);
    const bos = await istek('PATCH', kurum, o.s.hoca.token, yol, { yorum: null });
    expect(bos.statusCode).toBe(422);

    // Baskasi: ayni gruptaki ogretmen ve sahip 403; ilgisiz ogretmen 404; ogrenci 403.
    for (const token of [o.hoca2.token, o.s.k.token]) {
      expect((await istek('PATCH', kurum, token, yol, { yorum: 'y' })).statusCode).toBe(403);
    }
    expect((await istek('PATCH', kurum, o.yabanci.token, yol, { yorum: 'y' })).statusCode).toBe(
      404,
    );
    expect((await istek('PATCH', kurum, o.ogrenci.token, yol, { yorum: 'y' })).statusCode).toBe(
      403,
    );
    expect(
      (await istek('PATCH', kurum, o.s.hoca.token, `/degerlendirmeler/${uuidv7()}`, { yorum: 'y' }))
        .statusCode,
    ).toBe(404);

    // 7 gunden sonra: 409 ve duzenlenebilir=false.
    await sistem`update ogrenme.ogretmen_degerlendirmeleri
                    set created_at = now() - interval '8 days' where id = ${d.id}`;
    const gec = await istek('PATCH', kurum, o.s.hoca.token, yol, { yorum: 'gec' });
    expect(gec.statusCode).toBe(409);
    expect(hataKodu(gec)).toBe('degerlendirme_duzenlenemez');
    const liste = await istek(
      'GET',
      kurum,
      o.s.hoca.token,
      `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler`,
    );
    expect(liste.json<{ degerlendirmeler: Deger[] }>().degerlendirmeler[0]).toMatchObject({
      id: d.id,
      duzenlenebilir: false,
    });
    // 7 gunden sonra bile yazar geri cekebilir (silme degil).
    expect((await istek('POST', kurum, o.s.hoca.token, `${yol}/geri-cek`)).statusCode).toBe(200);

    // Geri cekilmis kayit duzenlenemez.
    const d2 = await degerAc(o, o.s.hoca.token);
    await istek('POST', kurum, o.s.hoca.token, `/degerlendirmeler/${d2.id}/geri-cek`);
    const geriCekilmis = await istek('PATCH', kurum, o.s.hoca.token, `/degerlendirmeler/${d2.id}`, {
      yorum: 'y',
    });
    expect(geriCekilmis.statusCode).toBe(409);
    expect(hataKodu(geriCekilmis)).toBe('degerlendirme_geri_cekildi');
  });

  it('geri cekme: yazar ya da sahip/yonetici; baska ogretmen 403; idempotent; silme degil (satir kalir), listeden ve ogrenciden kalkar', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const d = await degerAc(o, o.s.hoca.token, { ogrenci_gorur: true, yorum: GORUNUR });
    const yol = `/degerlendirmeler/${d.id}/geri-cek`;
    expect((await istek('POST', kurum, o.hoca2.token, yol)).statusCode).toBe(403);
    expect((await istek('POST', kurum, o.yabanci.token, yol)).statusCode).toBe(404);
    expect((await istek('POST', kurum, o.ogrenci.token, yol)).statusCode).toBe(403);
    const bir = await istek('POST', kurum, o.s.k.token, yol); // sahip
    expect(bir.statusCode, bir.body).toBe(200);
    expect(bir.json<Deger>().geri_cekildi_at).toBeTruthy();
    const iki = await istek('POST', kurum, o.s.hoca.token, yol); // yazar, tekrar
    expect(iki.statusCode).toBe(200);
    expect(iki.json<Deger>().geri_cekildi_at).toBe(bir.json<Deger>().geri_cekildi_at);

    const liste = `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler`;
    const varsayilan = await istek('GET', kurum, o.s.hoca.token, liste);
    expect(varsayilan.json<{ degerlendirmeler: Deger[] }>().degerlendirmeler).toHaveLength(0);
    const hepsi = await istek('GET', kurum, o.s.hoca.token, `${liste}?geri_cekilenler=true`);
    expect(hepsi.json<{ degerlendirmeler: Deger[] }>().degerlendirmeler.map((x) => x.id)).toEqual([
      d.id,
    ]);
    expect((await ogrenciGet(o, '/degerlendirmelerim')).body).not.toContain(GORUNUR);
    const [satir] =
      await sistem`select geri_cekilen_id from ogrenme.ogretmen_degerlendirmeleri where id = ${d.id}`;
    expect(satir?.geri_cekilen_id).toBe(o.s.k.uyelikId);
  });

  // --- Kaynak onerisi --------------------------------------------------------------------------

  it('kaynak onerisi: dort tur, dogrulama, kapsam; ogrenci yalniz kendine onerilenleri gorur; geri cekme', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const yol = `/ogrenciler/${o.ogrenci.uyelikId}/kaynak-onerileri`;
    const kitapOneri = await istek('POST', kurum, o.s.hoca.token, yol, {
      tur: 'kaynak_kitap',
      kaynak_kitap_id: o.kitap.id,
      konu_id: o.konu,
      not: 'Once 1. uniteyi bitir',
    });
    expect(kitapOneri.statusCode, kitapOneri.body).toBe(201);
    expect(kitapOneri.json<Oneri>()).toMatchObject({
      tur: 'kaynak_kitap',
      kaynak_kitap_ad: 'Biyoloji Soru Bankasi',
      basladi: false,
      benim: true,
    });
    const testOneri = await istek('POST', kurum, o.hoca2.token, yol, {
      tur: 'kaynak_kitap_testi',
      kaynak_test_id: o.kitap.testler[1]?.id,
    });
    expect(testOneri.statusCode, testOneri.body).toBe(201);
    expect(testOneri.json<Oneri>().kaynak_kitap_id).toBe(o.kitap.id);
    const linkOneri = await istek('POST', kurum, o.s.hoca.token, yol, {
      tur: 'link',
      baglanti_url: 'https://ornek.com/video/1',
      baslik: 'Genetik konu anlatimi',
      brans_kodu: 'biyoloji',
    });
    expect(linkOneri.statusCode, linkOneri.body).toBe(201);
    expect(linkOneri.json<Oneri>().basladi).toBeNull();
    const serbest = await istek('POST', kurum, o.s.hoca.token, yol, {
      tur: 'serbest',
      baslik: 'Okulun fasikulu',
    });
    expect(serbest.statusCode, serbest.body).toBe(201);

    // Dogrulama.
    for (const kotu of [
      { tur: 'link', baglanti_url: 'javascript:alert(1)', baslik: 'x' },
      { tur: 'link', baglanti_url: 'ftp://ornek.com/x', baslik: 'x' },
      { tur: 'link', baglanti_url: 'https://ornek.com' },
      { tur: 'serbest', baslik: 'x', konu_id: o.konu },
      { tur: 'bilinmeyen' },
    ]) {
      expect((await istek('POST', kurum, o.s.hoca.token, yol, kotu)).statusCode).toBe(400);
    }
    const yokKitap = await istek('POST', kurum, o.s.hoca.token, yol, {
      tur: 'kaynak_kitap',
      kaynak_kitap_id: uuidv7(),
    });
    expect(yokKitap.statusCode).toBe(422);
    expect(hataKodu(yokKitap)).toBe('kaynak_gecersiz');
    await sistem`update ogrenme.kaynak_kitaplar set aktif = false where id = ${o.kitap.id}`;
    const pasif = await istek('POST', kurum, o.s.hoca.token, yol, {
      tur: 'kaynak_kitap',
      kaynak_kitap_id: o.kitap.id,
    });
    expect(hataKodu(pasif)).toBe('kaynak_gecersiz');
    await sistem`update ogrenme.kaynak_kitaplar set aktif = true where id = ${o.kitap.id}`;

    // Kapsam: ilgisiz ogretmen 404; gruba uye olmayan ogrenci 404; ogrenci 403.
    const baslik = { tur: 'serbest', baslik: 'x' };
    expect((await istek('POST', kurum, o.yabanci.token, yol, baslik)).statusCode).toBe(404);
    expect(
      (
        await istek(
          'POST',
          kurum,
          o.s.hoca.token,
          `/ogrenciler/${o.disOgrenci}/kaynak-onerileri`,
          baslik,
        )
      ).statusCode,
    ).toBe(404);
    expect((await istek('POST', kurum, o.ogrenci.token, yol, baslik)).statusCode).toBe(403);
    expect((await istek('GET', kurum, o.yabanci.token, yol)).statusCode).toBe(404);

    // Personel listesi (ayni gruptaki herkes gorur), ogrenci kendi ucundan.
    const pl = await istek('GET', kurum, o.hoca2.token, yol);
    expect(pl.json<{ oneriler: Oneri[] }>().oneriler).toHaveLength(4);
    const kendi = await ogrenciGet(o, '/kaynak-onerilerim');
    expect(kendi.statusCode, kendi.body).toBe(200);
    expect(kendi.json<{ oneriler: Oneri[] }>().oneriler).toHaveLength(4);
    const baskasi = await ogrenciGet(o, '/kaynak-onerilerim', o.ogrenci2);
    expect(baskasi.json<{ oneriler: Oneri[] }>().oneriler).toHaveLength(0);
    expect(
      (await ogrenciGet(o, yol.replace(o.ogrenci.uyelikId, o.ogrenci.uyelikId))).statusCode,
    ).toBe(403);
    expect((await istek('GET', kurum, o.s.hoca.token, '/kaynak-onerilerim')).statusCode).toBe(403);

    // Olay: oneri basina bir tane, yalniz kimlik.
    const olaylar = await outbox(kurum, 'evt.ogrenme.kaynak_onerisi.eklendi.v1');
    expect(olaylar).toHaveLength(4);
    expect(Object.keys(olaylar[0]?.payload.data ?? {}).sort()).toEqual([
      'ogrenci_id',
      'oneren_id',
      'oneri_id',
      'tur',
    ]);
    expect(JSON.stringify(olaylar)).not.toContain('ornek.com');

    // Geri cekme: oneren ya da sahip; baskasi 403; ogrenci 403; geri cekilen ogrenciden kalkar.
    const id = linkOneri.json<Oneri>().id;
    expect(
      (await istek('POST', kurum, o.hoca2.token, `/kaynak-onerileri/${id}/geri-cek`)).statusCode,
    ).toBe(403);
    expect(
      (await istek('POST', kurum, o.ogrenci.token, `/kaynak-onerileri/${id}/geri-cek`)).statusCode,
    ).toBe(403);
    expect(
      (await istek('POST', kurum, o.yabanci.token, `/kaynak-onerileri/${id}/geri-cek`)).statusCode,
    ).toBe(404);
    expect(
      (await istek('POST', kurum, o.s.hoca.token, `/kaynak-onerileri/${id}/geri-cek`)).statusCode,
    ).toBe(200);
    expect(
      (await istek('POST', kurum, o.s.k.token, `/kaynak-onerileri/${id}/geri-cek`)).statusCode,
    ).toBe(200);
    const sonra = await ogrenciGet(o, '/kaynak-onerilerim');
    expect(sonra.json<{ oneriler: Oneri[] }>().oneriler.map((x) => x.id)).not.toContain(id);
    const hepsi = await istek('GET', kurum, o.s.hoca.token, `${yol}?geri_cekilenler=true`);
    expect(hepsi.json<{ oneriler: Oneri[] }>().oneriler).toHaveLength(4);
  });

  it('basladi: oneriden sonra gunluk kayitta kitap/test/serbest metin kullanilinca true; once kullanilan sayilmaz; link olculemez', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const kayit = (ek: Record<string, unknown>) =>
      istek('POST', kurum, o.ogrenci.token, '/gunluk-soru/kayitlar', {
        brans_kodu: 'biyoloji',
        konu_id: o.konu,
        zorluk: 'orta',
        dogru: 8,
        yanlis: 2,
        bos: 0,
        ...ek,
      });
    // Oneriden ONCE kullanilan test sayilmaz.
    const once = await kayit({ kaynak_test_id: o.kitap.testler[0]?.id });
    expect(once.statusCode, once.body).toBe(201);
    await new Promise((r) => setTimeout(r, 30));
    const yol = `/ogrenciler/${o.ogrenci.uyelikId}/kaynak-onerileri`;
    const test1 = (
      await istek('POST', kurum, o.s.hoca.token, yol, {
        tur: 'kaynak_kitap_testi',
        kaynak_test_id: o.kitap.testler[0]?.id,
      })
    ).json<Oneri>();
    const kitap = (
      await istek('POST', kurum, o.s.hoca.token, yol, {
        tur: 'kaynak_kitap',
        kaynak_kitap_id: o.kitap.id,
      })
    ).json<Oneri>();
    const serbest = (
      await istek('POST', kurum, o.s.hoca.token, yol, { tur: 'serbest', baslik: 'Okulun Fasikulu' })
    ).json<Oneri>();
    const link = (
      await istek('POST', kurum, o.s.hoca.token, yol, {
        tur: 'link',
        baglanti_url: 'https://ornek.com',
        baslik: 'Video',
      })
    ).json<Oneri>();
    const durum = async () => {
      const r = await istek('GET', kurum, o.s.hoca.token, yol);
      return new Map(r.json<{ oneriler: Oneri[] }>().oneriler.map((x) => [x.id, x]));
    };
    let m = await durum();
    expect(m.get(test1.id)?.basladi).toBe(false);
    expect(m.get(kitap.id)?.basladi).toBe(false);
    expect(m.get(serbest.id)?.basladi).toBe(false);

    // Ogrenci o testi ve serbest kaynagi (farkli buyuk/kucuk harf) kullanir.
    expect((await kayit({ kaynak_test_id: o.kitap.testler[0]?.id })).statusCode).toBe(201);
    expect((await kayit({ kaynak_test_id: o.kitap.testler[1]?.id })).statusCode).toBe(201);
    expect((await kayit({ kaynak_metin: ' okulun FASIKULU ' })).statusCode).toBe(201);
    m = await durum();
    expect(m.get(test1.id)).toMatchObject({
      basladi: true,
      kayit_sayisi: 1,
      son_kullanim_gun: BUGUN,
    });
    expect(m.get(kitap.id)).toMatchObject({ basladi: true, kayit_sayisi: 2 }); // kitabin iki testi
    expect(m.get(serbest.id)).toMatchObject({ basladi: true, kayit_sayisi: 1 });
    expect(m.get(link.id)).toMatchObject({ basladi: null, kayit_sayisi: 0 });
    // Ogrenci ayni durumu kendi ucundan gorur.
    const kendi = await ogrenciGet(o, '/kaynak-onerilerim');
    expect(
      kendi.json<{ oneriler: Oneri[] }>().oneriler.find((x) => x.id === test1.id)?.basladi,
    ).toBe(true);
  });

  // --- Hatirlatma ------------------------------------------------------------------------------

  it('hatirlatma: bu hafta KENDI degerlendirmesi olmayan ogrencilerim; baska ogretmenin yazdigi saymaz; geri cekilen saymaz; kapsam disi gorunmez', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const liste = async (token: string) => {
      const r = await istek('GET', kurum, token, '/degerlendirme-hatirlatma');
      expect(r.statusCode, r.body).toBe(200);
      return r.json<{
        hafta_baslangic: string;
        ogrenci_sayisi: number;
        eksik_sayisi: number;
        ogrenciler: { ogrenci_id: string; son_degerlendirme_gun: string | null }[];
      }>();
    };
    let h = await liste(o.s.hoca.token);
    expect(h.hafta_baslangic).toBe(BU_HAFTA);
    expect(h.ogrenci_sayisi).toBe(2);
    expect(h.ogrenciler.map((x) => x.ogrenci_id).sort()).toEqual(
      [o.ogrenci.uyelikId, o.ogrenci2.uyelikId].sort(),
    );
    expect(h.ogrenciler.every((x) => x.son_degerlendirme_gun === null)).toBe(true);
    // Ilgisiz ogretmenin ogrencisi yok: bos liste.
    h = await liste(o.yabanci.token);
    expect([h.ogrenci_sayisi, h.eksik_sayisi, h.ogrenciler.length]).toEqual([0, 0, 0]);

    // Diger ogretmenin yazdigi, bu ogretmenin hatirlatmasini kapatmaz.
    await degerAc(o, o.hoca2.token);
    h = await liste(o.s.hoca.token);
    expect(h.eksik_sayisi).toBe(2);
    // Kendi yazdigi kapatir.
    const d = await degerAc(o, o.s.hoca.token);
    h = await liste(o.s.hoca.token);
    expect(h.ogrenciler.map((x) => x.ogrenci_id)).toEqual([o.ogrenci2.uyelikId]);
    // Geri cekilince yeniden eksik; gecen hafta yazilan bu haftayi kapatmaz.
    await istek('POST', kurum, o.s.hoca.token, `/degerlendirmeler/${d.id}/geri-cek`);
    h = await liste(o.s.hoca.token);
    expect(h.eksik_sayisi).toBe(2);
    await degerAc(o, o.s.hoca.token, {
      donem_baslangic: tarihEkle(BU_HAFTA, -7),
      donem_bitis: tarihEkle(BU_HAFTA, -1),
    });
    h = await liste(o.s.hoca.token);
    expect(h.eksik_sayisi).toBe(2);
    expect(
      h.ogrenciler.find((x) => x.ogrenci_id === o.ogrenci.uyelikId)?.son_degerlendirme_gun,
    ).toBe(tarihEkle(BU_HAFTA, -7));
    // Sahip icin herhangi birinin yazdigi sayar (hoca2'nin yazdigi ogrenci).
    // Kurum kapsamindaki gruba uye olmayan ogrenci de listelenir.
    h = await liste(o.s.k.token);
    expect(h.eksik_sayisi).toBe(2);
    expect(h.ogrenciler.map((x) => x.ogrenci_id).sort()).toEqual(
      [o.ogrenci2.uyelikId, o.disOgrenci].sort(),
    );
  });

  // --- Kocluk gorunumu -------------------------------------------------------------------------

  it('kocluk: tek istekte degerlendirmeler, 4 hafta ortalamasi, kaynaklar, oneriler, konu analizi ve plan/odev; yetki ve kapsam', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    // Degerlendirmeler: bu hafta iki (4 ve 2 -> ortalama 3), 2 hafta once bir (5), 6 hafta once (pencere disi).
    await degerAc(o, o.s.hoca.token, { calisma_duzeni: 4, derse_katilim: 5 });
    await degerAc(o, o.hoca2.token, { calisma_duzeni: 2, ogrenci_gorur: true, yorum: GORUNUR });
    await degerAc(o, o.s.hoca.token, {
      calisma_duzeni: 5,
      donem_baslangic: tarihEkle(BU_HAFTA, -14),
      donem_bitis: tarihEkle(BU_HAFTA, -8),
    });
    await degerAc(o, o.s.hoca.token, {
      calisma_duzeni: 1,
      donem_baslangic: tarihEkle(BU_HAFTA, -42),
      donem_bitis: tarihEkle(BU_HAFTA, -36),
    });
    const geri = await degerAc(o, o.s.hoca.token, { calisma_duzeni: 1 });
    await istek('POST', kurum, o.s.hoca.token, `/degerlendirmeler/${geri.id}/geri-cek`);

    // Oneriler ve kullanilan kaynaklar.
    const oneriYol = `/ogrenciler/${o.ogrenci.uyelikId}/kaynak-onerileri`;
    await istek('POST', kurum, o.s.hoca.token, oneriYol, {
      tur: 'kaynak_kitap_testi',
      kaynak_test_id: o.kitap.testler[0]?.id,
    });
    const gizliOneri = (
      await istek('POST', kurum, o.s.hoca.token, oneriYol, {
        tur: 'serbest',
        baslik: 'Geri cekilecek',
      })
    ).json<Oneri>();
    await istek('POST', kurum, o.s.hoca.token, `/kaynak-onerileri/${gizliOneri.id}/geri-cek`);
    const kayit = (ek: Record<string, unknown>) =>
      istek('POST', kurum, o.ogrenci.token, '/gunluk-soru/kayitlar', {
        brans_kodu: 'biyoloji',
        konu_id: o.konu,
        zorluk: 'zor',
        dogru: 2,
        yanlis: 8,
        bos: 0,
        ...ek,
      });
    expect((await kayit({ kaynak_test_id: o.kitap.testler[0]?.id })).statusCode).toBe(201);
    expect((await kayit({ kaynak_metin: 'Okul fasikulu' })).statusCode).toBe(201);
    // Odev kaynagi.
    const odevId = uuidv7();
    await sistem`
      insert into ogrenme.odevler (id, kurum_id, baslik, brans_kodu, kaynak, hedef_turu, hedef_id, veren_id, durum, yayin_at, son_teslim_at)
      values (${odevId}, ${kurum}, 'Odev', 'biyoloji', 'Palme Yayinlari', 'ogrenci', ${o.ogrenci.uyelikId},
              ${o.s.hoca.uyelikId}, 'yayinda', now(), now() - interval '1 day')`;
    await sistem`
      insert into ogrenme.ogrenci_odevleri (id, kurum_id, odev_id, ogrenci_id, durum, son_teslim_at)
      values (${uuidv7()}, ${kurum}, ${odevId}, ${o.ogrenci.uyelikId}, 'atandi', now() - interval '1 day')`;
    // Plan.
    const planId = uuidv7();
    await sistem`
      insert into ogrenme.haftalik_planlar (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id, durum, yayin_at)
      values (${planId}, ${kurum}, ${o.ogrenci.uyelikId}, ${BU_HAFTA}, ${o.s.hoca.uyelikId}, 'yayinda', now())`;
    await sistem`
      insert into ogrenme.plan_gorevleri
        (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, gerceklesen_miktar, durum, tamamlandi_at, ekleyen_id)
      values (${uuidv7()}, ${kurum}, ${planId}, ${o.ogrenci.uyelikId}, ${BU_HAFTA}, ${BU_HAFTA}, 'biyoloji', 'soru', 40, 40, 'tamam', now(), ${o.s.hoca.uyelikId}),
             (${uuidv7()}, ${kurum}, ${planId}, ${o.ogrenci.uyelikId}, ${BU_HAFTA}, ${BU_HAFTA}, 'biyoloji', 'soru', 30, 5, 'bekliyor', null, ${o.s.hoca.uyelikId})`;

    const yol = `/ogrenciler/${o.ogrenci.uyelikId}/kocluk`;
    const res = await istek('GET', kurum, o.hoca2.token, yol); // ayni gruptaki diger ogretmen de gorur
    expect(res.statusCode, res.body).toBe(200);
    const k = res.json<{
      degerlendirmeler: { degerlendirmeler: Deger[]; sonraki_imlec: string | null };
      olcek_ortalamalari: {
        haftalar: {
          hafta_baslangic: string;
          sayi: number;
          calisma_duzeni: number | null;
          derse_katilim: number | null;
        }[];
        toplam: { sayi: number; calisma_duzeni: number | null };
      };
      kullanilan_kaynaklar: {
        kitaplar: { ad: string; cozulen_test: number; toplam_test: number; kayit_sayisi: number }[];
        serbest: { ad: string; kayit_sayisi: number }[];
        odevler: { ad: string; odev_sayisi: number }[];
      };
      oneriler: Oneri[];
      konu_analizi: {
        toplam: { cozulen: number };
        bransler: { brans_kodu: string; oneriler: unknown[]; toplam: { cozulen: number } }[];
        haftalik_ozet: { cozulen: number };
      };
      plan_odev: {
        plan: {
          gorev_sayisi: number;
          tamam_sayisi: number;
          soru: { planlanan: number; gerceklesen: number };
        } | null;
        odev: { acik: number; geciken: number };
      };
    }>();
    // 1. Zaman cizelgesi: geri cekilen yok, gizli olanlar personelde var ve gorunurluk isaretli.
    expect(k.degerlendirmeler.degerlendirmeler).toHaveLength(4);
    expect(k.degerlendirmeler.degerlendirmeler.some((x) => x.ogrenci_gorur)).toBe(true);
    expect(k.degerlendirmeler.degerlendirmeler.some((x) => !x.ogrenci_gorur)).toBe(true);
    // 2. Ortalamalar: son 4 hafta (6 hafta onceki ve geri cekilen dahil degil).
    expect(k.olcek_ortalamalari.haftalar.map((x) => x.hafta_baslangic)).toEqual([
      tarihEkle(BU_HAFTA, -21),
      tarihEkle(BU_HAFTA, -14),
      tarihEkle(BU_HAFTA, -7),
      BU_HAFTA,
    ]);
    const bu = k.olcek_ortalamalari.haftalar[3];
    expect(bu).toMatchObject({ sayi: 2, calisma_duzeni: 3, derse_katilim: 5 });
    expect(k.olcek_ortalamalari.haftalar[1]).toMatchObject({ sayi: 1, calisma_duzeni: 5 });
    expect(k.olcek_ortalamalari.haftalar[0]).toMatchObject({ sayi: 0, calisma_duzeni: null });
    expect(k.olcek_ortalamalari.toplam).toMatchObject({ sayi: 3, calisma_duzeni: 3.67 });
    // 3. Kaynaklar.
    expect(k.kullanilan_kaynaklar.kitaplar[0]).toMatchObject({
      ad: 'Biyoloji Soru Bankasi',
      cozulen_test: 1,
      toplam_test: 2,
      kayit_sayisi: 1,
    });
    expect(k.kullanilan_kaynaklar.serbest[0]).toMatchObject({
      ad: 'Okul fasikulu',
      kayit_sayisi: 1,
    });
    expect(k.kullanilan_kaynaklar.odevler[0]).toMatchObject({
      ad: 'Palme Yayinlari',
      odev_sayisi: 1,
    });
    // 4. Oneriler: geri cekilen yok; basladi.
    expect(k.oneriler).toHaveLength(1);
    expect(k.oneriler[0]).toMatchObject({ tur: 'kaynak_kitap_testi', basladi: true });
    // 5. Konu analizi (G1 fonksiyonlari): 20 soru, biyoloji, zor bantta basarisiz -> oneriler.
    expect(k.konu_analizi.toplam.cozulen).toBe(20);
    expect(k.konu_analizi.bransler[0]).toMatchObject({
      brans_kodu: 'biyoloji',
      toplam: { cozulen: 20 },
    });
    expect(k.konu_analizi.haftalik_ozet.cozulen).toBe(20);
    // 6. Plan ve odev.
    expect(k.plan_odev.plan).toMatchObject({ gorev_sayisi: 2, tamam_sayisi: 1 });
    expect(k.plan_odev.plan?.soru).toEqual({ planlanan: 70, gerceklesen: 45 });
    expect(k.plan_odev.odev).toMatchObject({ acik: 1, geciken: 1 });

    // Yetki ve kapsam.
    expect((await istek('GET', kurum, o.s.k.token, yol)).statusCode).toBe(200);
    expect((await istek('GET', kurum, o.yabanci.token, yol)).statusCode).toBe(404);
    expect(
      (await istek('GET', kurum, o.s.hoca.token, `/ogrenciler/${o.disOgrenci}/kocluk`)).statusCode,
    ).toBe(404);
    expect((await istek('GET', kurum, o.ogrenci.token, yol)).statusCode).toBe(403);
    expect(
      (await istek('GET', kurum, o.ogrenci.token, `/ogrenciler/${o.ogrenci2.uyelikId}/kocluk`))
        .statusCode,
    ).toBe(403);
    // Baska kurumun belirteci kurum_id uyusmazligi: 403.
    const baska = await y.kurumluKullanici();
    expect((await istek('GET', kurum, baska.token, yol)).statusCode).toBe(403);
  });

  // --- KVKK ------------------------------------------------------------------------------------

  async function silmeIsle(kullaniciId: string) {
    await sistem`
      insert into hesap.silme_talepleri (id, kullanici_id, talep_at, planlanan_at, dogrulama_yontemi, kaynak)
      values (${uuidv7()}, ${kullaniciId}, now() - interval '31 days', now() - interval '1 day', 'otp', 'web')`;
    const sonuc = await kvkkSilmeIsle(sistemDb, {
      log: { info: () => undefined, error: () => undefined },
      iptalEt: () => Promise.resolve(),
    });
    expect(sonuc.tamamlanan).toBeGreaterThanOrEqual(1);
  }

  it('KVKK: ogrenci hesabi silinince hakkindaki degerlendirme ve onerileri silinir; yazar ogretmen silinince kayit kalir, yazar anonim', async () => {
    const o = await ortamKur();
    const kurum = o.s.k.kurumId;
    const d1 = await degerAc(o, o.s.hoca.token, { yorum: 'ogrenci hakkinda kisisel yorum' });
    const d2 = await degerAc(o, o.hoca2.token, { ogrenci_gorur: true, yorum: GORUNUR });
    const dDiger = await degerYaz(
      o,
      o.hoca2.token,
      { yorum: 'baska ogrenci' },
      o.ogrenci2.uyelikId,
    );
    expect(dDiger.statusCode).toBe(201);
    await sistem`update hesap.uyelikler set gorunen_ad = 'Ayse Hoca' where id = ${o.hoca2.uyelikId}`;
    await sistem`update hesap.kullanicilar set gorunen_ad = 'Ayse Hoca' where id = ${o.hoca2.kullaniciId}`;
    const oneriYol = `/ogrenciler/${o.ogrenci.uyelikId}/kaynak-onerileri`;
    const oneri = (
      await istek('POST', kurum, o.hoca2.token, oneriYol, {
        tur: 'serbest',
        baslik: 'Kisisel kaynak notu',
      })
    ).json<Oneri>();
    const digerOneri = await istek(
      'POST',
      kurum,
      o.hoca2.token,
      `/ogrenciler/${o.ogrenci2.uyelikId}/kaynak-onerileri`,
      { tur: 'serbest', baslik: 'Digerine' },
    );
    expect(digerOneri.statusCode).toBe(201);

    // Dis aktarim: ogrenci yalniz kendisine GORUNUR olani alir; gizli ve baskasinin olani yok.
    const aktar = await y.app.inject({
      url: '/v1/hesap/ben/verilerim',
      headers: bearer(o.ogrenci.token),
    });
    expect(aktar.statusCode, aktar.body).toBe(200);
    expect(aktar.body).toContain(GORUNUR);
    expect(aktar.body).toContain('Kisisel kaynak notu');
    expect(aktar.body).not.toContain('kisisel yorum');
    expect(aktar.body).not.toContain('baska ogrenci');
    // Yazar ogretmen kendi yazdiklarini alir.
    const hocaAktar = await y.app.inject({
      url: '/v1/hesap/ben/verilerim',
      headers: bearer(o.hoca2.token),
    });
    expect(hocaAktar.body).toContain(GORUNUR);
    expect(hocaAktar.body).toContain('baska ogrenci');
    expect(hocaAktar.body).not.toContain('kisisel yorum');

    // Yazar ogretmen (hoca2) silinir: kayit kalir, yazar adi anonim.
    await silmeIsle(o.hoca2.kullaniciId);
    const liste = await istek(
      'GET',
      kurum,
      o.s.hoca.token,
      `/ogrenciler/${o.ogrenci.uyelikId}/degerlendirmeler`,
    );
    const kalan = liste.json<{ degerlendirmeler: Deger[] }>().degerlendirmeler;
    expect(kalan.map((x) => x.id).sort()).toEqual([d1.id, d2.id].sort());
    expect(kalan.find((x) => x.id === d2.id)?.yazar_ad).toBeNull();
    expect(liste.body).not.toContain('Ayse');
    expect(
      (await istek('GET', kurum, o.s.hoca.token, oneriYol)).json<{ oneriler: Oneri[] }>().oneriler,
    ).toHaveLength(1);

    // Ogrenci silinir: hakkindaki degerlendirme ve oneriler gider; baska ogrencinin kayitlari kalir.
    await silmeIsle(o.ogrenci.kullaniciId);
    const [a] =
      await sistem`select count(*)::int n from ogrenme.ogretmen_degerlendirmeleri where ogrenci_id = ${o.ogrenci.uyelikId}`;
    const [b] =
      await sistem`select count(*)::int n from ogrenme.kaynak_onerileri where ogrenci_id = ${o.ogrenci.uyelikId}`;
    const [c] =
      await sistem`select count(*)::int n from ogrenme.ogretmen_degerlendirmeleri where ogrenci_id = ${o.ogrenci2.uyelikId}`;
    const [d] =
      await sistem`select count(*)::int n from ogrenme.kaynak_onerileri where ogrenci_id = ${o.ogrenci2.uyelikId}`;
    expect([a?.n, b?.n, c?.n, d?.n]).toEqual([0, 0, 1, 1]);
    expect(oneri.id).toBeTruthy();
  });
});
