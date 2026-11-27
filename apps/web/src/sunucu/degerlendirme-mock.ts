import {
  koclukBasladiMi,
  koclukKaynakKullanimi,
  koclukKitaplari,
  koclukKonuAnalizi,
} from './gunluk-soru-mock';
import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import { mockSimdi } from './mock-zaman';
import { gunlukSoruKoprusu } from './ogrenme-mock';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken ogretmen degerlendirmeleri, onerilen kaynaklar, kocluk gorunumu ve hatirlatma
 * ucunun bellek ici karsiligi (`docs/schema/api.md`; yanit sekilleri `@kopru/contracts` degerlendirme.ts ile
 * ayni). Roller kurumdan gelir (`Ege` ogretmen, `Mavi` yonetici, `Atlas` ogrenci). Tohum "Cağlar Yildiz"
 * (kurumun ogrenci "ben"i) icin iki ogretmenden (Burcu Tekin = kurumun "ben" ogretmeni, Hasan Polat) dort
 * degerlendirme (biri ogrenciye gorunur, digerleri gizli) ve uc kaynak onerisi (baslamamis kitap, baslamis
 * serbest, olculemeyen baglanti) icerir. Ogrenci yalniz gorunur olani ve kendi onerilerini gorur.
 */

const GUN_MS = 86_400_000;
const DUZENLEME_GUN = 7;
const EN_FAZLA_DONEM_GUN = 31;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const OLCEKLER = ['calisma_duzeni', 'derse_katilim', 'odev_disiplini', 'anlama_duzeyi'] as const;
type Olcek = (typeof OLCEKLER)[number];

interface Degerlendirme {
  id: string;
  ogrenci_id: string;
  yazar_id: string;
  yazar_ad: string | null;
  donem_baslangic: string;
  donem_bitis: string;
  brans_kodu: string | null;
  calisma_duzeni: number | null;
  derse_katilim: number | null;
  odev_disiplini: number | null;
  anlama_duzeyi: number | null;
  yorum: string | null;
  ogrenci_gorur: boolean;
  geri_cekildi_at: string | null;
  surum: number;
  created_at: string;
}
interface Oneri {
  id: string;
  ogrenci_id: string;
  oneren_id: string;
  oneren_ad: string | null;
  tur: 'kaynak_kitap' | 'kaynak_kitap_testi' | 'link' | 'serbest';
  kaynak_kitap_id: string | null;
  kaynak_test_id: string | null;
  baglanti_url: string | null;
  baslik: string | null;
  brans_kodu: string | null;
  konu_id: string | null;
  not: string | null;
  geri_cekildi_at: string | null;
  created_at: string;
}
interface Depo {
  /** Yonetici/sahip icin "ben" kimligi (ogretmen rolunde kurumun ilk ogretmeni). */
  yonetimBenId: string;
  degerlendirmeler: Degerlendirme[];
  oneriler: Oneri[];
}

const kutu = globalThis as unknown as { __kopruDegerlendirmeMock?: Record<string, Depo> };

/** Testler: tum degerlendirme verisini bastan kurar. */
export function degerlendirmeMockSifirla(): void {
  kutu.__kopruDegerlendirmeMock = undefined;
}

const uid = () => crypto.randomUUID();
const simdi = () => new Date(mockSimdi()).toISOString();
const bugun = () => new Date(mockSimdi() + 3 * 3_600_000).toISOString().slice(0, 10);
const gunEkle = (tarih: string, gun: number) =>
  new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
const haftaGunu = (tarih: string) => (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;
const pazartesi = (tarih: string) => gunEkle(tarih, -haftaGunu(tarih));
const onceki = (gun: number) => new Date(mockSimdi() - gun * GUN_MS).toISOString();

type Govde = Record<string, unknown>;
const nesne = (g: unknown): Govde => (typeof g === 'object' && g !== null ? (g as Govde) : {});
const metin = (v: unknown, enFazla: number): string | null =>
  typeof v === 'string' && v.trim() !== '' && v.trim().length <= enFazla ? v.trim() : null;

const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = (mesaj = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', mesaj);
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });

// --- Kimlikler ----------------------------------------------------------------------------------

function kimlik(kurumId: string) {
  const rol = MOCK_KURUM_ROLLERI[kurumId];
  const k = gunlukSoruKoprusu(kurumId);
  const uyeler = mockKurumVerisi(kurumId).uyeler;
  const ogretmenler = uyeler.filter((u) => u.rol === 'ogretmen');
  const d = depo(kurumId);
  return {
    rol,
    ogrenci: rol === 'ogrenci',
    yonetim: rol === 'yonetici' || rol === 'sahip',
    /** Isteyen kisinin uyelik kimligi (ogrenci icin kendisi). */
    benId: rol === 'ogretmen' ? k.ogretmenId : rol === 'ogrenci' ? k.benId : d.yonetimBenId,
    benAd:
      rol === 'ogretmen'
        ? (ogretmenler[0]?.gorunen_ad ?? null)
        : rol === 'ogrenci'
          ? null
          : 'Kurum yöneticisi',
    ogrenciler: k.ogrenciler,
    ikinciOgretmen: ogretmenler[1],
    birinciOgretmen: ogretmenler[0],
    adi: (id: string) => uyeler.find((u) => u.uyelik_id === id)?.gorunen_ad ?? null,
  };
}

// --- Tohum --------------------------------------------------------------------------------------

function kur(kurumId: string): Depo {
  const k = gunlukSoruKoprusu(kurumId);
  const uyeler = mockKurumVerisi(kurumId).uyeler;
  const ogretmenler = uyeler.filter((u) => u.rol === 'ogretmen');
  const burcu = ogretmenler[0];
  const hasan = ogretmenler[1];
  const ben = k.benId;
  const hafta = pazartesi(bugun());
  const depoNesnesi: Depo = { yonetimBenId: uid(), degerlendirmeler: [], oneriler: [] };
  if (!ben || !burcu || !hasan) return depoNesnesi;

  const deg = (
    yazar: { uyelik_id: string; gorunen_ad: string },
    haftaOnce: number,
    gunOnce: number,
    olcekler: [number | null, number | null, number | null, number | null],
    yorum: string | null,
    gorunur: boolean,
    brans: string | null = null,
  ) => {
    const bas = gunEkle(hafta, -7 * haftaOnce);
    depoNesnesi.degerlendirmeler.push({
      id: uid(),
      ogrenci_id: ben,
      yazar_id: yazar.uyelik_id,
      yazar_ad: yazar.gorunen_ad,
      donem_baslangic: bas,
      donem_bitis: gunEkle(bas, 6),
      brans_kodu: brans,
      calisma_duzeni: olcekler[0],
      derse_katilim: olcekler[1],
      odev_disiplini: olcekler[2],
      anlama_duzeyi: olcekler[3],
      yorum,
      ogrenci_gorur: gorunur,
      geri_cekildi_at: null,
      surum: 1,
      created_at: onceki(gunOnce),
    });
  };
  deg(
    burcu,
    0,
    1,
    [4, 5, 3, 4],
    'Derslere düzenli katılıyor, ödev tesliminde biraz gecikme var.',
    true,
    'matematik',
  );
  deg(
    hasan,
    1,
    6,
    [3, 3, 2, 3],
    'Geçen haftaki konuları tekrar etmesi iyi olur.',
    false,
    'fen_bilimleri',
  );
  deg(burcu, 2, 15, [3, 4, 3, 3], 'Hafta boyunca istikrarlı çalıştı.', false);
  deg(hasan, 3, 22, [2, 3, 2, 2], null, false);

  const matKitap = koclukKitaplari(kurumId).find((x) => x.ad === 'Seçme Matematik Fasikülleri');
  const rasyonel = k.konular.find((x) => x.ad === 'Rasyonel sayılar');
  const oneri = (
    o: Partial<Oneri> & Pick<Oneri, 'tur' | 'oneren_id' | 'oneren_ad'>,
    gunOnce: number,
  ) =>
    depoNesnesi.oneriler.push({
      id: uid(),
      ogrenci_id: ben,
      kaynak_kitap_id: null,
      kaynak_test_id: null,
      baglanti_url: null,
      baslik: null,
      brans_kodu: null,
      konu_id: null,
      not: null,
      geri_cekildi_at: null,
      created_at: onceki(gunOnce),
      ...o,
    });
  oneri(
    {
      tur: 'kaynak_kitap',
      oneren_id: hasan.uyelik_id,
      oneren_ad: hasan.gorunen_ad,
      kaynak_kitap_id: matKitap?.id ?? null,
      brans_kodu: 'matematik',
      konu_id: rasyonel?.id ?? null,
      not: 'Önce ilk iki testi çöz.',
    },
    3,
  );
  oneri(
    {
      tur: 'serbest',
      oneren_id: burcu.uyelik_id,
      oneren_ad: burcu.gorunen_ad,
      baslik: 'Zor sorular fasikülü',
      brans_kodu: 'matematik',
    },
    20,
  );
  oneri(
    {
      tur: 'link',
      oneren_id: burcu.uyelik_id,
      oneren_ad: burcu.gorunen_ad,
      baslik: 'Üslü sayılar konu anlatımı',
      baglanti_url: 'https://example.com/uslu-sayilar',
      brans_kodu: 'matematik',
    },
    8,
  );
  return depoNesnesi;
}

function depo(kurumId: string): Depo {
  kutu.__kopruDegerlendirmeMock ??= {};
  kutu.__kopruDegerlendirmeMock[kurumId] ??= kur(kurumId);
  return kutu.__kopruDegerlendirmeMock[kurumId];
}

// --- Gorunumler ---------------------------------------------------------------------------------

function sayfala<T extends { id: string }>(liste: T[], sorgu: URLSearchParams, varsayilan = 20) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? varsayilan) || varsayilan, 1), 100);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((o) => o.id === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki = basla + limit < liste.length ? (dilim[dilim.length - 1]?.id ?? null) : null;
  return { dilim, sonraki };
}

const yeniOnce = <T extends { created_at: string; id: string }>(liste: T[]) =>
  [...liste].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

function gorunum(kurumId: string, d: Degerlendirme) {
  const ben = kimlik(kurumId);
  const benim = d.yazar_id === ben.benId;
  const sonAt = new Date(Date.parse(d.created_at) + DUZENLEME_GUN * GUN_MS).toISOString();
  return {
    ...d,
    benim,
    duzenlenebilir: benim && d.geri_cekildi_at === null && mockSimdi() <= Date.parse(sonAt),
    duzenleme_son_at: sonAt,
  };
}

function ogrenciGorunumu(d: Degerlendirme) {
  return {
    id: d.id,
    yazar_ad: d.yazar_ad,
    donem_baslangic: d.donem_baslangic,
    donem_bitis: d.donem_bitis,
    brans_kodu: d.brans_kodu,
    calisma_duzeni: d.calisma_duzeni,
    derse_katilim: d.derse_katilim,
    odev_disiplini: d.odev_disiplini,
    anlama_duzeyi: d.anlama_duzeyi,
    yorum: d.yorum,
    created_at: d.created_at,
  };
}

function oneriGorunumu(kurumId: string, o: Oneri) {
  const ben = kimlik(kurumId);
  const kitap = koclukKitaplari(kurumId).find((x) => x.id === o.kaynak_kitap_id);
  const test = kitap?.testler.find((x) => x.id === o.kaynak_test_id);
  const konu = gunlukSoruKoprusu(kurumId).konular.find((x) => x.id === o.konu_id);
  const basladi =
    o.tur === 'link'
      ? null
      : koclukBasladiMi(kurumId, o.ogrenci_id, {
          kitapId: o.kaynak_kitap_id,
          testId: o.kaynak_test_id,
          metin: o.tur === 'serbest' ? o.baslik : null,
          sonra: o.created_at,
        });
  return {
    id: o.id,
    ogrenci_id: o.ogrenci_id,
    oneren_id: o.oneren_id,
    oneren_ad: o.oneren_ad,
    tur: o.tur,
    kaynak_kitap_id: o.kaynak_kitap_id,
    kaynak_kitap_ad: kitap?.ad ?? null,
    kaynak_test_id: o.kaynak_test_id,
    kaynak_test_ad: test?.ad ?? null,
    baglanti_url: o.baglanti_url,
    baslik: o.baslik,
    brans_kodu: o.brans_kodu,
    konu_id: o.konu_id,
    konu_ad: konu?.ad ?? null,
    not: o.not,
    basladi: basladi?.basladi ?? null,
    ilk_kullanim_gun: basladi?.ilk_kullanim_gun ?? null,
    son_kullanim_gun: basladi?.son_kullanim_gun ?? null,
    kayit_sayisi: basladi?.kayit_sayisi ?? 0,
    geri_cekildi_at: o.geri_cekildi_at,
    benim: o.oneren_id === ben.benId,
    created_at: o.created_at,
  };
}

// --- Yazma --------------------------------------------------------------------------------------

function olcekDegeri(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined;
}

function donemDogrula(bas: unknown, bit: unknown): { bas: string; bit: string } | MockYanit {
  if (typeof bas !== 'string' || !TARIH.test(bas)) return dogrulama();
  const bitis = bit ?? bas;
  if (typeof bitis !== 'string' || !TARIH.test(bitis)) return dogrulama();
  const gun = (Date.parse(bitis) - Date.parse(bas)) / GUN_MS + 1;
  if (bitis < bas || gun > EN_FAZLA_DONEM_GUN || bas > bugun()) {
    return hata(422, 'donem_gecersiz', 'Dönem geçersiz.');
  }
  return { bas, bit: bitis };
}

function olustur(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const ben = kimlik(kurumId);
  const d = depo(kurumId);
  const g = nesne(i.govde);
  const donem = donemDogrula(g.donem_baslangic, g.donem_bitis);
  if ('durum' in donem) return donem;
  const olcekler = Object.fromEntries(OLCEKLER.map((o) => [o, olcekDegeri(g[o])])) as Record<
    Olcek,
    number | null | undefined
  >;
  if (OLCEKLER.some((o) => g[o] !== undefined && g[o] !== null && olcekler[o] === undefined)) {
    return dogrulama();
  }
  const yorum = g.yorum === undefined || g.yorum === null ? null : metin(g.yorum, 4000);
  if (g.yorum !== undefined && g.yorum !== null && yorum === null) return dogrulama();
  if (yorum === null && OLCEKLER.every((o) => (olcekler[o] ?? null) === null)) {
    return dogrulama('Yorum ya da en az bir ölçek dolu olmalı.');
  }
  const yeni: Degerlendirme = {
    id: uid(),
    ogrenci_id: ogrenciId,
    yazar_id: ben.benId,
    yazar_ad: ben.benAd,
    donem_baslangic: donem.bas,
    donem_bitis: donem.bit,
    brans_kodu: metin(g.brans_kodu, 40),
    calisma_duzeni: olcekler.calisma_duzeni ?? null,
    derse_katilim: olcekler.derse_katilim ?? null,
    odev_disiplini: olcekler.odev_disiplini ?? null,
    anlama_duzeyi: olcekler.anlama_duzeyi ?? null,
    yorum,
    ogrenci_gorur: g.ogrenci_gorur === true,
    geri_cekildi_at: null,
    surum: 1,
    created_at: simdi(),
  };
  d.degerlendirmeler.push(yeni);
  return ok(gorunum(kurumId, yeni), 201);
}

function guncelle(kurumId: string, id: string, i: MockIstek): MockYanit {
  const ben = kimlik(kurumId);
  const kayit = depo(kurumId).degerlendirmeler.find((x) => x.id === id);
  if (!kayit) return bulunamadi();
  if (kayit.yazar_id !== ben.benId) return izinYok();
  if (kayit.geri_cekildi_at) {
    return hata(409, 'degerlendirme_geri_cekildi', 'Geri çekilmiş değerlendirme düzenlenemez.');
  }
  if (mockSimdi() > Date.parse(kayit.created_at) + DUZENLEME_GUN * GUN_MS) {
    return hata(409, 'degerlendirme_duzenlenemez', 'Düzenleme süresi doldu.');
  }
  const g = nesne(i.govde);
  if (typeof g.surum === 'number' && g.surum !== kayit.surum) {
    return hata(409, 'surum_cakismasi', 'Kayıt değişti.');
  }
  const sonraki = { ...kayit };
  if ('donem_baslangic' in g || 'donem_bitis' in g) {
    const donem = donemDogrula(g.donem_baslangic ?? kayit.donem_baslangic, g.donem_bitis);
    if ('durum' in donem) return donem;
    sonraki.donem_baslangic = donem.bas;
    sonraki.donem_bitis = donem.bit;
  }
  if ('brans_kodu' in g)
    sonraki.brans_kodu = g.brans_kodu === null ? null : metin(g.brans_kodu, 40);
  for (const o of OLCEKLER) {
    if (!(o in g)) continue;
    const v = olcekDegeri(g[o]);
    if (v === undefined) return dogrulama();
    sonraki[o] = v;
  }
  if ('yorum' in g) {
    sonraki.yorum = g.yorum === null ? null : metin(g.yorum, 4000);
    if (g.yorum !== null && sonraki.yorum === null) return dogrulama();
  }
  if (typeof g.ogrenci_gorur === 'boolean') sonraki.ogrenci_gorur = g.ogrenci_gorur;
  if (sonraki.yorum === null && OLCEKLER.every((o) => sonraki[o] === null)) {
    return dogrulama('Yorum ya da en az bir ölçek dolu olmalı.');
  }
  Object.assign(kayit, sonraki, { surum: kayit.surum + 1 });
  return ok(gorunum(kurumId, kayit));
}

function geriCek(kurumId: string, id: string): MockYanit {
  const ben = kimlik(kurumId);
  const kayit = depo(kurumId).degerlendirmeler.find((x) => x.id === id);
  if (!kayit) return bulunamadi();
  if (kayit.yazar_id !== ben.benId && !ben.yonetim) return izinYok();
  kayit.geri_cekildi_at ??= simdi();
  return ok(gorunum(kurumId, kayit));
}

function oneriYap(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const ben = kimlik(kurumId);
  const g = nesne(i.govde);
  const kitaplar = koclukKitaplari(kurumId);
  const konuId = metin(g.konu_id, 80);
  const notMetni = g.not === undefined || g.not === null ? null : metin(g.not, 1000);
  if (g.not !== undefined && g.not !== null && notMetni === null) return dogrulama();
  const yeni: Oneri = {
    id: uid(),
    ogrenci_id: ogrenciId,
    oneren_id: ben.benId,
    oneren_ad: ben.benAd,
    tur: 'serbest',
    kaynak_kitap_id: null,
    kaynak_test_id: null,
    baglanti_url: null,
    baslik: null,
    brans_kodu: metin(g.brans_kodu, 40),
    konu_id: konuId,
    not: notMetni,
    geri_cekildi_at: null,
    created_at: simdi(),
  };
  if (g.tur === 'kaynak_kitap') {
    const kitap = kitaplar.find((x) => x.id === g.kaynak_kitap_id);
    if (!kitap) return hata(422, 'kaynak_gecersiz', 'Kaynak bulunamadı.');
    Object.assign(yeni, {
      tur: 'kaynak_kitap',
      kaynak_kitap_id: kitap.id,
      brans_kodu: kitap.brans_kodu,
    });
  } else if (g.tur === 'kaynak_kitap_testi') {
    const kitap = kitaplar.find((x) => x.testler.some((y) => y.id === g.kaynak_test_id));
    if (!kitap) return hata(422, 'kaynak_gecersiz', 'Kaynak bulunamadı.');
    Object.assign(yeni, {
      tur: 'kaynak_kitap_testi',
      kaynak_kitap_id: kitap.id,
      kaynak_test_id: g.kaynak_test_id as string,
      brans_kodu: kitap.brans_kodu,
    });
  } else if (g.tur === 'link') {
    const adres = metin(g.baglanti_url, 2000);
    const gecerli = (() => {
      try {
        const u = new URL(adres ?? '');
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    })();
    const baslik = metin(g.baslik, 200);
    if (!adres || !gecerli || !baslik) return dogrulama();
    Object.assign(yeni, { tur: 'link', baglanti_url: adres, baslik });
  } else if (g.tur === 'serbest') {
    const baslik = metin(g.baslik, 200);
    if (!baslik) return dogrulama();
    Object.assign(yeni, { tur: 'serbest', baslik });
  } else {
    return dogrulama();
  }
  if (yeni.konu_id && !yeni.brans_kodu) return dogrulama();
  depo(kurumId).oneriler.push(yeni);
  return ok(oneriGorunumu(kurumId, yeni), 201);
}

function oneriGeriCek(kurumId: string, id: string): MockYanit {
  const ben = kimlik(kurumId);
  const kayit = depo(kurumId).oneriler.find((x) => x.id === id);
  if (!kayit) return bulunamadi();
  if (kayit.oneren_id !== ben.benId && !ben.yonetim) return izinYok();
  kayit.geri_cekildi_at ??= simdi();
  return ok(oneriGorunumu(kurumId, kayit));
}

// --- Okuma --------------------------------------------------------------------------------------

function kocluk(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const d = depo(kurumId);
  const ben = kimlik(kurumId);
  const liste = yeniOnce(
    d.degerlendirmeler.filter((x) => x.ogrenci_id === ogrenciId && !x.geri_cekildi_at),
  );
  const { dilim, sonraki } = sayfala(liste, i.sorgu);
  const hafta = pazartesi(bugun());
  const haftalar = Array.from({ length: 4 }, (_, n) => gunEkle(hafta, -7 * (3 - n)));
  const ortalama = (satirlar: Degerlendirme[], o: Olcek) => {
    const v = satirlar.map((x) => x[o]).filter((x): x is number => x !== null);
    return v.length === 0
      ? null
      : Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
  };
  const ozet = (satirlar: Degerlendirme[]) => ({
    sayi: satirlar.length,
    calisma_duzeni: ortalama(satirlar, 'calisma_duzeni'),
    derse_katilim: ortalama(satirlar, 'derse_katilim'),
    odev_disiplini: ortalama(satirlar, 'odev_disiplini'),
    anlama_duzeyi: ortalama(satirlar, 'anlama_duzeyi'),
  });
  const penceredeki = liste.filter((x) => x.donem_baslangic >= (haftalar[0] ?? hafta));
  const k = gunlukSoruKoprusu(kurumId);
  return ok({
    ogrenci_id: ogrenciId,
    ogrenci_ad: ben.adi(ogrenciId),
    degerlendirmeler: {
      degerlendirmeler: dilim.map((x) => gorunum(kurumId, x)),
      sonraki_imlec: sonraki,
    },
    olcek_ortalamalari: {
      haftalar: haftalar.map((h) => ({
        hafta_baslangic: h,
        ...ozet(penceredeki.filter((x) => pazartesi(x.donem_baslangic) === h)),
      })),
      toplam: ozet(penceredeki),
    },
    kullanilan_kaynaklar: koclukKaynakKullanimi(kurumId, ogrenciId),
    oneriler: yeniOnce(d.oneriler.filter((x) => x.ogrenci_id === ogrenciId && !x.geri_cekildi_at))
      .slice(0, 20)
      .map((x) => oneriGorunumu(kurumId, x)),
    konu_analizi: koclukKonuAnalizi(kurumId, ogrenciId),
    plan_odev: k.planOdevOzeti(ogrenciId),
  });
}

function hatirlatma(kurumId: string): MockYanit {
  const ben = kimlik(kurumId);
  const d = depo(kurumId);
  const hafta = pazartesi(bugun());
  const benimler = d.degerlendirmeler.filter(
    (x) => !x.geri_cekildi_at && (ben.yonetim || x.yazar_id === ben.benId),
  );
  const eksikler = ben.ogrenciler
    .map((o) => {
      const mevcut = benimler.filter((x) => x.ogrenci_id === o.id);
      const son =
        mevcut
          .map((x) => x.donem_baslangic)
          .sort()
          .at(-1) ?? null;
      const buHafta = mevcut.some((x) => x.donem_baslangic >= hafta);
      return { ogrenci_id: o.id, ogrenci_ad: o.ad, son_degerlendirme_gun: son, buHafta };
    })
    .filter((x) => !x.buHafta)
    .sort((a, b) => (a.son_degerlendirme_gun ?? '').localeCompare(b.son_degerlendirme_gun ?? ''));
  return ok({
    hafta_baslangic: hafta,
    ogrenci_sayisi: ben.ogrenciler.length,
    eksik_sayisi: eksikler.length,
    ogrenciler: eksikler.slice(0, 100).map(({ buHafta: _b, ...x }) => x),
  });
}

// --- Giris --------------------------------------------------------------------------------------

export function degerlendirmeMock(istek: MockIstek): MockYanit | null {
  const parcalar = istek.yol.split('/');
  if (parcalar[0] !== 'kurumlar' || !parcalar[1] || !(parcalar[1] in MOCK_KURUM_ROLLERI)) {
    return null;
  }
  const kurumId = parcalar[1];
  const p = parcalar.slice(2);
  const ben = kimlik(kurumId);
  const y = istek.yontem;
  const d = depo(kurumId);

  // Ogrenci: yalniz kendine gorunen degerlendirmeler ve oneriler.
  if (p.length === 1 && p[0] === 'degerlendirmelerim' && y === 'GET') {
    if (!ben.ogrenci) return izinYok();
    const liste = yeniOnce(
      d.degerlendirmeler.filter(
        (x) => x.ogrenci_id === ben.benId && x.ogrenci_gorur && !x.geri_cekildi_at,
      ),
    );
    const { dilim, sonraki } = sayfala(liste, istek.sorgu);
    return ok({ degerlendirmeler: dilim.map(ogrenciGorunumu), sonraki_imlec: sonraki });
  }
  if (p.length === 1 && p[0] === 'kaynak-onerilerim' && y === 'GET') {
    if (!ben.ogrenci) return izinYok();
    const liste = yeniOnce(
      d.oneriler.filter((x) => x.ogrenci_id === ben.benId && !x.geri_cekildi_at),
    );
    return ok({ oneriler: liste.map((x) => oneriGorunumu(kurumId, x)) });
  }

  const personelUcu =
    (p[0] === 'ogrenciler' &&
      ['degerlendirmeler', 'kaynak-onerileri', 'kocluk'].includes(p[2] ?? '')) ||
    p[0] === 'degerlendirmeler' ||
    p[0] === 'kaynak-onerileri' ||
    p[0] === 'degerlendirme-hatirlatma';
  if (!personelUcu) return null;
  if (ben.ogrenci) return izinYok();

  if (p[0] === 'degerlendirme-hatirlatma' && y === 'GET') return hatirlatma(kurumId);
  if (p[0] === 'degerlendirmeler' && p[1]) {
    if (p.length === 2 && y === 'PATCH') return guncelle(kurumId, p[1], istek);
    if (p.length === 3 && p[2] === 'geri-cek' && y === 'POST') return geriCek(kurumId, p[1]);
  }
  if (p[0] === 'kaynak-onerileri' && p[1] && p[2] === 'geri-cek' && y === 'POST') {
    return oneriGeriCek(kurumId, p[1]);
  }
  if (p[0] === 'ogrenciler' && p[1] && p.length === 3) {
    if (!ben.ogrenciler.some((o) => o.id === p[1])) return bulunamadi();
    const ogrenciId = p[1];
    if (p[2] === 'kocluk' && y === 'GET') return kocluk(kurumId, ogrenciId, istek);
    if (p[2] === 'degerlendirmeler' && y === 'POST') return olustur(kurumId, ogrenciId, istek);
    if (p[2] === 'degerlendirmeler' && y === 'GET') {
      const geriCekilenler = istek.sorgu.get('geri_cekilenler') === 'true';
      const liste = yeniOnce(
        d.degerlendirmeler.filter(
          (x) => x.ogrenci_id === ogrenciId && (geriCekilenler || !x.geri_cekildi_at),
        ),
      );
      const { dilim, sonraki } = sayfala(liste, istek.sorgu);
      return ok({
        degerlendirmeler: dilim.map((x) => gorunum(kurumId, x)),
        sonraki_imlec: sonraki,
      });
    }
    if (p[2] === 'kaynak-onerileri' && y === 'POST') return oneriYap(kurumId, ogrenciId, istek);
    if (p[2] === 'kaynak-onerileri' && y === 'GET') {
      const liste = yeniOnce(
        d.oneriler.filter((x) => x.ogrenci_id === ogrenciId && !x.geri_cekildi_at),
      );
      return ok({ oneriler: liste.map((x) => oneriGorunumu(kurumId, x)) });
    }
  }
  return null;
}
