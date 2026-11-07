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
  modulKapali: 'modul_kapali',
  izinYok: 'izin_yok',
  taklitSaltOkunur: 'taklit_salt_okunur',
  ustDuzeyKapali: 'ust_duzey_kapali',
  gecersizTelefon: 'gecersiz_telefon',
  kodGecersiz: 'kod_gecersiz',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
