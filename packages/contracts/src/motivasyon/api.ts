import { z } from 'zod';

/**
 * `motivasyon` servisinin kullaniciya acik okuma sozlesmesi (docs/schema/motivasyon.md "Okuma uclari").
 * Alanlar `snake_case`. Gelistirmede motivasyon ayri portta calisir (4001); canlida istemciler ayni alan
 * adindan `/v1/motivasyon/*` ile ulasir.
 *
 * - `GET /v1/motivasyon/kurumlar/{kurum_id}/benim`: ogrencinin kendi durumu.
 * - `GET /v1/motivasyon/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/ozet`: ayni govde; ogretmen yalniz
 *   atandigi gruplardaki ogrenciyi, yonetici/sahip kurumdakileri gorur.
 * - Modul kapaliysa `403 modul_kapali`.
 */

export const MOTIVASYON_ROZET_KATEGORILERI = [
  'devamlilik',
  'emek',
  'gelisim',
  'merak',
  'ozel',
] as const;
export const MotivasyonRozetKategoriSema = z.enum(MOTIVASYON_ROZET_KATEGORILERI);
export type MotivasyonRozetKategori = z.infer<typeof MotivasyonRozetKategoriSema>;

export const MOTIVASYON_ROZET_KADEMELERI = ['bronz', 'gumus', 'altin'] as const;
export const MotivasyonRozetKademeSema = z.enum(MOTIVASYON_ROZET_KADEMELERI);

export const MOTIVASYON_KOZMETIK_SLOTLARI = [
  'sapka',
  'gozluk',
  'aksesuar',
  'arka_plan',
  'cerceve',
] as const;
export const MotivasyonKozmetikSlotSema = z.enum(MOTIVASYON_KOZMETIK_SLOTLARI);

/** Seviye cizelgesi ust siniri (tohum 1..60). */
export const MOTIVASYON_SEVIYE_SINIRI = 60;

export const motivasyonYolParamSema = z.object({ kurum_id: z.uuid() });
export const motivasyonOgrenciYolParamSema = z.object({
  kurum_id: z.uuid(),
  ogrenci_id: z.uuid(),
});

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });

export const MotivasyonTavanSema = z.object({
  /** `genel`, `plan`, `odak`, `soru`, `kayit`. */
  kod: z.string(),
  kullanilan: z.number().int().min(0),
  ust_sinir: z.number().int().min(1),
});

export const MotivasyonBeceriSema = z.object({
  kod: z.string(),
  ad: z.string(),
  puan: z.number().int().min(0),
});

export const MotivasyonKazanilanRozetSema = z.object({
  kod: z.string(),
  ad: z.string(),
  aciklama: z.string(),
  kategori: MotivasyonRozetKategoriSema,
  kademe: MotivasyonRozetKademeSema,
  kazanildi_at: zaman,
});

/** Kilitli rozet: ilerleme (`ilerleme / esik`); gizli rozetler kazanilana kadar listelenmez. */
export const MotivasyonKilitliRozetSema = z.object({
  kod: z.string(),
  ad: z.string(),
  aciklama: z.string(),
  kategori: MotivasyonRozetKategoriSema,
  kademe: MotivasyonRozetKademeSema,
  sayac_kodu: z.string(),
  ilerleme: z.number().int().min(0),
  esik: z.number().int().min(1),
});

export const MotivasyonKarakterSema = z.object({
  tur_kodu: z.string(),
  ad: z.string(),
  asama: z.number().int().min(1).max(5),
  /** Sonraki asamanin gerektirdigi seviye; son asamada `null`. */
  sonraki_asama_seviyesi: z.number().int().nullable(),
  kusanilanlar: z.array(z.object({ slot: MotivasyonKozmetikSlotSema, kozmetik_kodu: z.string() })),
});

export const MotivasyonSeriOzetiSema = z.object({
  mevcut_seri: z.number().int().min(0),
  en_uzun_seri: z.number().int().min(0),
  son_aktif_gun: tarih.nullable(),
  dondurma_stogu: z.number().int().min(0).max(2),
  onarim_hakki: z.number().int().min(0).max(1),
  bozulan_seri: z.number().int().nullable(),
  bozulan_gun: tarih.nullable(),
  onarim_bitis_at: zaman.nullable(),
});

export const MotivasyonXpHareketiSema = z.object({
  id: z.uuid(),
  kural_kodu: z.string(),
  /** Negatif: ters kayit (ornegin yoklama izinliye cevrildi). */
  xp: z.number().int(),
  gun: tarih,
  kismi: z.boolean(),
  created_at: zaman,
});

export const MotivasyonOgrenciDurumuSema = z.object({
  ogrenci_id: z.uuid(),
  toplam_xp: z.number().int().min(0),
  seviye: z.number().int().min(1),
  /** Mevcut seviyenin toplam XP esigi. */
  seviye_baslangic_xp: z.number().int().min(0),
  /** Sonraki seviyenin toplam XP esigi; son seviyede `null`. */
  sonraki_seviye_xp: z.number().int().nullable(),
  /** Sonraki seviyeye kalan XP; son seviyede `null`. */
  sonraki_seviyeye_kalan: z.number().int().nullable(),
  bu_hafta_xp: z.number().int().min(0),
  bugun: z.object({
    /** Kurum saat diliminde 04:00 kuralina gore gun. */
    gun: tarih,
    xp: z.number().int().min(0),
    tavanlar: z.array(MotivasyonTavanSema),
  }),
  beceriler: z.array(MotivasyonBeceriSema),
  rozetler: z.object({
    kazanilan: z.array(MotivasyonKazanilanRozetSema),
    kilitli: z.array(MotivasyonKilitliRozetSema),
  }),
  karakter: MotivasyonKarakterSema.nullable(),
  seri: MotivasyonSeriOzetiSema,
  son_hareketler: z.array(MotivasyonXpHareketiSema),
});

export type MotivasyonOgrenciDurumu = z.infer<typeof MotivasyonOgrenciDurumuSema>;
