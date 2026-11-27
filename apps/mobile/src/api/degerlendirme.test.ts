/**
 * Degerlendirme, kaynak onerisi ve kocluk adaptorleri: gercek adaptor (sahte `fetch` ile istek yolu,
 * govde ve donusum) ve mock adaptor (senaryo, dogrulama, ogrenci gizliligi).
 */
import { MODUL_KODLARI } from '@kopru/contracts';
import { t } from '@kopru/i18n';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { OGRENCI, OGRETMEN, ortamKur, temizle, type Ortam } from '../ekranlar/testYardimcisi';
import { bugunTarihi } from '../lib/saat';
import { hataMesaji } from '../uygulama/hatalar';
import { gercekAdaptorler } from './gercek';
import { MOCK_GIZLI_YORUM, MOCK_GORUNUR_YORUM } from './mockDegerlendirme';
import { MOCK_SAAT_DILIMI } from './mockOperasyon';
import { apiHatasiMi, ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const OGRENCI_ID = '0190f3a0-0000-7000-8000-000000000066';
const DEGERLENDIRME = '0190f3a0-0000-7000-8000-000000000070';
const ONERI = '0190f3a0-0000-7000-8000-000000000071';
const KITAP = '0190f3a0-0000-7000-8000-000000000072';
const TEST = '0190f3a0-0000-7000-8000-000000000073';
const YAZAR = '0190f3a0-0000-7000-8000-000000000074';
const YOL = `/v1/ogrenme/kurumlar/${KURUM}`;

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string) => json({ error: { code, message: 'x' } }, status);

interface Cagri {
  yol: string;
  yontem: string;
  govde: unknown;
}

async function kur(yonlendir: (c: Cagri) => Response | Promise<Response>, rol = 'ogretmen') {
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
          gorunen_ad: 'Hoca',
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
  return { d: adaptorler.degerlendirme, cagrilar };
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

const apiDegerlendirme = (ek: Record<string, unknown> = {}) => ({
  id: DEGERLENDIRME,
  ogrenci_id: OGRENCI_ID,
  yazar_id: YAZAR,
  yazar_ad: 'Ayse Hoca',
  benim: true,
  brans_kodu: 'matematik',
  donem_baslangic: '2026-11-23',
  donem_bitis: '2026-11-29',
  calisma_duzeni: 4,
  derse_katilim: null,
  odev_disiplini: 3,
  anlama_duzeyi: null,
  yorum: 'Iyi gidiyor',
  ogrenci_gorur: false,
  duzenlenebilir: true,
  duzenleme_son_at: '2026-12-03T10:00:00.000Z',
  geri_cekildi_at: null,
  surum: 2,
  created_at: '2026-11-26T10:00:00.000Z',
  ...ek,
});

const apiOneri = (ek: Record<string, unknown> = {}) => ({
  id: ONERI,
  ogrenci_id: OGRENCI_ID,
  oneren_id: YAZAR,
  oneren_ad: 'Ayse Hoca',
  benim: true,
  tur: 'kaynak_kitap_testi',
  kaynak_kitap_id: KITAP,
  kaynak_kitap_ad: 'Esen Soru Bankasi',
  kaynak_test_id: TEST,
  kaynak_test_ad: 'Test 3',
  baglanti_url: null,
  baslik: null,
  brans_kodu: 'matematik',
  konu_id: null,
  konu_ad: null,
  not: 'Once ilk 10',
  basladi: false,
  ilk_kullanim_gun: null,
  son_kullanim_gun: null,
  kayit_sayisi: 0,
  geri_cekildi_at: null,
  created_at: '2026-11-26T10:00:00.000Z',
  ...ek,
});

const bosHucre = { basari: null, bos: 0, cozulen: 0, dogru: 0, yanlis: 0 };

const apiKocluk = () => ({
  ogrenci_id: OGRENCI_ID,
  ogrenci_ad: 'Deniz Yilmaz',
  degerlendirmeler: { degerlendirmeler: [apiDegerlendirme()], sonraki_imlec: 'sonraki' },
  olcek_ortalamalari: {
    haftalar: [
      {
        hafta_baslangic: '2026-11-23',
        sayi: 1,
        calisma_duzeni: 4,
        derse_katilim: null,
        odev_disiplini: 3,
        anlama_duzeyi: null,
      },
    ],
    toplam: {
      sayi: 1,
      calisma_duzeni: 4,
      derse_katilim: null,
      odev_disiplini: 3,
      anlama_duzeyi: null,
    },
  },
  kullanilan_kaynaklar: {
    kitaplar: [
      {
        kaynak_kitap_id: KITAP,
        ad: 'Esen Soru Bankasi',
        brans_kodu: 'matematik',
        cozulen_test: 2,
        toplam_test: 4,
        cozulen_soru: 40,
        kayit_sayisi: 2,
        son_kullanim_gun: '2026-11-24',
      },
    ],
    serbest: [{ ad: 'Okul fasikulu', kayit_sayisi: 1, son_kullanim_gun: '2026-11-20' }],
    odevler: [],
  },
  oneriler: [apiOneri()],
  konu_analizi: {
    bas: '2026-10-28',
    bit: '2026-11-26',
    toplam: { basari: 0.6, cozulen: 50 },
    bransler: [
      {
        brans_kodu: 'matematik',
        oneriler: [
          {
            tur: 'gorev_oner',
            brans_kodu: 'matematik',
            konu_id: 'k1',
            konu_ad: 'Uslu sayilar',
            zorluk: 'orta',
            soru_sayisi: 20,
            basari: 0.4,
          },
        ],
        toplam: bosHucre,
        zayif_konular: [
          {
            konu_id: 'k1',
            konu_ad: 'Uslu sayilar',
            ust_konu_ad: null,
            toplam: { basari: 0.4, bos: 0, cozulen: 20, dogru: 8, yanlis: 12 },
            hucreler: {},
            bant: {},
          },
          {
            konu_id: 'k2',
            konu_ad: 'Denklemler',
            ust_konu_ad: null,
            toplam: { basari: 0.2, bos: 0, cozulen: 10, dogru: 2, yanlis: 8 },
            hucreler: {},
            bant: {},
          },
        ],
      },
    ],
  },
  plan_odev: {
    odev: { acik: 2, geciken: 1, inceleme_bekleyen: 1, teslim_edildi: 3 },
    plan: {
      durum: 'yayinda',
      hafta_baslangic: '2026-11-23',
      gorev_sayisi: 5,
      tamam_sayisi: 2,
      plan_id: 'p1',
      soru: { gerceklesen: 40, planlanan: 100 },
      dakika: { gerceklesen: 60, planlanan: 200 },
    },
  },
});

afterEach(() => {
  temizle();
});

describe('gercek adaptor: koclugun tek istegi', () => {
  it('/kocluk tek istek; zayif konular basari artan sirada, oneriler duzlesir', async () => {
    const { d, cagrilar } = await kur(() => json(apiKocluk()));
    const k = await d.kocluk(OGRENCI_ID);
    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'GET',
      yol: `${YOL}/ogrenciler/${OGRENCI_ID}/kocluk`,
    });
    expect(k.degerlendirmeler.sonrakiImlec).toBe('sonraki');
    expect(k.degerlendirmeler.degerlendirmeler[0]).toMatchObject({
      benim: true,
      ogrenciGorur: false,
      olcekler: { calisma_duzeni: 4, derse_katilim: null },
    });
    expect(k.konuOzeti.zayifKonular.map((z) => z.konuAd)).toEqual(['Denklemler', 'Uslu sayilar']);
    expect(k.konuOzeti.oneriler).toHaveLength(1);
    expect(k.kullanilanKaynaklar.kitaplar[0]).toMatchObject({ cozulenTest: 2, toplamTest: 4 });
    expect(k.oneriler[0]).toMatchObject({ basladi: false, kaynakTestAd: 'Test 3' });
    expect(k.plan).toMatchObject({ gorevSayisi: 5, tamamSayisi: 2 });
    expect(k.odev).toEqual({ acik: 2, geciken: 1, teslimEdildi: 3, incelemeBekleyen: 1 });
  });
});

describe('gercek adaptor: degerlendirme yazma, duzenleme, geri cekme', () => {
  it('yaz: dolu olcekler ve ogrenci_gorur govdeye girer; bos olcek ve bos yorum yollanmaz', async () => {
    const { d, cagrilar } = await kur(() => json(apiDegerlendirme(), 201));
    await d.degerlendirmeYaz(OGRENCI_ID, {
      donemBaslangic: '2026-11-23',
      donemBitis: '2026-11-29',
      olcekler: { calisma_duzeni: 4, odev_disiplini: 3, derse_katilim: null },
      yorum: '  ',
      ogrenciGorur: false,
    });
    expect(cagrilar[0]).toMatchObject({
      yontem: 'POST',
      yol: `${YOL}/ogrenciler/${OGRENCI_ID}/degerlendirmeler`,
      govde: {
        donem_baslangic: '2026-11-23',
        donem_bitis: '2026-11-29',
        calisma_duzeni: 4,
        odev_disiplini: 3,
        ogrenci_gorur: false,
      },
    });
    const govde = cagrilar[0]?.govde as Record<string, unknown>;
    expect(govde).not.toHaveProperty('derse_katilim');
    expect(govde).not.toHaveProperty('yorum');
  });

  it('duzenle: PATCH, surum ve temizlenen olcek null', async () => {
    const { d, cagrilar } = await kur(() => json(apiDegerlendirme({ surum: 3 })));
    const sonuc = await d.degerlendirmeDuzenle(DEGERLENDIRME, {
      olcekler: { calisma_duzeni: null, anlama_duzeyi: 5 },
      yorum: '',
      ogrenciGorur: true,
      surum: 2,
    });
    expect(sonuc.surum).toBe(3);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'PATCH',
      yol: `${YOL}/degerlendirmeler/${DEGERLENDIRME}`,
      govde: { calisma_duzeni: null, anlama_duzeyi: 5, yorum: null, ogrenci_gorur: true, surum: 2 },
    });
  });

  it('geri cek: POST govdesi bos nesne', async () => {
    const { d, cagrilar } = await kur(() =>
      json(apiDegerlendirme({ geri_cekildi_at: '2026-11-26T12:00:00.000Z' })),
    );
    const sonuc = await d.degerlendirmeGeriCek(DEGERLENDIRME);
    expect(sonuc.geriCekildi).toBe(true);
    expect(cagrilar[0]).toMatchObject({
      yontem: 'POST',
      yol: `${YOL}/degerlendirmeler/${DEGERLENDIRME}/geri-cek`,
      govde: {},
    });
  });

  it('409 hata kodlari anlasilir Turkce mesaja cevrilir', async () => {
    const { d } = await kur((c) => {
      if (c.yol.endsWith('/geri-cek')) return hata(409, 'degerlendirme_geri_cekildi');
      return hata(409, 'degerlendirme_duzenlenemez');
    });
    const e1 = await hatayiYakala(d.degerlendirmeDuzenle(DEGERLENDIRME, { surum: 1 }));
    expect(e1).toMatchObject({ kod: 'cakisma', ayrinti: 'degerlendirme_duzenlenemez' });
    expect(hataMesaji(e1)).toBe(t('degerlendirme.hata.degerlendirme_duzenlenemez'));
    expect(hataMesaji(e1)).toContain('7 gün');
    const e2 = await hatayiYakala(d.degerlendirmeGeriCek(DEGERLENDIRME));
    expect(hataMesaji(e2)).toBe(t('degerlendirme.hata.degerlendirme_geri_cekildi'));
  });

  it('surum cakismasi, gecersiz donem ve kaynak mesajlari', () => {
    const cakisma = new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'surum_cakismasi' });
    expect(hataMesaji(cakisma)).toBe(t('mobil.hata.surumCakismasi'));
    const donem = new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'donem_gecersiz' });
    expect(hataMesaji(donem)).toBe(t('degerlendirme.hata.donem_gecersiz'));
    const kaynak = new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'kaynak_gecersiz' });
    expect(hataMesaji(kaynak)).toBe(t('degerlendirme.hata.kaynak_gecersiz'));
  });
});

describe('gercek adaptor: kaynak onerisi ve hatirlatma', () => {
  it('oner: her tur kendi alanlarini yollar', async () => {
    const { d, cagrilar } = await kur(() => json(apiOneri(), 201));
    await d.kaynakOner(OGRENCI_ID, { tur: 'kaynak_kitap', kitapId: KITAP, notMetni: 'Not' });
    await d.kaynakOner(OGRENCI_ID, { tur: 'kaynak_kitap_testi', testId: TEST, konuId: 'k1' });
    await d.kaynakOner(OGRENCI_ID, {
      tur: 'link',
      baglantiUrl: 'https://example.com/x',
      baslik: 'Konu anlatimi',
      bransKodu: 'matematik',
    });
    await d.kaynakOner(OGRENCI_ID, { tur: 'serbest', baslik: 'Okul fasikulu' });
    expect(cagrilar.map((c) => c.govde)).toEqual([
      { tur: 'kaynak_kitap', kaynak_kitap_id: KITAP, not: 'Not' },
      { tur: 'kaynak_kitap_testi', kaynak_test_id: TEST, konu_id: 'k1' },
      {
        tur: 'link',
        baglanti_url: 'https://example.com/x',
        baslik: 'Konu anlatimi',
        brans_kodu: 'matematik',
      },
      { tur: 'serbest', baslik: 'Okul fasikulu' },
    ]);
    expect(cagrilar[0]?.yol).toBe(`${YOL}/ogrenciler/${OGRENCI_ID}/kaynak-onerileri`);
  });

  it('hatirlatma ve ogrencinin onerileri (link icin basladi null)', async () => {
    const { d } = await kur((c) =>
      c.yol.endsWith('/degerlendirme-hatirlatma')
        ? json({
            eksik_sayisi: 1,
            hafta_baslangic: '2026-11-23',
            ogrenci_sayisi: 3,
            ogrenciler: [
              { ogrenci_ad: 'Elif', ogrenci_id: OGRENCI_ID, son_degerlendirme_gun: null },
            ],
          })
        : json({
            oneriler: [apiOneri({ tur: 'link', baslik: 'Bag', basladi: null, benim: false })],
          }),
    );
    const h = await d.hatirlatma();
    expect(h).toMatchObject({ eksikSayisi: 1, ogrenciSayisi: 3 });
    expect(h.ogrenciler[0]).toEqual({
      ogrenciId: OGRENCI_ID,
      ogrenciAd: 'Elif',
      sonDegerlendirmeGun: null,
    });
    const o = await d.kaynakOnerilerim();
    expect(o[0]).toMatchObject({ tur: 'link', basladi: null });
  });
});

describe('gercek adaptor: ogrenci yalniz gorunur, sadeleştirilmis degerlendirmeyi alir', () => {
  it('ogrenci donusumu gorunurluk, yazar kimligi ve surum alanlarini tasimaz (sunucu hatasi olsa bile)', async () => {
    const { d, cagrilar } = await kur(
      () =>
        json({
          degerlendirmeler: [
            // Sunucu sozlesmesi bu alanlari vermez; yanlislikla gelirse bile adaptor atar.
            apiDegerlendirme({ ogrenci_gorur: false, yazar_id: YAZAR, surum: 9, benim: true }),
          ],
          sonraki_imlec: null,
        }),
      'ogrenci',
    );
    const s = await d.degerlendirmelerim();
    expect(cagrilar[0]?.yol).toBe(`${YOL}/degerlendirmelerim`);
    const kayit = s.degerlendirmeler[0];
    expect(kayit).toBeDefined();
    expect(Object.keys(kayit ?? {}).sort()).toEqual(
      [
        'bransKodu',
        'donemBaslangic',
        'donemBitis',
        'id',
        'olcekler',
        'olusturma',
        'yazarAd',
        'yorum',
      ].sort(),
    );
  });
});

// --- Mock adaptor ----------------------------------------------------------------------------

const DENIZ = 'uyelik-ogrenci-a';
const bugun = () => bugunTarihi(MOCK_SAAT_DILIMI);

async function ogretmenOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRETMEN);
  return o;
}
async function ogrenciOrtami(): Promise<Ortam> {
  const o = ortamKur();
  await o.giris(...OGRENCI);
  return o;
}

describe('mock: iki ogretmen, biri gorunur senaryosu', () => {
  it('ogretmen iki ogretmenin kayitlarini da gorur (gizli dahil), gorunurluk isaretli', async () => {
    const o = await ogretmenOrtami();
    const k = await o.adaptorler.degerlendirme.kocluk(DENIZ);
    const liste = k.degerlendirmeler.degerlendirmeler;
    expect(liste).toHaveLength(3);
    const gizli = liste.find((x) => x.yorum === MOCK_GIZLI_YORUM);
    const gorunur = liste.find((x) => x.yorum === MOCK_GORUNUR_YORUM);
    expect(gizli).toMatchObject({ ogrenciGorur: false, benim: false, yazarAd: 'Mehmet Demir' });
    expect(gorunur).toMatchObject({ ogrenciGorur: true, benim: true, duzenlenebilir: true });
    // En yeni once.
    const ms = liste.map((x) => Date.parse(x.olusturma));
    expect(ms).toEqual([...ms].sort((a, b) => b - a));
    expect(k.olcekHaftalari).toHaveLength(4);
  });

  it('ogrenci yalniz gorunur degerlendirmeyi alir; gizli yorum ve ad hicbir yerden gelmez', async () => {
    const o = await ogrenciOrtami();
    const s = await o.adaptorler.degerlendirme.degerlendirmelerim();
    expect(s.degerlendirmeler).toHaveLength(1);
    expect(s.degerlendirmeler[0]?.yorum).toBe(MOCK_GORUNUR_YORUM);
    const hepsi = JSON.stringify([s, await o.adaptorler.degerlendirme.kaynakOnerilerim()]);
    expect(hepsi).not.toContain('GIZLI');
    expect(hepsi).not.toContain('ogrenciGorur');
    expect(hepsi).not.toContain('yazarId');
  });

  it('ogrenci personel uclarini kullanamaz (403)', async () => {
    const o = await ogrenciOrtami();
    const d = o.adaptorler.degerlendirme;
    for (const cagri of [
      () => d.kocluk(DENIZ),
      () => d.degerlendirmeler(DENIZ),
      () => d.hatirlatma(),
      () =>
        d.degerlendirmeYaz(DENIZ, {
          donemBaslangic: '2026-01-01',
          olcekler: {},
          ogrenciGorur: true,
        }),
      () => d.kaynakOner(DENIZ, { tur: 'serbest', baslik: 'x' }),
    ]) {
      const e = await hatayiYakala(cagri());
      expect(e.kod).toBe('izin_yok');
    }
  });

  it('gizli degerlendirme gorunur yapilinca ogrenciye gelir; geri cekilince gider', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const yeni = await d.degerlendirmeYaz(DENIZ, {
      donemBaslangic: bugun(),
      olcekler: { anlama_duzeyi: 4 },
      yorum: 'Yeni yorum',
      ogrenciGorur: false,
    });
    expect(yeni).toMatchObject({ ogrenciGorur: false, benim: true, surum: 1 });
    await o.giris(...OGRENCI);
    expect((await d.degerlendirmelerim()).degerlendirmeler).toHaveLength(1);
    await o.giris(...OGRETMEN);
    const acik = await d.degerlendirmeDuzenle(yeni.id, { ogrenciGorur: true, surum: yeni.surum });
    expect(acik).toMatchObject({ ogrenciGorur: true, surum: 2 });
    await o.giris(...OGRENCI);
    expect((await d.degerlendirmelerim()).degerlendirmeler.map((x) => x.yorum)).toContain(
      'Yeni yorum',
    );
    await o.giris(...OGRETMEN);
    await d.degerlendirmeGeriCek(yeni.id);
    await o.giris(...OGRENCI);
    expect((await d.degerlendirmelerim()).degerlendirmeler.map((x) => x.yorum)).not.toContain(
      'Yeni yorum',
    );
  });
});

describe('mock: dogrulama ve 409 kurallari', () => {
  it('bos icerik, gelecekteki donem ve 31 gunu asan donem reddedilir', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const bos = await hatayiYakala(
      d.degerlendirmeYaz(DENIZ, { donemBaslangic: bugun(), olcekler: {}, ogrenciGorur: false }),
    );
    expect(bos).toMatchObject({ kod: 'dogrulama', durum: 422 });
    const gelecek = await hatayiYakala(
      d.degerlendirmeYaz(DENIZ, {
        donemBaslangic: '2099-01-01',
        olcekler: { calisma_duzeni: 3 },
        ogrenciGorur: false,
      }),
    );
    expect(gelecek.ayrinti).toBe('donem_gecersiz');
    const uzun = await hatayiYakala(
      d.degerlendirmeYaz(DENIZ, {
        donemBaslangic: '2026-01-01',
        donemBitis: '2026-03-01',
        olcekler: { calisma_duzeni: 3 },
        ogrenciGorur: false,
      }),
    );
    expect(uzun.ayrinti).toBe('donem_gecersiz');
  });

  it('7 gunu gecen duzenlenemez (409), baskasinin kaydi 403, eski surum 409', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const k = await d.kocluk(DENIZ);
    const liste = k.degerlendirmeler.degerlendirmeler;
    const eski = liste.find((x) => x.benim && !x.duzenlenebilir);
    const baskasi = liste.find((x) => !x.benim);
    const guncel = liste.find((x) => x.benim && x.duzenlenebilir);
    expect(eski && baskasi && guncel).toBeTruthy();
    const e1 = await hatayiYakala(d.degerlendirmeDuzenle(eski?.id ?? '', { yorum: 'x', surum: 1 }));
    expect(e1).toMatchObject({ kod: 'cakisma', durum: 409, ayrinti: 'degerlendirme_duzenlenemez' });
    expect(hataMesaji(e1)).toContain('7 gün');
    const e2 = await hatayiYakala(
      d.degerlendirmeDuzenle(baskasi?.id ?? '', { yorum: 'x', surum: 1 }),
    );
    expect(e2.kod).toBe('izin_yok');
    const e3 = await hatayiYakala(
      d.degerlendirmeDuzenle(guncel?.id ?? '', { yorum: 'x', surum: 99 }),
    );
    expect(e3.ayrinti).toBe('surum_cakismasi');
    expect(hataMesaji(e3)).toBe(t('mobil.hata.surumCakismasi'));
  });

  it('geri cekilmis kayit duzenlenemez (409)', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const yeni = await d.degerlendirmeYaz(DENIZ, {
      donemBaslangic: bugun(),
      olcekler: { calisma_duzeni: 2 },
      ogrenciGorur: false,
    });
    await d.degerlendirmeGeriCek(yeni.id);
    const e = await hatayiYakala(d.degerlendirmeDuzenle(yeni.id, { yorum: 'x', surum: 1 }));
    expect(e.ayrinti).toBe('degerlendirme_geri_cekildi');
    expect(hataMesaji(e)).toBe(t('degerlendirme.hata.degerlendirme_geri_cekildi'));
  });
});

describe('mock: kaynak onerisi ve "basladi"', () => {
  it('oneri sonrasi gunluk kayitta o test kullanilinca basladi true olur (link olculemez)', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const once = (await d.kocluk(DENIZ)).oneriler;
    const test3 = once.find((x) => x.kaynakTestId === 'kitap-esen-t3');
    expect(test3).toMatchObject({ basladi: false, benim: false });
    expect(once.find((x) => x.tur === 'link')?.basladi).toBeNull();
    // Kitap onerisi: oneriden SONRA kullanim var (seed t1/t2) -> basladi.
    expect(once.find((x) => x.tur === 'kaynak_kitap')).toMatchObject({
      basladi: true,
      kayitSayisi: 2,
    });

    await o.giris(...OGRENCI);
    await o.adaptorler.gunlukSoru.kayitOlustur({
      bransKodu: 'matematik',
      konuId: 'konu-m-koklu',
      zorluk: 'orta',
      kaynakTestId: 'kitap-esen-t3',
      dogru: 5,
      yanlis: 3,
      bos: 0,
      dosyaIdleri: [],
      istekId: 'istek-1',
    });
    await o.giris(...OGRETMEN);
    const sonra = (await d.kocluk(DENIZ)).oneriler.find((x) => x.kaynakTestId === 'kitap-esen-t3');
    expect(sonra).toMatchObject({ basladi: true, kayitSayisi: 1 });
  });

  it('oner: kitap, test, link ve serbest; gecersiz kaynak 422; geri cekilen listeden kalkar', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const kitap = await d.kaynakOner(DENIZ, { tur: 'kaynak_kitap', kitapId: 'kitap-fen' });
    expect(kitap).toMatchObject({ kaynakKitapAd: 'Fen Bilimleri Testleri', benim: true });
    const test = await d.kaynakOner(DENIZ, {
      tur: 'kaynak_kitap_testi',
      testId: 'kitap-fen-t2',
      konuId: 'konu-f-ses',
    });
    expect(test).toMatchObject({
      kaynakTestAd: 'Test 2: Sesin özellikleri',
      bransKodu: 'fen_bilimleri',
    });
    const link = await d.kaynakOner(DENIZ, {
      tur: 'link',
      baglantiUrl: 'https://example.com/a',
      baslik: 'Anlatim',
    });
    expect(link.basladi).toBeNull();
    const serbest = await d.kaynakOner(DENIZ, { tur: 'serbest', baslik: 'Okul fasikülü' });
    // "Okul fasikulu" seed kullanimi bu onerinin ONCESINDE: basladi false.
    expect(serbest.basladi).toBe(false);
    const gecersiz = await hatayiYakala(
      d.kaynakOner(DENIZ, { tur: 'kaynak_kitap', kitapId: 'yok-kitap' }),
    );
    expect(gecersiz.ayrinti).toBe('kaynak_gecersiz');
    const badLink = await hatayiYakala(
      d.kaynakOner(DENIZ, { tur: 'link', baglantiUrl: 'ftp://x', baslik: 'x' }),
    );
    expect(badLink.ayrinti).toBe('kaynak_gecersiz');

    await d.kaynakOneriGeriCek(link.id);
    const kalan = (await d.kocluk(DENIZ)).oneriler.map((x) => x.id);
    expect(kalan).not.toContain(link.id);
    await o.giris(...OGRENCI);
    expect((await d.kaynakOnerilerim()).map((x) => x.id)).not.toContain(link.id);
  });

  it('hatirlatma: bu hafta yazilmayanlar; yazilinca listeden duser', async () => {
    const o = await ogretmenOrtami();
    const d = o.adaptorler.degerlendirme;
    const h = await d.hatirlatma();
    expect(h.eksikSayisi).toBe(5);
    expect(h.ogrenciler.map((x) => x.ogrenciId)).toContain(DENIZ);
    await d.degerlendirmeYaz(DENIZ, {
      donemBaslangic: bugun(),
      olcekler: { calisma_duzeni: 3 },
      ogrenciGorur: false,
    });
    const sonra = await d.hatirlatma();
    expect(sonra.eksikSayisi).toBe(4);
    expect(sonra.ogrenciler.map((x) => x.ogrenciId)).not.toContain(DENIZ);
  });
});
