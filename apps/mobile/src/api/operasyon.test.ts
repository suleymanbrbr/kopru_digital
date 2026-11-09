import { MODUL_KODLARI } from '@kopru/contracts';

import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { gercekAdaptorler } from './gercek';
import { apiHatasiMi, type ApiHata } from './tipler';

const KURUM = '0190f3a0-0000-7000-8000-000000000001';
const UYELIK = '0190f3a0-0000-7000-8000-000000000002';
const KULLANICI = '0190f3a0-0000-7000-8000-000000000005';
const DERS = '0190f3a0-0000-7000-8000-000000000030';
const GRUP = '0190f3a0-0000-7000-8000-000000000031';
const OGRENCI = '0190f3a0-0000-7000-8000-000000000032';
const ISTEK = '0190f3a0-0000-7000-8000-000000000033';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });
const hata = (status: number, code: string, details?: unknown) =>
  json({ error: { code, message: 'x', ...(details ? { details } : {}) } }, status);

interface Cagri {
  yol: string;
  yontem: string;
  govde: unknown;
  baslik: (ad: string) => string | null;
}
type Yonlendirici = (c: Cagri) => Response | Promise<Response>;

const apiDers = (ek: Record<string, unknown> = {}) => ({
  id: DERS,
  grup_id: GRUP,
  seri_id: null,
  seri_sirasi: null,
  ogretmen_id: UYELIK,
  brans_kodu: 'matematik',
  konu_id: null,
  baslik: null,
  baslangic_at: '2026-11-09T11:00:00.000Z',
  bitis_at: '2026-11-09T12:00:00.000Z',
  durum: 'planli',
  iptal_nedeni: null,
  iptal_kaynagi: null,
  iptal_eden_id: null,
  iptal_at: null,
  gec_iptal: false,
  ilk_baslangic_at: '2026-11-09T11:00:00.000Z',
  ertelendi_sayisi: 0,
  telafi: false,
  telafi_kaynak_ders_id: null,
  seri_istisna: false,
  online_baglanti: 'https://meet.example.com/x',
  yer: null,
  cakisma_onayli: false,
  katilimci_sayisi: 1,
  surum: 3,
  created_at: '2026-11-01T10:00:00.000Z',
  ...ek,
});

async function kur(yonlendir: Yonlendirici) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: Request) => {
    const url = new URL(girdi.url);
    const metin = await girdi.clone().text();
    const c: Cagri = {
      yol: url.pathname + url.search,
      yontem: girdi.method,
      govde: metin ? (JSON.parse(metin) as unknown) : undefined,
      baslik: (ad) => girdi.headers.get(ad),
    };
    if (c.yol === '/v1/hesap/ben') {
      return json({
        kullanici: {
          id: KULLANICI,
          gorunen_ad: 'Hoca',
          telefon_e164: '+905321112233',
          eposta: null,
        },
        uyelikler: [
          { uyelik_id: UYELIK, kurum_id: KURUM, kurum_ad: 'K', rol: 'ogretmen', durum: 'aktif' },
        ],
        onay_gerekli: false,
      });
    }
    if (c.yol === '/auth/token') {
      return json({
        access_token: 'kurum-erisim',
        token_type: 'Bearer',
        expires_in: 900,
        rol: 'ogretmen',
      });
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
  return { adaptorler, cagrilar };
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

const DERS_YOLU = `/v1/ders/kurumlar/${KURUM}/dersler`;
const FINANS_YOLU = `/v1/finans/kurumlar/${KURUM}`;

describe('ders adaptoru', () => {
  it('kurum saat dilimini okur; izin yoksa Europe/Istanbul', async () => {
    const { adaptorler } = await kur((c) =>
      c.yol === `/v1/hesap/kurumlar/${KURUM}`
        ? json({ saat_dilimi: 'Europe/Berlin' })
        : hata(404, 'x'),
    );
    expect(await adaptorler.ders.saatDilimi()).toBe('Europe/Berlin');
    const { adaptorler: b } = await kur(() => hata(403, 'izin_yok'));
    expect(await b.ders.saatDilimi()).toBe('Europe/Istanbul');
  });

  it('dersler: aralik sorgusu, sayfalama ve camelCase esleme', async () => {
    const { adaptorler, cagrilar } = await kur((c) => {
      if (c.yol.includes('imlec=sonraki'))
        return json({ dersler: [apiDers({ id: 'ikinci' })], sonraki_imlec: null });
      return json({ dersler: [apiDers()], sonraki_imlec: 'sonraki' });
    });
    const d = await adaptorler.ders.dersler('2026-11-08T21:00:00.000Z', '2026-11-09T21:00:00.000Z');
    expect(d.map((x) => x.id)).toEqual([DERS, 'ikinci']);
    expect(d[0]).toMatchObject({
      grupId: GRUP,
      baslangic: '2026-11-09T11:00:00.000Z',
      onlineBaglanti: 'https://meet.example.com/x',
      surum: 3,
      katilimciSayisi: 1,
    });
    expect(cagrilar[0]?.yol).toContain(DERS_YOLU);
    expect(cagrilar[0]?.yol).toContain('baslangic=2026-11-08T21%3A00%3A00.000Z');
  });

  it('tekil ders: POST /dersler govdesi ve ogrenci cakismasi uyarisi', async () => {
    const { adaptorler, cagrilar } = await kur(() =>
      json(
        { ders: { ...apiDers(), katilimcilar: [] }, uyari: [{ kod: 'ogrenci_cakismasi' }] },
        201,
      ),
    );
    const s = await adaptorler.ders.dersOlustur({
      grupId: GRUP,
      tarih: '2026-11-09',
      saat: '14:00',
      sureDk: 60,
      haftalik: false,
      cakismaOnayli: false,
    });
    expect(s.ogrenciCakismasi).toBe(true);
    expect(cagrilar[0]).toMatchObject({ yontem: 'POST', yol: DERS_YOLU });
    expect(cagrilar[0]?.govde).toEqual({
      grup_id: GRUP,
      tarih: '2026-11-09',
      baslangic_saati: '14:00',
      sure_dk: 60,
      cakisma_onayli: false,
    });
  });

  it('haftalik ders: POST /seriler, tekrar kurali baslangic gununden, bitis tarihi', async () => {
    const { adaptorler, cagrilar } = await kur(() =>
      json(
        {
          seri: {},
          dersler: [apiDers()],
          atlanan: [{ seri_sirasi: 2, tarih: '2026-11-16', neden: 'cakisma' }],
          cakisanlar: [],
          uyari: [],
        },
        201,
      ),
    );
    const s = await adaptorler.ders.dersOlustur({
      grupId: GRUP,
      tarih: '2026-11-09', // Pazartesi
      saat: '14:00',
      sureDk: 90,
      haftalik: true,
      bitisTarihi: '2026-12-21',
      bransKodu: 'fizik',
      cakismaOnayli: true,
    });
    expect(s.atlanan).toBe(1);
    expect(cagrilar[0]?.yol).toBe(`/v1/ders/kurumlar/${KURUM}/seriler`);
    expect(cagrilar[0]?.govde).toMatchObject({
      tekrar_kurali: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      baslangic_tarihi: '2026-11-09',
      bitis_tarihi: '2026-12-21',
      brans_kodu: 'fizik',
      cakisma_onayli: true,
      sure_dk: 90,
    });
  });

  it('409 ders_cakismasi: cakisma hatasi + detay; brans_gerekli ayrinti olarak korunur', async () => {
    const { adaptorler } = await kur((c) => {
      const g = c.govde as { brans_kodu?: string } | undefined;
      if (g?.brans_kodu) return json({ ders: { ...apiDers(), katilimcilar: [] }, uyari: [] }, 201);
      return hata(409, 'ders_cakismasi', { cakisanlar: [{ id: 'x' }] });
    });
    const girdi = {
      grupId: GRUP,
      tarih: '2026-11-09',
      saat: '14:00',
      sureDk: 60,
      haftalik: false,
      cakismaOnayli: false,
    };
    const e = await hatayiYakala(adaptorler.ders.dersOlustur(girdi));
    expect(e.kod).toBe('cakisma');
    expect(e.ayrinti).toBe('ders_cakismasi');
    expect(e.detay).toEqual({ cakisanlar: [{ id: 'x' }] });

    const { adaptorler: b } = await kur(() => hata(422, 'brans_gerekli'));
    const e2 = await hatayiYakala(b.ders.dersOlustur(girdi));
    expect(e2.kod).toBe('dogrulama');
    expect(e2.ayrinti).toBe('brans_gerekli');
  });

  it('tasi ve iptal: surum, kapsam ve iptal kaynagi gonderilir', async () => {
    const { adaptorler, cagrilar } = await kur((c) =>
      json({
        ders: { ...apiDers(), katilimcilar: [] },
        etkilenen_ders_idleri: c.yol.endsWith('/tasi') ? [DERS, 'b'] : [DERS],
        uyari: [],
      }),
    );
    const d = { id: DERS, surum: 3 } as unknown as Parameters<typeof adaptorler.ders.dersTasi>[0];
    const t = await adaptorler.ders.dersTasi(d, {
      kapsam: 'bu_ve_sonrakiler',
      yeniSaat: '15:00',
      cakismaOnayli: false,
    });
    expect(t.etkilenen).toBe(2);
    expect(cagrilar[0]?.govde).toEqual({
      surum: 3,
      kapsam: 'bu_ve_sonrakiler',
      cakisma_onayli: false,
      yeni_saat: '15:00',
    });
    await adaptorler.ders.dersIptal(d, { kapsam: 'yalniz_bu', kaynak: 'ogrenci', neden: 'hasta' });
    expect(cagrilar[1]?.yol).toBe(`${DERS_YOLU}/${DERS}/iptal`);
    expect(cagrilar[1]?.govde).toEqual({
      surum: 3,
      kapsam: 'yalniz_bu',
      iptal_kaynagi: 'ogrenci',
      iptal_nedeni: 'hasta',
    });
  });
});

describe('yoklama adaptoru', () => {
  const satirlar = [
    {
      ogrenciId: OGRENCI,
      durum: 'gec' as const,
      gecDakika: 10,
      not: 'Geç kaldı',
      notGorunurluk: 'ogrenciye' as const,
      isaretlenmeAt: '2026-11-09T09:00:00.000Z',
    },
  ];
  const yanit = (sonuc: string) => ({
    ders_id: DERS,
    ders_durumu: 'tamamlandi',
    sonuclar: [{ ogrenci_id: OGRENCI, sonuc, yoklama: {}, kalan_kredi: 4, uyari: null }],
  });

  it('PUT: Idempotency-Key = istekId, govde ve isaretlenme_at aynen', async () => {
    const { adaptorler, cagrilar } = await kur(() => json(yanit('yeni')));
    const s = await adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK);
    expect(cagrilar[0]?.yontem).toBe('PUT');
    expect(cagrilar[0]?.yol).toBe(`${DERS_YOLU}/${DERS}/yoklamalar`);
    expect(cagrilar[0]?.baslik('idempotency-key')).toBe(ISTEK);
    expect(cagrilar[0]?.govde).toEqual({
      yoklamalar: [
        {
          ogrenci_id: OGRENCI,
          durum: 'gec',
          gec_dakika: 10,
          not: 'Geç kaldı',
          not_gorunurluk: 'ogrenciye',
          isaretlenme_at: '2026-11-09T09:00:00.000Z',
        },
      ],
    });
    expect(s.sonuclar[0]).toEqual({ ogrenciId: OGRENCI, sonuc: 'yeni', kalanKredi: 4 });
  });

  it('ayni istekle ikinci cagri ayni anahtari ve ayni isaretlenme_at degerini gonderir', async () => {
    const { adaptorler, cagrilar } = await kur(() => json(yanit('ayni')));
    await adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK);
    await adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK);
    expect(cagrilar.map((c) => c.baslik('idempotency-key'))).toEqual([ISTEK, ISTEK]);
    expect(cagrilar[0]?.govde).toEqual(cagrilar[1]?.govde);
  });

  it("sonuc 'eski' adaptor sonucunda korunur", async () => {
    const { adaptorler } = await kur(() => json(yanit('eski')));
    const s = await adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK);
    expect(s.sonuclar[0]?.sonuc).toBe('eski');
  });

  it.each([
    [422, 'ders_henuz_baslamadi', 'dogrulama'],
    [403, 'yoklama_kilitli', 'izin_yok'],
    [422, 'ogrenci_katilimci_degil', 'dogrulama'],
    [409, 'ders_iptal_edildi', 'cakisma'],
    [422, 'idempotency_anahtar_cakismasi', 'dogrulama'],
  ])(
    '%i %s -> kalici (yeniden denenemez) hata, ayrinti korunur',
    async (durum, kod, adaptorKodu) => {
      const { adaptorler } = await kur(() => hata(durum, kod));
      const e = await hatayiYakala(adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK));
      expect(e.kod).toBe(adaptorKodu);
      expect(e.ayrinti).toBe(kod);
      expect(e.yenidenDenenebilir).toBe(false);
    },
  );

  it('5xx ve ag hatasi yeniden denenebilir', async () => {
    const { adaptorler } = await kur(() => hata(503, 'sunucu_hatasi'));
    expect(
      (await hatayiYakala(adaptorler.ders.yoklamaKaydet(DERS, satirlar, ISTEK))).yenidenDenenebilir,
    ).toBe(true);
  });

  it('yoklama-bekleyen: eksik sayisi eslenir; katilimcilar ad ve not ile', async () => {
    const { adaptorler } = await kur((c) =>
      c.yol.includes('yoklama-bekleyen')
        ? json({ dersler: [{ ...apiDers(), yoklamasi_eksik_sayisi: 2 }], sonraki_imlec: null })
        : json({
            ders: {},
            katilimcilar: [
              {
                ogrenci_id: OGRENCI,
                tur: 'uye',
                gorunen_ad: 'Elif',
                yoklama: { durum: 'geldi', not: 'İyi' },
              },
              { ogrenci_id: 'b', tur: 'misafir', gorunen_ad: null, yoklama: null },
            ],
          }),
    );
    const b = await adaptorler.ders.yoklamaBekleyen();
    expect(b[0]?.yoklamasiEksikSayisi).toBe(2);
    const k = await adaptorler.ders.yoklamaKatilimcilari(DERS);
    expect(k).toEqual([
      { ogrenciId: OGRENCI, ad: 'Elif', tur: 'uye', durum: 'geldi', not: 'İyi' },
      { ogrenciId: 'b', ad: '', tur: 'misafir', durum: null, not: null },
    ]);
  });
});

describe('finans adaptoru', () => {
  it('ogrenciler: rozet icin kalan kredi ve esik', async () => {
    const { adaptorler } = await kur(() =>
      json({
        dusuk_kredi_esigi: 3,
        kapsam: 'kurum',
        sonraki_imlec: null,
        ogrenciler: [
          {
            ogrenci_id: OGRENCI,
            gorunen_ad: 'Elif',
            model: 'paket',
            kalan_kredi: 1,
            dusuk_kredi: true,
            bakiye_kurus: -150000,
            borclu: true,
          },
        ],
      }),
    );
    const l = await adaptorler.finans.ogrenciler();
    expect(l.dusukKrediEsigi).toBe(3);
    expect(l.ogrenciler[0]).toEqual({
      ogrenciId: OGRENCI,
      ad: 'Elif',
      model: 'paket',
      kalanKredi: 1,
      bakiyeKurus: -150000,
      borclu: true,
    });
  });

  it('ogrenci karti (personel): paketler, hareketler (yeniden eskiye) ve odeyen', async () => {
    const { adaptorler } = await kur(() =>
      json({
        gorunum: 'tam',
        ogrenci_id: OGRENCI,
        model: 'paket',
        kalan_kredi: 5,
        dusuk_kredi_esigi: 2,
        bakiye_kurus: 0,
        borclu: false,
        etkin_paketler: [
          { id: 'p1', ad: '8 ders', toplam_kredi: 8, kalan_kredi: 5, bitis_tarihi: '2027-01-01' },
        ],
        son_kredi_hareketleri: [
          { id: 'k1', tur: 'dusum', miktar: -1, created_at: '2026-11-02T10:00:00.000Z' },
        ],
        son_bakiye_hareketleri: [
          {
            id: 'b1',
            tur: 'tahsilat',
            tutar_kurus: 320000,
            created_at: '2026-11-03T10:00:00.000Z',
          },
        ],
        odeyen_ad: 'Ayşe',
        odeyen_telefon: '+905321112233',
      }),
    );
    const k = await adaptorler.finans.ogrenciKarti(OGRENCI);
    if (k.gorunum !== 'tam') throw new Error('tam gorunum bekleniyordu');
    expect(k.etkinPaketler[0]).toMatchObject({
      ad: '8 ders',
      kalanKredi: 5,
      bitisTarihi: '2027-01-01',
    });
    expect(k.hareketler.map((h) => h.id)).toEqual(['b1', 'k1']);
    expect(k.odeyenTelefon).toBe('+905321112233');
  });

  it('ogrenci gorunumu yalniz kalan dersi tasir: fiyat, borc, hareket anahtari yok', async () => {
    const { adaptorler } = await kur(() =>
      json({
        gorunum: 'ogrenci',
        ogrenci_id: OGRENCI,
        kalan_kredi: 4,
        // sunucu hatasi senaryosu: fazladan alanlar donse bile adaptor bunlari tasimaz
        bakiye_kurus: -9999,
        fiyat_kurus: 1,
      }),
    );
    const k = await adaptorler.finans.ogrenciKarti(OGRENCI);
    expect(k).toEqual({ gorunum: 'ogrenci', ogrenciId: OGRENCI, kalanKredi: 4 });
    expect(Object.keys(k).sort()).toEqual(['gorunum', 'kalanKredi', 'ogrenciId']);
    const { adaptorler: b } = await kur(() =>
      json({ gorunum: 'ogrenci', ogrenci_id: OGRENCI, kalan_kredi: null }),
    );
    expect(await b.finans.ogrenciKarti(OGRENCI)).toMatchObject({ kalanKredi: null });
  });

  it('paket sat: kismi odeme govdesi; model hatasi anlasilir koda eslenir', async () => {
    const { adaptorler, cagrilar } = await kur(() =>
      json({ satis: {}, tahsilat: null, kalan_kredi: 8, bakiye_kurus: -200000 }, 201),
    );
    const s = await adaptorler.finans.paketSat({
      ogrenciId: OGRENCI,
      paketId: 'p1',
      odeme: { tur: 'kismi', yontem: 'havale', tutarKurus: 120000 },
    });
    expect(s).toEqual({ kalanKredi: 8, bakiyeKurus: -200000 });
    expect(cagrilar[0]?.yol).toBe(`${FINANS_YOLU}/paket-satislari`);
    expect(cagrilar[0]?.govde).toEqual({
      ogrenci_id: OGRENCI,
      paket_id: 'p1',
      odeme: { tur: 'kismi', yontem: 'havale', tutar_kurus: 120000 },
    });
    const { adaptorler: b } = await kur(() => hata(409, 'ogrenci_modeli_paket_degil'));
    const e = await hatayiYakala(
      b.finans.paketSat({ ogrenciId: OGRENCI, paketId: 'p1', odeme: { tur: 'sonra' } }),
    );
    expect(e.kod).toBe('cakisma');
    expect(e.ayrinti).toBe('ogrenci_modeli_paket_degil');
  });

  it('tahsilat: Idempotency-Key basligi ve kurus govdesi; tekrar bayragi', async () => {
    const { adaptorler, cagrilar } = await kur(() => json({ id: 't', tekrar: true }, 200));
    const s = await adaptorler.finans.tahsilatAl(
      { ogrenciId: OGRENCI, tutarKurus: 150050, yontem: 'nakit' },
      ISTEK,
    );
    expect(s.tekrar).toBe(true);
    expect(cagrilar[0]?.baslik('idempotency-key')).toBe(ISTEK);
    expect(cagrilar[0]?.govde).toEqual({
      ogrenci_id: OGRENCI,
      tutar_kurus: 150050,
      yontem: 'nakit',
    });
  });
});
