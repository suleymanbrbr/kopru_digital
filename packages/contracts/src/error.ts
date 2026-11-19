import { z } from 'zod';

/** Tum servislerin dondurdugu standart hata govdesi. `message` kullaniciya gosterilebilir (Turkce). */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Makine tarafindan okunan hata kodlari. */
export const errorCodes = {
  validation: 'dogrulama_hatasi',
  unauthorized: 'yetkisiz',
  forbidden: 'yasak',
  notFound: 'bulunamadi',
  conflict: 'cakisma',
  rateLimited: 'cok_fazla_istek',
  unavailable: 'hizmet_kullanilamiyor',
  internal: 'sunucu_hatasi',
  // Alan hata kodlari (ADR 0006: Turkce ASCII)
  rizaGerekli: 'riza_gerekli',
  kurumGerekli: 'kurum_gerekli',
  abonelikGerekli: 'abonelik_gerekli',
  /** 402: planin ogrenci/ogretmen limiti dolu; `details`: `PlanLimitiDetaySema`. */
  planLimiti: 'plan_limiti',
  modulKapali: 'modul_kapali',
  izinYok: 'izin_yok',
  taklitSaltOkunur: 'taklit_salt_okunur',
  // Platform yonetimi (ADR 0004)
  ikinciAdimGerekli: 'ikinci_adim_gerekli',
  platformIpYasak: 'platform_ip_yasak',
  platformYetkisiYok: 'platform_yetkisi_yok',
  platformIzinYok: 'platform_izin_yok',
  /** 403: kurum platform yoneticisi tarafindan askiya alinmis (ADR 0004, 2026-11-19). */
  kurumAskida: 'kurum_askida',
  ikinciAdimKurulu: 'ikinci_adim_kurulu',
  ustDuzeyKapali: 'ust_duzey_kapali',
  gecersizTelefon: 'gecersiz_telefon',
  kodGecersiz: 'kod_gecersiz',
  /** 409: kurumun tek sahibi; hesap silinemez (`details.kurumlar`). */
  kurumSahibiEngeli: 'kurum_sahibi_engeli',
  /** 409: zaten bekleyen bir silme talebi var. */
  silmeTalebiVar: 'silme_talebi_var',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
