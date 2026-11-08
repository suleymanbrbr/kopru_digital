import { z } from 'zod';

import { KapsamSema, RolSema } from './izinler.js';
import { ModulKoduSema } from './moduller.js';
import { kurumDurumSema, kurumTurSema, uyelikDurumSema } from './olaylar.js';

/**
 * `hesap` HTTP API sozlesmeleri. Alanlar `snake_case`; istemciler (web, mobil, api-client)
 * ayni semalari kullanir. Hata govdesi `errorResponseSchema`dir (error.ts).
 */

const telefonGirdi = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .describe('Telefon: 05xx..., 5xx..., 90 5xx... veya +905xx... biçiminde. Sunucu E.164e çevirir.');

// --- Kimlik --------------------------------------------------------------------------------

export const OtpGonderGirdiSema = z.object({ telefon: telefonGirdi });
export const OtpGonderYanitSema = z.object({
  gonderildi: z.literal(true),
  gecerlilik_sn: z.number().int(),
});

export const OtpDogrulaGirdiSema = z.object({
  telefon: telefonGirdi,
  kod: z.string().regex(/^[0-9]{6}$/, 'Kod 6 haneli olmalı.'),
});

export const EpostaKayitGirdiSema = z.object({
  eposta: z.email(),
  parola: z.string().min(8).max(128),
  gorunen_ad: z.string().trim().min(1).max(200).optional(),
});
export const EpostaGirisGirdiSema = z.object({
  eposta: z.email(),
  parola: z.string().min(1).max(128),
});

export const EpostaDogrulamaGonderGirdiSema = z.object({ eposta: z.email() });
export const EpostaDogrulamaGonderYanitSema = z.object({ gonderildi: z.literal(true) });
export const EpostaDogrulaSorguSema = z.object({
  belirtec: z.string().min(10).max(512).describe('E-postadaki doğrulama bağlantısındaki belirteç.'),
});
export const EpostaDogrulaYanitSema = z.object({ dogrulandi: z.literal(true) });

export const KullaniciOzetSema = z.object({
  id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  telefon_e164: z.string().nullable(),
  eposta: z.string().nullable(),
  dil: z.string(),
});

/** Giris/kayit yaniti. Web'de oturum cerezi de set edilir; mobil `oturum_belirteci`ni guvenli depoda tutar. */
export const OturumYanitSema = z.object({
  oturum_belirteci: z
    .string()
    .describe('Opak oturum belirteci. `POST /auth/token` için Bearer olarak gönderilir.'),
  kullanici: KullaniciOzetSema,
  yeni_kullanici: z.boolean(),
});

export const UyelikOzetSema = z.object({
  uyelik_id: z.uuid(),
  kurum_id: z.uuid(),
  kurum_ad: z.string().nullable(),
  kurum_tur: kurumTurSema.nullable(),
  rol: RolSema,
  durum: uyelikDurumSema,
  sube_id: z.uuid().nullable(),
});

export const TokenGirdiSema = z.object({
  kurum_id: z.uuid().optional(),
  uyelik_id: z.uuid().optional(),
});
export const TokenYanitSema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int(),
  kurum_id: z.uuid().nullable(),
  uyelik_id: z.uuid().nullable(),
  rol: RolSema.nullable(),
  roller: z.array(RolSema),
  uyelikler: z.array(UyelikOzetSema),
});

// --- Riza (KVKK) ---------------------------------------------------------------------------

export const RizaMetniSema = z.object({
  id: z.uuid(),
  tur: z.enum(['kvkk_aydinlatma', 'acik_riza', 'kullanim_kosullari', 'veli_onayi']),
  surum: z.string(),
  dil: z.string(),
  baslik: z.string(),
  govde_markdown: z.string(),
  govde_sha256: z.string().describe('Hex'),
  kabul_edildi: z.boolean(),
});
export const GuncelRizaYanitSema = z.object({
  metinler: z.array(RizaMetniSema),
  onay_gerekli: z.boolean(),
});
export const RizaKaydetGirdiSema = z.object({
  riza_metni_id: z.uuid(),
  karar: z.enum(['kabul', 'ret', 'geri_cekildi']).default('kabul'),
  kaynak: z.enum(['web', 'ios', 'android']).default('web'),
});
export const RizaKaydetYanitSema = z.object({
  riza_id: z.uuid(),
  karar: z.enum(['kabul', 'ret', 'geri_cekildi']),
  onay_gerekli: z.boolean(),
});

export const BenKullaniciSema = KullaniciOzetSema.extend({
  eposta_dogrulandi: z
    .boolean()
    .describe('E-posta adresi doğrulandı mı (eposta yoksa false). Davet eşleştirmesi için ipucu.'),
});

export const BenYanitSema = z.object({
  kullanici: BenKullaniciSema,
  onay_gerekli: z.boolean(),
  uyelikler: z.array(UyelikOzetSema),
});

// --- Kurum ---------------------------------------------------------------------------------

export const kurumAyarlariSema = z.object({
  vurgu_rengi: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
    .optional(),
  logo_url: z.url().max(2000).optional(),
  sessiz_saat_varsayilan: z.string().optional(),
  ders_hatirlatma_dk: z.number().int().min(0).max(1440).optional(),
  yoklama_kilit_gun: z.number().int().min(0).max(365).optional(),
});

export const KurumSema = z.object({
  id: z.uuid(),
  ad: z.string(),
  tur: kurumTurSema,
  kisa_ad: z.string().nullable(),
  saat_dilimi: z.string(),
  durum: kurumDurumSema,
  ayarlar: kurumAyarlariSema,
  surum: z.number().int(),
  created_at: z.iso.datetime({ offset: true }),
});

export const KurumOlusturGirdiSema = z.object({
  ad: z.string().trim().min(1).max(200),
  tur: kurumTurSema,
  saat_dilimi: z.string().min(1).max(64).default('Europe/Istanbul'),
  gorunen_ad: z.string().trim().min(1).max(200).optional().describe('Üyelikte kullanılacak ad.'),
});
export const KurumOlusturYanitSema = z.object({
  kurum: KurumSema,
  uyelikler: z.array(UyelikOzetSema),
});

export const KurumGuncelleGirdiSema = z
  .object({
    ad: z.string().trim().min(1).max(200),
    saat_dilimi: z.string().min(1).max(64),
    logo_url: z.url().max(2000).nullable(),
    vurgu_rengi: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'En az bir alan gönderilmeli.');

// --- Modul ayarlari ------------------------------------------------------------------------

export const ModulAyariSema = z.object({
  id: z.uuid(),
  modul_kodu: ModulKoduSema,
  kapsam: z.enum(['kurum', 'kademe', 'grup']),
  kapsam_id: z.uuid(),
  acik: z.boolean(),
});
export const ModulAyarlariYanitSema = z.object({
  ayarlar: z.array(ModulAyariSema),
  /** Kurum duzeyinde etkin durum (kademe/grup daraltmalari dikkate alinmaz). */
  kurum_etkin: z.record(z.string(), z.boolean()),
});
export const ModulAyariYazGirdiSema = z.object({
  modul_kodu: ModulKoduSema,
  kapsam: z.enum(['kurum', 'kademe', 'grup']),
  kapsam_id: z.uuid().optional().describe('`kurum` kapsamında boş bırakılabilir.'),
  acik: z.boolean().nullable().describe('null: mirasa dön (satır silinir).'),
});
export const ModulAyariYazYanitSema = z.object({
  ayar: ModulAyariSema.nullable(),
});
export const ModulEtkinSorguSema = z.object({
  modul_kodu: ModulKoduSema,
  kademe_id: z.uuid().optional(),
  grup_id: z.uuid().optional(),
});
export const ModulEtkinYanitSema = z.object({ modul_kodu: ModulKoduSema, acik: z.boolean() });

// --- Uyelikler -----------------------------------------------------------------------------

export const UyeSema = z.object({
  uyelik_id: z.uuid(),
  kullanici_id: z.uuid(),
  rol: RolSema,
  durum: uyelikDurumSema,
  gorunen_ad: z.string().nullable(),
  sube_id: z.uuid().nullable(),
  kademe_id: z.uuid().nullable(),
  katildi_at: z.iso.datetime({ offset: true }).nullable(),
});
export const UyeListeSorguSema = z.object({
  rol: RolSema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const UyeListeYanitSema = z.object({
  uyeler: z.array(UyeSema),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});

export type KurumOlusturGirdi = z.infer<typeof KurumOlusturGirdiSema>;
export type KurumSemaTipi = z.infer<typeof KurumSema>;
export type TokenYanit = z.infer<typeof TokenYanitSema>;

export * from './grup-davet-api.js';
