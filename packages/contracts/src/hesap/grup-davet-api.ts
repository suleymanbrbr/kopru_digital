import { z } from 'zod';

import { KapsamSema, RolSema } from './izinler.js';

/**
 * `hesap` grup, atama ve davet HTTP sozlesmeleri (docs/schema/api.md). Alanlar `snake_case`.
 * `api.ts` bunlari yeniden disa aktarir.
 */

/** Alan hata kodlari (ADR 0006: Turkce ASCII). Genel kodlar `errorCodes`tadir. */
export const hesapHataKodlari = {
  davetGecersiz: 'davet_gecersiz',
  davetBeklemiyor: 'davet_beklemiyor',
  yenidenGonderilemez: 'yeniden_gonderilemez',
  gonderimSiniriAsildi: 'gonderim_siniri_asildi',
  zatenUye: 'zaten_uye',
  uyelikAskida: 'uyelik_askida',
  kapasiteDolu: 'kapasite_dolu',
  grupArsivde: 'grup_arsivde',
  atamaCakisiyor: 'atama_cakisiyor',
} as const;

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });

// --- Gruplar -------------------------------------------------------------------------------

export const GrupTurSema = z.enum(['birebir', 'grup', 'sinif', 'etut']);
export const GrupDurumSema = z.enum(['aktif', 'arsiv']);

export const GrupSema = z.object({
  id: z.uuid(),
  tur: GrupTurSema,
  ad: z.string(),
  sube_id: z.uuid().nullable(),
  kademe_id: z.uuid().nullable(),
  kapasite: z.number().int().nullable(),
  renk: z.string().nullable(),
  durum: GrupDurumSema,
  arsivlendi_at: zaman.nullable(),
  uye_sayisi: z.number().int().describe('Etkin (bitis_tarihi bos) ogrenci sayisi.'),
  surum: z.number().int(),
  created_at: zaman,
});

const renkSema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biçiminde olmalı.');

export const GrupOlusturGirdiSema = z
  .object({
    tur: GrupTurSema,
    ad: z.string().trim().min(1).max(200),
    sube_id: z.uuid().optional(),
    kademe_id: z.uuid().optional(),
    kapasite: z.number().int().min(1).max(500).optional(),
    renk: renkSema.optional(),
  })
  .refine((v) => v.tur !== 'birebir' || v.kapasite === undefined || v.kapasite === 1, {
    message: 'Birebir grubun kapasitesi 1 olmalı.',
    path: ['kapasite'],
  });

/** `tur` degistirilemez. `null`: alani temizle. */
export const GrupGuncelleGirdiSema = z
  .object({
    ad: z.string().trim().min(1).max(200),
    sube_id: z.uuid().nullable(),
    kademe_id: z.uuid().nullable(),
    kapasite: z.number().int().min(1).max(500).nullable(),
    renk: renkSema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'En az bir alan gönderilmeli.');

export const GrupListeSorguSema = z.object({
  durum: z.enum(['aktif', 'arsiv', 'hepsi']).default('aktif'),
  tur: GrupTurSema.optional(),
  kademe_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const GrupListeYanitSema = z.object({
  gruplar: z.array(GrupSema),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});

export const GrupUyesiSema = z.object({
  id: z.uuid().describe('`grup_uyeleri.id`'),
  grup_id: z.uuid(),
  ogrenci_id: z.uuid().describe('Ogrenci uyeligi (`uyelikler.id`).'),
  gorunen_ad: z.string().nullable(),
  baslangic_tarihi: tarih,
  bitis_tarihi: tarih.nullable(),
  katilim_yolu: z.enum(['yonetici', 'davet', 'sinif_kodu']),
});
export const GrupUyeListeYanitSema = z.object({ uyeler: z.array(GrupUyesiSema) });

export const GrupUyeEkleGirdiSema = z.object({
  ogrenci_idleri: z
    .array(z.uuid())
    .min(1)
    .max(200)
    .describe('Ogrenci uyelik kimlikleri; tek istekte coklu ekleme.'),
});
export const GrupUyeEkleYanitSema = z.object({
  eklenenler: z.array(GrupUyesiSema),
  zaten_uye: z.array(z.uuid()).describe('Zaten etkin uye olan ogrenci uyelikleri (atlanir).'),
});

// --- Atamalar ------------------------------------------------------------------------------

export const AtamaSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  ogretmen_id: z.uuid().describe('Ogretmen uyeligi (`uyelikler.id`).'),
  ogretmen_ad: z.string().nullable(),
  brans_kodu: z.string(),
  baslangic_tarihi: tarih,
  bitis_tarihi: tarih.nullable(),
  ana_ogretmen: z.boolean(),
});

export const AtamaOlusturGirdiSema = z.object({
  ogretmen_id: z.uuid(),
  brans_kodu: z.string().trim().min(1).max(64),
  ana_ogretmen: z.boolean().default(false),
});

export const AtamaListeSorguSema = z.object({
  grup_id: z.uuid().optional(),
  ogretmen_id: z.uuid().optional(),
  durum: z.enum(['etkin', 'bitmis', 'hepsi']).default('etkin'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional(),
});
export const AtamaListeYanitSema = z.object({
  atamalar: z.array(AtamaSema),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});
export const AtamaGrupListeYanitSema = z.object({ atamalar: z.array(AtamaSema) });

// --- Davetler ------------------------------------------------------------------------------

export const DavetKanalSema = z.enum(['baglanti', 'sms', 'eposta']);
/** `suresi_doldu`: durum `bekliyor` olup `expires_at` gecmisse okuma aninda bu deger doner. */
export const DavetDurumSema = z.enum(['bekliyor', 'kullanildi', 'iptal', 'suresi_doldu']);
/** Sahip davet edilmez; veli Faz 1'de davet edilmez. */
export const DavetRolSema = z.enum(['yonetici', 'ogretmen', 'ogrenci']);

export const DavetSema = z.object({
  id: z.uuid(),
  kanal: DavetKanalSema,
  rol: RolSema.exclude(['sahip']),
  durum: DavetDurumSema,
  hedef_telefon_e164: z.string().nullable(),
  hedef_eposta: z.string().nullable(),
  hedef_ad: z.string().nullable(),
  grup_id: z.uuid().nullable(),
  kademe_id: z.uuid().nullable(),
  sube_id: z.uuid().nullable(),
  davet_eden_id: z.uuid(),
  max_kullanim: z.number().int(),
  kullanim_sayisi: z.number().int(),
  gonderim_sayisi: z.number().int().describe('SMS / e-posta gonderim sayaci (en cok 3).'),
  son_gonderim_at: zaman.nullable(),
  expires_at: zaman,
  created_at: zaman,
});

export const DavetOlusturGirdiSema = z
  .object({
    kanal: DavetKanalSema,
    rol: DavetRolSema,
    telefon: z.string().trim().min(7).max(20).optional().describe('`sms` kanalında zorunlu.'),
    eposta: z.email().optional().describe('`eposta` kanalında zorunlu.'),
    hedef_ad: z.string().trim().min(1).max(200).optional(),
    grup_id: z.uuid().optional().describe('Yalnız `ogrenci` daveti için: kabulde gruba eklenir.'),
    kademe_id: z.uuid().optional().describe('Yalnız `ogrenci` daveti için.'),
    sube_id: z.uuid().optional(),
    max_kullanim: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(1)
      .describe('Çok kullanımlı olabilmesi için kanal `baglanti` olmalı.'),
    gecerlilik_gun: z.number().int().min(1).max(30).default(7),
  })
  .superRefine((v, ctx) => {
    if (v.kanal === 'sms' && !v.telefon) {
      ctx.addIssue({ code: 'custom', path: ['telefon'], message: 'SMS daveti için telefon gerekli.' });
    }
    if (v.kanal === 'eposta' && !v.eposta) {
      ctx.addIssue({ code: 'custom', path: ['eposta'], message: 'E-posta daveti için eposta gerekli.' });
    }
    if (v.kanal !== 'baglanti' && v.max_kullanim !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['max_kullanim'],
        message: 'Yalnızca bağlantı davetleri çok kullanımlı olabilir.',
      });
    }
    if (v.rol !== 'ogrenci' && (v.grup_id !== undefined || v.kademe_id !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rol'],
        message: 'Grup ve kademe yalnızca öğrenci davetinde verilebilir.',
      });
    }
  });

export const DavetOlusturYanitSema = z.object({
  davet: DavetSema,
  belirtec: z
    .string()
    .describe('Düz davet belirteci. YALNIZ bu yanıtta (ve yeniden göndermede) döner; saklanmaz.'),
  gonderim: z.enum(['gonderildi', 'basarisiz', 'yok']),
});

export const DavetListeSorguSema = z.object({
  durum: DavetDurumSema.optional(),
  grup_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const DavetListeYanitSema = z.object({
  davetler: z.array(DavetSema),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});

export const DavetKabulGirdiSema = z.object({
  belirtec: z.string().trim().min(20).max(200),
});
export const DavetKabulYanitSema = z.object({
  davet_id: z.uuid(),
  kurum_id: z.uuid(),
  uyelik_id: z.uuid(),
  rol: RolSema,
  grup_id: z.uuid().nullable(),
  grup_uyesi_id: z.uuid().nullable(),
});

export type GrupTipi = z.infer<typeof GrupSema>;
export type DavetTipi = z.infer<typeof DavetSema>;
export type AtamaTipi = z.infer<typeof AtamaSema>;
