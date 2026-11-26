import { z } from 'zod';

import { defineEvent } from '../event.js';
import { HaftalikOzetSema, HucreSema, KonuAnaliziSema, OneriSema } from './gunluk-soru.js';

/**
 * Ogretmen degerlendirmeleri, onerilen kaynaklar ve ogrenci kocluk gorunumu (docs/schema/api.md
 * "Ogretmen degerlendirmeleri, onerilen kaynaklar ve kocluk gorunumu"). Alanlar `snake_case`.
 * Olaylar yalniz kimlik tasir: yorum metni, oneri notu, baslik, baglanti ve ad ASLA girmez.
 * Veli arayuzu yoktur (Faz 2). Ogrenci yalniz `ogrenci_gorur = true` degerlendirmeleri gorur.
 */

export const degerlendirmeHataKodlari = {
  /** 409: yazar penceresi (olusturmadan 7 gun) doldu. */
  duzenlenemez: 'degerlendirme_duzenlenemez',
  /** 409: geri cekilmis degerlendirme degistirilemez. */
  geriCekildi: 'degerlendirme_geri_cekildi',
  donemGecersiz: 'donem_gecersiz',
  kaynakGecersiz: 'kaynak_gecersiz',
  surumCakismasi: 'surum_cakismasi',
} as const;

/** Yazar degerlendirmesini olusturmadan sonra bu kadar gun duzeltebilir. */
export const DEGERLENDIRME_DUZENLEME_GUN = 7;
/** Bir degerlendirme donemi (baslangic..bitis) en cok bu kadar gun. */
export const DEGERLENDIRME_EN_FAZLA_DONEM_GUN = 31;
export const DEGERLENDIRME_YORUM_EN_FAZLA = 4000;
export const KAYNAK_ONERISI_NOT_EN_FAZLA = 1000;
export const KAYNAK_ONERISI_URL_EN_FAZLA = 2000;
/** Kocluk gorunumunde olcek ortalamasi icin geriye bakilan hafta. */
export const KOCLUK_ORTALAMA_HAFTA = 4;
/** Hatirlatma ucunun dondurdugu en cok ogrenci. */
export const HATIRLATMA_EN_FAZLA = 100;

const zaman = z.iso.datetime({ offset: true });
const tarih = z.iso.date();
const bransKodu = z.string().trim().min(1).max(40);
const bayrak = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

// --- Olaylar ---------------------------------------------------------------------------------

/** Ogrenciye gorunur degerlendirme yayimlandi (ilk kez gorunur oldugunda bir kez). Tuketici: `bildirim`. */
export const ogrenmeDegerlendirmeYayimlandiV1 = defineEvent(
  'ogrenme.degerlendirme.yayimlandi',
  1,
  z.object({
    degerlendirme_id: z.uuid(),
    ogrenci_id: z.uuid(),
    yazar_id: z.uuid(),
  }),
);

export const KAYNAK_ONERISI_TURLERI = [
  'kaynak_kitap',
  'kaynak_kitap_testi',
  'link',
  'serbest',
] as const;
export const KaynakOnerisiTuruSema = z.enum(KAYNAK_ONERISI_TURLERI);
export type KaynakOnerisiTuru = z.infer<typeof KaynakOnerisiTuruSema>;

/** Ogrenciye yeni kaynak onerildi. Tuketici: `bildirim`. */
export const ogrenmeKaynakOnerisiEklendiV1 = defineEvent(
  'ogrenme.kaynak_onerisi.eklendi',
  1,
  z.object({
    oneri_id: z.uuid(),
    ogrenci_id: z.uuid(),
    oneren_id: z.uuid(),
    tur: KaynakOnerisiTuruSema,
  }),
);

// --- Degerlendirme ---------------------------------------------------------------------------

const olcek = z.number().int().min(1).max(5);

export const DegerlendirmeSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  yazar_id: z.uuid(),
  /** Yazar hesabi silindiyse (anonim) bos. */
  yazar_ad: z.string().nullable(),
  donem_baslangic: tarih,
  donem_bitis: tarih,
  brans_kodu: z.string().nullable(),
  calisma_duzeni: olcek.nullable(),
  derse_katilim: olcek.nullable(),
  odev_disiplini: olcek.nullable(),
  anlama_duzeyi: olcek.nullable(),
  yorum: z.string().nullable(),
  /** Ogrenciye gorunur mu (yorum basina, varsayilan kapali). */
  ogrenci_gorur: z.boolean(),
  geri_cekildi_at: zaman.nullable(),
  /** Isteyen kisi yazar mi. */
  benim: z.boolean(),
  /** Yazar, 7 gun icinde ve geri cekilmemis: duzenlenebilir. */
  duzenlenebilir: z.boolean(),
  duzenleme_son_at: zaman,
  surum: z.number().int(),
  created_at: zaman,
});
export type Degerlendirme = z.infer<typeof DegerlendirmeSema>;

/** Ogrencinin gordugu sade yuzey: gorunurluk bayragi, yazar kimligi ve surum yoktur. */
export const OgrenciDegerlendirmeSema = z.object({
  id: z.uuid(),
  yazar_ad: z.string().nullable(),
  donem_baslangic: tarih,
  donem_bitis: tarih,
  brans_kodu: z.string().nullable(),
  calisma_duzeni: olcek.nullable(),
  derse_katilim: olcek.nullable(),
  odev_disiplini: olcek.nullable(),
  anlama_duzeyi: olcek.nullable(),
  yorum: z.string().nullable(),
  created_at: zaman,
});
export type OgrenciDegerlendirme = z.infer<typeof OgrenciDegerlendirmeSema>;

const degerlendirmeAlanlari = {
  brans_kodu: bransKodu.nullish(),
  calisma_duzeni: olcek.nullish(),
  derse_katilim: olcek.nullish(),
  odev_disiplini: olcek.nullish(),
  anlama_duzeyi: olcek.nullish(),
  yorum: z.string().trim().min(1).max(DEGERLENDIRME_YORUM_EN_FAZLA).nullish(),
  ogrenci_gorur: z.boolean(),
};

const OLCEK_ALANLARI = [
  'calisma_duzeni',
  'derse_katilim',
  'odev_disiplini',
  'anlama_duzeyi',
] as const;

export const DegerlendirmeOlusturGirdiSema = z
  .object({
    /** Haftalik ise haftanin baslangici; tek gun icin bitis verilmez. */
    donem_baslangic: tarih,
    /** Verilmezse `donem_baslangic` (tek gun). */
    donem_bitis: tarih.optional(),
    ...degerlendirmeAlanlari,
    ogrenci_gorur: degerlendirmeAlanlari.ogrenci_gorur.default(false),
  })
  .refine((g) => g.yorum != null || OLCEK_ALANLARI.some((k) => g[k] != null), {
    message: 'Yorum ya da en az bir ölçek dolu olmalı.',
    path: ['yorum'],
  });
export type DegerlendirmeOlusturGirdi = z.infer<typeof DegerlendirmeOlusturGirdiSema>;

/** Verilen alanlar degisir; `null` alani temizler. `surum` iyimser kilittir. */
export const DegerlendirmeGuncelleGirdiSema = z
  .object({
    donem_baslangic: tarih.optional(),
    donem_bitis: tarih.optional(),
    brans_kodu: bransKodu.nullable().optional(),
    calisma_duzeni: olcek.nullable().optional(),
    derse_katilim: olcek.nullable().optional(),
    odev_disiplini: olcek.nullable().optional(),
    anlama_duzeyi: olcek.nullable().optional(),
    yorum: z.string().trim().min(1).max(DEGERLENDIRME_YORUM_EN_FAZLA).nullable().optional(),
    ogrenci_gorur: z.boolean().optional(),
    surum: z.number().int().min(1).optional(),
  })
  .refine((g) => Object.keys(g).some((k) => k !== 'surum'), { message: 'Değişiklik yok.' });

export const DegerlendirmeListeSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(200).optional(),
  /** Geri cekilenler de gelsin (yalniz personel listesi). */
  geri_cekilenler: bayrak,
});

export const DegerlendirmeListeYanitiSema = z.object({
  degerlendirmeler: z.array(DegerlendirmeSema),
  sonraki_imlec: z.string().nullable(),
});

export const OgrenciDegerlendirmeListeSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(200).optional(),
});

export const OgrenciDegerlendirmeListeYanitiSema = z.object({
  degerlendirmeler: z.array(OgrenciDegerlendirmeSema),
  sonraki_imlec: z.string().nullable(),
});

// --- Kaynak onerisi --------------------------------------------------------------------------

const baslik = z.string().trim().min(1).max(200);
const notMetni = z.string().trim().min(1).max(KAYNAK_ONERISI_NOT_EN_FAZLA).nullish();
const httpUrl = z
  .string()
  .trim()
  .max(KAYNAK_ONERISI_URL_EN_FAZLA)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
    } catch {
      return false;
    }
  }, 'Bağlantı http ya da https ile başlayan geçerli bir adres olmalı.');

const ortakOneri = { konu_id: z.uuid().nullish(), not: notMetni };

export const KaynakOnerisiOlusturGirdiSema = z
  .discriminatedUnion('tur', [
    z.object({ tur: z.literal('kaynak_kitap'), kaynak_kitap_id: z.uuid(), ...ortakOneri }),
    z.object({ tur: z.literal('kaynak_kitap_testi'), kaynak_test_id: z.uuid(), ...ortakOneri }),
    z.object({
      tur: z.literal('link'),
      baglanti_url: httpUrl,
      baslik,
      brans_kodu: bransKodu.nullish(),
      ...ortakOneri,
    }),
    z.object({
      tur: z.literal('serbest'),
      baslik,
      brans_kodu: bransKodu.nullish(),
      ...ortakOneri,
    }),
  ])
  .refine(
    (g) =>
      g.konu_id == null ||
      g.tur === 'kaynak_kitap' ||
      g.tur === 'kaynak_kitap_testi' ||
      g.brans_kodu != null,
    { message: 'Konu seçildiyse ders (brans_kodu) de verilmeli.', path: ['brans_kodu'] },
  );
export type KaynakOnerisiOlusturGirdi = z.infer<typeof KaynakOnerisiOlusturGirdiSema>;

export const KaynakOnerisiSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  oneren_id: z.uuid(),
  oneren_ad: z.string().nullable(),
  tur: KaynakOnerisiTuruSema,
  kaynak_kitap_id: z.uuid().nullable(),
  kaynak_kitap_ad: z.string().nullable(),
  kaynak_test_id: z.uuid().nullable(),
  kaynak_test_ad: z.string().nullable(),
  baglanti_url: z.string().nullable(),
  baslik: z.string().nullable(),
  brans_kodu: z.string().nullable(),
  konu_id: z.uuid().nullable(),
  konu_ad: z.string().nullable(),
  not: z.string().nullable(),
  /**
   * Oneriden sonra gunluk soru kaydinda bu kitap/test/metin kullanildi mi. `link` icin olculemez: null.
   */
  basladi: z.boolean().nullable(),
  ilk_kullanim_gun: tarih.nullable(),
  son_kullanim_gun: tarih.nullable(),
  kayit_sayisi: z.number().int(),
  geri_cekildi_at: zaman.nullable(),
  /** Isteyen kisi oneren mi. */
  benim: z.boolean(),
  created_at: zaman,
});
export type KaynakOnerisi = z.infer<typeof KaynakOnerisiSema>;

export const KaynakOnerisiListeSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  geri_cekilenler: bayrak,
});
export const KaynakOnerisiListeYanitiSema = z.object({ oneriler: z.array(KaynakOnerisiSema) });

// --- Hatirlatma ------------------------------------------------------------------------------

export const DegerlendirmeHatirlatmaSema = z.object({
  hafta_baslangic: tarih,
  /** Hafta basina kapsamdaki etkin ogrenci sayisi (kartta "x / y"). */
  ogrenci_sayisi: z.number().int(),
  /** Degerlendirmesi olmayan toplam ogrenci (liste en cok `HATIRLATMA_EN_FAZLA`). */
  eksik_sayisi: z.number().int(),
  ogrenciler: z.array(
    z.object({
      ogrenci_id: z.uuid(),
      ogrenci_ad: z.string().nullable(),
      /** En son degerlendirmenin donem baslangici; hic yoksa null. */
      son_degerlendirme_gun: tarih.nullable(),
    }),
  ),
});

// --- Kocluk gorunumu -------------------------------------------------------------------------

export const KoclukSorguSema = z.object({
  /** Zaman cizelgesinin ilk sayfa buyuklugu; devami `degerlendirmeler` liste ucundan. */
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ortalama = z.number().min(1).max(5).nullable();
const OlcekOrtalamalariSema = z.object({
  sayi: z.number().int(),
  calisma_duzeni: ortalama,
  derse_katilim: ortalama,
  odev_disiplini: ortalama,
  anlama_duzeyi: ortalama,
});

export const KoclukKitapKullanimiSema = z.object({
  kaynak_kitap_id: z.uuid(),
  ad: z.string(),
  brans_kodu: z.string(),
  cozulen_test: z.number().int(),
  toplam_test: z.number().int(),
  kayit_sayisi: z.number().int(),
  cozulen_soru: z.number().int(),
  son_kullanim_gun: tarih,
});

export const KoclukKonuAnaliziSema = z.object({
  bas: tarih,
  bit: tarih,
  toplam: HucreSema,
  haftalik_ozet: HaftalikOzetSema,
  bransler: z.array(
    z.object({
      brans_kodu: z.string(),
      toplam: HucreSema,
      /** Basarisi dusukten yuksege (en az 5 soru), en cok 5. */
      zayif_konular: z.array(KonuAnaliziSema),
      oneriler: z.array(OneriSema),
    }),
  ),
});

export const KoclukYanitiSema = z.object({
  ogrenci_id: z.uuid(),
  ogrenci_ad: z.string().nullable(),
  degerlendirmeler: DegerlendirmeListeYanitiSema,
  olcek_ortalamalari: z.object({
    haftalar: z.array(OlcekOrtalamalariSema.extend({ hafta_baslangic: tarih })),
    toplam: OlcekOrtalamalariSema,
  }),
  kullanilan_kaynaklar: z.object({
    kitaplar: z.array(KoclukKitapKullanimiSema),
    serbest: z.array(
      z.object({
        ad: z.string(),
        kayit_sayisi: z.number().int(),
        son_kullanim_gun: tarih,
      }),
    ),
    odevler: z.array(
      z.object({
        ad: z.string(),
        odev_sayisi: z.number().int(),
        son_kullanim_gun: tarih,
      }),
    ),
  }),
  oneriler: z.array(KaynakOnerisiSema),
  konu_analizi: KoclukKonuAnaliziSema,
  plan_odev: z.object({
    plan: z
      .object({
        plan_id: z.uuid(),
        hafta_baslangic: tarih,
        durum: z.enum(['taslak', 'yayinda']),
        gorev_sayisi: z.number().int(),
        tamam_sayisi: z.number().int(),
        soru: z.object({ planlanan: z.number().int(), gerceklesen: z.number().int() }),
        dakika: z.object({ planlanan: z.number().int(), gerceklesen: z.number().int() }),
      })
      .nullable(),
    odev: z.object({
      acik: z.number().int(),
      geciken: z.number().int(),
      teslim_edildi: z.number().int(),
      inceleme_bekleyen: z.number().int(),
    }),
  }),
});
export type KoclukYaniti = z.infer<typeof KoclukYanitiSema>;
