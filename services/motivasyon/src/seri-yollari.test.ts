import {
  MotivasyonDuraklatmaSema,
  MotivasyonOgrenciDurumuSema,
  MotivasyonSeriDetaySema,
} from '@kopru/contracts';
import { createDb, type Database, type Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seriGeceIsi } from './seri-isleri.js';
import { olay, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testDb,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';
import { planGoreviIsle } from './xp-tuketici.js';

const TABAN = Date.UTC(2026, 10, 9);
const g = (n: number) => new Date(TABAN + n * 86_400_000).toISOString().slice(0, 10);
const ist = (n: number, saat: string) => new Date(`${g(n)}T${saat}:00+03:00`);

describe.skipIf(dbYok())('seri uclari (kullanici JWT, motivasyon_app)', () => {
  let o: Ortam;
  let sistemDb: Database;
  let servis: Service;
  let simdi = ist(4, '12:00');
  const kurumId = uuidv7();
  const ogrenci = yeniKimlik('ogrenci', kurumId);
  const ogretmen = yeniKimlik('ogretmen', kurumId);
  const atanmamis = yeniKimlik('ogretmen', kurumId);
  const yonetici = yeniKimlik('yonetici', kurumId);
  const veli = yeniKimlik('veli', kurumId);
  const grup = uuidv7();
  const digerGrup = uuidv7();
  const s = { kurumId, ogrenciId: ogrenci.uyelikId };

  const istek = async (
    k: Kimlik,
    yontem: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    servis.app.inject({
      method: yontem,
      url,
      headers: yetki(await kullaniciTokeni(k)),
      ...(payload ? { payload } : {}),
    });
  const seriUrl = (kurum = kurumId) => `/v1/motivasyon/kurumlar/${kurum}/benim/seri`;
  const dur = (grupId = grup, kurum = kurumId) =>
    `/v1/motivasyon/kurumlar/${kurum}/gruplar/${grupId}/seri-duraklatmalari`;

  const calis = (at: Date, adet = 1) =>
    o.isle(kurumId, async (tx) => {
      for (let i = 0; i < adet; i++) {
        await planGoreviIsle(tx, olay.plan(s, { at, gorevId: uuidv7(), durum: 'tamam' }));
      }
    });

  beforeAll(async () => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) return;
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
    servis = testServisi({}, { simdi: () => simdi });
    await servis.app.ready();
    for (const gr of [grup, digerGrup]) {
      await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                     values (${gr}, ${kurumId}, 'grup', 'aktif', now(), ${uuidv7()})`;
    }
    await o.sistem`insert into motivasyon.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${uuidv7()}, ${kurumId}, ${grup}, ${ogretmen.uyelikId}, 'matematik', '2026-01-01', now(), ${uuidv7()})`;
    await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${grup}, ${ogrenci.uyelikId}, ${kurumId}, ${uuidv7()}, '2026-01-01', now(), ${uuidv7()})`;
  });
  afterAll(async () => {
    await servis.stop();
    await sistemDb.close();
    await o.kapat();
  });

  it('GET benim/seri: calisma yok -> bos takvim, bugunun hedefleri, ilk kilometre tasi', async () => {
    const r = await istek(ogrenci, 'GET', seriUrl());
    expect(r.statusCode).toBe(200);
    const d = MotivasyonSeriDetaySema.parse(r.json());
    expect(d).toMatchObject({
      bugun: g(4),
      mevcut_seri: 0,
      en_uzun_seri: 0,
      dondurma_stogu: 0,
      onarim_hakki: 1,
      bugun_aktif: false,
      onarim: null,
      sonraki_kilometre_tasi: { hedef: 3, kalan: 3 },
    });
    expect(d.gunler).toHaveLength(35);
    expect(d.gunler.every((x) => x.durum === 'yok')).toBe(true);
    expect(d.gunler.at(-1)).toEqual({ gun: g(4), durum: 'yok', bugun: true });
    expect(d.gunler[0]?.gun).toBe(g(4 - 34));
    expect(d.hedefler).toEqual([
      { tur: 'plan_gorevi', yapilan: 0, esik: 1, kalan: 1 },
      { tur: 'odak_dk', yapilan: 0, esik: 20, kalan: 20 },
      { tur: 'odev', yapilan: 0, esik: 1, kalan: 1 },
      { tur: 'soru', yapilan: 0, esik: 1, kalan: 1 },
    ]);
  });

  it('GET benim/seri ve benim: bozulma sonrasi onarim penceresi, hedefler, takvim durumlari', async () => {
    await calis(ist(1, '12:00'));
    await calis(ist(2, '12:00'));
    await seriGeceIsi({ db: sistemDb }, ist(4, '04:10'), { kurumId });
    const d = MotivasyonSeriDetaySema.parse((await istek(ogrenci, 'GET', seriUrl())).json());
    expect(d).toMatchObject({
      mevcut_seri: 0,
      en_uzun_seri: 2,
      bugun_aktif: false,
      sonraki_kilometre_tasi: { hedef: 3, kalan: 3 },
      onarim: {
        bozulan_gun: g(3),
        bozulan_seri: 2,
        bitis_at: `${g(5)}T01:00:00.000Z`,
        hedefler: [
          { tur: 'plan_gorevi', yapilan: 0, esik: 2, kalan: 2 },
          { tur: 'odak_dk', yapilan: 0, esik: 40, kalan: 40 },
          { tur: 'odev', yapilan: 0, esik: 2, kalan: 2 },
          { tur: 'soru', yapilan: 0, esik: 2, kalan: 2 },
        ],
      },
    });
    expect(d.gunler.slice(-4).map((x) => x.durum)).toEqual(['aktif', 'aktif', 'kacirildi', 'yok']);
    const benim = MotivasyonOgrenciDurumuSema.parse(
      (await istek(ogrenci, 'GET', `/v1/motivasyon/kurumlar/${kurumId}/benim`)).json(),
    );
    expect(benim.seri).toMatchObject({
      mevcut_seri: 0,
      en_uzun_seri: 2,
      son_aktif_gun: g(2),
      bozulan_seri: 2,
      bozulan_gun: g(3),
      onarim_bitis_at: `${g(5)}T01:00:00.000Z`,
    });

    await calis(ist(4, '12:00'));
    const d2 = MotivasyonSeriDetaySema.parse((await istek(ogrenci, 'GET', seriUrl())).json());
    expect(d2.bugun_aktif).toBe(true);
    expect(d2.hedefler[0]).toEqual({ tur: 'plan_gorevi', yapilan: 1, esik: 1, kalan: 0 });
    expect(d2.onarim?.hedefler[0]).toEqual({ tur: 'plan_gorevi', yapilan: 1, esik: 2, kalan: 1 });
    expect(d2.mevcut_seri).toBe(1);
    await calis(ist(4, '13:00'));
    const d3 = MotivasyonSeriDetaySema.parse((await istek(ogrenci, 'GET', seriUrl())).json());
    expect(d3).toMatchObject({ mevcut_seri: 4, onarim_hakki: 0, onarim: null });
    expect(d3.gunler.slice(-4).map((x) => x.durum)).toEqual(['aktif', 'aktif', 'onarim', 'aktif']);
    expect(d3.sonraki_kilometre_tasi).toEqual({ hedef: 7, kalan: 3 });
  });

  it('yetki: kimliksiz 401, baska kurum 403, ogretmen/yonetici/veli 403; modul kapaliysa 403 modul_kapali', async () => {
    expect((await servis.app.inject({ url: seriUrl() })).statusCode).toBe(401);
    expect((await istek(ogrenci, 'GET', seriUrl(uuidv7()))).statusCode).toBe(403);
    for (const k of [ogretmen, yonetici, veli]) {
      expect((await istek(k, 'GET', seriUrl())).statusCode).toBe(403);
    }
    const kapaliKurum = uuidv7();
    const kapaliOgr = yeniKimlik('ogrenci', kapaliKurum);
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kapaliKurum}, 'oyunlastirma', 'kurum', ${kapaliKurum}, false, now(), ${uuidv7()})`;
    const r = await istek(kapaliOgr, 'GET', seriUrl(kapaliKurum));
    expect(r.statusCode).toBe(403);
    expect(r.json<{ error: { code: string } }>().error.code).toBe('modul_kapali');
  });

  // --- duraklatma --------------------------------------------------------------------------
  it('duraklatma: atanmis ogretmen olusturur (201), cakisan aralik 409, listeler, iptal eder, tekrar iptal 404', async () => {
    const r = await istek(ogretmen, 'POST', dur(), {
      baslangic_gun: g(6),
      bitis_gun: g(10),
      neden: 'Bayram tatili',
    });
    expect(r.statusCode).toBe(201);
    const d = MotivasyonDuraklatmaSema.parse(r.json());
    expect(d).toMatchObject({
      grup_id: grup,
      veren_ogretmen_id: ogretmen.uyelikId,
      baslangic_gun: g(6),
      bitis_gun: g(10),
      neden: 'Bayram tatili',
      iptal_at: null,
    });
    const cakisan = await istek(yonetici, 'POST', dur(), {
      baslangic_gun: g(10),
      bitis_gun: g(12),
    });
    expect(cakisan.statusCode).toBe(409);
    const bitisik = await istek(ogretmen, 'POST', dur(), {
      baslangic_gun: g(11),
      bitis_gun: g(12),
    });
    expect(bitisik.statusCode).toBe(201);

    const liste = await istek(ogretmen, 'GET', dur());
    expect(liste.statusCode).toBe(200);
    expect(liste.json<{ duraklatmalar: { id: string }[] }>().duraklatmalar).toHaveLength(2);

    const iptal = await istek(ogretmen, 'DELETE', `${dur()}/${d.id}`);
    expect(iptal.statusCode).toBe(200);
    expect(MotivasyonDuraklatmaSema.parse(iptal.json()).iptal_at).not.toBeNull();
    expect((await istek(ogretmen, 'DELETE', `${dur()}/${d.id}`)).statusCode).toBe(404);
    // iptalden sonra ayni aralik yeniden alinabilir (EXCLUDE yalniz iptal edilmemisleri kapsar)
    const yeniden = await istek(ogretmen, 'POST', dur(), { baslangic_gun: g(6), bitis_gun: g(10) });
    expect(yeniden.statusCode).toBe(201);
  });

  it('duraklatma dogrulama: 31 gunden uzun 422, gecmis gun 422, bitis < baslangic 400, grup bulunamadi 404', async () => {
    const uzun = await istek(yonetici, 'POST', dur(digerGrup), {
      baslangic_gun: g(20),
      bitis_gun: g(51),
    });
    expect(uzun.statusCode).toBe(422);
    const tam31 = await istek(yonetici, 'POST', dur(digerGrup), {
      baslangic_gun: g(20),
      bitis_gun: g(50),
    });
    expect(tam31.statusCode).toBe(201);
    const gecmis = await istek(yonetici, 'POST', dur(digerGrup), {
      baslangic_gun: g(3),
      bitis_gun: g(5),
    });
    expect(gecmis.statusCode).toBe(422);
    const ters = await istek(yonetici, 'POST', dur(digerGrup), {
      baslangic_gun: g(8),
      bitis_gun: g(7),
    });
    expect(ters.statusCode).toBe(400);
    const yok = await istek(yonetici, 'POST', dur(uuidv7()), {
      baslangic_gun: g(8),
      bitis_gun: g(9),
    });
    expect(yok.statusCode).toBe(404);
  });

  it('duraklatma yetkisi: atanmamis ogretmen 403, ogrenci/veli 403, baska kurum 403; yonetici her gruba', async () => {
    const govde = { baslangic_gun: g(60), bitis_gun: g(61) };
    expect((await istek(atanmamis, 'POST', dur(), govde)).statusCode).toBe(403);
    expect((await istek(atanmamis, 'GET', dur())).statusCode).toBe(403);
    expect((await istek(ogretmen, 'POST', dur(digerGrup), govde)).statusCode).toBe(403);
    expect((await istek(ogrenci, 'POST', dur(), govde)).statusCode).toBe(403);
    expect((await istek(veli, 'GET', dur())).statusCode).toBe(403);
    expect((await istek(yonetici, 'POST', dur(), govde)).statusCode).toBe(201);
    expect((await istek(yonetici, 'POST', dur(grup, uuidv7()), govde)).statusCode).toBe(403);
  });

  it('duraklatma gece isinde uygulanir: grup uyesinin gunleri duraklatma, seri bozulmaz', async () => {
    const k = yeniKimlik('ogrenci', kurumId);
    const sk = { kurumId, ogrenciId: k.uyelikId };
    await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${digerGrup}, ${k.uyelikId}, ${kurumId}, ${uuidv7()}, '2026-01-01', now(), ${uuidv7()})`;
    await o.isle(kurumId, async (tx) => {
      for (const n of [1, 2, 3]) {
        await planGoreviIsle(
          tx,
          olay.plan(sk, { at: ist(n, '12:00'), gorevId: uuidv7(), durum: 'tamam' }),
        );
      }
    });
    // digerGrup icin g4..g5 duraklatma (yonetici olusturdu; g20.. kaydi ayrica var)
    simdi = ist(4, '12:00');
    expect(
      (await istek(yonetici, 'POST', dur(digerGrup), { baslangic_gun: g(4), bitis_gun: g(5) }))
        .statusCode,
    ).toBe(201);
    await seriGeceIsi({ db: sistemDb }, ist(6, '04:10'), { kurumId });
    const r = await o.sistem<{ gun: string; durum: string }[]>`
      select gun::text gun, durum from motivasyon.seri_gunleri where ogrenci_id = ${k.uyelikId} order by gun`;
    expect(r.map((x) => `${x.gun}:${x.durum}`)).toEqual([
      `${g(1)}:aktif`,
      `${g(2)}:aktif`,
      `${g(3)}:aktif`,
      `${g(4)}:duraklatma`,
      `${g(5)}:duraklatma`,
    ]);
    const [se] = await o.sistem<{ mevcut_seri: number; dondurma_stogu: number }[]>`
      select mevcut_seri, dondurma_stogu::int as dondurma_stogu from motivasyon.seriler where ogrenci_id = ${k.uyelikId}`;
    expect(se).toEqual({ mevcut_seri: 3, dondurma_stogu: 0 });
  });
});
