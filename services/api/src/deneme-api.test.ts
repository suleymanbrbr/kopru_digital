import ExcelJS from 'exceljs';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum, type Uye } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface BolumJson {
  bolum_kodu: string;
  brans_kodu: string;
  soru_sayisi: number;
  dogru: number;
  yanlis: number;
  bos: number;
  net: number;
}
interface DenemeJson {
  id: string;
  ogrenci_id: string;
  gorunen_ad: string | null;
  kural_kodu: string;
  yanlis_katsayisi: number;
  ad: string;
  toplam_net: number;
  kaynak: string;
  onay_durumu: string;
  onaylayan_id: string | null;
  red_nedeni: string | null;
  surum: number;
  bolumler: BolumJson[];
}
interface HataGovdesi extends Hata {
  error: Hata['error'] & { details?: { hatalar?: SatirHatasi[]; guncel_surum?: number } };
}
interface SatirHatasi {
  satir: number;
  ogrenci_id: string | null;
  kod: string;
  mesaj: string;
}
interface TopluYanit {
  olusturulan_sayisi: number;
  atlanan_satir_sayisi: number;
  denemeler: { deneme_id: string; ogrenci_id: string; toplam_net: number }[];
}
interface Gelisim {
  deneme_sayisi: number;
  noktalar: {
    deneme_id: string;
    ad: string;
    sinav_tarihi: string;
    toplam_net: number;
    bolumler: { bolum_kodu: string; net: number }[];
  }[];
  son5_sayisi: number;
  son5_ortalama: number | null;
  onceki5_sayisi: number;
  onceki5_ortalama: number | null;
  degisim: number | null;
  bolum_gelisimi: {
    bolum_kodu: string;
    son5_ortalama: number | null;
    onceki5_ortalama: number | null;
    degisim: number | null;
  }[];
}
interface KuralJson {
  id: string;
  kurum_id: string | null;
  global: boolean;
  kod: string;
  yanlis_katsayisi: number;
  bolumler: { bolum_kodu: string; soru_sayisi: number }[];
  surum: number;
  aktif: boolean;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe.skipIf(dbYok())('deneme API: kural, giris, onay, toplu, Excel, gelisim', () => {
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
  const hata = (res: { json: () => unknown }) => (res.json() as HataGovdesi).error;
  const hataKodu = (res: { json: () => unknown }) => hata(res).code;

  const istek = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

  const olaylar = (kurumId: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox
      where kurum_id = ${kurumId} and subject = 'evt.ogrenme.deneme.girildi.v1' order by created_at, id`;

  const denetim = async (kurumId: string, eylem: string) => {
    const [r] = await sistem<{ n: number }[]>`
      select count(*)::int n from hesap.denetim_kayitlari where kurum_id = ${kurumId} and eylem = ${eylem}`;
    return r?.n ?? 0;
  };

  /** Girisli ogrenci (grup uyesi). */
  async function girisliOgrenci(s: Kurulum): Promise<Uye> {
    const o = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [o.uyelikId]);
    return o;
  }

  const tyt = (ek: Record<string, unknown> = {}) => ({
    kural_kodu: 'tyt',
    ad: 'Ozdebir TYT-3',
    yayinevi: 'Test Yayin',
    sinav_tarihi: '2026-03-01',
    bolumler: [
      { bolum_kodu: 'turkce', dogru: 25, yanlis: 2 },
      { bolum_kodu: 'matematik', dogru: 15, yanlis: 2 },
    ],
    ...ek,
  });

  /** Ogretmen adina deneme (onayli). */
  async function denemeEkle(
    s: Kurulum,
    ogrenciId: string,
    ek: Record<string, unknown> = {},
    token = s.hoca.token,
  ) {
    const res = await istek(
      'POST',
      s.k.kurumId,
      token,
      '/denemeler',
      tyt({ ogrenci_id: ogrenciId, ...ek }),
    );
    expect(res.statusCode, res.body).toBe(201);
    return res.json<DenemeJson>();
  }

  // --- Net hesabi ve bolum kurallari --------------------------------------------------------

  describe('net hesabi', () => {
    it('LGS toplu net: 20 dogru 3 yanlis = 19.00, 20 dogru 1 yanlis = 19.67; TYT 40 dogru 4 yanlis = 39.00', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const [a, b, c] = s.ogrenciler;
      if (!a || !b || !c) throw new Error('ogrenci yok');
      const lgs = (ogrenciId: string, turkce: [number, number], matematik: [number, number]) =>
        istek('POST', s.k.kurumId, s.hoca.token, '/denemeler', {
          kural_kodu: 'lgs',
          ogrenci_id: ogrenciId,
          ad: 'LGS 1',
          sinav_tarihi: '2026-02-01',
          bolumler: [
            { bolum_kodu: 'turkce', dogru: turkce[0], yanlis: turkce[1] },
            { bolum_kodu: 'matematik', dogru: matematik[0], yanlis: matematik[1] },
          ],
        });
      // 12+8 = 20 dogru, 3 yanlis: 12 - 0.9999 -> 11.00; 8 -> toplam 19.00
      const r1 = await lgs(a, [12, 3], [8, 0]);
      expect(r1.statusCode, r1.body).toBe(201);
      const d1 = r1.json<DenemeJson>();
      expect(d1.toplam_net).toBe(19);
      expect(typeof d1.toplam_net).toBe('number');
      expect(d1.yanlis_katsayisi).toBe(0.3333);
      // 14+6 = 20 dogru, 1 yanlis: 14 - 0.3333 -> 13.67; + 6 = 19.67
      const d2 = (await lgs(b, [14, 1], [6, 0])).json<DenemeJson>();
      expect(d2.toplam_net).toBe(19.67);
      expect(d2.bolumler.find((x) => x.bolum_kodu === 'turkce')?.net).toBe(13.67);
      // TYT: 25+15 = 40 dogru, 2+2 = 4 yanlis: 24.5 + 14.5 = 39.00
      const d3 = await denemeEkle(s, c);
      expect(d3.toplam_net).toBe(39);
      expect(d3.yanlis_katsayisi).toBe(0.25);
      // Veritabani uretilmis sutunu ve SUM(net) ayni
      const [db] = await sistem<{ toplam: string; toplam_bolum: string }[]>`
        select d.toplam_net::text toplam, (select sum(net) from ogrenme.deneme_bolumleri b where b.deneme_id = d.id)::text toplam_bolum
        from ogrenme.denemeler d where d.id = ${d3.id}`;
      expect(db?.toplam).toBe('39.00');
      expect(db?.toplam_bolum).toBe('39.00');
    });

    it('dogru+yanlis+bos = soru_sayisi: bos hesaplanir; tutmayan toplam ve bilinmeyen bolum 422', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = s.ogrenciler[0] ?? '';
      const d = await denemeEkle(s, o);
      const turkce = d.bolumler.find((b) => b.bolum_kodu === 'turkce');
      expect(turkce).toMatchObject({ soru_sayisi: 40, dogru: 25, yanlis: 2, bos: 13 });
      for (const b of d.bolumler) expect(b.dogru + b.yanlis + b.bos).toBe(b.soru_sayisi);
      const fazla = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({
          ogrenci_id: o,
          ad: 'Fazla',
          bolumler: [{ bolum_kodu: 'turkce', dogru: 30, yanlis: 11 }],
        }),
      );
      expect(fazla.statusCode).toBe(422);
      expect(hataKodu(fazla)).toBe('deneme_bolum_gecersiz');
      const tutmaz = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({
          ogrenci_id: o,
          ad: 'Tutmaz',
          bolumler: [{ bolum_kodu: 'turkce', dogru: 10, yanlis: 10, bos: 10 }],
        }),
      );
      expect(tutmaz.statusCode).toBe(422);
      const yok = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({
          ogrenci_id: o,
          ad: 'Yok',
          bolumler: [{ bolum_kodu: 'fizik', dogru: 1, yanlis: 0 }],
        }),
      );
      expect(yok.statusCode).toBe(422);
      const tekrar = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({
          ogrenci_id: o,
          ad: 'Tekrar',
          bolumler: [
            { bolum_kodu: 'turkce', dogru: 1, yanlis: 0 },
            { bolum_kodu: 'turkce', dogru: 2, yanlis: 0 },
          ],
        }),
      );
      expect(tekrar.statusCode).toBe(400);
    });

    it('AYT sozel: Tarih-1 ve Tarih-2 ayni bransin iki bolumu olarak girilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler', {
        kural_kodu: 'ayt_soz',
        ogrenci_id: s.ogrenciler[0],
        ad: 'AYT Soz 1',
        sinav_tarihi: '2026-04-01',
        bolumler: [
          { bolum_kodu: 'tarih_1', dogru: 8, yanlis: 1 },
          { bolum_kodu: 'tarih_2', dogru: 9, yanlis: 2 },
          { bolum_kodu: 'cografya_1', dogru: 5, yanlis: 1 },
          { bolum_kodu: 'cografya_2', dogru: 10, yanlis: 1 },
        ],
      });
      expect(res.statusCode, res.body).toBe(201);
      const d = res.json<DenemeJson>();
      expect(d.bolumler.filter((b) => b.brans_kodu === 'tarih')).toHaveLength(2);
      expect(d.toplam_net).toBe(7.75 + 8.5 + 4.75 + 9.75);
    });

    it('kural degisse eski net degismez; yeni deneme yeni katsayiyi kullanir', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [a, b] = s.ogrenciler;
      const olustur = await istek('POST', s.k.kurumId, s.k.token, '/deneme-kurallari', {
        kod: 'ozel_dene',
        ad: 'Ozel Deneme',
        yanlis_katsayisi: 0.25,
        bolumler: [
          { bolum_kodu: 'mat', brans_kodu: 'matematik', ad: 'Matematik', soru_sayisi: 20 },
        ],
        gecerli_yil: 2026,
      });
      expect(olustur.statusCode, olustur.body).toBe(201);
      const kural = olustur.json<KuralJson>();
      const girdi = (ogrenci: string | undefined, ad: string) => ({
        kural_id: kural.id,
        ogrenci_id: ogrenci,
        ad,
        sinav_tarihi: '2026-05-01',
        bolumler: [{ bolum_kodu: 'mat', dogru: 16, yanlis: 4 }],
      });
      const eski = (
        await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler', girdi(a, 'Eski'))
      ).json<DenemeJson>();
      expect(eski.toplam_net).toBe(15);
      const guncel = await istek('PATCH', s.k.kurumId, s.k.token, `/deneme-kurallari/${kural.id}`, {
        surum: kural.surum,
        yanlis_katsayisi: 0.5,
      });
      expect(guncel.statusCode, guncel.body).toBe(200);
      const okunan = (
        await istek('GET', s.k.kurumId, s.hoca.token, `/denemeler/${eski.id}`)
      ).json<DenemeJson>();
      expect(okunan.toplam_net).toBe(15);
      expect(okunan.yanlis_katsayisi).toBe(0.25);
      const yeni = (
        await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler', girdi(b, 'Yeni'))
      ).json<DenemeJson>();
      expect(yeni.toplam_net).toBe(14);
      // eski denemeyi duzeltince de eski katsayi kullanilir (kopya)
      const duzelt = await istek('PATCH', s.k.kurumId, s.hoca.token, `/denemeler/${eski.id}`, {
        surum: okunan.surum,
        bolumler: [{ bolum_kodu: 'mat', dogru: 16, yanlis: 4 }],
      });
      expect(duzelt.json<DenemeJson>().toplam_net).toBe(15);
    });
  });

  // --- Kurallar -----------------------------------------------------------------------------

  describe('kurallar', () => {
    it('liste: global ve kurum ozel; global yazilamaz; ogretmen kural yazamaz; kod tekil', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const liste = await istek('GET', s.k.kurumId, s.hoca.token, '/deneme-kurallari');
      expect(liste.statusCode, liste.body).toBe(200);
      const kurallar = liste.json<{ kurallar: KuralJson[] }>().kurallar;
      expect(
        kurallar
          .filter((k) => k.global)
          .map((k) => k.kod)
          .sort(),
      ).toEqual(['ayt_dil', 'ayt_ea', 'ayt_say', 'ayt_soz', 'lgs', 'tyt', 'ydt']);
      const lgs = kurallar.find((k) => k.kod === 'lgs');
      expect(lgs?.yanlis_katsayisi).toBe(0.3333);
      expect(lgs?.bolumler.reduce((t, b) => t + b.soru_sayisi, 0)).toBe(90);
      const govde = {
        kod: 'ozel_a1',
        ad: 'Ozel',
        yanlis_katsayisi: 0.25,
        bolumler: [{ bolum_kodu: 'a', brans_kodu: 'matematik', ad: 'A', soru_sayisi: 10 }],
      };
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, '/deneme-kurallari', govde)).statusCode,
      ).toBe(403);
      const ok = await istek('POST', s.k.kurumId, s.k.token, '/deneme-kurallari', govde);
      expect(ok.statusCode, ok.body).toBe(201);
      expect(
        (await istek('POST', s.k.kurumId, s.k.token, '/deneme-kurallari', govde)).statusCode,
      ).toBe(409);
      for (const kotu of [
        { ...govde, kod: 'tyt' },
        {
          ...govde,
          kod: 'ozel_b2',
          bolumler: [{ bolum_kodu: 'a', brans_kodu: 'yok_boyle', ad: 'A', soru_sayisi: 5 }],
        },
        { ...govde, kod: 'ozel_b3', yanlis_katsayisi: 2 },
      ]) {
        const r = await istek('POST', s.k.kurumId, s.k.token, '/deneme-kurallari', kotu);
        expect([400, 422]).toContain(r.statusCode);
      }
      const global = kurallar.find((k) => k.kod === 'tyt');
      const yaz = await istek('PATCH', s.k.kurumId, s.k.token, `/deneme-kurallari/${global?.id}`, {
        surum: global?.surum,
        ad: 'ele gecirildi',
      });
      expect(yaz.statusCode).toBe(403);
      expect(hataKodu(yaz)).toBe('global_kural_yazilamaz');
      const sil = await istek('DELETE', s.k.kurumId, s.k.token, `/deneme-kurallari/${global?.id}`);
      expect(sil.statusCode).toBe(403);
      // baska kurum yolu
      expect((await istek('GET', uuidv7(), s.k.token, '/deneme-kurallari')).statusCode).toBe(403);
    });

    it('kurum ozel kural baska kuruma gorunmez; kullanimdaki kural silinemez (409), kullanilmayan silinir; surum cakismasi', async () => {
      const a = await y.kur({ ogrenciSayisi: 1 });
      const b = await y.kur({ ogrenciSayisi: 0 });
      const govde = {
        kod: 'ozel_x',
        ad: 'X',
        yanlis_katsayisi: 0.25,
        bolumler: [{ bolum_kodu: 'a', brans_kodu: 'matematik', ad: 'A', soru_sayisi: 10 }],
      };
      const kural = (
        await istek('POST', a.k.kurumId, a.k.token, '/deneme-kurallari', govde)
      ).json<KuralJson>();
      const bListe = (await istek('GET', b.k.kurumId, b.k.token, '/deneme-kurallari')).json<{
        kurallar: KuralJson[];
      }>();
      expect(bListe.kurallar.map((k) => k.id)).not.toContain(kural.id);
      expect(
        (
          await istek('PATCH', b.k.kurumId, b.k.token, `/deneme-kurallari/${kural.id}`, {
            surum: 1,
            ad: 'x',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await istek('DELETE', b.k.kurumId, b.k.token, `/deneme-kurallari/${kural.id}`)).statusCode,
      ).toBe(404);
      const eski = await istek('PATCH', a.k.kurumId, a.k.token, `/deneme-kurallari/${kural.id}`, {
        surum: 99,
        ad: 'y',
      });
      expect(eski.statusCode).toBe(409);
      expect(hata(eski).details?.guncel_surum).toBe(1);
      const kullanan = await istek('POST', a.k.kurumId, a.hoca.token, '/denemeler', {
        kural_id: kural.id,
        ogrenci_id: a.ogrenciler[0],
        ad: 'D',
        sinav_tarihi: '2026-05-01',
        bolumler: [{ bolum_kodu: 'a', dogru: 5, yanlis: 1 }],
      });
      expect(kullanan.statusCode, kullanan.body).toBe(201);
      const sil = await istek('DELETE', a.k.kurumId, a.k.token, `/deneme-kurallari/${kural.id}`);
      expect(sil.statusCode).toBe(409);
      expect(hataKodu(sil)).toBe('kural_kullanimda');
      const pasif = await istek('PATCH', a.k.kurumId, a.k.token, `/deneme-kurallari/${kural.id}`, {
        surum: 1,
        aktif: false,
      });
      expect(pasif.statusCode).toBe(200);
      // pasif kural yeni deneme icin cozulemez
      const pasifDeneme = await istek('POST', a.k.kurumId, a.hoca.token, '/denemeler', {
        kural_id: kural.id,
        ogrenci_id: a.ogrenciler[0],
        ad: 'D2',
        sinav_tarihi: '2026-05-02',
        bolumler: [{ bolum_kodu: 'a', dogru: 5, yanlis: 1 }],
      });
      expect(pasifDeneme.statusCode).toBe(404);
      const bos = (
        await istek('POST', a.k.kurumId, a.k.token, '/deneme-kurallari', {
          ...govde,
          kod: 'ozel_y',
        })
      ).json<KuralJson>();
      expect(
        (await istek('DELETE', a.k.kurumId, a.k.token, `/deneme-kurallari/${bos.id}`)).statusCode,
      ).toBe(204);
      expect(await denetim(a.k.kurumId, 'deneme_kurali.olustur')).toBe(2);
      expect(await denetim(a.k.kurumId, 'deneme_kurali.sil')).toBe(1);
    });
  });

  // --- Giris, yetki, kapsam, olay -----------------------------------------------------------

  describe('ogretmen girisi, kapsam ve olay', () => {
    it('ogretmen girisi onayli, tek olay (kisisel veri yok), denetim kaydi; duzeltme olayi tekrarlamaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = s.ogrenciler[0] ?? '';
      const d = await denemeEkle(s, o, { not: 'ozel not metni', ad: 'Gizli Deneme Adi' });
      expect(d).toMatchObject({
        kaynak: 'ogretmen',
        onay_durumu: 'onaylandi',
        onaylayan_id: s.hoca.uyelikId,
        kural_kodu: 'tyt',
      });
      expect(d.gorunen_ad).toBe('Ogrenci 1');
      const ev = await olaylar(s.k.kurumId);
      expect(ev).toHaveLength(1);
      const veri = ev[0]?.payload.data ?? {};
      expect(Object.keys(veri).sort()).toEqual([
        'deneme_id',
        'kural_kodu',
        'ogrenci_id',
        'sinav_tarihi',
        'toplam_net',
      ]);
      expect(veri).toMatchObject({
        deneme_id: d.id,
        ogrenci_id: o,
        kural_kodu: 'tyt',
        sinav_tarihi: '2026-03-01',
        toplam_net: 39,
      });
      const ham = JSON.stringify(ev[0]?.payload);
      for (const yasak of ['ozel not metni', 'Gizli Deneme Adi', 'Ogrenci 1', 'Test Yayin']) {
        expect(ham).not.toContain(yasak);
      }
      expect(await denetim(s.k.kurumId, 'deneme.olustur')).toBe(1);
      // duzeltme: surum + bolumler tek islemde; toplam_net yenilenir; yeni olay yok
      const duzelt = await istek('PATCH', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}`, {
        surum: d.surum,
        ad: 'Yeni Ad',
        bolumler: [{ bolum_kodu: 'turkce', dogru: 30, yanlis: 0 }],
      });
      expect(duzelt.statusCode, duzelt.body).toBe(200);
      const yeni = duzelt.json<DenemeJson>();
      expect(yeni.toplam_net).toBe(30);
      expect(yeni.bolumler).toHaveLength(1);
      expect(yeni.ad).toBe('Yeni Ad');
      expect(yeni.surum).toBeGreaterThan(d.surum);
      expect(await olaylar(s.k.kurumId)).toHaveLength(1);
      const eskiSurum = await istek('PATCH', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}`, {
        surum: d.surum,
        ad: 'x',
      });
      expect(eskiSurum.statusCode).toBe(409);
      expect(hataKodu(eskiSurum)).toBe('surum_cakismasi');
      expect(await denetim(s.k.kurumId, 'deneme.guncelle')).toBe(1);
      // ayni ogrenci/kural/tarih/ad ikinci kez 409
      const tekrar = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({ ogrenci_id: o, ad: 'Yeni Ad' }),
      );
      expect(tekrar.statusCode).toBe(409);
      expect(hataKodu(tekrar)).toBe('deneme_zaten_var');
      // sil
      const sil = await istek(
        'DELETE',
        s.k.kurumId,
        s.hoca.token,
        `/denemeler/${d.id}?surum=${yeni.surum}`,
      );
      expect(sil.statusCode).toBe(204);
      expect((await istek('GET', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}`)).statusCode).toBe(
        404,
      );
      const [kalan] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.deneme_bolumleri where deneme_id = ${d.id}`;
      expect(kalan?.n).toBe(0);
      expect(await denetim(s.k.kurumId, 'deneme.sil')).toBe(1);
    });

    it('kapsam: atanmamis ogretmen 404; baska ogrencinin sonucu donmez; ogrenci yalniz kendi', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o1 = s.ogrenciler[0] ?? '';
      const ogr = await girisliOgrenci(s);
      const d = await denemeEkle(s, o1);
      const baskasi = await y.davetliUye(s.k, 'ogretmen'); // gruba atanmamis
      const dis = await istek(
        'POST',
        s.k.kurumId,
        baskasi.token,
        '/denemeler',
        tyt({ ogrenci_id: o1, ad: 'Dis' }),
      );
      expect(dis.statusCode).toBe(404);
      expect(
        (await istek('GET', s.k.kurumId, baskasi.token, `/denemeler/${d.id}`)).statusCode,
      ).toBe(404);
      expect(
        (
          await istek('PATCH', s.k.kurumId, baskasi.token, `/denemeler/${d.id}`, {
            surum: 1,
            ad: 'x',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await istek('DELETE', s.k.kurumId, baskasi.token, `/denemeler/${d.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await istek('POST', s.k.kurumId, baskasi.token, `/denemeler/${d.id}/onay`)).statusCode,
      ).toBe(404);
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            baskasi.token,
            `/ogrenciler/${o1}/deneme-gelisim?kural=tyt`,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            baskasi.token,
            `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`,
          )
        ).statusCode,
      ).toBe(404);
      const liste = (await istek('GET', s.k.kurumId, baskasi.token, '/denemeler')).json<{
        denemeler: DenemeJson[];
      }>();
      expect(liste.denemeler).toHaveLength(0);
      // ogrenci: baskasinin sonucuna 404, baskasi adina giris 404, sinif listesi/ozeti 403
      expect((await istek('GET', s.k.kurumId, ogr.token, `/denemeler/${d.id}`)).statusCode).toBe(
        404,
      );
      expect(
        (await istek('GET', s.k.kurumId, ogr.token, `/ogrenciler/${o1}/deneme-gelisim?kural=tyt`))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await istek(
            'POST',
            s.k.kurumId,
            ogr.token,
            '/denemeler',
            tyt({ ogrenci_id: o1, ad: 'Baskasi' }),
          )
        ).statusCode,
      ).toBe(404);
      expect((await istek('GET', s.k.kurumId, ogr.token, '/denemeler')).statusCode).toBe(403);
      expect(
        (await istek('GET', s.k.kurumId, ogr.token, `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await istek('POST', s.k.kurumId, ogr.token, '/denemeler/toplu', {
            ...tyt(),
            satirlar: [],
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await istek('POST', s.k.kurumId, ogr.token, `/denemeler/${d.id}/onay`)).statusCode,
      ).toBe(403);
      const benim = (await istek('GET', s.k.kurumId, ogr.token, '/denemelerim')).json<{
        denemeler: DenemeJson[];
      }>();
      expect(benim.denemeler).toHaveLength(0);
      // ogretmen/yonetici /denemelerim kullanamaz
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/denemelerim')).statusCode).toBe(403);
      // baska kurumun yolu
      expect((await istek('GET', uuidv7(), s.hoca.token, '/denemeler')).statusCode).toBe(403);
    });

    it('modul kapali (grup duzeyi): yazma 403 modul_kapali', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = s.ogrenciler[0] ?? '';
      const d = await denemeEkle(s, o);
      const kapat = await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'deneme', kapsam: 'grup', kapsam_id: s.grup.id, acik: false },
      });
      expect(kapat.statusCode, kapat.body).toBe(200);
      const yaz = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({ ogrenci_id: o, ad: 'Kapali' }),
      );
      expect(yaz.statusCode).toBe(403);
      expect(hataKodu(yaz)).toBe('modul_kapali');
      expect(
        (
          await istek('PATCH', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}`, {
            surum: d.surum,
            ad: 'x',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await istek('DELETE', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}`)).statusCode,
      ).toBe(403);
      const toplu = await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler/toplu', {
        ...tyt({ ad: 'Toplu Kapali' }),
        satirlar: [{ ogrenci_id: o, bolumler: [{ bolum_kodu: 'turkce', dogru: 1, yanlis: 0 }] }],
      });
      expect(toplu.statusCode).toBe(422);
      expect(hata(toplu).details?.hatalar?.[0]?.kod).toBe('modul_kapali');
      const ozet = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`,
      );
      expect(ozet.statusCode).toBe(403);
      expect(hataKodu(ozet)).toBe('modul_kapali');
      // tum modul kurum duzeyinde kapaninca okuma da 403
      await y.app.inject({
        method: 'PUT',
        url: y.hesapApi(s.k, '/modul-ayarlari'),
        headers: bearer(s.k.token),
        payload: { modul_kodu: 'deneme', kapsam: 'kurum', acik: false },
      });
      expect((await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler')).statusCode).toBe(403);
    });
  });

  // --- Ogrenci girisi ve onay ---------------------------------------------------------------

  describe('ogrenci girisi ve onay akisi', () => {
    it('ogrenci girisi bekler, olay uretmez, gelisime girmez; onayla olay ve gelisim; ikinci onay etkisiz', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const ayar = await istek('GET', s.k.kurumId, ogr.token, '/deneme-ayarlari');
      expect(ayar.json()).toEqual({ ogrenci_deneme_girisi: true });
      const res = await istek('POST', s.k.kurumId, ogr.token, '/denemeler', tyt());
      expect(res.statusCode, res.body).toBe(201);
      const d = res.json<DenemeJson>();
      expect(d).toMatchObject({
        kaynak: 'ogrenci',
        onay_durumu: 'bekliyor',
        onaylayan_id: null,
        ogrenci_id: ogr.uyelikId,
      });
      expect(d.gorunen_ad).toBeNull();
      expect(d.toplam_net).toBe(39);
      expect(await olaylar(s.k.kurumId)).toHaveLength(0);
      // gelisim ve grup ozeti onaysiz sonucu icermez
      const gelisim = (
        await istek(
          'GET',
          s.k.kurumId,
          ogr.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=tyt`,
        )
      ).json<Gelisim>();
      expect(gelisim.deneme_sayisi).toBe(0);
      expect(gelisim.noktalar).toHaveLength(0);
      expect(gelisim.son5_ortalama).toBeNull();
      const ozet0 = (
        await istek('GET', s.k.kurumId, s.hoca.token, `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`)
      ).json<{ sinif_ortalamasi: number | null; denemesi_olan_sayisi: number }>();
      expect(ozet0.sinif_ortalamasi).toBeNull();
      expect(ozet0.denemesi_olan_sayisi).toBe(0);
      // onay kuyrugu
      const kuyruk = (
        await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler?onay=bekliyor')
      ).json<{ denemeler: DenemeJson[] }>();
      expect(kuyruk.denemeler.map((x) => x.id)).toEqual([d.id]);
      // ogrenci kendi sonucunu onaylayamaz
      expect(
        (await istek('POST', s.k.kurumId, ogr.token, `/denemeler/${d.id}/onay`)).statusCode,
      ).toBe(403);
      // onay
      const onay = await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/onay`);
      expect(onay.statusCode, onay.body).toBe(200);
      expect(onay.json<DenemeJson>()).toMatchObject({
        onay_durumu: 'onaylandi',
        onaylayan_id: s.hoca.uyelikId,
      });
      const ev = await olaylar(s.k.kurumId);
      expect(ev).toHaveLength(1);
      expect(ev[0]?.payload.data).toMatchObject({
        deneme_id: d.id,
        ogrenci_id: ogr.uyelikId,
        toplam_net: 39,
      });
      // idempotent: ikinci onay olay uretmez
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/onay`)).statusCode,
      ).toBe(200);
      expect(await olaylar(s.k.kurumId)).toHaveLength(1);
      expect(
        (
          await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/red`, {
            red_nedeni: 'x',
          })
        ).statusCode,
      ).toBe(409);
      const g2 = (
        await istek(
          'GET',
          s.k.kurumId,
          ogr.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=tyt`,
        )
      ).json<Gelisim>();
      expect(g2.deneme_sayisi).toBe(1);
      expect(g2.noktalar[0]?.toplam_net).toBe(39);
      // onayli sonuc ogrenci tarafindan degistirilemez/silinemez
      const degis = await istek('PATCH', s.k.kurumId, ogr.token, `/denemeler/${d.id}`, {
        surum: 2,
        ad: 'x',
      });
      expect(degis.statusCode).toBe(409);
      expect(hataKodu(degis)).toBe('deneme_onay_durumu_gecersiz');
      expect((await istek('DELETE', s.k.kurumId, ogr.token, `/denemeler/${d.id}`)).statusCode).toBe(
        409,
      );
      expect(await denetim(s.k.kurumId, 'deneme.onayla')).toBe(1);
    });

    it('red: nedenli, olay yok, gelisime girmez; ogrenci duzeltince yeniden bekler; reddedilen onaylanamaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const ogr = await girisliOgrenci(s);
      const d = (
        await istek('POST', s.k.kurumId, ogr.token, '/denemeler', tyt())
      ).json<DenemeJson>();
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/red`, {})).statusCode,
      ).toBe(400);
      const red = await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/red`, {
        red_nedeni: 'Sonuc kagidiyla uyusmuyor',
      });
      expect(red.statusCode, red.body).toBe(200);
      expect(red.json<DenemeJson>()).toMatchObject({
        onay_durumu: 'reddedildi',
        red_nedeni: 'Sonuc kagidiyla uyusmuyor',
      });
      expect(await olaylar(s.k.kurumId)).toHaveLength(0);
      expect(
        (await istek('POST', s.k.kurumId, s.hoca.token, `/denemeler/${d.id}/onay`)).statusCode,
      ).toBe(409);
      const benim = (await istek('GET', s.k.kurumId, ogr.token, '/denemelerim')).json<{
        denemeler: DenemeJson[];
      }>();
      expect(benim.denemeler[0]).toMatchObject({
        onay_durumu: 'reddedildi',
        red_nedeni: 'Sonuc kagidiyla uyusmuyor',
      });
      const gelisim = (
        await istek(
          'GET',
          s.k.kurumId,
          ogr.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=tyt`,
        )
      ).json<Gelisim>();
      expect(gelisim.deneme_sayisi).toBe(0);
      // ogrenci duzeltir: yeniden bekliyor, red nedeni temizlenir
      const sonra = benim.denemeler[0];
      const duzelt = await istek('PATCH', s.k.kurumId, ogr.token, `/denemeler/${d.id}`, {
        surum: sonra?.surum,
        bolumler: [{ bolum_kodu: 'turkce', dogru: 20, yanlis: 0 }],
      });
      expect(duzelt.statusCode, duzelt.body).toBe(200);
      expect(duzelt.json<DenemeJson>()).toMatchObject({
        onay_durumu: 'bekliyor',
        red_nedeni: null,
        onaylayan_id: null,
        toplam_net: 20,
      });
      // bekleyeni ogrenci silebilir
      const sil = await istek('DELETE', s.k.kurumId, ogr.token, `/denemeler/${d.id}`);
      expect(sil.statusCode).toBe(204);
      expect(await denetim(s.k.kurumId, 'deneme.reddet')).toBe(1);
    });

    it('kurum ayari ogrenci_deneme_girisi kapaliysa ogrenci girisi, duzeltmesi ve silmesi 403; ayar yalniz yoneticide', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ogr = await girisliOgrenci(s);
      const bekleyen = (
        await istek('POST', s.k.kurumId, ogr.token, '/denemeler', tyt())
      ).json<DenemeJson>();
      expect(
        (
          await istek('PUT', s.k.kurumId, s.hoca.token, '/deneme-ayarlari', {
            ogrenci_deneme_girisi: false,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await istek('PUT', s.k.kurumId, ogr.token, '/deneme-ayarlari', {
            ogrenci_deneme_girisi: false,
          })
        ).statusCode,
      ).toBe(403);
      const kapat = await istek('PUT', s.k.kurumId, s.k.token, '/deneme-ayarlari', {
        ogrenci_deneme_girisi: false,
      });
      expect(kapat.statusCode, kapat.body).toBe(200);
      expect(kapat.json()).toEqual({ ogrenci_deneme_girisi: false });
      expect((await istek('GET', s.k.kurumId, ogr.token, '/deneme-ayarlari')).json()).toEqual({
        ogrenci_deneme_girisi: false,
      });
      const kurum = await y.app.inject({
        url: `/v1/hesap/kurumlar/${s.k.kurumId}`,
        headers: bearer(s.k.token),
      });
      expect(kurum.json<{ ayarlar: Record<string, unknown> }>().ayarlar.ogrenci_deneme_girisi).toBe(
        false,
      );
      const yaz = await istek('POST', s.k.kurumId, ogr.token, '/denemeler', tyt({ ad: 'Kapali' }));
      expect(yaz.statusCode).toBe(403);
      expect(hataKodu(yaz)).toBe('ogrenci_deneme_girisi_kapali');
      expect(
        (
          await istek('PATCH', s.k.kurumId, ogr.token, `/denemeler/${bekleyen.id}`, {
            surum: bekleyen.surum,
            ad: 'x',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await istek('DELETE', s.k.kurumId, ogr.token, `/denemeler/${bekleyen.id}`)).statusCode,
      ).toBe(403);
      // ogretmen girisi etkilenmez
      const ogretmenGirisi = await istek(
        'POST',
        s.k.kurumId,
        s.hoca.token,
        '/denemeler',
        tyt({ ogrenci_id: ogr.uyelikId, ad: 'Hoca' }),
      );
      expect(ogretmenGirisi.statusCode, ogretmenGirisi.body).toBe(201);
      // ayni degerle tekrar acinca ogrenci yazabilir
      await istek('PUT', s.k.kurumId, s.k.token, '/deneme-ayarlari', {
        ogrenci_deneme_girisi: true,
      });
      expect(
        (await istek('POST', s.k.kurumId, ogr.token, '/denemeler', tyt({ ad: 'Acik' }))).statusCode,
      ).toBe(201);
      expect(await denetim(s.k.kurumId, 'deneme.ayar_guncelle')).toBe(2);
    });
  });

  // --- Toplu giris --------------------------------------------------------------------------

  describe('toplu giris', () => {
    const satir = (ogrenciId: string, dogru = 20, yanlis = 4) => ({
      ogrenci_id: ogrenciId,
      bolumler: [
        { bolum_kodu: 'turkce', dogru, yanlis },
        { bolum_kodu: 'matematik', dogru: 10, yanlis: 0 },
      ],
    });

    it('30 ogrenci tek istekte: hepsi yazilir, 30 olay, sure olculur; ikinci kez ayni istek hepsi reddedilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 30 });
      const baslangic = performance.now();
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler/toplu', {
        ...tyt({ ad: 'Toplu 30' }),
        satirlar: s.ogrenciler.map((o, i) => satir(o, 10 + (i % 15), i % 5)),
      });
      const sure = Math.round(performance.now() - baslangic);
      console.info(`[deneme] 30 ogrenci toplu giris (HTTP, tek istek): ${String(sure)} ms`);
      expect(res.statusCode, res.body).toBe(201);
      const j = res.json<TopluYanit>();
      expect(j.olusturulan_sayisi).toBe(30);
      expect(j.denemeler).toHaveLength(30);
      expect(sure).toBeLessThan(5000);
      expect(await olaylar(s.k.kurumId)).toHaveLength(30);
      const [r] = await sistem<{ n: number; onayli: number; yanlis: number }[]>`
        select count(*)::int n, count(*) filter (where onay_durumu = 'onaylandi')::int onayli,
               (select count(*)::int from ogrenme.deneme_bolumleri where kurum_id = ${s.k.kurumId} and dogru + yanlis + bos <> soru_sayisi) yanlis
        from ogrenme.denemeler where kurum_id = ${s.k.kurumId}`;
      expect(r).toMatchObject({ n: 30, onayli: 30, yanlis: 0 });
      // ayni istek tekrar: satir bazli deneme_zaten_var, hicbiri yazilmaz
      const tekrar = await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler/toplu', {
        ...tyt({ ad: 'Toplu 30' }),
        satirlar: s.ogrenciler.map((o) => satir(o)),
      });
      expect(tekrar.statusCode).toBe(422);
      expect(hata(tekrar).details?.hatalar).toHaveLength(30);
      expect(hata(tekrar).details?.hatalar?.every((h) => h.kod === 'deneme_zaten_var')).toBe(true);
    });

    it('atomik: bir satir hataliysa hicbiri yazilmaz; satir bazli hata listesi ve olay yok', async () => {
      const s = await y.kur({ ogrenciSayisi: 4 });
      const baska = await y.kur({ ogrenciSayisi: 1 });
      const [a, b, c, d] = s.ogrenciler;
      if (!a || !b || !c || !d) throw new Error('ogrenci yok');
      const res = await istek('POST', s.k.kurumId, s.hoca.token, '/denemeler/toplu', {
        ...tyt({ ad: 'Atomik' }),
        satirlar: [
          satir(a),
          { ogrenci_id: b, bolumler: [{ bolum_kodu: 'turkce', dogru: 35, yanlis: 10 }] }, // toplam asiyor
          satir(c),
          satir(a), // tekrar
          satir(baska.ogrenciler[0] ?? uuidv7()), // baska kurum
          { ogrenci_id: d, bolumler: [{ bolum_kodu: 'fizik', dogru: 1, yanlis: 0 }] }, // bilinmeyen bolum
        ],
      });
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('toplu_giris_hatali');
      const hatalar = hata(res).details?.hatalar ?? [];
      expect(hatalar.map((h) => [h.satir, h.kod])).toEqual([
        [1, 'deneme_bolum_gecersiz'],
        [3, 'ogrenci_tekrar'],
        [4, 'ogrenci_bulunamadi'],
        [5, 'deneme_bolum_gecersiz'],
      ]);
      expect(hatalar[0]?.ogrenci_id).toBe(b);
      const [r] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.denemeler where kurum_id = ${s.k.kurumId}`;
      expect(r?.n).toBe(0);
      expect(await olaylar(s.k.kurumId)).toHaveLength(0);
      expect(await denetim(s.k.kurumId, 'deneme.toplu_olustur')).toBe(0);
    });
  });

  // --- Excel --------------------------------------------------------------------------------

  describe('Excel', () => {
    async function xlsx(satirlar: unknown[][], sayfa = 'Veri'): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sayfa);
      for (const r of satirlar) ws.addRow(r);
      return Buffer.from(await wb.xlsx.writeBuffer());
    }
    const BASLIK = [
      'ogrenci_id',
      'ogrenci_no',
      'ad',
      'turkce_dogru',
      'turkce_yanlis',
      'matematik_dogru',
      'matematik_yanlis',
    ];
    const yukle = (
      s: Kurulum,
      govde: Buffer | string,
      sorgu = 'kural=tyt&ad=Excel%201&sinav_tarihi=2026-03-10',
      turu = XLSX,
    ) =>
      y.app.inject({
        method: 'POST',
        url: api(s.k.kurumId, `/denemeler/excel?${sorgu}`),
        headers: { ...bearer(s.hoca.token), 'content-type': turu },
        payload: govde,
      });
    const numaralandir = async (ogrenciler: string[]) => {
      for (const [i, id] of ogrenciler.entries()) {
        await sistem`update hesap.uyelikler set ogrenci_no = ${String(1000 + i)} where id = ${id}`;
      }
    };

    it('sablon: gercek .xlsx, grubun ogrencileriyle on dolu, kural sutunlari; baska grup 404', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      await numaralandir(s.ogrenciler);
      const res = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/denemeler/sablon.xlsx?kural=tyt&grup_id=${s.grup.id}`,
      );
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['content-type']).toBe(XLSX);
      expect(res.headers['content-disposition']).toContain('.xlsx');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.rawPayload as unknown as ExcelJS.Buffer);
      const ws = wb.getWorksheet('Veri');
      expect(ws).toBeDefined();
      const baslik = (ws?.getRow(1).values as unknown[]).slice(1);
      expect(baslik).toEqual([
        'ogrenci_id',
        'ogrenci_no',
        'ad',
        'turkce_dogru',
        'turkce_yanlis',
        'sosyal_dogru',
        'sosyal_yanlis',
        'matematik_dogru',
        'matematik_yanlis',
        'fen_dogru',
        'fen_yanlis',
      ]);
      // Veri dogrulama kurallari bos satirlari da bicimlendirir: en az baslik + 3 ogrenci.
      expect(ws?.rowCount).toBeGreaterThanOrEqual(4);
      const idler = [2, 3, 4].map((r) => ws?.getCell(r, 1).text);
      expect(idler.sort()).toEqual([...s.ogrenciler].sort());
      expect(wb.getWorksheet('Bilgi')).toBeDefined();
      const bos = await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler/sablon.xlsx?kural=tyt');
      expect(bos.statusCode).toBe(200);
      const baskaGrup = await y.grupAc(s.k, 'grup', 'Baska');
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            s.hoca.token,
            `/denemeler/sablon.xlsx?kural=tyt&grup_id=${baskaGrup.id}`,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler/sablon.xlsx?kural=yok'))
          .statusCode,
      ).toBe(404);
      const ogr = await girisliOgrenci(s);
      expect(
        (await istek('GET', s.k.kurumId, ogr.token, '/denemeler/sablon.xlsx?kural=tyt')).statusCode,
      ).toBe(403);
    });

    it('gecerli yukleme: ogrenci_id ve ogrenci_no ile esleme; puansiz satir atlanir; olaylar yazilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 4 });
      await numaralandir(s.ogrenciler);
      const [a, b, c, d] = s.ogrenciler;
      const govde = await xlsx([
        BASLIK,
        [a, '', 'Bilgi Adi', 25, 2, 15, 2],
        ['', '1001', 'Baska Ad', 30, 0, 10, 0], // ogrenci_no ile
        [d, '1003', 'Puansiz', null, null, null, null], // atlanir
        [], // bos
        [c, '', 'x', 12, 4, null, null],
      ]);
      const res = await yukle(s, govde);
      expect(res.statusCode, res.body).toBe(201);
      const j = res.json<TopluYanit>();
      expect(j.olusturulan_sayisi).toBe(3);
      expect(j.atlanan_satir_sayisi).toBe(1);
      const netler = new Map(j.denemeler.map((x) => [x.ogrenci_id, x.toplam_net]));
      expect(netler.get(a ?? '')).toBe(39);
      expect(netler.get(b ?? '')).toBe(40); // satir 3: ogrenci_no 1001 -> ikinci ogrenci (30 + 10)
      expect(netler.get(c ?? '')).toBe(11); // 12 dogru, 4 yanlis: 12 - 1
      expect(await olaylar(s.k.kurumId)).toHaveLength(3);
      expect(await denetim(s.k.kurumId, 'deneme.excel_yukle')).toBe(1);
      // bolum kodu basligi eksik olan dosyada yalniz verilen bolum yazilir
      const kismi = await yukle(
        s,
        await xlsx([
          ['ogrenci_no', 'turkce_dogru'],
          ['1002', 10],
        ]),
        'kural=tyt&ad=Kismi&sinav_tarihi=2026-03-11',
      );
      expect(kismi.statusCode, kismi.body).toBe(201);
      expect(kismi.json<TopluYanit>().denemeler[0]).toMatchObject({
        ogrenci_id: c,
        toplam_net: 10,
      });
    });

    it('hatali satirlar listelenir (formul, sayi degil, tanimsiz ogrenci, kapsam disi); hicbiri yazilmaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 5 });
      await numaralandir(s.ogrenciler);
      const [a, b, c, d, e] = s.ogrenciler;
      const baska = await y.kur({ ogrenciSayisi: 1 });
      const govde = await xlsx([
        BASLIK,
        [a, '', '', { formula: '10+10', result: 20 }, 2, 15, 2], // 2: formul
        [b, '', '', 'yirmi', 2, 15, 2], // 3: sayi degil
        [c, '', '', 12.5, 2, 15, 2], // 4: ondalik
        ['', '9999', '', 10, 0, 0, 0], // 5: tanimsiz no
        [baska.ogrenciler[0], '', '', 10, 0, 0, 0], // 6: kapsam disi
        [d, '', '', 10, 0, 0, 0], // 7: gecerli
        [e, '', { formula: '"=1"', result: '=1' }, 10, 0, 0, 0], // 8: ad hucresinde formul
        ['bozuk-kimlik', '', '', 10, 0, 0, 0], // 9: gecersiz kimlik
        [d, '1000', '', 10, 0, 0, 0], // 10: id ile no ayni ogrenciye ait degil
      ]);
      const res = await yukle(s, govde);
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('toplu_giris_hatali');
      const hatalar = hata(res).details?.hatalar ?? [];
      expect(hatalar.map((h) => [h.satir, h.kod])).toEqual([
        [2, 'formul_hucresi'],
        [3, 'sayi_degil'],
        [4, 'sayi_degil'],
        [5, 'ogrenci_bulunamadi'],
        [6, 'ogrenci_bulunamadi'],
        [8, 'formul_hucresi'],
        [9, 'ogrenci_kimligi_gecersiz'],
        [10, 'ogrenci_eslesmedi'],
      ]);
      const [r] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ogrenme.denemeler where kurum_id = ${s.k.kurumId}`;
      expect(r?.n).toBe(0);
      expect(await olaylar(s.k.kurumId)).toHaveLength(0);
    });

    it('boyut ve bicim: 2 MB ustu 413, xlsx olmayan 422, bos 422, 500+ satir 422, baslik eksik 422, grup siniri', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const buyuk = Buffer.concat([Buffer.from('PK'), Buffer.alloc(2 * 1024 * 1024 + 10)]);
      const r413 = await yukle(s, buyuk);
      expect(r413.statusCode).toBe(413);
      const duz = await yukle(s, Buffer.from('bu bir xlsx degil'));
      expect(duz.statusCode).toBe(422);
      expect(hataKodu(duz)).toBe('excel_gecersiz');
      const zipDegil = await yukle(s, Buffer.from('PK-ama-bozuk-dosya'));
      expect(zipDegil.statusCode).toBe(422);
      expect(hataKodu(zipDegil)).toBe('excel_gecersiz');
      const json = await y.app.inject({
        method: 'POST',
        url: api(s.k.kurumId, '/denemeler/excel?kural=tyt&ad=X&sinav_tarihi=2026-03-10'),
        headers: bearer(s.hoca.token),
        payload: { a: 1 },
      });
      expect(json.statusCode).toBe(422);
      expect(hataKodu(json)).toBe('excel_gecersiz');
      const cok = await xlsx([
        BASLIK,
        ...Array.from({ length: 501 }, () => [uuidv7(), '', '', 1, 0, 0, 0]),
      ]);
      const rCok = await yukle(s, cok);
      expect(rCok.statusCode).toBe(422);
      expect(hataKodu(rCok)).toBe('excel_gecersiz');
      const baslikYok = await yukle(
        s,
        await xlsx([
          ['x', 'y'],
          [1, 2],
        ]),
      );
      expect(baslikYok.statusCode).toBe(422);
      expect(hataKodu(baslikYok)).toBe('excel_gecersiz');
      // grup_id verilince satirdaki ogrenci grubun uyesi olmali
      const baskaGrup = await y.grupAc(s.k, 'grup', 'Baska');
      await y.ata(s.k, baskaGrup.id, s.hoca.uyelikId);
      const grupDisi = await yukle(
        s,
        await xlsx([BASLIK, [s.ogrenciler[0], '', '', 10, 0, 0, 0]]),
        `kural=tyt&ad=G&sinav_tarihi=2026-03-12&grup_id=${baskaGrup.id}`,
      );
      expect(grupDisi.statusCode).toBe(422);
      expect(hata(grupDisi).details?.hatalar?.[0]?.kod).toBe('ogrenci_bulunamadi');
      // ogrenci rolu yukleyemez
      const ogr = await girisliOgrenci(s);
      const r403 = await y.app.inject({
        method: 'POST',
        url: api(s.k.kurumId, '/denemeler/excel?kural=tyt&ad=X&sinav_tarihi=2026-03-10'),
        headers: { ...bearer(ogr.token), 'content-type': XLSX },
        payload: await xlsx([BASLIK]),
      });
      expect(r403.statusCode).toBe(403);
    });
  });

  // --- Gelisim ve ozet ----------------------------------------------------------------------

  describe('gelisim ve grup ozeti', () => {
    it('12 deneme: son 5 ortalama, onceki 5 ile degisim, bolum trendi, limit, sira', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ogr = await girisliOgrenci(s);
      // net = 10 + i (turkce) ve matematik 5 (sabit): toplam 15 + i
      for (let i = 0; i < 12; i++) {
        await denemeEkle(s, ogr.uyelikId, {
          ad: `D${String(i + 1)}`,
          sinav_tarihi: `2026-01-${String(i + 1).padStart(2, '0')}`,
          bolumler: [
            { bolum_kodu: 'turkce', dogru: 10 + i, yanlis: 0 },
            { bolum_kodu: 'matematik', dogru: 5, yanlis: 0 },
          ],
        });
      }
      // baska kural ve onaysiz ogrenci sonucu karismaz
      await denemeEkle(s, ogr.uyelikId, {
        kural_kodu: 'lgs',
        ad: 'L1',
        bolumler: [{ bolum_kodu: 'turkce', dogru: 20, yanlis: 0 }],
      });
      await istek(
        'POST',
        s.k.kurumId,
        ogr.token,
        '/denemeler',
        tyt({
          ad: 'Bekleyen',
          sinav_tarihi: '2026-02-01',
          bolumler: [{ bolum_kodu: 'turkce', dogru: 40, yanlis: 0 }],
        }),
      );
      const res = await istek(
        'GET',
        s.k.kurumId,
        ogr.token,
        `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=tyt`,
      );
      expect(res.statusCode, res.body).toBe(200);
      const g = res.json<Gelisim>();
      expect(g.deneme_sayisi).toBe(12);
      expect(g.noktalar).toHaveLength(12);
      expect(g.noktalar.map((n) => n.ad)).toEqual(
        Array.from({ length: 12 }, (_, i) => `D${String(i + 1)}`),
      );
      expect(g.noktalar[0]?.toplam_net).toBe(15);
      expect(g.noktalar[11]?.toplam_net).toBe(26);
      expect(g.noktalar[11]?.bolumler.map((b) => b.bolum_kodu).sort()).toEqual([
        'matematik',
        'turkce',
      ]);
      // son 5: i=7..11 -> toplam 22..26 ort 24; onceki 5: i=2..6 -> 17..21 ort 19
      expect(g).toMatchObject({
        son5_sayisi: 5,
        son5_ortalama: 24,
        onceki5_sayisi: 5,
        onceki5_ortalama: 19,
        degisim: 5,
      });
      const turkce = g.bolum_gelisimi.find((b) => b.bolum_kodu === 'turkce');
      expect(turkce).toMatchObject({ son5_ortalama: 19, onceki5_ortalama: 14, degisim: 5 });
      expect(g.bolum_gelisimi.find((b) => b.bolum_kodu === 'matematik')).toMatchObject({
        son5_ortalama: 5,
        degisim: 0,
      });
      // limit: son 3 nokta (ortalama limitten bagimsiz)
      const kisa = (
        await istek(
          'GET',
          s.k.kurumId,
          s.hoca.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=tyt&limit=3`,
        )
      ).json<Gelisim>();
      expect(kisa.noktalar.map((n) => n.ad)).toEqual(['D10', 'D11', 'D12']);
      expect(kisa.son5_ortalama).toBe(24);
      expect(kisa.deneme_sayisi).toBe(12);
      // yetersiz veri: 2 deneme -> onceki yok
      const lgs = (
        await istek(
          'GET',
          s.k.kurumId,
          s.hoca.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=lgs`,
        )
      ).json<Gelisim>();
      expect(lgs).toMatchObject({
        deneme_sayisi: 1,
        son5_sayisi: 1,
        son5_ortalama: 20,
        onceki5_sayisi: 0,
        onceki5_ortalama: null,
        degisim: null,
      });
      const yok = (
        await istek(
          'GET',
          s.k.kurumId,
          s.hoca.token,
          `/ogrenciler/${ogr.uyelikId}/deneme-gelisim?kural=ydt`,
        )
      ).json<Gelisim>();
      expect(yok).toMatchObject({ deneme_sayisi: 0, noktalar: [], son5_ortalama: null });
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            s.hoca.token,
            `/ogrenciler/${ogr.uyelikId}/deneme-gelisim`,
          )
        ).statusCode,
      ).toBe(400);
    });

    it('sinif ortalamasi: ogrenci basina son 5 ortalamalarinin ortalamasi; yalniz ogretmen/yonetici; onaysiz haric', async () => {
      const s = await y.kur({ ogrenciSayisi: 3 });
      const [a, b, c] = s.ogrenciler;
      if (!a || !b || !c) throw new Error('ogrenci yok');
      const sonuc = (dogru: number) => [
        { bolum_kodu: 'turkce', dogru, yanlis: 0 },
        { bolum_kodu: 'matematik', dogru: 10, yanlis: 0 },
      ];
      await denemeEkle(s, a, { ad: 'A1', sinav_tarihi: '2026-02-01', bolumler: sonuc(20) }); // 30
      await denemeEkle(s, a, { ad: 'A2', sinav_tarihi: '2026-02-08', bolumler: sonuc(30) }); // 40 -> ort 35
      await denemeEkle(s, b, { ad: 'B1', sinav_tarihi: '2026-02-01', bolumler: sonuc(10) }); // 20
      // c: yalniz onaysiz
      const girisli = await girisliOgrenci(s);
      await istek('POST', s.k.kurumId, girisli.token, '/denemeler', tyt({ ad: 'Bekleyen' }));
      const res = await istek(
        'GET',
        s.k.kurumId,
        s.hoca.token,
        `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`,
      );
      expect(res.statusCode, res.body).toBe(200);
      const o = res.json<{
        ogrenci_sayisi: number;
        denemesi_olan_sayisi: number;
        sinif_ortalamasi: number;
        bolum_ortalamalari: { bolum_kodu: string; ortalama: number }[];
        ogrenciler: {
          ogrenci_id: string;
          deneme_sayisi: number;
          son_net: number | null;
          son5_ortalama: number | null;
        }[];
      }>();
      expect(o.ogrenci_sayisi).toBe(4);
      expect(o.denemesi_olan_sayisi).toBe(2);
      expect(o.sinif_ortalamasi).toBe(27.5); // (35 + 20) / 2
      expect(o.bolum_ortalamalari).toEqual([
        { bolum_kodu: 'matematik', brans_kodu: 'matematik', ortalama: 10 },
        { bolum_kodu: 'turkce', brans_kodu: 'turkce', ortalama: 17.5 }, // ((20+30)/2 + 10) / 2
      ]);
      const sa = o.ogrenciler.find((x) => x.ogrenci_id === a);
      expect(sa).toMatchObject({ deneme_sayisi: 2, son_net: 40, son5_ortalama: 35 });
      expect(o.ogrenciler.find((x) => x.ogrenci_id === c)).toMatchObject({
        deneme_sayisi: 0,
        son_net: null,
        son5_ortalama: null,
      });
      expect(o.ogrenciler.find((x) => x.ogrenci_id === girisli.uyelikId)).toMatchObject({
        deneme_sayisi: 0,
      });
      // yonetici de gorur; ogrenci goremez (403)
      expect(
        (await istek('GET', s.k.kurumId, s.k.token, `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            girisli.token,
            `/gruplar/${s.grup.id}/deneme-ozet?kural=tyt`,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await istek(
            'GET',
            s.k.kurumId,
            s.hoca.token,
            `/gruplar/${uuidv7()}/deneme-ozet?kural=tyt`,
          )
        ).statusCode,
      ).toBe(404);
      // ogrenci cevabinda hicbir yerde baskasinin notu yok
      const benim = await istek('GET', s.k.kurumId, girisli.token, '/denemelerim');
      expect(benim.body).not.toContain(a);
    });

    it('liste ve sayfalama: onay filtresi, ogrenci filtresi, imlec', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [a, b] = s.ogrenciler;
      for (let i = 0; i < 3; i++)
        await denemeEkle(s, a ?? '', {
          ad: `L${String(i)}`,
          sinav_tarihi: `2026-03-0${String(i + 1)}`,
        });
      await denemeEkle(s, b ?? '', { ad: 'B' });
      const ilk = (await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler?limit=2')).json<{
        denemeler: DenemeJson[];
        sonraki_imlec: string | null;
      }>();
      expect(ilk.denemeler).toHaveLength(2);
      expect(ilk.sonraki_imlec).not.toBeNull();
      const ikinci = (
        await istek(
          'GET',
          s.k.kurumId,
          s.hoca.token,
          `/denemeler?limit=2&imlec=${ilk.sonraki_imlec ?? ''}`,
        )
      ).json<{ denemeler: DenemeJson[]; sonraki_imlec: string | null }>();
      expect(ikinci.denemeler).toHaveLength(2);
      expect(ikinci.sonraki_imlec).toBeNull();
      const sadeceA = (
        await istek('GET', s.k.kurumId, s.hoca.token, `/denemeler?ogrenci_id=${a}`)
      ).json<{ denemeler: DenemeJson[] }>();
      expect(sadeceA.denemeler).toHaveLength(3);
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler?onay=bekliyor')).json<{
          denemeler: unknown[];
        }>().denemeler,
      ).toHaveLength(0);
      expect(
        (await istek('GET', s.k.kurumId, s.hoca.token, '/denemeler?imlec=bozuk!')).statusCode,
      ).toBe(400);
    });
  });
});
