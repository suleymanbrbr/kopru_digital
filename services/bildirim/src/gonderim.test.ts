import { createDb, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  GONDERIM_AZAMI_DENEME,
  GONDERIM_BEKLEME_DK,
  gonderimIsle,
  type GonderimBagimliliklari,
} from './gonderim.js';
import type { PushMesaji, PushSaglayici, PushSonucu } from './push/saglayici.js';
import {
  GECE,
  T0,
  aliciKur,
  cihazEkle,
  dk,
  ortamKur,
  saat,
  type Alici,
  type Ortam,
} from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';
import { bildirimUret } from './uretim.js';

/** Gonderilen mesajlari kaydeden, sonucu betikten alan sahte saglayici. */
function sahteSaglayici(
  sonuc: (m: PushMesaji, i: number) => PushSonucu = () => ({ tur: 'gonderildi', mesajId: 'm1' }),
) {
  const gonderilenler: PushMesaji[] = [];
  const s: PushSaglayici = {
    ad: 'sahte',
    gonder(mesajlar) {
      gonderilenler.push(...mesajlar);
      return Promise.resolve(mesajlar.map((m, i) => sonuc(m, i)));
    },
  };
  return { s, gonderilenler };
}

describe.skipIf(dbYok())('gonderim.isle (bildirim_sistem, FOR UPDATE SKIP LOCKED)', () => {
  let o: Ortam;
  let sistemDb: Database;
  beforeAll(() => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) throw new Error('testDb yok');
    sistemDb = createDb({ url: urls.sistemUrl, max: 4 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await o.kapat();
  });
  // Is kurumlar arasi calisir: onceki testlerin bekleyen satirlari karismasin.
  beforeEach(async () => {
    await o.sistem`delete from bildirim.gonderimler where durum in ('beklemede', 'ertelendi')`;
  });

  const bagimlilik = (
    s: PushSaglayici,
    simdi: Date,
    ek: Partial<GonderimBagimliliklari> = {},
  ): GonderimBagimliliklari => ({
    db: sistemDb,
    saglayici: s,
    simdi: () => simdi,
    ...ek,
  });
  const uret = async (a: Alici, at: Date = T0, sablonKodu = 'soru_cevaplandi') =>
    o.isle(a.kurumId, (tx) =>
      bildirimUret(
        tx,
        {
          kurumId: a.kurumId,
          aliciUyelikIdleri: [a.uyelikId],
          sablonKodu,
          degiskenler: { soru_id: uuidv7(), mevcut_seri: 4 },
          kaynakOlayId: uuidv7(),
          tekilAnahtar: `${sablonKodu}:${uuidv7()}`,
        },
        { simdi: at },
      ),
    );
  const gonderim = async (a: Alici) =>
    (
      await o.sistem<
        {
          id: string;
          durum: string;
          atlama_nedeni: string | null;
          hata_kodu: string | null;
          deneme_sayisi: number;
          zamanlanan_at: Date;
          gonderildi_at: Date | null;
          saglayici: string | null;
          saglayici_mesaj_id: string | null;
        }[]
      >`select id, durum, atlama_nedeni, hata_kodu, deneme_sayisi, zamanlanan_at, gonderildi_at, saglayici, saglayici_mesaj_id
          from bildirim.gonderimler where kurum_id = ${a.kurumId} order by created_at, id`
    )[0];

  it('basarili gonderim: durum gonderildi, saglayici ve mesaj kimligi, yuk bicimi (title/body/data)', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId, { belirtec: 'ExponentPushToken[abc]' });
    await uret(a);
    const { s, gonderilenler } = sahteSaglayici(() => ({ tur: 'gonderildi', mesajId: 'bilet-9' }));
    const ozet = await gonderimIsle(bagimlilik(s, T0));
    expect(ozet).toMatchObject({ secilen: 1, gonderildi: 1, basarisiz: 0 });
    expect(gonderilenler).toHaveLength(1);
    expect(gonderilenler[0]).toMatchObject({
      belirtec: 'ExponentPushToken[abc]',
      platform: 'android',
      title: 'Sorun cevaplandı',
      body: 'Sorduğun soruya cevap geldi.',
    });
    expect(gonderilenler[0]?.data.derin_baglanti).toMatch(/^kopru:\/\/soru\//);
    expect(gonderilenler[0]?.data.bildirim_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(gonderilenler[0]?.data.kurum_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(gonderilenler[0]?.badge).toBeUndefined(); // android: rozet yok
    const g = await gonderim(a);
    expect(g).toMatchObject({
      durum: 'gonderildi',
      saglayici: 'sahte',
      saglayici_mesaj_id: 'bilet-9',
      deneme_sayisi: 1,
      hata_kodu: null,
    });
    expect(g?.gonderildi_at?.toISOString()).toBe(T0.toISOString());
    // ikinci tur bir sey bulmaz
    expect(await gonderimIsle(bagimlilik(s, T0))).toMatchObject({ secilen: 0 });
  });

  it('iOS: rozet sayisi = kullanicinin okunmamis (arsivsiz, gecerli) bildirim sayisi', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId, { platform: 'ios' });
    await uret(a);
    await uret(a);
    await uret(a);
    // biri okundu, biri arsivlendi -> okunmamis 1
    const satirlar = await o.sistem<{ id: string }[]>`
      select id from bildirim.bildirimler where kurum_id = ${a.kurumId} order by id`;
    await o.sistem`update bildirim.bildirimler set okundu_at = now() where id = ${satirlar[0]?.id ?? ''}`;
    await o.sistem`update bildirim.bildirimler set arsivlendi_at = now() where id = ${satirlar[1]?.id ?? ''}`;
    const { s, gonderilenler } = sahteSaglayici();
    await gonderimIsle(bagimlilik(s, T0));
    expect(gonderilenler).toHaveLength(3);
    expect(gonderilenler.every((m) => m.platform === 'ios' && m.badge === 1)).toBe(true);
  });

  it('ertelenen gonderim zamanlanan_at gelmeden islenmez, gelince gonderilir', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await uret(a, GECE); // 11 Kasim 08:00 Istanbul = 05:00Z'ye ertelenir
    const { s, gonderilenler } = sahteSaglayici();
    expect(await gonderimIsle(bagimlilik(s, saat(GECE, 3)))).toMatchObject({ secilen: 0 });
    expect(gonderilenler).toHaveLength(0);
    expect(await gonderimIsle(bagimlilik(s, new Date('2026-11-11T05:00:01Z')))).toMatchObject({
      secilen: 1,
      gonderildi: 1,
    });
    expect((await gonderim(a))?.durum).toBe('gonderildi');
  });

  it('gecici hata: ustel bekleme 1/5/30/120 dk, 5. denemede basarisiz', async () => {
    expect(GONDERIM_BEKLEME_DK).toEqual([1, 5, 30, 120]);
    expect(GONDERIM_AZAMI_DENEME).toBe(5);
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await uret(a);
    const { s } = sahteSaglayici(() => ({ tur: 'gecici', kod: 'http_503' }));
    let simdi = T0;
    const beklenen = [1, 5, 30, 120];
    for (const [i, bekleme] of beklenen.entries()) {
      const ozet = await gonderimIsle(bagimlilik(s, simdi));
      expect(ozet, `deneme ${String(i + 1)}`).toMatchObject({ secilen: 1, yenidenDenecek: 1 });
      const g = await gonderim(a);
      expect(g).toMatchObject({ durum: 'beklemede', deneme_sayisi: i + 1, hata_kodu: 'http_503' });
      expect(g?.zamanlanan_at.toISOString()).toBe(dk(simdi, bekleme).toISOString());
      // bekleme dolmadan secilmez
      expect(await gonderimIsle(bagimlilik(s, dk(simdi, bekleme - 0.5)))).toMatchObject({
        secilen: 0,
      });
      simdi = dk(simdi, bekleme);
    }
    const son = await gonderimIsle(bagimlilik(s, simdi));
    expect(son).toMatchObject({ secilen: 1, basarisiz: 1 });
    expect(await gonderim(a)).toMatchObject({
      durum: 'basarisiz',
      deneme_sayisi: 5,
      hata_kodu: 'http_503',
    });
    expect(await gonderimIsle(bagimlilik(s, saat(simdi, 5)))).toMatchObject({ secilen: 0 });
  });

  it('gecici hatadan sonra basari: deneme sayisi korunur, hata kodu temizlenir', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await uret(a);
    let cagri = 0;
    const { s } = sahteSaglayici(() =>
      ++cagri === 1 ? { tur: 'gecici', kod: 'zaman_asimi' } : { tur: 'gonderildi' },
    );
    await gonderimIsle(bagimlilik(s, T0));
    await gonderimIsle(bagimlilik(s, dk(T0, 1)));
    expect(await gonderim(a)).toMatchObject({
      durum: 'gonderildi',
      deneme_sayisi: 2,
      hata_kodu: null,
    });
  });

  it('kalici hata: basarisiz, yeniden denenmez; DeviceNotRegistered cihazi gecersiz kilar', async () => {
    const a = await aliciKur(o);
    const c = await cihazEkle(o, a.kullaniciId);
    await uret(a);
    const { s } = sahteSaglayici(() => ({
      tur: 'kalici',
      kod: 'DeviceNotRegistered',
      cihazGecersiz: true,
    }));
    const ozet = await gonderimIsle(bagimlilik(s, T0));
    expect(ozet).toMatchObject({ secilen: 1, basarisiz: 1 });
    expect(await gonderim(a)).toMatchObject({
      durum: 'basarisiz',
      hata_kodu: 'DeviceNotRegistered',
      deneme_sayisi: 1,
    });
    const [cihaz] = await o.sistem<{ aktif: boolean; gecersiz_at: Date | null }[]>`
      select aktif, gecersiz_at from bildirim.cihazlar where id = ${c.id}`;
    expect(cihaz?.aktif).toBe(false);
    expect(cihaz?.gecersiz_at?.toISOString()).toBe(T0.toISOString());
    // sonraki bildirimde cihaz_yok
    const [s2] = await uret(a, dk(T0, 1));
    expect(s2?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'cihaz_yok' });
  });

  it('kalici hata (cihazdan bagimsiz): cihaz etkin kalir', async () => {
    const a = await aliciKur(o);
    const c = await cihazEkle(o, a.kullaniciId);
    await uret(a);
    const { s } = sahteSaglayici(() => ({
      tur: 'kalici',
      kod: 'MessageTooBig',
      cihazGecersiz: false,
    }));
    await gonderimIsle(bagimlilik(s, T0));
    const [cihaz] = await o.sistem<
      { aktif: boolean }[]
    >`select aktif from bildirim.cihazlar where id = ${c.id}`;
    expect(cihaz?.aktif).toBe(true);
  });

  it('cihaz uretimden sonra silinmis/pasiflenmisse atlandi (cihaz_yok), saglayici cagrilmaz', async () => {
    const a = await aliciKur(o);
    const c = await cihazEkle(o, a.kullaniciId);
    await uret(a);
    await o.sistem`delete from bildirim.cihazlar where id = ${c.id}`;
    const { s, gonderilenler } = sahteSaglayici();
    const ozet = await gonderimIsle(bagimlilik(s, T0));
    expect(ozet).toMatchObject({ secilen: 1, atlandi: 1 });
    expect(gonderilenler).toHaveLength(0);
    expect(await gonderim(a)).toMatchObject({ durum: 'atlandi', atlama_nedeni: 'cihaz_yok' });
  });

  it('planlanandan 12 saatten fazla gecikmis gonderim atlandi (bayat)', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await uret(a);
    const { s, gonderilenler } = sahteSaglayici();
    await gonderimIsle(bagimlilik(s, saat(T0, 13)));
    expect(gonderilenler).toHaveLength(0);
    expect(await gonderim(a)).toMatchObject({ durum: 'atlandi', atlama_nedeni: 'bayat' });
  });

  it('eszamanli iki isleyici ayni satiri iki kez gondermez (SKIP LOCKED)', async () => {
    const a = await aliciKur(o);
    for (let i = 0; i < 6; i++) {
      await cihazEkle(o, a.kullaniciId);
    }
    await uret(a); // 6 cihaz -> 6 gonderim
    const gonderilenler: string[] = [];
    const yavas: PushSaglayici = {
      ad: 'yavas',
      async gonder(mesajlar) {
        gonderilenler.push(...mesajlar.map((m) => m.gonderimId));
        await new Promise((r) => setTimeout(r, 300));
        return mesajlar.map(() => ({ tur: 'gonderildi' as const }));
      },
    };
    const [x, y] = await Promise.all([
      gonderimIsle(bagimlilik(yavas, T0, { paket: 3 })),
      gonderimIsle(bagimlilik(yavas, T0, { paket: 3 })),
    ]);
    expect(x.secilen + y.secilen).toBe(6);
    expect(new Set(gonderilenler).size).toBe(6);
    expect(gonderilenler).toHaveLength(6);
  });

  it('kurumlar arasi calisir ve paket sinirina uyar', async () => {
    const a = await aliciKur(o);
    const b = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await cihazEkle(o, b.kullaniciId);
    await uret(a);
    await uret(b);
    const { s } = sahteSaglayici();
    expect(await gonderimIsle(bagimlilik(s, T0, { paket: 1 }))).toMatchObject({ secilen: 1 });
    expect(await gonderimIsle(bagimlilik(s, T0, { paket: 1 }))).toMatchObject({ secilen: 1 });
    expect(await gonderimIsle(bagimlilik(s, T0, { paket: 1 }))).toMatchObject({ secilen: 0 });
  });
});
