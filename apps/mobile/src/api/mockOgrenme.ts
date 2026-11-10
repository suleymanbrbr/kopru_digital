import { tarihEkle, yerelDenUtc, yerelTarih } from '../lib/saat';
import { gorevDurumuHesapla, haftaBaslangici } from '../ogrenme/hafta';
import { netHesapla, yuvarla2 } from '../ogrenme/net';
import { MOCK_SAAT_DILIMI, type MockOperasyonSecenekleri } from './mockOperasyon';
import type {
  BekleyenTeslim,
  Deneme,
  DenemeBolumu,
  DenemeGelisimi,
  DenemeKurali,
  Konu,
  Odev,
  OdevOgrenciSatiri,
  OdevOzeti,
  OdevSablonu,
  OgrenciOdevi,
  OgrenmeAdapter,
  PlanDetayi,
  PlanGorevi,
} from './ogrenmeTipleri';
import { ApiHata } from './tipler';

const SAAT = 3_600_000;

/** Grup uyeleri (mockOperasyon ile ayni kimlikler). */
const GRUP_UYELERI: Record<string, { id: string; ad: string }[]> = {
  'g-elif': [{ id: 'ogr-elif', ad: 'Elif Kaya' }],
  'g-mert': [{ id: 'ogr-mert', ad: 'Mert Aydın' }],
  'g-8a': [
    { id: 'ogr-elif', ad: 'Elif Kaya' },
    { id: 'ogr-zeynep', ad: 'Zeynep Demir' },
    { id: 'ogr-can', ad: 'Can Özkan' },
    { id: 'uyelik-ogrenci-a', ad: 'Deniz Yılmaz' },
  ],
};

const OGRENCI_ADLARI: Record<string, string> = Object.fromEntries(
  Object.values(GRUP_UYELERI)
    .flat()
    .map((u) => [u.id, u.ad]),
);

/** Konu agaci tohumu: matematik, fen bilimleri, turkce; bir konu kullanimdan kalkmis. */
function konuTohumu(): Konu[] {
  const k = (
    id: string,
    bransKodu: string,
    ustId: string | null,
    seviye: Konu['seviye'],
    ad: string,
    sira: number,
    kalkti = false,
  ): Konu => ({
    id,
    bransKodu,
    ustId,
    seviye,
    ad,
    sira,
    sinifSeviyesi: 8,
    global: true,
    kullanimdanKalkti: kalkti,
  });
  return [
    k('konu-m-sayilar', 'matematik', null, 'unite', 'Sayılar ve İşlemler', 1),
    k('konu-m-uslu', 'matematik', 'konu-m-sayilar', 'konu', 'Üslü Sayılar', 1),
    k('konu-m-koklu', 'matematik', 'konu-m-sayilar', 'konu', 'Kareköklü Sayılar', 2),
    k('konu-m-cebir', 'matematik', null, 'unite', 'Cebir', 2),
    k('konu-m-denklem', 'matematik', 'konu-m-cebir', 'konu', 'Denklemler', 1),
    k('konu-m-esitsizlik', 'matematik', 'konu-m-cebir', 'konu', 'Eşitsizlikler', 2),
    k('konu-m-kume', 'matematik', 'konu-m-cebir', 'konu', 'Eski Kümeler', 3, true),
    k('konu-f-isik', 'fen_bilimleri', null, 'unite', 'Işık ve Ses', 1),
    k('konu-f-yayilma', 'fen_bilimleri', 'konu-f-isik', 'konu', 'Işığın Yayılması', 1),
    k('konu-f-ses', 'fen_bilimleri', 'konu-f-isik', 'konu', 'Sesin Özellikleri', 2),
    k('konu-t-paragraf', 'turkce', null, 'unite', 'Paragraf', 1),
    k('konu-t-anafikir', 'turkce', 'konu-t-paragraf', 'konu', 'Ana Düşünce', 1),
    k('konu-t-yardimci', 'turkce', 'konu-t-paragraf', 'konu', 'Yardımcı Düşünce', 2),
  ];
}

const KURALLAR: DenemeKurali[] = [
  {
    id: 'kural-lgs',
    kod: 'lgs',
    ad: 'LGS',
    yanlisKatsayisi: 0.3333,
    toplamSoruSayisi: 90,
    bolumler: [
      { bolumKodu: 'turkce', bransKodu: 'turkce', ad: 'Türkçe', soruSayisi: 20 },
      { bolumKodu: 'matematik', bransKodu: 'matematik', ad: 'Matematik', soruSayisi: 20 },
      { bolumKodu: 'fen', bransKodu: 'fen_bilimleri', ad: 'Fen bilimleri', soruSayisi: 20 },
      { bolumKodu: 'inkilap', bransKodu: 'inkilap_tarihi', ad: 'İnkılap tarihi', soruSayisi: 10 },
      { bolumKodu: 'din', bransKodu: 'din_kulturu', ad: 'Din kültürü', soruSayisi: 10 },
      { bolumKodu: 'ingilizce', bransKodu: 'ingilizce', ad: 'İngilizce', soruSayisi: 10 },
    ],
  },
  {
    id: 'kural-tyt',
    kod: 'tyt',
    ad: 'TYT',
    yanlisKatsayisi: 0.25,
    toplamSoruSayisi: 120,
    bolumler: [
      { bolumKodu: 'turkce', bransKodu: 'turkce', ad: 'Türkçe', soruSayisi: 40 },
      { bolumKodu: 'sosyal', bransKodu: 'sosyal_bilgiler', ad: 'Sosyal bilimler', soruSayisi: 20 },
      { bolumKodu: 'matematik', bransKodu: 'matematik', ad: 'Temel matematik', soruSayisi: 40 },
      { bolumKodu: 'fen', bransKodu: 'fen_bilimleri', ad: 'Fen bilimleri', soruSayisi: 20 },
    ],
  },
];

function kuralBul(kod: string): DenemeKurali {
  const k = KURALLAR.find((x) => x.kod === kod);
  if (!k) throw new Error(`tohum kurali yok: ${kod}`);
  return k;
}

interface MockOdevSatiri extends OgrenciOdevi {
  ogrenciId: string;
  ad: string;
}

interface MockPlan {
  id: string;
  ogrenciId: string;
  hafta: string;
  durum: 'taslak' | 'yayinda';
  not: string | null;
  surum: number;
}

/** Hafta sonu + 14 gun gecince hafta kilitlenir (api `PLAN_KILIT_GUN`). */
const KILIT_GUN = 14;

/**
 * Backend olmadan calisan konu, odev, plan ve deneme adaptoru. Tohumlar SIMDIKI zamana baglidir
 * (bugun/dun/yarin); testler tarihleri `bugunTarihi` ile hesaplamalidir.
 */
export function mockOgrenme(sec: MockOperasyonSecenekleri): OgrenmeAdapter {
  const simdi = sec.simdi ?? (() => Date.now());
  const tz = MOCK_SAAT_DILIMI;
  const bugun = yerelTarih(simdi(), tz);
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;
  const kopya = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  async function gecik() {
    await sec.bekle(sec.gecikmeMs);
    await sec.oturumGerekli();
  }
  const aktif = () => sec.aktifUyelikId();
  const ogrenciKimligi = () => {
    const id = aktif();
    return id?.startsWith('uyelik-ogrenci') ? id : null;
  };
  function ogrenciOlmali(): string {
    const id = ogrenciKimligi();
    if (!id) throw new ApiHata('izin_yok', undefined, { durum: 403, ayrinti: 'izin_yok' });
    return id;
  }
  function personelOlmali() {
    if (ogrenciKimligi()) throw new ApiHata('izin_yok', undefined, { durum: 403 });
  }
  const bulunamadi = () => new ApiHata('bulunamadi', undefined, { durum: 404 });
  const cakisma = (kod: string) => new ApiHata('cakisma', undefined, { durum: 409, ayrinti: kod });
  const dogrulama = (kod: string) =>
    new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: kod });

  const DENIZ = 'uyelik-ogrenci-a';

  // --- Odev tohumu ---------------------------------------------------------------------------
  const odevSablonlari: OdevSablonu[] = [
    {
      id: 'sablon-1',
      baslik: 'Haftalık problem seti',
      bransKodu: 'matematik',
      konuId: 'konu-m-uslu',
      tur: 'soru',
      kaynak: null,
      hedefSoruSayisi: 20,
    },
  ];

  const o1 = odevTohumu('odev-1', 'Üslü Sayılar: 20 soru', 'konu-m-uslu', 20, tarihEkle(bugun, 1));
  const o2 = odevTohumu(
    'odev-2',
    'Denklemler: 15 soru',
    'konu-m-denklem',
    15,
    tarihEkle(bugun, -1),
  );
  const o3 = odevTohumu('odev-3', 'Paragraf: 10 soru', 'konu-t-anafikir', 10, tarihEkle(bugun, -6));
  const odevler: Odev[] = [o1, o2, o3];

  function odevTohumu(id: string, baslik: string, konuId: string, n: number, son: string): Odev {
    return {
      id,
      baslik,
      bransKodu: konuId.startsWith('konu-t') ? 'turkce' : 'matematik',
      konuId,
      tur: 'soru',
      kaynak: null,
      hedefTuru: 'grup',
      hedefId: 'g-8a',
      sonTeslim: yerelDenUtc(son, '23:59', tz),
      hedefSoruSayisi: n,
      durum: 'yayinda',
      atananSayisi: 4,
    };
  }

  function satirUret(
    odev: Odev,
    ogrenciId: string,
    ek: Partial<MockOdevSatiri> = {},
  ): MockOdevSatiri {
    return {
      id: `oo-${odev.id}-${ogrenciId}`,
      odevId: odev.id,
      ogrenciId,
      ad: OGRENCI_ADLARI[ogrenciId] ?? '',
      baslik: odev.baslik,
      aciklama: null,
      bransKodu: odev.bransKodu,
      konuId: odev.konuId,
      tur: odev.tur,
      kaynak: odev.kaynak,
      hedefSoruSayisi: odev.hedefSoruSayisi,
      durum: 'atandi',
      sonTeslim: odev.sonTeslim,
      yapilanSoru: null,
      dogru: null,
      yanlis: null,
      bos: null,
      ogrenciNotu: null,
      teslimAt: null,
      gecTeslim: false,
      incelemeSonucu: null,
      incelemeNotu: null,
      ...ek,
    };
  }

  const teslimEdilmis = (n: number, d: number, y: number): Partial<MockOdevSatiri> => ({
    durum: 'teslim_edildi',
    yapilanSoru: n,
    dogru: d,
    yanlis: y,
    bos: n - d - y,
  });

  const satirlar: MockOdevSatiri[] = [
    satirUret(o1, 'ogr-elif', {
      ...teslimEdilmis(20, 16, 3),
      teslimAt: new Date(simdi() - 2 * SAAT).toISOString(),
      ogrenciNotu: 'Son iki soru zordu.',
    }),
    satirUret(o1, 'ogr-zeynep', {
      ...teslimEdilmis(20, 18, 2),
      teslimAt: new Date(simdi() - 5 * SAAT).toISOString(),
    }),
    satirUret(o1, 'ogr-can', {
      ...teslimEdilmis(20, 12, 8),
      durum: 'incelendi',
      teslimAt: new Date(simdi() - 20 * SAAT).toISOString(),
      incelemeSonucu: 'tamam',
      incelemeNotu: 'Yanlışlara bak.',
    }),
    satirUret(o1, DENIZ),
    satirUret(o2, 'ogr-elif', { durum: 'incelendi', incelemeSonucu: 'tamam' }),
    satirUret(o2, 'ogr-zeynep'),
    satirUret(o2, 'ogr-can'),
    satirUret(o2, DENIZ),
    satirUret(o3, DENIZ, {
      ...teslimEdilmis(10, 9, 1),
      durum: 'incelendi',
      teslimAt: new Date(simdi() - 5 * 24 * SAAT).toISOString(),
      incelemeSonucu: 'tamam',
      incelemeNotu: 'Aferin, böyle devam.',
    }),
  ];

  function ozetSatiri(s: MockOdevSatiri): OdevOgrenciSatiri {
    return {
      ogrenciOdevId: s.id,
      ogrenciId: s.ogrenciId,
      ad: s.ad,
      durum: s.durum,
      gecTeslim: s.gecTeslim,
      teslimAt: s.teslimAt,
      yapilanSoru: s.yapilanSoru,
      dogru: s.dogru,
      yanlis: s.yanlis,
      bos: s.bos,
      ogrenciNotu: s.ogrenciNotu,
      incelemeSonucu: s.incelemeSonucu,
      incelemeNotu: s.incelemeNotu,
    };
  }

  function ogrenciOdeviDon(s: MockOdevSatiri): OgrenciOdevi {
    const { ogrenciId: _o, ad: _a, ...odev } = s;
    return odev;
  }

  // --- Plan tohumu ---------------------------------------------------------------------------
  const planlar: MockPlan[] = [];
  const gorevler: PlanGorevi[] = [];

  function planAl(ogrenciId: string, hafta: string, durum: 'taslak' | 'yayinda'): MockPlan {
    let p = planlar.find((x) => x.ogrenciId === ogrenciId && x.hafta === hafta);
    if (!p) {
      p = { id: yeniId('plan'), ogrenciId, hafta, durum, not: null, surum: 1 };
      planlar.push(p);
    }
    return p;
  }

  function gorevUret(
    plan: MockPlan,
    gun: string,
    bransKodu: string,
    hedefTuru: PlanGorevi['hedefTuru'],
    hedefMiktar: number,
    ek: Partial<PlanGorevi> = {},
  ): PlanGorevi {
    const g: PlanGorevi = {
      id: yeniId('gorev'),
      planId: plan.id,
      ogrenciId: plan.ogrenciId,
      haftaBaslangic: plan.hafta,
      gun,
      bransKodu,
      konuId: null,
      baslik: null,
      hedefTuru,
      hedefMiktar,
      gerceklesen: null,
      durum: 'bekliyor',
      devredenGorevId: null,
      sira: gorevler.filter((x) => x.planId === plan.id && x.gun === gun).length,
      surum: 1,
      ...ek,
    };
    gorevler.push(g);
    return g;
  }

  for (const gun of [tarihEkle(bugun, -1), bugun, tarihEkle(bugun, 1)]) {
    planAl(DENIZ, haftaBaslangici(gun), 'yayinda');
  }
  const dp = (gun: string) => planAl(DENIZ, haftaBaslangici(gun), 'yayinda');
  gorevUret(dp(tarihEkle(bugun, -1)), tarihEkle(bugun, -1), 'matematik', 'soru', 20, {
    konuId: 'konu-m-denklem',
    gerceklesen: 12,
    durum: 'kismen',
  });
  gorevUret(dp(bugun), bugun, 'matematik', 'soru', 20, { konuId: 'konu-m-uslu' });
  gorevUret(dp(bugun), bugun, 'fen_bilimleri', 'dakika', 30);
  gorevUret(dp(tarihEkle(bugun, 1)), tarihEkle(bugun, 1), 'turkce', 'soru', 15);
  // Elif: bu hafta TASLAK plan (ogretmen yayinlayabilir); gelecek hafta plani yok.
  gorevUret(planAl('ogr-elif', haftaBaslangici(bugun), 'taslak'), bugun, 'matematik', 'soru', 25);

  function kilitliMi(hafta: string): boolean {
    return tarihEkle(hafta, 6 + KILIT_GUN) < bugun;
  }

  function detay(ogrenciId: string, hafta: string, taslakGoster: boolean): PlanDetayi {
    const hb = haftaBaslangici(hafta);
    const p = planlar.find((x) => x.ogrenciId === ogrenciId && x.hafta === hb);
    const gorunur = p && (taslakGoster || p.durum === 'yayinda') ? p : undefined;
    return {
      ogrenciId,
      haftaBaslangic: hb,
      kilitli: kilitliMi(hb),
      plan: gorunur
        ? { id: gorunur.id, durum: gorunur.durum, not: gorunur.not, surum: gorunur.surum }
        : null,
      gorevler: gorunur ? kopya(gorevler.filter((g) => g.planId === gorunur.id)) : [],
    };
  }

  function gorevBul(id: string): PlanGorevi {
    const g = gorevler.find((x) => x.id === id);
    if (!g) throw bulunamadi();
    return g;
  }

  // --- Deneme tohumu -------------------------------------------------------------------------
  const denemeler: (Deneme & { surum: number })[] = [];

  function bolumHesapla(
    kural: DenemeKurali,
    girdi: { bolumKodu: string; dogru: number; yanlis: number; bos?: number }[],
  ): DenemeBolumu[] {
    return girdi.map((b) => {
      const kb = kural.bolumler.find((x) => x.bolumKodu === b.bolumKodu);
      if (!kb) throw dogrulama('deneme_bolum_gecersiz');
      const bos = b.bos ?? kb.soruSayisi - b.dogru - b.yanlis;
      if (b.dogru + b.yanlis + bos !== kb.soruSayisi || bos < 0) {
        throw dogrulama('deneme_bolum_gecersiz');
      }
      return {
        bolumKodu: kb.bolumKodu,
        bransKodu: kb.bransKodu,
        soruSayisi: kb.soruSayisi,
        dogru: b.dogru,
        yanlis: b.yanlis,
        bos,
        net: netHesapla(b.dogru, b.yanlis, kural.yanlisKatsayisi),
      };
    });
  }

  function denemeEkle(
    ogrenciId: string,
    kuralKodu: string,
    ad: string,
    gunOnce: number,
    puan: number,
    ek: Partial<Deneme> = {},
  ): Deneme {
    const kural = kuralBul(kuralKodu);
    const bolumler = bolumHesapla(
      kural,
      kural.bolumler.map((b) => {
        const dogru = Math.max(Math.round(b.soruSayisi * puan), 0);
        const yanlis = Math.min(Math.round(b.soruSayisi * 0.1), b.soruSayisi - dogru);
        return { bolumKodu: b.bolumKodu, dogru, yanlis };
      }),
    );
    const d: Deneme & { surum: number } = {
      id: yeniId('deneme'),
      ogrenciId,
      ogrenciAd: OGRENCI_ADLARI[ogrenciId] ?? null,
      kuralKodu,
      yanlisKatsayisi: kural.yanlisKatsayisi,
      ad,
      yayinevi: null,
      sinavTarihi: tarihEkle(bugun, -gunOnce),
      toplamNet: yuvarla2(bolumler.reduce((t, b) => t + b.net, 0)),
      kaynak: 'ogretmen',
      onayDurumu: 'onaylandi',
      redNedeni: null,
      bolumler,
      surum: 1,
      ...ek,
    };
    denemeler.push(d);
    return d;
  }

  denemeEkle(DENIZ, 'tyt', 'Deneme 1', 42, 0.45);
  denemeEkle(DENIZ, 'tyt', 'Deneme 2', 28, 0.55);
  denemeEkle(DENIZ, 'tyt', 'Deneme 3', 21, 0.6);
  denemeEkle(DENIZ, 'tyt', 'Deneme 4', 14, 0.68);
  denemeEkle(DENIZ, 'tyt', 'Deneme 5', 7, 0.72, { kaynak: 'ogrenci' });
  denemeEkle(DENIZ, 'tyt', 'Evde çözdüm', 3, 0.7, { kaynak: 'ogrenci', onayDurumu: 'bekliyor' });
  denemeEkle(DENIZ, 'tyt', 'Hatalı giriş', 10, 0.9, {
    kaynak: 'ogrenci',
    onayDurumu: 'reddedildi',
    redNedeni: 'Doğru sayıları cevap anahtarıyla tutmuyor.',
  });
  denemeEkle('ogr-elif', 'tyt', 'Elif denemesi', 5, 0.5, { onayDurumu: 'onaylandi' });
  denemeEkle('ogr-elif', 'tyt', 'Elif evde', 2, 0.65, {
    kaynak: 'ogrenci',
    onayDurumu: 'bekliyor',
  });

  const ogrenciGirisiAcik = () => !(aktif() ?? '').endsWith('-b');

  function ortalama(d: number[]): number | null {
    return d.length === 0 ? null : yuvarla2(d.reduce((a, b) => a + b, 0) / d.length);
  }

  const adaptor: OgrenmeAdapter = {
    async konular() {
      await gecik();
      return konuTohumu();
    },

    // --- Odev (ogrenci) ---
    async odevlerim() {
      await gecik();
      const id = ogrenciOlmali();
      return satirlar.filter((s) => s.ogrenciId === id).map(ogrenciOdeviDon);
    },

    async odevTeslim(ogrenciOdevId, g) {
      await gecik();
      const id = ogrenciOlmali();
      const s = satirlar.find((x) => x.id === ogrenciOdevId && x.ogrenciId === id);
      if (!s) throw bulunamadi();
      if (s.durum !== 'atandi' && s.durum !== 'tekrar_istendi') {
        throw cakisma('teslim_durumu_gecersiz');
      }
      s.durum = 'teslim_edildi';
      s.yapilanSoru = g.yapilanSoru;
      s.dogru = g.dogru ?? null;
      s.yanlis = g.yanlis ?? null;
      s.bos = g.bos ?? null;
      s.ogrenciNotu = g.not ?? null;
      s.teslimAt = new Date(simdi()).toISOString();
      s.gecTeslim = s.sonTeslim !== null && Date.parse(s.sonTeslim) < simdi();
      s.incelemeSonucu = null;
      s.incelemeNotu = null;
      return kopya(ogrenciOdeviDon(s));
    },

    // --- Odev (ogretmen) ---
    async odevler() {
      await gecik();
      personelOlmali();
      return kopya(odevler);
    },

    async odevVer(g) {
      await gecik();
      personelOlmali();
      const uyeler =
        g.hedefTuru === 'grup' ? (GRUP_UYELERI[g.hedefId] ?? []) : [{ id: g.hedefId, ad: '' }];
      const odev: Odev = {
        id: yeniId('odev'),
        baslik: g.baslik,
        bransKodu: g.bransKodu,
        konuId: g.konuId ?? null,
        tur: g.tur,
        kaynak: g.kaynak ?? null,
        hedefTuru: g.hedefTuru,
        hedefId: g.hedefId,
        sonTeslim: g.sonTeslim,
        hedefSoruSayisi: g.hedefSoruSayisi ?? null,
        durum: 'yayinda',
        atananSayisi: uyeler.length,
      };
      odevler.unshift(odev);
      for (const u of uyeler) satirlar.push(satirUret(odev, u.id, { ad: u.ad }));
      return kopya(odev);
    },

    async odevOzeti(odevId): Promise<OdevOzeti> {
      await gecik();
      personelOlmali();
      const odev = odevler.find((o) => o.id === odevId);
      if (!odev) throw bulunamadi();
      const rows = satirlar.filter((s) => s.odevId === odevId);
      const say = (d: OgrenciOdevi['durum']) => rows.filter((r) => r.durum === d).length;
      const oranlar = rows
        .filter((r) => r.dogru !== null && r.yapilanSoru)
        .map((r) => (r.dogru ?? 0) / (r.yapilanSoru ?? 1));
      return {
        odev: kopya(odev),
        sayilar: {
          atanan: rows.length,
          atandi: say('atandi'),
          teslimEdildi: say('teslim_edildi'),
          incelendi: say('incelendi'),
          tekrarIstendi: say('tekrar_istendi'),
          gecTeslim: rows.filter((r) => r.gecTeslim).length,
          ortalamaDogruOrani:
            oranlar.length === 0 ? null : oranlar.reduce((a, b) => a + b, 0) / oranlar.length,
        },
        ogrenciler: rows.map(ozetSatiri),
      };
    },

    async odevIncele(ogrenciOdevId, sonuc, not) {
      await gecik();
      personelOlmali();
      const s = satirlar.find((x) => x.id === ogrenciOdevId);
      if (!s) throw bulunamadi();
      if (s.durum !== 'teslim_edildi') throw cakisma('inceleme_durumu_gecersiz');
      s.durum = sonuc === 'tekrar' ? 'tekrar_istendi' : 'incelendi';
      s.incelemeSonucu = sonuc;
      s.incelemeNotu = not ?? null;
      return ozetSatiri(s);
    },

    async odevSablonlari() {
      await gecik();
      personelOlmali();
      return kopya(odevSablonlari);
    },

    async incelemeBekleyenler() {
      await gecik();
      personelOlmali();
      const sonuc: BekleyenTeslim[] = satirlar
        .filter((s) => s.durum === 'teslim_edildi')
        .map((s) => ({
          odevId: s.odevId,
          odevBaslik: s.baslik,
          ogrenciOdevId: s.id,
          ad: s.ad,
          teslimAt: s.teslimAt,
          gecTeslim: s.gecTeslim,
        }));
      return sonuc.sort((a, b) => Date.parse(a.teslimAt ?? '') - Date.parse(b.teslimAt ?? ''));
    },

    // --- Plan (ogrenci) ---
    async planim(hafta) {
      await gecik();
      return detay(ogrenciOlmali(), hafta, false);
    },

    async gorevGerceklesen(gorevId, miktar) {
      await gecik();
      const id = ogrenciOlmali();
      const g = gorevBul(gorevId);
      const plan = planlar.find((p) => p.id === g.planId);
      if (g.ogrenciId !== id || plan?.durum !== 'yayinda') throw bulunamadi();
      if (g.durum === 'devredildi') throw cakisma('gorev_zaten_devredildi');
      if (kilitliMi(g.haftaBaslangic)) throw cakisma('plan_kilitli');
      // Ayni deger tekrari: hicbir sey degismez (surum artmaz).
      if (g.gerceklesen === miktar) return kopya(g);
      g.gerceklesen = miktar;
      g.durum = gorevDurumuHesapla(g.hedefMiktar, miktar);
      g.surum += 1;
      return kopya(g);
    },

    async gorevDevret(gorevId, hedefGun) {
      await gecik();
      const id = ogrenciOlmali();
      const g = gorevBul(gorevId);
      if (g.ogrenciId !== id) throw bulunamadi();
      if (g.durum === 'devredildi') throw cakisma('gorev_zaten_devredildi');
      if (g.durum === 'tamam') throw cakisma('devretme_durumu_gecersiz');
      if (kilitliMi(g.haftaBaslangic)) throw cakisma('plan_kilitli');
      const hedef = hedefGun ?? tarihEkle(g.gun, 1);
      if (hedef <= g.gun || hedef > tarihEkle(g.gun, 7)) throw dogrulama('hedef_gun_gecersiz');
      if (kilitliMi(haftaBaslangici(hedef))) throw cakisma('plan_kilitli');
      const plan = planAl(id, haftaBaslangici(hedef), 'yayinda');
      const kalan = Math.max(g.hedefMiktar - (g.gerceklesen ?? 0), 1);
      g.durum = 'devredildi';
      g.surum += 1;
      const yeni = gorevUret(plan, hedef, g.bransKodu, g.hedefTuru, kalan, {
        konuId: g.konuId,
        baslik: g.baslik,
        devredenGorevId: g.id,
      });
      return kopya({ eski: g, yeni });
    },

    // --- Plan (ogretmen) ---
    async ogrenciPlani(ogrenciId, hafta) {
      await gecik();
      personelOlmali();
      return detay(ogrenciId, hafta, true);
    },

    async planOlustur(ogrenciId, haftaBaslangic) {
      await gecik();
      personelOlmali();
      if (kilitliMi(haftaBaslangic)) throw cakisma('plan_kilitli');
      if (planlar.some((p) => p.ogrenciId === ogrenciId && p.hafta === haftaBaslangic)) {
        throw cakisma('plan_zaten_var');
      }
      planAl(ogrenciId, haftaBaslangic, 'taslak');
      return detay(ogrenciId, haftaBaslangic, true);
    },

    async gorevEkle(planId, g) {
      await gecik();
      personelOlmali();
      const p = planlar.find((x) => x.id === planId);
      if (!p) throw bulunamadi();
      if (kilitliMi(p.hafta)) throw cakisma('plan_kilitli');
      if (haftaBaslangici(g.gun) !== p.hafta) throw dogrulama('gun_hafta_disinda');
      return kopya(
        gorevUret(p, g.gun, g.bransKodu, g.hedefTuru, g.hedefMiktar, {
          konuId: g.konuId ?? null,
          baslik: g.baslik ?? null,
        }),
      );
    },

    async gorevGuncelle(gorevId, g) {
      await gecik();
      personelOlmali();
      const gv = gorevBul(gorevId);
      if (kilitliMi(gv.haftaBaslangic)) throw cakisma('plan_kilitli');
      if (g.surum !== undefined && g.surum !== gv.surum) throw cakisma('surum_cakismasi');
      if (g.gun) {
        if (haftaBaslangici(g.gun) !== gv.haftaBaslangic) throw dogrulama('gun_hafta_disinda');
        gv.gun = g.gun;
      }
      if (g.hedefTuru) gv.hedefTuru = g.hedefTuru;
      if (g.hedefMiktar) gv.hedefMiktar = g.hedefMiktar;
      if (g.baslik !== undefined) gv.baslik = g.baslik;
      gv.surum += 1;
      return kopya(gv);
    },

    async gorevSil(gorevId) {
      await gecik();
      personelOlmali();
      const g = gorevBul(gorevId);
      const p = planlar.find((x) => x.id === g.planId);
      if (kilitliMi(g.haftaBaslangic)) throw cakisma('plan_kilitli');
      if (p?.durum === 'yayinda' && g.gerceklesen !== null) throw cakisma('gorev_silinemez');
      gorevler.splice(gorevler.indexOf(g), 1);
    },

    async planYayinla(planId) {
      await gecik();
      personelOlmali();
      const p = planlar.find((x) => x.id === planId);
      if (!p) throw bulunamadi();
      if (kilitliMi(p.hafta)) throw cakisma('plan_kilitli');
      p.durum = 'yayinda';
      p.surum += 1;
      return detay(p.ogrenciId, p.hafta, true);
    },

    // --- Deneme ---
    async denemeKurallari() {
      await gecik();
      return kopya(KURALLAR);
    },

    async ogrenciDenemeGirisi() {
      await gecik();
      return ogrenciGirisiAcik();
    },

    async denemelerim() {
      await gecik();
      const id = ogrenciOlmali();
      return kopya(
        denemeler
          .filter((d) => d.ogrenciId === id)
          .map((d) => ({ ...d, ogrenciAd: null }))
          .sort((a, b) => b.sinavTarihi.localeCompare(a.sinavTarihi)),
      );
    },

    async denemeOlustur(g) {
      await gecik();
      const ogr = ogrenciKimligi();
      if (ogr && !ogrenciGirisiAcik()) {
        throw new ApiHata('izin_yok', undefined, {
          durum: 403,
          ayrinti: 'ogrenci_deneme_girisi_kapali',
        });
      }
      const ogrenciId = ogr ?? g.ogrenciId;
      if (!ogrenciId) throw dogrulama('ogrenci_gerekli');
      const kural = KURALLAR.find((k) => k.kod === g.kuralKodu);
      if (!kural) throw bulunamadi();
      if (
        denemeler.some(
          (d) =>
            d.ogrenciId === ogrenciId &&
            d.kuralKodu === g.kuralKodu &&
            d.ad === g.ad &&
            d.sinavTarihi === g.sinavTarihi,
        )
      ) {
        throw cakisma('deneme_zaten_var');
      }
      const bolumler = bolumHesapla(kural, g.bolumler);
      const d: Deneme & { surum: number } = {
        id: yeniId('deneme'),
        ogrenciId,
        ogrenciAd: ogr ? null : (OGRENCI_ADLARI[ogrenciId] ?? null),
        kuralKodu: kural.kod,
        yanlisKatsayisi: kural.yanlisKatsayisi,
        ad: g.ad,
        yayinevi: g.yayinevi ?? null,
        sinavTarihi: g.sinavTarihi,
        toplamNet: yuvarla2(bolumler.reduce((t, b) => t + b.net, 0)),
        kaynak: ogr ? 'ogrenci' : 'ogretmen',
        onayDurumu: ogr ? 'bekliyor' : 'onaylandi',
        redNedeni: null,
        bolumler,
        surum: 1,
      };
      denemeler.push(d);
      return kopya(d);
    },

    async denemeler(s) {
      await gecik();
      personelOlmali();
      return kopya(
        denemeler
          .filter(
            (d) =>
              (!s.onay || d.onayDurumu === s.onay) && (!s.ogrenciId || d.ogrenciId === s.ogrenciId),
          )
          .sort((a, b) => b.sinavTarihi.localeCompare(a.sinavTarihi)),
      );
    },

    async denemeOnayla(denemeId) {
      await gecik();
      personelOlmali();
      const d = denemeler.find((x) => x.id === denemeId);
      if (!d) throw bulunamadi();
      if (d.onayDurumu === 'reddedildi') throw cakisma('deneme_onay_durumu_gecersiz');
      d.onayDurumu = 'onaylandi';
      d.redNedeni = null;
    },

    async denemeReddet(denemeId, nedeni) {
      await gecik();
      personelOlmali();
      const d = denemeler.find((x) => x.id === denemeId);
      if (!d) throw bulunamadi();
      if (d.onayDurumu !== 'bekliyor') throw cakisma('deneme_onay_durumu_gecersiz');
      d.onayDurumu = 'reddedildi';
      d.redNedeni = nedeni;
    },

    async denemeGelisim(ogrenciId, kuralKodu): Promise<DenemeGelisimi> {
      await gecik();
      const ogr = ogrenciKimligi();
      if (ogr && ogr !== ogrenciId) throw bulunamadi();
      const onayli = denemeler
        .filter(
          (d) =>
            d.ogrenciId === ogrenciId && d.kuralKodu === kuralKodu && d.onayDurumu === 'onaylandi',
        )
        .sort((a, b) => a.sinavTarihi.localeCompare(b.sinavTarihi));
      const noktalar = onayli.slice(-20).map((d) => ({
        denemeId: d.id,
        ad: d.ad,
        sinavTarihi: d.sinavTarihi,
        toplamNet: d.toplamNet,
        bolumler: d.bolumler.map((b) => ({
          bolumKodu: b.bolumKodu,
          bransKodu: b.bransKodu,
          net: b.net,
        })),
      }));
      const son5 = onayli.slice(-5);
      const onceki5 = onayli.slice(-10, -5);
      const son5Ort = ortalama(son5.map((d) => d.toplamNet));
      const oncekiOrt = ortalama(onceki5.map((d) => d.toplamNet));
      const kural = KURALLAR.find((k) => k.kod === kuralKodu);
      return {
        ogrenciId,
        kuralKodu,
        denemeSayisi: onayli.length,
        noktalar,
        son5Ortalama: son5Ort,
        onceki5Ortalama: oncekiOrt,
        degisim: son5Ort !== null && oncekiOrt !== null ? yuvarla2(son5Ort - oncekiOrt) : null,
        bolumGelisimi: (kural?.bolumler ?? []).map((kb) => {
          const ort = (liste: typeof onayli) =>
            ortalama(
              liste.flatMap((d) =>
                d.bolumler.filter((b) => b.bolumKodu === kb.bolumKodu).map((b) => b.net),
              ),
            );
          const s = ort(son5);
          const o = ort(onceki5);
          return {
            bolumKodu: kb.bolumKodu,
            bransKodu: kb.bransKodu,
            son5Ortalama: s,
            degisim: s !== null && o !== null ? yuvarla2(s - o) : null,
          };
        }),
      };
    },
  };
  return adaptor;
}
