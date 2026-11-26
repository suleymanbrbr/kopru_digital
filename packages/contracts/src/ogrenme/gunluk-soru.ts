import { z } from 'zod';

import { defineEvent } from '../event.js';
import { medyaOkumaAdresiSema } from '../medya/ic-api.js';

/**
 * Gunluk soru takibi ve konu analizi (docs/schema/api.md "Gunluk soru takibi", olaylar.md
 * `ogrenme.gunluk_soru.kaydedildi`). Alanlar `snake_case`. Olay yalniz kimlik ve sayi tasir: ad, telefon,
 * e-posta, serbest metin (kaynak adi, not) ASLA girmez. Veli arayuzu yoktur (Faz 2).
 */

export const gunlukSoruHataKodlari = {
  kayitDuzenlenemez: 'kayit_duzenlenemez',
  toplamGecersiz: 'soru_toplami_gecersiz',
  gunGecersiz: 'gun_gecersiz',
  konuGecersiz: 'konu_gecersiz',
  bransGecersiz: 'brans_gecersiz',
  kaynakTestiGecersiz: 'kaynak_testi_gecersiz',
  planGoreviGecersiz: 'plan_gorevi_gecersiz',
  istekCakismasi: 'istek_cakismasi',
  kaynakTestiKullanimda: 'kaynak_testi_kullanimda',
  surumCakismasi: 'surum_cakismasi',
  gorevHedefiGecersiz: 'gorev_hedefi_gecersiz',
} as const;

export const ZORLUKLAR = ['kolay', 'orta', 'zor'] as const;
export const ZorlukSema = z.enum(ZORLUKLAR);
export type Zorluk = z.infer<typeof ZorlukSema>;
/** Analizde ayri bir "zorluk" sutunu: odev teslimlerinde zorluk bilgisi yoktur. */
export const AnalizZorluguSema = z.enum([...ZORLUKLAR, 'belirtilmemis']);
export type AnalizZorlugu = z.infer<typeof AnalizZorluguSema>;

/** Tek kayitta en cok (dogru + yanlis + bos) soru; makul ust sinir (CHECK). */
export const GUNLUK_SORU_EN_FAZLA_TOPLAM = 500;
/** Kayda en cok bu kadar fotograf (yanlis soru fotograflari). */
export const GUNLUK_SORU_EN_FAZLA_FOTOGRAF = 5;
/** Ogrenci gecmise donuk en cok bu kadar gun onceki bir gun icin kayit girebilir (bugun dahil degil). */
export const GUNLUK_SORU_GERI_GUN = 6;
/** Analizde "donem" secenegi (okul yariyili) gun sayisi. */
export const GUNLUK_SORU_DONEM_GUN = 120;
/** Kitap basina en cok test ve testteki en cok soru. */
export const KAYNAK_KITAP_EN_FAZLA_TEST = 300;
export const KAYNAK_TEST_EN_FAZLA_SORU = 500;
/** `son-kullanilanlar` ucunun dondurdugu en cok brans / konu / kaynak sayisi. */
export const SON_KULLANILAN_EN_FAZLA = 5;

const zaman = z.iso.datetime({ offset: true });
const tarih = z.iso.date();
const sayi = z.number().int().min(0).max(GUNLUK_SORU_EN_FAZLA_TOPLAM);
const bransKodu = z.string().trim().min(1).max(40);
const metin200 = z.string().trim().min(1).max(200);

// --- Olay ------------------------------------------------------------------------------------

/**
 * Kayit olusturma, duzeltme ve silme (ayni islemde outbox). `silindi=true` iken `toplam` 0'dir.
 * `kayit_surumu` her yazimda artar (tuketici eski olayi atar); `onceki_toplam` rozet sayacinin farkini ve
 * supheli orunti penceresini hesaplamak icindir. Tuketici: `motivasyon.xp`.
 */
export const ogrenmeGunlukSoruKaydedildiV1 = defineEvent(
  'ogrenme.gunluk_soru.kaydedildi',
  1,
  z.object({
    kayit_id: z.uuid(),
    ogrenci_id: z.uuid(),
    brans_kodu: z.string(),
    konu_id: z.uuid(),
    zorluk: ZorlukSema,
    dogru: sayi,
    yanlis: sayi,
    bos: sayi,
    toplam: sayi,
    onceki_toplam: sayi,
    kayit_surumu: z.number().int().min(1),
    silindi: z.boolean(),
    gun: tarih,
  }),
);

// --- Kayit -----------------------------------------------------------------------------------

export const GunlukSoruDosyaSema = z.object({
  medya_dosya_id: z.uuid(),
  sira: z.number().int().min(0),
});

export const GunlukSoruKaydiSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  gun: tarih,
  brans_kodu: z.string(),
  konu_id: z.uuid(),
  konu_ad: z.string().nullable(),
  zorluk: ZorlukSema,
  kaynak_test_id: z.uuid().nullable(),
  kaynak_kitap_id: z.uuid().nullable(),
  kaynak_metin: z.string().nullable(),
  dogru: z.number().int(),
  yanlis: z.number().int(),
  bos: z.number().int(),
  toplam: z.number().int(),
  plan_gorev_id: z.uuid().nullable(),
  dosyalar: z.array(GunlukSoruDosyaSema),
  /** Aynı gün düzeltme/silme açık mı (kayıt günü bitince false). */
  duzenlenebilir: z.boolean(),
  surum: z.number().int(),
  created_at: zaman,
});
export type GunlukSoruKaydi = z.infer<typeof GunlukSoruKaydiSema>;

const kayitGovdesi = {
  brans_kodu: bransKodu,
  konu_id: z.uuid(),
  zorluk: ZorlukSema,
  kaynak_test_id: z.uuid().nullish(),
  kaynak_metin: z.string().trim().min(1).max(200).nullish(),
  dogru: sayi,
  yanlis: sayi,
  bos: sayi,
  plan_gorev_id: z.uuid().nullish(),
  /** `ortak.medya_dosya_kopyalari` kimlikleri (`soru_fotografi` turu, ogrencinin kendi dosyasi). */
  dosya_idleri: z.array(z.uuid()).max(GUNLUK_SORU_EN_FAZLA_FOTOGRAF).default([]),
};

const kaynakTekOlmali = (g: { kaynak_test_id?: string | null; kaynak_metin?: string | null }) =>
  !(g.kaynak_test_id && g.kaynak_metin);

export const GunlukSoruOlusturGirdiSema = z
  .object({
    /** Varsayilan bugun (`Europe/Istanbul`); en cok `GUNLUK_SORU_GERI_GUN` gun geriye. */
    gun: tarih.optional(),
    ...kayitGovdesi,
    /** Istemci uretir; cevrimdisi tekrar gonderimde ayni kayit doner (idempotency). */
    istek_id: z.uuid().optional(),
  })
  .refine(kaynakTekOlmali, {
    message: 'Kaynak testi ve serbest kaynak metni birlikte verilemez.',
    path: ['kaynak_metin'],
  })
  .refine((g) => g.dogru + g.yanlis + g.bos >= 1, {
    message: 'En az bir soru girilmeli.',
    path: ['dogru'],
  })
  .refine((g) => g.dogru + g.yanlis + g.bos <= GUNLUK_SORU_EN_FAZLA_TOPLAM, {
    message: `Toplam soru en çok ${String(GUNLUK_SORU_EN_FAZLA_TOPLAM)} olabilir.`,
    path: ['dogru'],
  });
export type GunlukSoruOlusturGirdi = z.infer<typeof GunlukSoruOlusturGirdiSema>;

export const GunlukSoruGuncelleGirdiSema = z
  .object({
    brans_kodu: bransKodu.optional(),
    konu_id: z.uuid().optional(),
    zorluk: ZorlukSema.optional(),
    kaynak_test_id: z.uuid().nullable().optional(),
    kaynak_metin: z.string().trim().min(1).max(200).nullable().optional(),
    dogru: sayi.optional(),
    yanlis: sayi.optional(),
    bos: sayi.optional(),
    plan_gorev_id: z.uuid().nullable().optional(),
    /** Verilirse fotograf kumesi bu liste olur (yeni dosyalar baglanir, eksikler birakilir). */
    dosya_idleri: z.array(z.uuid()).max(GUNLUK_SORU_EN_FAZLA_FOTOGRAF).optional(),
    surum: z.number().int().min(1).optional(),
  })
  .refine((g) => Object.keys(g).some((k) => k !== 'surum'), { message: 'Değişiklik yok.' });
export type GunlukSoruGuncelleGirdi = z.infer<typeof GunlukSoruGuncelleGirdiSema>;

export const GunlukSoruListeSorguSema = z.object({
  /** Tek gun; verilirse `bas`/`bit` yok sayilir. */
  gun: tarih.optional(),
  bas: tarih.optional(),
  bit: tarih.optional(),
  brans_kodu: bransKodu.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  imlec: z.string().max(200).optional(),
});

export const GunlukSoruListeYanitiSema = z.object({
  kayitlar: z.array(GunlukSoruKaydiSema),
  sonraki_imlec: z.string().nullable(),
});

export const SonKullanilanlarSema = z.object({
  /** En son kullanilandan eskiye; her brans icin en cok 5 konu ve 5 kaynak. */
  dersler: z.array(
    z.object({
      brans_kodu: z.string(),
      son_kullanildi_at: zaman,
      konular: z.array(
        z.object({ konu_id: z.uuid(), konu_ad: z.string().nullable(), son_zorluk: ZorlukSema }),
      ),
      kaynaklar: z.array(
        z.object({
          kaynak_test_id: z.uuid().nullable(),
          kaynak_kitap_id: z.uuid().nullable(),
          kitap_ad: z.string().nullable(),
          test_ad: z.string().nullable(),
          kaynak_metin: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type SonKullanilanlar = z.infer<typeof SonKullanilanlarSema>;

// --- Kaynak kitap ----------------------------------------------------------------------------

export const KaynakTestSema = z.object({
  id: z.uuid(),
  kitap_id: z.uuid(),
  sira: z.number().int(),
  ad: z.string(),
  soru_sayisi: z.number().int(),
  konu_id: z.uuid().nullable(),
  /** Ilerleme sorgusunda (`ogrenci_id`/ogrenci rolu) bu testin cozuldugu ilk gun; yoksa null. */
  cozuldu_gun: tarih.nullable().optional(),
});

export const KaynakKitapSema = z.object({
  id: z.uuid(),
  ad: z.string(),
  yayinevi: z.string().nullable(),
  brans_kodu: z.string(),
  kademe_id: z.uuid().nullable(),
  /** Tanimlayan ogretmen uyeligi; null = kurum tanimi (sahip/yonetici). */
  sahip_uyelik_id: z.uuid().nullable(),
  aktif: z.boolean(),
  test_sayisi: z.number().int(),
  toplam_soru: z.number().int(),
  /** Ogrenci/ogrenci_id verildiginde: cozulen test / toplam test. */
  ilerleme: z.object({ cozulen_test: z.number().int(), toplam_test: z.number().int() }).nullable(),
  surum: z.number().int(),
  created_at: zaman,
});
export type KaynakKitap = z.infer<typeof KaynakKitapSema>;

export const KaynakKitapDetaySema = KaynakKitapSema.extend({ testler: z.array(KaynakTestSema) });

const testGirdisi = z.object({
  ad: metin200,
  soru_sayisi: z.number().int().min(1).max(KAYNAK_TEST_EN_FAZLA_SORU),
  konu_id: z.uuid().nullish(),
});

export const KaynakKitapOlusturGirdiSema = z.object({
  ad: metin200,
  yayinevi: z.string().trim().min(1).max(200).nullish(),
  brans_kodu: bransKodu,
  kademe_id: z.uuid().nullish(),
  testler: z.array(testGirdisi).max(KAYNAK_KITAP_EN_FAZLA_TEST).default([]),
});
export const KaynakKitapGuncelleGirdiSema = z
  .object({
    ad: metin200.optional(),
    yayinevi: z.string().trim().min(1).max(200).nullable().optional(),
    kademe_id: z.uuid().nullable().optional(),
    aktif: z.boolean().optional(),
    surum: z.number().int().min(1).optional(),
  })
  .refine((g) => Object.keys(g).some((k) => k !== 'surum'), { message: 'Değişiklik yok.' });
export const KaynakTestEkleGirdiSema = z.object({
  testler: z.array(testGirdisi).min(1).max(KAYNAK_KITAP_EN_FAZLA_TEST),
});
export const KaynakTestGuncelleGirdiSema = z
  .object({
    ad: metin200.optional(),
    soru_sayisi: z.number().int().min(1).max(KAYNAK_TEST_EN_FAZLA_SORU).optional(),
    konu_id: z.uuid().nullable().optional(),
  })
  .refine((g) => Object.keys(g).length > 0, { message: 'Değişiklik yok.' });
export const KaynakKitapListeSorguSema = z.object({
  brans_kodu: bransKodu.optional(),
  /** Pasifler de gelsin (yalniz personel). */
  pasifler: z.coerce.boolean().default(false),
  /** Ilerleme icin (personel): hangi ogrencinin. Ogrenci rolunde kendisi. */
  ogrenci_id: z.uuid().optional(),
});
export const KaynakKitapListeYanitiSema = z.object({ kitaplar: z.array(KaynakKitapSema) });

// --- Analiz ----------------------------------------------------------------------------------

/** `donem`: 7 / 30 gun ya da `donem` (okul yariyili, `GUNLUK_SORU_DONEM_GUN`). `bas`/`bit` verilirse onceliklidir. */
export const AnalizDonemiSema = z.enum(['7', '30', 'donem']);
export const AnalizSorguSema = z.object({
  brans_kodu: bransKodu,
  donem: AnalizDonemiSema.default('30'),
  bas: tarih.optional(),
  bit: tarih.optional(),
});
export type AnalizSorgu = z.infer<typeof AnalizSorguSema>;

export const HucreSema = z.object({
  cozulen: z.number().int(),
  dogru: z.number().int(),
  yanlis: z.number().int(),
  bos: z.number().int(),
  /** `dogru / cozulen` (0..1, 3 ondalik); cozulen 0 ise null. */
  basari: z.number().nullable(),
});
export type Hucre = z.infer<typeof HucreSema>;

export const BantDurumuSema = z.enum(['veri_az', 'tespit_yok', 'zorlaniyor']);
export const BantTespitiSema = z.object({
  durum: BantDurumuSema,
  /** `zorlaniyor` ise basarinin belirgin dustugu (ilk) bant. */
  bant: ZorlukSema.nullable(),
  /** Bant basina basari (bant verisi yeterliyse; yetersizse null). */
  bant_basarilari: z.object({
    kolay: z.number().nullable(),
    orta: z.number().nullable(),
    zor: z.number().nullable(),
  }),
});
export type BantTespiti = z.infer<typeof BantTespitiSema>;

export const HucrelerSema = z.object({
  kolay: HucreSema,
  orta: HucreSema,
  zor: HucreSema,
  belirtilmemis: HucreSema,
});

export const KonuAnaliziSema = z.object({
  konu_id: z.uuid(),
  konu_ad: z.string().nullable(),
  ust_konu_ad: z.string().nullable(),
  hucreler: HucrelerSema,
  toplam: HucreSema,
  bant: BantTespitiSema,
});

/**
 * Oneriler yalniz personel (ogretmen/yonetici/sahip) yanitindadir; ogrenci yanitinda alan yoktur.
 * Kural tabanlidir ve ogretmen onaylidir: hicbir sey ogrenciye otomatik gitmez.
 */
export const OneriSema = z.discriminatedUnion('tur', [
  z.object({
    tur: z.literal('gorev_oner'),
    brans_kodu: z.string(),
    konu_id: z.uuid(),
    konu_ad: z.string().nullable(),
    zorluk: ZorlukSema,
    soru_sayisi: z.number().int(),
    basari: z.number().nullable(),
  }),
  z.object({
    tur: z.literal('birebir_ders'),
    brans_kodu: z.string(),
    konu_id: z.uuid(),
    konu_ad: z.string().nullable(),
    /** Son 2 haftada zor bant basarisi. */
    zor_basari: z.number(),
    onceki_hafta_basari: z.number().nullable(),
    son_hafta_basari: z.number().nullable(),
  }),
]);
export type Oneri = z.infer<typeof OneriSema>;

export const AnalizYanitiSema = z.object({
  ogrenci_id: z.uuid(),
  brans_kodu: z.string(),
  bas: tarih,
  bit: tarih,
  konular: z.array(KonuAnaliziSema),
  toplam: HucreSema,
  oneriler: z.array(OneriSema).optional(),
});
export type AnalizYaniti = z.infer<typeof AnalizYanitiSema>;

export const HucreSorguSema = z.object({
  brans_kodu: bransKodu,
  konu_id: z.uuid(),
  /** Verilmezse konunun tum kayitlari. */
  zorluk: AnalizZorluguSema.optional(),
  donem: AnalizDonemiSema.default('30'),
  bas: tarih.optional(),
  bit: tarih.optional(),
});

export const HucreKaydiSema = z.object({
  kaynak: z.enum(['gunluk', 'odev']),
  id: z.uuid(),
  gun: tarih,
  zorluk: AnalizZorluguSema,
  /** Kitap/test adi ya da serbest metin ("X Yayinlari Test 4"). */
  kaynak_adi: z.string().nullable(),
  dogru: z.number().int(),
  yanlis: z.number().int(),
  bos: z.number().int(),
  toplam: z.number().int(),
  dosyalar: z.array(z.object({ medya_dosya_id: z.uuid(), adres: medyaOkumaAdresiSema.nullable() })),
});

export const HucreDetaySema = z.object({
  ogrenci_id: z.uuid(),
  konu_id: z.uuid(),
  kayitlar: z.array(HucreKaydiSema),
  /** Medya servisi yanit vermedi: fotograf adresleri bos (yeniden denenebilir). */
  fotograf_adresleri_alinamadi: z.boolean(),
});

export const SinifSorguSema = z.object({
  grup_id: z.uuid(),
  brans_kodu: bransKodu,
  donem: AnalizDonemiSema.default('30'),
  bas: tarih.optional(),
  bit: tarih.optional(),
});

export const SinifKonuSatiriSema = z.object({
  konu_id: z.uuid(),
  konu_ad: z.string().nullable(),
  /** Bu konuda kayit olan ogrenci sayisi. */
  ogrenci_sayisi: z.number().int(),
  /** Konuda basarisi %50'nin altinda olan (en az 5 soru cozmus) ogrenci sayisi. */
  zorlanan_ogrenci_sayisi: z.number().int(),
  hucreler: HucrelerSema,
  toplam: HucreSema,
});

export const SinifAnaliziSema = z.object({
  grup_id: z.uuid(),
  brans_kodu: z.string(),
  bas: tarih,
  bit: tarih,
  ogrenci_sayisi: z.number().int(),
  konular: z.array(SinifKonuSatiriSema),
  /** Basarisi en dusuk, yeterli verili en cok 5 konu (zorlanma sirasi). */
  en_cok_zorlanilan: z.array(SinifKonuSatiriSema),
  toplam: HucreSema,
});

// --- Haftalik ozet ---------------------------------------------------------------------------

export const HaftalikOzetSorguSema = z.object({
  /** Haftanin herhangi bir gunu; verilmezse bu hafta (Europe/Istanbul). */
  hafta: tarih.optional(),
});
export const BantDegisimiSema = z.enum(['iyilesti', 'ayni', 'kotulesti', 'belirsiz']);
export const HaftalikOzetSema = z.object({
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih,
  cozulen: z.number().int(),
  dogru: z.number().int(),
  yanlis: z.number().int(),
  bos: z.number().int(),
  basari: z.number().nullable(),
  en_zayif_konular: z.array(
    z.object({
      brans_kodu: z.string(),
      konu_id: z.uuid(),
      konu_ad: z.string().nullable(),
      cozulen: z.number().int(),
      basari: z.number().nullable(),
    }),
  ),
  /** Tum konular birlikte; bu hafta ve onceki haftanin bant tespiti. */
  bant: z.object({ onceki: BantTespitiSema, simdiki: BantTespitiSema, degisim: BantDegisimiSema }),
});

// --- Gorev ver -------------------------------------------------------------------------------

export const GorevVerGirdiSema = z.object({
  tur: z.enum(['plan_gorevi', 'odev']),
  brans_kodu: bransKodu,
  konu_id: z.uuid(),
  zorluk: ZorlukSema,
  soru_sayisi: z.number().int().min(1).max(500),
  /** `plan_gorevi`: gorev gunu (varsayilan yarin; Europe/Istanbul). */
  gun: tarih.optional(),
  /** `odev`: son teslim (varsayilan 3 gun sonra). */
  son_teslim_at: zaman.optional(),
});
export const GorevVerYanitiSema = z.discriminatedUnion('tur', [
  z.object({
    tur: z.literal('plan_gorevi'),
    plan_id: z.uuid(),
    gorev_id: z.uuid(),
    hafta_baslangic: tarih,
    gun: tarih,
    /** Plan taslaksa ogrenci henuz gormez: ogretmen yayinlamali. */
    plan_durum: z.enum(['taslak', 'yayinda']),
  }),
  z.object({ tur: z.literal('odev'), odev_id: z.uuid(), son_teslim_at: zaman }),
]);
