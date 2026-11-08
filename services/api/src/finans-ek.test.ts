import { createDb, withTenant, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { finansDunyasi, type FinansDunyasi } from './finans-test-yardimcilari.js';
import {
  dersIptalUygula,
  geceIsiZamanla,
  geceIsleriniCalistir,
  krediVeUcretiUygula,
  type KrediVeUcretiUygulaGirdi,
} from './modules/finans/index.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

const BUGUN = new Date().toISOString().slice(0, 10);

describe.skipIf(dbYok())('finans: ek senaryolar (kapsam, sayfalama, zamanlayici)', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let appDb: Database;
  let sistemDb: Database;
  let d: FinansDunyasi;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 4 });
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
    d = await finansDunyasi(t, sistem);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await appDb.close();
    await sistemDb.close();
  });

  const al = (x: FinansDunyasi, yol: string, token = x.owner.token) =>
    app.inject({ url: x.api(yol), headers: bearer(token) });
  const post = (
    x: FinansDunyasi,
    yol: string,
    payload: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: x.api(yol),
      headers: { ...bearer(x.owner.token), ...headers },
      payload: payload as Record<string, unknown>,
    });
  const uygula = (x: FinansDunyasi, g: Partial<KrediVeUcretiUygulaGirdi> & { ogrenciId: string }) =>
    withTenant(appDb, { kurumId: x.kurumId, kullaniciId: x.owner.kullaniciId }, (tx) =>
      krediVeUcretiUygula(tx, {
        kurumId: x.kurumId,
        dersId: uuidv7(),
        yoklamaId: uuidv7(),
        yoklamaSurumu: 1,
        durum: 'geldi',
        dersYerelTarih: BUGUN,
        grupId: null,
        bransKodu: null,
        grupTuru: null,
        aktorKullaniciId: x.owner.kullaniciId,
        ...g,
      }),
    );

  it('havuzsuz dusum iade edilince bakiye geri gelir; tarifesiz ders basi iade edilecek ucret yok', async () => {
    const o = await d.ogrenciEkle();
    await sistem`insert into finans.ogrenci_finans_profilleri (id, kurum_id, ogrenci_id, model) values (${uuidv7()}, ${d.kurumId}, ${o.uyelikId}, 'paket')`;
    const yoklamaId = uuidv7();
    await uygula(d, { ogrenciId: o.uyelikId, yoklamaId });
    await uygula(d, { ogrenciId: o.uyelikId, yoklamaId, yoklamaSurumu: 2, durum: 'izinli' });
    const [kb] = await sistem<
      { bakiye: number }[]
    >`select bakiye from finans.kredi_bakiyeleri where ogrenci_id = ${o.uyelikId}`;
    expect(kb?.bakiye).toBe(0);
  });

  it('sistem aktoru ve korelasyon kimligi: esik olayi aktor=sistem; iptal dusumu havuzsuz da yazilir', async () => {
    const o = await d.ogrenciEkle();
    const p = await d.paketOlustur({ kredi_adedi: 3, fiyat_kurus: 0 });
    await d.paketSat(o.uyelikId, p.id);
    const sonuc = await withTenant(
      appDb,
      { kurumId: d.kurumId, kullaniciId: d.owner.kullaniciId },
      (tx) =>
        dersIptalUygula(tx, {
          kurumId: d.kurumId,
          dersId: uuidv7(),
          ogrenciId: o.uyelikId,
          iptalKaynagi: 'ogrenci',
          gecIptal: true,
          dersYerelTarih: BUGUN,
          grupId: null,
          bransKodu: null,
          grupTuru: null,
          aktorKullaniciId: null,
        }),
    );
    expect(sonuc.kredi_azaldi).toEqual({ kalan_kredi: 2, esik: 2 });
    const [olay] = await sistem<{ payload: { actor: { tur: string } } }[]>`
      select payload from ortak.outbox where kurum_id = ${d.kurumId} and subject = 'evt.finans.kredi.azaldi.v1'`;
    expect(olay?.payload.actor.tur).toBe('sistem');

    const havuzsuz = await d.ogrenciEkle();
    await sistem`insert into finans.ogrenci_finans_profilleri (id, kurum_id, ogrenci_id, model) values (${uuidv7()}, ${d.kurumId}, ${havuzsuz.uyelikId}, 'paket')`;
    const r = await withTenant(
      appDb,
      { kurumId: d.kurumId, kullaniciId: d.owner.kullaniciId },
      (tx) =>
        dersIptalUygula(tx, {
          kurumId: d.kurumId,
          dersId: uuidv7(),
          ogrenciId: havuzsuz.uyelikId,
          iptalKaynagi: 'ogrenci',
          gecIptal: true,
          dersYerelTarih: BUGUN,
          grupId: null,
          bransKodu: null,
          grupTuru: null,
          aktorKullaniciId: d.owner.kullaniciId,
          correlationId: 'korelasyon-1',
        }),
    );
    expect(r.kalan_kredi).toBe(-1);

    // korelasyon kimligi verilirse olaya yazilir
    const k = await d.ogrenciEkle();
    const pk = await d.paketOlustur({ kredi_adedi: 3, fiyat_kurus: 0 });
    await d.paketSat(k.uyelikId, pk.id);
    await uygula(d, { ogrenciId: k.uyelikId, correlationId: 'korelasyon-2' });
    const [k2] = await sistem<{ payload: { correlationId: string } }[]>`
      select payload from ortak.outbox where kurum_id = ${d.kurumId} and subject = 'evt.finans.kredi.azaldi.v1' and payload->'data'->>'ogrenci_id' = ${k.uyelikId}`;
    expect(k2?.payload.correlationId).toBe('korelasyon-2');
  });

  it('paket listesi: hepsi ve sayfalama; kredi hareketleri sayfalama; bos kart; ucretsiz paket iptali', async () => {
    const x = await finansDunyasi(t, sistem);
    const a = await x.paketOlustur({ ad: 'A' });
    await x.paketOlustur({ ad: 'B' });
    await post(x, `/paketler/${a.id}/arsivle`, undefined);
    const hepsi = (await al(x, '/paketler?durum=hepsi')).json<{ paketler: unknown[] }>();
    expect(hepsi.paketler).toHaveLength(2);
    const s1 = (await al(x, '/paketler?durum=hepsi&limit=1')).json<{
      paketler: unknown[];
      sonraki_imlec: string;
    }>();
    expect(s1.paketler).toHaveLength(1);
    const s2 = (await al(x, `/paketler?durum=hepsi&limit=1&imlec=${s1.sonraki_imlec}`)).json<{
      paketler: unknown[];
      sonraki_imlec: string | null;
    }>();
    expect(s2.paketler).toHaveLength(1);
    expect(s2.sonraki_imlec).toBeNull();

    const o = await x.ogrenciEkle();
    const bos = (await al(x, `/ogrenciler/${o.uyelikId}/finans`)).json<{
      kalan_kredi: number;
      bakiye_kurus: number;
      model: string;
    }>();
    expect(bos).toMatchObject({ kalan_kredi: 0, bakiye_kurus: 0, model: 'yok' });

    const bedava = await x.paketOlustur({ kredi_adedi: 4, fiyat_kurus: 0 });
    const sat = await x.paketSat(o.uyelikId, bedava.id);
    const iptal = await post(x, `/paket-satislari/${sat.govde.satis.id}/iptal`, {
      neden: 'vazgecildi',
    });
    expect(iptal.statusCode).toBe(200);
    const kh1 = (await al(x, `/ogrenciler/${o.uyelikId}/kredi-hareketleri?limit=1`)).json<{
      hareketler: { tur: string }[];
      sonraki_imlec: string;
    }>();
    expect(kh1.hareketler[0]?.tur).toBe('ters_kayit');
    const kh2 = (
      await al(x, `/ogrenciler/${o.uyelikId}/kredi-hareketleri?limit=5&imlec=${kh1.sonraki_imlec}`)
    ).json<{ hareketler: { tur: string }[]; sonraki_imlec: string | null }>();
    expect(kh2.hareketler.map((h) => h.tur)).toEqual(['satin_alma']);
    expect(kh2.sonraki_imlec).toBeNull();
  });

  it('ayni makbuz no baska Idempotency-Key ile 409 makbuz_no_kullanimda', async () => {
    const x = await finansDunyasi(t, sistem);
    const o = await x.ogrenciEkle();
    const govde = { ogrenci_id: o.uyelikId, tutar_kurus: 1000, yontem: 'nakit', makbuz_no: 'M-1' };
    expect((await post(x, '/tahsilatlar', govde, { 'idempotency-key': uuidv7() })).statusCode).toBe(
      201,
    );
    const r = await post(x, '/tahsilatlar', govde, { 'idempotency-key': uuidv7() });
    expect(r.statusCode).toBe(409);
    expect(r.json<{ error: { code: string } }>().error.code).toBe('makbuz_no_kullanimda');
  });

  it('sube kapsamli yonetici yalniz subesindeki ogrencileri gorur (uyelik subesi ya da sube grubu)', async () => {
    const x = await finansDunyasi(t, sistem);
    const subeA = uuidv7();
    const subeB = uuidv7();
    for (const [id, ad] of [
      [subeA, 'Sube A'],
      [subeB, 'Sube B'],
    ] as const) {
      await sistem`insert into hesap.subeler (id, kurum_id, ad) values (${id}, ${x.kurumId}, ${ad})`;
    }
    const yonetici = await x.uyeEkle('yonetici', 'Sube yoneticisi', subeA);
    const dogrudan = await x.ogrenciEkle('Dogrudan A');
    await sistem`update hesap.uyelikler set sube_id = ${subeA} where id = ${dogrudan.uyelikId}`;
    const grupluA = await x.ogrenciEkle('Gruplu A');
    const grupA = await x.grupAc();
    await sistem`update hesap.gruplar set sube_id = ${subeA} where id = ${grupA}`;
    await x.grubaEkle(grupA, grupluA.uyelikId);
    const b = await x.ogrenciEkle('B ogrencisi');
    await sistem`update hesap.uyelikler set sube_id = ${subeB} where id = ${b.uyelikId}`;

    const liste = (await al(x, '/ogrenciler', yonetici.token)).json<{
      ogrenciler: { gorunen_ad: string }[];
      kapsam: string;
    }>();
    expect(liste.kapsam).toBe('sube');
    expect(liste.ogrenciler.map((o) => o.gorunen_ad).sort()).toEqual(['Dogrudan A', 'Gruplu A']);
    expect((await al(x, `/ogrenciler/${b.uyelikId}/finans`, yonetici.token)).statusCode).toBe(404);
    // Sube kapsamli yonetici kurum capinda kapsam gerektiren sablon yazmasini yapamaz
    const paket = await post(x, '/paketler', { ad: 'x', kredi_adedi: 1, fiyat_kurus: 1 });
    expect(paket.statusCode).toBe(201);
    const yaz = await app.inject({
      method: 'POST',
      url: x.api('/paketler'),
      headers: bearer(yonetici.token),
      payload: { ad: 'sube paketi', kredi_adedi: 1, fiyat_kurus: 1 },
    });
    expect(yaz.statusCode).toBe(403);
  });

  describe('gece isi zamanlayicisi', () => {
    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    });
    afterAll(() => {
      vi.useRealTimers();
    });

    it('yalniz Istanbul 03:00 saatinde ve gunde bir kez calisir; hata loglanir ve yeniden denenir', async () => {
      const log = { error: vi.fn(), info: vi.fn() };
      // 2026-03-10 03:30 Istanbul = 00:30 UTC
      let simdi = new Date('2026-03-10T00:30:00Z');
      const durdur = geceIsiZamanla(sistemDb, log, () => simdi);
      await vi.advanceTimersByTimeAsync(3_600_000);
      await vi.waitFor(() =>
        expect(log.info).toHaveBeenCalledWith(expect.anything(), 'finans_gece_isi_bitti'),
      );
      const ilkSayi = log.info.mock.calls.length;
      // ayni gun tekrar: calismaz
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(log.info.mock.calls.length).toBe(ilkSayi);
      // saat 03 degil: calismaz
      simdi = new Date('2026-03-11T10:00:00Z');
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(log.info.mock.calls.length).toBe(ilkSayi);
      await durdur();

      // hata yolu: kapali veritabani baglantisi
      const bozuk = {
        orm: { transaction: () => Promise.reject(new Error('baglanti yok')) },
      } as unknown as Database;
      const log2 = { error: vi.fn(), info: vi.fn() };
      simdi = new Date('2026-03-12T00:30:00Z');
      const durdur2 = geceIsiZamanla(bozuk, log2, () => simdi);
      await vi.advanceTimersByTimeAsync(3_600_000);
      await vi.waitFor(() =>
        expect(log2.error).toHaveBeenCalledWith(expect.anything(), 'finans_gece_isi_hatasi'),
      );
      await durdur2();
    });

    it('geceIsleriniCalistir son kullanma ve ozet denetimini birlikte yurutur', async () => {
      const log = { error: vi.fn(), info: vi.fn() };
      const sonuc = await geceIsleriniCalistir(sistemDb, log);
      expect(sonuc.sonKullanma).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(sonuc.uyusmazlik)).toBe(true);
    });
  });
});
