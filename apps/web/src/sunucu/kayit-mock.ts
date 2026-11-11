import { mockDersBaglami, type MockDers } from './ders-mock';
import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import type { MockIstek, MockYanit } from './vekil';

import { urlCoz } from '@/lib/kayit/saglayici';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken ders kayitlari, materyaller ve ders sonu geri bildirimi uclarinin bellek
 * ici karsiligi (`services/api` `kaynak-yollari.ts`, `kayitlarim-yollari.ts`, `geri-bildirim-yollari.ts`).
 * Yanit sekilleri `@kopru/contracts` ile aynidir.
 *
 * Bilerek kurumlar arasi ORTAK bir depo: mock kurumlarinin kimlikleri (grup, ders, uye) her kurumda
 * rastgele uretilir; ogretmen kurumunda eklenen kayit, ogrenci kurumunda gorunsun diye kayitlar grup
 * adi + ders basligi, ogrenciler ad ile eslestirilir. Gercek api'de bu bir kurum icindeki tek varliktir.
 * Yalniz deneme ve e2e icindir.
 */

type Kayit = Record<string, unknown>;
type Deger = 'anladim' | 'kismen' | 'anlamadim';

interface Kaynak {
  id: string;
  tur: 'kayit' | 'materyal';
  /** `grupAdi|dersBasligi`; materyalde `null`. */
  dersAnahtar: string | null;
  grupAd: string;
  baslik: string;
  saglayici: string;
  url: string;
  parola: string | null;
  gecerlilik: string | null;
  gorunurluk: 'ogretmen' | 'grup' | 'secili_ogrenciler';
  ogrenciAdlari: string[];
  konuId: string | null;
  durum: 'aktif' | 'bozuk' | 'gizli' | 'suresi_doldu';
  olusturma: string;
  guncelleme: string;
  bransKodu: string | null;
}

interface Sorun {
  id: string;
  kaynakId: string;
  ogrenciAd: string;
  neden: string;
  aciklama: string | null;
  durum: 'acik' | 'cozuldu';
  olusturma: string;
  cozuldu: string | null;
}

interface GeriBildirim {
  id: string;
  dersId: string;
  dersAnahtar: string;
  ogrenciAd: string;
  deger: Deger;
  konuId: string | null;
  not: string | null;
  olusturma: string;
  guncelleme: string;
  bransKodu: string;
  ogretmenAd: string;
  dersBaslangic: string;
  dersBitis: string;
}

interface Depo {
  kaynaklar: Kaynak[];
  /** `kaynakId` -> ogrenci adi -> izlenme zamani. */
  izlemeler: Map<string, Map<string, string>>;
  sorunlar: Sorun[];
  geriBildirimler: GeriBildirim[];
}

const SAAT_MS = 3_600_000;
const GUN_MS = 86_400_000;
const UTC3_MS = 3 * SAAT_MS;
const uid = () => crypto.randomUUID();
const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = (m = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', m);
const govdeNesnesi = (g: unknown): Kayit =>
  typeof g === 'object' && g !== null ? (g as Kayit) : {};
const yerelTarih = (iso: string) => new Date(Date.parse(iso) + UTC3_MS).toISOString().slice(0, 10);
const onceki = (gun: number, saat = 0) =>
  new Date(Date.now() - gun * GUN_MS - saat * SAAT_MS).toISOString();
const sonraki = (gun: number) => new Date(Date.now() + gun * GUN_MS).toISOString();

// --- Tohum -------------------------------------------------------------------------------------

const SINIF = '9-A Sınıfı';
const OGRETMENLER = ['Burcu Tekin', 'Hasan Polat', 'Gül Yücel'];
const OGRENCILER = ['Ayşe Demir', 'Çağlar Yıldız', 'Elif Şahin', 'Mehmet Öztürk', 'Zeynep Kaya'];
/** Ogrenci deneme kurumunun (`kurum-atlas`) kimligi. */
const OGRENCI_ADI = 'Çağlar Yıldız';

function kaynakYap(ek: Partial<Kaynak> & Pick<Kaynak, 'baslik' | 'url' | 'saglayici'>): Kaynak {
  return {
    id: uid(),
    tur: 'kayit',
    dersAnahtar: null,
    grupAd: SINIF,
    parola: null,
    gecerlilik: null,
    gorunurluk: 'grup',
    ogrenciAdlari: [],
    konuId: null,
    durum: 'aktif',
    olusturma: onceki(0, 2),
    guncelleme: onceki(0, 2),
    bransKodu: 'matematik',
    ...ek,
  };
}

function tohum(): Depo {
  const kaynaklar: Kaynak[] = [
    kaynakYap({
      baslik: 'Denklemler: Zoom kaydı',
      saglayici: 'zoom',
      url: 'https://us02web.zoom.us/rec/share/denklemler-ornek',
      parola: 'Kopru#2026',
      gecerlilik: sonraki(12),
      dersAnahtar: `${SINIF}|Denklemler`,
    }),
    kaynakYap({
      baslik: 'Denklemler: tahta çözümleri (Drive)',
      saglayici: 'drive',
      url: 'https://drive.google.com/file/d/1denklemler-tahta/view',
      dersAnahtar: `${SINIF}|Denklemler`,
      durum: 'bozuk',
      olusturma: onceki(0, 1),
    }),
    kaynakYap({
      baslik: 'Yalnız öğretmen: ders taslağı',
      saglayici: 'drive',
      url: 'https://docs.google.com/document/d/1taslak/edit',
      dersAnahtar: `${SINIF}|Denklemler`,
      gorunurluk: 'ogretmen',
    }),
    kaynakYap({
      tur: 'materyal',
      baslik: 'Üslü sayılar konu anlatımı',
      saglayici: 'youtube',
      url: 'https://www.youtube.com/watch?v=uslu-sayilar',
      olusturma: onceki(2),
    }),
    kaynakYap({
      tur: 'materyal',
      baslik: 'Geometri formül klasörü',
      saglayici: 'drive',
      url: 'https://drive.google.com/drive/folders/1geometri',
      olusturma: onceki(3),
      bransKodu: 'geometri',
    }),
    ...Array.from({ length: 28 }, (_, i) =>
      kaynakYap({
        tur: 'materyal',
        baslik: `Haftalık ders notu ${String(28 - i)}`,
        saglayici: 'drive',
        url: `https://drive.google.com/file/d/1not${String(i)}/view`,
        olusturma: onceki(5 + i),
        guncelleme: onceki(5 + i),
      }),
    ),
  ];
  const sorunlar: Sorun[] = [
    {
      id: uid(),
      kaynakId: kaynaklar[1]?.id ?? '',
      ogrenciAd: 'Ayşe Demir',
      neden: 'acilmiyor',
      aciklama: 'Erişim izni istiyor.',
      durum: 'acik',
      olusturma: onceki(0, 1),
      cozuldu: null,
    },
  ];
  const izlemeler = new Map<string, Map<string, string>>();
  const izle = (k: Kaynak | undefined, adlar: string[]) => {
    if (!k) return;
    izlemeler.set(k.id, new Map(adlar.map((a, i) => [a, onceki(0, 1 + i * 0.2)])));
  };
  izle(kaynaklar[0], ['Ayşe Demir', 'Mehmet Öztürk']);
  izle(kaynaklar[3], [OGRENCI_ADI, 'Ayşe Demir', 'Elif Şahin', 'Zeynep Kaya']);

  const geriBildirimler: GeriBildirim[] = [];
  const bitis = onceki(0, 2);
  const denklem = (ad: string, deger: Deger, not: string | null): GeriBildirim => ({
    id: uid(),
    dersId: uid(),
    dersAnahtar: `${SINIF}|Denklemler`,
    ogrenciAd: ad,
    deger,
    konuId: null,
    not,
    olusturma: onceki(0, 1),
    guncelleme: onceki(0, 1),
    bransKodu: 'matematik',
    ogretmenAd: 'Burcu Tekin',
    dersBaslangic: onceki(0, 3),
    dersBitis: bitis,
  });
  geriBildirimler.push(
    denklem('Ayşe Demir', 'anladim', null),
    denklem('Elif Şahin', 'kismen', 'İki bilinmeyenli kısmı biraz hızlı geçti.'),
    denklem('Mehmet Öztürk', 'anlamadim', null),
    denklem('Zeynep Kaya', 'anladim', null),
  );
  // Gecmis haftalar: ozet sayfasi ve ogrenci kartindaki liste icin.
  const BRANSLAR = ['matematik', 'fizik', 'turkce'];
  for (let g = 1; g <= 28; g += 1) {
    OGRETMENLER.forEach((ogretmen, o) => {
      if ((g + o) % 2 !== 0) return;
      OGRENCILER.slice(0, 4).forEach((ad, s) => {
        const v = (g + o + s) % 5;
        const deger: Deger = v <= 2 ? 'anladim' : v === 3 ? 'kismen' : 'anlamadim';
        const bit = onceki(g, 1);
        geriBildirimler.push({
          id: uid(),
          dersId: uid(),
          dersAnahtar: `gecmis|${String(g)}|${String(o)}`,
          ogrenciAd: ad,
          deger,
          konuId: null,
          not: null,
          olusturma: bit,
          guncelleme: bit,
          bransKodu: BRANSLAR[o] ?? 'matematik',
          ogretmenAd: ogretmen,
          dersBaslangic: onceki(g, 2),
          dersBitis: bit,
        });
      });
    });
  }
  geriBildirimler.push({
    ...denklem(OGRENCI_ADI, 'kismen', 'Problemler kısmında takıldım.'),
    id: uid(),
    dersAnahtar: 'gecmis|ozel',
    bransKodu: 'fizik',
    ogretmenAd: 'Hasan Polat',
    dersBaslangic: onceki(3, 2),
    dersBitis: onceki(3, 1),
    olusturma: onceki(3),
    guncelleme: onceki(3),
  });
  return { kaynaklar, izlemeler, sorunlar, geriBildirimler };
}

const kutu = globalThis as unknown as { __kopruKayitMock?: Depo };
function depo(): Depo {
  kutu.__kopruKayitMock ??= tohum();
  return kutu.__kopruKayitMock;
}

/** Testler: kayit ve geri bildirim verisini bastan kurar. */
export function kayitMockSifirla(): void {
  kutu.__kopruKayitMock = undefined;
}

// --- Kurum baglami ------------------------------------------------------------------------------

type Baglam = ReturnType<typeof mockDersBaglami> & { kurumId: string };

function baglam(kurumId: string): Baglam {
  return { ...mockDersBaglami(kurumId), kurumId };
}

const adOf = (b: Baglam, uyelikId: string) =>
  b.uyeler.find((u) => u.uyelik_id === uyelikId)?.gorunen_ad ?? null;
const idOf = (b: Baglam, ad: string) =>
  b.uyeler.find((u) => u.gorunen_ad === ad)?.uyelik_id ?? null;
const grupAdi = (b: Baglam, grupId: string) => b.gruplar.find((g) => g.id === grupId)?.ad ?? '';
const dersAnahtari = (b: Baglam, d: MockDers) =>
  `${grupAdi(b, d.grup_id)}|${d.baslik ?? d.brans_kodu}`;

function yerelDers(b: Baglam, k: Kaynak): MockDers | null {
  if (k.dersAnahtar === null) return null;
  return (
    b.dersler
      .filter((d) => dersAnahtari(b, d) === k.dersAnahtar)
      .sort((x, y) => Date.parse(x.baslangic_at) - Date.parse(y.baslangic_at))[0] ?? null
  );
}
const yerelGrup = (b: Baglam, k: Kaynak) => b.gruplar.find((g) => g.ad === k.grupAd);

function grupKatilimcilari(b: Baglam, grupId: string): string[] {
  const uyeler = mockKurumVerisi(b.kurumId).grupUyeleri[grupId] ?? [];
  return uyeler.filter((u) => u.bitis_tarihi === null).map((u) => u.ogrenci_id as string);
}

/** Kaynagin bu kurumda karsiligi var mi (grup ve gerekiyorsa ders)? */
function kurumdaVar(b: Baglam, k: Kaynak): boolean {
  if (!yerelGrup(b, k)) return false;
  return k.dersAnahtar === null || yerelDers(b, k) !== null;
}

function hedefAdlari(b: Baglam, k: Kaynak): string[] {
  if (k.gorunurluk === 'ogretmen') return [];
  if (k.gorunurluk === 'secili_ogrenciler') return k.ogrenciAdlari;
  const ders = yerelDers(b, k);
  const grup = yerelGrup(b, k);
  const idler = ders ? ders.katilimcilar : grup ? grupKatilimcilari(b, grup.id) : [];
  return idler.map((id) => adOf(b, id)).filter((a): a is string => a !== null);
}

function durumu(k: Kaynak): Kaynak['durum'] {
  if (k.durum === 'aktif' && k.gecerlilik !== null && Date.parse(k.gecerlilik) < Date.now()) {
    return 'suresi_doldu';
  }
  return k.durum;
}

function sanalAcikSorun(d: Depo, k: Kaynak): number {
  return d.sorunlar.filter((s) => s.kaynakId === k.id && s.durum === 'acik').length;
}

function temel(b: Baglam, k: Kaynak): Kayit {
  const ders = yerelDers(b, k);
  const grup = yerelGrup(b, k);
  const urlSonucu = urlCoz(k.url);
  return {
    id: k.id,
    tur: k.tur,
    ders_id: ders?.id ?? null,
    grup_id: grup?.id ?? '',
    baslik: k.baslik,
    saglayici: urlSonucu.ok ? urlSonucu.saglayici : k.saglayici,
    url: k.url,
    parola_var: k.parola !== null,
    gecerlilik_bitis_at: k.gecerlilik,
    gorunurluk: k.gorunurluk,
    konu_id: k.konuId,
    durum: durumu(k),
    ekleyen_id: b.ogretmenId,
    created_at: k.olusturma,
    updated_at: k.guncelleme,
    ders_baslangic_at: ders?.baslangic_at ?? null,
    brans_kodu: ders?.brans_kodu ?? k.bransKodu,
    ogretmen_id: ders?.ogretmen_id ?? b.ogretmenId,
  };
}

function kaynakSatiri(d: Depo, b: Baglam, k: Kaynak): Kayit {
  return {
    ...temel(b, k),
    izleyen_sayisi: izleyenler(d, b, k).length,
    acik_sorun_sayisi: sanalAcikSorun(d, k),
  };
}

function kaynakDetayi(d: Depo, b: Baglam, k: Kaynak): Kayit {
  return {
    ...kaynakSatiri(d, b, k),
    parola: k.parola,
    ogrenci_idleri:
      k.gorunurluk === 'secili_ogrenciler'
        ? k.ogrenciAdlari.map((a) => idOf(b, a)).filter((x): x is string => x !== null)
        : null,
  };
}

function izleyenler(d: Depo, b: Baglam, k: Kaynak): string[] {
  const harita = d.izlemeler.get(k.id);
  return hedefAdlari(b, k).filter((a) => harita?.has(a));
}

// --- Liste --------------------------------------------------------------------------------------

function suzgecUyar(b: Baglam, k: Kaynak, q: URLSearchParams, personel: boolean): boolean {
  const ders = yerelDers(b, k);
  const grup = yerelGrup(b, k);
  const tur = q.get('tur');
  const brans = q.get('brans_kodu');
  const grupId = q.get('grup_id');
  const dersId = q.get('ders_id');
  const konuId = q.get('konu_id');
  const durum = q.get('durum');
  const bas = q.get('baslangic');
  const bit = q.get('bitis');
  const tarih = yerelTarih(ders?.baslangic_at ?? k.olusturma);
  return (
    (!tur || k.tur === tur) &&
    (!brans || (ders?.brans_kodu ?? k.bransKodu) === brans) &&
    (!grupId || grup?.id === grupId) &&
    (!dersId || ders?.id === dersId) &&
    (!konuId || k.konuId === konuId) &&
    (!durum || !personel || durumu(k) === durum) &&
    (!bas || tarih >= bas) &&
    (!bit || tarih <= bit)
  );
}

function sayfala<T>(liste: T[], q: URLSearchParams) {
  const limit = Math.min(Math.max(Number(q.get('limit') ?? 30) || 30, 1), 100);
  const basla = Math.max(Number(q.get('imlec') ?? 0) || 0, 0);
  const dilim = liste.slice(basla, basla + limit);
  return { dilim, sonraki: basla + limit < liste.length ? String(basla + limit) : null };
}

const tarihSirasi = (b: Baglam, k: Kaynak) =>
  Date.parse(yerelDers(b, k)?.baslangic_at ?? k.olusturma);

// --- Kaynak yazma -------------------------------------------------------------------------------

function linkleriOku(g: Kayit): { ok: true; linkler: Kayit[] } | { ok: false; yanit: MockYanit } {
  const linkler = g.linkler;
  if (!Array.isArray(linkler) || linkler.length === 0 || linkler.length > 20) {
    return { ok: false, yanit: dogrulama('En az bir, en çok 20 bağlantı.') };
  }
  return { ok: true, linkler: linkler.map(govdeNesnesi) };
}

function gorunurlukOku(g: Kayit) {
  const gorunurluk = g.gorunurluk ?? 'grup';
  if (gorunurluk !== 'grup' && gorunurluk !== 'ogretmen' && gorunurluk !== 'secili_ogrenciler') {
    return null;
  }
  const idler = Array.isArray(g.ogrenci_idleri) ? (g.ogrenci_idleri as string[]) : [];
  return { gorunurluk, idler } as const;
}

function ekle(
  d: Depo,
  b: Baglam,
  g: Kayit,
  hedef: {
    tur: 'kayit' | 'materyal';
    grupAd: string;
    dersAnahtar: string | null;
    brans: string | null;
  },
  uygunAlicilar: string[],
): MockYanit {
  const link = linkleriOku(g);
  if (!link.ok) return link.yanit;
  const gor = gorunurlukOku(g);
  if (!gor) return dogrulama();
  if (gor.gorunurluk === 'secili_ogrenciler' && gor.idler.length === 0) return dogrulama();
  if (gor.gorunurluk !== 'secili_ogrenciler' && gor.idler.length > 0) return dogrulama();
  const adlar = gor.idler.map((id) => adOf(b, id));
  if (adlar.some((a) => a === null || !uygunAlicilar.includes(a))) {
    return hata(
      422,
      'kaynak_alici_gecersiz',
      'Seçilen öğrencilerden biri bu dersin ya da grubun etkin üyesi değil.',
    );
  }
  const yeniler: Kaynak[] = [];
  for (const l of link.linkler) {
    const baslik = typeof l.baslik === 'string' ? l.baslik.trim() : '';
    const url = typeof l.url === 'string' ? l.url : '';
    if (baslik.length === 0 || url.length === 0) return dogrulama();
    const sonuc = urlCoz(url);
    if (!sonuc.ok) {
      return hata(422, 'kaynak_url_gecersiz', 'Bağlantı geçersiz.', { alan: 'url' });
    }
    const bitis = typeof l.gecerlilik_bitis_at === 'string' ? l.gecerlilik_bitis_at : null;
    if (bitis !== null && Date.parse(bitis) <= Date.now()) {
      return hata(422, 'kaynak_suresi_gecmis', 'Son erişim tarihi gelecekte olmalı.');
    }
    yeniler.push(
      kaynakYap({
        tur: hedef.tur,
        dersAnahtar: hedef.dersAnahtar,
        grupAd: hedef.grupAd,
        baslik,
        url: sonuc.url,
        saglayici: sonuc.saglayici,
        parola: typeof l.parola === 'string' && l.parola.length > 0 ? l.parola : null,
        gecerlilik: bitis,
        gorunurluk: gor.gorunurluk,
        ogrenciAdlari: adlar as string[],
        konuId: typeof l.konu_id === 'string' ? l.konu_id : null,
        bransKodu: hedef.brans,
        olusturma: new Date().toISOString(),
        guncelleme: new Date().toISOString(),
      }),
    );
  }
  d.kaynaklar.unshift(...yeniler);
  return { durum: 201, govde: { kaynaklar: yeniler.map((k) => kaynakDetayi(d, b, k)) } };
}

function guncelle(d: Depo, b: Baglam, k: Kaynak, g: Kayit, uygunAlicilar: string[]): MockYanit {
  if (Object.keys(g).length === 0) return dogrulama('En az bir alan verilmeli.');
  if (typeof g.baslik === 'string') {
    if (g.baslik.trim().length === 0) return dogrulama();
    k.baslik = g.baslik.trim();
  }
  if (typeof g.url === 'string') {
    const sonuc = urlCoz(g.url);
    if (!sonuc.ok) return hata(422, 'kaynak_url_gecersiz', 'Bağlantı geçersiz.', { alan: 'url' });
    k.url = sonuc.url;
    k.saglayici = sonuc.saglayici;
  }
  if (g.parola === null) k.parola = null;
  else if (typeof g.parola === 'string') k.parola = g.parola;
  if (g.gecerlilik_bitis_at === null) k.gecerlilik = null;
  else if (typeof g.gecerlilik_bitis_at === 'string') k.gecerlilik = g.gecerlilik_bitis_at;
  if (g.konu_id === null) k.konuId = null;
  else if (typeof g.konu_id === 'string') k.konuId = g.konu_id;
  if (g.gorunurluk !== undefined) {
    const gor = gorunurlukOku(g);
    if (!gor) return dogrulama();
    if (gor.gorunurluk === 'secili_ogrenciler') {
      const adlar = gor.idler.map((id) => adOf(b, id));
      if (adlar.length === 0) return dogrulama();
      if (adlar.some((a) => a === null || !uygunAlicilar.includes(a))) {
        return hata(422, 'kaynak_alici_gecersiz', 'Alıcı geçersiz.');
      }
      k.ogrenciAdlari = adlar as string[];
    }
    k.gorunurluk = gor.gorunurluk;
  }
  if (g.durum === 'gizli') k.durum = 'gizli';
  else if (g.durum === 'aktif') k.durum = 'aktif';
  k.guncelleme = new Date().toISOString();
  return { durum: 200, govde: kaynakDetayi(d, b, k) };
}

// --- Yonlendirme: kaynaklar ve kayitlarim --------------------------------------------------------

function personelKaynak(d: Depo, b: Baglam, parca: string[], istek: MockIstek): MockYanit {
  const [, id, alt, alt2] = parca;
  const { yontem, sorgu } = istek;
  if (!id) {
    if (yontem !== 'GET') return bulunamadi();
    const liste = d.kaynaklar
      .filter((k) => kurumdaVar(b, k) && suzgecUyar(b, k, sorgu, true))
      .sort((x, y) => tarihSirasi(b, y) - tarihSirasi(b, x));
    const { dilim, sonraki: s } = sayfala(liste, sorgu);
    return {
      durum: 200,
      govde: { kaynaklar: dilim.map((k) => kaynakSatiri(d, b, k)), sonraki_imlec: s },
    };
  }
  const k = d.kaynaklar.find((x) => x.id === id && kurumdaVar(b, x));
  if (!k) return bulunamadi();
  const alicilar = () => {
    const ders = yerelDers(b, k);
    const grup = yerelGrup(b, k);
    const idler = ders ? ders.katilimcilar : grup ? grupKatilimcilari(b, grup.id) : [];
    return idler.map((x) => adOf(b, x)).filter((a): a is string => a !== null);
  };
  if (!alt) {
    if (yontem === 'GET') return { durum: 200, govde: kaynakDetayi(d, b, k) };
    if (yontem === 'PATCH') return guncelle(d, b, k, govdeNesnesi(istek.govde), alicilar());
    if (yontem === 'DELETE') {
      d.kaynaklar = d.kaynaklar.filter((x) => x.id !== k.id);
      d.sorunlar = d.sorunlar.filter((s) => s.kaynakId !== k.id);
      d.izlemeler.delete(k.id);
      return { durum: 200, govde: { id: k.id, silindi: true } };
    }
    return bulunamadi();
  }
  if (alt === 'izlemeler' && yontem === 'GET') {
    const hedef = hedefAdlari(b, k);
    const harita = d.izlemeler.get(k.id);
    return {
      durum: 200,
      govde: {
        kaynak_id: k.id,
        hedef_sayisi: hedef.length,
        izleyenler: hedef
          .filter((a) => harita?.has(a))
          .map((a) => ({
            ogrenci_id: idOf(b, a) ?? uid(),
            gorunen_ad: a,
            izledi_at: harita?.get(a) ?? new Date().toISOString(),
          })),
        izlemeyenler: hedef
          .filter((a) => !harita?.has(a))
          .map((a) => ({ ogrenci_id: idOf(b, a) ?? uid(), gorunen_ad: a })),
      },
    };
  }
  if (alt === 'sorunlar' && !alt2 && yontem === 'GET') {
    const liste = d.sorunlar
      .filter((s) => s.kaynakId === k.id)
      .sort(
        (x, y) =>
          Number(y.durum === 'acik') - Number(x.durum === 'acik') ||
          Date.parse(y.olusturma) - Date.parse(x.olusturma),
      );
    return {
      durum: 200,
      govde: {
        sorunlar: liste.map((s) => ({
          id: s.id,
          kaynak_id: k.id,
          bildiren_id: idOf(b, s.ogrenciAd) ?? uid(),
          neden: s.neden,
          aciklama: s.aciklama,
          durum: s.durum,
          cozen_id: s.durum === 'cozuldu' ? b.ogretmenId : null,
          cozuldu_at: s.cozuldu,
          created_at: s.olusturma,
          bildiren_ad: s.ogrenciAd,
        })),
      },
    };
  }
  if (alt === 'sorunlar' && alt2 === 'coz' && yontem === 'POST') {
    const acik = d.sorunlar.filter((s) => s.kaynakId === k.id && s.durum === 'acik');
    for (const s of acik) {
      s.durum = 'cozuldu';
      s.cozuldu = new Date().toISOString();
    }
    if (k.durum === 'bozuk') k.durum = 'aktif';
    return {
      durum: 200,
      govde: { cozulen_sayisi: acik.length, kaynak_durumu: durumu(k) },
    };
  }
  return bulunamadi();
}

function ogrenciGorunur(b: Baglam, k: Kaynak): boolean {
  const ad = adOf(b, b.ogrenciId);
  return (
    ad !== null &&
    kurumdaVar(b, k) &&
    k.durum !== 'gizli' &&
    k.gorunurluk !== 'ogretmen' &&
    hedefAdlari(b, k).includes(ad)
  );
}

function kayitlarimSatiri(d: Depo, b: Baglam, k: Kaynak): Kayit {
  const ad = adOf(b, b.ogrenciId) ?? '';
  const izledi = d.izlemeler.get(k.id)?.get(ad) ?? null;
  return {
    ...temel(b, k),
    izlendi: izledi !== null,
    izledi_at: izledi,
    bozuk: durumu(k) === 'bozuk',
  };
}

function kayitlarim(d: Depo, b: Baglam, parca: string[], istek: MockIstek): MockYanit {
  const [, id, alt] = parca;
  const { yontem, sorgu } = istek;
  const ad = adOf(b, b.ogrenciId) ?? '';
  if (!id) {
    if (yontem !== 'GET') return bulunamadi();
    const liste = d.kaynaklar
      .filter((k) => ogrenciGorunur(b, k) && suzgecUyar(b, k, sorgu, false))
      .sort((x, y) => {
        const ix = d.izlemeler.get(x.id)?.has(ad) ? 1 : 0;
        const iy = d.izlemeler.get(y.id)?.has(ad) ? 1 : 0;
        return ix - iy || tarihSirasi(b, y) - tarihSirasi(b, x);
      });
    const { dilim, sonraki: s } = sayfala(liste, sorgu);
    return {
      durum: 200,
      govde: { kayitlar: dilim.map((k) => kayitlarimSatiri(d, b, k)), sonraki_imlec: s },
    };
  }
  const k = d.kaynaklar.find((x) => x.id === id && ogrenciGorunur(b, x));
  if (!k) return bulunamadi();
  if (!alt && yontem === 'GET') {
    return {
      durum: 200,
      govde: {
        ...kayitlarimSatiri(d, b, k),
        parola: k.parola,
        acik_sorun_var: d.sorunlar.some(
          (s) => s.kaynakId === k.id && s.ogrenciAd === ad && s.durum === 'acik',
        ),
      },
    };
  }
  if (alt === 'izledim' && yontem === 'POST') {
    const harita = d.izlemeler.get(k.id) ?? new Map<string, string>();
    const onceden = harita.get(ad);
    const simdi = onceden ?? new Date().toISOString();
    harita.set(ad, simdi);
    d.izlemeler.set(k.id, harita);
    return { durum: 200, govde: { kaynak_id: k.id, izledi_at: simdi, ilk: onceden === undefined } };
  }
  if (alt === 'sorunlar' && yontem === 'POST') {
    const g = govdeNesnesi(istek.govde);
    const neden = g.neden;
    if (
      neden !== 'acilmiyor' &&
      neden !== 'parola_yanlis' &&
      neden !== 'suresi_doldu' &&
      neden !== 'diger'
    ) {
      return dogrulama();
    }
    if (d.sorunlar.some((s) => s.kaynakId === k.id && s.ogrenciAd === ad && s.durum === 'acik')) {
      return hata(409, 'kaynak_sorun_zaten_acik', 'Bu kayıt için zaten açık bir bildirimin var.');
    }
    const sorun: Sorun = {
      id: uid(),
      kaynakId: k.id,
      ogrenciAd: ad,
      neden,
      aciklama: typeof g.aciklama === 'string' && g.aciklama.length > 0 ? g.aciklama : null,
      durum: 'acik',
      olusturma: new Date().toISOString(),
      cozuldu: null,
    };
    d.sorunlar.push(sorun);
    if (k.durum === 'aktif') k.durum = 'bozuk';
    return {
      durum: 201,
      govde: {
        sorun: {
          id: sorun.id,
          kaynak_id: k.id,
          bildiren_id: b.ogrenciId,
          neden: sorun.neden,
          aciklama: sorun.aciklama,
          durum: 'acik',
          cozen_id: null,
          cozuldu_at: null,
          created_at: sorun.olusturma,
        },
        kaynak_durumu: durumu(k),
      },
    };
  }
  return bulunamadi();
}

// --- Geri bildirim ------------------------------------------------------------------------------

const PENCERE_MS = 24 * SAAT_MS;

function geriBildirimSema(b: Baglam, g: GeriBildirim): Kayit {
  return {
    id: g.id,
    ders_id: g.dersId,
    ogrenci_id: idOf(b, g.ogrenciAd) ?? uid(),
    deger: g.deger,
    konu_id: g.konuId,
    not: g.not,
    created_at: g.olusturma,
    updated_at: g.guncelleme,
  };
}

function sayilar(liste: GeriBildirim[]) {
  const s = { anladim: 0, kismen: 0, anlamadim: 0, toplam: liste.length };
  for (const g of liste) s[g.deger] += 1;
  return s;
}

function oran(liste: GeriBildirim[]) {
  const s = sayilar(liste);
  const o = (n: number) => (s.toplam === 0 ? 0 : Math.round((n / s.toplam) * 10_000) / 10_000);
  return { ...s, oran: { anladim: o(s.anladim), kismen: o(s.kismen), anlamadim: o(s.anlamadim) } };
}

function ogrenciDersiUygun(b: Baglam, d: MockDers): 'uygun' | 'yoklama' | 'katilimci' {
  if (!d.katilimcilar.includes(b.ogrenciId)) return 'katilimci';
  const y = b.yoklamalar.get(`${d.id}/${b.ogrenciId}`);
  const durum = y?.durum;
  return y === undefined || durum === 'geldi' || durum === 'gec' ? 'uygun' : 'yoklama';
}

function bekleyen(dp: Depo, b: Baglam): MockYanit {
  const ad = adOf(b, b.ogrenciId) ?? '';
  const simdi = Date.now();
  const liste = b.dersler
    .filter(
      (d) =>
        d.durum !== 'iptal' &&
        Date.parse(d.bitis_at) <= simdi &&
        Date.parse(d.bitis_at) > simdi - PENCERE_MS &&
        ogrenciDersiUygun(b, d) === 'uygun' &&
        !dp.geriBildirimler.some((g) => g.dersId === d.id && g.ogrenciAd === ad),
    )
    .sort((x, y) => Date.parse(y.bitis_at) - Date.parse(x.bitis_at));
  return {
    durum: 200,
    govde: {
      dersler: liste.map((d) => ({
        ders_id: d.id,
        grup_id: d.grup_id,
        ogretmen_id: d.ogretmen_id,
        brans_kodu: d.brans_kodu,
        baslik: d.baslik,
        konu_id: d.konu_id,
        baslangic_at: d.baslangic_at,
        bitis_at: d.bitis_at,
        son_verme_at: new Date(Date.parse(d.bitis_at) + PENCERE_MS).toISOString(),
      })),
    },
  };
}

function geriBildirimVer(dp: Depo, b: Baglam, d: MockDers, istek: MockIstek): MockYanit {
  if (b.rol !== 'ogrenci')
    return hata(403, 'izin_yok', 'Geri bildirimi yalnızca öğrenci verebilir.');
  const g = govdeNesnesi(istek.govde);
  const deger = g.deger;
  if (deger !== 'anladim' && deger !== 'kismen' && deger !== 'anlamadim') return dogrulama();
  if (d.durum === 'iptal' || Date.parse(d.bitis_at) > Date.now()) {
    return hata(422, 'geri_bildirim_ders_bitmedi', 'Ders henüz bitmedi.');
  }
  if (ogrenciDersiUygun(b, d) !== 'uygun') {
    return hata(422, 'geri_bildirim_yoklama_uygun_degil', 'Bu ders için geri bildirim verilemez.');
  }
  if (Date.now() > Date.parse(d.bitis_at) + PENCERE_MS) {
    return hata(409, 'geri_bildirim_guncelleme_suresi_doldu', 'Güncelleme süresi doldu.');
  }
  const ad = adOf(b, b.ogrenciId) ?? '';
  const mevcut = dp.geriBildirimler.find((x) => x.dersId === d.id && x.ogrenciAd === ad);
  const simdi = new Date().toISOString();
  const konu = typeof g.konu_id === 'string' ? g.konu_id : null;
  const not = typeof g.not === 'string' && g.not.length > 0 ? g.not : null;
  if (mevcut) {
    mevcut.deger = deger;
    mevcut.konuId = konu;
    mevcut.not = not;
    mevcut.guncelleme = simdi;
    return { durum: 200, govde: { geri_bildirim: geriBildirimSema(b, mevcut), yeni: false } };
  }
  const yeni: GeriBildirim = {
    id: uid(),
    dersId: d.id,
    dersAnahtar: dersAnahtari(b, d),
    ogrenciAd: ad,
    deger,
    konuId: konu,
    not,
    olusturma: simdi,
    guncelleme: simdi,
    bransKodu: d.brans_kodu,
    ogretmenAd: adOf(b, d.ogretmen_id) ?? OGRETMENLER[0] ?? '',
    dersBaslangic: d.baslangic_at,
    dersBitis: d.bitis_at,
  };
  dp.geriBildirimler.push(yeni);
  return { durum: 200, govde: { geri_bildirim: geriBildirimSema(b, yeni), yeni: true } };
}

function dersGeriBildirimleri(dp: Depo, b: Baglam, d: MockDers): MockYanit {
  const anahtar = dersAnahtari(b, d);
  const liste = dp.geriBildirimler
    .filter((g) => g.dersAnahtar === anahtar)
    .sort((x, y) => Date.parse(y.guncelleme) - Date.parse(x.guncelleme));
  return {
    durum: 200,
    govde: {
      ders_id: d.id,
      ozet: sayilar(liste),
      geri_bildirimler: liste.map((g) => ({ ...geriBildirimSema(b, g), gorunen_ad: g.ogrenciAd })),
      katilimci_sayisi: d.katilimcilar.length,
    },
  };
}

function ogrenciGeriBildirimleri(dp: Depo, b: Baglam, ogrenciId: string, q: URLSearchParams) {
  const ad = adOf(b, ogrenciId);
  if (ad === null) return bulunamadi();
  const liste = dp.geriBildirimler
    .filter((g) => g.ogrenciAd === ad)
    .sort((x, y) => Date.parse(y.dersBitis) - Date.parse(x.dersBitis));
  const { dilim, sonraki: s } = sayfala(liste, q);
  return {
    durum: 200,
    govde: {
      geri_bildirimler: dilim.map((g) => ({
        ...geriBildirimSema(b, g),
        brans_kodu: g.bransKodu,
        ders_baslangic_at: g.dersBaslangic,
        ders_bitis_at: g.dersBitis,
        ogretmen_id: idOf(b, g.ogretmenAd) ?? uid(),
      })),
      sonraki_imlec: s,
    },
  };
}

function ozet(dp: Depo, b: Baglam, q: URLSearchParams): MockYanit {
  const bas = q.get('baslangic');
  const bit = q.get('bitis');
  if (!bas || !bit || bas > bit) return dogrulama();
  const aralik = dp.geriBildirimler.filter((g) => {
    const gun = yerelTarih(g.dersBitis);
    return gun >= bas && gun <= bit;
  });
  const ogretmenAdlari = [...new Set(aralik.map((g) => g.ogretmenAd))].sort((x, y) =>
    x.localeCompare(y, 'tr'),
  );
  const branslar = [...new Set(aralik.map((g) => g.bransKodu))].sort();
  return {
    durum: 200,
    govde: {
      baslangic: bas,
      bitis: bit,
      toplam: oran(aralik),
      ogretmenler: ogretmenAdlari.map((o) => ({
        ogretmen_id: idOf(b, o) ?? uid(),
        gorunen_ad: o,
        ...oran(aralik.filter((g) => g.ogretmenAd === o)),
      })),
      branslar: branslar.map((k) => ({
        brans_kodu: k,
        ...oran(aralik.filter((g) => g.bransKodu === k)),
      })),
    },
  };
}

// --- Giris --------------------------------------------------------------------------------------

/**
 * Kayit/materyal/geri bildirim yollarini isler; bu servise ait olmayan yol icin `null` doner
 * (`ders-mock` devralir).
 */
export function kayitMock(istek: MockIstek): MockYanit | null {
  const parca = istek.yol.split('/');
  const kurumId = parca[1];
  if (parca[0] !== 'kurumlar' || !kurumId || !(kurumId in MOCK_KURUM_ROLLERI)) return null;
  const rest = parca.slice(2);
  const [ana, id, alt] = rest;
  const { yontem } = istek;
  const dp = depo();
  const b = baglam(kurumId);
  const personel = b.rol !== 'ogrenci';

  if (ana === 'kaynaklar') {
    return personel ? personelKaynak(dp, b, rest, istek) : izinYok();
  }
  if (ana === 'kayitlarim') return personel ? izinYok() : kayitlarim(dp, b, rest, istek);

  if (ana === 'gruplar' && alt === 'materyaller' && yontem === 'POST') {
    if (!personel) return izinYok();
    const grup = b.gruplar.find((g) => g.id === id);
    if (!grup) return bulunamadi();
    const aday = grupKatilimcilari(b, grup.id)
      .map((x) => adOf(b, x))
      .filter((a): a is string => a !== null);
    return ekle(
      dp,
      b,
      govdeNesnesi(istek.govde),
      { tur: 'materyal', grupAd: grup.ad, dersAnahtar: null, brans: null },
      aday,
    );
  }

  if (ana === 'geri-bildirim' && id === 'bekleyen' && yontem === 'GET') {
    return personel ? izinYok() : bekleyen(dp, b);
  }
  if (ana === 'geri-bildirim' && id === 'ozet' && yontem === 'GET') {
    return b.rol === 'sahip' || b.rol === 'yonetici' ? ozet(dp, b, istek.sorgu) : izinYok();
  }
  if (ana === 'ogrenciler' && alt === 'geri-bildirimler' && yontem === 'GET') {
    return personel ? ogrenciGeriBildirimleri(dp, b, id ?? '', istek.sorgu) : izinYok();
  }

  if (ana === 'dersler' && id && (alt === 'kaynaklar' || alt?.startsWith('geri-bildirim'))) {
    const d = b.dersler.find((x) => x.id === id);
    if (!d) return bulunamadi();
    if (alt === 'kaynaklar' && yontem === 'POST') {
      if (!personel) return izinYok();
      if (d.durum === 'iptal')
        return hata(409, 'kaynak_ders_iptal', 'İptal edilmiş derse kayıt eklenemez.');
      const aday = d.katilimcilar.map((x) => adOf(b, x)).filter((a): a is string => a !== null);
      return ekle(
        dp,
        b,
        govdeNesnesi(istek.govde),
        {
          tur: govdeNesnesi(istek.govde).tur === 'materyal' ? 'materyal' : 'kayit',
          grupAd: grupAdi(b, d.grup_id),
          dersAnahtar: dersAnahtari(b, d),
          brans: d.brans_kodu,
        },
        aday,
      );
    }
    if (alt === 'geri-bildirimler' && yontem === 'GET') {
      return personel ? dersGeriBildirimleri(dp, b, d) : izinYok();
    }
    if (alt === 'geri-bildirim' && yontem === 'PUT') return geriBildirimVer(dp, b, d, istek);
    if (alt === 'geri-bildirim' && yontem === 'GET') {
      if (personel) return izinYok();
      const ad = adOf(b, b.ogrenciId) ?? '';
      const mevcut = dp.geriBildirimler.find((x) => x.dersId === d.id && x.ogrenciAd === ad);
      return { durum: 200, govde: { geri_bildirim: mevcut ? geriBildirimSema(b, mevcut) : null } };
    }
  }
  return null;
}
