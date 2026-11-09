import { tarihEkle, yerelDenUtc, yerelSaat, yerelTarih } from '../lib/saat';
import type {
  BekleyenYoklamaDersi,
  Ders,
  DersAdapter,
  DersGrubu,
  FinansAdapter,
  FinansModeli,
  OgrenciKarti,
  Paket,
  YoklamaDurumu,
  YoklamaSonucu,
} from './operasyonTipleri';
import { ApiHata } from './tipler';

/** Mock kurumun saat dilimi (gosterimin cihaz saat dilimine bagli olmadigini denemek icin). */
export const MOCK_SAAT_DILIMI = 'Europe/Istanbul';

interface MockOgrenci {
  id: string;
  ad: string;
  model: FinansModeli;
  kalan: number;
  bakiye: number;
  odeyenAd: string | null;
  odeyenTelefon: string | null;
  hareketler: {
    id: string;
    tur: 'kredi' | 'bakiye';
    turKodu: string;
    miktar: number;
    tarih: string;
  }[];
}

interface MockDers extends Ders {
  katilimcilar: string[];
}

export interface MockOperasyonSecenekleri {
  bekle: (ms: number) => Promise<void>;
  gecikmeMs: number;
  oturumGerekli: () => Promise<void>;
  /** Etkin uyelik kimligi (ogrenci rolunde ogrenci kimligidir). */
  aktifUyelikId: () => string | null;
  simdi?: () => number;
}

const DAKIKA = 60_000;

/** Backend olmadan calisan ders, yoklama ve finans adaptorleri. */
export function mockOperasyon(sec: MockOperasyonSecenekleri): {
  ders: DersAdapter;
  finans: FinansAdapter;
} {
  const simdi = sec.simdi ?? (() => Date.now());
  const tz = MOCK_SAAT_DILIMI;
  const bugun = yerelTarih(simdi(), tz);
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;

  const ogrenciler: MockOgrenci[] = [
    {
      id: 'ogr-elif',
      ad: 'Elif Kaya',
      model: 'paket',
      kalan: 1,
      bakiye: -150000,
      odeyenAd: 'Ayşe Kaya',
      odeyenTelefon: '+905321112233',
      hareketler: [],
    },
    {
      id: 'ogr-mert',
      ad: 'Mert Aydın',
      model: 'paket',
      kalan: 0,
      bakiye: 0,
      odeyenAd: 'Ali Aydın',
      odeyenTelefon: null,
      hareketler: [],
    },
    {
      id: 'ogr-zeynep',
      ad: 'Zeynep Demir',
      model: 'paket',
      kalan: 8,
      bakiye: 0,
      odeyenAd: null,
      odeyenTelefon: null,
      hareketler: [],
    },
    {
      id: 'ogr-can',
      ad: 'Can Özkan',
      model: 'ders_basi',
      kalan: 0,
      bakiye: -60000,
      odeyenAd: 'Selin Özkan',
      odeyenTelefon: '+905441112233',
      hareketler: [],
    },
    // Ogrenci rolunun kendi uyelikleri (mock giris): a kurumu 5 ders, b kurumunda kurum ayari kapali.
    {
      id: 'uyelik-ogrenci-a',
      ad: 'Deniz Yılmaz',
      model: 'paket',
      kalan: 5,
      bakiye: 0,
      odeyenAd: null,
      odeyenTelefon: null,
      hareketler: [],
    },
  ];

  const paketler: Paket[] = [
    { id: 'paket-8', ad: '8 ders paketi', krediAdedi: 8, fiyatKurus: 320000, gecerlilikGun: 90 },
    {
      id: 'paket-12',
      ad: '12 ders paketi',
      krediAdedi: 12,
      fiyatKurus: 450000,
      gecerlilikGun: 120,
    },
    { id: 'paket-1', ad: 'Tek ders', krediAdedi: 1, fiyatKurus: 45000, gecerlilikGun: null },
  ];

  const gruplar: DersGrubu[] = [
    { id: 'g-elif', ad: 'Elif Kaya', tur: 'birebir', uyeSayisi: 1, ogrenciAd: 'Elif Kaya' },
    { id: 'g-mert', ad: 'Mert Aydın', tur: 'birebir', uyeSayisi: 1, ogrenciAd: 'Mert Aydın' },
    { id: 'g-8a', ad: '8-A Matematik', tur: 'sinif', uyeSayisi: 4, ogrenciAd: null },
  ];
  const grupUyeleri: Record<string, string[]> = {
    'g-elif': ['ogr-elif'],
    'g-mert': ['ogr-mert'],
    'g-8a': ['ogr-elif', 'ogr-zeynep', 'ogr-can', 'uyelik-ogrenci-a'],
  };

  function dersUret(
    grupId: string,
    tarih: string,
    saat: string,
    sureDk: number,
    ek: Partial<MockDers> = {},
  ): MockDers {
    const baslangic = yerelDenUtc(tarih, saat, tz);
    return {
      id: yeniId('ders'),
      grupId,
      seriId: null,
      ogretmenId: 'uyelik-ogretmen-a',
      bransKodu: 'matematik',
      baslik: null,
      baslangic,
      bitis: new Date(Date.parse(baslangic) + sureDk * DAKIKA).toISOString(),
      durum: 'planli',
      iptalNedeni: null,
      seriIstisna: false,
      onlineBaglanti: null,
      yer: null,
      katilimciSayisi: grupUyeleri[grupId]?.length ?? 0,
      surum: 1,
      katilimcilar: grupUyeleri[grupId] ?? [],
      ...ek,
    };
  }

  const seri = 'seri-elif';
  let dersler: MockDers[] = [
    dersUret('g-elif', tarihEkle(bugun, -1), '16:00', 60, { yer: 'Evde' }),
    dersUret('g-8a', tarihEkle(bugun, -1), '18:00', 60, { baslik: 'Denklemler' }),
    dersUret('g-8a', bugun, '08:00', 90, { baslik: 'Üslü sayılar' }),
    dersUret('g-mert', bugun, '11:00', 60, {
      onlineBaglanti: 'https://meet.example.com/mert-matematik',
    }),
    dersUret('g-8a', bugun, '15:00', 60),
    dersUret('g-elif', tarihEkle(bugun, 1), '16:00', 60, { seriId: seri, yer: 'Evde' }),
    dersUret('g-elif', tarihEkle(bugun, 8), '16:00', 60, { seriId: seri, yer: 'Evde' }),
    dersUret('g-elif', tarihEkle(bugun, 15), '16:00', 60, { seriId: seri, yer: 'Evde' }),
    dersUret('g-8a', tarihEkle(bugun, 2), '10:00', 60, {
      onlineBaglanti: 'https://meet.example.com/8a-matematik',
    }),
  ];
  const yoklamalar = new Map<string, YoklamaDurumu>();
  /** Yalniz "ogrenciye gorunsun" notlari ogrenci rolunde dondurulur. */
  const yoklamaNotlari = new Map<string, { metin: string; gorunur: boolean }>();
  const yoklamaYanitlari = new Map<string, { dersId: string; sonuclar: unknown[] }>();
  const tahsilatAnahtarlari = new Set<string>();

  function ogrenciAdi(id: string): string {
    return ogrenciler.find((o) => o.id === id)?.ad ?? '';
  }

  function gorunenDers(d: MockDers): Ders {
    const { katilimcilar: _k, ...ders } = d;
    return ders;
  }

  function aktifOgrenciMi() {
    const id = sec.aktifUyelikId();
    return id?.startsWith('uyelik-ogrenci') ? id : null;
  }

  async function gecik(ms = sec.gecikmeMs) {
    await sec.bekle(ms);
    await sec.oturumGerekli();
  }

  function cakisanlar(grupId: string, baslangic: string, bitis: string, haric?: Set<string>) {
    return dersler.filter(
      (d) =>
        d.durum === 'planli' &&
        !haric?.has(d.id) &&
        Date.parse(d.baslangic) < Date.parse(bitis) &&
        Date.parse(d.bitis) > Date.parse(baslangic) &&
        grupId !== '',
    );
  }

  function cakismaHatasi(c: MockDers[]): ApiHata {
    return new ApiHata('cakisma', 'Öğretmenin bu saatte başka dersi var.', {
      durum: 409,
      ayrinti: 'ders_cakismasi',
      detay: {
        cakisanlar: c.map((d) => ({
          id: d.id,
          grup_id: d.grupId,
          baslik: d.baslik,
          baslangic_at: d.baslangic,
          bitis_at: d.bitis,
        })),
      },
    });
  }

  function ogrenciCakisiyorMu(grupId: string, baslangic: string, bitis: string) {
    const uyeler = grupUyeleri[grupId] ?? [];
    return dersler.some(
      (d) =>
        d.durum === 'planli' &&
        d.katilimcilar.some((k) => uyeler.includes(k)) &&
        Date.parse(d.baslangic) < Date.parse(bitis) &&
        Date.parse(d.bitis) > Date.parse(baslangic),
    );
  }

  const ders: DersAdapter = {
    async saatDilimi() {
      await gecik(sec.gecikmeMs / 4);
      return tz;
    },

    async dersler(baslangic, bitis) {
      await gecik();
      const ben = aktifOgrenciMi();
      return dersler
        .filter(
          (d) =>
            Date.parse(d.baslangic) >= Date.parse(baslangic) &&
            Date.parse(d.baslangic) < Date.parse(bitis) &&
            (!ben || d.katilimcilar.includes(ben)),
        )
        .sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic))
        .map(gorunenDers);
    },

    async gruplar() {
      await gecik();
      return gruplar.map((g) => ({ ...g }));
    },

    async dersOlustur(g) {
      await gecik();
      const grup = gruplar.find((x) => x.id === g.grupId);
      if (!grup) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      // Mert'in ogretmeni iki branstan atanmis: brans sorulur.
      if (g.grupId === 'g-mert' && !g.bransKodu) {
        throw new ApiHata('dogrulama', 'Branş seçmelisin.', {
          durum: 422,
          ayrinti: 'brans_gerekli',
        });
      }
      const tarihler = g.haftalik ? [] : [g.tarih];
      if (g.haftalik) {
        const son = g.bitisTarihi ?? tarihEkle(g.tarih, 12 * 7 - 1);
        for (let t = g.tarih; t <= son && tarihler.length < 52; t = tarihEkle(t, 7))
          tarihler.push(t);
      }
      const adaylar = tarihler.map((t) => {
        const baslangic = yerelDenUtc(t, g.saat, tz);
        return {
          t,
          baslangic,
          bitis: new Date(Date.parse(baslangic) + g.sureDk * DAKIKA).toISOString(),
        };
      });
      const cakisan = new Map<string, MockDers>();
      for (const a of adaylar) {
        for (const c of cakisanlar(g.grupId, a.baslangic, a.bitis)) cakisan.set(c.id, c);
      }
      if (cakisan.size > 0 && !g.cakismaOnayli) throw cakismaHatasi([...cakisan.values()]);
      const seriId = g.haftalik ? yeniId('seri') : null;
      const yeni = adaylar.map((a) =>
        dersUret(g.grupId, a.t, g.saat, g.sureDk, {
          seriId,
          bransKodu: g.bransKodu ?? 'matematik',
          baslik: g.baslik ?? null,
          onlineBaglanti: g.onlineBaglanti ?? null,
          yer: g.yer ?? null,
        }),
      );
      dersler = [...dersler, ...yeni];
      const ogrCak = adaylar.some((a) => ogrenciCakisiyorMu(g.grupId, a.baslangic, a.bitis));
      return {
        dersler: yeni.map(gorunenDers),
        cakisanlar: [...cakisan.values()].map((d) => ({
          id: d.id,
          grupId: d.grupId,
          baslik: d.baslik,
          baslangic: d.baslangic,
          bitis: d.bitis,
        })),
        ogrenciCakismasi: ogrCak,
        atlanan: 0,
      };
    },

    async dersTasi(d, g) {
      await gecik();
      const hedef = dersler.find((x) => x.id === d.id);
      if (!hedef) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      const etkilenen =
        g.kapsam === 'bu_ve_sonrakiler' && hedef.seriId
          ? dersler.filter(
              (x) =>
                x.seriId === hedef.seriId &&
                x.durum === 'planli' &&
                Date.parse(x.baslangic) >= Date.parse(hedef.baslangic),
            )
          : [hedef];
      const yeniAralik = (x: MockDers) => {
        const tarih = g.yeniTarih ?? yerelTarih(x.baslangic, tz);
        const saat = g.yeniSaat ?? yerelSaat(x.baslangic, tz);
        const sure = Date.parse(x.bitis) - Date.parse(x.baslangic);
        const baslangic = yerelDenUtc(
          g.kapsam === 'bu_ve_sonrakiler' ? yerelTarih(x.baslangic, tz) : tarih,
          saat,
          tz,
        );
        return { baslangic, bitis: new Date(Date.parse(baslangic) + sure).toISOString() };
      };
      const haric = new Set(etkilenen.map((x) => x.id));
      const cak = new Map<string, MockDers>();
      for (const x of etkilenen) {
        const a = yeniAralik(x);
        for (const c of cakisanlar(x.grupId, a.baslangic, a.bitis, haric)) cak.set(c.id, c);
      }
      if (cak.size > 0 && !g.cakismaOnayli) throw cakismaHatasi([...cak.values()]);
      dersler = dersler.map((x) => {
        if (!haric.has(x.id)) return x;
        const a = yeniAralik(x);
        return {
          ...x,
          ...a,
          surum: x.surum + 1,
          seriId: g.kapsam === 'yalniz_bu' ? null : x.seriId,
          seriIstisna: g.kapsam === 'yalniz_bu' ? true : x.seriIstisna,
        };
      });
      return {
        etkilenen: etkilenen.length,
        ogrenciCakismasi: ogrenciCakisiyorMu(
          hedef.grupId,
          yeniAralik(hedef).baslangic,
          yeniAralik(hedef).bitis,
        ),
      };
    },

    async dersIptal(d, g) {
      await gecik();
      const hedef = dersler.find((x) => x.id === d.id);
      if (!hedef) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (
        g.kaynak === 'ogrenci' &&
        (gruplar.find((x) => x.id === hedef.grupId)?.tur ?? '') !== 'birebir'
      ) {
        throw new ApiHata('dogrulama', undefined, {
          durum: 422,
          ayrinti: 'iptal_kaynagi_gecersiz',
        });
      }
      const etkilenen =
        g.kapsam === 'bu_ve_sonrakiler' && hedef.seriId
          ? dersler.filter(
              (x) =>
                x.seriId === hedef.seriId &&
                x.durum === 'planli' &&
                Date.parse(x.baslangic) >= Date.parse(hedef.baslangic),
            )
          : [hedef];
      const idler = new Set(etkilenen.map((x) => x.id));
      dersler = dersler.map((x) =>
        idler.has(x.id)
          ? { ...x, durum: 'iptal', iptalNedeni: g.neden ?? null, surum: x.surum + 1 }
          : x,
      );
      return { etkilenen: etkilenen.length, ogrenciCakismasi: false };
    },

    async yoklamaBekleyen() {
      await gecik();
      const an = simdi();
      const sonuc: BekleyenYoklamaDersi[] = [];
      for (const d of dersler) {
        if (d.durum !== 'planli' || Date.parse(d.baslangic) > an) continue;
        if (an - Date.parse(d.baslangic) > 14 * 86_400_000) continue;
        const eksik = d.katilimcilar.filter((k) => !yoklamalar.has(`${d.id}:${k}`)).length;
        if (eksik > 0) sonuc.push({ ...gorunenDers(d), yoklamasiEksikSayisi: eksik });
      }
      return sonuc.sort((a, b) => Date.parse(b.baslangic) - Date.parse(a.baslangic));
    },

    async yoklamaKatilimcilari(dersId) {
      await gecik();
      const d = dersler.find((x) => x.id === dersId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      return d.katilimcilar.map((k) => ({
        ogrenciId: k,
        ad: ogrenciAdi(k),
        tur: 'uye' as const,
        durum: yoklamalar.get(`${dersId}:${k}`) ?? null,
        not: (() => {
          const n = yoklamaNotlari.get(`${dersId}:${k}`);
          return n && (n.gorunur || !aktifOgrenciMi()) ? n.metin : null;
        })(),
      }));
    },

    async yoklamaKaydet(dersId, satirlar, istekId) {
      await gecik(sec.gecikmeMs / 2);
      const onceki = yoklamaYanitlari.get(istekId);
      if (onceki) return { dersId: onceki.dersId, sonuclar: onceki.sonuclar as never };
      const d = dersler.find((x) => x.id === dersId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (d.durum === 'iptal') {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'ders_iptal_edildi' });
      }
      if (Date.parse(d.baslangic) > simdi()) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'ders_henuz_baslamadi' });
      }
      for (const s of satirlar) {
        if (!d.katilimcilar.includes(s.ogrenciId)) {
          throw new ApiHata('dogrulama', undefined, {
            durum: 422,
            ayrinti: 'ogrenci_katilimci_degil',
          });
        }
      }
      const sonuclar = satirlar.map((s): YoklamaSonucu => {
        const anahtar = `${dersId}:${s.ogrenciId}`;
        const var_ = yoklamalar.has(anahtar);
        yoklamalar.set(anahtar, s.durum);
        if (s.not) {
          yoklamaNotlari.set(anahtar, { metin: s.not, gorunur: s.notGorunurluk === 'ogrenciye' });
        } else yoklamaNotlari.delete(anahtar);
        const ogr = ogrenciler.find((o) => o.id === s.ogrenciId);
        let kalanKredi: number | null = null;
        if (!var_ && ogr?.model === 'paket' && (s.durum === 'geldi' || s.durum === 'gec')) {
          ogr.kalan -= 1;
          kalanKredi = ogr.kalan;
        }
        return {
          ogrenciId: s.ogrenciId,
          sonuc: var_ ? 'guncellendi' : 'yeni',
          kalanKredi,
        };
      });
      yoklamaYanitlari.set(istekId, { dersId, sonuclar });
      return { dersId, sonuclar };
    },
  };

  const finans: FinansAdapter = {
    async paketler() {
      await gecik();
      return paketler.map((p) => ({ ...p }));
    },

    async ogrenciler() {
      await gecik();
      return {
        ogrenciler: ogrenciler
          .filter((o) => !o.id.startsWith('uyelik-ogrenci'))
          .map((o) => ({
            ogrenciId: o.id,
            ad: o.ad,
            model: o.model,
            kalanKredi: o.kalan,
            bakiyeKurus: o.bakiye,
            borclu: o.bakiye < 0,
          })),
        dusukKrediEsigi: 2,
      };
    },

    async ogrenciKarti(ogrenciId): Promise<OgrenciKarti> {
      await gecik();
      const o = ogrenciler.find((x) => x.id === ogrenciId);
      if (!o) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (aktifOgrenciMi()) {
        // Ogrenci gorunumu: yalniz kalan ders; kurum ayari kapaliysa (b kurumu) null.
        const kapali = sec.aktifUyelikId()?.endsWith('-b') === true;
        return { gorunum: 'ogrenci', ogrenciId, kalanKredi: kapali ? null : o.kalan };
      }
      return {
        gorunum: 'tam',
        ogrenciId,
        model: o.model,
        kalanKredi: o.kalan,
        dusukKrediEsigi: 2,
        bakiyeKurus: o.bakiye,
        borclu: o.bakiye < 0,
        etkinPaketler:
          o.model === 'paket' && o.kalan > 0
            ? [
                {
                  id: `satis-${o.id}`,
                  ad: '8 ders paketi',
                  toplamKredi: 8,
                  kalanKredi: o.kalan,
                  bitisTarihi: tarihEkle(bugun, 60),
                },
              ]
            : [],
        hareketler: [...o.hareketler].reverse(),
        odeyenAd: o.odeyenAd,
        odeyenTelefon: o.odeyenTelefon,
      };
    },

    async paketSat(g) {
      await gecik();
      const o = ogrenciler.find((x) => x.id === g.ogrenciId);
      const p = paketler.find((x) => x.id === g.paketId);
      if (!o || !p) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (o.model !== 'paket') {
        throw new ApiHata('cakisma', undefined, {
          durum: 409,
          ayrinti: 'ogrenci_modeli_paket_degil',
        });
      }
      if (g.odeme.tur === 'kismi' && g.odeme.tutarKurus >= p.fiyatKurus) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'odeme_gecersiz' });
      }
      const odenen =
        g.odeme.tur === 'tamami' ? p.fiyatKurus : g.odeme.tur === 'kismi' ? g.odeme.tutarKurus : 0;
      o.kalan += p.krediAdedi;
      o.bakiye += odenen - p.fiyatKurus;
      const tarih = new Date(simdi()).toISOString();
      o.hareketler.push({
        id: yeniId('h'),
        tur: 'kredi',
        turKodu: 'satin_alma',
        miktar: p.krediAdedi,
        tarih,
      });
      if (odenen > 0) {
        o.hareketler.push({
          id: yeniId('h'),
          tur: 'bakiye',
          turKodu: 'tahsilat',
          miktar: odenen,
          tarih,
        });
      }
      return { kalanKredi: o.kalan, bakiyeKurus: o.bakiye };
    },

    async tahsilatAl(g, istekId) {
      await gecik();
      const o = ogrenciler.find((x) => x.id === g.ogrenciId);
      if (!o) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (tahsilatAnahtarlari.has(istekId)) return { tekrar: true };
      tahsilatAnahtarlari.add(istekId);
      o.bakiye += g.tutarKurus;
      o.hareketler.push({
        id: yeniId('h'),
        tur: 'bakiye',
        turKodu: 'tahsilat',
        miktar: g.tutarKurus,
        tarih: new Date(simdi()).toISOString(),
      });
      return { tekrar: false };
    },
  };

  return { ders, finans };
}
