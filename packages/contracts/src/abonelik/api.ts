import { z } from 'zod';

import { KurumParamSema } from '../finans/api.js';

/**
 * `abonelik` HTTP API sozlesmeleri (docs/schema/api.md `abonelik`). Alanlar `snake_case`; tutarlar kurus
 * tamsayisidir. Uc noktalar yalniz `sahip` rolune aciktir (`abonelik.oku`, `abonelik.yonet`).
 */

export const abonelikHataKodlari = {
  planBulunamadi: 'plan_bulunamadi',
  etkinAboneligiYok: 'etkin_abonelik_yok',
  magazaUzerindenYonetilir: 'magaza_uzerinden_yonetilir',
  /** Kurumun baska kanalda (magaza, kurumsal) etkin ucretli aboneligi var: ikinci abonelik acilmaz. */
  abonelikBaskaKanalda: 'abonelik_baska_kanalda',
  /** iyzico aboneligi zaten `aktif`; yeni odeme baslatilmaz (plan degisikligi: `plan-degistir`). */
  abonelikZatenAktif: 'abonelik_zaten_aktif',
  /** Odeme baslatmak icin kurum fatura bilgisi (`PUT /fatura-bilgileri`) zorunlu. */
  faturaBilgisiGerekli: 'fatura_bilgisi_gerekli',
  /** Odeme saglayicisi bu ortamda yapilandirilmamis (env eksik). */
  odemeKanaliKapali: 'odeme_kanali_kapali',
} as const;

const zaman = z.iso.datetime({ offset: true });

export const ABONELIK_DURUMLARI = [
  'deneme',
  'aktif',
  'odeme_bekliyor',
  'ek_sure',
  'askida',
  'iptal',
  'sona_erdi',
] as const;
export const AbonelikDurumSema = z.enum(ABONELIK_DURUMLARI);
export type AbonelikDurumu = z.infer<typeof AbonelikDurumSema>;

export const AbonelikKaynakSema = z.enum(['deneme', 'iyzico', 'apple', 'google', 'kurumsal']);
export type AbonelikKaynak = z.infer<typeof AbonelikKaynakSema>;

export const PeriyotSema = z.enum(['aylik', 'yillik']);
export type Periyot = z.infer<typeof PeriyotSema>;

/** `-1` = sinirsiz. */
const limit = z.number().int().min(-1);

export const PlanLimitleriSema = z.object({
  max_ogrenci: limit,
  max_ogretmen: limit,
  max_sube: limit,
  medya_kota_bayt: limit,
  sms_aylik: limit,
  soru_aylik_ogrenci: limit,
});
export type PlanLimitleri = z.infer<typeof PlanLimitleriSema>;

/** Sayim sinirli (uygulamada denetlenen) limitler: yeni uye eklenirken `402 plan_limiti`. */
export const SAYIM_LIMITLERI = ['max_ogrenci', 'max_ogretmen'] as const;
export const SayimLimitiSema = z.enum(SAYIM_LIMITLERI);
export type SayimLimiti = z.infer<typeof SayimLimitiSema>;

/** `402 plan_limiti` gövdesindeki `error.details`. */
export const PlanLimitiDetaySema = z.object({
  limit: SayimLimitiSema,
  mevcut: z.number().int().nonnegative(),
  ust_sinir: z.number().int().nonnegative(),
});
export type PlanLimitiDetay = z.infer<typeof PlanLimitiDetaySema>;

/** Plan basina magaza urun kodlari (RevenueCat urun kimligi); tanimli degilse `null` (mobil "yakinda" gosterir). */
export const MagazaUrunKodlariSema = z.object({
  apple: z.string().optional(),
  google: z.string().optional(),
});

export const AbonelikPlanSema = z.object({
  id: z.uuid(),
  kod: z.string(),
  surum: z.number().int(),
  ad: z.string(),
  kurum_turu: z.enum(['bireysel', 'ekip', 'kurum']),
  aylik_fiyat_kurus: z.number().int(),
  yillik_fiyat_kurus: z.number().int().nullable(),
  kdv_orani: z.number().int(),
  limitler: PlanLimitleriSema,
  moduller: z.array(z.string()),
  magaza_urun_kodlari: MagazaUrunKodlariSema.nullable(),
});
export type AbonelikPlanTipi = z.infer<typeof AbonelikPlanSema>;

export const AbonelikPlanListeYanitSema = z.object({ planlar: z.array(AbonelikPlanSema) });

export const AboneligiSema = z.object({
  id: z.uuid(),
  plan: AbonelikPlanSema,
  kaynak: AbonelikKaynakSema,
  durum: AbonelikDurumSema,
  periyot: PeriyotSema,
  donem_baslangic_at: zaman,
  donem_bitis_at: zaman,
  deneme_bitis_at: zaman.nullable(),
  ek_sure_bitis_at: zaman.nullable(),
  otomatik_yenileme: z.boolean(),
  iptal_istendi_at: zaman.nullable(),
  fiyat_kurus: z.number().int(),
  bekleyen_plan_kodu: z.string().nullable(),
  bekleyen_periyot: PeriyotSema.nullable(),
});
export type AboneligiTipi = z.infer<typeof AboneligiSema>;

export const KullanimSayacSema = z.object({
  mevcut: z.number().int().nonnegative(),
  /** `null` = sinirsiz. */
  ust_sinir: z.number().int().nonnegative().nullable(),
});

export const AbonelikYanitSema = z.object({
  /** Etkin ya da en son abonelik; hic yoksa `null`. */
  abonelik: AboneligiSema.nullable(),
  /** Etkin abonelik yok: ucretsiz katman sabitleri gecerli. */
  ucretsiz: z.boolean(),
  /** `askida` / `sona_erdi`: yazma istekleri `402 abonelik_gerekli`. */
  yazma_kilitli: z.boolean(),
  /** Gecerli limitler (etkin plan ya da ucretsiz katman). */
  limitler: PlanLimitleriSema,
  kullanim: z.object({ ogrenci: KullanimSayacSema, ogretmen: KullanimSayacSema }),
});

export const FaturaAdresiSema = z.object({
  satir: z.string().trim().min(1).max(300),
  ilce: z.string().trim().min(1).max(100),
  il: z.string().trim().min(1).max(100),
  posta_kodu: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/)
    .optional(),
});

export const FaturaBilgisiGirdiSema = z.object({
  unvan: z.string().trim().min(1).max(300),
  /** 10 haneli VKN ya da 11 haneli TCKN. */
  vergi_no: z.string().regex(/^[0-9]{10,11}$/),
  vergi_dairesi: z.string().trim().min(1).max(100).nullable().default(null),
  adres: FaturaAdresiSema,
  eposta: z.email().max(320),
  e_fatura_mukellefi: z.boolean().default(false),
});

export const FaturaBilgisiSema = FaturaBilgisiGirdiSema.extend({
  vergi_dairesi: z.string().nullable(),
  e_fatura_mukellefi: z.boolean(),
  surum: z.number().int(),
});
export const FaturaBilgisiYanitSema = z.object({ fatura_bilgisi: FaturaBilgisiSema.nullable() });

export const PlanDegistirGirdiSema = z.object({
  plan_kodu: z.string().min(1).max(64),
  periyot: PeriyotSema.optional(),
});

export const PlanDegistirYanitSema = z.object({
  abonelik: AboneligiSema,
  /** `hemen`: deneme sirasinda anında; `donem_sonu`: etkin ucretli abonelikte donem sonunda. */
  uygulama: z.enum(['hemen', 'donem_sonu']),
  /** Hedef planin limiti mevcut kullanimin altindaysa: veri silinmez, yeni uye eklenemez. */
  limit_asimlari: z.array(PlanLimitiDetaySema),
});

export const IptalYanitSema = z.object({ abonelik: AboneligiSema });

export const AbonelikKurumParamSema = KurumParamSema;

export const OdemeBaslatGirdiSema = z.object({
  plan_kodu: z.string().min(1).max(64),
  periyot: PeriyotSema.default('aylik'),
});

export const OdemeBaslatYanitSema = z.object({
  oturum_id: z.uuid(),
  kaynak: z.literal('iyzico'),
  /** Saglayicinin odeme sayfasi adresi; form icerigi donen saglayicida `null`. */
  yonlendirme_url: z.string().nullable(),
  /** Saglayicinin gomulecek odeme formu (HTML/JS parcasi); yonlendirme donen saglayicida `null`. */
  form_icerigi: z.string().nullable(),
  /** KDV dahil tutar (kurus): plan fiyati + KDV. */
  tutar_kurus: z.number().int().nonnegative(),
  kdv_kurus: z.number().int().nonnegative(),
});

export const ODEME_DURUMLARI = ['basarili', 'basarisiz', 'iade'] as const;
export const OdemeDurumSema = z.enum(ODEME_DURUMLARI);

export const OdemeKaydiSema = z.object({
  id: z.uuid(),
  abonelik_id: z.uuid(),
  kaynak: AbonelikKaynakSema,
  durum: OdemeDurumSema,
  /** KDV dahil (kurus). */
  tutar_kurus: z.number().int().nonnegative(),
  kdv_kurus: z.number().int().nonnegative(),
  donem_baslangic_at: zaman,
  donem_bitis_at: zaman,
  odeme_at: zaman,
  hata_kodu: z.string().nullable(),
  /** `iade` satirinda iade edilen `basarili` odemenin kimligi. */
  ters_cevrilen_id: z.uuid().nullable(),
});

export const OdemeGecmisiSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const OdemeGecmisiYanitSema = z.object({ odemeler: z.array(OdemeKaydiSema) });

export const FATURA_DURUMLARI = ['bekliyor', 'kesildi', 'hata', 'iptal'] as const;

export const FaturaKaydiSema = z.object({
  id: z.uuid(),
  odeme_id: z.uuid(),
  tur: z.enum(['e_arsiv', 'iade']),
  durum: z.enum(FATURA_DURUMLARI),
  fatura_no: z.string().nullable(),
  matrah_kurus: z.number().int().nonnegative(),
  kdv_kurus: z.number().int().nonnegative(),
  toplam_kurus: z.number().int().nonnegative(),
  kdv_orani: z.number().int(),
  kesim_at: zaman.nullable(),
  /** PDF dosyasi hazir degilse `null` (yalniz meta doner). */
  pdf_dosya_id: z.uuid().nullable(),
});

export const FaturaGecmisiYanitSema = z.object({ faturalar: z.array(FaturaKaydiSema) });

/** iyzico odeme sayfasi donus (callback) ve webhook uclarinin ortak yaniti. */
export const WebhookYanitSema = z.object({ durum: z.enum(['alindi', 'tekrar', 'yoksayildi']) });
