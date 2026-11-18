import { z } from 'zod';

/**
 * `motivasyon` servisinin platform uclari (docs/schema/motivasyon.md "Platform ayarlari").
 * Yalniz JWT'de `plat = yonetici` olan kullanici; kurum bagli degildir (global ayar).
 *
 * - `GET  /platform/motivasyon/ayarlar`: gecerli degerler ve surum gecmisi.
 * - `PUT  /platform/motivasyon/ayarlar`: kismi degisiklik, yeni surum (gecmis XP degismez).
 * - `POST /platform/motivasyon/ayarlar/geri-al`: eski bir surumun degerleriyle yeni surum.
 *
 * Gecersiz deger/tutarsizlik `422 ayar_gecersiz` (`details.hatalar`); varsayim bozan degisiklik reddedilmez,
 * yanitta `uyarilar` doner. Degisiklik yok `422 degisiklik_yok`; `beklenen_surum` eskiyse `409 surum_catismasi`.
 */

/** Bir XP kuralinin platformdan degistirilebilen alanlari. */
export const PlatformKuralDegeriSema = z.object({
  /** Olay basina (birimli kuralda birim basina) XP. 0..500. */
  xp: z.number().int(),
  /** Tek olaydan en cok XP; yok ise `null`. */
  olay_basi_ust_sinir: z.number().int().nullable(),
  /** Gec teslim carpani, 0..1 (iki ondalik). */
  gec_carpani: z.number(),
  aktif: z.boolean(),
});
export type PlatformKuralDegeri = z.infer<typeof PlatformKuralDegeriSema>;

export const PlatformAyarDegerleriSema = z.object({
  /** Anahtar: `xp_kurallari.kod`. */
  kurallar: z.record(z.string(), PlatformKuralDegeriSema),
  /** Anahtar: `xp_tavanlari.kod` (`genel`, `plan`, ...); deger gunluk ust sinir (1..2000). */
  tavanlar: z.record(z.string(), z.number().int()),
});
export type PlatformAyarDegerleri = z.infer<typeof PlatformAyarDegerleriSema>;

export const PlatformAyarUyarisiSema = z.object({
  /** Makine kodu: `haftalik_xp_degisti`, `ilk_gun_hedefi`, `genel_tavan_dar`, `kural_kapatildi`. */
  kod: z.string(),
  mesaj: z.string(),
});
export type PlatformAyarUyarisi = z.infer<typeof PlatformAyarUyarisiSema>;

export const PlatformAyarSurumuSema = z.object({
  surum: z.number().int().min(1),
  degerler: PlatformAyarDegerleriSema,
  onceki_surum: z.number().int().nullable(),
  /** Geri almada hedef surum; aksi halde `null`. */
  geri_alinan_surum: z.number().int().nullable(),
  /** Degistiren platform yoneticisi (`null`: tohum). */
  degistiren_kullanici_id: z.uuid().nullable(),
  neden: z.string(),
  uyarilar: z.array(PlatformAyarUyarisiSema),
  created_at: z.iso.datetime({ offset: true }),
});
export type PlatformAyarSurumu = z.infer<typeof PlatformAyarSurumuSema>;

export const PlatformAyarlarYanitiSema = z.object({
  /** Su an uygulanan degerler; `surum` son surum numarasidir. */
  gecerli: z.object({ surum: z.number().int().min(1), degerler: PlatformAyarDegerleriSema }),
  /** Yeniden eskiye surumler. */
  gecmis: z.array(PlatformAyarSurumuSema),
});
export type PlatformAyarlarYaniti = z.infer<typeof PlatformAyarlarYanitiSema>;

export const PlatformAyarlarSorguSema = z.object({
  /** Dondurulecek surum sayisi (en yeni once). */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PlatformKuralKismiSema = z
  .object({
    xp: z.number(),
    olay_basi_ust_sinir: z.number().nullable(),
    gec_carpani: z.number(),
    aktif: z.boolean(),
  })
  .partial()
  .strict();

export const PlatformAyarGuncellemeIstegiSema = z
  .object({
    /** Zorunlu gerekce (denetim): 3..500 karakter. */
    neden: z.string().trim().min(3).max(500),
    /** Verilirse ve son surumden farkliysa 409 (es zamanli duzenleme korumasi). */
    beklenen_surum: z.number().int().min(1).optional(),
    kurallar: z.record(z.string(), PlatformKuralKismiSema).optional(),
    tavanlar: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type PlatformAyarGuncellemeIstegi = z.infer<typeof PlatformAyarGuncellemeIstegiSema>;

export const PlatformAyarGeriAlIstegiSema = z
  .object({
    /** Degerleri yeniden uygulanacak surum. */
    surum: z.number().int().min(1),
    neden: z.string().trim().min(3).max(500),
    beklenen_surum: z.number().int().min(1).optional(),
  })
  .strict();
export type PlatformAyarGeriAlIstegi = z.infer<typeof PlatformAyarGeriAlIstegiSema>;
