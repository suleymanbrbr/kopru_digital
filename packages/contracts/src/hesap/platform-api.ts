import { z } from 'zod';

import { RolSema } from './izinler.js';
import { ModulKoduSema } from './moduller.js';
import { kurumDurumSema, kurumTurSema } from './olaylar.js';

/**
 * Platform yonetimi (`/platform/*`) ve herkese acik platform mesaji sozlesmeleri (ADR 0004).
 * Platform uclari yalniz `plat` claim'li, ikinci adimi tamamlamis ve IP izin listesindeki
 * kullaniciya aciktir. Kisisel veri yalniz maskeli doner.
 */

export const PLATFORM_ROLLERI = ['destek', 'yonetici'] as const;
export const PlatformRoluSema = z.enum(PLATFORM_ROLLERI);
export type PlatformRolu = z.infer<typeof PlatformRoluSema>;

const zaman = z.iso.datetime({ offset: true });
const imlec = z.string().min(1).max(200);
const limit = (varsayilan: number) => z.coerce.number().int().min(1).max(200).default(varsayilan);

/** Bir degisikligin gerekcesi denetim kaydina yazilir. */
export const PlatformNedenSema = z.string().trim().min(10).max(500);

// --- Kimlik ve ikinci adim -------------------------------------------------------------------

export const PlatformBenYanitSema = z.object({
  kullanici_id: z.uuid(),
  platform_rolu: PlatformRoluSema,
  ikinci_adim: z.object({
    kurulu: z.boolean(),
    oturumda_dogrulandi: z.boolean(),
    yedek_kod_kalan: z.number().int(),
  }),
});

export const IkinciAdimKurYanitSema = z.object({
  otpauth_uri: z.string(),
  sir: z.string().describe('Base32 sır; QR okutulamazsa elle girilir.'),
  yedek_kodlar: z
    .array(z.string())
    .describe('Tek kullanımlık yedek kodlar; yalnız bu yanıtta gösterilir.'),
});
export const IkinciAdimKodGirdiSema = z.object({
  kod: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Kod 6 haneli olmalı.'),
});
export const IkinciAdimDogrulaGirdiSema = z
  .object({
    kod: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Kod 6 haneli olmalı.')
      .optional(),
    yedek_kod: z.string().trim().min(8).max(32).optional(),
  })
  .refine((g) => (g.kod === undefined) !== (g.yedek_kod === undefined), {
    message: 'kod veya yedek_kod verin (yalnız biri).',
  });
export const IkinciAdimYanitSema = z.object({
  dogrulandi: z.literal(true),
  yedek_kod_kalan: z.number().int(),
});

// --- Kurumlar ---------------------------------------------------------------------------------

export const PlatformKurumAramaSorguSema = z.object({
  q: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .describe('Kurum adı, kurum kimliği, sahibin telefonu (tam) veya e-postası (tam).'),
  durum: kurumDurumSema.optional(),
  limit: limit(25),
  imlec: imlec.optional(),
});

export const PlatformSahipOzetiSema = z.object({
  kullanici_id: z.uuid(),
  telefon_maskeli: z.string().nullable(),
  eposta_maskeli: z.string().nullable(),
});

export const PlatformKurumOzetiSema = z.object({
  id: z.uuid(),
  ad: z.string(),
  tur: kurumTurSema,
  durum: kurumDurumSema,
  created_at: zaman,
  sahipler: z.array(PlatformSahipOzetiSema),
});
export const PlatformKurumListeYanitSema = z.object({
  kurumlar: z.array(PlatformKurumOzetiSema),
  sonraki_imlec: imlec.nullable(),
});

export const PlatformModulDurumuSema = z.object({
  modul_kodu: ModulKoduSema,
  kurum_acik: z.boolean().describe('Kurum düzeyinde etkin değer (kayıt yoksa true).'),
  kurum_ayari_var: z.boolean(),
  alt_duzey_kapali_sayisi: z
    .number()
    .int()
    .describe('Kademe/grup düzeyinde kapatılan ayar sayısı.'),
});
export const PlatformBetaSema = z.object({
  ozellik_kodu: z.string(),
  acik: z.boolean(),
  updated_at: zaman,
});
export const PlatformKurumDetayYanitSema = PlatformKurumOzetiSema.extend({
  saat_dilimi: z.string(),
  uye_sayilari: z.object({
    aktif_toplam: z.number().int(),
    rollere_gore: z.record(RolSema, z.number().int()),
    diger_durumlar: z.number().int(),
  }),
  moduller: z.array(PlatformModulDurumuSema),
  beta_ozellikleri: z.array(PlatformBetaSema),
});

export const PlatformModulAyarlaGirdiSema = z.object({
  acik: z.boolean().nullable().describe('null: kuruma özel ayarı sil (varsayılana dön).'),
  neden: PlatformNedenSema,
});
export const PlatformModulAyarlaYanitSema = z.object({
  modul_kodu: ModulKoduSema,
  kurum_acik: z.boolean(),
  kurum_ayari_var: z.boolean(),
});

export const BetaOzellikKoduSema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
export const PlatformBetaAyarlaGirdiSema = z.object({
  acik: z.boolean().nullable().describe('null: bayrağı sil.'),
  neden: PlatformNedenSema,
});
export const PlatformBetaAyarlaYanitSema = z.object({
  ozellik_kodu: z.string(),
  acik: z.boolean().nullable(),
});

// --- Taklit -----------------------------------------------------------------------------------

export const TaklitBaslatGirdiSema = z.object({
  hedef_kullanici_id: z.uuid(),
  kurum_id: z.uuid(),
  neden: PlatformNedenSema,
});
export const TaklitBaslatYanitSema = z.object({
  taklit_id: z.uuid(),
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int(),
  bitis_at: zaman,
  kurum_id: z.uuid(),
  hedef_kullanici_id: z.uuid(),
  rol: RolSema,
});
export const TaklitSonlandirYanitSema = z.object({
  taklit_id: z.uuid(),
  sonlandirildi: z.literal(true),
});

// --- Denetim ----------------------------------------------------------------------------------

export const PlatformDenetimSorguSema = z.object({
  kurum_id: z.uuid().optional(),
  aktor_id: z.uuid().optional(),
  eylem: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Tam eylem adı (ör. `platform.modul_ayarla`) veya `onek.*`.'),
  baslangic: zaman.optional(),
  bitis: zaman.optional(),
  limit: limit(50),
  imlec: imlec.optional(),
});
export const PlatformDenetimKaydiSema = z.object({
  id: z.uuid(),
  created_at: zaman,
  eylem: z.string(),
  kurum_id: z.uuid().nullable(),
  aktor_kullanici_id: z.uuid().nullable(),
  taklit_kayit_id: z.uuid().nullable(),
  hedef_turu: z.string().nullable(),
  hedef_id: z.uuid().nullable(),
  neden: z.string().nullable(),
  ip: z.string().nullable(),
  ayrinti: z.record(z.string(), z.unknown()).nullable(),
});
export const PlatformDenetimListeYanitSema = z.object({
  kayitlar: z.array(PlatformDenetimKaydiSema),
  sonraki_imlec: imlec.nullable(),
});

// --- Sistem sagligi ---------------------------------------------------------------------------

export const PlatformSistemSagligiYanitSema = z.object({
  uretildi_at: zaman,
  outbox: z.object({
    bekleyen: z.number().int().describe('Henüz yayımlanmamış olay sayısı.'),
    en_eski_yas_sn: z.number().int().nullable(),
    hatali: z.number().int().describe('En az bir kez denenip yayımlanamayan olay sayısı.'),
  }),
  kuyruklar: z.object({
    pgboss_kurulu: z.boolean(),
    derinlikler: z.array(
      z.object({ kuyruk: z.string(), durum: z.string(), sayi: z.number().int() }),
    ),
    basarisiz: z.number().int(),
  }),
  http: z.object({
    kaynak: z.literal('surec_ici'),
    pencere_dk: z.number().int(),
    istek: z.number().int(),
    hata_5xx: z.number().int(),
    oran_5xx: z.number().describe('0..1; istek yoksa 0.'),
  }),
});

// --- Bakim / duyuru mesaji --------------------------------------------------------------------

export const PlatformMesajOnemSema = z.enum(['bilgi', 'uyari', 'kritik']);
export const PlatformMesajiOlusturGirdiSema = z
  .object({
    baslik: z.string().trim().min(1).max(120),
    metin: z.string().trim().min(1).max(2000),
    onem: PlatformMesajOnemSema.default('bilgi'),
    baslangic_at: zaman.optional().describe('Boşsa şimdi.'),
    bitis_at: zaman,
  })
  .refine((g) => g.baslangic_at === undefined || g.bitis_at > g.baslangic_at, {
    message: 'bitis_at, baslangic_at sonrasında olmalı.',
    path: ['bitis_at'],
  });
export const PlatformMesajiSema = z.object({
  id: z.uuid(),
  baslik: z.string(),
  metin: z.string(),
  onem: PlatformMesajOnemSema,
  baslangic_at: zaman,
  bitis_at: zaman,
});
export const PlatformMesajiYonetimSema = PlatformMesajiSema.extend({
  iptal_at: zaman.nullable(),
  created_at: zaman,
});
export const PlatformMesajiListeYanitSema = z.object({
  mesajlar: z.array(PlatformMesajiYonetimSema),
});
/** Herkese acik: etkin mesaj yoksa `mesaj: null`. */
export const PlatformMesajiAcikYanitSema = z.object({
  mesaj: PlatformMesajiSema.nullable(),
});

export type PlatformKurumDetayYanit = z.infer<typeof PlatformKurumDetayYanitSema>;
export type PlatformMesaji = z.infer<typeof PlatformMesajiSema>;
export type TaklitBaslatYanit = z.infer<typeof TaklitBaslatYanitSema>;
