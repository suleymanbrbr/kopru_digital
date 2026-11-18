import type {
  PlatformAyarDegerleri,
  PlatformAyarSurumu,
  PlatformKuralDegeri,
} from '@kopru/contracts';
import type { Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOHUM_KURALLAR, haftalikXp, ilkGunXp } from './duzenli-ogrenci.js';
import {
  TOHUM_DEGERLER,
  dogrula,
  kuralDegerleri,
  uyarilariHesapla,
  type KuralYapisi,
} from './platform-ayar.js';
import { platformYoneticisiGerekli } from './platform-yetki.js';
import { T0, dk, olay, ortamKur, type Ortam, type Senaryo } from './test/ortam.js';
import {
  dbYok,
  hataMetni,
  kullaniciTokeni,
  platformTokeni,
  testServisi,
  yeniKimlik,
  yetki,
} from './test/yardimcilar.js';
import { kayitIzlendiIsle, yoklamaIsle } from './xp-tuketici.js';

const yapi: Record<string, KuralYapisi> = {
  yoklama_geldi: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  odev_teslim: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  plan_gorevi_tamam: { tavanGrubu: 'plan', genelTavanaTabi: true, birim: null },
  odak_oturumu: { tavanGrubu: 'odak', genelTavanaTabi: true, birim: 'dakika' },
  deneme_net_artisi: { tavanGrubu: null, genelTavanaTabi: true, birim: 'net' },
  haftanin_yildizi: { tavanGrubu: null, genelTavanaTabi: false, birim: null },
};
const kopya = () => structuredClone(TOHUM_DEGERLER);
const kural = (d: PlatformAyarDegerleri, kod: string): PlatformKuralDegeri => {
  const k = d.kurallar[kod];
  if (!k) throw new Error(`kural yok: ${kod}`);
  return k;
};
const seviyeler = new Map<number, number>([
  [3, 60],
  [5, 380],
  [12, 3300],
  [25, 7500],
  [40, 20000],
]);

describe('platform ayar dogrulamasi (saf)', () => {
  it('tohum degerleri gecerli ve duzenli ogrenci modeli tohumla ayni', () => {
    expect(dogrula(TOHUM_DEGERLER, yapi)).toEqual([]);
    expect(haftalikXp(kuralDegerleri(TOHUM_DEGERLER))).toBe(haftalikXp(TOHUM_KURALLAR));
    expect(ilkGunXp(kuralDegerleri(TOHUM_DEGERLER))).toBe(ilkGunXp(TOHUM_KURALLAR));
    expect(uyarilariHesapla(TOHUM_DEGERLER, TOHUM_DEGERLER, seviyeler)).toEqual([]);
  });

  it('aralik hatalari: negatif, tam sayi degil, ust sinir, carpan', () => {
    const d = kopya();
    kural(d, 'yoklama_geldi').xp = -1;
    kural(d, 'odev_teslim').xp = 501;
    kural(d, 'plan_gorevi_tamam').xp = 2.5;
    kural(d, 'deneme_net_artisi').olay_basi_ust_sinir = 0;
    kural(d, 'odev_teslim').gec_carpani = 1.5;
    d.tavanlar.odak = 0;
    d.tavanlar.kayit = 2001;
    const alanlar = dogrula(d, yapi).map((h) => h.alan);
    expect(alanlar).toEqual(
      expect.arrayContaining([
        'kurallar.yoklama_geldi.xp',
        'kurallar.odev_teslim.xp',
        'kurallar.plan_gorevi_tamam.xp',
        'kurallar.deneme_net_artisi.olay_basi_ust_sinir',
        'kurallar.odev_teslim.gec_carpani',
        'tavanlar.odak',
        'tavanlar.kayit',
      ]),
    );
  });

  it("tutarlilik: alt tavan genel tavani asamaz; kural XP'si tavanini asamaz", () => {
    const d = kopya();
    d.tavanlar.genel = 100;
    const h = dogrula(d, yapi);
    expect(h.map((x) => x.alan)).toContain('tavanlar.odak'); // 120 > 100
    const e = kopya();
    kural(e, 'plan_gorevi_tamam').xp = 41; // plan tavani 40
    expect(dogrula(e, yapi).map((x) => x.alan)).toContain('kurallar.plan_gorevi_tamam.xp');
    const f = kopya();
    kural(f, 'deneme_net_artisi').xp = 60; // net basina 60 > olay basi 50
    expect(dogrula(f, yapi).map((x) => x.alan)).toContain('kurallar.deneme_net_artisi.xp');
    const g = kopya();
    kural(g, 'haftanin_yildizi').xp = 500; // tavandan muaf, 500'e kadar serbest
    expect(dogrula(g, yapi)).toEqual([]);
  });

  it('varsayimi bozan degisiklik reddedilmez, uyari doner', () => {
    const d = kopya();
    kural(d, 'yoklama_geldi').xp = 5;
    kural(d, 'plan_gorevi_tamam').xp = 1;
    kural(d, 'odak_oturumu').xp = 0;
    expect(dogrula(d, yapi)).toEqual([]);
    const kodlar = uyarilariHesapla(TOHUM_DEGERLER, d, seviyeler).map((u) => u.kod);
    expect(kodlar).toEqual(
      expect.arrayContaining(['haftalik_xp_degisti', 'seviye_hedefi_kaydi', 'kural_kapatildi']),
    );

    const dar = kopya();
    dar.tavanlar.genel = 50; // tipik ders gunu (75) kirpilir; ilk gun 2 seviye (60 XP) tutmaz
    const k2 = uyarilariHesapla(TOHUM_DEGERLER, dar, seviyeler).map((u) => u.kod);
    expect(k2).toEqual(expect.arrayContaining(['genel_tavan_dar', 'ilk_gun_hedefi']));
  });
});

describe('platform yetki kontrolu (saf)', () => {
  const auth = (claims: Record<string, unknown>) => ({
    kullaniciId: 'u',
    kurumId: null,
    uyelikId: null,
    rol: null,
    sessionId: null,
    roller: [],
    claims,
  });
  const acik = { izinliIpler: [], uretim: false };

  it('yalniz plat=yonetici; imp ve destek reddedilir', () => {
    expect(() => platformYoneticisiGerekli(null, '1.1.1.1', acik)).toThrow(/Oturum/);
    expect(() => platformYoneticisiGerekli(auth({}), '1.1.1.1', acik)).toThrow(/platform/);
    expect(() => platformYoneticisiGerekli(auth({ plat: 'destek' }), '1.1.1.1', acik)).toThrow(
      /platform/,
    );
    expect(() =>
      platformYoneticisiGerekli(
        auth({ plat: 'yonetici', imp: { taklit_id: 'x' } }),
        '1.1.1.1',
        acik,
      ),
    ).toThrow(/Taklit/);
    expect(platformYoneticisiGerekli(auth({ plat: 'yonetici' }), '1.1.1.1', acik)).toBeTruthy();
  });

  it('IP izin listesi: bos liste gelistirmede acik, uretimde kapali; CIDR ve tek IP', () => {
    const yon = auth({ plat: 'yonetici' });
    expect(() =>
      platformYoneticisiGerekli(yon, '1.1.1.1', { izinliIpler: [], uretim: true }),
    ).toThrow(/adresten/);
    const liste = { izinliIpler: ['10.0.0.0/8', '192.168.1.5'], uretim: true };
    expect(platformYoneticisiGerekli(yon, '10.20.30.40', liste)).toBeTruthy();
    expect(platformYoneticisiGerekli(yon, '::ffff:192.168.1.5', liste)).toBeTruthy();
    expect(() => platformYoneticisiGerekli(yon, '192.168.1.6', liste)).toThrow(/adresten/);
  });
});

describe.skipIf(dbYok())('platform ayar uclari (gercek PostgreSQL)', () => {
  let o: Ortam;
  let servis: Service;
  const URL = '/platform/motivasyon/ayarlar';
  const yonetici = uuidv7();
  /** Yanit govdeleri (GET, surum ve hata govdesi birlikte; testler yalniz ilgili alani okur). */
  interface Yanit extends PlatformAyarSurumu {
    gecerli: { surum: number; degerler: PlatformAyarDegerleri };
    gecmis: PlatformAyarSurumu[];
    error: { code: string; message: string; details: { hatalar: unknown[]; guncel_surum: number } };
  }
  const govde = (r: { body: string }) => JSON.parse(r.body) as Yanit;

  const cagir = async (
    yontem: 'GET' | 'PUT' | 'POST',
    url: string,
    token: string | null,
    payload?: unknown,
  ) =>
    servis.app.inject({
      method: yontem,
      url,
      ...(token ? { headers: yetki(token) } : {}),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  const yoneticiTokeni = () => platformTokeni('yonetici', {}, yonetici);
  const put = async (payload: unknown) => cagir('PUT', URL, await yoneticiTokeni(), payload);
  const geriAl = async (surum: number, neden = 'geri alma testi') =>
    cagir('POST', `${URL}/geri-al`, await yoneticiTokeni(), { surum, neden });
  const xpKurali = async (kod: string) =>
    (await o.sistem<{ xp: number }[]>`select xp from motivasyon.xp_kurallari where kod = ${kod}`)[0]
      ?.xp;
  const toplamXp = async (kurumId: string, ogrenciId: string) =>
    (
      await o.sistem<{ n: number }[]>`
        select toplam_xp::int n from motivasyon.ogrenci_durumlari
         where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}`
    )[0]?.n;
  const yoklama = (s: Senaryo, dakika: number) =>
    o.isle(s.kurumId, (tx) =>
      yoklamaIsle(
        tx,
        olay.yoklama(s, { at: dk(T0, dakika), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
      ),
    );

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi();
    await servis.app.ready();
  });
  afterAll(async () => {
    // Paylasilan test veritabani: sonraki dosyalar icin tohum degerlerine don.
    const t = await yoneticiTokeni();
    const son = govde(await cagir('GET', `${URL}?limit=1`, t)) as { gecerli: { surum: number } };
    if (son.gecerli.surum > 1)
      await cagir('POST', `${URL}/geri-al`, t, { surum: 1, neden: 'test sonu' });
    await servis.stop();
    await o.kapat();
  });

  it('yetkisiz 401; kurum rolleri, destek, plat yok ve taklit 403', async () => {
    expect((await cagir('GET', URL, null)).statusCode).toBe(401);
    const kurumYoneticisi = await kullaniciTokeni(yeniKimlik('yonetici'));
    const sahip = await kullaniciTokeni(yeniKimlik('sahip'));
    const denemeler: [string, number, string][] = [
      [kurumYoneticisi, 403, 'izin_yok'],
      [sahip, 403, 'izin_yok'],
      [await platformTokeni('destek'), 403, 'izin_yok'],
      [await platformTokeni(null), 403, 'izin_yok'],
      [
        await platformTokeni('yonetici', { imp: { taklit_id: uuidv7(), bitis: 'x' } }),
        403,
        'taklit_salt_okunur',
      ],
    ];
    for (const [token, durum, kod] of denemeler) {
      for (const [yontem, payload] of [
        ['GET', undefined],
        ['PUT', { neden: 'deneme', tavanlar: { plan: 41 } }],
        ['POST', { surum: 1, neden: 'deneme' }],
      ] as const) {
        const r = await cagir(yontem, yontem === 'POST' ? `${URL}/geri-al` : URL, token, payload);
        expect(r.statusCode).toBe(durum);
        expect(govde(r).error.code).toBe(kod);
      }
    }
    expect(await xpKurali('yoklama_geldi')).toBe(20);
    expect(
      (await o.sistem`select 1 from motivasyon.platform_ayar_surumleri where surum > 1`).length,
    ).toBe(0);
  });

  it('IP izin listesi disindaki adres 403; listedeki adres 200', async () => {
    const kisitli = testServisi({ MOTIVASYON_PLATFORM_IP_IZINLI: '10.0.0.0/8' });
    await kisitli.app.ready();
    try {
      const t = await yoneticiTokeni();
      const disarda = await kisitli.app.inject({
        method: 'GET',
        url: URL,
        headers: yetki(t),
        remoteAddress: '203.0.113.9',
      });
      expect(disarda.statusCode).toBe(403);
      const iceride = await kisitli.app.inject({
        method: 'GET',
        url: URL,
        headers: yetki(t),
        remoteAddress: '10.9.8.7',
      });
      expect(iceride.statusCode).toBe(200);
    } finally {
      await kisitli.stop();
    }
  });

  it('GET: tohum degerleri ve surum 1 gecmisi', async () => {
    const r = await cagir('GET', URL, await yoneticiTokeni());
    expect(r.statusCode).toBe(200);
    const b = govde(r);
    expect(b.gecerli.surum).toBe(1);
    expect(b.gecerli.degerler).toEqual(TOHUM_DEGERLER);
    expect(b.gecmis).toHaveLength(1);
    expect(b.gecmis[0]?.degistiren_kullanici_id).toBeNull();
    expect(b.gecmis[0]?.degerler).toEqual(TOHUM_DEGERLER);
  });

  it('PUT dogrulama: 422 ayar_gecersiz ve hicbir sey degismez', async () => {
    const gecersizler = [
      { neden: 'deneme', kurallar: { yoklama_geldi: { xp: -5 } } },
      { neden: 'deneme', kurallar: { yoklama_geldi: { xp: 1000 } } },
      { neden: 'deneme', kurallar: { yoklama_geldi: { xp: 2.5 } } },
      { neden: 'deneme', kurallar: { odev_teslim: { gec_carpani: 1.5 } } },
      { neden: 'deneme', kurallar: { bilinmeyen_kural: { xp: 1 } } },
      { neden: 'deneme', tavanlar: { bilinmeyen: 10 } },
      { neden: 'deneme', tavanlar: { plan: 0 } },
      { neden: 'deneme', tavanlar: { genel: 100 } }, // odak (120) genel'i asar
      { neden: 'deneme', tavanlar: { plan: 400 } }, // alt tavan genel'i (300) asar
      { neden: 'deneme', kurallar: { plan_gorevi_tamam: { xp: 41 } } }, // plan tavani 40
    ];
    for (const p of gecersizler) {
      const r = await put(p);
      expect(r.statusCode, JSON.stringify(p)).toBe(422);
      const e = govde(r).error;
      expect(e.code).toBe('ayar_gecersiz');
      expect(e.details.hatalar.length).toBeGreaterThan(0);
    }
    // Sema hatalari: neden yok/kisa, bos degisiklik degil ama bilinmeyen alan
    expect((await put({ tavanlar: { plan: 41 } })).statusCode).toBe(400);
    expect((await put({ neden: 'a', tavanlar: { plan: 41 } })).statusCode).toBe(400);
    expect(
      (await put({ neden: 'deneme', kurallar: { yoklama_geldi: { aktif_degil: 1 } } })).statusCode,
    ).toBe(400);
    // Degisiklik yok
    const ayni = await put({ neden: 'deneme', tavanlar: { plan: 40 } });
    expect(ayni.statusCode).toBe(422);
    expect(govde(ayni).error.code).toBe('degisiklik_yok');
    expect(
      (await o.sistem`select 1 from motivasyon.platform_ayar_surumleri where surum > 1`).length,
    ).toBe(0);
    expect(await xpKurali('yoklama_geldi')).toBe(20);
  });

  it("surumleme: yeni surum, denetim kaydi, ve degisiklik gecmise donuk XP'yi degistirmez", async () => {
    const kurumId = uuidv7();
    const a = { kurumId, ogrenciId: uuidv7() };
    await yoklama(a, 0); // degisiklikten once: 20 XP
    expect(await toplamXp(kurumId, a.ogrenciId)).toBe(20);

    const r = await put({
      neden: "Yoklama XP'si artirildi",
      kurallar: { yoklama_geldi: { xp: 25 } },
    });
    expect(r.statusCode).toBe(200);
    const v = govde(r) as PlatformAyarSurumu;
    expect(v.surum).toBe(2);
    expect(v.onceki_surum).toBe(1);
    expect(v.geri_alinan_surum).toBeNull();
    expect(v.degistiren_kullanici_id).toBe(yonetici);
    expect(v.neden).toBe("Yoklama XP'si artirildi");
    expect(v.degerler.kurallar.yoklama_geldi?.xp).toBe(25);
    expect(v.uyarilar).toEqual([]); // 393 -> 408 haftalik, %10 altinda

    // Gecerli tabloya uygulandi; denetim: yapilandirma_gecmisi (anahtar bazinda, kim/neden)
    expect(await xpKurali('yoklama_geldi')).toBe(25);
    const g = await o.sistem<
      { once: { xp: number }; sonra: { xp: number }; kim: string; neden: string }[]
    >`
      select once, sonra, degistiren_kullanici_id::text as kim, neden
        from motivasyon.yapilandirma_gecmisi where tablo = 'xp_kurallari' and anahtar = 'yoklama_geldi'
         and neden = ${"Yoklama XP'si artirildi"}`;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ once: { xp: 20 }, sonra: { xp: 25 }, kim: yonetici });

    // Gecmise donuk: onceki XP ve toplam ayni; yeni olay yeni degerle (baska baglanti havuzu = baska "worker")
    expect(await toplamXp(kurumId, a.ogrenciId)).toBe(20);
    const eski = await o.sistem<{ xp: number }[]>`
      select xp from motivasyon.xp_hareketleri where kurum_id = ${kurumId} and ogrenci_id = ${a.ogrenciId}`;
    expect(eski.map((x) => x.xp)).toEqual([20]);
    await yoklama(a, 5);
    expect(await toplamXp(kurumId, a.ogrenciId)).toBe(45); // 20 (eski deger) + 25 (yeni deger)
    const b = { kurumId: uuidv7(), ogrenciId: uuidv7() };
    await yoklama(b, 0);
    expect(await toplamXp(b.kurumId, b.ogrenciId)).toBe(25);

    // Tavan degisikligi de sonraki olaylara uygulanir
    const t = await put({
      neden: 'Kayit tavani dusuruldu',
      tavanlar: { kayit: 8 },
      beklenen_surum: 2,
    });
    expect(t.statusCode).toBe(200);
    expect(govde(t).surum).toBe(3);
    const c = { kurumId: uuidv7(), ogrenciId: uuidv7() };
    for (const dakika of [0, 1]) {
      await o.isle(c.kurumId, (tx) => kayitIzlendiIsle(tx, olay.kayitIzlendi(c, dk(T0, dakika))));
    }
    expect(await toplamXp(c.kurumId, c.ogrenciId)).toBe(8); // 5 + 3 (yeni tavana kirpildi; tohumda 10)
    const kismi = await o.sistem<{ kismi: boolean }[]>`
      select kismi from motivasyon.xp_hareketleri where kurum_id = ${c.kurumId} order by created_at, id`;
    expect(kismi.map((k) => k.kismi)).toEqual([false, true]);
  });

  it('beklenen_surum eskiyse 409 surum_catismasi', async () => {
    const r = await put({ neden: 'catisma', tavanlar: { kayit: 16 }, beklenen_surum: 1 });
    expect(r.statusCode).toBe(409);
    expect(govde(r).error.code).toBe('surum_catismasi');
    expect(govde(r).error.details.guncel_surum).toBe(3);
  });

  it('uyari: varsayimi bozan degisiklik uygulanir ve uyarilar yanitta doner', async () => {
    const r = await put({
      neden: 'Deneme: odak XP kapatildi',
      kurallar: { odak_oturumu: { xp: 0 }, plan_gorevi_tamam: { xp: 1 } },
    });
    expect(r.statusCode).toBe(200);
    const v = govde(r) as PlatformAyarSurumu;
    expect(v.surum).toBe(4);
    const kodlar = v.uyarilar.map((u) => u.kod);
    expect(kodlar).toEqual(expect.arrayContaining(['haftalik_xp_degisti', 'kural_kapatildi']));
    expect(await xpKurali('odak_oturumu')).toBe(0);
    // Uyarilar surumde saklanir (GET gecmisi)
    const gecmis = govde(await cagir('GET', `${URL}?limit=1`, await yoneticiTokeni()));
    expect(gecmis.gecmis[0]?.uyarilar.length).toBe(v.uyarilar.length);
  });

  it('geri al: eski surumun degerleriyle yeni surum; gecmis silinmez; yeni olay eski degerle', async () => {
    expect((await geriAl(99)).statusCode).toBe(404);
    const r = await geriAl(1, 'Tohuma donus');
    expect(r.statusCode).toBe(201);
    const v = govde(r) as PlatformAyarSurumu;
    expect(v.surum).toBe(5);
    expect(v.geri_alinan_surum).toBe(1);
    expect(v.onceki_surum).toBe(4);
    expect(v.degerler).toEqual(TOHUM_DEGERLER);
    expect(await xpKurali('yoklama_geldi')).toBe(20);
    expect(await xpKurali('odak_oturumu')).toBe(1);

    const d = { kurumId: uuidv7(), ogrenciId: uuidv7() };
    await yoklama(d, 0);
    expect(await toplamXp(d.kurumId, d.ogrenciId)).toBe(20);

    // Zaten ayni degerler: degisiklik yok
    const ayni = await geriAl(1);
    expect(ayni.statusCode).toBe(422);
    expect(govde(ayni).error.code).toBe('degisiklik_yok');

    const gecmis = govde(await cagir('GET', `${URL}?limit=50`, await yoneticiTokeni()));
    expect(gecmis.gecmis.map((s: { surum: number }) => s.surum)).toEqual([5, 4, 3, 2, 1]);
    expect(gecmis.gecerli.surum).toBe(5);
    // Eski surumun degerleri degismedi (yalniz ekleme)
    expect(gecmis.gecmis[3]?.degerler.kurallar.yoklama_geldi?.xp).toBe(25);
  });

  it('degisiklik ayni anda iki istekle gelse de surumler sirali ve benzersiz', async () => {
    const t = await yoneticiTokeni();
    const [x, y] = await Promise.all([
      cagir('PUT', URL, t, { neden: 'es zamanli 1', tavanlar: { kayit: 16 } }),
      cagir('PUT', URL, t, { neden: 'es zamanli 2', tavanlar: { soru: 21 } }),
    ]);
    expect([x.statusCode, y.statusCode]).toEqual([200, 200]);
    expect([govde(x).surum, govde(y).surum].sort()).toEqual([6, 7]);
    // Son surum iki degisikligi de icerir (ikincisi birincinin ustune uygulandi)
    const son = govde(await cagir('GET', `${URL}?limit=1`, t));
    expect(son.gecerli.degerler.tavanlar).toMatchObject({ kayit: 16, soru: 21 });
    expect((await geriAl(1)).statusCode).toBe(201);
  });

  it('erisim: uygulama rolu platform_ayar_surumleri tablosunu yazamaz; satir degistirilemez; kiraci verisi yok', async () => {
    for (const s of [
      `insert into motivasyon.platform_ayar_surumleri (id, surum, degerler, neden) values ('${uuidv7()}', 999, '{}', 'x')`,
      `update motivasyon.platform_ayar_surumleri set neden = 'x'`,
      `delete from motivasyon.platform_ayar_surumleri`,
      `update motivasyon.xp_kurallari set xp = 99`,
    ]) {
      expect(await hataMetni(o.app.sql.unsafe(s))).toMatch(/permission denied/);
    }
    const okuma = await o.app.sql`select count(*)::int n from motivasyon.platform_ayar_surumleri`;
    expect(okuma[0]?.n).toBeGreaterThan(0);
    // Sistem rolu ekleyebilir ama degistiremez/silemez; owner bile tetikleyiciye takilir
    await expect(
      o.sistem`update motivasyon.platform_ayar_surumleri set neden = 'x'`,
    ).rejects.toThrow();
    await expect(o.sistem`delete from motivasyon.platform_ayar_surumleri`).rejects.toThrow();
    await expect(o.owner`delete from motivasyon.platform_ayar_surumleri`).rejects.toThrow(
      /defter_degistirilemez/,
    );
    // Global tablo: kiraci kimligi (kurum_id/ogrenci_id) sutunu yok, RLS yok
    const kolonlar = await o.owner<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'motivasyon' and table_name = 'platform_ayar_surumleri'`;
    expect(kolonlar.map((k) => k.column_name)).not.toEqual(expect.arrayContaining(['kurum_id']));
    expect(kolonlar.map((k) => k.column_name)).not.toContain('ogrenci_id');
    // Surum degerleri yalniz kural/tavan sayilari: kisisel veri yok
    const [s] = await o.sistem<{ metin: string }[]>`
      select string_agg(degerler::text || neden, '') as metin from motivasyon.platform_ayar_surumleri`;
    expect(s?.metin).not.toMatch(/@|ogrenci_id|kurum_id/);
  });
});
