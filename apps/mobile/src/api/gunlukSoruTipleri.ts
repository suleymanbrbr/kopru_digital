/**
 * Gunluk soru takibi ve konu analizi adaptor tipleri (camelCase; api `snake_case` govdeleri
 * `gercekGunlukSoru.ts`te cevrilir). Tarihler kurum yerel gunu `YYYY-MM-DD`, anlar ISO-8601 UTC.
 * Ogrenci kimligi = uyelik kimligidir. Oneriler yalniz personel yanitindadir: ogrenci analizinde
 * `oneriler` hic yoktur (api bunu garanti eder, arayuz da gostermez).
 */

export type Zorluk = 'kolay' | 'orta' | 'zor';
export const ZORLUKLAR: readonly Zorluk[] = ['kolay', 'orta', 'zor'];
/** Odev teslimlerinde zorluk bilgisi yoktur: analizde ayri sutun. */
export type AnalizZorlugu = Zorluk | 'belirtilmemis';
export type AnalizDonemi = '7' | '30' | 'donem';

/** Tek kayitta en cok soru (api `GUNLUK_SORU_EN_FAZLA_TOPLAM`). */
export const GUNLUK_SORU_EN_FAZLA_TOPLAM = 500;
/** Kayda en cok fotograf (api `GUNLUK_SORU_EN_FAZLA_FOTOGRAF`). */
export const GUNLUK_SORU_EN_FAZLA_FOTOGRAF = 5;
/** Analiz yaniti ve bant icin en az soru (api `BANT_EN_AZ_SORU`): bunun altinda "veri az". */
export const BANT_EN_AZ_SORU = 10;

// --- Kayit ----------------------------------------------------------------------------------

export interface GunlukKayit {
  id: string;
  ogrenciId: string;
  gun: string;
  bransKodu: string;
  konuId: string;
  konuAd: string | null;
  zorluk: Zorluk;
  kaynakTestId: string | null;
  kaynakKitapId: string | null;
  kaynakMetin: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  toplam: number;
  planGorevId: string | null;
  /** Medya dosya kimlikleri (sirali). */
  dosyalar: string[];
  /** Ayni gun duzeltme/silme acik mi (kayit gunu bitince false). */
  duzenlenebilir: boolean;
  surum: number;
  olusturma: string;
}

export interface GunlukKayitGirdisi {
  /** Verilmezse sunucuda bugun; cevrimdisi girilen kayitta GIRIS gunu acikca yollanir. */
  gun?: string;
  bransKodu: string;
  konuId: string;
  zorluk: Zorluk;
  kaynakTestId?: string | null;
  kaynakMetin?: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  planGorevId?: string | null;
  /** Hazir `gunluk_soru_fotografi` dosya kimlikleri. */
  dosyaIdleri: string[];
  /** Idempotency anahtari: ayni deger tekrar gelirse yeni kayit acilmaz. */
  istekId: string;
}

export interface GunlukKayitGuncelleGirdisi {
  bransKodu?: string;
  konuId?: string;
  zorluk?: Zorluk;
  kaynakTestId?: string | null;
  kaynakMetin?: string | null;
  dogru?: number;
  yanlis?: number;
  bos?: number;
  planGorevId?: string | null;
  dosyaIdleri?: string[];
  surum?: number;
}

export interface GunlukKayitSorgusu {
  /** Tek gun; verilirse `bas`/`bit` yok sayilir. */
  gun?: string;
  bas?: string;
  bit?: string;
  bransKodu?: string;
}

export interface GunlukKayitSayfasi {
  kayitlar: GunlukKayit[];
  sonrakiImlec: string | null;
}

export interface SonKullanilanKonu {
  konuId: string;
  konuAd: string | null;
  sonZorluk: Zorluk;
}

export interface SonKullanilanKaynak {
  kaynakTestId: string | null;
  kaynakKitapId: string | null;
  kitapAd: string | null;
  testAd: string | null;
  kaynakMetin: string | null;
}

export interface SonKullanilanDers {
  bransKodu: string;
  sonKullanildi: string;
  konular: SonKullanilanKonu[];
  kaynaklar: SonKullanilanKaynak[];
}

export interface SonKullanilanlar {
  /** En son kullanilandan eskiye. */
  dersler: SonKullanilanDers[];
}

// --- Kaynak kitap ---------------------------------------------------------------------------

export interface KaynakTest {
  id: string;
  kitapId: string;
  sira: number;
  ad: string;
  soruSayisi: number;
  konuId: string | null;
  /** Ilerleme sorgusunda testin ilk cozuldugu gun. */
  cozulduGun: string | null;
}

export interface KaynakKitap {
  id: string;
  ad: string;
  yayinevi: string | null;
  bransKodu: string;
  aktif: boolean;
  testSayisi: number;
  toplamSoru: number;
  /** Cozulen test / toplam test (ogrenci rolu ya da `ogrenciId` verildiginde). */
  ilerleme: { cozulenTest: number; toplamTest: number } | null;
}

export interface KaynakKitapDetayi extends KaynakKitap {
  testler: KaynakTest[];
}

export interface KaynakKitapSorgusu {
  bransKodu?: string;
  /** Personel: hangi ogrencinin ilerlemesi. */
  ogrenciId?: string;
  /** Personel: pasifler de gelsin. */
  pasifler?: boolean;
}

// --- Analiz ---------------------------------------------------------------------------------

export interface Hucre {
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
  /** `dogru / cozulen` (0..1); cozulen 0 ise null. */
  basari: number | null;
}

export type BantDurumu = 'veri_az' | 'tespit_yok' | 'zorlaniyor';

export interface BantTespiti {
  durum: BantDurumu;
  /** `zorlaniyor` ise basarinin belirgin dustugu bant. */
  bant: Zorluk | null;
  /** Bant basina basari (bant verisi yeterliyse; yetersizse null). */
  bantBasarilari: Record<Zorluk, number | null>;
}

export interface KonuAnalizi {
  konuId: string;
  konuAd: string | null;
  ustKonuAd: string | null;
  hucreler: Record<AnalizZorlugu, Hucre>;
  toplam: Hucre;
  bant: BantTespiti;
}

export type Oneri =
  | {
      tur: 'gorev_oner';
      bransKodu: string;
      konuId: string;
      konuAd: string | null;
      zorluk: Zorluk;
      soruSayisi: number;
      basari: number | null;
    }
  | {
      tur: 'birebir_ders';
      bransKodu: string;
      konuId: string;
      konuAd: string | null;
      /** Son 2 haftada zor bant basarisi. */
      zorBasari: number;
      oncekiHaftaBasari: number | null;
      sonHaftaBasari: number | null;
    };

export interface AnalizSorgusu {
  bransKodu: string;
  donem: AnalizDonemi;
}

export interface Analiz {
  ogrenciId: string;
  bransKodu: string;
  bas: string;
  bit: string;
  konular: KonuAnalizi[];
  toplam: Hucre;
  /** Yalniz personel yanitinda; ogrenci yanitinda ALAN YOKTUR. */
  oneriler?: Oneri[];
}

export interface HucreSorgusu extends AnalizSorgusu {
  konuId: string;
  /** Verilmezse konunun tum kayitlari. */
  zorluk?: AnalizZorlugu;
}

export interface HucreKaydi {
  kaynak: 'gunluk' | 'odev';
  id: string;
  gun: string;
  zorluk: AnalizZorlugu;
  /** Kitap/test adi ya da serbest metin. */
  kaynakAdi: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  toplam: number;
  dosyalar: { medyaDosyaId: string; adres: string | null }[];
}

export interface HucreDetayi {
  ogrenciId: string;
  konuId: string;
  kayitlar: HucreKaydi[];
  /** Medya servisi yanit vermedi: fotograf adresleri bos (yeniden denenebilir). */
  fotografAdresleriAlinamadi: boolean;
}

export type BantDegisimi = 'iyilesti' | 'ayni' | 'kotulesti' | 'belirsiz';

export interface HaftalikOzet {
  ogrenciId: string;
  haftaBaslangic: string;
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
  basari: number | null;
  enZayifKonular: {
    bransKodu: string;
    konuId: string;
    konuAd: string | null;
    cozulen: number;
    basari: number | null;
  }[];
  bant: { onceki: BantTespiti; simdiki: BantTespiti; degisim: BantDegisimi };
}

// --- Gorev ver ------------------------------------------------------------------------------

export interface GorevVerGirdisi {
  tur: 'plan_gorevi' | 'odev';
  bransKodu: string;
  konuId: string;
  zorluk: Zorluk;
  soruSayisi: number;
  /** `plan_gorevi`: gorev gunu (varsayilan yarin). */
  gun?: string;
}

export type GorevVerYaniti =
  | {
      tur: 'plan_gorevi';
      planId: string;
      gorevId: string;
      haftaBaslangic: string;
      gun: string;
      /** Plan taslaksa ogrenci henuz gormez: ogretmen yayinlamali. */
      planDurum: 'taslak' | 'yayinda';
    }
  | { tur: 'odev'; odevId: string; sonTeslim: string };

// --- Adaptor --------------------------------------------------------------------------------

export interface GunlukSoruAdapter {
  // Ogrenci
  /**
   * Kayit olusturur (`istekId` idempotent: tekrar gelirse `yeni: false` ile mevcut kayit doner).
   * Cevrimdisi KUYRUKTAN cagrilir (`yukleme/gonderim.ts`); cevrimici korumasi bunu atlar.
   */
  kayitOlustur: (g: GunlukKayitGirdisi) => Promise<{ kayit: GunlukKayit; yeni: boolean }>;
  /** Yalniz girildigi gun (sonra 409 `kayit_duzenlenemez`). */
  kayitDuzelt: (id: string, g: GunlukKayitGuncelleGirdisi) => Promise<GunlukKayit>;
  kayitSil: (id: string) => Promise<void>;
  kayitlarim: (s: GunlukKayitSorgusu, imlec?: string | null) => Promise<GunlukKayitSayfasi>;
  sonKullanilanlar: () => Promise<SonKullanilanlar>;

  // Kaynak kitap (ogrenci: aktifler + kendi ilerlemesi; personel: ogrenciId ile)
  kaynakKitaplar: (s?: KaynakKitapSorgusu) => Promise<KaynakKitap[]>;
  kaynakKitap: (id: string, ogrenciId?: string) => Promise<KaynakKitapDetayi>;

  // Analiz: `ogrenciId` yok -> ogrencinin kendisi (oneri yok); var -> personel (oneriler dolu)
  analiz: (s: AnalizSorgusu, ogrenciId?: string) => Promise<Analiz>;
  hucre: (s: HucreSorgusu, ogrenciId?: string) => Promise<HucreDetayi>;
  haftalikOzet: (ogrenciId: string, hafta?: string) => Promise<HaftalikOzet>;
  /** Onayli oneriden gorev (plan gorevi ya da tek ogrencilik odev). */
  gorevVer: (ogrenciId: string, g: GorevVerGirdisi) => Promise<GorevVerYaniti>;
}
