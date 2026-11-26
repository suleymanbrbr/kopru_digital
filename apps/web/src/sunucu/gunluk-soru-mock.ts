import { MOCK_KURUM_ROLLERI } from './hesap-mock';
import { medyaMockAdres, medyaMockHazirMi } from './medya-mock';
import { mockSimdi } from './mock-zaman';
import { gunlukSoruKoprusu } from './ogrenme-mock';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken gunluk soru takibi ve kaynak kitaplarin bellek ici karsiligi
 * (`/api/ogrenme/kurumlar/<k>/gunluk-soru/*`, `.../kaynak-kitaplar*`, `.../ogrenciler/<id>/gunluk-soru/*`).
 * Yanit sekilleri `@kopru/contracts` (gunluk-soru.ts) ile aynidir; bant tespiti ve onerilerin esikleri
 * `services/api/.../gunluk-soru-bant.ts` ile ayni tutulur. Tohum "Cağlar Yildiz" (kurumun ogrenci "ben"i) icin
 * senaryoludur: bir konuda kolay %90 / orta %60 / zor %25 ("orta seviyede zorlaniyor" + "gorev oner"), bir
 * konuda "birebir ders gerekebilir", fotografli bir kayit; sinif gorunumu icin baska ogrencilerin kayitlari
 * da vardir. Tohum kayitlar dunden eskidir (duzeltilemez); bugunku kayitlari e2e kendisi girer.
 */

type Zorluk = 'kolay' | 'orta' | 'zor';
const ZORLUKLAR: readonly Zorluk[] = ['kolay', 'orta', 'zor'];

interface Kayit {
  id: string;
  ogrenci_id: string;
  gun: string;
  /** Kaydin olusturuldugu takvim gunu (duzeltme penceresi). */
  olusturma_gunu: string;
  created_at: string;
  brans_kodu: string;
  konu_id: string;
  zorluk: Zorluk;
  kaynak_test_id: string | null;
  kaynak_metin: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  plan_gorev_id: string | null;
  dosya_idleri: string[];
  istek_id: string | null;
  surum: number;
}
interface Test {
  id: string;
  kitap_id: string;
  sira: number;
  ad: string;
  soru_sayisi: number;
  konu_id: string | null;
}
interface Kitap {
  id: string;
  ad: string;
  yayinevi: string | null;
  brans_kodu: string;
  kademe_id: null;
  sahip_uyelik_id: string | null;
  aktif: boolean;
  surum: number;
  created_at: string;
  testler: Test[];
}
interface Depo {
  kayitlar: Kayit[];
  kitaplar: Kitap[];
}

const kutu = globalThis as unknown as { __kopruGunlukSoruMock?: Record<string, Depo> };

/** Testler: tum gunluk soru verisini bastan kurar. */
export function gunlukSoruMockSifirla(): void {
  kutu.__kopruGunlukSoruMock = undefined;
}

const GUN_MS = 86_400_000;
const uid = () => crypto.randomUUID();
const simdi = () => new Date(mockSimdi()).toISOString();
const bugun = () => new Date(mockSimdi() + 3 * 3_600_000).toISOString().slice(0, 10);
const gunEkle = (tarih: string, gun: number) =>
  new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
const haftaGunu = (tarih: string) => (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;
const pazartesi = (tarih: string) => gunEkle(tarih, -haftaGunu(tarih));
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

type Govde = Record<string, unknown>;
const nesne = (g: unknown): Govde => (typeof g === 'object' && g !== null ? (g as Govde) : {});
const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const sayiAl = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 500 ? v : null;

const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = (mesaj = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', mesaj);
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });

// --- Tohum --------------------------------------------------------------------------------------

function kur(kurumId: string): Depo {
  const k = gunlukSoruKoprusu(kurumId);
  const konuBul = (ad: string) => k.konular.find((x) => x.ad === ad)?.id;
  const negatif = konuBul('Tam sayıların negatif kuvvetleri');
  const bilimsel = konuBul('Bilimsel gösterim');
  const karekok = konuBul('Kareköklü ifadelerde işlemler');
  const rasyonel = konuBul('Rasyonel sayılar');
  const kayitlar: Kayit[] = [];
  const kitaplar: Kitap[] = [];

  const kitapYap = (ad: string, yayinevi: string, brans: string, testler: [string, number][]) => {
    const id = uid();
    const kitap: Kitap = {
      id,
      ad,
      yayinevi,
      brans_kodu: brans,
      kademe_id: null,
      sahip_uyelik_id: k.ogretmenId,
      aktif: true,
      surum: 1,
      created_at: simdi(),
      testler: testler.map(([tAd, n], i) => ({
        id: uid(),
        kitap_id: id,
        sira: i + 1,
        ad: tAd,
        soru_sayisi: n,
        konu_id: null,
      })),
    };
    kitaplar.push(kitap);
    return kitap;
  };
  const matKitap = kitapYap('Ornek Matematik Soru Bankası', 'Ornek Yayınları', 'matematik', [
    ['Test 1', 20],
    ['Test 2', 25],
    ['Test 3', 20],
  ]);
  // Yalniz koçluk onerisi senaryosu icin: baska hicbir akis bu kitabi kullanmaz ("basladi" durumu izole kalir).
  kitapYap('Seçme Matematik Fasikülleri', 'Deneme Yayınları', 'matematik', [
    ['Test 1', 10],
    ['Test 2', 10],
  ]);
  kitapYap('Fen Bilimleri Konu Testleri', 'Deneme Yayınları', 'fen_bilimleri', [
    ['Test 1', 15],
    ['Test 2', 15],
  ]);

  const ekle = (
    ogrenciId: string,
    gunOnce: number,
    konuId: string | undefined,
    zorluk: Zorluk,
    d: number,
    y: number,
    b: number,
    ek: Partial<Kayit> = {},
  ) => {
    if (!konuId) return;
    const gun = gunEkle(bugun(), -gunOnce);
    kayitlar.push({
      id: uid(),
      ogrenci_id: ogrenciId,
      gun,
      olusturma_gunu: gun,
      created_at: `${gun}T09:00:00.000Z`,
      brans_kodu: 'matematik',
      konu_id: konuId,
      zorluk,
      kaynak_test_id: null,
      kaynak_metin: null,
      dogru: d,
      yanlis: y,
      bos: b,
      plan_gorev_id: null,
      dosya_idleri: [],
      istek_id: null,
      surum: 1,
      ...ek,
    });
  };

  const ben = k.benId;
  if (ben) {
    // Bant ornegi: kolay %90 (20), orta %60 (20), zor %25 (16) -> "orta seviyede zorlaniyor".
    ekle(ben, 24, negatif, 'kolay', 9, 1, 0, { kaynak_test_id: matKitap.testler[0]?.id ?? null });
    ekle(ben, 20, negatif, 'kolay', 9, 1, 0);
    ekle(ben, 17, negatif, 'orta', 6, 3, 1, { kaynak_metin: 'Ornek Yayınları Test 4' });
    ekle(ben, 12, negatif, 'orta', 6, 3, 1);
    ekle(ben, 9, negatif, 'zor', 2, 5, 1, {
      dosya_idleri: ['ornek-gunluk1', 'ornek-gunluk2'],
    });
    ekle(ben, 5, negatif, 'zor', 2, 4, 2);
    // Sorun yok: kolay ve orta iyi.
    ekle(ben, 16, bilimsel, 'kolay', 10, 2, 0);
    ekle(ben, 6, bilimsel, 'orta', 9, 2, 1);
    // Veri az.
    ekle(ben, 3, karekok, 'kolay', 4, 1, 0);
    // Birebir ders gerekebilir: son 2 haftada zor bantta %17 ve duzelmiyor.
    ekle(ben, 13, rasyonel, 'kolay', 9, 1, 0);
    ekle(ben, 11, rasyonel, 'zor', 1, 4, 1, { kaynak_metin: 'Zor sorular fasikülü' });
    ekle(ben, 4, rasyonel, 'zor', 1, 4, 1);
  }
  // Sinif gorunumu icin baska ogrenciler.
  const digerleri = k.ogrenciler.filter((o) => o.id !== ben);
  digerleri.slice(0, 4).forEach((o, i) => {
    ekle(o.id, 8 + i, negatif, 'kolay', 8, 2, 0);
    ekle(o.id, 6 + i, negatif, 'orta', 3 + i, 6 - i, 1);
    ekle(o.id, 4, bilimsel, 'orta', 9, 1, 0);
  });
  kayitlar.sort((a, b) => a.gun.localeCompare(b.gun));
  return { kayitlar, kitaplar };
}

function depo(kurumId: string): Depo {
  kutu.__kopruGunlukSoruMock ??= {};
  kutu.__kopruGunlukSoruMock[kurumId] ??= kur(kurumId);
  return kutu.__kopruGunlukSoruMock[kurumId];
}

// --- Bant tespiti ve oneriler (api ile ayni esikler) -----------------------------------------------

const BANT_EN_AZ_SORU = 10;
const BANT_DUSUS_ESIGI = 0.2;
const BANT_DUSUK_BASARI_ESIGI = 0.7;
const BANT_MUTLAK_ZORLANMA_ESIGI = 0.5;
const GOREV_ONER_SORU_SAYISI = 20;
const BIREBIR_ZOR_BASARI_ESIGI = 0.3;
const BIREBIR_HAFTA_EN_AZ_SORU = 5;
const BIREBIR_DUZELME_ESIGI = 0.1;

interface Toplam {
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
}
const bosToplam = (): Toplam => ({ cozulen: 0, dogru: 0, yanlis: 0, bos: 0 });
const basariOrani = (dogru: number, cozulen: number): number | null =>
  cozulen <= 0 ? null : Math.round((dogru / cozulen) * 1000) / 1000;

function bantTespit(bantlar: Record<Zorluk, Toplam>) {
  const basarilar: Record<Zorluk, number | null> = { kolay: null, orta: null, zor: null };
  const yeterli: { bant: Zorluk; basari: number }[] = [];
  for (const b of ZORLUKLAR) {
    const { cozulen, dogru } = bantlar[b];
    if (cozulen >= BANT_EN_AZ_SORU) {
      const basari = basariOrani(dogru, cozulen) ?? 0;
      basarilar[b] = basari;
      yeterli.push({ bant: b, basari });
    }
  }
  const sonuc = (durum: 'veri_az' | 'tespit_yok' | 'zorlaniyor', bant: Zorluk | null) => ({
    durum,
    bant,
    bant_basarilari: basarilar,
  });
  const ilk = yeterli[0];
  if (!ilk) return sonuc('veri_az', null);
  if (ilk.bant !== 'zor' && ilk.basari < BANT_MUTLAK_ZORLANMA_ESIGI) {
    return sonuc('zorlaniyor', ilk.bant);
  }
  if (yeterli.length === 1) return sonuc('veri_az', null);
  for (let i = 1; i < yeterli.length; i += 1) {
    const once = yeterli[i - 1];
    const bu = yeterli[i];
    if (!once || !bu) continue;
    if (once.basari - bu.basari >= BANT_DUSUS_ESIGI - 1e-9 && bu.basari < BANT_DUSUK_BASARI_ESIGI) {
      return sonuc('zorlaniyor', bu.bant);
    }
  }
  return sonuc('tespit_yok', null);
}

const derece = (t: ReturnType<typeof bantTespit>): number | null =>
  t.durum === 'veri_az'
    ? null
    : t.durum === 'tespit_yok'
      ? 0
      : t.bant === 'kolay'
        ? 3
        : t.bant === 'orta'
          ? 2
          : 1;

// --- Toplama ------------------------------------------------------------------------------------

interface Satir {
  kaynak: 'gunluk' | 'odev';
  id: string;
  gun: string;
  brans_kodu: string;
  konu_id: string;
  zorluk: Zorluk | 'belirtilmemis';
  kaynak_adi: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  toplam: number;
  dosya_idleri: string[];
}

function kaynakAdi(d: Depo, kayit: Kayit): string | null {
  if (kayit.kaynak_test_id) {
    for (const kitap of d.kitaplar) {
      const test = kitap.testler.find((x) => x.id === kayit.kaynak_test_id);
      if (test) return `${kitap.ad} ${test.ad}`;
    }
  }
  return kayit.kaynak_metin;
}

function satirlar(
  kurumId: string,
  ogrenciId: string,
  bas: string,
  bit: string,
  brans: string,
): Satir[] {
  const d = depo(kurumId);
  const k = gunlukSoruKoprusu(kurumId);
  const liste: Satir[] = d.kayitlar
    .filter(
      (x) => x.ogrenci_id === ogrenciId && x.brans_kodu === brans && x.gun >= bas && x.gun <= bit,
    )
    .map((x) => ({
      kaynak: 'gunluk' as const,
      id: x.id,
      gun: x.gun,
      brans_kodu: x.brans_kodu,
      konu_id: x.konu_id,
      zorluk: x.zorluk,
      kaynak_adi: kaynakAdi(d, x),
      dogru: x.dogru,
      yanlis: x.yanlis,
      bos: x.bos,
      toplam: x.dogru + x.yanlis + x.bos,
      dosya_idleri: x.dosya_idleri,
    }));
  for (const { r, o } of k.teslimler(ogrenciId)) {
    const gun = typeof r.teslim_at === 'string' ? r.teslim_at.slice(0, 10) : '';
    const yapilan = typeof r.yapilan_soru_sayisi === 'number' ? r.yapilan_soru_sayisi : 0;
    if (!gun || gun < bas || gun > bit || o.brans_kodu !== brans || yapilan <= 0) continue;
    const dogru = typeof r.dogru_sayisi === 'number' ? r.dogru_sayisi : 0;
    const yanlis = typeof r.yanlis_sayisi === 'number' ? r.yanlis_sayisi : 0;
    const bos = typeof r.bos_sayisi === 'number' ? r.bos_sayisi : 0;
    liste.push({
      kaynak: 'odev',
      id: r.id,
      gun,
      brans_kodu: brans,
      konu_id: o.konu_id as string,
      zorluk: 'belirtilmemis',
      kaynak_adi: typeof o.kaynak === 'string' ? o.kaynak : null,
      dogru,
      yanlis,
      bos,
      toplam: yapilan,
      dosya_idleri: [],
    });
  }
  return liste;
}

function topla(liste: readonly Satir[]): Toplam {
  const t = bosToplam();
  for (const s of liste) {
    t.cozulen += s.toplam;
    t.dogru += s.dogru;
    t.yanlis += s.yanlis;
    t.bos += s.bos;
  }
  return t;
}

/** Hucrenin `cozulen`i D+Y+B'dir (odev teslimlerinde yapilan sayi); basari yalniz D/Y/B bilinenlerden. */
function hucreAl(liste: readonly Satir[]) {
  const t = topla(liste);
  const bilinen = t.dogru + t.yanlis + t.bos;
  return { ...t, basari: basariOrani(t.dogru, bilinen) };
}

function donemAraligi(sorgu: URLSearchParams): { bas: string; bit: string } | null {
  const bit = sorgu.get('bit') ?? bugun();
  const donem = sorgu.get('donem') ?? '30';
  const gun = donem === '7' ? 7 : donem === 'donem' ? 120 : 30;
  const basGirdi = sorgu.get('bas');
  if ((basGirdi && !TARIH.test(basGirdi)) || !TARIH.test(bit)) return null;
  return { bas: basGirdi ?? gunEkle(bit, -(gun - 1)), bit };
}

function konuAdlari(kurumId: string) {
  const k = gunlukSoruKoprusu(kurumId);
  const harita = new Map(k.konular.map((x) => [x.id, x]));
  return (id: string) => {
    const x = harita.get(id);
    return { ad: x?.ad ?? null, ust: x?.ust_id ? (harita.get(x.ust_id)?.ad ?? null) : null };
  };
}

function oneriler(
  kurumId: string,
  ogrenciId: string,
  brans: string,
  bit: string,
  konular: { konu_id: string; konu_ad: string | null; bant: ReturnType<typeof bantTespit> }[],
) {
  const sonuc: unknown[] = [];
  const tum = satirlar(kurumId, ogrenciId, gunEkle(bit, -13), bit, brans).filter(
    (s) => s.kaynak === 'gunluk' && s.zorluk === 'zor',
  );
  for (const k of konular) {
    if (k.bant.durum === 'zorlaniyor' && k.bant.bant) {
      sonuc.push({
        tur: 'gorev_oner',
        brans_kodu: brans,
        konu_id: k.konu_id,
        konu_ad: k.konu_ad,
        zorluk: k.bant.bant,
        soru_sayisi: GOREV_ONER_SORU_SAYISI,
        basari: k.bant.bant_basarilari[k.bant.bant],
      });
    }
    const zor = tum.filter((s) => s.konu_id === k.konu_id);
    const ortaGun = gunEkle(bit, -6);
    const onceki = topla(zor.filter((s) => s.gun < ortaGun));
    const son = topla(zor.filter((s) => s.gun >= ortaGun));
    const cozulen = onceki.cozulen + son.cozulen;
    const basari = basariOrani(onceki.dogru + son.dogru, cozulen);
    if (cozulen >= BANT_EN_AZ_SORU && basari !== null && basari < BIREBIR_ZOR_BASARI_ESIGI) {
      const oncekiB =
        onceki.cozulen >= BIREBIR_HAFTA_EN_AZ_SORU
          ? basariOrani(onceki.dogru, onceki.cozulen)
          : null;
      const sonB =
        son.cozulen >= BIREBIR_HAFTA_EN_AZ_SORU ? basariOrani(son.dogru, son.cozulen) : null;
      const duzeldi =
        oncekiB !== null && sonB !== null && sonB - oncekiB >= BIREBIR_DUZELME_ESIGI - 1e-9;
      if (!duzeldi) {
        sonuc.push({
          tur: 'birebir_ders',
          brans_kodu: brans,
          konu_id: k.konu_id,
          konu_ad: k.konu_ad,
          zor_basari: basari,
          onceki_hafta_basari: oncekiB,
          son_hafta_basari: sonB,
        });
      }
    }
  }
  return sonuc;
}

function analizYap(kurumId: string, ogrenciId: string, i: MockIstek, personel: boolean): MockYanit {
  const brans = i.sorgu.get('brans_kodu');
  const aralik = donemAraligi(i.sorgu);
  if (!brans || !aralik) return dogrulama();
  const ad = konuAdlari(kurumId);
  const tum = satirlar(kurumId, ogrenciId, aralik.bas, aralik.bit, brans);
  const gruplu = new Map<string, Satir[]>();
  for (const s of tum) gruplu.set(s.konu_id, [...(gruplu.get(s.konu_id) ?? []), s]);
  const konular = [...gruplu.entries()]
    .map(([konuId, liste]) => {
      const bantlar = Object.fromEntries(
        ZORLUKLAR.map((z) => [z, topla(liste.filter((s) => s.zorluk === z))]),
      ) as Record<Zorluk, Toplam>;
      const a = ad(konuId);
      return {
        konu_id: konuId,
        konu_ad: a.ad,
        ust_konu_ad: a.ust,
        hucreler: {
          kolay: hucreAl(liste.filter((s) => s.zorluk === 'kolay')),
          orta: hucreAl(liste.filter((s) => s.zorluk === 'orta')),
          zor: hucreAl(liste.filter((s) => s.zorluk === 'zor')),
          belirtilmemis: hucreAl(liste.filter((s) => s.zorluk === 'belirtilmemis')),
        },
        toplam: hucreAl(liste),
        bant: bantTespit(bantlar),
      };
    })
    .sort((a, b) => b.toplam.cozulen - a.toplam.cozulen);
  return ok({
    ogrenci_id: ogrenciId,
    brans_kodu: brans,
    bas: aralik.bas,
    bit: aralik.bit,
    konular,
    toplam: hucreAl(tum),
    ...(personel
      ? {
          oneriler: oneriler(
            kurumId,
            ogrenciId,
            brans,
            aralik.bit,
            konular.map((k) => ({ konu_id: k.konu_id, konu_ad: k.konu_ad, bant: k.bant })),
          ),
        }
      : {}),
  });
}

function hucreYaniti(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const brans = i.sorgu.get('brans_kodu');
  const konuId = i.sorgu.get('konu_id');
  const aralik = donemAraligi(i.sorgu);
  if (!brans || !konuId || !aralik) return dogrulama();
  const zorluk = i.sorgu.get('zorluk');
  const kaynak = i.kaynak ?? '';
  const liste = satirlar(kurumId, ogrenciId, aralik.bas, aralik.bit, brans)
    .filter((s) => s.konu_id === konuId && (!zorluk || s.zorluk === zorluk))
    .sort((a, b) => b.gun.localeCompare(a.gun));
  return ok({
    ogrenci_id: ogrenciId,
    konu_id: konuId,
    fotograf_adresleri_alinamadi: false,
    kayitlar: liste.map((s) => ({
      kaynak: s.kaynak,
      id: s.id,
      gun: s.gun,
      zorluk: s.zorluk,
      kaynak_adi: s.kaynak_adi,
      dogru: s.dogru,
      yanlis: s.yanlis,
      bos: s.bos,
      toplam: s.toplam,
      dosyalar: s.dosya_idleri.map((id) => ({
        medya_dosya_id: uuidDosya(id),
        adres: { dosya_id: uuidDosya(id), ...medyaMockAdres(kaynak, id) },
      })),
    })),
  });
}

/** Tohum dosya kimlikleri (`ornek-*`) UUID degildir; sozlesmedeki `dosya_id` icin sabit turetilir. */
function uuidDosya(id: string): string {
  if (/^[0-9a-f-]{36}$/i.test(id)) return id;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, '0');
  return `00000000-0000-4000-8000-0000${hex}`;
}

function haftalikOzet(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const girdi = i.sorgu.get('hafta');
  const hafta = pazartesi(girdi && TARIH.test(girdi) ? girdi : bugun());
  const haftaSonu = gunEkle(hafta, 6);
  const ad = konuAdlari(kurumId);
  const d = depo(kurumId);
  const brans = [
    ...new Set(d.kayitlar.filter((x) => x.ogrenci_id === ogrenciId).map((x) => x.brans_kodu)),
  ];
  const hepsi = (bas: string, bit: string) =>
    brans.flatMap((b) => satirlar(kurumId, ogrenciId, bas, bit, b));
  const bu = hepsi(hafta, haftaSonu);
  const once = hepsi(gunEkle(hafta, -7), gunEkle(hafta, -1));
  const bantlar = (liste: Satir[]) =>
    Object.fromEntries(
      ZORLUKLAR.map((z) => [z, topla(liste.filter((s) => s.zorluk === z))]),
    ) as Record<Zorluk, Toplam>;
  const t = topla(bu);
  const konuToplamlari = new Map<string, Satir[]>();
  for (const s of bu) konuToplamlari.set(s.konu_id, [...(konuToplamlari.get(s.konu_id) ?? []), s]);
  const zayif = [...konuToplamlari.entries()]
    .map(([konuId, liste]) => ({ konuId, liste, h: hucreAl(liste) }))
    .filter((x) => x.h.basari !== null && x.h.cozulen >= 5)
    .sort((a, b) => (a.h.basari ?? 1) - (b.h.basari ?? 1))
    .slice(0, 3);
  const onceki = bantTespit(bantlar(once));
  const simdiki = bantTespit(bantlar(bu));
  const a = derece(onceki);
  const b = derece(simdiki);
  const degisim =
    a === null || b === null ? 'belirsiz' : b < a ? 'iyilesti' : b > a ? 'kotulesti' : 'ayni';
  return ok({
    ogrenci_id: ogrenciId,
    hafta_baslangic: hafta,
    cozulen: t.cozulen,
    dogru: t.dogru,
    yanlis: t.yanlis,
    bos: t.bos,
    basari: basariOrani(t.dogru, t.dogru + t.yanlis + t.bos),
    en_zayif_konular: zayif.map((x) => ({
      brans_kodu: x.liste[0]?.brans_kodu ?? '',
      konu_id: x.konuId,
      konu_ad: ad(x.konuId).ad,
      cozulen: x.h.cozulen,
      basari: x.h.basari,
    })),
    bant: { onceki, simdiki, degisim },
  });
}

function sinifAnalizi(kurumId: string, i: MockIstek): MockYanit {
  const k = gunlukSoruKoprusu(kurumId);
  const grupId = i.sorgu.get('grup_id');
  const brans = i.sorgu.get('brans_kodu');
  const aralik = donemAraligi(i.sorgu);
  if (!grupId || !brans || !aralik) return dogrulama();
  if (!k.gruplar.some((g) => g.id === grupId)) return bulunamadi();
  const ogrenciler = k.grupOgrencileri(grupId);
  const ad = konuAdlari(kurumId);
  const tum = ogrenciler.flatMap((o) =>
    satirlar(kurumId, o, aralik.bas, aralik.bit, brans).map((s) => ({ ...s, ogrenci: o })),
  );
  const konuIdleri = [...new Set(tum.map((s) => s.konu_id))];
  const konular = konuIdleri.map((konuId) => {
    const liste = tum.filter((s) => s.konu_id === konuId);
    const ogrIdleri = [...new Set(liste.map((s) => s.ogrenci))];
    const zorlanan = ogrIdleri.filter((o) => {
      const h = hucreAl(liste.filter((s) => s.ogrenci === o));
      return h.cozulen >= 5 && h.basari !== null && h.basari < 0.5;
    });
    return {
      konu_id: konuId,
      konu_ad: ad(konuId).ad,
      ogrenci_sayisi: ogrIdleri.length,
      zorlanan_ogrenci_sayisi: zorlanan.length,
      hucreler: {
        kolay: hucreAl(liste.filter((s) => s.zorluk === 'kolay')),
        orta: hucreAl(liste.filter((s) => s.zorluk === 'orta')),
        zor: hucreAl(liste.filter((s) => s.zorluk === 'zor')),
        belirtilmemis: hucreAl(liste.filter((s) => s.zorluk === 'belirtilmemis')),
      },
      toplam: hucreAl(liste),
    };
  });
  konular.sort((a, b) => b.toplam.cozulen - a.toplam.cozulen);
  const enCok = konular
    .filter((x) => x.toplam.cozulen >= 10 && x.toplam.basari !== null && x.toplam.basari < 0.7)
    .sort((a, b) => (a.toplam.basari ?? 1) - (b.toplam.basari ?? 1))
    .slice(0, 5);
  return ok({
    grup_id: grupId,
    brans_kodu: brans,
    bas: aralik.bas,
    bit: aralik.bit,
    ogrenci_sayisi: ogrenciler.length,
    konular,
    en_cok_zorlanilan: enCok,
    toplam: hucreAl(tum),
  });
}

// --- Kayitlar -----------------------------------------------------------------------------------

function kayitGorunumu(kurumId: string, x: Kayit) {
  const k = gunlukSoruKoprusu(kurumId);
  const d = depo(kurumId);
  const konu = k.konular.find((y) => y.id === x.konu_id);
  const kitap = d.kitaplar.find((b) => b.testler.some((t) => t.id === x.kaynak_test_id));
  return {
    id: x.id,
    ogrenci_id: x.ogrenci_id,
    gun: x.gun,
    brans_kodu: x.brans_kodu,
    konu_id: x.konu_id,
    konu_ad: konu?.ad ?? null,
    zorluk: x.zorluk,
    kaynak_test_id: x.kaynak_test_id,
    kaynak_kitap_id: kitap?.id ?? null,
    kaynak_metin: x.kaynak_metin,
    dogru: x.dogru,
    yanlis: x.yanlis,
    bos: x.bos,
    toplam: x.dogru + x.yanlis + x.bos,
    plan_gorev_id: x.plan_gorev_id,
    dosyalar: x.dosya_idleri.map((id, sira) => ({ medya_dosya_id: uuidDosya(id), sira })),
    duzenlenebilir: x.olusturma_gunu === bugun(),
    surum: x.surum,
    created_at: x.created_at,
  };
}

/** Plan gorevine bagli kayitlarin toplamini gorevin gerceklesen miktarina yazar. */
function gorevleriEsitle(kurumId: string, gorevIdleri: (string | null)[]) {
  const k = gunlukSoruKoprusu(kurumId);
  const d = depo(kurumId);
  for (const id of new Set(gorevIdleri)) {
    if (!id) continue;
    const toplam = d.kayitlar
      .filter((x) => x.plan_gorev_id === id)
      .reduce((a, x) => a + x.dogru + x.yanlis + x.bos, 0);
    k.gorevMiktariniEsitle(id, toplam);
  }
}

type Dogrulanmis =
  | {
      hata: MockYanit;
    }
  | {
      alanlar: Pick<
        Kayit,
        | 'brans_kodu'
        | 'konu_id'
        | 'zorluk'
        | 'kaynak_test_id'
        | 'kaynak_metin'
        | 'dogru'
        | 'yanlis'
        | 'bos'
        | 'plan_gorev_id'
        | 'dosya_idleri'
      >;
    };

/** Olusturma ve duzeltmede ortak denetim: `mevcut` verilirse govdede olmayan alanlar ondan gelir. */
function kayitDogrula(
  kurumId: string,
  ogrenciId: string,
  g: Govde,
  mevcut: Kayit | null,
): Dogrulanmis {
  const k = gunlukSoruKoprusu(kurumId);
  const d = depo(kurumId);
  const var_ = (ad: string) => ad in g;
  const brans = var_('brans_kodu') ? metin(g.brans_kodu) : (mevcut?.brans_kodu ?? null);
  const konuId = var_('konu_id') ? metin(g.konu_id) : (mevcut?.konu_id ?? null);
  const zorluk = var_('zorluk') ? g.zorluk : mevcut?.zorluk;
  if (!brans || !konuId || !ZORLUKLAR.includes(zorluk as Zorluk)) return { hata: dogrulama() };
  const konu = k.konular.find((x) => x.id === konuId);
  if (konu?.brans_kodu !== brans) {
    return { hata: hata(422, 'konu_gecersiz', 'Konu geçersiz.') };
  }
  const sayilar = (['dogru', 'yanlis', 'bos'] as const).map((a) =>
    var_(a) ? sayiAl(g[a]) : (mevcut?.[a] ?? 0),
  );
  if (sayilar.some((s) => s === null)) return { hata: dogrulama() };
  const [dogru, yanlis, bos] = sayilar as [number, number, number];
  const toplam = dogru + yanlis + bos;
  if (toplam < 1 || toplam > 500) {
    return { hata: hata(422, 'soru_toplami_gecersiz', 'Toplam soru sayısı geçersiz.') };
  }
  const testId = var_('kaynak_test_id')
    ? g.kaynak_test_id === null
      ? null
      : metin(g.kaynak_test_id)
    : (mevcut?.kaynak_test_id ?? null);
  const kaynakMetin = var_('kaynak_metin')
    ? g.kaynak_metin === null
      ? null
      : metin(g.kaynak_metin)
    : (mevcut?.kaynak_metin ?? null);
  if (testId && kaynakMetin)
    return { hata: dogrulama('Kaynak testi ve metin birlikte verilemez.') };
  if (testId) {
    const kitap = d.kitaplar.find((b) => b.testler.some((t) => t.id === testId));
    if (kitap?.brans_kodu !== brans) {
      return { hata: hata(422, 'kaynak_testi_gecersiz', 'Kaynak testi geçersiz.') };
    }
  }
  const gorevId = var_('plan_gorev_id')
    ? g.plan_gorev_id === null
      ? null
      : metin(g.plan_gorev_id)
    : (mevcut?.plan_gorev_id ?? null);
  if (gorevId && !k.soruGorevi(ogrenciId, gorevId)) {
    return { hata: hata(422, 'plan_gorevi_gecersiz', 'Plan görevi geçersiz.') };
  }
  const dosyalar = var_('dosya_idleri')
    ? Array.isArray(g.dosya_idleri)
      ? g.dosya_idleri.filter((x): x is string => typeof x === 'string')
      : null
    : (mevcut?.dosya_idleri ?? []);
  if (!dosyalar || dosyalar.length > 5) return { hata: dogrulama() };
  if (
    dosyalar.some((id) => !(mevcut?.dosya_idleri.includes(id) ?? false) && !medyaMockHazirMi(id))
  ) {
    return { hata: hata(409, 'dosya_hazir_degil', 'Fotoğraf henüz hazır değil.') };
  }
  return {
    alanlar: {
      brans_kodu: brans,
      konu_id: konuId,
      zorluk: zorluk as Zorluk,
      kaynak_test_id: testId,
      kaynak_metin: kaynakMetin,
      dogru,
      yanlis,
      bos,
      plan_gorev_id: gorevId,
      dosya_idleri: dosyalar,
    },
  };
}

function kayitlarIsle(kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  const k = gunlukSoruKoprusu(kurumId);
  const d = depo(kurumId);
  const ogrenci = k.rol === 'ogrenci';

  if (p[0] === 'son-kullanilanlar' && p.length === 1 && i.yontem === 'GET') {
    if (!ogrenci) return izinYok();
    const bas = gunEkle(bugun(), -60);
    const benimkiler = d.kayitlar
      .filter((x) => x.ogrenci_id === k.benId && x.gun >= bas)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const dersler: unknown[] = [];
    for (const brans of [...new Set(benimkiler.map((x) => x.brans_kodu))].slice(0, 5)) {
      const liste = benimkiler.filter((x) => x.brans_kodu === brans);
      const konular = [...new Set(liste.map((x) => x.konu_id))].slice(0, 5).map((konuId) => {
        const son = liste.find((x) => x.konu_id === konuId);
        return {
          konu_id: konuId,
          konu_ad: k.konular.find((y) => y.id === konuId)?.ad ?? null,
          son_zorluk: son?.zorluk ?? 'orta',
        };
      });
      const anahtarlar = new Set<string>();
      const kaynaklar: unknown[] = [];
      for (const x of liste) {
        const anahtar = x.kaynak_test_id ?? x.kaynak_metin;
        if (!anahtar || anahtarlar.has(anahtar) || kaynaklar.length >= 5) continue;
        anahtarlar.add(anahtar);
        const kitap = d.kitaplar.find((b) => b.testler.some((t) => t.id === x.kaynak_test_id));
        const test = kitap?.testler.find((t) => t.id === x.kaynak_test_id);
        kaynaklar.push({
          kaynak_test_id: x.kaynak_test_id,
          kaynak_kitap_id: kitap?.id ?? null,
          kitap_ad: kitap?.ad ?? null,
          test_ad: test?.ad ?? null,
          kaynak_metin: x.kaynak_metin,
        });
      }
      dersler.push({
        brans_kodu: brans,
        son_kullanildi_at: liste[0]?.created_at ?? simdi(),
        konular,
        kaynaklar,
      });
    }
    return ok({ dersler });
  }

  if (p[0] !== 'kayitlar') return null;

  if (p.length === 1 && i.yontem === 'GET') {
    if (!ogrenci) return izinYok();
    const gun = i.sorgu.get('gun');
    const bas = i.sorgu.get('bas');
    const bit = i.sorgu.get('bit');
    const brans = i.sorgu.get('brans_kodu');
    const liste = d.kayitlar
      .filter((x) => x.ogrenci_id === k.benId)
      .filter((x) => (gun ? x.gun === gun : (!bas || x.gun >= bas) && (!bit || x.gun <= bit)))
      .filter((x) => !brans || x.brans_kodu === brans)
      .sort((a, b) => b.gun.localeCompare(a.gun) || b.created_at.localeCompare(a.created_at));
    const limit = Math.min(Math.max(Number(i.sorgu.get('limit') ?? 50) || 50, 1), 100);
    const imlec = i.sorgu.get('imlec');
    const basla = imlec ? liste.findIndex((x) => x.id === imlec) + 1 : 0;
    const dilim = liste.slice(basla, basla + limit);
    const sonraki = basla + limit < liste.length ? (dilim[dilim.length - 1]?.id ?? null) : null;
    return ok({ kayitlar: dilim.map((x) => kayitGorunumu(kurumId, x)), sonraki_imlec: sonraki });
  }

  if (p.length === 1 && i.yontem === 'POST') {
    if (!ogrenci) return izinYok();
    const g = nesne(i.govde);
    const istekId = metin(g.istek_id);
    const var_ = istekId
      ? d.kayitlar.find((x) => x.istek_id === istekId && x.ogrenci_id === k.benId)
      : undefined;
    if (var_) return ok(kayitGorunumu(kurumId, var_), 200);
    const gunGirdisi = metin(g.gun);
    if (gunGirdisi !== null) {
      if (!TARIH.test(gunGirdisi) || gunGirdisi > bugun() || gunGirdisi < gunEkle(bugun(), -6)) {
        return hata(422, 'gun_gecersiz', 'Gün geçersiz.');
      }
    }
    const s = kayitDogrula(kurumId, k.benId, g, null);
    if ('hata' in s) return s.hata;
    const kayit: Kayit = {
      id: uid(),
      ogrenci_id: k.benId,
      gun: gunGirdisi ?? bugun(),
      olusturma_gunu: bugun(),
      created_at: simdi(),
      istek_id: istekId,
      surum: 1,
      ...s.alanlar,
    };
    d.kayitlar.push(kayit);
    gorevleriEsitle(kurumId, [kayit.plan_gorev_id]);
    return ok(kayitGorunumu(kurumId, kayit), 201);
  }

  if (p.length === 2 && (i.yontem === 'PATCH' || i.yontem === 'DELETE')) {
    if (!ogrenci) return izinYok();
    const kayit = d.kayitlar.find((x) => x.id === p[1] && x.ogrenci_id === k.benId);
    if (!kayit) return bulunamadi();
    if (kayit.olusturma_gunu !== bugun()) {
      return hata(409, 'kayit_duzenlenemez', 'Kayıt yalnızca girildiği gün düzeltilebilir.');
    }
    if (i.yontem === 'DELETE') {
      d.kayitlar = d.kayitlar.filter((x) => x.id !== kayit.id);
      gorevleriEsitle(kurumId, [kayit.plan_gorev_id]);
      return { durum: 204 };
    }
    const g = nesne(i.govde);
    if (typeof g.surum === 'number' && g.surum !== kayit.surum) {
      return hata(409, 'surum_cakismasi', 'Kayıt bu arada değişti.');
    }
    const s = kayitDogrula(kurumId, k.benId, g, kayit);
    if ('hata' in s) return s.hata;
    const eskiGorev = kayit.plan_gorev_id;
    Object.assign(kayit, s.alanlar);
    kayit.surum += 1;
    gorevleriEsitle(kurumId, [eskiGorev, kayit.plan_gorev_id]);
    return ok(kayitGorunumu(kurumId, kayit));
  }
  return null;
}

// --- Kaynak kitaplar ----------------------------------------------------------------------------

function kitapGorunumu(kurumId: string, kitap: Kitap, ogrenciId: string | null, ayrinti: boolean) {
  const d = depo(kurumId);
  const cozulenGunler = new Map<string, string>();
  if (ogrenciId) {
    for (const x of d.kayitlar
      .filter((y) => y.ogrenci_id === ogrenciId && y.kaynak_test_id)
      .sort((a, b) => a.gun.localeCompare(b.gun))) {
      if (x.kaynak_test_id && !cozulenGunler.has(x.kaynak_test_id)) {
        cozulenGunler.set(x.kaynak_test_id, x.gun);
      }
    }
  }
  const testler = kitap.testler.map((t) => ({
    id: t.id,
    kitap_id: t.kitap_id,
    sira: t.sira,
    ad: t.ad,
    soru_sayisi: t.soru_sayisi,
    konu_id: t.konu_id,
    ...(ogrenciId ? { cozuldu_gun: cozulenGunler.get(t.id) ?? null } : {}),
  }));
  const govde = {
    id: kitap.id,
    ad: kitap.ad,
    yayinevi: kitap.yayinevi,
    brans_kodu: kitap.brans_kodu,
    kademe_id: null,
    sahip_uyelik_id: kitap.sahip_uyelik_id,
    aktif: kitap.aktif,
    test_sayisi: kitap.testler.length,
    toplam_soru: kitap.testler.reduce((a, t) => a + t.soru_sayisi, 0),
    ilerleme: ogrenciId
      ? {
          cozulen_test: kitap.testler.filter((t) => cozulenGunler.has(t.id)).length,
          toplam_test: kitap.testler.length,
        }
      : null,
    surum: kitap.surum,
    created_at: kitap.created_at,
  };
  return ayrinti ? { ...govde, testler } : govde;
}

function testGirdileri(ham: unknown): { ad: string; soru_sayisi: number }[] | null {
  if (!Array.isArray(ham)) return null;
  const sonuc: { ad: string; soru_sayisi: number }[] = [];
  for (const t of ham) {
    const o = nesne(t);
    const ad = metin(o.ad);
    const n = sayiAl(o.soru_sayisi);
    if (!ad || ad.length > 200 || n === null || n < 1) return null;
    sonuc.push({ ad, soru_sayisi: n });
  }
  return sonuc;
}

function kitaplarIsle(kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  if (p[0] !== 'kaynak-kitaplar') return null;
  const k = gunlukSoruKoprusu(kurumId);
  const d = depo(kurumId);
  const ogrenci = k.rol === 'ogrenci';
  const ilerlemeOgrencisi = (): string | null =>
    ogrenci ? k.benId : (i.sorgu.get('ogrenci_id') ?? null);

  if (p.length === 1 && i.yontem === 'GET') {
    const brans = i.sorgu.get('brans_kodu');
    const pasifler = !ogrenci && i.sorgu.get('pasifler') === 'true';
    const hedef = ilerlemeOgrencisi();
    const liste = d.kitaplar
      .filter((x) => (!brans || x.brans_kodu === brans) && (pasifler || x.aktif))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
    return ok({ kitaplar: liste.map((x) => kitapGorunumu(kurumId, x, hedef, false)) });
  }
  if (p.length === 1 && i.yontem === 'POST') {
    if (ogrenci) return izinYok();
    const g = nesne(i.govde);
    const ad = metin(g.ad);
    const brans = metin(g.brans_kodu);
    const testler = testGirdileri(g.testler ?? []);
    if (!ad || !brans || !testler) return dogrulama();
    const id = uid();
    const kitap: Kitap = {
      id,
      ad,
      yayinevi: metin(g.yayinevi),
      brans_kodu: brans,
      kademe_id: null,
      sahip_uyelik_id: k.rol === 'ogretmen' ? k.ogretmenId : null,
      aktif: true,
      surum: 1,
      created_at: simdi(),
      testler: testler.map((t, n) => ({
        id: uid(),
        kitap_id: id,
        sira: n + 1,
        konu_id: null,
        ...t,
      })),
    };
    d.kitaplar.push(kitap);
    return ok(kitapGorunumu(kurumId, kitap, null, true), 201);
  }

  const kitap = d.kitaplar.find((x) => x.id === p[1]);
  if (!kitap) return bulunamadi();
  if (ogrenci && !kitap.aktif && i.yontem === 'GET') return bulunamadi();

  if (p.length === 2 && i.yontem === 'GET') {
    return ok(kitapGorunumu(kurumId, kitap, ilerlemeOgrencisi(), true));
  }
  if (p.length === 2 && i.yontem === 'PATCH') {
    if (ogrenci) return izinYok();
    const g = nesne(i.govde);
    if (typeof g.surum === 'number' && g.surum !== kitap.surum) {
      return hata(409, 'surum_cakismasi', 'Kitap bu arada değişti.');
    }
    if ('ad' in g) {
      const ad = metin(g.ad);
      if (!ad) return dogrulama();
      kitap.ad = ad;
    }
    if ('yayinevi' in g) kitap.yayinevi = metin(g.yayinevi);
    if (typeof g.aktif === 'boolean') kitap.aktif = g.aktif;
    kitap.surum += 1;
    return ok(kitapGorunumu(kurumId, kitap, null, false));
  }
  if (p[2] === 'testler') {
    if (ogrenci) return izinYok();
    if (p.length === 3 && i.yontem === 'POST') {
      const testler = testGirdileri(nesne(i.govde).testler);
      if (!testler || testler.length === 0) return dogrulama();
      let sira = kitap.testler.reduce((a, t) => Math.max(a, t.sira), 0);
      for (const t of testler) {
        sira += 1;
        kitap.testler.push({ id: uid(), kitap_id: kitap.id, sira, konu_id: null, ...t });
      }
      return ok(kitapGorunumu(kurumId, kitap, null, true), 201);
    }
    const test = kitap.testler.find((x) => x.id === p[3]);
    if (!test) return bulunamadi();
    if (p.length === 4 && i.yontem === 'PATCH') {
      const g = nesne(i.govde);
      if ('ad' in g) {
        const ad = metin(g.ad);
        if (!ad) return dogrulama();
        test.ad = ad;
      }
      if ('soru_sayisi' in g) {
        const n = sayiAl(g.soru_sayisi);
        if (n === null || n < 1) return dogrulama();
        test.soru_sayisi = n;
      }
      return ok({ ...test, cozuldu_gun: undefined });
    }
    if (p.length === 4 && i.yontem === 'DELETE') {
      if (d.kayitlar.some((x) => x.kaynak_test_id === test.id)) {
        return hata(409, 'kaynak_testi_kullanimda', 'Test kullanımda.');
      }
      kitap.testler = kitap.testler.filter((x) => x.id !== test.id);
      return { durum: 204 };
    }
  }
  return null;
}

// --- Gorev ver ----------------------------------------------------------------------------------

function gorevVer(kurumId: string, ogrenciId: string, i: MockIstek): MockYanit {
  const k = gunlukSoruKoprusu(kurumId);
  const g = nesne(i.govde);
  const brans = metin(g.brans_kodu);
  const konuId = metin(g.konu_id);
  const zorluk = g.zorluk as Zorluk;
  const n = sayiAl(g.soru_sayisi);
  const tur = g.tur;
  if (!brans || !konuId || !ZORLUKLAR.includes(zorluk) || n === null || n < 1) return dogrulama();
  if (tur !== 'plan_gorevi' && tur !== 'odev') return dogrulama();
  if (!k.ogrenciler.some((o) => o.id === ogrenciId)) return bulunamadi();
  const konu = k.konular.find((x) => x.id === konuId);
  if (konu?.brans_kodu !== brans) {
    return hata(422, 'gorev_hedefi_gecersiz', 'Görev hedefi geçersiz.');
  }
  const baslik = `${konu.ad}: ${zorluk} seviyeden ${String(n)} soru`;
  if (tur === 'plan_gorevi') {
    const gun = metin(g.gun) ?? gunEkle(bugun(), 1);
    if (!TARIH.test(gun)) return dogrulama();
    const sonuc = k.planaGorevEkle({ ogrenciId, gun, brans, konuId, baslik, miktar: n });
    if (!sonuc) return hata(409, 'plan_kilitli', 'Bu hafta kilitli.');
    return ok({ tur: 'plan_gorevi', ...sonuc }, 201);
  }
  const sonTeslim = metin(g.son_teslim_at) ?? new Date(mockSimdi() + 3 * GUN_MS).toISOString();
  const odev = k.odevVer({ ogrenciId, brans, konuId, baslik, miktar: n, sonTeslimAt: sonTeslim });
  return ok({ tur: 'odev', odev_id: odev.id, son_teslim_at: sonTeslim }, 201);
}

// --- Giris --------------------------------------------------------------------------------------

export function gunlukSoruMock(istek: MockIstek): MockYanit | null {
  const parcalar = istek.yol.split('/');
  if (parcalar[0] !== 'kurumlar' || !parcalar[1] || !(parcalar[1] in MOCK_KURUM_ROLLERI)) {
    return null;
  }
  const kurumId = parcalar[1];
  const p = parcalar.slice(2);
  const k = gunlukSoruKoprusu(kurumId);
  const ogrenci = k.rol === 'ogrenci';

  if (p[0] === 'gunluk-soru') {
    const alt = p.slice(1);
    if (alt[0] === 'analiz' && alt.length === 1 && istek.yontem === 'GET') {
      return ogrenci ? analizYap(kurumId, k.benId, istek, false) : izinYok();
    }
    if (alt[0] === 'analiz' && alt[1] === 'hucre' && istek.yontem === 'GET') {
      return ogrenci ? hucreYaniti(kurumId, k.benId, istek) : izinYok();
    }
    if (alt[0] === 'sinif-analizi' && istek.yontem === 'GET') {
      return ogrenci ? izinYok() : sinifAnalizi(kurumId, istek);
    }
    return kayitlarIsle(kurumId, alt, istek);
  }
  if (p[0] === 'kaynak-kitaplar') return kitaplarIsle(kurumId, p, istek);
  if (p[0] === 'ogrenciler' && p[1] && p[2] === 'gunluk-soru') {
    if (ogrenci) return izinYok();
    if (!k.ogrenciler.some((o) => o.id === p[1])) return bulunamadi();
    if (p[3] === 'analiz' && p.length === 4 && istek.yontem === 'GET') {
      return analizYap(kurumId, p[1], istek, true);
    }
    if (p[3] === 'analiz' && p[4] === 'hucre' && istek.yontem === 'GET') {
      return hucreYaniti(kurumId, p[1], istek);
    }
    if (p[3] === 'haftalik-ozet' && istek.yontem === 'GET')
      return haftalikOzet(kurumId, p[1], istek);
    if (p[3] === 'gorev-ver' && istek.yontem === 'POST') return gorevVer(kurumId, p[1], istek);
  }
  return null;
}

// --- Kocluk gorunumu koprusu --------------------------------------------------------------------
// `degerlendirme-mock.ts` kitap, kaynak kullanimi ve konu analizi ozetine yalniz bu fonksiyonlarla erisir.

/** Kurumun kaynak kitaplari (testleriyle). */
export function koclukKitaplari(kurumId: string) {
  return depo(kurumId).kitaplar.map((k) => ({
    id: k.id,
    ad: k.ad,
    brans_kodu: k.brans_kodu,
    testler: k.testler.map((x) => ({ id: x.id, ad: x.ad })),
  }));
}

/** Ogrencinin gunluk kayitlarindan kitap bazli ilerleme ve serbest kaynak kullanimi (son 90 gun). */
export function koclukKaynakKullanimi(kurumId: string, ogrenciId: string) {
  const d = depo(kurumId);
  const bas = gunEkle(bugun(), -89);
  const benim = d.kayitlar.filter((x) => x.ogrenci_id === ogrenciId && x.gun >= bas);
  const kitaplar = d.kitaplar
    .map((kitap) => {
      const testIdleri = new Set(kitap.testler.map((x) => x.id));
      const liste = benim.filter((x) => x.kaynak_test_id && testIdleri.has(x.kaynak_test_id));
      if (liste.length === 0) return null;
      return {
        kaynak_kitap_id: kitap.id,
        ad: kitap.ad,
        brans_kodu: kitap.brans_kodu,
        cozulen_test: new Set(liste.map((x) => x.kaynak_test_id)).size,
        toplam_test: kitap.testler.length,
        kayit_sayisi: liste.length,
        cozulen_soru: liste.reduce((n, x) => n + x.dogru + x.yanlis + x.bos, 0),
        son_kullanim_gun:
          liste
            .map((x) => x.gun)
            .sort()
            .at(-1) ?? bugun(),
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.son_kullanim_gun.localeCompare(a.son_kullanim_gun));
  const serbestHarita = new Map<
    string,
    { ad: string; kayit_sayisi: number; son_kullanim_gun: string }
  >();
  for (const x of benim) {
    const ad = x.kaynak_metin?.trim();
    if (!ad) continue;
    const anahtar = ad.toLowerCase();
    const mevcut = serbestHarita.get(anahtar);
    const sonGun = mevcut && mevcut.son_kullanim_gun > x.gun ? mevcut.son_kullanim_gun : x.gun;
    serbestHarita.set(anahtar, {
      ad: mevcut?.ad ?? ad,
      kayit_sayisi: (mevcut?.kayit_sayisi ?? 0) + 1,
      son_kullanim_gun: sonGun,
    });
  }
  return { kitaplar, serbest: [...serbestHarita.values()], odevler: [] as never[] };
}

/**
 * Onerilen kaynak "basladi mi": oneriden sonra olusturulan bir gunluk kayitta o kitap/test ya da ayni metin
 * (buyuk/kucuk harf ve bosluk gozetilmez) kullanildiysa.
 */
export function koclukBasladiMi(
  kurumId: string,
  ogrenciId: string,
  o: { kitapId?: string | null; testId?: string | null; metin?: string | null; sonra: string },
) {
  const d = depo(kurumId);
  const kitapTestleri = new Set(
    d.kitaplar.find((k) => k.id === o.kitapId)?.testler.map((x) => x.id) ?? [],
  );
  const metin = o.metin?.trim().toLowerCase();
  const liste = d.kayitlar.filter(
    (x) =>
      x.ogrenci_id === ogrenciId &&
      x.created_at >= o.sonra &&
      (x.kaynak_test_id !== null && o.testId === x.kaynak_test_id
        ? true
        : x.kaynak_test_id !== null && !o.testId && kitapTestleri.has(x.kaynak_test_id)
          ? true
          : metin !== undefined && metin !== '' && x.kaynak_metin?.trim().toLowerCase() === metin),
  );
  const gunler = liste.map((x) => x.gun).sort();
  return {
    basladi: liste.length > 0,
    ilk_kullanim_gun: gunler[0] ?? null,
    son_kullanim_gun: gunler.at(-1) ?? null,
    kayit_sayisi: liste.length,
  };
}

/** Son 30 gunun konu analizi ozeti (kocluk yaniti `konu_analizi`). */
export function koclukKonuAnalizi(kurumId: string, ogrenciId: string) {
  const bit = bugun();
  const bas = gunEkle(bit, -29);
  const d = depo(kurumId);
  const branslar = [
    ...new Set(
      d.kayitlar
        .filter((x) => x.ogrenci_id === ogrenciId && x.gun >= bas && x.gun <= bit)
        .map((x) => x.brans_kodu),
    ),
  ].slice(0, 4);
  const istek = (sorgu: Record<string, string>): MockIstek => ({
    yontem: 'GET',
    yol: '',
    sorgu: new URLSearchParams(sorgu),
    govde: undefined,
    basliklar: {},
  });
  interface HucreOzeti {
    cozulen: number;
    dogru: number;
    yanlis: number;
    bos: number;
    basari: number | null;
  }
  const bransler = branslar.map((b) => {
    const y = analizYap(kurumId, ogrenciId, istek({ brans_kodu: b, donem: '30' }), true).govde as {
      konular: { toplam: HucreOzeti }[];
      toplam: HucreOzeti;
      oneriler: unknown[];
    };
    const zayif = y.konular
      .filter((k) => k.toplam.cozulen >= 5 && k.toplam.basari !== null)
      .sort((a, c) => (a.toplam.basari ?? 1) - (c.toplam.basari ?? 1))
      .slice(0, 5);
    return { brans_kodu: b, toplam: y.toplam, zayif_konular: zayif, oneriler: y.oneriler };
  });
  const toplam = bransler.reduce<HucreOzeti>(
    (t, b) => ({
      cozulen: t.cozulen + b.toplam.cozulen,
      dogru: t.dogru + b.toplam.dogru,
      yanlis: t.yanlis + b.toplam.yanlis,
      bos: t.bos + b.toplam.bos,
      basari: null,
    }),
    { cozulen: 0, dogru: 0, yanlis: 0, bos: 0, basari: null },
  );
  toplam.basari = basariOrani(toplam.dogru, toplam.dogru + toplam.yanlis + toplam.bos);
  return {
    bas,
    bit,
    toplam,
    haftalik_ozet: haftalikOzet(kurumId, ogrenciId, istek({})).govde,
    bransler,
  };
}
