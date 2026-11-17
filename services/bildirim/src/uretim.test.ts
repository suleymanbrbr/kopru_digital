import { KaliciHata, YenidenDene } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SablonHatasi, SablonKaydi, type SablonTanimi, sablonlar } from './sablonlar.js';
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
import { dbYok } from './test/yardimcilar.js';
import {
  BAYAT_ESIGI_MS,
  GUNLUK_PUSH_SINIRI,
  bildirimUret,
  type BildirimGirdisi,
  type UretimSecenekleri,
} from './uretim.js';

const SISTEM_SABLONLARI: SablonTanimi[] = [
  {
    kod: 'guvenlik_uyarisi',
    kategori: 'sistem',
    kanal: 'kutu',
    baslik: 'Güvenlik',
    govde: 'Yeni giriş yapıldı.',
  },
  {
    kod: 'guvenlik_uyarisi',
    kategori: 'sistem',
    kanal: 'push',
    baslik: 'Güvenlik',
    govde: 'Yeni giriş yapıldı.',
  },
];

describe('bildirimUret sablon kurallari (veritabani gerekmez)', () => {
  it('kisisel veri iceren push sablonu kayit asamasinda reddedilir', () => {
    expect(
      () =>
        new SablonKaydi([
          { kod: 'x', kategori: 'odev', kanal: 'push', govde: 'g', kisiselVeri: true },
        ]),
    ).toThrow(SablonHatasi);
  });
});

describe.skipIf(dbYok())('bildirim uretim hatti (bildirim_app, kurum baglami)', () => {
  let o: Ortam;
  beforeAll(() => {
    o = ortamKur();
  });
  afterAll(async () => {
    await o.kapat();
  });

  const girdi = (a: Alici, ek: Partial<BildirimGirdisi> = {}): BildirimGirdisi => ({
    kurumId: a.kurumId,
    aliciUyelikIdleri: [a.uyelikId],
    sablonKodu: 'soru_cevaplandi',
    degiskenler: { soru_id: uuidv7() },
    veri: {},
    kaynakOlayId: uuidv7(),
    tekilAnahtar: `soru_cevaplandi:${uuidv7()}`,
    ...ek,
  });
  const uret = (
    a: Alici,
    ek: Partial<BildirimGirdisi> = {},
    sec: UretimSecenekleri = { simdi: T0 },
  ) => o.isle(a.kurumId, (tx) => bildirimUret(tx, girdi(a, ek), sec));
  const gonderimler = (a: Alici) =>
    o.sistem<
      {
        durum: string;
        atlama_nedeni: string | null;
        hedef_anahtar: string;
        zamanlanan_at: Date;
        baslik: string | null;
        govde: string | null;
        derin_baglanti: string | null;
      }[]
    >`select durum, atlama_nedeni, hedef_anahtar, zamanlanan_at, baslik, govde, derin_baglanti
        from bildirim.gonderimler where kurum_id = ${a.kurumId} order by created_at, hedef_anahtar`;
  const bildirimSayisi = async (a: Alici) =>
    (
      await o.sistem<{ n: number }[]>`
        select count(*)::int n from bildirim.bildirimler where kurum_id = ${a.kurumId}`
    )[0]?.n;

  it('kutu satiri ve cihaz basina bir push gonderimi uretir (genel metin, derin baglanti)', async () => {
    const a = await aliciKur(o);
    const c1 = await cihazEkle(o, a.kullaniciId);
    const c2 = await cihazEkle(o, a.kullaniciId, { platform: 'ios' });
    const soruId = uuidv7();
    const [s] = await uret(a, { degiskenler: { soru_id: soruId }, veri: { soru_id: soruId } });
    expect(s).toMatchObject({
      aliciId: a.uyelikId,
      sonuc: 'uretildi',
      push: { durum: 'beklemede', satir: 2 },
    });

    const [b] = await o.sistem<
      {
        baslik: string;
        govde: string;
        derin_baglanti: string;
        kategori: string;
        veri: unknown;
        alici_id: string;
      }[]
    >`select baslik, govde, derin_baglanti, kategori, veri, alici_id from bildirim.bildirimler where kurum_id = ${a.kurumId}`;
    expect(b).toEqual({
      baslik: 'Sorun cevaplandı',
      govde: 'Sorduğun soruya cevap geldi. Açıp bakabilirsin.',
      derin_baglanti: `kopru://soru/${soruId}`,
      kategori: 'soru',
      veri: { soru_id: soruId },
      alici_id: a.uyelikId,
    });
    const g = await gonderimler(a);
    expect(g.map((x) => x.hedef_anahtar).sort()).toEqual([c1.id, c2.id].sort());
    expect(g.every((x) => x.durum === 'beklemede')).toBe(true);
    expect(g[0]).toMatchObject({
      baslik: 'Sorun cevaplandı',
      govde: 'Sorduğun soruya cevap geldi.',
      derin_baglanti: `kopru://soru/${soruId}`,
    });
    expect(g[0]?.zamanlanan_at.toISOString()).toBe(T0.toISOString());
  });

  it('idempotent: ayni tekil anahtar ikinci kez bildirim ve gonderim uretmez', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    const anahtar = `soru_cevaplandi:${uuidv7()}`;
    const [ilk] = await uret(a, { tekilAnahtar: anahtar });
    expect(ilk?.sonuc).toBe('uretildi');
    const [ikinci] = await uret(a, { tekilAnahtar: anahtar }); // farkli olay kimligiyle bile
    expect(ikinci).toEqual({ aliciId: a.uyelikId, sonuc: 'tekrar' });
    expect(await bildirimSayisi(a)).toBe(1);
    expect(await gonderimler(a)).toHaveLength(1);
  });

  it('birden cok alici: her biri kendi kullanicisinin cihazina; tekrar eden alici kimligi tek sayilir', async () => {
    const a = await aliciKur(o);
    const b = await aliciKur(o, { kurumId: a.kurumId });
    const ca = await cihazEkle(o, a.kullaniciId);
    const cb = await cihazEkle(o, b.kullaniciId);
    const sonuc = await uret(a, { aliciUyelikIdleri: [a.uyelikId, b.uyelikId, a.uyelikId] });
    expect(sonuc.map((s) => s.sonuc)).toEqual(['uretildi', 'uretildi']);
    const g = await gonderimler(a);
    expect(g.map((x) => x.hedef_anahtar).sort()).toEqual([ca.id, cb.id].sort());
  });

  it('baska kullanicinin cihazi alicinin gonderimine karismaz; kullanici baglami geri yuklenir', async () => {
    const a = await aliciKur(o);
    const baska = await aliciKur(o, { kurumId: a.kurumId });
    await cihazEkle(o, baska.kullaniciId);
    const sonuc = await o.isle(a.kurumId, async (tx) => {
      const r = await bildirimUret(tx, girdi(a), { simdi: T0 });
      const [ctx] = await tx.execute<{ v: string }>(
        sql`select current_setting('app.kullanici_id', true) as v`,
      );
      return { r, ctx: ctx?.v };
    });
    expect(sonuc.r[0]?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'cihaz_yok' });
    expect(sonuc.ctx).toBe('');
  });

  it('alici uyelik kopyasi yoksa YenidenDene (islem geri alinir)', async () => {
    const a = await aliciKur(o);
    const yok = { ...a, uyelikId: uuidv7() };
    await expect(uret(yok)).rejects.toBeInstanceOf(YenidenDene);
    expect(await bildirimSayisi(a)).toBe(0);
  });

  it('etkin olmayan uyelige (ayrildi) bildirim uretilmez', async () => {
    const a = await aliciKur(o, { durum: 'ayrildi' });
    const [s] = await uret(a);
    expect(s?.sonuc).toBe('uyelik_aktif_degil');
    expect(await bildirimSayisi(a)).toBe(0);
  });

  it('eksik sablon degiskeni ve bilinmeyen sablon kalici hata', async () => {
    const a = await aliciKur(o);
    await expect(uret(a, { degiskenler: {} })).rejects.toBeInstanceOf(KaliciHata);
    await expect(uret(a, { sablonKodu: 'olmayan_sablon' })).rejects.toThrow(/kutu şablonu yok/);
    expect(await bildirimSayisi(a)).toBe(0);
  });

  it('push tercihi kapali: yalniz kutu yazilir, push atlandi (tercih)', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
                   values (${a.kullaniciId}, ${a.kurumId}, 'soru', 'push', false)`;
    const [s] = await uret(a);
    expect(s?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'tercih' });
    expect(await bildirimSayisi(a)).toBe(1);
    const g = await gonderimler(a);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ durum: 'atlandi', atlama_nedeni: 'tercih', baslik: null });
  });

  it('baska kategorinin push tercihi etkilemez', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    await o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
                   values (${a.kullaniciId}, ${a.kurumId}, 'odev', 'push', false)`;
    const [s] = await uret(a);
    expect(s?.push?.durum).toBe('beklemede');
  });

  it('kurum askida/kapali: kutu yazilir, push atlandi (kurum_askida)', async () => {
    const a = await aliciKur(o, { kurumDurum: 'askida' });
    await cihazEkle(o, a.kullaniciId);
    const [s] = await uret(a);
    expect(s?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'kurum_askida' });
    expect(await bildirimSayisi(a)).toBe(1);
  });

  it('etkin cihaz yoksa (pasif ya da gecersiz) atlandi (cihaz_yok)', async () => {
    const a = await aliciKur(o);
    const c = await cihazEkle(o, a.kullaniciId);
    await o.sistem`update bildirim.cihazlar set aktif = false where id = ${c.id}`;
    const c2 = await cihazEkle(o, a.kullaniciId);
    await o.sistem`update bildirim.cihazlar set gecersiz_at = now() where id = ${c2.id}`;
    const [s] = await uret(a);
    expect(s?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'cihaz_yok' });
  });

  describe('sessiz saat', () => {
    it('22:00-08:00 icinde push ertelendi, zamanlanan_at sessiz saat bitisi; kutu etkilenmez', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      const [s] = await uret(a, {}, { simdi: GECE });
      expect(s?.push).toMatchObject({ durum: 'ertelendi', satir: 1 });
      const g = await gonderimler(a);
      expect(g[0]?.durum).toBe('ertelendi');
      // 10 Kasim 23:30 Istanbul -> 11 Kasim 08:00 Istanbul = 05:00Z
      expect(g[0]?.zamanlanan_at.toISOString()).toBe('2026-11-11T05:00:00.000Z');
      expect(await bildirimSayisi(a)).toBe(1);
    });

    it('kullanicinin ozel sessiz saati uygulanir (sessiz_gunler bos: kapali)', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id, sessiz_gunler)
                     values (${a.kullaniciId}, ${a.kurumId}, '{}')`;
      const [s] = await uret(a, {}, { simdi: GECE });
      expect(s?.push?.durum).toBe('beklemede');
    });

    it('erteleme 12 saati asarsa atlandi (bayat)', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      // Sessiz aralik 18:00-08:00; 19:00'da gelen bildirim 13 saat ertelenirdi.
      await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id, sessiz_baslangic, sessiz_bitis)
                     values (${a.kullaniciId}, ${a.kurumId}, '18:00', '08:00')`;
      const yedi = new Date('2026-11-10T16:00:00Z'); // 19:00 Istanbul
      const [s] = await uret(a, {}, { simdi: yedi });
      expect(s?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'bayat' });
      // 12 saat sinirinin hemen altinda ertelenir: 20:30'da 11.5 saat
      const b = await aliciKur(o);
      await cihazEkle(o, b.kullaniciId);
      await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id, sessiz_baslangic, sessiz_bitis)
                     values (${b.kullaniciId}, ${b.kurumId}, '20:00', '08:00')`;
      const [e] = await uret(b, {}, { simdi: new Date('2026-11-10T17:30:00Z') }); // 20:30 -> 11.5 saat
      expect(e?.push?.durum).toBe('ertelendi');
      expect(BAYAT_ESIGI_MS).toBe(12 * 3_600_000);
    });

    it('ertelenemez bildirim sessiz saatte ertelenmez, atlandi (sessiz_saat) olur', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      const [s] = await uret(a, { ertelenemez: true }, { simdi: GECE });
      expect(s?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'sessiz_saat' });
      expect(await bildirimSayisi(a)).toBe(1);
    });
  });

  describe('gunluk push ust siniri', () => {
    it(`ogrenciye yerel gunde en cok ${String(GUNLUK_PUSH_SINIRI)} push; asan atlandi (kota); ertesi gun sifirlanir`, async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      const durumlar: (string | undefined)[] = [];
      for (let i = 0; i < GUNLUK_PUSH_SINIRI + 2; i++) {
        const [s] = await uret(a, {}, { simdi: dk(T0, i) });
        durumlar.push(s?.push?.atlamaNedeni ?? s?.push?.durum);
      }
      expect(durumlar).toEqual([
        'beklemede',
        'beklemede',
        'beklemede',
        'beklemede',
        'beklemede',
        'kota',
        'kota',
      ]);
      expect(await bildirimSayisi(a)).toBe(GUNLUK_PUSH_SINIRI + 2); // kutu etkilenmez
      // Ertesi yerel gun
      const [yarin] = await uret(a, {}, { simdi: saat(T0, 24) });
      expect(yarin?.push?.durum).toBe('beklemede');
    });

    it('yerel gun siniri gece yarisinda (Istanbul 00:00) doner', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      // Sessiz saati kapat: gece yarisi civari saatleri deneyebilmek icin.
      await o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id, sessiz_gunler)
                     values (${a.kullaniciId}, ${a.kurumId}, '{}')`;
      const once = new Date('2026-11-10T20:30:00Z'); // 23:30 Istanbul
      for (let i = 0; i < GUNLUK_PUSH_SINIRI; i++) await uret(a, {}, { simdi: dk(once, i) });
      const [asan] = await uret(a, {}, { simdi: dk(once, 10) }); // hala 10 Kasim 23:40
      expect(asan?.push?.atlamaNedeni).toBe('kota');
      const [sonra] = await uret(a, {}, { simdi: dk(once, 40) }); // 11 Kasim 00:10 yerel
      expect(sonra?.push?.durum).toBe('beklemede');
    });

    it('yalniz ogrenci rolu sinirlidir (ogretmen muaf)', async () => {
      const a = await aliciKur(o, { rol: 'ogretmen' });
      await cihazEkle(o, a.kullaniciId);
      for (let i = 0; i < GUNLUK_PUSH_SINIRI + 2; i++) {
        const [s] = await uret(a, {}, { simdi: dk(T0, i) });
        expect(s?.push?.durum).toBe('beklemede');
      }
    });

    it('sistem kategorisi sinira takilmaz ve sayilmaz', async () => {
      const kayit = new SablonKaydi([...SISTEM_SABLONLARI]);
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      for (let i = 0; i < GUNLUK_PUSH_SINIRI; i++) await uret(a, {}, { simdi: dk(T0, i) });
      const kota = await uret(a, {}, { simdi: dk(T0, 10) });
      expect(kota[0]?.push?.atlamaNedeni).toBe('kota');
      for (let i = 0; i < 3; i++) {
        const [s] = await uret(
          a,
          { sablonKodu: 'guvenlik_uyarisi', degiskenler: {} },
          { simdi: dk(T0, 20 + i), sablonlar: kayit },
        );
        expect(s?.push?.durum, `sistem ${String(i)}`).toBe('beklemede');
      }
    });
  });

  describe('sistem kategorisi', () => {
    const kayit = new SablonKaydi([...SISTEM_SABLONLARI]);

    it('tercih kaydi olsa bile push gider; sessiz saati delmez (atlandi sessiz_saat)', async () => {
      const a = await aliciKur(o);
      await cihazEkle(o, a.kullaniciId);
      const gunduz = await o.isle(a.kurumId, (tx) =>
        bildirimUret(tx, girdi(a, { sablonKodu: 'guvenlik_uyarisi', degiskenler: {} }), {
          simdi: T0,
          sablonlar: kayit,
        }),
      );
      expect(gunduz[0]?.push?.durum).toBe('beklemede');
      const gece = await o.isle(a.kurumId, (tx) =>
        bildirimUret(tx, girdi(a, { sablonKodu: 'guvenlik_uyarisi', degiskenler: {} }), {
          simdi: GECE,
          sablonlar: kayit,
        }),
      );
      expect(gece[0]?.push).toMatchObject({ durum: 'atlandi', atlamaNedeni: 'sessiz_saat' });
    });
  });

  it('kisisel veri iceren push sablonu uretim sirasinda da reddedilir (kod guvencesi)', async () => {
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    const kotu = {
      bul: (kod: string, kanal: string) =>
        kod === 'kisisel' && kanal === 'kutu'
          ? { kod, kategori: 'odev', kanal, govde: 'ad: {{ad}}', kisiselVeri: true }
          : kod === 'kisisel' && kanal === 'push'
            ? { kod, kategori: 'odev', kanal, govde: 'ad: {{ad}}', kisiselVeri: true }
            : undefined,
    } as unknown as SablonKaydi;
    await expect(
      uret(
        a,
        { sablonKodu: 'kisisel', degiskenler: { ad: 'Ali' } },
        { simdi: T0, sablonlar: kotu },
      ),
    ).rejects.toThrow(/kişisel veri içeren şablon push'ta kullanılamaz/);
    expect(await bildirimSayisi(a)).toBe(0);
  });

  it('kutu sablonu kisisel veri icerebilir; push metnine sizmaz', async () => {
    const kayit = new SablonKaydi([
      {
        kod: 'odev_teslim',
        kategori: 'odev',
        kanal: 'kutu',
        baslik: '{{ogrenci_adi}} teslim etti',
        govde: 'Ödev teslim edildi.',
        kisiselVeri: true,
      },
      {
        kod: 'odev_teslim',
        kategori: 'odev',
        kanal: 'push',
        baslik: 'Ödev teslim edildi',
        govde: 'Bir öğrenci ödevini teslim etti.',
      },
    ]);
    const a = await aliciKur(o, { rol: 'ogretmen' });
    await cihazEkle(o, a.kullaniciId);
    await uret(
      a,
      { sablonKodu: 'odev_teslim', degiskenler: { ogrenci_adi: 'Ayşe Y.' } },
      { simdi: T0, sablonlar: kayit },
    );
    const [b] = await o.sistem<
      { baslik: string }[]
    >`select baslik from bildirim.bildirimler where kurum_id = ${a.kurumId}`;
    expect(b?.baslik).toBe('Ayşe Y. teslim etti');
    const g = await gonderimler(a);
    expect(g[0]?.baslik).toBe('Ödev teslim edildi');
    expect(JSON.stringify(g)).not.toContain('Ayşe');
  });

  it('gecerlilik_bitis_at kaydedilir (seri hatirlatmasi gibi)', async () => {
    const a = await aliciKur(o);
    const bitis = saat(T0, 6);
    await uret(a, {
      sablonKodu: 'seri_hatirlatma',
      degiskenler: { mevcut_seri: 5 },
      gecerlilikBitisAt: bitis,
    });
    const [b] = await o.sistem<{ gecerlilik_bitis_at: Date; govde: string }[]>`
      select gecerlilik_bitis_at, govde from bildirim.bildirimler where kurum_id = ${a.kurumId}`;
    expect(b?.gecerlilik_bitis_at.toISOString()).toBe(bitis.toISOString());
    expect(b?.govde).toContain('5 günlük');
  });

  it('push sablonu olmayan kod yalniz kutuya yazar (push satiri yok)', async () => {
    const kayit = new SablonKaydi([
      { kod: 'yalniz_kutu', kategori: 'duyuru', kanal: 'kutu', baslik: 'B', govde: 'G' },
    ]);
    const a = await aliciKur(o);
    await cihazEkle(o, a.kullaniciId);
    const [s] = await uret(
      a,
      { sablonKodu: 'yalniz_kutu', degiskenler: {} },
      { simdi: T0, sablonlar: kayit },
    );
    expect(s).toMatchObject({ sonuc: 'uretildi' });
    expect(s?.push).toBeUndefined();
    expect(await gonderimler(a)).toHaveLength(0);
    // varsayilan kayitta iki ornek sablon da var
    expect(sablonlar.bul('soru_cevaplandi', 'push')).toBeDefined();
  });
});
