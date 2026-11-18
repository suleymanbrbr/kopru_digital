import {
  BildirimAyarlariSema,
  BildirimKutuListesiSema,
  BildirimTercihListesiSema,
} from '@kopru/contracts';
import type { Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, dk, ortamKur, saat, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())('kullanici uclari (kullanici JWT, bildirim_app)', () => {
  let o: Ortam;
  let servis: Service;
  const kurumA = uuidv7();
  const kurumB = uuidv7();
  const ali = yeniKimlik('ogrenci', kurumA);
  const baskaKurum = yeniKimlik('ogrenci', kurumB);

  const git = async (
    k: Kimlik,
    yontem: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    govde?: unknown,
  ) =>
    servis.app.inject({
      method: yontem,
      url,
      headers: yetki(await kullaniciTokeni(k)),
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
  const kutu = (kurum = kurumA) => `/v1/bildirim/kurumlar/${kurum}/kutu`;

  /** Bildirim ekler (sistem rolu); `created_at` verilerek sira ve imlec denenir. */
  async function ekle(
    k: Kimlik,
    s: {
      at: Date;
      baslik?: string;
      okundu?: boolean;
      arsiv?: boolean;
      bitis?: Date;
      id?: string;
    } = { at: T0 },
  ) {
    const id = s.id ?? uuidv7();
    await o.sistem`insert into bildirim.bildirimler
      (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, derin_baglanti, veri, kaynak_olay_id, tekil_anahtar,
       okundu_at, arsivlendi_at, gecerlilik_bitis_at, created_at)
      values (${id}, ${k.kurumId}, ${k.uyelikId}, 'soru', 'soru_cevaplandi', ${s.baslik ?? 'B'}, 'G', 'kopru://soru/1',
              ${o.sistem.json({ soru_id: '1' })}, ${uuidv7()}, ${uuidv7()},
              ${s.okundu ? s.at : null}, ${s.arsiv ? s.at : null}, ${s.bitis ?? null}, ${s.at})`;
    return id;
  }

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => dk(T0, 30) });
    await servis.app.ready();
  });
  afterAll(async () => {
    await servis.stop();
    await o.kapat();
  });

  it('kimlik dogrulamasiz 401; baska kurumun yolu 403', async () => {
    expect((await servis.app.inject({ url: kutu() })).statusCode).toBe(401);
    expect(
      (await servis.app.inject({ method: 'PUT', url: '/v1/bildirim/cihazlar', payload: {} }))
        .statusCode,
    ).toBe(401);
    const r = await git(ali, 'GET', kutu(uuidv7()));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: { code: 'yasak' } });
    for (const yol of ['tercihler', 'ayarlar', 'kutu/okunmamis-sayisi']) {
      expect(
        (await git(ali, 'GET', `/v1/bildirim/kurumlar/${kurumB}/${yol}`)).statusCode,
        yol,
      ).toBe(403);
    }
  });

  describe('cihaz', () => {
    const govde = (ek: Record<string, unknown> = {}) => ({
      platform: 'ios',
      push_belirteci: `ExponentPushToken[${uuidv7()}]`,
      cihaz_kimligi: uuidv7(),
      uygulama_surumu: '1.2.3',
      dil: 'tr',
      ...ek,
    });
    const satirlar = (kullaniciId: string) =>
      o.sistem<
        {
          cihaz_kimligi: string;
          push_belirteci: string;
          aktif: boolean;
          uygulama_surumu: string | null;
          platform: string;
        }[]
      >`select cihaz_kimligi, push_belirteci, aktif, uygulama_surumu, platform from bildirim.cihazlar
         where kullanici_id = ${kullaniciId} order by created_at`;

    it('kayit eder, tekrar cagri ayni cihazi gunceller (belirtec dondu, surum yeni)', async () => {
      const kullanici = yeniKimlik('ogrenci', kurumA);
      const b = govde();
      const r = await git(kullanici, 'PUT', '/v1/bildirim/cihazlar', b);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ cihaz_kimligi: b.cihaz_kimligi, aktif: true });
      expect(await satirlar(kullanici.kullaniciId)).toEqual([
        {
          cihaz_kimligi: b.cihaz_kimligi,
          push_belirteci: b.push_belirteci,
          aktif: true,
          uygulama_surumu: '1.2.3',
          platform: 'ios',
        },
      ]);
      const yeni = `ExponentPushToken[${uuidv7()}]`;
      await git(kullanici, 'PUT', '/v1/bildirim/cihazlar', {
        ...b,
        push_belirteci: yeni,
        uygulama_surumu: '1.3.0',
      });
      expect(await satirlar(kullanici.kullaniciId)).toEqual([
        {
          cihaz_kimligi: b.cihaz_kimligi,
          push_belirteci: yeni,
          aktif: true,
          uygulama_surumu: '1.3.0',
          platform: 'ios',
        },
      ]);
    });

    it('gecersiz kaydedilmis cihaz yeniden kayitla tekrar etkinlesir', async () => {
      const kullanici = yeniKimlik('ogrenci', kurumA);
      const b = govde();
      await git(kullanici, 'PUT', '/v1/bildirim/cihazlar', b);
      await o.sistem`update bildirim.cihazlar set aktif = false, gecersiz_at = now() where kullanici_id = ${kullanici.kullaniciId}`;
      await git(kullanici, 'PUT', '/v1/bildirim/cihazlar', b);
      const [c] = await o.sistem<{ aktif: boolean; gecersiz_at: Date | null }[]>`
        select aktif, gecersiz_at from bildirim.cihazlar where kullanici_id = ${kullanici.kullaniciId}`;
      expect(c).toEqual({ aktif: true, gecersiz_at: null });
    });

    it('ayni belirtec baska kullanicida ise eski kayit pasiflenir, yeni kullanicida etkin olur', async () => {
      const eski = yeniKimlik('ogrenci', kurumA);
      const yeni = yeniKimlik('ogretmen', kurumA);
      const b = govde();
      await git(eski, 'PUT', '/v1/bildirim/cihazlar', b);
      const r = await git(yeni, 'PUT', '/v1/bildirim/cihazlar', { ...b, cihaz_kimligi: uuidv7() });
      expect(r.statusCode).toBe(200);
      expect((await satirlar(eski.kullaniciId))[0]).toMatchObject({
        aktif: false,
        push_belirteci: b.push_belirteci,
      });
      expect((await satirlar(yeni.kullaniciId))[0]).toMatchObject({
        aktif: true,
        push_belirteci: b.push_belirteci,
      });
      // eski kullanici geri alirsa devir ters yonde isler
      await git(eski, 'PUT', '/v1/bildirim/cihazlar', b);
      expect((await satirlar(eski.kullaniciId))[0]?.aktif).toBe(true);
      expect((await satirlar(yeni.kullaniciId))[0]?.aktif).toBe(false);
    });

    it('ayni kullanici ayni belirteci yeni cihaz kimligiyle gonderirse tek etkin kayit kalir', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const b = govde();
      await git(k, 'PUT', '/v1/bildirim/cihazlar', b);
      await git(k, 'PUT', '/v1/bildirim/cihazlar', { ...b, cihaz_kimligi: uuidv7() });
      const s = await satirlar(k.kullaniciId);
      expect(s.filter((x) => x.aktif)).toHaveLength(1);
      expect(s).toHaveLength(2);
    });

    it('gecersiz govde 400 (platform, bos belirtec)', async () => {
      expect(
        (await git(ali, 'PUT', '/v1/bildirim/cihazlar', govde({ platform: 'windows' }))).statusCode,
      ).toBe(400);
      expect(
        (await git(ali, 'PUT', '/v1/bildirim/cihazlar', govde({ push_belirteci: '' }))).statusCode,
      ).toBe(400);
    });

    it('cikista silinir; baska kullanici silemez; olmayan kayit icin de basarili', async () => {
      const a = yeniKimlik('ogrenci', kurumA);
      const b = yeniKimlik('ogrenci', kurumA);
      const kayit = govde();
      await git(a, 'PUT', '/v1/bildirim/cihazlar', kayit);
      const baskasi = await git(b, 'DELETE', `/v1/bildirim/cihazlar/${kayit.cihaz_kimligi}`);
      expect(baskasi.statusCode).toBe(200);
      expect(await satirlar(a.kullaniciId)).toHaveLength(1); // a'nin kaydi duruyor
      const r = await git(a, 'DELETE', `/v1/bildirim/cihazlar/${kayit.cihaz_kimligi}`);
      expect(r.json()).toEqual({ cihaz_kimligi: kayit.cihaz_kimligi, aktif: false });
      expect(await satirlar(a.kullaniciId)).toHaveLength(0);
      expect(
        (await git(a, 'DELETE', `/v1/bildirim/cihazlar/${kayit.cihaz_kimligi}`)).statusCode,
      ).toBe(200);
    });
  });

  describe('gelen kutusu', () => {
    const kullanici = yeniKimlik('ogrenci', kurumA);
    const oge = (at: number) => dk(T0, at);

    it('liste: yeniden eskiye, yalniz kendi bildirimleri; arsivli ve suresi gecmis gizli; sema gecerli', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const id1 = await ekle(k, { at: oge(1), baslik: 'bir' });
      const id2 = await ekle(k, { at: oge(2), baslik: 'iki', okundu: true });
      await ekle(k, { at: oge(3), baslik: 'arsivli', arsiv: true });
      await ekle(k, { at: oge(4), baslik: 'suresi gecmis', bitis: dk(T0, 10) }); // simdi = T0+30
      const id5 = await ekle(k, { at: oge(5), baslik: 'gecerli', bitis: dk(T0, 90) });
      await ekle(ali, { at: oge(6), baslik: 'baskasinin' }); // ayni kurum, baska uyelik
      await ekle(baskaKurum, { at: oge(7), baslik: 'baska kurum' });
      const r = await git(k, 'GET', kutu());
      expect(r.statusCode).toBe(200);
      const d = BildirimKutuListesiSema.parse(r.json());
      expect(d.ogeler.map((x) => x.id)).toEqual([id5, id2, id1]);
      expect(d.sonraki_imlec).toBeNull();
      expect(d.ogeler[0]).toMatchObject({
        kategori: 'soru',
        sablon_kodu: 'soru_cevaplandi',
        derin_baglanti: 'kopru://soru/1',
        veri: { soru_id: '1' },
        okundu_at: null,
      });
      expect(d.ogeler[1]?.okundu_at).not.toBeNull();
    });

    it('okunmamis suzgeci yalniz okunmamislari getirir', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const a = await ekle(k, { at: oge(1) });
      await ekle(k, { at: oge(2), okundu: true });
      const d = BildirimKutuListesiSema.parse(
        (await git(k, 'GET', `${kutu()}?okunmamis=true`)).json(),
      );
      expect(d.ogeler.map((x) => x.id)).toEqual([a]);
    });

    it('imleçli sayfalama: sayfalar kesisimsiz ve eksiksiz; ayni created_at siralamada id ile ayrilir', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const idler: string[] = [];
      for (let i = 0; i < 5; i++) idler.push(await ekle(k, { at: oge(i < 2 ? 1 : i) })); // ilk ikisi esit zamanli
      const beklenen = (
        await o.sistem<{ id: string }[]>`
        select id from bildirim.bildirimler where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId}
         order by created_at desc, id desc`
      ).map((r) => r.id);
      expect(new Set(beklenen)).toEqual(new Set(idler));
      const gelen: string[] = [];
      let imlec: string | null = null;
      for (let sayfa = 0; sayfa < 5; sayfa++) {
        const r = await git(k, 'GET', `${kutu()}?limit=2${imlec ? `&imlec=${imlec}` : ''}`);
        const d = BildirimKutuListesiSema.parse(r.json());
        gelen.push(...d.ogeler.map((x) => x.id));
        imlec = d.sonraki_imlec;
        if (!imlec) break;
        expect(d.ogeler).toHaveLength(2);
      }
      expect(gelen).toEqual(beklenen);
    });

    it('gecersiz imlec 400', async () => {
      const r = await git(ali, 'GET', `${kutu()}?imlec=bozuk`);
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ error: { code: 'dogrulama_hatasi' } });
    });

    it('okunmamis sayisi arsiv, okunmus ve suresi gecmisleri saymaz', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      await ekle(k, { at: oge(1) });
      await ekle(k, { at: oge(2) });
      await ekle(k, { at: oge(3), okundu: true });
      await ekle(k, { at: oge(4), arsiv: true });
      await ekle(k, { at: oge(5), bitis: dk(T0, 10) });
      const r = await git(k, 'GET', `${kutu()}/okunmamis-sayisi`);
      expect(r.json()).toEqual({ okunmamis: 2 });
    });

    it('okundu: isaretler, tekrar cagri ilk okuma zamanini korur', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const id = await ekle(k, { at: oge(1) });
      const r1 = await git(k, 'POST', `${kutu()}/${id}/okundu`);
      expect(r1.statusCode).toBe(200);
      const j1 = r1.json<{ id: string; okundu_at: string; arsivlendi_at: string | null }>();
      expect(j1).toMatchObject({ id, arsivlendi_at: null });
      expect(j1.okundu_at).toBe(dk(T0, 30).toISOString());
      // saat ilerleyince de ayni deger
      const sonra = testServisi({}, { simdi: () => saat(T0, 5) });
      await sonra.app.ready();
      const r2 = await sonra.app.inject({
        method: 'POST',
        url: `${kutu()}/${id}/okundu`,
        headers: yetki(await kullaniciTokeni(k)),
      });
      await sonra.stop();
      expect(r2.json<{ okundu_at: string }>().okundu_at).toBe(j1.okundu_at);
      expect((await git(k, 'GET', `${kutu()}/okunmamis-sayisi`)).json()).toEqual({ okunmamis: 0 });
    });

    it('baska kullanicinin ya da baska kurumun bildirimine erisilemez (404/403), kayit degismez', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const id = await ekle(k, { at: oge(1) });
      for (const yol of ['okundu', 'arsivle']) {
        const r = await git(ali, 'POST', `${kutu()}/${id}/${yol}`);
        expect(r.statusCode, yol).toBe(404);
        expect(
          (await git(baskaKurum, 'POST', `${kutu(kurumB)}/${id}/${yol}`)).statusCode,
          yol,
        ).toBe(404);
        expect((await git(baskaKurum, 'POST', `${kutu()}/${id}/${yol}`)).statusCode, yol).toBe(403);
      }
      expect((await git(ali, 'POST', `${kutu()}/${uuidv7()}/okundu`)).statusCode).toBe(404);
      const [s] = await o.sistem<{ okundu_at: Date | null; arsivlendi_at: Date | null }[]>`
        select okundu_at, arsivlendi_at from bildirim.bildirimler where id = ${id}`;
      expect(s).toEqual({ okundu_at: null, arsivlendi_at: null });
    });

    it('tumunu oku yalniz kendi okunmamislarini isaretler', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const d = yeniKimlik('ogrenci', kurumA);
      await ekle(k, { at: oge(1) });
      await ekle(k, { at: oge(2) });
      await ekle(k, { at: oge(3), okundu: true });
      const baskasi = await ekle(d, { at: oge(1) });
      const r = await git(k, 'POST', `${kutu()}/tumunu-oku`);
      expect(r.json()).toEqual({ guncellenen: 2 });
      expect((await git(k, 'GET', `${kutu()}/okunmamis-sayisi`)).json()).toEqual({ okunmamis: 0 });
      const [b] = await o.sistem<
        { okundu_at: Date | null }[]
      >`select okundu_at from bildirim.bildirimler where id = ${baskasi}`;
      expect(b?.okundu_at).toBeNull();
      expect((await git(k, 'POST', `${kutu()}/tumunu-oku`)).json()).toEqual({ guncellenen: 0 });
    });

    it('arsivle: kutuda gizlenir', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const id = await ekle(k, { at: oge(1) });
      const r = await git(k, 'POST', `${kutu()}/${id}/arsivle`);
      expect(r.statusCode).toBe(200);
      expect(r.json<{ arsivlendi_at: string | null }>().arsivlendi_at).not.toBeNull();
      expect(BildirimKutuListesiSema.parse((await git(k, 'GET', kutu())).json()).ogeler).toEqual(
        [],
      );
      expect((await git(k, 'GET', `${kutu()}/okunmamis-sayisi`)).json()).toEqual({ okunmamis: 0 });
    });

    it('kullanici kimligi kimlik hatalari: gecersiz uuid 400', async () => {
      expect((await git(kullanici, 'POST', `${kutu()}/bozuk/okundu`)).statusCode).toBe(400);
    });
  });

  describe('tercihler', () => {
    const yol = (kurum = kurumA) => `/v1/bildirim/kurumlar/${kurum}/tercihler`;
    const hucre = (
      liste: { kategori: string; kanal: string; acik: boolean; kilitli: boolean }[],
      k: string,
      c: string,
    ) => liste.find((h) => h.kategori === k && h.kanal === c);

    it('varsayilan matris: 10 x 4, sistem ve kutu kilitli, push acik, sms kapali', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const d = BildirimTercihListesiSema.parse((await git(k, 'GET', yol())).json());
      expect(d.tercihler).toHaveLength(40);
      expect(hucre(d.tercihler, 'odev', 'push')).toEqual({
        kategori: 'odev',
        kanal: 'push',
        acik: true,
        kilitli: false,
      });
      expect(hucre(d.tercihler, 'odev', 'kutu')).toEqual({
        kategori: 'odev',
        kanal: 'kutu',
        acik: true,
        kilitli: true,
      });
      expect(hucre(d.tercihler, 'sistem', 'sms')).toEqual({
        kategori: 'sistem',
        kanal: 'sms',
        acik: true,
        kilitli: true,
      });
      expect(hucre(d.tercihler, 'abonelik', 'eposta')?.acik).toBe(true);
      expect(hucre(d.tercihler, 'odev', 'sms')?.acik).toBe(false);
    });

    it('guncelleme kaydedilir, yalniz kendi tercihini etkiler, sonraki okumada gorunur', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const baska = yeniKimlik('ogrenci', kurumA);
      const r = await git(k, 'PUT', yol(), {
        tercihler: [
          { kategori: 'odev', kanal: 'push', acik: false },
          { kategori: 'duyuru', kanal: 'sms', acik: true },
        ],
      });
      expect(r.statusCode).toBe(200);
      const d = BildirimTercihListesiSema.parse(r.json());
      expect(hucre(d.tercihler, 'odev', 'push')?.acik).toBe(false);
      expect(hucre(d.tercihler, 'duyuru', 'sms')?.acik).toBe(true);
      const tekrar = BildirimTercihListesiSema.parse((await git(k, 'GET', yol())).json());
      expect(hucre(tekrar.tercihler, 'odev', 'push')?.acik).toBe(false);
      const digeri = BildirimTercihListesiSema.parse((await git(baska, 'GET', yol())).json());
      expect(hucre(digeri.tercihler, 'odev', 'push')?.acik).toBe(true);
      // tekrar acinca guncellenir
      await git(k, 'PUT', yol(), { tercihler: [{ kategori: 'odev', kanal: 'push', acik: true }] });
      expect(
        hucre(
          BildirimTercihListesiSema.parse((await git(k, 'GET', yol())).json()).tercihler,
          'odev',
          'push',
        )?.acik,
      ).toBe(true);
    });

    it('sistem kategorisi ve kutu kanali degistirilemez (400 tercih_kilitli), hicbir hucre yazilmaz', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      for (const hucreIstegi of [
        { kategori: 'sistem', kanal: 'push', acik: false },
        { kategori: 'odev', kanal: 'kutu', acik: false },
      ]) {
        const r = await git(k, 'PUT', yol(), {
          tercihler: [{ kategori: 'soru', kanal: 'push', acik: false }, hucreIstegi],
        });
        expect(r.statusCode).toBe(400);
        expect(r.json()).toMatchObject({ error: { code: 'tercih_kilitli' } });
      }
      const [n] = await o.sistem<{ n: number }[]>`
        select count(*)::int n from bildirim.tercihler where kullanici_id = ${k.kullaniciId}`;
      expect(n?.n).toBe(0);
    });

    it('gecersiz kategori/kanal ve bos liste 400', async () => {
      expect(
        (
          await git(ali, 'PUT', yol(), {
            tercihler: [{ kategori: 'x', kanal: 'push', acik: true }],
          })
        ).statusCode,
      ).toBe(400);
      expect((await git(ali, 'PUT', yol(), { tercihler: [] })).statusCode).toBe(400);
    });
  });

  describe('ayarlar', () => {
    const yol = (kurum = kurumA) => `/v1/bildirim/kurumlar/${kurum}/ayarlar`;

    it('varsayilan: 22:00-08:00, her gun, Europe/Istanbul, 60 dk', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const d = BildirimAyarlariSema.parse((await git(k, 'GET', yol())).json());
      expect(d).toEqual({
        sessiz_baslangic: '22:00',
        sessiz_bitis: '08:00',
        sessiz_gunler: [1, 2, 3, 4, 5, 6, 7],
        saat_dilimi: 'Europe/Istanbul',
        ders_hatirlatma_dk: 60,
      });
    });

    it('kismi guncelleme kaydedilir; digerleri korunur', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      const r = await git(k, 'PUT', yol(), {
        sessiz_baslangic: '23:00',
        sessiz_bitis: '07:30',
        sessiz_gunler: [5, 1, 2],
      });
      expect(r.statusCode).toBe(200);
      expect(BildirimAyarlariSema.parse(r.json())).toEqual({
        sessiz_baslangic: '23:00',
        sessiz_bitis: '07:30',
        sessiz_gunler: [1, 2, 5],
        saat_dilimi: 'Europe/Istanbul',
        ders_hatirlatma_dk: 60,
      });
      const r2 = await git(k, 'PUT', yol(), {
        ders_hatirlatma_dk: 30,
        saat_dilimi: 'Europe/Berlin',
      });
      expect(BildirimAyarlariSema.parse(r2.json())).toEqual({
        sessiz_baslangic: '23:00',
        sessiz_bitis: '07:30',
        sessiz_gunler: [1, 2, 5],
        saat_dilimi: 'Europe/Berlin',
        ders_hatirlatma_dk: 30,
      });
      // sessiz saati kapat
      const r3 = await git(k, 'PUT', yol(), { sessiz_gunler: [] });
      expect(BildirimAyarlariSema.parse(r3.json()).sessiz_gunler).toEqual([]);
      // baska kullanici etkilenmez
      const baska = yeniKimlik('ogrenci', kurumA);
      expect(BildirimAyarlariSema.parse((await git(baska, 'GET', yol())).json()).saat_dilimi).toBe(
        'Europe/Istanbul',
      );
    });

    it('gecersiz degerler 400: saat dilimi, esit saatler, tek baslangic, hatirlatma suresi, saat bicimi', async () => {
      const k = yeniKimlik('ogrenci', kurumA);
      for (const govde of [
        { saat_dilimi: 'Mars/Olympus' },
        { sessiz_baslangic: '22:00', sessiz_bitis: '22:00' },
        { sessiz_baslangic: '22:00' },
        { ders_hatirlatma_dk: 45 },
        { sessiz_baslangic: '25:00', sessiz_bitis: '08:00' },
        { sessiz_gunler: [0, 8] },
      ]) {
        const r = await git(k, 'PUT', yol(), govde);
        expect(r.statusCode, JSON.stringify(govde)).toBe(400);
      }
    });
  });
});
