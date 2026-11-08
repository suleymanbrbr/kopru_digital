import { z } from 'zod';

import { dersDurumSema, dersIptalKaynagiSema } from './olaylar.js';
import { tekrarKuraliCoz } from './tekrar.js';

/**
 * `ders` takvim HTTP sozlesmeleri (docs/schema/api.md `## ders`). Alanlar `snake_case`.
 * Tarih/saat girdileri kurumun yerel saatindedir (`saat_dilimi`); sunucu UTC'ye cevirir.
 */

export const dersHataKodlari = {
  dersCakismasi: 'ders_cakismasi',
  surumCakismasi: 'surum_cakismasi',
  ogretmenGerekli: 'ogretmen_gerekli',
  ogretmenGecersiz: 'ogretmen_gecersiz',
  bransGerekli: 'brans_gerekli',
  iptalKaynagiGecersiz: 'iptal_kaynagi_gecersiz',
  dersPlanliDegil: 'ders_planli_degil',
  dersSeridedeDegil: 'ders_seride_degil',
  tarihDegisikligiYalnizBu: 'tarih_degisikligi_yalniz_bu',
  zatenKatilimci: 'zaten_katilimci',
  degisiklikYok: 'degisiklik_yok',
  tekrarKapsamiAsildi: 'tekrar_kapsami_asildi',
} as const;

/** Liste araliginin ust siniri (gun). */
export const DERS_LISTE_MAKS_GUN = 100;

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });
const saat = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:DD biçiminde olmalı.')
  .describe('Yerel saat, SS:DD (24 saat).');
const sureDk = z.number().int().min(10).max(480);
const baslik = z.string().trim().min(1).max(200);
const baglanti = z.string().trim().min(1).max(2000);
const yer = z.string().trim().min(1).max(500);

export const DersKapsamiSema = z
  .enum(['yalniz_bu', 'bu_ve_sonrakiler'])
  .describe(
    '`bu_ve_sonrakiler` yalnız seri dersinde geçerlidir ve yalnız `seri_istisna=false` gelecek dersleri etkiler.',
  );
export type DersKapsami = z.infer<typeof DersKapsamiSema>;

export const TekrarKuraliSema = z
  .string()
  .trim()
  .max(200)
  .refine((v) => tekrarKuraliCoz(v).ok, {
    message: 'Tekrar kuralı geçersiz. Örnek: FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE',
  })
  .describe(
    'RFC 5545 alt kümesi: FREQ=WEEKLY|DAILY, INTERVAL, BYDAY. Örnek: FREQ=WEEKLY;BYDAY=MO,WE',
  );

// --- Yanitlar ------------------------------------------------------------------------------

export const DersSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  seri_id: z.uuid().nullable(),
  seri_sirasi: z.number().int().nullable(),
  ogretmen_id: z.uuid(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  baslik: z.string().nullable(),
  baslangic_at: zaman,
  bitis_at: zaman,
  durum: dersDurumSema,
  iptal_nedeni: z.string().nullable(),
  iptal_kaynagi: dersIptalKaynagiSema.nullable(),
  iptal_eden_id: z.uuid().nullable(),
  iptal_at: zaman.nullable(),
  gec_iptal: z.boolean(),
  ilk_baslangic_at: zaman,
  ertelendi_sayisi: z.number().int(),
  telafi: z.boolean(),
  telafi_kaynak_ders_id: z.uuid().nullable(),
  seri_istisna: z.boolean(),
  online_baglanti: z.string().nullable(),
  yer: z.string().nullable(),
  cakisma_onayli: z.boolean(),
  katilimci_sayisi: z.number().int(),
  surum: z.number().int(),
  created_at: zaman,
});
export type DersTipi = z.infer<typeof DersSema>;

export const DersKatilimcisiSema = z.object({
  ogrenci_id: z.uuid().describe('Öğrenci üyeliği (`uyelikler.id`).'),
  tur: z.enum(['uye', 'misafir', 'telafi']),
  gorunen_ad: z.string().nullable(),
});

export const DersDetaySema = DersSema.extend({
  katilimcilar: z.array(DersKatilimcisiSema).describe('Öğrenci rolünde yalnız kendisi görünür.'),
});

export const CakisanDersSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  baslik: z.string().nullable(),
  baslangic_at: zaman,
  bitis_at: zaman,
});

export const DersUyarisiSema = z.object({
  kod: z.literal('ogrenci_cakismasi'),
  ders_id: z.uuid(),
  cakisan_ders_id: z.uuid(),
  ogrenci_idleri: z.array(z.uuid()),
});

export const DersSeriSema = z.object({
  id: z.uuid(),
  grup_id: z.uuid(),
  ogretmen_id: z.uuid(),
  brans_kodu: z.string(),
  baslik: z.string().nullable(),
  tekrar_kurali: z.string(),
  baslangic_tarihi: tarih,
  bitis_tarihi: tarih.nullable(),
  adet: z.number().int().nullable(),
  baslangic_saati: saat,
  sure_dk: z.number().int(),
  saat_dilimi: z.string(),
  online_baglanti: z.string().nullable(),
  yer: z.string().nullable(),
  uretildi_son_tarih: tarih,
  durum: z.enum(['aktif', 'bitti', 'iptal']),
  surum: z.number().int(),
});

export const DersOlusturYanitSema = z.object({
  ders: DersDetaySema,
  uyari: z.array(DersUyarisiSema),
});

export const SeriOlusturYanitSema = z.object({
  seri: DersSeriSema,
  dersler: z.array(DersSema),
  atlanan: z.array(
    z.object({
      seri_sirasi: z.number().int(),
      tarih,
      neden: z.enum(['cakisma', 'zaten_var']),
    }),
  ),
  cakisanlar: z
    .array(CakisanDersSema)
    .describe('`cakisma_onayli: true` ile yazılan derslerin çakıştığı mevcut dersler.'),
  uyari: z.array(DersUyarisiSema),
});

/** Toplu islem (guncelle, tasi, iptal) yaniti. */
export const DersIslemYanitSema = z.object({
  ders: DersDetaySema,
  etkilenen_ders_idleri: z.array(z.uuid()).describe('Seçilen ders dahil değişen tüm dersler.'),
  uyari: z.array(DersUyarisiSema),
});

export const DersListeYanitSema = z.object({
  dersler: z.array(DersSema),
  sonraki_imlec: z.string().nullable(),
});

export const DersCakismaDetaySema = z.object({ cakisanlar: z.array(CakisanDersSema) });

// --- Girdiler ------------------------------------------------------------------------------

const ortakAlanlar = {
  grup_id: z.uuid(),
  ogretmen_id: z
    .uuid()
    .optional()
    .describe(
      'Boşsa: öğretmen çağıranın kendisi; sahip/yönetici için aynı kullanıcının öğretmen üyeliği (yoksa 422).',
    ),
  brans_kodu: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional()
    .describe('Boşsa öğretmenin gruptaki atamasının branşı.'),
  konu_id: z.uuid().optional(),
  baslik: baslik.optional(),
  baslangic_saati: saat,
  sure_dk: sureDk,
  online_baglanti: baglanti.optional(),
  yer: yer.optional(),
  cakisma_onayli: z
    .boolean()
    .default(false)
    .describe('Öğretmen çakışması bilerek onaylandı (`409 ders_cakismasi` sonrası).'),
};

export const DersOlusturGirdiSema = z.object({
  ...ortakAlanlar,
  tarih,
  telafi: z.boolean().default(false),
  telafi_kaynak_ders_id: z.uuid().optional(),
});

export const SeriOlusturGirdiSema = z
  .object({
    ...ortakAlanlar,
    tekrar_kurali: TekrarKuraliSema,
    baslangic_tarihi: tarih,
    bitis_tarihi: tarih.optional(),
    adet: z.number().int().min(1).max(500).optional(),
  })
  .refine((v) => v.bitis_tarihi === undefined || v.adet === undefined, {
    message: '`bitis_tarihi` ve `adet` birlikte verilemez.',
    path: ['adet'],
  })
  .refine((v) => v.bitis_tarihi === undefined || v.bitis_tarihi >= v.baslangic_tarihi, {
    message: 'Bitiş tarihi başlangıçtan önce olamaz.',
    path: ['bitis_tarihi'],
  });

export const DersGuncelleGirdiSema = z
  .object({
    surum: z.number().int().min(1).describe('Okunan `surum`; eskiyse 409.'),
    kapsam: DersKapsamiSema.default('yalniz_bu'),
    baslik: baslik.nullable().optional(),
    konu_id: z.uuid().nullable().optional(),
    online_baglanti: baglanti.nullable().optional(),
    yer: yer.nullable().optional(),
  })
  .refine(
    (v) =>
      v.baslik !== undefined ||
      v.konu_id !== undefined ||
      v.online_baglanti !== undefined ||
      v.yer !== undefined,
    { message: 'Güncellenecek en az bir alan verilmeli.' },
  );

export const DersTasiGirdiSema = z
  .object({
    surum: z.number().int().min(1),
    kapsam: DersKapsamiSema.default('yalniz_bu'),
    yeni_tarih: tarih
      .optional()
      .describe('Yeni yerel gün. `bu_ve_sonrakiler` kapsamında değiştirilemez.'),
    yeni_saat: saat.optional(),
    cakisma_onayli: z.boolean().default(false),
  })
  .refine((v) => v.yeni_tarih !== undefined || v.yeni_saat !== undefined, {
    message: '`yeni_tarih` veya `yeni_saat` verilmeli.',
  });

export const DersIptalGirdiSema = z.object({
  surum: z.number().int().min(1).optional(),
  kapsam: DersKapsamiSema.default('yalniz_bu'),
  iptal_kaynagi: dersIptalKaynagiSema.describe('`ogrenci` yalnız birebir grupta kabul edilir.'),
  iptal_nedeni: z.string().trim().min(1).max(500).optional(),
});

export const DersKatilimciEkleGirdiSema = z.object({
  ogrenci_id: z.uuid(),
  tur: z.enum(['misafir', 'telafi']).default('misafir'),
});

const msGun = 86_400_000;

export const DersListeSorguSema = z
  .object({
    baslangic: zaman.describe('Aralık başı (UTC önerilir: `...Z`).'),
    bitis: zaman.describe(`Aralık sonu; en çok ${String(DERS_LISTE_MAKS_GUN)} gün.`),
    ogretmen_id: z.uuid().optional(),
    grup_id: z.uuid().optional(),
    ogrenci_id: z.uuid().optional(),
    durum: dersDurumSema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
    imlec: z.string().max(200).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
  })
  .refine((v) => Date.parse(v.bitis) > Date.parse(v.baslangic), {
    message: 'Bitiş başlangıçtan sonra olmalı.',
    path: ['bitis'],
  })
  .refine((v) => Date.parse(v.bitis) - Date.parse(v.baslangic) <= DERS_LISTE_MAKS_GUN * msGun, {
    message: `Aralık en çok ${String(DERS_LISTE_MAKS_GUN)} gün olabilir.`,
    path: ['bitis'],
  });
