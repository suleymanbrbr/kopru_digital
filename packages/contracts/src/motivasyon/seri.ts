import { z } from 'zod';

/**
 * `motivasyon` servisinin seri (streak) uclari (docs/schema/motivasyon.md "Seri").
 * Alanlar `snake_case`. Gunler kurumun saat diliminde, gun 04:00'te doner.
 *
 * - `GET  /v1/motivasyon/kurumlar/{kurum_id}/benim/seri`: ogrencinin son 35 gunluk seri takvimi.
 * - `POST /v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari`: ogretmen/yonetici
 *   grup icin seri duraklatmasi baslatir (en cok 31 gun; cakisan aralik 409).
 * - `GET  .../seri-duraklatmalari`: grubun duraklatmalari.
 * - `DELETE .../seri-duraklatmalari/{duraklatma_id}`: duraklatmayi iptal eder.
 * - Modul kapaliysa `403 modul_kapali`.
 */

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });

/** Takvimde bir gunun durumu; `yok`: kayit yok (seri baslamadan once ya da henuz degerlendirilmedi). */
export const MOTIVASYON_SERI_GUN_DURUMLARI = [
  'aktif',
  'dondurma',
  'duraklatma',
  'onarim',
  'kacirildi',
  'yok',
] as const;
export const MotivasyonSeriGunDurumuSema = z.enum(MOTIVASYON_SERI_GUN_DURUMLARI);
export type MotivasyonSeriGunDurumu = z.infer<typeof MotivasyonSeriGunDurumuSema>;

export const MOTIVASYON_SERI_HEDEF_TURLERI = ['plan_gorevi', 'odak_dk', 'odev', 'soru'] as const;

/** Bir hedef turunde ilerleme; hedeflerden herhangi birinin `esik`e ulasmasi gunu aktif yapar. */
export const MotivasyonSeriHedefSema = z.object({
  tur: z.enum(MOTIVASYON_SERI_HEDEF_TURLERI),
  yapilan: z.number().int().min(0),
  esik: z.number().int().min(1),
  kalan: z.number().int().min(0),
});

export const MotivasyonSeriTakvimGunuSema = z.object({
  gun: tarih,
  durum: MotivasyonSeriGunDurumuSema,
  bugun: z.boolean(),
});

export const MotivasyonSeriOnarimiSema = z.object({
  /** Kacirilan gun (kurum saatinde). */
  bozulan_gun: tarih,
  bozulan_seri: z.number().int().min(1),
  /** Pencere sonu (kacirilan gunu izleyen gunun sonu = 04:00). */
  bitis_at: zaman,
  /** Onarim icin gunluk hedefin 2 kati: herhangi biri yeter. Ilerleme pencere gununundur. */
  hedefler: z.array(MotivasyonSeriHedefSema),
});

export const MotivasyonSeriDetaySema = z.object({
  /** Oyunlastirma gunu (kurum saatinde, 04:00 kurali). */
  bugun: tarih,
  mevcut_seri: z.number().int().min(0),
  en_uzun_seri: z.number().int().min(0),
  dondurma_stogu: z.number().int().min(0).max(2),
  onarim_hakki: z.number().int().min(0).max(1),
  bugun_aktif: z.boolean(),
  /** Bugunun hedefleri (her biri tek basina yeter). */
  hedefler: z.array(MotivasyonSeriHedefSema),
  /** Pencere aciksa ve hak varsa onarim bilgisi; yoksa `null`. */
  onarim: MotivasyonSeriOnarimiSema.nullable(),
  /** Sirada kilometre tasi; hepsi gecildiyse `null`. Seri 0 iken ilk tas. */
  sonraki_kilometre_tasi: z
    .object({ hedef: z.number().int().min(1), kalan: z.number().int().min(1) })
    .nullable(),
  /** Son 35 gun, eskiden yeniye; son eleman bugun. */
  gunler: z.array(MotivasyonSeriTakvimGunuSema),
});
export type MotivasyonSeriDetayi = z.infer<typeof MotivasyonSeriDetaySema>;

// --- Ogretmen duraklatmasi ---------------------------------------------------------------------

export const motivasyonDuraklatmaYolParamSema = z.object({
  kurum_id: z.uuid(),
  grup_id: z.uuid(),
});
export const motivasyonDuraklatmaKimlikParamSema = motivasyonDuraklatmaYolParamSema.extend({
  duraklatma_id: z.uuid(),
});

/** En fazla 31 gun (baslangic ve bitis dahil; sema: `bitis_gun - baslangic_gun <= 30`). */
export const MotivasyonDuraklatmaGirdisiSema = z
  .object({
    baslangic_gun: tarih,
    bitis_gun: tarih,
    neden: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.bitis_gun >= v.baslangic_gun, {
    message: 'Bitiş günü başlangıçtan önce olamaz.',
    path: ['bitis_gun'],
  });
export type MotivasyonDuraklatmaGirdisi = z.infer<typeof MotivasyonDuraklatmaGirdisiSema>;

export const MotivasyonDuraklatmaSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  veren_ogretmen_id: z.uuid(),
  baslangic_gun: tarih,
  bitis_gun: tarih,
  neden: z.string().nullable(),
  iptal_at: zaman.nullable(),
  created_at: zaman,
});
export type MotivasyonDuraklatma = z.infer<typeof MotivasyonDuraklatmaSema>;

export const MotivasyonDuraklatmaListesiSema = z.object({
  duraklatmalar: z.array(MotivasyonDuraklatmaSema),
});
