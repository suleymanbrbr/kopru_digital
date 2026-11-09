import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `ogrenme` haftalik plan HTTP sozlesmeleri ve olayi (docs/schema/api.md "Haftalik plan", olaylar.md
 * `ogrenme.plan_gorevi.guncellendi.v1`). Alanlar `snake_case`. Olay yalniz kimlik, sayi ve durum tasir:
 * ad, telefon, e-posta, gorev basligi ve ogretmen notu ASLA girmez.
 */

export const planHataKodlari = {
  planKilitli: 'plan_kilitli',
  planZatenVar: 'plan_zaten_var',
  planDolu: 'plan_dolu',
  haftaPazartesiDegil: 'hafta_pazartesi_degil',
  gunHaftaDisinda: 'gun_hafta_disinda',
  gorevSilinemez: 'gorev_silinemez',
  gorevDevredilmis: 'gorev_zaten_devredildi',
  devretmeDurumuGecersiz: 'devretme_durumu_gecersiz',
  hedefGunGecersiz: 'hedef_gun_gecersiz',
  surumCakismasi: 'surum_cakismasi',
} as const;

/** Hafta sonundan (Pazar) sonra bu kadar gun gecince hafta kilitlenir. */
export const PLAN_KILIT_GUN = 14;
/** Toplu plan icin tek istekte etkin ogrenci ust siniri korumasi (insert parca boyutu). */
export const PLAN_TOPLU_PARCA_BOYUTU = 200;

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });

export const PlanDurumSema = z.enum(['taslak', 'yayinda']);
export const PlanHedefTuruSema = z.enum(['soru', 'dakika']);
export const PlanGorevDurumSema = z.enum([
  'bekliyor',
  'tamam',
  'kismen',
  'yapilmadi',
  'devredildi',
]);
export type PlanGorevDurumu = z.infer<typeof PlanGorevDurumSema>;

// --- Olay ------------------------------------------------------------------------------------

/** Yalniz `gerceklesen_miktar` ya da `durum` degisince, ayni islemde outbox. */
export const ogrenmePlanGoreviGuncellendiV1 = defineEvent(
  'ogrenme.plan_gorevi.guncellendi',
  1,
  z.object({
    gorev_id: z.uuid(),
    plan_id: z.uuid(),
    ogrenci_id: z.uuid(),
    hafta_baslangic: tarih,
    gun: tarih,
    brans_kodu: z.string(),
    hedef_turu: PlanHedefTuruSema,
    hedef_miktar: z.number().int().min(1),
    gerceklesen_miktar: z.number().int().min(0).nullable(),
    onceki_gerceklesen_miktar: z.number().int().min(0).nullable(),
    durum: PlanGorevDurumSema,
    onceki_durum: PlanGorevDurumSema,
  }),
);

// --- Gorev ve plan ----------------------------------------------------------------------------

const baslik = z.string().trim().min(1).max(200);
const miktar = z.number().int().min(1).max(100_000);
const bransKodu = z.string().trim().min(1).max(40);

export const PlanGorevSema = z.object({
  id: z.uuid(),
  plan_id: z.uuid(),
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih,
  gun: tarih,
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  baslik: z.string().nullable(),
  hedef_turu: PlanHedefTuruSema,
  hedef_miktar: z.number().int(),
  gerceklesen_miktar: z.number().int().nullable(),
  durum: PlanGorevDurumSema,
  tamamlandi_at: zaman.nullable(),
  devreden_gorev_id: z.uuid().nullable(),
  sira: z.number().int(),
  surum: z.number().int(),
});
export type PlanGorevi = z.infer<typeof PlanGorevSema>;

export const PlanSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih,
  hazirlayan_id: z.uuid(),
  durum: PlanDurumSema,
  yayin_at: zaman.nullable(),
  not: z.string().nullable(),
  surum: z.number().int(),
  created_at: zaman,
});
export type HaftalikPlan = z.infer<typeof PlanSema>;

/** Plan + gorevleri. Plan yoksa `plan: null` ve bos `gorevler` (bos iskelet). */
export const PlanDetaySema = z.object({
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih,
  kilitli: z.boolean().describe('Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`.'),
  plan: PlanSema.nullable(),
  gorevler: z.array(PlanGorevSema),
});
export type PlanDetayi = z.infer<typeof PlanDetaySema>;

export const HaftaSorguSema = z.object({
  hafta: tarih
    .optional()
    .describe('Haftanin herhangi bir gunu (`YYYY-MM-DD`); verilmezse bu hafta (Europe/Istanbul).'),
});

export const PlanOlusturGirdiSema = z.object({
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih.describe('Haftanin Pazartesi gunu.'),
  not: z.string().trim().min(1).max(2000).optional(),
});

export const PlanNotGirdiSema = z.object({
  not: z.string().trim().min(1).max(2000).nullable(),
  surum: z.number().int().min(1).optional(),
});

export const GorevGirdiSema = z.object({
  gun: tarih,
  brans_kodu: bransKodu,
  konu_id: z.uuid().optional(),
  baslik: baslik.optional(),
  hedef_turu: PlanHedefTuruSema,
  hedef_miktar: miktar,
  sira: z.number().int().min(0).max(1000).default(0),
});

export const GorevGuncelleGirdiSema = z.object({
  gun: tarih.optional(),
  brans_kodu: bransKodu.optional(),
  konu_id: z.uuid().nullable().optional(),
  baslik: baslik.nullable().optional(),
  hedef_turu: PlanHedefTuruSema.optional(),
  hedef_miktar: miktar.optional(),
  sira: z.number().int().min(0).max(1000).optional(),
  surum: z.number().int().min(1).optional(),
});

export const KopyalaGirdiSema = z.object({
  hedef_hafta_baslangic: tarih
    .optional()
    .describe('Hedef haftanin Pazartesi gunu; verilmezse kaynak haftadan bir sonraki hafta.'),
});

/** Sablon ve toplu plan gorevi: tarih yok, haftanin gun sirasi (0 = Pazartesi ... 6 = Pazar). */
export const SablonGorevGirdiSema = z.object({
  gun_sirasi: z.number().int().min(0).max(6),
  brans_kodu: bransKodu,
  konu_id: z.uuid().optional(),
  baslik: baslik.optional(),
  hedef_turu: PlanHedefTuruSema,
  hedef_miktar: miktar,
  sira: z.number().int().min(0).max(1000).default(0),
});
export const SablonGorevSema = z.object({
  id: z.uuid(),
  gun_sirasi: z.number().int(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  baslik: z.string().nullable(),
  hedef_turu: PlanHedefTuruSema,
  hedef_miktar: z.number().int(),
  sira: z.number().int(),
});

const SABLON_GOREV_UST = 100;

export const TopluPlanGirdiSema = z
  .object({
    grup_id: z.uuid(),
    hafta_baslangic: tarih.describe('Haftanin Pazartesi gunu.'),
    sablon_id: z.uuid().optional(),
    gorevler: z.array(SablonGorevGirdiSema).min(1).max(SABLON_GOREV_UST).optional(),
    yayinla: z.boolean().default(false),
  })
  .refine((g) => (g.sablon_id === undefined) !== (g.gorevler === undefined), {
    message: '`sablon_id` ya da `gorevler` verilmeli (ikisi birden degil).',
    path: ['sablon_id'],
  });

export const TopluPlanYanitSema = z.object({
  grup_id: z.uuid(),
  hafta_baslangic: tarih,
  olusturulan: z.number().int(),
  atlanan: z.number().int().describe('Plani zaten olan ogrenci sayisi (degistirilmez).'),
  planlar: z.array(
    z.object({
      ogrenci_id: z.uuid(),
      plan_id: z.uuid(),
      sonuc: z.enum(['olusturuldu', 'zaten_var']),
    }),
  ),
});

export const SablonOlusturGirdiSema = z.object({
  ad: baslik,
  aciklama: z.string().trim().min(1).max(2000).optional(),
  gorevler: z.array(SablonGorevGirdiSema).max(SABLON_GOREV_UST).default([]),
});

export const SablonGuncelleGirdiSema = z.object({
  ad: baslik.optional(),
  aciklama: z.string().trim().min(1).max(2000).nullable().optional(),
  gorevler: z
    .array(SablonGorevGirdiSema)
    .max(SABLON_GOREV_UST)
    .optional()
    .describe('Verilirse sablonun gorev listesinin TAMAMI bununla degistirilir.'),
});

export const PlanSablonuSema = z.object({
  id: z.uuid(),
  ogretmen_id: z.uuid(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  gorevler: z.array(SablonGorevSema),
  created_at: zaman,
});
export type PlanSablonu = z.infer<typeof PlanSablonuSema>;

export const PlanSablonListeYanitSema = z.object({ sablonlar: z.array(PlanSablonuSema) });

export const SablondanKurGirdiSema = z.object({
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih.describe('Haftanin Pazartesi gunu.'),
});

// --- Ogrenci ----------------------------------------------------------------------------------

export const GorevlerimSorguSema = z.object({
  gun: tarih.optional().describe('Verilmezse bugun (Europe/Istanbul, sunucu saati).'),
});

export const GorevlerimYanitSema = z.object({
  gun: tarih,
  gorevler: z.array(PlanGorevSema),
});

export const GerceklesenGirdiSema = z.object({
  gerceklesen_miktar: z.number().int().min(0).max(100_000),
  surum: z.number().int().min(1).optional(),
});

export const DevretGirdiSema = z.object({
  hedef_gun: tarih.optional().describe('Verilmezse gorevin gununden bir sonraki gun.'),
  surum: z.number().int().min(1).optional(),
});

export const DevretYanitSema = z.object({
  eski: PlanGorevSema,
  yeni: PlanGorevSema,
});

// --- Ozet -------------------------------------------------------------------------------------

const MiktarOzetiSema = z.object({
  planlanan: z.number().int(),
  gerceklesen: z.number().int(),
});

export const PlanOzetSema = z.object({
  plan_id: z.uuid(),
  ogrenci_id: z.uuid(),
  hafta_baslangic: tarih,
  dersler: z.array(
    z.object({
      brans_kodu: z.string(),
      soru: MiktarOzetiSema,
      dakika: MiktarOzetiSema,
      gorev_sayisi: z.number().int(),
      tamam_sayisi: z.number().int(),
    }),
  ),
  toplam: z.object({
    soru: MiktarOzetiSema,
    dakika: MiktarOzetiSema,
    gorev_sayisi: z.number().int(),
    tamam_sayisi: z.number().int(),
  }),
});
export type PlanOzeti = z.infer<typeof PlanOzetSema>;
