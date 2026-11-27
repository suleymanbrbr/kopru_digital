import { tarihEkle, yerelTarih } from '../lib/saat';
import { haftaBaslangici } from '../ogrenme/hafta';
import {
  DONEM_EN_FAZLA_GUN,
  NOT_EN_FAZLA,
  OLCEK_KODLARI,
  YORUM_EN_FAZLA,
  type Degerlendirme,
  type DegerlendirmeAdapter,
  type Kocluk,
  type KaynakOnerisi,
  type KullanilanKitap,
  type Olcekler,
  type OlcekKodu,
  type OgrenciDegerlendirmesi,
  type ZayifKonu,
} from './degerlendirmeTipleri';
import type { Analiz, GunlukKayit, GunlukSoruAdapter, Oneri } from './gunlukSoruTipleri';
import { konuTohumu } from './mockOgrenme';
import { MOCK_SAAT_DILIMI, type MockOperasyonSecenekleri } from './mockOperasyon';
import { ApiHata } from './tipler';

const GUN_MS = 86_400_000;
const SAYFA = 20;
const DUZENLEME_GUN = 7;

/** Mock ogrenci adlari (api `hatirlatma` ve `kocluk` ad alanlari). */
const OGRENCILER: Record<string, string> = {
  'uyelik-ogrenci-a': 'Deniz Yılmaz',
  'ogr-elif': 'Elif Kaya',
  'ogr-zeynep': 'Zeynep Demir',
  'ogr-can': 'Can Özkan',
  'ogr-mert': 'Mert Aydın',
};
const OGRETMEN_A = { id: 'uyelik-ogretmen-a', ad: 'Ayşe Kaya' };
const OGRETMEN_B = { id: 'uyelik-ogretmen-b', ad: 'Mehmet Demir' };

/** Seed'deki gizli yorum: testler ogrencinin bunu hicbir yerde gormedigini denetler. */
export const MOCK_GIZLI_YORUM = 'GIZLI: derste dikkati dağınık, aileyle görüşmek gerekebilir.';
export const MOCK_GORUNUR_YORUM =
  'Üslü sayılarda belirgin ilerleme var; ödevleri zamanında teslim ediyor.';

interface MockDegerlendirme extends Degerlendirme {
  /** Olusturma anı (ms): duzenleme penceresi ve siralama icin. */
  olusturmaMs: number;
}

interface MockOneri extends KaynakOnerisi {
  olusturmaMs: number;
  geriCekildi: boolean;
}

interface Kullanim {
  ogrenciId: string;
  kitapId: string | null;
  testId: string | null;
  metin: string | null;
  soru: number;
  gun: string;
  /** Olusturma anı (ms): "basladi" yalniz oneriden SONRAki kullanimlari sayar. */
  ms: number;
}

const dogrulama = (kod: string) =>
  new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: kod });
const cakisma = (kod: string) => new ApiHata('cakisma', undefined, { durum: 409, ayrinti: kod });
const yasak = () => new ApiHata('izin_yok', undefined, { durum: 403, ayrinti: 'izin_yok' });
const bulunamadi = () => new ApiHata('bulunamadi', undefined, { durum: 404 });

const metinAnahtari = (m: string) => m.trim().toLocaleLowerCase('tr-TR');
const yuvarla = (n: number) => Math.round(n * 10) / 10;

function ortalama(degerler: (number | null)[]): number | null {
  const d = degerler.filter((v): v is number => v !== null);
  return d.length === 0 ? null : yuvarla(d.reduce((a, v) => a + v, 0) / d.length);
}

export interface MockDegerlendirmeSonucu {
  adaptor: DegerlendirmeAdapter;
  /** Ogrenci gunluk kayit actiginda cagrilir: "basladi" ve kullanilan kaynaklar buradan beslenir. */
  kullanimKaydet: (kayit: GunlukKayit) => void;
}

/**
 * Backend olmadan calisan degerlendirme, kaynak onerisi ve kocluk adaptoru. Senaryo: iki ogretmen
 * (Ayse = etkin ogretmen, Mehmet) ayni ogrenci (Deniz) icin yazmistir; Ayse'nin yorumu ogrenciye
 * gorunur, Mehmet'inki gizlidir. Ogrenci yaniti AYRI bir donusumden gecer: gorunur olmayan kayit
 * ogrenci rolune hicbir kosulda donmez (api'nin uc katmanli kilidinin mock karsiligi).
 */
export function mockDegerlendirme(
  sec: MockOperasyonSecenekleri,
  gunlukSoru: GunlukSoruAdapter,
): MockDegerlendirmeSonucu {
  const simdi = sec.simdi ?? (() => Date.now());
  const bugun = () => yerelTarih(simdi(), MOCK_SAAT_DILIMI);
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;
  const konular = konuTohumu();
  const konuAdi = (id: string | null) =>
    id ? (konular.find((k) => k.id === id)?.ad ?? null) : null;

  async function gecik() {
    await sec.bekle(sec.gecikmeMs);
    await sec.oturumGerekli();
  }
  const aktif = () => sec.aktifUyelikId();
  const ogrenciMi = () => !!aktif()?.startsWith('uyelik-ogrenci');
  function personelOlmali() {
    if (ogrenciMi()) throw yasak();
  }
  function ogrenciOlmali(): string {
    const id = aktif();
    if (!id?.startsWith('uyelik-ogrenci')) throw yasak();
    return id;
  }
  function kapsamdaOgrenci(ogrenciId: string) {
    personelOlmali();
    if (!(ogrenciId in OGRENCILER)) throw bulunamadi();
  }

  // --- Tohum ---------------------------------------------------------------------------------
  const degerlendirmeler: MockDegerlendirme[] = [];
  const oneriler: MockOneri[] = [];
  const kullanimlar: Kullanim[] = [];

  function degerlendirmeEkle(
    ogrenciId: string,
    yazar: { id: string; ad: string },
    gunOnce: number,
    donemBas: string,
    donemBit: string,
    olcekler: [number | null, number | null, number | null, number | null],
    yorum: string | null,
    ogrenciGorur: boolean,
    bransKodu: string | null,
  ) {
    const ms = simdi() - gunOnce * GUN_MS;
    degerlendirmeler.push({
      id: yeniId('dg'),
      ogrenciId,
      yazarId: yazar.id,
      yazarAd: yazar.ad,
      benim: false,
      bransKodu,
      donemBaslangic: donemBas,
      donemBitis: donemBit,
      olcekler: {
        calisma_duzeni: olcekler[0],
        derse_katilim: olcekler[1],
        odev_disiplini: olcekler[2],
        anlama_duzeyi: olcekler[3],
      },
      yorum,
      ogrenciGorur,
      duzenlenebilir: false,
      duzenlemeSon: new Date(ms + DUZENLEME_GUN * GUN_MS).toISOString(),
      geriCekildi: false,
      surum: 1,
      olusturma: new Date(ms).toISOString(),
      olusturmaMs: ms,
    });
  }

  const hafta = haftaBaslangici(bugun());
  const DENIZ = 'uyelik-ogrenci-a';
  // En eskiden yeniye: Ayse (gizli, 2 hafta once), Ayse (gorunur, gecen hafta), Mehmet (gizli, bu hafta).
  degerlendirmeEkle(
    DENIZ,
    OGRETMEN_A,
    16,
    tarihEkle(hafta, -14),
    tarihEkle(hafta, -8),
    [3, 3, 2, 3],
    'Önceki dönem: ödev düzeni oturmadı, sonra toparlandı.',
    false,
    'matematik',
  );
  degerlendirmeEkle(
    DENIZ,
    OGRETMEN_A,
    5,
    tarihEkle(hafta, -7),
    tarihEkle(hafta, -1),
    [4, 4, 3, 4],
    MOCK_GORUNUR_YORUM,
    true,
    'matematik',
  );
  degerlendirmeEkle(
    DENIZ,
    OGRETMEN_B,
    1,
    hafta,
    tarihEkle(hafta, 6),
    [3, 2, 3, 2],
    MOCK_GIZLI_YORUM,
    false,
    'fen_bilimleri',
  );
  degerlendirmeEkle(
    'ogr-elif',
    OGRETMEN_B,
    8,
    tarihEkle(hafta, -7),
    tarihEkle(hafta, -1),
    [5, 4, null, 5],
    'Elif derslere hazırlıklı geliyor.',
    false,
    null,
  );

  function oneriEkle(
    o: Partial<MockOneri> & Pick<MockOneri, 'tur' | 'onerenId' | 'onerenAd'>,
    gunOnce: number,
  ) {
    const ms = simdi() - gunOnce * GUN_MS;
    oneriler.push({
      id: yeniId('on'),
      ogrenciId: DENIZ,
      benim: false,
      kaynakKitapId: null,
      kaynakKitapAd: null,
      kaynakTestId: null,
      kaynakTestAd: null,
      baglantiUrl: null,
      baslik: null,
      bransKodu: null,
      konuId: null,
      konuAd: null,
      notMetni: null,
      basladi: null,
      ilkKullanimGun: null,
      sonKullanimGun: null,
      kayitSayisi: 0,
      olusturma: new Date(ms).toISOString(),
      olusturmaMs: ms,
      geriCekildi: false,
      ...o,
    });
  }
  oneriEkle(
    {
      tur: 'kaynak_kitap',
      onerenId: OGRETMEN_A.id,
      onerenAd: OGRETMEN_A.ad,
      kaynakKitapId: 'kitap-esen',
      kaynakKitapAd: 'Esen Soru Bankası',
      bransKodu: 'matematik',
      konuId: 'konu-m-uslu',
      konuAd: konuAdi('konu-m-uslu'),
    },
    8,
  );
  oneriEkle(
    {
      tur: 'kaynak_kitap_testi',
      onerenId: OGRETMEN_B.id,
      onerenAd: OGRETMEN_B.ad,
      kaynakKitapId: 'kitap-esen',
      kaynakKitapAd: 'Esen Soru Bankası',
      kaynakTestId: 'kitap-esen-t3',
      kaynakTestAd: 'Test 3: Kareköklü sayılar',
      bransKodu: 'matematik',
      konuId: 'konu-m-koklu',
      konuAd: konuAdi('konu-m-koklu'),
      notMetni: 'Önce ilk 10 soruyu çöz.',
    },
    2,
  );
  oneriEkle(
    {
      tur: 'link',
      onerenId: OGRETMEN_A.id,
      onerenAd: OGRETMEN_A.ad,
      baslik: 'Üslü sayılar konu anlatımı',
      baglantiUrl: 'https://example.com/uslu-sayilar',
    },
    4,
  );

  const kullanimEkle = (k: Omit<Kullanim, 'ms'> & { gunOnce: number }) => {
    const { gunOnce, ...ek } = k;
    kullanimlar.push({ ...ek, ms: simdi() - gunOnce * GUN_MS });
  };
  kullanimEkle({
    ogrenciId: DENIZ,
    kitapId: 'kitap-esen',
    testId: 'kitap-esen-t1',
    metin: null,
    soru: 20,
    gun: tarihEkle(bugun(), -6),
    gunOnce: 6,
  });
  kullanimEkle({
    ogrenciId: DENIZ,
    kitapId: 'kitap-esen',
    testId: 'kitap-esen-t2',
    metin: null,
    soru: 20,
    gun: tarihEkle(bugun(), -3),
    gunOnce: 3,
  });
  kullanimEkle({
    ogrenciId: DENIZ,
    kitapId: null,
    testId: null,
    metin: 'Okul fasikülü',
    soru: 12,
    gun: tarihEkle(bugun(), -10),
    gunOnce: 10,
  });

  // --- Yardimcilar ---------------------------------------------------------------------------
  function disariVer(d: MockDegerlendirme): Degerlendirme {
    const benim = d.yazarId === aktif();
    const { olusturmaMs, ...ac } = d;
    return {
      ...ac,
      benim,
      duzenlenebilir: benim && !d.geriCekildi && simdi() < olusturmaMs + DUZENLEME_GUN * GUN_MS,
    };
  }

  /** Ogrenci donusumu: alan listesi acik (kopyalama degil) ki gorunurluk/yazar kimligi sizmasin. */
  function ogrenciyeVer(d: MockDegerlendirme): OgrenciDegerlendirmesi {
    return {
      id: d.id,
      yazarAd: d.yazarAd,
      bransKodu: d.bransKodu,
      donemBaslangic: d.donemBaslangic,
      donemBitis: d.donemBitis,
      olcekler: { ...d.olcekler },
      yorum: d.yorum,
      olusturma: d.olusturma,
    };
  }

  function oneriDurumu(o: MockOneri): KaynakOnerisi {
    const { olusturmaMs } = o;
    const ac: Partial<MockOneri> = { ...o };
    delete ac.olusturmaMs;
    delete ac.geriCekildi;
    let kullanilan: Kullanim[] = [];
    if (o.tur !== 'link') {
      kullanilan = kullanimlar.filter((k) => {
        if (k.ogrenciId !== o.ogrenciId || k.ms < olusturmaMs) return false;
        if (o.tur === 'kaynak_kitap') return k.kitapId === o.kaynakKitapId;
        if (o.tur === 'kaynak_kitap_testi') return k.testId === o.kaynakTestId;
        return !!k.metin && !!o.baslik && metinAnahtari(k.metin) === metinAnahtari(o.baslik);
      });
    }
    const gunler = kullanilan.map((k) => k.gun).sort();
    return {
      ...(ac as KaynakOnerisi),
      benim: o.onerenId === aktif(),
      basladi: o.tur === 'link' ? null : kullanilan.length > 0,
      ilkKullanimGun: gunler[0] ?? null,
      sonKullanimGun: gunler[gunler.length - 1] ?? null,
      kayitSayisi: kullanilan.length,
    };
  }

  const gecerliOnerilen = (ogrenciId: string) =>
    oneriler.filter((o) => o.ogrenciId === ogrenciId && !o.geriCekildi);

  function sayfala<T extends { olusturmaMs: number }>(
    liste: T[],
    imlec: string | null | undefined,
    limit: number,
  ) {
    const sirali = [...liste].sort((a, b) => b.olusturmaMs - a.olusturmaMs);
    const bas = imlec ? Number(imlec) : 0;
    const dilim = sirali.slice(bas, bas + limit);
    return {
      dilim,
      sonrakiImlec: bas + limit < sirali.length ? String(bas + limit) : null,
    };
  }

  function olcekDogrula(o: Partial<Record<OlcekKodu, number | null | undefined>>) {
    for (const k of OLCEK_KODLARI) {
      const v = o[k];
      if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1 || v > 5)) {
        throw dogrulama('validation_error');
      }
    }
  }

  function donemDogrula(bas: string, bit: string) {
    const gun = (Date.parse(bit) - Date.parse(bas)) / GUN_MS + 1;
    if (bas > bugun() || bit < bas || gun > DONEM_EN_FAZLA_GUN) throw dogrulama('donem_gecersiz');
  }

  function icerikDogrula(olcekler: Olcekler, yorum: string | null) {
    if (yorum && yorum.length > YORUM_EN_FAZLA) throw dogrulama('validation_error');
    if (!yorum && OLCEK_KODLARI.every((k) => olcekler[k] === null)) {
      throw dogrulama('validation_error');
    }
  }

  const benimBuHafta = (ogrenciId: string, yazarId: string) =>
    degerlendirmeler.some(
      (d) =>
        d.ogrenciId === ogrenciId &&
        d.yazarId === yazarId &&
        !d.geriCekildi &&
        d.donemBaslangic >= hafta &&
        d.donemBaslangic <= tarihEkle(hafta, 6),
    );

  async function konuOzeti(ogrenciId: string): Promise<Kocluk['konuOzeti']> {
    const bit = bugun();
    const bas = tarihEkle(bit, -29);
    let cozulen = 0;
    let dogru = 0;
    const zayiflar: ZayifKonu[] = [];
    const oneriListesi: Oneri[] = [];
    for (const brans of ['matematik', 'fen_bilimleri']) {
      let a: Analiz;
      try {
        a = await gunlukSoru.analiz({ bransKodu: brans, donem: '30' }, ogrenciId);
      } catch {
        continue;
      }
      cozulen += a.toplam.cozulen;
      dogru += a.toplam.dogru;
      for (const k of a.konular) {
        if (k.toplam.cozulen >= 5 && k.toplam.basari !== null && k.toplam.basari < 0.7) {
          zayiflar.push({
            bransKodu: brans,
            konuId: k.konuId,
            konuAd: k.konuAd,
            ustKonuAd: k.ustKonuAd,
            cozulen: k.toplam.cozulen,
            basari: k.toplam.basari,
          });
        }
      }
      oneriListesi.push(...(a.oneriler ?? []));
    }
    zayiflar.sort((x, y) => (x.basari ?? 2) - (y.basari ?? 2));
    return {
      bas,
      bit,
      cozulen,
      basari: cozulen > 0 ? Math.round((dogru / cozulen) * 1000) / 1000 : null,
      zayifKonular: zayiflar.slice(0, 5),
      oneriler: oneriListesi,
    };
  }

  function kullanilanKaynaklar(ogrenciId: string): Kocluk['kullanilanKaynaklar'] {
    const benimKullanimlar = kullanimlar.filter((k) => k.ogrenciId === ogrenciId);
    const kitapHaritasi = new Map<string, Kullanim[]>();
    const serbest = new Map<string, { ad: string; k: Kullanim[] }>();
    for (const k of benimKullanimlar) {
      if (k.kitapId) kitapHaritasi.set(k.kitapId, [...(kitapHaritasi.get(k.kitapId) ?? []), k]);
      else if (k.metin) {
        const a = metinAnahtari(k.metin);
        serbest.set(a, { ad: serbest.get(a)?.ad ?? k.metin, k: [...(serbest.get(a)?.k ?? []), k] });
      }
    }
    const sonGun = (l: Kullanim[]) => l.map((k) => k.gun).sort()[l.length - 1] ?? '';
    const kitaplar: KullanilanKitap[] = [...kitapHaritasi.entries()].map(([kitapId, l]) => {
      const bilgi = KITAP_BILGISI[kitapId] ?? { ad: kitapId, bransKodu: 'matematik', testler: 1 };
      return {
        kitapId,
        ad: bilgi.ad,
        bransKodu: bilgi.bransKodu,
        cozulenTest: new Set(l.map((k) => k.testId).filter(Boolean)).size,
        toplamTest: bilgi.testler,
        cozulenSoru: l.reduce((a, k) => a + k.soru, 0),
        kayitSayisi: l.length,
        sonKullanimGun: sonGun(l),
      };
    });
    return {
      kitaplar: kitaplar.sort((a, b) => b.sonKullanimGun.localeCompare(a.sonKullanimGun)),
      serbest: [...serbest.values()]
        .map((s) => ({ ad: s.ad, kayitSayisi: s.k.length, sonKullanimGun: sonGun(s.k) }))
        .sort((a, b) => b.sonKullanimGun.localeCompare(a.sonKullanimGun)),
      odevler:
        ogrenciId === DENIZ
          ? [{ ad: 'Okul fasikülü', odevSayisi: 2, sonKullanimGun: tarihEkle(bugun(), -4) }]
          : [],
    };
  }

  const adaptor: DegerlendirmeAdapter = {
    async degerlendirmeYaz(ogrenciId, g) {
      await gecik();
      kapsamdaOgrenci(ogrenciId);
      const bit = g.donemBitis ?? g.donemBaslangic;
      donemDogrula(g.donemBaslangic, bit);
      const olcekler: Olcekler = {
        calisma_duzeni: g.olcekler.calisma_duzeni ?? null,
        derse_katilim: g.olcekler.derse_katilim ?? null,
        odev_disiplini: g.olcekler.odev_disiplini ?? null,
        anlama_duzeyi: g.olcekler.anlama_duzeyi ?? null,
      };
      olcekDogrula(olcekler);
      const yorum = g.yorum?.trim() ? g.yorum.trim() : null;
      icerikDogrula(olcekler, yorum);
      const ms = simdi();
      const d: MockDegerlendirme = {
        id: yeniId('dg'),
        ogrenciId,
        yazarId: aktif() ?? OGRETMEN_A.id,
        yazarAd: OGRETMEN_A.ad,
        benim: true,
        bransKodu: g.bransKodu ?? null,
        donemBaslangic: g.donemBaslangic,
        donemBitis: bit,
        olcekler,
        yorum,
        ogrenciGorur: g.ogrenciGorur,
        duzenlenebilir: true,
        duzenlemeSon: new Date(ms + DUZENLEME_GUN * GUN_MS).toISOString(),
        geriCekildi: false,
        surum: 1,
        olusturma: new Date(ms).toISOString(),
        olusturmaMs: ms,
      };
      degerlendirmeler.push(d);
      return disariVer(d);
    },

    async degerlendirmeDuzenle(id, g) {
      await gecik();
      personelOlmali();
      const d = degerlendirmeler.find((x) => x.id === id);
      if (!d) throw bulunamadi();
      if (d.yazarId !== aktif()) throw yasak();
      if (d.geriCekildi) throw cakisma('degerlendirme_geri_cekildi');
      if (simdi() >= d.olusturmaMs + DUZENLEME_GUN * GUN_MS) {
        throw cakisma('degerlendirme_duzenlenemez');
      }
      if (g.surum !== d.surum) throw cakisma('surum_cakismasi');
      const bas = g.donemBaslangic ?? d.donemBaslangic;
      const bit = g.donemBitis ?? (g.donemBaslangic ? bas : d.donemBitis);
      donemDogrula(bas, bit);
      const olcekler: Olcekler = { ...d.olcekler };
      for (const k of OLCEK_KODLARI) {
        const v = g.olcekler?.[k];
        if (v !== undefined) olcekler[k] = v;
      }
      olcekDogrula(olcekler);
      const yorum = g.yorum === undefined ? d.yorum : g.yorum?.trim() ? g.yorum.trim() : null;
      icerikDogrula(olcekler, yorum);
      const eskiGorur = d.ogrenciGorur;
      Object.assign(d, {
        donemBaslangic: bas,
        donemBitis: bit,
        bransKodu: g.bransKodu === undefined ? d.bransKodu : g.bransKodu,
        olcekler,
        yorum,
        ogrenciGorur: g.ogrenciGorur ?? eskiGorur,
        surum: d.surum + 1,
      });
      return disariVer(d);
    },

    async degerlendirmeGeriCek(id) {
      await gecik();
      personelOlmali();
      const d = degerlendirmeler.find((x) => x.id === id);
      if (!d) throw bulunamadi();
      if (d.yazarId !== aktif()) throw yasak();
      d.geriCekildi = true;
      return disariVer(d);
    },

    async degerlendirmeler(ogrenciId, imlec, limit) {
      await gecik();
      kapsamdaOgrenci(ogrenciId);
      const s = sayfala(
        degerlendirmeler.filter((d) => d.ogrenciId === ogrenciId && !d.geriCekildi),
        imlec,
        limit ?? SAYFA,
      );
      return { degerlendirmeler: s.dilim.map(disariVer), sonrakiImlec: s.sonrakiImlec };
    },

    async kocluk(ogrenciId) {
      await gecik();
      kapsamdaOgrenci(ogrenciId);
      const s = sayfala(
        degerlendirmeler.filter((d) => d.ogrenciId === ogrenciId && !d.geriCekildi),
        null,
        SAYFA,
      );
      const buHafta = hafta;
      const haftalar = Array.from({ length: 4 }, (_, i) => {
        const h = tarihEkle(buHafta, -21 + 7 * i);
        const l = degerlendirmeler.filter(
          (d) =>
            d.ogrenciId === ogrenciId && !d.geriCekildi && haftaBaslangici(d.donemBaslangic) === h,
        );
        const o = Object.fromEntries(
          OLCEK_KODLARI.map((k) => [k, ortalama(l.map((d) => d.olcekler[k]))]),
        ) as Olcekler;
        return { haftaBaslangici: h, sayi: l.length, ortalamalar: o };
      });
      const hepsi = degerlendirmeler.filter(
        (d) =>
          d.ogrenciId === ogrenciId &&
          !d.geriCekildi &&
          haftalar.some((h) => h.haftaBaslangici === haftaBaslangici(d.donemBaslangic)),
      );
      const toplam = Object.fromEntries(
        OLCEK_KODLARI.map((k) => [k, ortalama(hepsi.map((d) => d.olcekler[k]))]),
      ) as Olcekler;
      return {
        ogrenciId,
        ogrenciAd: OGRENCILER[ogrenciId] ?? null,
        degerlendirmeler: {
          degerlendirmeler: s.dilim.map(disariVer),
          sonrakiImlec: s.sonrakiImlec,
        },
        olcekHaftalari: haftalar,
        olcekToplami: { sayi: hepsi.length, ortalamalar: toplam },
        kullanilanKaynaklar: kullanilanKaynaklar(ogrenciId),
        oneriler: gecerliOnerilen(ogrenciId)
          .sort((a, b) => b.olusturmaMs - a.olusturmaMs)
          .map(oneriDurumu),
        konuOzeti: await konuOzeti(ogrenciId),
        plan: {
          durum: 'yayinda',
          haftaBaslangici: buHafta,
          gorevSayisi: 5,
          tamamSayisi: 2,
          soru: { planlanan: 100, gerceklesen: 45 },
          dakika: { planlanan: 240, gerceklesen: 120 },
        },
        odev: { acik: 2, geciken: 1, teslimEdildi: 3, incelemeBekleyen: 1 },
      };
    },

    async hatirlatma() {
      await gecik();
      personelOlmali();
      const benim = aktif() ?? '';
      const eksik = Object.entries(OGRENCILER)
        .filter(([id]) => !benimBuHafta(id, benim))
        .map(([ogrenciId, ad]) => {
          const son = degerlendirmeler
            .filter((d) => d.ogrenciId === ogrenciId && d.yazarId === benim && !d.geriCekildi)
            .map((d) => d.donemBaslangic)
            .sort()
            .pop();
          return { ogrenciId, ogrenciAd: ad, sonDegerlendirmeGun: son ?? null };
        })
        // En eski / hic olmayan once.
        .sort((a, b) => (a.sonDegerlendirmeGun ?? '').localeCompare(b.sonDegerlendirmeGun ?? ''));
      return {
        haftaBaslangici: hafta,
        ogrenciSayisi: Object.keys(OGRENCILER).length,
        eksikSayisi: eksik.length,
        ogrenciler: eksik,
      };
    },

    async kaynakOner(ogrenciId, g) {
      await gecik();
      kapsamdaOgrenci(ogrenciId);
      if (g.notMetni && g.notMetni.length > NOT_EN_FAZLA) throw dogrulama('validation_error');
      if (g.konuId !== undefined && g.konuId !== null && !konular.some((k) => k.id === g.konuId)) {
        throw dogrulama('konu_gecersiz');
      }
      const ortak: Partial<MockOneri> = {
        konuId: g.konuId ?? null,
        konuAd: konuAdi(g.konuId ?? null),
        notMetni: g.notMetni?.trim() ? g.notMetni.trim() : null,
      };
      if (g.tur === 'kaynak_kitap' || g.tur === 'kaynak_kitap_testi') {
        let kitap;
        let test;
        try {
          if (g.tur === 'kaynak_kitap') kitap = await gunlukSoru.kaynakKitap(g.kitapId);
          else {
            // Test kimligi kitap kimligini icerir (`<kitap>-t<n>`); mock yalniz bu bicimi bilir.
            const kitapId = g.testId.replace(/-t\d+$/, '');
            kitap = await gunlukSoru.kaynakKitap(kitapId);
            test = kitap.testler.find((t) => t.id === g.testId);
            if (!test) throw bulunamadi();
          }
        } catch {
          throw dogrulama('kaynak_gecersiz');
        }
        if (!kitap.aktif) throw dogrulama('kaynak_gecersiz');
        oneriEkle(
          {
            tur: g.tur,
            onerenId: aktif() ?? OGRETMEN_A.id,
            onerenAd: OGRETMEN_A.ad,
            ogrenciId,
            kaynakKitapId: kitap.id,
            kaynakKitapAd: kitap.ad,
            kaynakTestId: test?.id ?? null,
            kaynakTestAd: test?.ad ?? null,
            bransKodu: kitap.bransKodu,
            ...ortak,
          },
          0,
        );
      } else {
        const baslik = g.baslik.trim();
        if (!baslik || baslik.length > 200) throw dogrulama('validation_error');
        if (g.tur === 'link' && !/^https?:\/\/[^\s]+$/i.test(g.baglantiUrl.trim())) {
          throw dogrulama('kaynak_gecersiz');
        }
        oneriEkle(
          {
            tur: g.tur,
            onerenId: aktif() ?? OGRETMEN_A.id,
            onerenAd: OGRETMEN_A.ad,
            ogrenciId,
            baslik,
            baglantiUrl: g.tur === 'link' ? g.baglantiUrl.trim() : null,
            bransKodu: g.bransKodu ?? null,
            ...ortak,
          },
          0,
        );
      }
      const son = oneriler[oneriler.length - 1];
      if (!son) throw bulunamadi();
      return oneriDurumu(son);
    },

    async kaynakOneriGeriCek(id) {
      await gecik();
      personelOlmali();
      const o = oneriler.find((x) => x.id === id);
      if (!o) throw bulunamadi();
      if (o.onerenId !== aktif()) throw yasak();
      o.geriCekildi = true;
      return oneriDurumu(o);
    },

    async degerlendirmelerim(imlec) {
      await gecik();
      const id = ogrenciOlmali();
      // YALNIZ gorunur ve geri cekilmemis olanlar; baska hicbir yoldan degerlendirme donmez.
      const s = sayfala(
        degerlendirmeler.filter((d) => d.ogrenciId === id && d.ogrenciGorur && !d.geriCekildi),
        imlec,
        SAYFA,
      );
      return { degerlendirmeler: s.dilim.map(ogrenciyeVer), sonrakiImlec: s.sonrakiImlec };
    },

    async kaynakOnerilerim() {
      await gecik();
      const id = ogrenciOlmali();
      return gecerliOnerilen(id)
        .sort((a, b) => b.olusturmaMs - a.olusturmaMs)
        .map(oneriDurumu);
    },
  };

  return {
    adaptor,
    kullanimKaydet(k) {
      kullanimlar.push({
        ogrenciId: k.ogrenciId,
        kitapId: k.kaynakKitapId,
        testId: k.kaynakTestId,
        metin: k.kaynakMetin,
        soru: k.toplam,
        gun: k.gun,
        ms: simdi(),
      });
    },
  };
}

/** Mock kaynak kitaplarinin ozeti (`mockGunlukSoru` tohumuyla ayni kimlikler). */
const KITAP_BILGISI: Record<string, { ad: string; bransKodu: string; testler: number }> = {
  'kitap-esen': { ad: 'Esen Soru Bankası', bransKodu: 'matematik', testler: 4 },
  'kitap-fen': { ad: 'Fen Bilimleri Testleri', bransKodu: 'fen_bilimleri', testler: 2 },
};
