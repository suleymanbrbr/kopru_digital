import { tarihEkle, yerelTarih } from '../lib/saat';
import { haftaBaslangici } from '../ogrenme/hafta';
import {
  BANT_EN_AZ_SORU,
  GUNLUK_SORU_EN_FAZLA_FOTOGRAF,
  GUNLUK_SORU_EN_FAZLA_TOPLAM,
  ZORLUKLAR,
  type Analiz,
  type AnalizZorlugu,
  type BantDegisimi,
  type BantTespiti,
  type GunlukKayit,
  type GunlukSoruAdapter,
  type Hucre,
  type HucreKaydi,
  type KaynakKitap,
  type KaynakKitapDetayi,
  type KonuAnalizi,
  type Oneri,
  type Zorluk,
} from './gunlukSoruTipleri';
import { konuTohumu } from './mockOgrenme';
import { MOCK_SAAT_DILIMI, type MockOperasyonSecenekleri } from './mockOperasyon';
import type { OgrenmeAdapter } from './ogrenmeTipleri';
import { ApiHata } from './tipler';

/** Analizdeki esikler (api `gunluk-soru-bant.ts` ile ayni degerler; yalniz mock hesabi icin). */
const DUSUS = 0.2;
const DUSUK_BASARI = 0.7;
const MUTLAK = 0.5;
const GOREV_SORU = 20;
const BIREBIR_ESIK = 0.3;
const BIREBIR_HAFTA_EN_AZ = 5;
const BIREBIR_DUZELME = 0.1;

const PERSONEL_OGRENCILERI = new Set(['ogr-elif', 'ogr-zeynep', 'ogr-can', 'ogr-mert']);
const DENIZ = 'uyelik-ogrenci-a';

interface MockKayit extends GunlukKayit {
  istekId: string | null;
}

const basari = (dogru: number, cozulen: number): number | null =>
  cozulen <= 0 ? null : Math.round((dogru / cozulen) * 1000) / 1000;

const bosHucre = (): Hucre => ({ cozulen: 0, dogru: 0, yanlis: 0, bos: 0, basari: null });

function hucreEkle(h: Hucre, k: { dogru: number; yanlis: number; bos: number }) {
  h.dogru += k.dogru;
  h.yanlis += k.yanlis;
  h.bos += k.bos;
  h.cozulen += k.dogru + k.yanlis + k.bos;
  h.basari = basari(h.dogru, h.cozulen);
}

/** Api `bantTespit` kuralinin ayni calismasi (mock verisinde "kolay %90 / orta %60 / zor %25" gorunsun). */
export function bantTespitEt(bantlar: Record<Zorluk, Hucre>): BantTespiti {
  const basarilar: Record<Zorluk, number | null> = { kolay: null, orta: null, zor: null };
  const yeterli: { bant: Zorluk; basari: number }[] = [];
  for (const b of ZORLUKLAR) {
    const h = bantlar[b];
    if (h.cozulen >= BANT_EN_AZ_SORU) {
      const o = basari(h.dogru, h.cozulen) ?? 0;
      basarilar[b] = o;
      yeterli.push({ bant: b, basari: o });
    }
  }
  const sonuc = (durum: BantTespiti['durum'], bant: Zorluk | null): BantTespiti => ({
    durum,
    bant,
    bantBasarilari: basarilar,
  });
  const ilk = yeterli[0];
  if (!ilk) return sonuc('veri_az', null);
  if (ilk.bant !== 'zor' && ilk.basari < MUTLAK) return sonuc('zorlaniyor', ilk.bant);
  if (yeterli.length === 1) return sonuc('veri_az', null);
  for (let i = 1; i < yeterli.length; i += 1) {
    const once = yeterli[i - 1];
    const bu = yeterli[i];
    if (once && bu && once.basari - bu.basari >= DUSUS - 1e-9 && bu.basari < DUSUK_BASARI) {
      return sonuc('zorlaniyor', bu.bant);
    }
  }
  return sonuc('tespit_yok', null);
}

function derece(t: BantTespiti): number | null {
  if (t.durum === 'veri_az') return null;
  if (t.durum === 'tespit_yok') return 0;
  return t.bant === 'kolay' ? 3 : t.bant === 'orta' ? 2 : 1;
}

function degisim(onceki: BantTespiti, simdiki: BantTespiti): BantDegisimi {
  const a = derece(onceki);
  const b = derece(simdiki);
  if (a === null || b === null) return 'belirsiz';
  return b < a ? 'iyilesti' : b > a ? 'kotulesti' : 'ayni';
}

/**
 * Backend olmadan calisan gunluk soru adaptoru. Ogrenci kayit girer, ogretmen ayni bellek ici
 * kayitlardan hesaplanan analizi gorur (bant ve oneri kurallari apideki gibi). `ogrenme`: "gorev ver"
 * ogrencinin planina gercekten gorev yazsin diye mock plan adaptoru.
 */
export function mockGunlukSoru(
  sec: MockOperasyonSecenekleri,
  ogrenme: OgrenmeAdapter,
): GunlukSoruAdapter {
  const simdi = sec.simdi ?? (() => Date.now());
  const tz = MOCK_SAAT_DILIMI;
  const bugun = () => yerelTarih(simdi(), tz);
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;
  const kopya = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const konular = konuTohumu();
  const konuBul = (id: string) => konular.find((k) => k.id === id);

  async function gecik() {
    await sec.bekle(sec.gecikmeMs);
    await sec.oturumGerekli();
  }
  const ogrenciKimligi = () => {
    const id = sec.aktifUyelikId();
    return id?.startsWith('uyelik-ogrenci') ? id : null;
  };
  function ogrenciOlmali(): string {
    const id = ogrenciKimligi();
    if (!id) throw new ApiHata('izin_yok', undefined, { durum: 403, ayrinti: 'izin_yok' });
    return id;
  }
  function personelOlmali(ogrenciId: string) {
    if (ogrenciKimligi()) throw new ApiHata('izin_yok', undefined, { durum: 403 });
    if (!PERSONEL_OGRENCILERI.has(ogrenciId) && ogrenciId !== DENIZ) {
      throw new ApiHata('bulunamadi', undefined, { durum: 404 });
    }
  }
  const bulunamadi = () => new ApiHata('bulunamadi', undefined, { durum: 404 });
  const dogrulama = (kod: string) =>
    new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: kod });
  const cakisma = (kod: string) => new ApiHata('cakisma', undefined, { durum: 409, ayrinti: kod });

  // --- Kaynak kitap tohumu -------------------------------------------------------------------
  const kitaplar: KaynakKitapDetayi[] = [
    kitapUret('kitap-esen', 'Esen Soru Bankası', 'Esen Yayınları', 'matematik', [
      ['Test 1: Üslü sayılar', 20, 'konu-m-uslu'],
      ['Test 2: Üslü sayılar', 20, 'konu-m-uslu'],
      ['Test 3: Kareköklü sayılar', 15, 'konu-m-koklu'],
      ['Test 4: Denklemler', 20, 'konu-m-denklem'],
    ]),
    kitapUret('kitap-fen', 'Fen Bilimleri Testleri', 'Işık Yayınları', 'fen_bilimleri', [
      ['Test 1: Işığın yayılması', 12, 'konu-f-yayilma'],
      ['Test 2: Sesin özellikleri', 12, 'konu-f-ses'],
    ]),
  ];

  function kitapUret(
    id: string,
    ad: string,
    yayinevi: string,
    bransKodu: string,
    testler: [string, number, string][],
  ): KaynakKitapDetayi {
    return {
      id,
      ad,
      yayinevi,
      bransKodu,
      aktif: true,
      testSayisi: testler.length,
      toplamSoru: testler.reduce((a, t) => a + t[1], 0),
      ilerleme: null,
      testler: testler.map(([tad, n, konuId], i) => ({
        id: `${id}-t${String(i + 1)}`,
        kitapId: id,
        sira: i + 1,
        ad: tad,
        soruSayisi: n,
        konuId,
        cozulduGun: null,
      })),
    };
  }

  // --- Kayit tohumu --------------------------------------------------------------------------
  const kayitlar: MockKayit[] = [];

  function ekle(
    ogrenciId: string,
    gunOnce: number,
    konuId: string,
    zorluk: Zorluk,
    dogru: number,
    yanlis: number,
    bos = 0,
    ek: Partial<MockKayit> = {},
  ): MockKayit {
    const k = konuBul(konuId);
    const gun = tarihEkle(bugun(), -gunOnce);
    const kayit: MockKayit = {
      id: yeniId('gk'),
      ogrenciId,
      gun,
      bransKodu: k?.bransKodu ?? 'matematik',
      konuId,
      konuAd: k?.ad ?? null,
      zorluk,
      kaynakTestId: null,
      kaynakKitapId: null,
      kaynakMetin: null,
      dogru,
      yanlis,
      bos,
      toplam: dogru + yanlis + bos,
      planGorevId: null,
      dosyalar: [],
      duzenlenebilir: gunOnce === 0,
      surum: 1,
      olusturma: new Date(simdi() - gunOnce * 86_400_000 - sayac * 1000).toISOString(),
      istekId: null,
      ...ek,
    };
    kayitlar.push(kayit);
    return kayit;
  }

  // Elif: Uslu sayilar "kolay %90 / orta %60 / zor %25" -> orta seviyede zorlaniyor.
  ekle('ogr-elif', 12, 'konu-m-uslu', 'kolay', 9, 1, 0, { kaynakMetin: 'Okul fasikülü' });
  ekle('ogr-elif', 9, 'konu-m-uslu', 'kolay', 9, 1);
  ekle('ogr-elif', 8, 'konu-m-uslu', 'orta', 6, 4, 0, {
    kaynakTestId: 'kitap-esen-t1',
    kaynakKitapId: 'kitap-esen',
  });
  ekle('ogr-elif', 6, 'konu-m-uslu', 'orta', 6, 3, 1);
  ekle('ogr-elif', 3, 'konu-m-uslu', 'zor', 3, 6, 1, { dosyalar: ['dosya-elif-1'] });
  ekle('ogr-elif', 2, 'konu-m-uslu', 'zor', 2, 7, 1);
  // Elif: Denklemler zor bantta %17 ve duzelmiyor -> birebir ders gerekebilir.
  ekle('ogr-elif', 12, 'konu-m-denklem', 'kolay', 12, 1, 0);
  ekle('ogr-elif', 11, 'konu-m-denklem', 'orta', 8, 4, 0);
  ekle('ogr-elif', 10, 'konu-m-denklem', 'zor', 1, 5, 0);
  ekle('ogr-elif', 2, 'konu-m-denklem', 'zor', 1, 5, 0);
  // Elif: Kareköklü sayilar yalniz 8 soru -> veri az.
  ekle('ogr-elif', 4, 'konu-m-koklu', 'kolay', 6, 2, 0);
  // Elif: baska ders
  ekle('ogr-elif', 1, 'konu-f-yayilma', 'kolay', 8, 2, 0);
  ekle('ogr-elif', 1, 'konu-f-yayilma', 'orta', 7, 3, 0);
  // Diger ogrenciler (az veri)
  ekle('ogr-zeynep', 2, 'konu-m-uslu', 'kolay', 7, 1, 0);
  ekle('ogr-can', 3, 'konu-m-uslu', 'orta', 3, 7, 0);

  // Deniz (ogrenci rolu): bugun ve gecmis.
  ekle(DENIZ, 0, 'konu-m-uslu', 'orta', 12, 6, 2, {
    kaynakTestId: 'kitap-esen-t2',
    kaynakKitapId: 'kitap-esen',
  });
  ekle(DENIZ, 0, 'konu-f-yayilma', 'kolay', 9, 1, 0, { kaynakMetin: 'Okul testi' });
  ekle(DENIZ, 1, 'konu-m-denklem', 'zor', 4, 8, 0);
  ekle(DENIZ, 1, 'konu-m-denklem', 'kolay', 10, 0, 0);
  ekle(DENIZ, 2, 'konu-m-uslu', 'kolay', 18, 2, 0);
  ekle(DENIZ, 4, 'konu-m-uslu', 'orta', 5, 7, 0);

  const bekleyenDosyaAdres = (id: string) => `mock://gorsel/${id}`;

  function kitapIlerlemesi(k: KaynakKitapDetayi, ogrenciId: string | null): KaynakKitapDetayi {
    const kopyaK = kopya(k);
    if (!ogrenciId) return kopyaK;
    for (const t of kopyaK.testler) {
      const ilk = kayitlar
        .filter((x) => x.ogrenciId === ogrenciId && x.kaynakTestId === t.id)
        .map((x) => x.gun)
        .sort()[0];
      t.cozulduGun = ilk ?? null;
    }
    kopyaK.ilerleme = {
      cozulenTest: kopyaK.testler.filter((t) => t.cozulduGun).length,
      toplamTest: kopyaK.testler.length,
    };
    return kopyaK;
  }

  function aralik(donem: '7' | '30' | 'donem'): { bas: string; bit: string } {
    const bit = bugun();
    const gun = donem === 'donem' ? 120 : Number(donem);
    return { bas: tarihEkle(bit, -(gun - 1)), bit };
  }

  const aralikta = (k: MockKayit, ogrenciId: string, bas: string, bit: string, brans?: string) =>
    k.ogrenciId === ogrenciId && k.gun >= bas && k.gun <= bit && (!brans || k.bransKodu === brans);

  function analizUret(
    ogrenciId: string,
    bransKodu: string,
    donem: '7' | '30' | 'donem',
    oneriler: boolean,
  ): Analiz {
    const { bas, bit } = aralik(donem);
    const liste = kayitlar.filter((k) => aralikta(k, ogrenciId, bas, bit, bransKodu));
    const haritasi = new Map<string, Record<AnalizZorlugu, Hucre>>();
    const toplam = bosHucre();
    for (const k of liste) {
      let h = haritasi.get(k.konuId);
      if (!h) {
        h = { kolay: bosHucre(), orta: bosHucre(), zor: bosHucre(), belirtilmemis: bosHucre() };
        haritasi.set(k.konuId, h);
      }
      hucreEkle(h[k.zorluk], k);
      hucreEkle(toplam, k);
    }
    const konuAnalizleri: KonuAnalizi[] = [...haritasi.entries()].map(([konuId, hucreler]) => {
      const konu = konuBul(konuId);
      const ust = konu?.ustId ? konuBul(konu.ustId) : undefined;
      const t = bosHucre();
      for (const z of [...ZORLUKLAR, 'belirtilmemis' as const]) {
        hucreEkle(t, hucreler[z]);
      }
      return {
        konuId,
        konuAd: konu?.ad ?? null,
        ustKonuAd: ust?.ad ?? null,
        hucreler,
        toplam: t,
        bant: bantTespitEt(hucreler),
      };
    });
    // Cok soru cozulen konu once.
    konuAnalizleri.sort((a, b) => b.toplam.cozulen - a.toplam.cozulen);
    return {
      ogrenciId,
      bransKodu,
      bas,
      bit,
      konular: konuAnalizleri,
      toplam,
      ...(oneriler ? { oneriler: oneriUret(ogrenciId, bransKodu, konuAnalizleri) } : {}),
    };
  }

  function oneriUret(ogrenciId: string, bransKodu: string, liste: KonuAnalizi[]): Oneri[] {
    const gorevler: Oneri[] = [];
    for (const k of liste) {
      if (k.bant.durum === 'zorlaniyor' && k.bant.bant) {
        gorevler.push({
          tur: 'gorev_oner',
          bransKodu,
          konuId: k.konuId,
          konuAd: k.konuAd,
          zorluk: k.bant.bant,
          soruSayisi: GOREV_SORU,
          basari: k.bant.bantBasarilari[k.bant.bant],
        });
      }
    }
    gorevler.sort((a, b) =>
      a.tur === 'gorev_oner' && b.tur === 'gorev_oner' ? (a.basari ?? 1) - (b.basari ?? 1) : 0,
    );
    const sonHaftaBas = tarihEkle(bugun(), -6);
    const pencereBas = tarihEkle(bugun(), -13);
    const birebir: Oneri[] = [];
    for (const konuId of new Set(liste.map((k) => k.konuId))) {
      const zorlar = kayitlar.filter(
        (k) =>
          aralikta(k, ogrenciId, pencereBas, bugun(), bransKodu) &&
          k.konuId === konuId &&
          k.zorluk === 'zor',
      );
      const onceki = bosHucre();
      const son = bosHucre();
      for (const z of zorlar) hucreEkle(z.gun >= sonHaftaBas ? son : onceki, z);
      const cozulen = onceki.cozulen + son.cozulen;
      const ob = basari(onceki.dogru + son.dogru, cozulen);
      if (cozulen < BANT_EN_AZ_SORU || ob === null || ob >= BIREBIR_ESIK) continue;
      const ohb = onceki.cozulen >= BIREBIR_HAFTA_EN_AZ ? onceki.basari : null;
      const shb = son.cozulen >= BIREBIR_HAFTA_EN_AZ ? son.basari : null;
      if (ohb !== null && shb !== null && shb - ohb >= BIREBIR_DUZELME - 1e-9) continue;
      birebir.push({
        tur: 'birebir_ders',
        bransKodu,
        konuId,
        konuAd: konuBul(konuId)?.ad ?? null,
        zorBasari: ob,
        oncekiHaftaBasari: ohb,
        sonHaftaBasari: shb,
      });
    }
    return [...birebir, ...gorevler];
  }

  function bantlarHaftada(ogrenciId: string, bas: string): BantTespiti {
    const bit = tarihEkle(bas, 6);
    const h: Record<Zorluk, Hucre> = { kolay: bosHucre(), orta: bosHucre(), zor: bosHucre() };
    for (const k of kayitlar) if (aralikta(k, ogrenciId, bas, bit)) hucreEkle(h[k.zorluk], k);
    return bantTespitEt(h);
  }

  function gunKontrol(gun: string | undefined): string {
    const b = bugun();
    const g = gun ?? b;
    if (g > b || g < tarihEkle(b, -6)) throw dogrulama('gun_gecersiz');
    return g;
  }

  function konuKontrol(bransKodu: string, konuId: string) {
    const k = konuBul(konuId);
    if (k?.bransKodu !== bransKodu) throw dogrulama('konu_gecersiz');
    return k;
  }

  function kaynakKontrol(testId: string | null | undefined, bransKodu: string) {
    if (!testId) return null;
    const kitap = kitaplar.find((x) => x.testler.some((t) => t.id === testId));
    if (kitap?.bransKodu !== bransKodu) throw dogrulama('kaynak_testi_gecersiz');
    return kitap.id;
  }

  function ayarla(k: MockKayit) {
    k.toplam = k.dogru + k.yanlis + k.bos;
    k.duzenlenebilir = k.gun === bugun();
  }

  function toplamKontrol(d: number, y: number, b: number) {
    const t = d + y + b;
    if (t < 1 || t > GUNLUK_SORU_EN_FAZLA_TOPLAM) throw dogrulama('soru_toplami_gecersiz');
  }

  const disariVer = (k: MockKayit): GunlukKayit => {
    ayarla(k);
    const { istekId: _i, ...d } = k;
    return kopya(d);
  };

  return {
    async kayitOlustur(g) {
      await gecik();
      const id = ogrenciOlmali();
      const mevcut = g.istekId
        ? kayitlar.find((k) => k.ogrenciId === id && k.istekId === g.istekId)
        : undefined;
      if (mevcut) return { kayit: disariVer(mevcut), yeni: false };
      const gun = gunKontrol(g.gun);
      const konu = konuKontrol(g.bransKodu, g.konuId);
      toplamKontrol(g.dogru, g.yanlis, g.bos);
      if (g.kaynakTestId && g.kaynakMetin) throw dogrulama('validation_error');
      if (g.dosyaIdleri.length > GUNLUK_SORU_EN_FAZLA_FOTOGRAF) throw dogrulama('validation_error');
      const kitapId = kaynakKontrol(g.kaynakTestId, g.bransKodu);
      const kayit: MockKayit = {
        id: yeniId('gk'),
        ogrenciId: id,
        gun,
        bransKodu: g.bransKodu,
        konuId: g.konuId,
        konuAd: konu.ad,
        zorluk: g.zorluk,
        kaynakTestId: g.kaynakTestId ?? null,
        kaynakKitapId: kitapId,
        kaynakMetin: g.kaynakMetin ?? null,
        dogru: g.dogru,
        yanlis: g.yanlis,
        bos: g.bos,
        toplam: g.dogru + g.yanlis + g.bos,
        planGorevId: g.planGorevId ?? null,
        dosyalar: [...g.dosyaIdleri],
        duzenlenebilir: true,
        surum: 1,
        olusturma: new Date(simdi()).toISOString(),
        istekId: g.istekId,
      };
      kayitlar.push(kayit);
      if (kayit.planGorevId) await gorevYaz(kayit.planGorevId, kayit.toplam);
      return { kayit: disariVer(kayit), yeni: true };
    },

    async kayitDuzelt(id, g) {
      await gecik();
      const ogr = ogrenciOlmali();
      const k = kayitlar.find((x) => x.id === id && x.ogrenciId === ogr);
      if (!k) throw bulunamadi();
      ayarla(k);
      if (!k.duzenlenebilir) throw cakisma('kayit_duzenlenemez');
      if (g.surum !== undefined && g.surum !== k.surum) throw cakisma('surum_cakismasi');
      const brans = g.bransKodu ?? k.bransKodu;
      const konuId = g.konuId ?? k.konuId;
      const konu = konuKontrol(brans, konuId);
      const dogru = g.dogru ?? k.dogru;
      const yanlis = g.yanlis ?? k.yanlis;
      const bos = g.bos ?? k.bos;
      toplamKontrol(dogru, yanlis, bos);
      const eskiToplam = k.toplam;
      k.bransKodu = brans;
      k.konuId = konuId;
      k.konuAd = konu.ad;
      k.zorluk = g.zorluk ?? k.zorluk;
      if (g.kaynakTestId !== undefined) {
        k.kaynakTestId = g.kaynakTestId;
        k.kaynakKitapId = kaynakKontrol(g.kaynakTestId, brans);
        if (g.kaynakTestId) k.kaynakMetin = null;
      }
      if (g.kaynakMetin !== undefined) {
        k.kaynakMetin = g.kaynakMetin;
        if (g.kaynakMetin) {
          k.kaynakTestId = null;
          k.kaynakKitapId = null;
        }
      }
      k.dogru = dogru;
      k.yanlis = yanlis;
      k.bos = bos;
      if (g.dosyaIdleri !== undefined) k.dosyalar = [...g.dosyaIdleri];
      k.surum += 1;
      ayarla(k);
      if (k.planGorevId && k.toplam !== eskiToplam) {
        await gorevYaz(k.planGorevId, k.toplam - eskiToplam);
      }
      return disariVer(k);
    },

    async kayitSil(id) {
      await gecik();
      const ogr = ogrenciOlmali();
      const k = kayitlar.find((x) => x.id === id && x.ogrenciId === ogr);
      if (!k) throw bulunamadi();
      ayarla(k);
      if (!k.duzenlenebilir) throw cakisma('kayit_duzenlenemez');
      kayitlar.splice(kayitlar.indexOf(k), 1);
      if (k.planGorevId) await gorevYaz(k.planGorevId, -k.toplam);
    },

    async kayitlarim(s, imlec) {
      await gecik();
      const id = ogrenciOlmali();
      const bit = s.gun ?? s.bit ?? bugun();
      const bas = s.gun ?? s.bas ?? tarihEkle(bit, -29);
      const hepsi = kayitlar
        .filter((k) => aralikta(k, id, bas, bit, s.bransKodu))
        .sort((a, b) => b.olusturma.localeCompare(a.olusturma));
      const bas0 = imlec ? Number(imlec) : 0;
      const sayfa = hepsi.slice(bas0, bas0 + 50);
      return {
        kayitlar: sayfa.map(disariVer),
        sonrakiImlec: bas0 + 50 < hepsi.length ? String(bas0 + 50) : null,
      };
    },

    async sonKullanilanlar() {
      await gecik();
      const id = ogrenciOlmali();
      const benim = kayitlar
        .filter((k) => k.ogrenciId === id)
        .sort((a, b) => b.olusturma.localeCompare(a.olusturma));
      const dersler = new Map<string, ReturnType<typeof ders>>();
      function ders(bransKodu: string, at: string) {
        return {
          bransKodu,
          sonKullanildi: at,
          konular: [] as { konuId: string; konuAd: string | null; sonZorluk: Zorluk }[],
          kaynaklar: [] as {
            kaynakTestId: string | null;
            kaynakKitapId: string | null;
            kitapAd: string | null;
            testAd: string | null;
            kaynakMetin: string | null;
          }[],
        };
      }
      for (const k of benim) {
        let d = dersler.get(k.bransKodu);
        if (!d) {
          d = ders(k.bransKodu, k.olusturma);
          dersler.set(k.bransKodu, d);
        }
        if (d.konular.length < 5 && !d.konular.some((x) => x.konuId === k.konuId)) {
          d.konular.push({ konuId: k.konuId, konuAd: k.konuAd, sonZorluk: k.zorluk });
        }
        const var_ = k.kaynakTestId !== null || k.kaynakMetin !== null;
        const ayni = d.kaynaklar.some(
          (x) => x.kaynakTestId === k.kaynakTestId && x.kaynakMetin === k.kaynakMetin,
        );
        if (var_ && !ayni && d.kaynaklar.length < 5) {
          const kitap = kitaplar.find((x) => x.id === k.kaynakKitapId);
          const test = kitap?.testler.find((t) => t.id === k.kaynakTestId);
          d.kaynaklar.push({
            kaynakTestId: k.kaynakTestId,
            kaynakKitapId: k.kaynakKitapId,
            kitapAd: kitap?.ad ?? null,
            testAd: test?.ad ?? null,
            kaynakMetin: k.kaynakMetin,
          });
        }
      }
      return { dersler: [...dersler.values()] };
    },

    async kaynakKitaplar(s = {}) {
      await gecik();
      const ogr = ogrenciKimligi();
      const hedef = ogr ?? s.ogrenciId ?? null;
      if (!ogr && s.ogrenciId) personelOlmali(s.ogrenciId);
      return kitaplar
        .filter((k) => (!s.bransKodu || k.bransKodu === s.bransKodu) && (k.aktif || !ogr))
        .map((k): KaynakKitap => {
          const { testler: _t, ...kitap } = kitapIlerlemesi(k, hedef);
          return kitap;
        });
    },

    async kaynakKitap(id, ogrenciId) {
      await gecik();
      const ogr = ogrenciKimligi();
      const k = kitaplar.find((x) => x.id === id);
      if (!k) throw bulunamadi();
      if (!ogr && ogrenciId) personelOlmali(ogrenciId);
      return kitapIlerlemesi(k, ogr ?? ogrenciId ?? null);
    },

    async analiz(s, ogrenciId) {
      await gecik();
      if (ogrenciId) {
        personelOlmali(ogrenciId);
        return analizUret(ogrenciId, s.bransKodu, s.donem, true);
      }
      return analizUret(ogrenciOlmali(), s.bransKodu, s.donem, false);
    },

    async hucre(s, ogrenciId) {
      await gecik();
      let ogr: string;
      if (ogrenciId) {
        personelOlmali(ogrenciId);
        ogr = ogrenciId;
      } else {
        ogr = ogrenciOlmali();
      }
      const { bas, bit } = aralik(s.donem);
      const liste = kayitlar
        .filter(
          (k) =>
            aralikta(k, ogr, bas, bit, s.bransKodu) &&
            k.konuId === s.konuId &&
            (!s.zorluk || k.zorluk === s.zorluk),
        )
        .sort((a, b) => b.olusturma.localeCompare(a.olusturma));
      const hucreKayitlari: HucreKaydi[] = liste.map((k) => ({
        kaynak: 'gunluk',
        id: k.id,
        gun: k.gun,
        zorluk: k.zorluk,
        kaynakAdi: k.kaynakTestId
          ? `${kitaplar.find((x) => x.id === k.kaynakKitapId)?.ad ?? ''} · ${
              kitaplar.flatMap((x) => x.testler).find((t) => t.id === k.kaynakTestId)?.ad ?? ''
            }`
          : k.kaynakMetin,
        dogru: k.dogru,
        yanlis: k.yanlis,
        bos: k.bos,
        toplam: k.toplam,
        dosyalar: k.dosyalar.map((d) => ({ medyaDosyaId: d, adres: bekleyenDosyaAdres(d) })),
      }));
      return {
        ogrenciId: ogr,
        konuId: s.konuId,
        kayitlar: hucreKayitlari,
        fotografAdresleriAlinamadi: false,
      };
    },

    async haftalikOzet(ogrenciId, hafta) {
      await gecik();
      personelOlmali(ogrenciId);
      const bas = haftaBaslangici(hafta ?? bugun());
      const bit = tarihEkle(bas, 6);
      const liste = kayitlar.filter((k) => aralikta(k, ogrenciId, bas, bit));
      const toplam = bosHucre();
      const konuHaritasi = new Map<string, { bransKodu: string; h: Hucre }>();
      for (const k of liste) {
        hucreEkle(toplam, k);
        const m = konuHaritasi.get(k.konuId) ?? { bransKodu: k.bransKodu, h: bosHucre() };
        hucreEkle(m.h, k);
        konuHaritasi.set(k.konuId, m);
      }
      const zayif = [...konuHaritasi.entries()]
        .filter(([, m]) => m.h.cozulen >= 5 && m.h.basari !== null)
        .sort((a, b) => (a[1].h.basari ?? 1) - (b[1].h.basari ?? 1))
        .slice(0, 3)
        .map(([konuId, m]) => ({
          bransKodu: m.bransKodu,
          konuId,
          konuAd: konuBul(konuId)?.ad ?? null,
          cozulen: m.h.cozulen,
          basari: m.h.basari,
        }));
      const onceki = bantlarHaftada(ogrenciId, tarihEkle(bas, -7));
      const simdiki = bantlarHaftada(ogrenciId, bas);
      return {
        ogrenciId,
        haftaBaslangic: bas,
        cozulen: toplam.cozulen,
        dogru: toplam.dogru,
        yanlis: toplam.yanlis,
        bos: toplam.bos,
        basari: toplam.basari,
        enZayifKonular: zayif,
        bant: { onceki, simdiki, degisim: degisim(onceki, simdiki) },
      };
    },

    async gorevVer(ogrenciId, g) {
      await gecik();
      personelOlmali(ogrenciId);
      const konu = konuKontrol(g.bransKodu, g.konuId);
      const baslik = `${konu.ad}: ${g.zorluk} seviyeden ${String(g.soruSayisi)} soru`;
      if (g.tur === 'odev') {
        const odev = await ogrenme.odevVer({
          baslik,
          bransKodu: g.bransKodu,
          konuId: g.konuId,
          tur: 'soru',
          hedefTuru: 'ogrenci',
          hedefId: ogrenciId,
          sonTeslim: new Date(simdi() + 3 * 86_400_000).toISOString(),
          hedefSoruSayisi: g.soruSayisi,
        });
        return { tur: 'odev', odevId: odev.id, sonTeslim: odev.sonTeslim ?? '' };
      }
      const gun = g.gun ?? tarihEkle(bugun(), 1);
      const hafta = haftaBaslangici(gun);
      let detay = await ogrenme.ogrenciPlani(ogrenciId, hafta);
      let yayinda = detay.plan?.durum === 'yayinda';
      if (!detay.plan) {
        detay = await ogrenme.planOlustur(ogrenciId, hafta);
        if (detay.plan) detay = await ogrenme.planYayinla(detay.plan.id);
        yayinda = true;
      }
      if (!detay.plan) throw bulunamadi();
      const gorev = await ogrenme.gorevEkle(detay.plan.id, {
        gun,
        bransKodu: g.bransKodu,
        konuId: g.konuId,
        baslik,
        hedefTuru: 'soru',
        hedefMiktar: g.soruSayisi,
      });
      return {
        tur: 'plan_gorevi',
        planId: detay.plan.id,
        gorevId: gorev.id,
        haftaBaslangic: hafta,
        gun,
        planDurum: yayinda ? 'yayinda' : 'taslak',
      };
    },
  };

  /** Kayda bagli plan gorevinin gerceklesen miktarini degistirir (api ayni islemde yapar). */
  async function gorevYaz(gorevId: string, fark: number) {
    const g = await ogrenme.gorevlerim(bugun());
    const gorev = g.gorevler.find((x) => x.id === gorevId);
    if (!gorev) return;
    await ogrenme.gorevGerceklesen(gorevId, Math.max(0, (gorev.gerceklesen ?? 0) + fark));
  }
}
