import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { kuyrukHataMesaji, hataMesaji } from '../uygulama/hatalar';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const KAYIT = '0190f3a0-0000-7000-8000-000000000060';
const KONU = '0190f3a0-0000-7000-8000-000000000061';
const TEST = '0190f3a0-0000-7000-8000-000000000062';
const KITAP = '0190f3a0-0000-7000-8000-000000000063';
const DOSYA = '0190f3a0-0000-7000-8000-000000000064';
const ISTEK = '0190f3a0-0000-7000-8000-000000000065';
const OGRENCI = '0190f3a0-0000-7000-8000-000000000066';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string) => json({ error: { code, message: 'x' } }, status);

interface Cagri {
  yol: string;
  yontem: string;
  govde: unknown;
}

async function kur(yonlendir: (c: Cagri) => Response | Promise<Response>, rol = 'ogrenci') {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      yol: url.pathname + url.search,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
    };
    if (c.yol === '/v1/hesap/ben') {
      return json({
        kullanici: {
          id: KULLANICI,
          gorunen_ad: 'Ogr',
          telefon_e164: '+905321112233',
          eposta: null,
        },
        uyelikler: [{ uyelik_id: UYELIK, kurum_id: KURUM, kurum_ad: 'K', rol, durum: 'aktif' }],
        onay_gerekli: false,
      });
    }
    if (c.yol === '/auth/token') {
      return json({ access_token: 'kurum-erisim', token_type: 'Bearer', expires_in: 900, rol });
    }
    if (c.yol === '/v1/hesap/modul-ayarlari/etkin-tumu') {
      return json({ moduller: Object.fromEntries(MODUL_KODLARI.map((k) => [k, true])) });
    }
    cagrilar.push(c);
    return yonlendir(c);
  }) as unknown as typeof globalThis.fetch;
  const depo = bellekBelirtecDeposu();
  await depo.yaz({ erisim: 'e', yenileme: 'oturum-1', erisimBitis: Date.now() + 600_000 });
  const adaptorler = gercekAdaptorler({ apiUrl: 'http://api.test', depo, fetch: f });
  await adaptorler.auth.uyelikSec(UYELIK);
  return { g: adaptorler.gunlukSoru, cagrilar };
}

async function hatayiYakala(p: Promise<unknown>): Promise<ApiHata> {
  try {
    await p;
  } catch (e) {
    if (apiHatasiMi(e)) return e;
    throw e;
  }
  throw new Error('hata bekleniyordu');
}

const YOL = `/v1/ogrenme/kurumlar/${KURUM}`;

const apiKayit = (ek: Record<string, unknown> = {}) => ({
  id: KAYIT,
  ogrenci_id: UYELIK,
  gun: '2026-11-26',
  brans_kodu: 'matematik',
  konu_id: KONU,
  konu_ad: 'Üslü Sayılar',
  zorluk: 'orta',
  kaynak_test_id: TEST,
  kaynak_kitap_id: KITAP,
  kaynak_metin: null,
  dogru: 12,
  yanlis: 6,
  bos: 2,
  toplam: 20,
  plan_gorev_id: null,
  dosyalar: [
    { medya_dosya_id: 'b', sira: 1 },
    { medya_dosya_id: DOSYA, sira: 0 },
  ],
  duzenlenebilir: true,
  surum: 1,
  created_at: '2026-11-26T09:00:00.000Z',
  ...ek,
});

const hucre = (cozulen: number, dogru: number) => ({
  cozulen,
  dogru,
  yanlis: cozulen - dogru,
  bos: 0,
  basari: cozulen === 0 ? null : dogru / cozulen,
});

describe('gunluk soru adaptoru: uc eslemesi', () => {
  it('kayitOlustur: istek_id ve giris gunu yollanir; 201 yeni, 200 mevcut kayit', async () => {
    let n = 0;
    const { g, cagrilar } = await kur(() => json(apiKayit(), ++n === 1 ? 201 : 200));
    const girdi = {
      gun: '2026-11-26',
      bransKodu: 'matematik',
      konuId: KONU,
      zorluk: 'orta' as const,
      kaynakTestId: TEST,
      dogru: 12,
      yanlis: 6,
      bos: 2,
      dosyaIdleri: [DOSYA],
      istekId: ISTEK,
    };
    const ilk = await g.kayitOlustur(girdi);
    const tekrar = await g.kayitOlustur(girdi);
    expect(ilk.yeni).toBe(true);
    expect(tekrar.yeni).toBe(false);
    expect(ilk.kayit.dosyalar).toEqual([DOSYA, 'b']); // sira sirasiyla
    expect(ilk.kayit.konuAd).toBe('Üslü Sayılar');
    expect(cagrilar[0]).toMatchObject({ yontem: 'POST', yol: `${YOL}/gunluk-soru/kayitlar` });
    expect(cagrilar[0]?.govde).toEqual({
      gun: '2026-11-26',
      brans_kodu: 'matematik',
      konu_id: KONU,
      zorluk: 'orta',
      kaynak_test_id: TEST,
      dogru: 12,
      yanlis: 6,
      bos: 2,
      dosya_idleri: [DOSYA],
      istek_id: ISTEK,
    });
    // Her denemede ayni istek_id gider (kuyruk tekrar denemesi yeni kayit acmaz).
    expect((cagrilar[1]?.govde as { istek_id: string }).istek_id).toBe(ISTEK);
  });

  it('hata esleme: 422 ve 409 kodlari ayrinti olarak korunur ve Turkce mesaja cevrilir', async () => {
    const kodlar: [number, string, string, string][] = [
      [422, 'gun_gecersiz', 'dogrulama', 'Gün bugünden en çok 6 gün öncesine'],
      [422, 'konu_gecersiz', 'dogrulama', 'Konu bulunamadı'],
      [422, 'soru_toplami_gecersiz', 'dogrulama', 'Toplam soru sayısı'],
      [409, 'dosya_hazir_degil', 'cakisma', 'Fotoğraf henüz hazır değil'],
      [409, 'dosya_zaten_bagli', 'cakisma', 'Fotoğraf zaten başka'],
      [409, 'kayit_duzenlenemez', 'cakisma', 'yalnızca girildiği gün'],
      [409, 'surum_cakismasi', 'cakisma', ''],
    ];
    for (const [durum, kod, ad, mesaj] of kodlar) {
      const { g } = await kur(() => hata(durum, kod));
      const e = await hatayiYakala(
        g.kayitOlustur({
          bransKodu: 'matematik',
          konuId: KONU,
          zorluk: 'kolay',
          dogru: 1,
          yanlis: 0,
          bos: 0,
          dosyaIdleri: [],
          istekId: ISTEK,
        }),
      );
      expect([e.kod, e.ayrinti, e.durum]).toEqual([ad, kod, durum]);
      expect(hataMesaji(e)).toContain(mesaj);
      expect(kuyrukHataMesaji(kod)).toContain(mesaj);
    }
  });

  it('kayitDuzelt yalniz verilen alanlari ve surumu yollar; kayitSil 204 ile biter', async () => {
    const { g, cagrilar } = await kur((c) =>
      c.yontem === 'DELETE' ? new Response(null, { status: 204 }) : json(apiKayit({ surum: 2 })),
    );
    const k = await g.kayitDuzelt(KAYIT, { dogru: 14, yanlis: 4, surum: 1 });
    expect(k.surum).toBe(2);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'PATCH',
      yol: `${YOL}/gunluk-soru/kayitlar/${KAYIT}`,
    });
    expect(cagrilar[0]?.govde).toEqual({ dogru: 14, yanlis: 4, surum: 1 });
    await g.kayitSil(KAYIT);
    expect(cagrilar[1]).toMatchObject({
      yontem: 'DELETE',
      yol: `${YOL}/gunluk-soru/kayitlar/${KAYIT}`,
    });
  });

  it('kayitSil: eski kayit 409 kayit_duzenlenemez', async () => {
    const { g } = await kur(() => hata(409, 'kayit_duzenlenemez'));
    const e = await hatayiYakala(g.kayitSil(KAYIT));
    expect(e.ayrinti).toBe('kayit_duzenlenemez');
  });

  it('kayitlarim ve son-kullanilanlar camelCase esleme', async () => {
    const { g, cagrilar } = await kur((c) =>
      c.yol.includes('son-kullanilanlar')
        ? json({
            dersler: [
              {
                brans_kodu: 'matematik',
                son_kullanildi_at: '2026-11-26T09:00:00.000Z',
                konular: [{ konu_id: KONU, konu_ad: 'Üslü Sayılar', son_zorluk: 'orta' }],
                kaynaklar: [
                  {
                    kaynak_test_id: TEST,
                    kaynak_kitap_id: KITAP,
                    kitap_ad: 'Esen',
                    test_ad: 'Test 1',
                    kaynak_metin: null,
                  },
                ],
              },
            ],
          })
        : json({ kayitlar: [apiKayit()], sonraki_imlec: 'sonraki' }),
    );
    const s = await g.kayitlarim({ gun: '2026-11-26' }, 'imlec-1');
    expect(s.sonrakiImlec).toBe('sonraki');
    expect(cagrilar[0]?.yol).toContain('gun=2026-11-26');
    expect(cagrilar[0]?.yol).toContain('imlec=imlec-1');
    const son = await g.sonKullanilanlar();
    expect(son.dersler[0]?.konular[0]).toEqual({
      konuId: KONU,
      konuAd: 'Üslü Sayılar',
      sonZorluk: 'orta',
    });
    expect(son.dersler[0]?.kaynaklar[0]?.kitapAd).toBe('Esen');
  });

  const apiAnaliz = (oneriler?: unknown[]) => ({
    ogrenci_id: UYELIK,
    brans_kodu: 'matematik',
    bas: '2026-10-28',
    bit: '2026-11-26',
    konular: [
      {
        konu_id: KONU,
        konu_ad: 'Üslü Sayılar',
        ust_konu_ad: 'Sayılar',
        hucreler: {
          kolay: hucre(20, 18),
          orta: hucre(20, 12),
          zor: hucre(20, 5),
          belirtilmemis: hucre(0, 0),
        },
        toplam: hucre(60, 35),
        bant: {
          durum: 'zorlaniyor',
          bant: 'orta',
          bant_basarilari: { kolay: 0.9, orta: 0.6, zor: 0.25 },
        },
      },
    ],
    toplam: hucre(60, 35),
    ...(oneriler ? { oneriler } : {}),
  });

  it('ogrenci analizi: ogrenci yolu, oneri alani yok (uydurulmaz)', async () => {
    const { g, cagrilar } = await kur(() => json(apiAnaliz()));
    const a = await g.analiz({ bransKodu: 'matematik', donem: '30' });
    expect(cagrilar[0]?.yol).toContain(`${YOL}/gunluk-soru/analiz?`);
    expect(cagrilar[0]?.yol).toContain('brans_kodu=matematik');
    expect(cagrilar[0]?.yol).toContain('donem=30');
    expect('oneriler' in a).toBe(false);
    expect(a.konular[0]?.hucreler.orta.basari).toBe(0.6);
    expect(a.konular[0]?.bant).toEqual({
      durum: 'zorlaniyor',
      bant: 'orta',
      bantBasarilari: { kolay: 0.9, orta: 0.6, zor: 0.25 },
    });
  });

  it('personel analizi: ogrenci yolu ve oneriler (gorev oner, birebir ders)', async () => {
    const { g, cagrilar } = await kur(
      () =>
        json(
          apiAnaliz([
            {
              tur: 'gorev_oner',
              brans_kodu: 'matematik',
              konu_id: KONU,
              konu_ad: 'Üslü Sayılar',
              zorluk: 'orta',
              soru_sayisi: 20,
              basari: 0.6,
            },
            {
              tur: 'birebir_ders',
              brans_kodu: 'matematik',
              konu_id: KONU,
              konu_ad: 'Üslü Sayılar',
              zor_basari: 0.2,
              onceki_hafta_basari: 0.2,
              son_hafta_basari: 0.2,
            },
          ]),
        ),
      'ogretmen',
    );
    const a = await g.analiz({ bransKodu: 'matematik', donem: '7' }, OGRENCI);
    expect(cagrilar[0]?.yol).toContain(`${YOL}/ogrenciler/${OGRENCI}/gunluk-soru/analiz?`);
    expect(a.oneriler).toEqual([
      {
        tur: 'gorev_oner',
        bransKodu: 'matematik',
        konuId: KONU,
        konuAd: 'Üslü Sayılar',
        zorluk: 'orta',
        soruSayisi: 20,
        basari: 0.6,
      },
      {
        tur: 'birebir_ders',
        bransKodu: 'matematik',
        konuId: KONU,
        konuAd: 'Üslü Sayılar',
        zorBasari: 0.2,
        oncekiHaftaBasari: 0.2,
        sonHaftaBasari: 0.2,
      },
    ]);
  });

  it('hucre ayrintisi: fotograf adresi orta boyut oncelikli; adres alinamadi bayragi', async () => {
    const { g, cagrilar } = await kur(
      () =>
        json({
          ogrenci_id: OGRENCI,
          konu_id: KONU,
          kayitlar: [
            {
              kaynak: 'gunluk',
              id: KAYIT,
              gun: '2026-11-25',
              zorluk: 'zor',
              kaynak_adi: 'Esen · Test 1',
              dogru: 3,
              yanlis: 6,
              bos: 1,
              toplam: 10,
              dosyalar: [
                {
                  medya_dosya_id: DOSYA,
                  adres: { asil_url: 'https://depo/asil', orta_url: 'https://depo/orta' },
                },
                { medya_dosya_id: 'b', adres: null },
              ],
            },
          ],
          fotograf_adresleri_alinamadi: true,
        }),
      'ogretmen',
    );
    const h = await g.hucre(
      { bransKodu: 'matematik', donem: '30', konuId: KONU, zorluk: 'zor' },
      OGRENCI,
    );
    expect(cagrilar[0]?.yol).toContain(`/ogrenciler/${OGRENCI}/gunluk-soru/analiz/hucre?`);
    expect(cagrilar[0]?.yol).toContain('zorluk=zor');
    expect(h.fotografAdresleriAlinamadi).toBe(true);
    expect(h.kayitlar[0]?.dosyalar).toEqual([
      { medyaDosyaId: DOSYA, adres: 'https://depo/orta' },
      { medyaDosyaId: 'b', adres: null },
    ]);
  });

  it('gorevVer: plan gorevi ve odev yanitlari', async () => {
    const { g, cagrilar } = await kur(
      (c) =>
        json(
          (c.govde as { tur: string }).tur === 'odev'
            ? { tur: 'odev', odev_id: KAYIT, son_teslim_at: '2026-11-29T09:00:00.000Z' }
            : {
                tur: 'plan_gorevi',
                plan_id: KITAP,
                gorev_id: TEST,
                hafta_baslangic: '2026-11-23',
                gun: '2026-11-27',
                plan_durum: 'taslak',
              },
          201,
        ),
      'ogretmen',
    );
    const girdi = {
      bransKodu: 'matematik',
      konuId: KONU,
      zorluk: 'orta' as const,
      soruSayisi: 20,
    };
    const p = await g.gorevVer(OGRENCI, { tur: 'plan_gorevi', ...girdi });
    expect(p).toEqual({
      tur: 'plan_gorevi',
      planId: KITAP,
      gorevId: TEST,
      haftaBaslangic: '2026-11-23',
      gun: '2026-11-27',
      planDurum: 'taslak',
    });
    const o = await g.gorevVer(OGRENCI, { tur: 'odev', ...girdi });
    expect(o).toEqual({ tur: 'odev', odevId: KAYIT, sonTeslim: '2026-11-29T09:00:00.000Z' });
    expect(cagrilar[0]).toMatchObject({
      yontem: 'POST',
      yol: `${YOL}/ogrenciler/${OGRENCI}/gunluk-soru/gorev-ver`,
    });
    expect(cagrilar[0]?.govde).toEqual({
      tur: 'plan_gorevi',
      brans_kodu: 'matematik',
      konu_id: KONU,
      zorluk: 'orta',
      soru_sayisi: 20,
    });
  });

  it('kaynak kitaplar: ilerleme ve testler', async () => {
    const kitap = {
      id: KITAP,
      ad: 'Esen Soru Bankası',
      yayinevi: 'Esen',
      brans_kodu: 'matematik',
      aktif: true,
      test_sayisi: 2,
      toplam_soru: 40,
      ilerleme: { cozulen_test: 1, toplam_test: 2 },
    };
    const { g, cagrilar } = await kur((c) =>
      c.yol.includes(`/kaynak-kitaplar/${KITAP}`)
        ? json({
            ...kitap,
            testler: [
              {
                id: TEST,
                kitap_id: KITAP,
                sira: 1,
                ad: 'Test 1',
                soru_sayisi: 20,
                konu_id: null,
                cozuldu_gun: '2026-11-20',
              },
              { id: 'b', kitap_id: KITAP, sira: 2, ad: 'Test 2', soru_sayisi: 20, konu_id: null },
            ],
          })
        : json({ kitaplar: [kitap] }),
    );
    const liste = await g.kaynakKitaplar({ bransKodu: 'matematik' });
    expect(liste[0]?.ilerleme).toEqual({ cozulenTest: 1, toplamTest: 2 });
    const d = await g.kaynakKitap(KITAP);
    expect(d.testler.map((t) => t.cozulduGun)).toEqual(['2026-11-20', null]);
    expect(cagrilar[0]?.yol).toContain('brans_kodu=matematik');
  });
});
