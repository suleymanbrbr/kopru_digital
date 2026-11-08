import ExcelJS from 'exceljs';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { finansDunyasi, type FinansDunyasi } from './finans-test-yardimcilari.js';
import { bearer, dbYok, testDb, testServisi, tokenAl } from './test/yardimcilar.js';

interface Hata {
  error: { code: string; message: string };
}
interface Tahsilat {
  id: string;
  durum: string;
  tekrar: boolean;
  tutar_kurus: number;
  makbuz_no: string | null;
  iptal_nedeni: string | null;
}
interface Kart {
  gorunum: 'tam' | 'ogrenci';
  kalan_kredi: number | null;
  bakiye_kurus: number;
  borclu: boolean;
  model: string;
  etkin_paketler: { id: string; kalan_kredi: number }[];
  son_kredi_hareketleri: { tur: string }[];
  son_bakiye_hareketleri: { tur: string; tutar_kurus: number }[];
  odeyen_ad: string | null;
  odeyen_telefon: string | null;
}

describe.skipIf(dbYok())('finans: HTTP uclari', () => {
  const urls = testDb();
  const t = testServisi();
  const { app } = t.service;
  let sistem: postgres.Sql;
  let d: FinansDunyasi;

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    d = await finansDunyasi(t, sistem);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const al = (x: FinansDunyasi, yol: string, token = x.owner.token) =>
    app.inject({ url: x.api(yol), headers: bearer(token) });
  const yolla = (
    x: FinansDunyasi,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    yol: string,
    payload?: unknown,
    token = x.owner.token,
    ek: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: x.api(yol),
      headers: { ...bearer(token), ...ek },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  const kart = async (x: FinansDunyasi, ogrenciId: string, token = x.owner.token) =>
    (await al(x, `/ogrenciler/${ogrenciId}/finans`, token)).json<Kart>();

  describe('paket sablonlari', () => {
    it('olustur, listele, guncelle, arsivle; arsivlenen satilamaz ve varsayilan listede gorunmez', async () => {
      const p = await d.paketOlustur({
        ad: 'Deneme Paketi',
        kredi_adedi: 10,
        fiyat_kurus: 750_000,
        gecerlilik_gun: 90,
        grup_turu: 'birebir',
        brans_kodu: 'matematik',
        kredi_politikasi: { izinli_dusurur: true },
      });
      const liste = (await al(d, '/paketler')).json<{
        paketler: { id: string; kredi_politikasi: unknown }[];
      }>();
      expect(liste.paketler.find((x) => x.id === p.id)?.kredi_politikasi).toEqual({
        izinli_dusurur: true,
      });

      const patch = await yolla(d, 'PATCH', `/paketler/${p.id}`, {
        fiyat_kurus: 800_000,
        ad: 'Yeni Ad',
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json<{ fiyat_kurus: number; surum: number }>()).toMatchObject({
        fiyat_kurus: 800_000,
        surum: 2,
      });
      expect((await yolla(d, 'PATCH', `/paketler/${p.id}`, {})).statusCode).toBe(400);
      expect(
        (await yolla(d, 'PATCH', `/paketler/${p.id}`, { brans_kodu: 'yok_boyle' })).statusCode,
      ).toBe(422);
      expect((await yolla(d, 'PATCH', `/paketler/${uuidv7()}`, { ad: 'x' })).statusCode).toBe(404);

      const arsiv = await yolla(d, 'POST', `/paketler/${p.id}/arsivle`);
      expect(arsiv.json<{ aktif: boolean; arsivlendi_at: string }>().aktif).toBe(false);
      expect((await yolla(d, 'POST', `/paketler/${p.id}/arsivle`)).statusCode).toBe(200);
      expect((await yolla(d, 'POST', `/paketler/${uuidv7()}/arsivle`)).statusCode).toBe(404);
      expect(
        (await al(d, '/paketler'))
          .json<{ paketler: { id: string }[] }>()
          .paketler.some((x) => x.id === p.id),
      ).toBe(false);
      expect(
        (await al(d, '/paketler?durum=arsiv'))
          .json<{ paketler: { id: string }[] }>()
          .paketler.some((x) => x.id === p.id),
      ).toBe(true);
      expect(
        (await yolla(d, 'PATCH', `/paketler/${p.id}`, { ad: 'x' })).json<Hata>().error.code,
      ).toBe('paket_arsivde');
      const o = await d.ogrenciEkle();
      expect((await d.paketSat(o.uyelikId, p.id)).statusCode).toBe(409);
    });

    it('dogrulama: kredi adedi, negatif fiyat, bilinmeyen politika anahtari', async () => {
      for (const govde of [
        { ad: 'x', kredi_adedi: 0, fiyat_kurus: 1 },
        { ad: 'x', kredi_adedi: 1, fiyat_kurus: -1 },
        { ad: 'x', kredi_adedi: 1, fiyat_kurus: 1.5 },
        { ad: 'x', kredi_adedi: 1, fiyat_kurus: 1, kredi_politikasi: { bilinmeyen: true } },
        { ad: 'x', kredi_adedi: 1, fiyat_kurus: 1, brans_kodu: 'yok_boyle' },
      ]) {
        expect([400, 422]).toContain((await yolla(d, 'POST', '/paketler', govde)).statusCode);
      }
    });
  });

  describe('paket satisi', () => {
    it('tamami: satis + kredi + borc + tahsilat tek islemde; bakiye sifir', async () => {
      const o = await d.ogrenciEkle();
      const p = await d.paketOlustur({ gecerlilik_gun: 30 });
      const s = await d.paketSat(o.uyelikId, p.id, {
        tur: 'tamami',
        yontem: 'nakit',
        makbuz_no: 'T-1',
      });
      expect(s.statusCode).toBe(201);
      expect(s.govde.kalan_kredi).toBe(8);
      expect(s.govde.bakiye_kurus).toBe(0);
      expect(s.govde.tahsilat).not.toBeNull();
      expect(s.govde.satis.bitis_tarihi).not.toBeNull();
      const k = await kart(d, o.uyelikId);
      expect(k).toMatchObject({
        gorunum: 'tam',
        kalan_kredi: 8,
        bakiye_kurus: 0,
        borclu: false,
        model: 'paket',
      });
      expect(k.etkin_paketler).toHaveLength(1);
      expect(k.son_bakiye_hareketleri.map((h) => h.tur).sort()).toEqual([
        'paket_satisi',
        'tahsilat',
      ]);
    });

    it('kismi: bakiye = -(fiyat - odenen); sonra: tum fiyat borc', async () => {
      const o = await d.ogrenciEkle();
      const p = await d.paketOlustur({ fiyat_kurus: 600_000 });
      const kismi = await d.paketSat(o.uyelikId, p.id, {
        tur: 'kismi',
        tutar_kurus: 250_000,
        yontem: 'havale',
      });
      expect(kismi.govde.bakiye_kurus).toBe(-350_000);
      expect((await kart(d, o.uyelikId)).borclu).toBe(true);
      const o2 = await d.ogrenciEkle();
      const sonra = await d.paketSat(o2.uyelikId, p.id, { tur: 'sonra' });
      expect(sonra.govde.bakiye_kurus).toBe(-600_000);
      expect(sonra.govde.tahsilat).toBeNull();
      // varsayilan odeme = sonra
      const o3 = await d.ogrenciEkle();
      expect((await d.paketSat(o3.uyelikId, p.id)).govde.bakiye_kurus).toBe(-600_000);
    });

    it('gecersiz odeme: kismi >= fiyat, yontemsiz, sonra + tutar, tamami + tutar; ucretsiz paket tahsilat yazmaz', async () => {
      const o = await d.ogrenciEkle();
      const p = await d.paketOlustur({ fiyat_kurus: 1_000 });
      for (const odeme of [
        { tur: 'kismi', tutar_kurus: 1_000, yontem: 'nakit' },
        { tur: 'kismi', yontem: 'nakit' },
        { tur: 'tamami' },
        { tur: 'sonra', tutar_kurus: 5 },
        { tur: 'tamami', yontem: 'nakit', tutar_kurus: 1_000 },
      ]) {
        expect([400, 422]).toContain((await d.paketSat(o.uyelikId, p.id, odeme)).statusCode);
      }
      const bedava = await d.paketOlustur({ fiyat_kurus: 0 });
      const b = await d.paketSat(o.uyelikId, bedava.id, { tur: 'tamami', yontem: 'nakit' });
      expect(b.statusCode).toBe(201);
      expect(b.govde.tahsilat).toBeNull();
    });

    it('bilinmeyen paket/ogrenci 404; ogrenci olmayan uyelik 404', async () => {
      const o = await d.ogrenciEkle();
      expect((await d.paketSat(o.uyelikId, uuidv7())).statusCode).toBe(404);
      const p = await d.paketOlustur();
      expect((await d.paketSat(uuidv7(), p.id)).statusCode).toBe(404);
      expect((await d.paketSat(d.owner.uyelikId, p.id)).statusCode).toBe(404);
    });

    it('iptal: kredi ve borc ters kayitla geri alinir; kullanilmis paket iptal edilemez; ikinci iptal 409', async () => {
      const o = await d.ogrenciEkle();
      const p = await d.paketOlustur();
      const s = await d.paketSat(o.uyelikId, p.id);
      const id = s.govde.satis.id;
      expect((await yolla(d, 'POST', `/paket-satislari/${id}/iptal`, {})).statusCode).toBe(400); // neden zorunlu
      const iptal = await yolla(d, 'POST', `/paket-satislari/${id}/iptal`, {
        neden: 'yanlis paket',
      });
      expect(iptal.statusCode).toBe(200);
      expect(iptal.json<{ durum: string }>().durum).toBe('iptal');
      const k = await kart(d, o.uyelikId);
      expect(k.kalan_kredi).toBe(0);
      expect(k.bakiye_kurus).toBe(0);
      expect(k.etkin_paketler).toHaveLength(0);
      expect(
        (await yolla(d, 'POST', `/paket-satislari/${id}/iptal`, { neden: 'tekrar' })).json<Hata>()
          .error.code,
      ).toBe('paket_iptal_edilmis');
      expect(
        (await yolla(d, 'POST', `/paket-satislari/${uuidv7()}/iptal`, { neden: 'x' })).statusCode,
      ).toBe(404);

      // kullanilmis paket
      const o2 = await d.ogrenciEkle();
      const s2 = await d.paketSat(o2.uyelikId, p.id);
      await sistem`insert into finans.kredi_hareketleri (id, kurum_id, ogrenci_id, paket_satisi_id, tur, miktar, yoklama_id, yoklama_surumu)
        values (${uuidv7()}, ${d.kurumId}, ${o2.uyelikId}, ${s2.govde.satis.id}, 'dusum', -1, ${uuidv7()}, 1)`;
      const r = await yolla(d, 'POST', `/paket-satislari/${s2.govde.satis.id}/iptal`, {
        neden: 'x',
      });
      expect(r.statusCode).toBe(409);
      expect(r.json<Hata>().error.code).toBe('paket_kullanilmis');
    });
  });

  describe('tahsilat', () => {
    const tahsilat = (
      x: FinansDunyasi,
      ogrenciId: string,
      ek: Record<string, unknown> = {},
      anahtar?: string,
    ) =>
      yolla(
        x,
        'POST',
        '/tahsilatlar',
        { ogrenci_id: ogrenciId, tutar_kurus: 125_000, yontem: 'nakit', ...ek },
        x.owner.token,
        anahtar ? { 'idempotency-key': anahtar } : {},
      );

    it('Idempotency-Key: ayni istek ikinci kez cift kayit olusturmaz (200, tekrar: true)', async () => {
      const o = await d.ogrenciEkle();
      const anahtar = uuidv7();
      const ilk = await tahsilat(d, o.uyelikId, {}, anahtar);
      expect(ilk.statusCode).toBe(201);
      expect(ilk.json<Tahsilat>().tekrar).toBe(false);
      const ikinci = await tahsilat(d, o.uyelikId, {}, anahtar);
      expect(ikinci.statusCode).toBe(200);
      expect(ikinci.json<Tahsilat>()).toMatchObject({ id: ilk.json<Tahsilat>().id, tekrar: true });
      expect((await kart(d, o.uyelikId)).bakiye_kurus).toBe(125_000);
      const [{ n } = { n: 0 }] = await sistem<
        { n: number }[]
      >`select count(*)::int n from finans.tahsilatlar where ogrenci_id = ${o.uyelikId}`;
      expect(n).toBe(1);
    });

    it('esanli ayni anahtar: tek kayit, tek defter satiri, tek olay', async () => {
      const o = await d.ogrenciEkle();
      const anahtar = uuidv7();
      const sonuclar = await Promise.all(
        Array.from({ length: 6 }, () => tahsilat(d, o.uyelikId, {}, anahtar)),
      );
      expect(sonuclar.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 200, 201]);
      expect(new Set(sonuclar.map((r) => r.json<Tahsilat>().id)).size).toBe(1);
      const [a] = await sistem<
        { n: number }[]
      >`select count(*)::int n from finans.tahsilatlar where ogrenci_id = ${o.uyelikId}`;
      const [b] = await sistem<
        { n: number }[]
      >`select count(*)::int n from finans.bakiye_hareketleri where ogrenci_id = ${o.uyelikId}`;
      expect([a?.n, b?.n]).toEqual([1, 1]);
      expect((await kart(d, o.uyelikId)).bakiye_kurus).toBe(125_000);
    });

    it('ayni anahtarla farkli icerik 409; gecersiz anahtar 422; anahtarsiz istekler ayri kayit', async () => {
      const o = await d.ogrenciEkle();
      const anahtar = uuidv7();
      await tahsilat(d, o.uyelikId, {}, anahtar);
      const cakisma = await tahsilat(d, o.uyelikId, { tutar_kurus: 1 }, anahtar);
      expect(cakisma.statusCode).toBe(409);
      expect(cakisma.json<Hata>().error.code).toBe('istek_cakismasi');
      expect((await tahsilat(d, o.uyelikId, {}, 'degil-uuid')).statusCode).toBe(400);
      await tahsilat(d, o.uyelikId);
      await tahsilat(d, o.uyelikId);
      expect((await kart(d, o.uyelikId)).bakiye_kurus).toBe(125_000 * 3);
    });

    it('dogrulama: tutar > 0 tam sayi, gelecek tarih, ayni makbuz no, bilinmeyen ogrenci', async () => {
      const o = await d.ogrenciEkle();
      expect((await tahsilat(d, o.uyelikId, { tutar_kurus: 0 })).statusCode).toBe(400);
      expect((await tahsilat(d, o.uyelikId, { tutar_kurus: 10.5 })).statusCode).toBe(400);
      expect((await tahsilat(d, o.uyelikId, { yontem: 'cek' })).statusCode).toBe(400);
      expect(
        (await tahsilat(d, o.uyelikId, { tahsilat_tarihi: '2999-01-01' })).json<Hata>().error.code,
      ).toBe('odeme_gecersiz');
      expect((await tahsilat(d, o.uyelikId, { makbuz_no: 'MKB-77' })).statusCode).toBe(201);
      expect((await tahsilat(d, o.uyelikId, { makbuz_no: 'MKB-77' })).json<Hata>().error.code).toBe(
        'makbuz_no_kullanimda',
      );
      expect((await tahsilat(d, uuidv7())).statusCode).toBe(404);
      expect((await tahsilat(d, o.uyelikId, { paket_satisi_id: uuidv7() })).statusCode).toBe(404);
    });

    it('iptal: neden zorunlu, ters kayit, bakiye geri; iptalin iptali ve ikinci iptal reddedilir', async () => {
      const o = await d.ogrenciEkle();
      const t1 = (await tahsilat(d, o.uyelikId)).json<Tahsilat>();
      expect((await yolla(d, 'POST', `/tahsilatlar/${t1.id}/iptal`, {})).statusCode).toBe(400);
      expect(
        (await yolla(d, 'POST', `/tahsilatlar/${t1.id}/iptal`, { neden: '  ' })).statusCode,
      ).toBe(400);
      const iptal = await yolla(d, 'POST', `/tahsilatlar/${t1.id}/iptal`, {
        neden: 'yanlis ogrenciye girildi',
      });
      expect(iptal.statusCode).toBe(200);
      expect(iptal.json<Tahsilat>()).toMatchObject({
        durum: 'iptal',
        iptal_nedeni: 'yanlis ogrenciye girildi',
      });
      const k = await kart(d, o.uyelikId);
      expect(k.bakiye_kurus).toBe(0);
      expect(k.son_bakiye_hareketleri.map((h) => h.tur)).toEqual(['ters_kayit', 'tahsilat']);
      const tekrar = await yolla(d, 'POST', `/tahsilatlar/${t1.id}/iptal`, { neden: 'tekrar' });
      expect(tekrar.statusCode).toBe(409);
      expect(tekrar.json<Hata>().error.code).toBe('tahsilat_iptal_edilmis');
      expect(
        (await yolla(d, 'POST', `/tahsilatlar/${uuidv7()}/iptal`, { neden: 'x' })).statusCode,
      ).toBe(404);
      // ters kaydin tersi yok: ters kayit satirini cevirmeye calisan uc nokta bulunmaz; DB de tek ters kayda izin verir
      const [ters] = await sistem<
        { id: string }[]
      >`select id from finans.bakiye_hareketleri where ogrenci_id = ${o.uyelikId} and tur = 'ters_kayit'`;
      const metin = await sistem
        .unsafe(
          `insert into finans.bakiye_hareketleri (id, kurum_id, ogrenci_id, tur, tutar_kurus, kaynak_turu, ters_cevrilen_id, neden)
                 values ('${uuidv7()}', '${d.kurumId}', '${o.uyelikId}', 'ters_kayit', 1, 'elle', (select ters_cevrilen_id from finans.bakiye_hareketleri where id = '${ters?.id ?? ''}'), 'x')`,
        )
        .then(
          () => 'eklendi',
          (e: Error) => e.message,
        );
      expect(metin).toContain('ters_cevrilen_id_uniq');
    });

    it('liste: ogrenci/ay/durum suzgecleri ve sayfalama', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      const idler: string[] = [];
      for (const tarih of ['2025-03-10', '2025-03-31', '2025-04-01']) {
        const r = await tahsilat(x, o.uyelikId, { tahsilat_tarihi: tarih, tutar_kurus: 1000 });
        idler.push(r.json<Tahsilat>().id);
      }
      await yolla(x, 'POST', `/tahsilatlar/${idler[0]}/iptal`, { neden: 'x' });
      const hepsi = (await al(x, '/tahsilatlar')).json<{
        tahsilatlar: { id: string }[];
        kapsam: string;
      }>();
      expect(hepsi.tahsilatlar.map((r) => r.id)).toEqual([...idler].reverse());
      expect(hepsi.kapsam).toBe('kurum');
      const mart = (await al(x, '/tahsilatlar?ay=2025-03&durum=gecerli')).json<{
        tahsilatlar: unknown[];
      }>();
      expect(mart.tahsilatlar).toHaveLength(1);
      const s1 = (await al(x, '/tahsilatlar?limit=2')).json<{
        tahsilatlar: { id: string }[];
        sonraki_imlec: string;
      }>();
      expect(s1.tahsilatlar).toHaveLength(2);
      const s2 = (
        await al(x, `/tahsilatlar?limit=2&imlec=${s1.sonraki_imlec}&ogrenci_id=${o.uyelikId}`)
      ).json<{ tahsilatlar: unknown[]; sonraki_imlec: string | null }>();
      expect(s2.tahsilatlar).toHaveLength(1);
      expect(s2.sonraki_imlec).toBeNull();
    });
  });

  describe('ogrenci karti, profil ve liste', () => {
    it('profil: model ve odeyen yaz/oku; verilmeyen alan degismez; uzunluk siniri; satis modeli ezmez', async () => {
      const o = await d.ogrenciEkle();
      const bos = (await al(d, `/ogrenciler/${o.uyelikId}/finans-profili`)).json<{
        model: string;
        surum: number | null;
      }>();
      expect(bos).toMatchObject({ model: 'yok', surum: null });
      const put = await yolla(d, 'PUT', `/ogrenciler/${o.uyelikId}/finans-profili`, {
        model: 'ders_basi',
        odeyen_ad: 'Fatma Hanım',
        odeyen_telefon: '05551112233',
      });
      expect(put.json()).toMatchObject({
        model: 'ders_basi',
        odeyen_ad: 'Fatma Hanım',
        odeyen_telefon: '05551112233',
      });
      const kismen = await yolla(d, 'PUT', `/ogrenciler/${o.uyelikId}/finans-profili`, {
        odeyen_telefon: null,
      });
      expect(kismen.json()).toMatchObject({
        model: 'ders_basi',
        odeyen_ad: 'Fatma Hanım',
        odeyen_telefon: null,
      });
      expect(
        (await yolla(d, 'PUT', `/ogrenciler/${o.uyelikId}/finans-profili`, {})).statusCode,
      ).toBe(400);
      expect(
        (
          await yolla(d, 'PUT', `/ogrenciler/${o.uyelikId}/finans-profili`, {
            odeyen_ad: 'x'.repeat(201),
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await yolla(d, 'PUT', `/ogrenciler/${o.uyelikId}/finans-profili`, { model: 'bilinmeyen' }))
          .statusCode,
      ).toBe(400);
      // Satis, mevcut modeli degistirmez
      const p = await d.paketOlustur();
      await d.paketSat(o.uyelikId, p.id);
      expect(
        (await al(d, `/ogrenciler/${o.uyelikId}/finans-profili`)).json<{ model: string }>().model,
      ).toBe('ders_basi');
      const k = await kart(d, o.uyelikId);
      expect(k).toMatchObject({ odeyen_ad: 'Fatma Hanım', odeyen_telefon: null });
      expect(
        (await yolla(d, 'PUT', `/ogrenciler/${uuidv7()}/finans-profili`, { model: 'yok' }))
          .statusCode,
      ).toBe(404);
    });

    it('hareket listeleri sayfalanir (yeniden eskiye) ve kalan/bakiye doner', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      const p = await x.paketOlustur({ kredi_adedi: 3, fiyat_kurus: 3000 });
      await x.paketSat(o.uyelikId, p.id, { tur: 'kismi', tutar_kurus: 1000, yontem: 'nakit' });
      const kh = (await al(x, `/ogrenciler/${o.uyelikId}/kredi-hareketleri?limit=1`)).json<{
        hareketler: unknown[];
        kalan_kredi: number;
        sonraki_imlec: string | null;
      }>();
      expect(kh.hareketler).toHaveLength(1);
      expect(kh.kalan_kredi).toBe(3);
      const bh = (await al(x, `/ogrenciler/${o.uyelikId}/bakiye-hareketleri?limit=1`)).json<{
        hareketler: { tur: string }[];
        bakiye_kurus: number;
        sonraki_imlec: string;
      }>();
      expect(bh.hareketler[0]?.tur).toBe('tahsilat');
      expect(bh.bakiye_kurus).toBe(-2000);
      const bh2 = (
        await al(
          x,
          `/ogrenciler/${o.uyelikId}/bakiye-hareketleri?limit=1&imlec=${bh.sonraki_imlec}`,
        )
      ).json<{ hareketler: { tur: string }[]; sonraki_imlec: string | null }>();
      expect(bh2.hareketler[0]?.tur).toBe('paket_satisi');
      expect(bh2.sonraki_imlec).toBeNull();
    });

    it('liste: kalan ders rozeti, ?borclu, ?dusuk_kredi, arama, sayfalama', async () => {
      const x = await finansDunyasi(t, sistem);
      const [ayse, can, ece] = [
        await x.ogrenciEkle('Ayşe'),
        await x.ogrenciEkle('Can'),
        await x.ogrenciEkle('Ece İpek'),
      ];
      const p = await x.paketOlustur({ kredi_adedi: 2, fiyat_kurus: 5000 });
      await x.paketSat(ayse.uyelikId, p.id, { tur: 'tamami', yontem: 'nakit' }); // 2 kredi (esik 2 => dusuk), borcsuz
      await x.paketSat(can.uyelikId, p.id); // borclu, dusuk
      const p10 = await x.paketOlustur({ kredi_adedi: 10, fiyat_kurus: 0 });
      await x.paketSat(ece.uyelikId, p10.id); // 10 kredi, borcsuz

      const hepsi = (await al(x, '/ogrenciler')).json<{
        ogrenciler: {
          gorunen_ad: string;
          kalan_kredi: number;
          dusuk_kredi: boolean;
          borclu: boolean;
        }[];
        dusuk_kredi_esigi: number;
      }>();
      expect(hepsi.dusuk_kredi_esigi).toBe(2);
      expect(hepsi.ogrenciler).toHaveLength(3);
      const ad = (a: string) => hepsi.ogrenciler.find((s) => s.gorunen_ad === a);
      expect(ad('Ayşe')).toMatchObject({ kalan_kredi: 2, dusuk_kredi: true, borclu: false });
      expect(ad('Can')).toMatchObject({ dusuk_kredi: true, borclu: true });
      expect(ad('Ece İpek')).toMatchObject({ kalan_kredi: 10, dusuk_kredi: false, borclu: false });

      const adlar = async (sorgu: string) =>
        (await al(x, `/ogrenciler${sorgu}`))
          .json<{ ogrenciler: { gorunen_ad: string }[] }>()
          .ogrenciler.map((s) => s.gorunen_ad)
          .sort();
      expect(await adlar('?borclu')).toEqual(['Can']);
      expect(await adlar('?borclu=true')).toEqual(['Can']);
      expect(await adlar('?borclu=false')).toEqual(['Ayşe', 'Ece İpek']);
      expect(await adlar('?dusuk_kredi')).toEqual(['Ayşe', 'Can']);
      expect(await adlar('?dusuk_kredi=false')).toEqual(['Ece İpek']);
      expect(await adlar('?dusuk_kredi&borclu')).toEqual(['Can']);
      expect(await adlar('?q=ece')).toEqual(['Ece İpek']);
      expect(await adlar('?q=%25')).toEqual([]);
      const sayfa = (await al(x, '/ogrenciler?limit=2')).json<{
        ogrenciler: unknown[];
        sonraki_imlec: string;
      }>();
      expect(sayfa.ogrenciler).toHaveLength(2);
      const son = (await al(x, `/ogrenciler?limit=2&imlec=${sayfa.sonraki_imlec}`)).json<{
        ogrenciler: unknown[];
        sonraki_imlec: string | null;
      }>();
      expect(son.ogrenciler).toHaveLength(1);
      expect(son.sonraki_imlec).toBeNull();
      expect((await al(x, '/ogrenciler?borclu=belki')).statusCode).toBe(400);
    });

    it('paketsiz (modeli yok) ogrenci dusuk kredi sayilmaz', async () => {
      const x = await finansDunyasi(t, sistem);
      await x.ogrenciEkle('Kayıtsız');
      const r = (await al(x, '/ogrenciler?dusuk_kredi=true')).json<{ ogrenciler: unknown[] }>();
      expect(r.ogrenciler).toHaveLength(0);
    });
  });

  describe('politika, tarife ve ayar uclari', () => {
    it('kredi politikasi: varsayilan, kismi yazma, aralik dogrulamasi', async () => {
      const x = await finansDunyasi(t, sistem);
      const v = (await al(x, '/kredi-politikasi')).json<Record<string, unknown>>();
      expect(v).toMatchObject({
        varsayilan: true,
        geldi_dusurur: true,
        izinli_dusurur: false,
        gec_iptal_saat: 24,
        dusuk_kredi_esigi: 2,
      });
      const put = await yolla(x, 'PUT', '/kredi-politikasi', { dusuk_kredi_esigi: 4 });
      expect(put.json()).toMatchObject({
        varsayilan: false,
        dusuk_kredi_esigi: 4,
        gec_iptal_saat: 24,
      });
      await yolla(x, 'PUT', '/kredi-politikasi', { izinli_dusurur: true });
      expect((await al(x, '/kredi-politikasi')).json()).toMatchObject({
        dusuk_kredi_esigi: 4,
        izinli_dusurur: true,
      });
      expect((await yolla(x, 'PUT', '/kredi-politikasi', { gec_iptal_saat: 169 })).statusCode).toBe(
        400,
      );
    });

    it('tarife: ekle, cakisma, guncelle, sil, dogrulama, 404', async () => {
      const x = await finansDunyasi(t, sistem);
      const grupId = await x.grupAc();
      const a = await yolla(x, 'POST', '/ucret-tarifeleri', {
        grup_id: grupId,
        ucret_kurus: 50_000,
        gecerlilik_baslangic: '2025-01-01',
        gecerlilik_bitis: '2025-06-30',
      });
      expect(a.statusCode).toBe(201);
      const id = a.json<{ id: string }>().id;
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            grup_id: grupId,
            ucret_kurus: 1,
            gecerlilik_baslangic: '2025-06-30',
          })
        ).statusCode,
      ).toBe(409);
      // farkli kapsam cakismaz; ardisik aralik cakismaz
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            ucret_kurus: 1,
            gecerlilik_baslangic: '2025-06-30',
          })
        ).statusCode,
      ).toBe(201);
      const b = await yolla(x, 'POST', '/ucret-tarifeleri', {
        grup_id: grupId,
        ucret_kurus: 60_000,
        gecerlilik_baslangic: '2025-07-01',
      });
      expect(b.statusCode).toBe(201);
      // kendi kendini cakisma saymaz; baska tarifenin icine uzatinca 409
      expect(
        (await yolla(x, 'PATCH', `/ucret-tarifeleri/${id}`, { ucret_kurus: 55_000 })).json<{
          ucret_kurus: number;
        }>().ucret_kurus,
      ).toBe(55_000);
      expect(
        (await yolla(x, 'PATCH', `/ucret-tarifeleri/${id}`, { gecerlilik_bitis: '2025-07-15' }))
          .statusCode,
      ).toBe(409);
      expect(
        (await yolla(x, 'PATCH', `/ucret-tarifeleri/${id}`, { gecerlilik_bitis: '2024-01-01' }))
          .statusCode,
      ).toBe(422);
      expect(
        (await yolla(x, 'PATCH', `/ucret-tarifeleri/${uuidv7()}`, { ucret_kurus: 1 })).statusCode,
      ).toBe(404);
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            grup_id: uuidv7(),
            ucret_kurus: 1,
            gecerlilik_baslangic: '2025-01-01',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            ogrenci_id: uuidv7(),
            ucret_kurus: 1,
            gecerlilik_baslangic: '2025-01-01',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            brans_kodu: 'yok_boyle',
            ucret_kurus: 1,
            gecerlilik_baslangic: '2025-01-01',
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await yolla(x, 'POST', '/ucret-tarifeleri', {
            ucret_kurus: -1,
            gecerlilik_baslangic: '2025-01-01',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await al(x, '/ucret-tarifeleri')).json<{ tarifeler: unknown[] }>().tarifeler,
      ).toHaveLength(3);
      expect((await yolla(x, 'DELETE', `/ucret-tarifeleri/${id}`)).statusCode).toBe(204);
      expect((await yolla(x, 'DELETE', `/ucret-tarifeleri/${id}`)).statusCode).toBe(404);
      expect(
        (await al(x, '/ucret-tarifeleri')).json<{ tarifeler: unknown[] }>().tarifeler,
      ).toHaveLength(2);
    });

    it('finans ayari: varsayilan acik; yaz/oku; kurum ayarlari semasi yeni alani tasir', async () => {
      const x = await finansDunyasi(t, sistem);
      expect((await al(x, '/ayarlar')).json()).toEqual({ ogrenci_kalan_ders_gorur: true });
      expect(
        (await yolla(x, 'PUT', '/ayarlar', { ogrenci_kalan_ders_gorur: false })).json(),
      ).toEqual({ ogrenci_kalan_ders_gorur: false });
      expect((await al(x, '/ayarlar')).json()).toEqual({ ogrenci_kalan_ders_gorur: false });
      const kurum = await app.inject({
        url: `/v1/hesap/kurumlar/${x.kurumId}`,
        headers: bearer(x.owner.token),
      });
      expect(
        kurum.json<{ ayarlar: Record<string, unknown> }>().ayarlar.ogrenci_kalan_ders_gorur,
      ).toBe(false);
      expect((await yolla(x, 'PUT', '/ayarlar', {})).statusCode).toBe(400);
    });

    it('her yazma denetim kaydina duser', async () => {
      const x = await finansDunyasi(t, sistem);
      const o = await x.ogrenciEkle();
      const p = await x.paketOlustur();
      await x.paketSat(o.uyelikId, p.id, { tur: 'kismi', tutar_kurus: 1000, yontem: 'nakit' });
      await yolla(x, 'PUT', '/kredi-politikasi', { dusuk_kredi_esigi: 1 });
      const eylemler = (
        await sistem<
          { eylem: string }[]
        >`select distinct eylem from hesap.denetim_kayitlari where kurum_id = ${x.kurumId}`
      ).map((r) => r.eylem);
      expect(eylemler).toEqual(
        expect.arrayContaining([
          'finans.paket.olusturuldu',
          'finans.paket.satildi',
          'finans.tahsilat.alindi',
          'finans.kredi_politikasi.guncellendi',
        ]),
      );
    });
  });

  describe('ozet ve disa aktarim', () => {
    async function tahsilatlar(x: FinansDunyasi) {
      const ad = await x.ogrenciEkle('Şükrü Çağlar');
      const formul = await x.ogrenciEkle('=HYPERLINK("x")');
      const giris = (
        o: { uyelikId: string },
        tutar: number,
        yontem: string,
        tarih: string,
        ek: Record<string, unknown> = {},
      ) =>
        yolla(x, 'POST', '/tahsilatlar', {
          ogrenci_id: o.uyelikId,
          tutar_kurus: tutar,
          yontem,
          tahsilat_tarihi: tarih,
          ...ek,
        });
      await giris(ad, 123_456, 'nakit', '2025-03-01', {
        aciklama: 'Mart peşinat',
        makbuz_no: 'A-1',
      });
      await giris(ad, 50_000, 'havale', '2025-03-31');
      await giris(formul, 7_777, 'kart', '2025-03-15');
      const iptal = (await giris(ad, 99_999, 'nakit', '2025-03-20')).json<Tahsilat>();
      await yolla(x, 'POST', `/tahsilatlar/${iptal.id}/iptal`, { neden: 'hata' });
      await giris(ad, 11_111, 'nakit', '2025-04-01'); // baska ay
      await giris(ad, 22_222, 'nakit', '2025-02-28'); // baska ay
      await yolla(x, 'PUT', `/ogrenciler/${ad.uyelikId}/finans-profili`, {
        model: 'paket',
        odeyen_ad: 'Zeynep Öztürk',
        odeyen_telefon: '05321234567',
      });
      return { ad, formul };
    }

    it('aylik ozet: gecerli tahsilat toplami, yonteme gore kirilim, iptal haric, ay siniri dogru', async () => {
      const x = await finansDunyasi(t, sistem);
      await tahsilatlar(x);
      const mart = (await al(x, '/ozet/aylik?ay=2025-03')).json<{
        toplam_kurus: number;
        tahsilat_sayisi: number;
        yonteme_gore: { yontem: string; toplam_kurus: number; adet: number }[];
        kapsam: string;
      }>();
      expect(mart.toplam_kurus).toBe(123_456 + 50_000 + 7_777);
      expect(mart.tahsilat_sayisi).toBe(3);
      expect(mart.yonteme_gore).toEqual([
        { yontem: 'havale', toplam_kurus: 50_000, adet: 1 },
        { yontem: 'kart', toplam_kurus: 7_777, adet: 1 },
        { yontem: 'nakit', toplam_kurus: 123_456, adet: 1 },
      ]);
      expect(mart.kapsam).toBe('kurum');
      expect(
        (await al(x, '/ozet/aylik?ay=2025-04')).json<{ toplam_kurus: number }>().toplam_kurus,
      ).toBe(11_111);
      expect((await al(x, '/ozet/aylik?ay=2030-01')).json()).toMatchObject({
        toplam_kurus: 0,
        tahsilat_sayisi: 0,
        yonteme_gore: [],
      });
      expect((await al(x, '/ozet/aylik?ay=2025-13')).statusCode).toBe(400);
      expect((await al(x, '/ozet/aylik')).statusCode).toBe(400);
      expect((await al(x, '/ozet/aylik?ay=2025-12')).statusCode).toBe(200);
    });

    it('xlsx: gercek zip, iki sayfa, kurus TL, Turkce karakter, formul kacirma, odeyen yalniz burada', async () => {
      const x = await finansDunyasi(t, sistem);
      await tahsilatlar(x);
      const res = await al(x, '/disa-aktar?ay=2025-03');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('finans-2025-03.xlsx');
      const govde = res.rawPayload;
      expect(govde.subarray(0, 2).toString('latin1')).toBe('PK');
      const kitap = new ExcelJS.Workbook();
      await kitap.xlsx.load(govde as unknown as ArrayBuffer);
      expect(kitap.worksheets.map((s) => s.name)).toEqual([
        'Tahsilatlar 2025-03',
        'Öğrenci bakiyeleri',
      ]);
      const t1 = kitap.getWorksheet('Tahsilatlar 2025-03');
      const satirlar = (t1?.getSheetValues() ?? []).slice(2) as unknown[][];
      expect(satirlar).toHaveLength(4); // iptal edilen dahil, baska aylar haric
      const metin = JSON.stringify(satirlar);
      expect(metin).toContain('Şükrü Çağlar');
      expect(metin).toContain('Mart peşinat');
      expect(metin).toContain('1234.56');
      expect(metin).toContain('İptal');
      expect(metin).toContain("'=HYPERLINK"); // formul enjeksiyonu kacirildi
      expect(metin).not.toContain('22222');
      const b = kitap.getWorksheet('Öğrenci bakiyeleri');
      const bMetin = JSON.stringify(b?.getSheetValues());
      expect(bMetin).toContain('Zeynep Öztürk');
      expect(bMetin).toContain('05321234567');
      // Bakiye = tum tahsilatlar (iptal dusulmus): 123456+50000+11111+22222 (ders borcu yok) => kurus TL'ye cevrilmis
      expect(bMetin).toContain('2067.89');
      // Excel disinda odeyen hicbir yanitta yok
      expect((await al(x, '/ozet/aylik?ay=2025-03')).body).not.toContain('Zeynep');
      expect((await al(x, '/tahsilatlar')).body).not.toContain('Zeynep');
      expect((await al(x, '/disa-aktar?ay=hatali')).statusCode).toBe(400);
    });
  });

  describe('yetki ve kapsam', () => {
    it('ogretmen kendi grubundaki ogrenciye paket satar/tahsilat alir; baska gruptaki ogrenciyi goremez', async () => {
      const x = await finansDunyasi(t, sistem);
      const hoca = await x.uyeEkle('ogretmen');
      const baskaHoca = await x.uyeEkle('ogretmen');
      const g1 = await x.grupAc();
      const g2 = await x.grupAc();
      await x.ata(g1, hoca.uyelikId);
      await x.ata(g2, baskaHoca.uyelikId);
      const benim = await x.ogrenciEkle('Benim');
      const baska = await x.ogrenciEkle('Baska');
      await x.grubaEkle(g1, benim.uyelikId);
      await x.grubaEkle(g2, baska.uyelikId);
      const p = await x.paketOlustur();

      const sat = await x.paketSat(
        benim.uyelikId,
        p.id,
        { tur: 'kismi', tutar_kurus: 100_000, yontem: 'nakit' },
        hoca.token,
      );
      expect(sat.statusCode).toBe(201);
      expect((await x.paketSat(baska.uyelikId, p.id, undefined, hoca.token)).statusCode).toBe(404);
      const tah = await yolla(
        x,
        'POST',
        '/tahsilatlar',
        { ogrenci_id: benim.uyelikId, tutar_kurus: 5_000, yontem: 'nakit' },
        hoca.token,
      );
      expect(tah.statusCode).toBe(201);
      expect(
        (
          await yolla(
            x,
            'POST',
            '/tahsilatlar',
            { ogrenci_id: baska.uyelikId, tutar_kurus: 5_000, yontem: 'nakit' },
            hoca.token,
          )
        ).statusCode,
      ).toBe(404);

      // Kart: kendi ogrencisi gorunur, digeri 404 (varligi ifsa edilmez)
      expect((await al(x, `/ogrenciler/${benim.uyelikId}/finans`, hoca.token)).statusCode).toBe(
        200,
      );
      expect((await al(x, `/ogrenciler/${baska.uyelikId}/finans`, hoca.token)).statusCode).toBe(
        404,
      );
      expect(
        (await al(x, `/ogrenciler/${baska.uyelikId}/kredi-hareketleri`, hoca.token)).statusCode,
      ).toBe(404);
      expect(
        (await al(x, `/ogrenciler/${baska.uyelikId}/bakiye-hareketleri`, hoca.token)).statusCode,
      ).toBe(404);
      expect(
        (await al(x, `/ogrenciler/${baska.uyelikId}/finans-profili`, hoca.token)).statusCode,
      ).toBe(404);
      expect(
        (
          await yolla(
            x,
            'PUT',
            `/ogrenciler/${baska.uyelikId}/finans-profili`,
            { model: 'yok' },
            hoca.token,
          )
        ).statusCode,
      ).toBe(404);

      // Listeler kapsamla daralir
      const liste = (await al(x, '/ogrenciler', hoca.token)).json<{
        ogrenciler: { ogrenci_id: string }[];
        kapsam: string;
      }>();
      expect(liste.kapsam).toBe('grup');
      expect(liste.ogrenciler.map((o) => o.ogrenci_id)).toEqual([benim.uyelikId]);
      // Baska hocanin tahsilatini baska hoca gormez; kurum sahibi hepsini gorur
      await yolla(
        x,
        'POST',
        '/tahsilatlar',
        { ogrenci_id: baska.uyelikId, tutar_kurus: 9_000, yontem: 'nakit' },
        baskaHoca.token,
      );
      const hocaListe = (await al(x, '/tahsilatlar', hoca.token)).json<{
        tahsilatlar: { ogrenci_id: string }[];
      }>();
      expect(new Set(hocaListe.tahsilatlar.map((r) => r.ogrenci_id))).toEqual(
        new Set([benim.uyelikId]),
      );
      expect(
        (await al(x, '/tahsilatlar')).json<{ tahsilatlar: unknown[] }>().tahsilatlar,
      ).toHaveLength(3);
      // Tahsilat iptali de kapsamla sinirli (baska hocanin kaydi 404)
      const baskaTahsilat = (await al(x, '/tahsilatlar'))
        .json<{ tahsilatlar: { id: string; ogrenci_id: string }[] }>()
        .tahsilatlar.find((r) => r.ogrenci_id === baska.uyelikId);
      expect(
        (
          await yolla(
            x,
            'POST',
            `/tahsilatlar/${baskaTahsilat?.id}/iptal`,
            { neden: 'x' },
            hoca.token,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await yolla(
            x,
            'POST',
            `/tahsilatlar/${tah.json<Tahsilat>().id}/iptal`,
            { neden: 'hata' },
            hoca.token,
          )
        ).statusCode,
      ).toBe(200);

      // Ozet ve Excel yalniz kendi kapsaminda
      const ozet = (
        await al(x, '/ozet/aylik?ay=' + new Date().toISOString().slice(0, 7), hoca.token)
      ).json<{ toplam_kurus: number; kapsam: string }>();
      expect(ozet.kapsam).toBe('grup');
      expect(ozet.toplam_kurus).toBe(100_000);
      const xlsx = await al(
        x,
        '/disa-aktar?ay=' + new Date().toISOString().slice(0, 7),
        hoca.token,
      );
      expect(xlsx.statusCode).toBe(200);
      const kitap = new ExcelJS.Workbook();
      await kitap.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
      const tum = JSON.stringify(kitap.worksheets.map((s) => s.getSheetValues()));
      expect(tum).toContain('Benim');
      expect(tum).not.toContain('Baska');
    });

    it('ogretmen sablon/tarife/politika/ayar yazamaz (403 izin_yok) ama okuyabilir', async () => {
      const x = await finansDunyasi(t, sistem);
      const hoca = await x.uyeEkle('ogretmen');
      const yasak = [
        yolla(x, 'POST', '/paketler', { ad: 'x', kredi_adedi: 1, fiyat_kurus: 1 }, hoca.token),
        yolla(
          x,
          'POST',
          '/ucret-tarifeleri',
          { ucret_kurus: 1, gecerlilik_baslangic: '2025-01-01' },
          hoca.token,
        ),
        yolla(x, 'PUT', '/kredi-politikasi', { dusuk_kredi_esigi: 1 }, hoca.token),
        yolla(x, 'PUT', '/ayarlar', { ogrenci_kalan_ders_gorur: false }, hoca.token),
        yolla(x, 'POST', `/paketler/${uuidv7()}/arsivle`, undefined, hoca.token),
      ];
      for (const r of await Promise.all(yasak)) {
        expect(r.statusCode).toBe(403);
        expect(r.json<Hata>().error.code).toBe('izin_yok');
      }
      for (const yol of ['/paketler', '/ucret-tarifeleri', '/kredi-politikasi', '/ayarlar']) {
        expect((await al(x, yol, hoca.token)).statusCode).toBe(200);
      }
    });

    it('yonetici sablon yonetebilir; baska kurumun kimligiyle istek 403', async () => {
      const x = await finansDunyasi(t, sistem);
      const yon = await x.uyeEkle('yonetici');
      expect(
        (
          await yolla(
            x,
            'POST',
            '/paketler',
            { ad: 'y', kredi_adedi: 2, fiyat_kurus: 10 },
            yon.token,
          )
        ).statusCode,
      ).toBe(201);
      const y = await finansDunyasi(t, sistem);
      const capraz = await app.inject({
        url: `/v1/finans/kurumlar/${x.kurumId}/paketler`,
        headers: bearer(y.owner.token),
      });
      expect(capraz.statusCode).toBe(403);
      expect(
        (await app.inject({ url: `/v1/finans/kurumlar/${x.kurumId}/paketler` })).statusCode,
      ).toBe(401);
    });

    it('bireysel kurumda hoca sahip uyeligiyle girer: ek kural gerekmeden sablon yonetir ve tahsilat alir', async () => {
      const x = await finansDunyasi(t, sistem, 'bireysel');
      const giris = await tokenAl(t, x.owner.oturum, { kurum_id: x.kurumId });
      expect(giris.govde.rol).toBe('sahip');
      expect(
        giris.govde.uyelikler
          .filter((u) => u.kurum_id === x.kurumId)
          .map((u) => u.rol)
          .sort(),
      ).toEqual(['ogretmen', 'sahip']);
      const o = await x.ogrenciEkle();
      const p = await x.paketOlustur();
      expect(
        (await x.paketSat(o.uyelikId, p.id, { tur: 'tamami', yontem: 'nakit' }, giris.accessToken))
          .statusCode,
      ).toBe(201);
      expect(
        (
          await yolla(
            x,
            'POST',
            '/ucret-tarifeleri',
            { ucret_kurus: 1, gecerlilik_baslangic: '2025-01-01' },
            giris.accessToken,
          )
        ).statusCode,
      ).toBe(201);
    });

    it('ogrenci yalniz kendi kalan dersini gorur; fiyat, borc, tahsilat, defter, odeyen asla donmez', async () => {
      const x = await finansDunyasi(t, sistem);
      const ogr = await x.uyeEkle('ogrenci', 'Ogrenci Biri');
      const digeri = await x.ogrenciEkle('Digeri');
      const p = await x.paketOlustur({
        ad: 'Gizli Fiyatli Paket',
        kredi_adedi: 6,
        fiyat_kurus: 424_242,
      });
      await x.paketSat(ogr.uyelikId, p.id, {
        tur: 'kismi',
        tutar_kurus: 100_000,
        yontem: 'nakit',
        makbuz_no: 'GIZLI-1',
      });
      await yolla(x, 'PUT', `/ogrenciler/${ogr.uyelikId}/finans-profili`, {
        odeyen_ad: 'Gizli Veli',
        odeyen_telefon: '05329998877',
      });

      const res = await al(x, `/ogrenciler/${ogr.uyelikId}/finans`, ogr.token);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ gorunum: 'ogrenci', ogrenci_id: ogr.uyelikId, kalan_kredi: 6 });
      for (const yasak of [
        '424242',
        '324242',
        'Gizli',
        'GIZLI-1',
        '05329998877',
        'fiyat',
        'bakiye',
        'tahsilat',
        'odeyen',
        'borc',
      ]) {
        expect(res.body).not.toContain(yasak);
      }
      // Baskasinin karti: 404
      expect((await al(x, `/ogrenciler/${digeri.uyelikId}/finans`, ogr.token)).statusCode).toBe(
        404,
      );
      // Diger tum finans uclari 403
      for (const yol of [
        '/paketler',
        '/tahsilatlar',
        '/ogrenciler',
        '/ucret-tarifeleri',
        '/kredi-politikasi',
        '/ayarlar',
        '/ozet/aylik?ay=2025-03',
        '/disa-aktar?ay=2025-03',
        `/ogrenciler/${ogr.uyelikId}/kredi-hareketleri`,
        `/ogrenciler/${ogr.uyelikId}/bakiye-hareketleri`,
        `/ogrenciler/${ogr.uyelikId}/finans-profili`,
      ]) {
        const r = await al(x, yol, ogr.token);
        expect(r.statusCode, yol).toBe(403);
      }
      expect(
        (
          await yolla(
            x,
            'POST',
            '/tahsilatlar',
            { ogrenci_id: ogr.uyelikId, tutar_kurus: 1, yontem: 'nakit' },
            ogr.token,
          )
        ).statusCode,
      ).toBe(403);
      expect((await x.paketSat(ogr.uyelikId, p.id, undefined, ogr.token)).statusCode).toBe(403);

      // Kurum ayari kapaliysa kalan ders de gizlenir (403 degil, null)
      await yolla(x, 'PUT', '/ayarlar', { ogrenci_kalan_ders_gorur: false });
      const kapali = await al(x, `/ogrenciler/${ogr.uyelikId}/finans`, ogr.token);
      expect(kapali.statusCode).toBe(200);
      expect(kapali.json()).toEqual({
        gorunum: 'ogrenci',
        ogrenci_id: ogr.uyelikId,
        kalan_kredi: null,
      });
      // Personel yine tam goruntuyu alir
      expect((await kart(x, ogr.uyelikId)).gorunum).toBe('tam');
    });
  });
});
