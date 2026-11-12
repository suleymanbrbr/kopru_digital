import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `motivasyon` servisinin olaylari (docs/schema/olaylar.md "motivasyon"). Tuketici: `bildirim.uretim`.
 * Yuk yalniz kimlik, sayi ve kod tasir: ad, telefon, e-posta, karakter adi ve rozet/kozmetik gorunen adi
 * ASLA girmez (`olaylar.test.ts` yasak alanlari denetler). `ogrenci_id` = `hesap.uyelikler.id`.
 *
 * `seviye.atladi`, `rozet.kazanildi` ve `karakter.evrildi` XP tuketicisinden (`motivasyon.xp`) yayimlanir;
 * seri olaylari (`seri.*`) seri isinden (gece degerlendirmesi, XP/aktivite hesabi) yayimlanir.
 */

const zaman = z.iso.datetime({ offset: true });

export const motivasyonSeviyeAtladiV1 = defineEvent(
  'motivasyon.seviye.atladi',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    eski_seviye: z.number().int().min(1),
    yeni_seviye: z.number().int().min(2),
    toplam_xp: z.number().int().min(0),
  }),
);

export const motivasyonRozetKazanildiV1 = defineEvent(
  'motivasyon.rozet.kazanildi',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    rozet_kodu: z.string().min(1),
    kazanildi_at: zaman,
  }),
);

export const motivasyonKarakterEvrildiV1 = defineEvent(
  'motivasyon.karakter.evrildi',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    tur_kodu: z.string().min(1),
    eski_asama: z.number().int().min(1).max(5),
    yeni_asama: z.number().int().min(2).max(5),
  }),
);

/** Gece degerlendirmesinde seri bozulunca (seri paketi yayimlar). */
export const motivasyonSeriBozuldiV1 = defineEvent(
  'motivasyon.seri.bozuldu',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    onceki_seri: z.number().int().min(1),
    onarilabilir: z.boolean(),
    /** Onarim penceresinin son gunu (`YYYY-MM-DD`, kurum saat diliminde); onarilamazsa `null`. */
    onarim_son_gun: z.iso.date().nullable(),
  }),
);

/** Seri 3, 7, 14, 30, 60, 100, 365'e ulasinca (seri paketi yayimlar). */
export const motivasyonSeriKilometreTasiV1 = defineEvent(
  'motivasyon.seri.kilometre_tasi',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    seri: z.number().int().min(1),
  }),
);

/** 21:00 yerel is: bugun henuz aktif olmayan ve `mevcut_seri >= 3` ogrenciler (seri paketi yayimlar). */
export const motivasyonSeriRiskV1 = defineEvent(
  'motivasyon.seri.risk',
  1,
  z.object({
    ogrenci_id: z.uuid(),
    mevcut_seri: z.number().int().min(3),
    /** Ertesi gun 04:00'un UTC karsiligi. */
    gun_bitis_at: zaman,
    dondurma_stogu: z.number().int().min(0).max(2),
  }),
);

export const MOTIVASYON_SERI_KILOMETRE_TASLARI = [3, 7, 14, 30, 60, 100, 365] as const;
