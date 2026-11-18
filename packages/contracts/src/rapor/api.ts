import { z } from 'zod';

import { KapsamSema } from '../hesap/izinler.js';

/**
 * Yonetici paneli ve kurum raporlari HTTP sozlesmeleri (docs/schema/api.md "Yonetici paneli ve raporlar").
 * Gosterge tanimlari her modulun kendi `rapor` dosyasinda ve api.md'de ayni metinle yazilidir; burada
 * yalniz bicim vardir. Alanlar `snake_case`. Ad yalniz yanit govdesindedir (olaya girmez).
 *
 * Panel birbirinden bagimsiz uc yanitla kurulur (modul siniri: her gosterge kendi modulunde hesaplanir):
 *  - hesap:    `/v1/hesap/kurumlar/:kurum_id/rapor/{ozet,ogrenciler}`                   aktif ogrenci, grup ve ogretmen dizini
 *  - ders:     `/v1/ders/kurumlar/:kurum_id/rapor/{ozet,devam,anladim}`                 devam orani, "anladim" orani
 *  - ogrenme:  `/v1/ogrenme/kurumlar/:kurum_id/rapor/{ozet,odev,plan,soru,disa-aktar}`  odev, plan, soru, etkinlik, Excel
 */

/** Panel donemleri: son N takvim gunu (bugun dahil), kurum saat dilimiyle. Varsayilan: haftalik. */
export const RAPOR_DONEMLERI = ['7', '30'] as const;
export const RaporDonemiSema = z.enum(RAPOR_DONEMLERI);
export type RaporDonemi = z.infer<typeof RaporDonemiSema>;

/** Alt listelerde bir yanitta donen en cok satir (`toplam_satir` gercek sayidir). */
export const RAPOR_LISTE_MAKS = 200;

export const RaporSorguSema = z.object({
  donem: RaporDonemiSema.default('7').describe('Son N gün (kurum saat dilimiyle, bugün dahil).'),
});
export const RaporListeSorguSema = RaporSorguSema.extend({
  grup_id: z.uuid().optional().describe('Yalnız bu grubun satırları.'),
  ogretmen_id: z.uuid().optional().describe('Yalnız bu öğretmenin satırları.'),
});

export const RaporDonemAlaniSema = z.object({
  donem_gun: z.number().int(),
  baslangic: z.iso.date().describe('Kurum yerel günü, dahil.'),
  bitis: z.iso.date().describe('Kurum yerel günü, dahil (bugün).'),
  kapsam: KapsamSema.describe('Yanıtı daraltan izin kapsamı (öğretmen: `grup`).'),
});

/** Oran: `oran` = pay / payda (4 basamak); payda 0 ise `null`. */
export const RaporOraniSema = z.object({
  pay: z.number().int(),
  payda: z.number().int(),
  oran: z.number().nullable(),
});
export type RaporOrani = z.infer<typeof RaporOraniSema>;

const kapaliOlabilir = <T extends z.ZodType>(s: T) =>
  s.nullable().describe('Modül kurumda kapalıysa `null`.');

// --- hesap -------------------------------------------------------------------------------------

export const HesapRaporOzetSema = RaporDonemAlaniSema.extend({
  kurum: z.object({
    aktif_ogrenci: z.number().int(),
    grup_sayisi: z.number().int(),
    ogretmen_sayisi: z.number().int(),
  }),
  gruplar: z.array(
    z.object({
      grup_id: z.uuid(),
      ad: z.string(),
      tur: z.string(),
      aktif_ogrenci: z.number().int(),
    }),
  ),
  ogretmenler: z.array(
    z.object({
      ogretmen_id: z.uuid(),
      gorunen_ad: z.string().nullable(),
      grup_sayisi: z.number().int(),
      aktif_ogrenci: z.number().int(),
    }),
  ),
});

export const HesapRaporOgrenciSema = z.object({
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  gruplar: z.array(z.string()),
});
export const HesapRaporOgrencilerSema = z.object({
  toplam_satir: z.number().int(),
  satirlar: z.array(HesapRaporOgrenciSema),
});

// --- ders --------------------------------------------------------------------------------------

export const DersRaporGostergeleriSema = z.object({
  devam: kapaliOlabilir(RaporOraniSema),
  anladim: kapaliOlabilir(RaporOraniSema),
});
export const DersRaporOzetSema = RaporDonemAlaniSema.extend({
  kurum: DersRaporGostergeleriSema,
  gruplar: z.array(DersRaporGostergeleriSema.extend({ grup_id: z.uuid() })),
  ogretmenler: z.array(DersRaporGostergeleriSema.extend({ ogretmen_id: z.uuid() })),
});

/** Ogrenci bazinda oran satiri; `ayrinti` degerleri gosterge icin sayilardir (ornek: geldi/gec/gelmedi/izinli). */
export const RaporOgrenciOraniSema = z.object({
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  pay: z.number().int(),
  payda: z.number().int(),
  oran: z.number().nullable(),
  ayrinti: z.record(z.string(), z.number().int()),
});
export const RaporOgrenciOraniListeSema = z.object({
  toplam_satir: z.number().int(),
  satirlar: z.array(RaporOgrenciOraniSema),
});

// --- ogrenme -----------------------------------------------------------------------------------

export const RaporSoruGostergesiSema = z.object({
  soru_sayisi: z.number().int(),
  cevaplanan: z.number().int(),
  ortalama_ilk_cevap_sn: z.number().int().nullable(),
  medyan_ilk_cevap_sn: z.number().int().nullable(),
});
export const OgrenmeRaporGostergeleriSema = z.object({
  odev: kapaliOlabilir(RaporOraniSema),
  plan: kapaliOlabilir(RaporOraniSema),
  soru: kapaliOlabilir(RaporSoruGostergesiSema),
});
export const OgrenmeRaporOzetSema = RaporDonemAlaniSema.extend({
  kurum: OgrenmeRaporGostergeleriSema.extend({
    etkin_ogrenci: z
      .number()
      .int()
      .describe(
        'Son 7 günde yoklaması alınan, ödev teslim eden, plan görevi tamamlayan veya soru soran öğrenci.',
      ),
  }),
  gruplar: z.array(
    OgrenmeRaporGostergeleriSema.extend({ grup_id: z.uuid(), etkin_ogrenci: z.number().int() }),
  ),
  ogretmenler: z.array(OgrenmeRaporGostergeleriSema.extend({ ogretmen_id: z.uuid() })),
});

export const RaporOdevSatiriSema = z.object({
  ogrenci_odev_id: z.uuid(),
  odev_id: z.uuid(),
  baslik: z.string(),
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  son_teslim_at: z.iso.datetime({ offset: true }),
  durum: z.string(),
});
export const RaporOdevListeSema = z.object({
  toplam_satir: z.number().int(),
  satirlar: z.array(RaporOdevSatiriSema),
});

export const RaporSoruSatiriSema = z.object({
  soru_id: z.uuid(),
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  brans_kodu: z.string(),
  durum: z.string(),
  sorulma_at: z.iso.datetime({ offset: true }),
  ilk_cevap_sn: z.number().int().nullable().describe('Cevap beklemede ise `null`.'),
});
export const RaporSoruListeSema = z.object({
  toplam_satir: z.number().int(),
  satirlar: z.array(RaporSoruSatiriSema),
});
