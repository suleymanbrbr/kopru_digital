import { ModulKoduSema } from '@kopru/contracts';
import { z } from 'zod';

/**
 * Tarayici ile Next sunucusu (BFF) arasindaki oturum sozlesmesi. Gercek kimlik saglayici
 * (Better Auth, ADR 0004) bu sekle `src/sunucu/kimlik/api.ts` icinde cevrilir.
 */

export const rolSema = z.enum(['sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli']);

export const uyelikSema = z.object({
  id: z.string(),
  kurumId: z.string(),
  kurumAd: z.string(),
  rol: rolSema,
  /** Kurumun vurgu rengi (`#RRGGBB`); bos ise varsayilan vurgu kullanilir. */
  vurguRengi: z.string().nullable(),
});
export type Uyelik = z.infer<typeof uyelikSema>;

export const oturumSema = z.object({
  /** Kisa omurlu (15 dk) erisim belirteci; yalnizca bellekte tutulur. */
  erisimBelirteci: z.string(),
  /** ISO zaman damgasi. */
  bitisAt: z.string(),
  kullanici: z.object({ id: z.string(), ad: z.string(), telefon: z.string() }),
  uyelikler: z.array(uyelikSema),
  aktifUyelikId: z.string().nullable(),
  /** true ise guncel KVKK metni kabul edilene kadar kiraci uc noktalari 403 `riza_gerekli` doner. */
  rizaGerekli: z.boolean(),
});
export type Oturum = z.infer<typeof oturumSema>;

export const kurumBaglamiSema = z.object({
  kurumId: z.string(),
  /** Kurum/kademe/grup onceligi cozulmus, acik modul kodlari. */
  moduller: z.array(ModulKoduSema),
});
export type KurumBaglami = z.infer<typeof kurumBaglamiSema>;

export const rizaMetniSema = z.object({
  surum: z.string(),
  baslik: z.string(),
  bolumler: z.array(z.object({ baslik: z.string(), metin: z.string() })),
  /** Onaylanacak metin kimlikleri (api her metni ayri kaydeder). */
  metinIdleri: z.array(z.string()),
});
export type RizaMetni = z.infer<typeof rizaMetniSema>;

export const hataSema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export const telefonSema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .transform((v) => (v.startsWith('90') && v.length === 12 ? v.slice(2) : v))
  .transform((v) => (v.startsWith('0') && v.length === 11 ? v.slice(1) : v))
  .pipe(z.string().regex(/^5\d{9}$/));

export const kodSema = z.string().regex(/^\d{6}$/);

export const kodIsteGovdeSema = z.object({ telefon: z.string() });
export const kodDogrulaGovdeSema = z.object({ telefon: z.string(), kod: z.string() });
export const yenileGovdeSema = z.object({
  uyelikId: z.string().optional(),
  kurumId: z.string().optional(),
});
export const rizaKabulGovdeSema = z.object({ surum: z.string(), metinIdleri: z.array(z.string()) });
export type RizaKabul = z.infer<typeof rizaKabulGovdeSema>;
