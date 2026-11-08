import { z } from 'zod';

import { DersSema } from './api.js';
import { yoklamaDurumSema } from './olaylar.js';

/**
 * Yoklama HTTP sozlesmeleri (docs/schema/api.md `ders.yoklamalar`). Alanlar `snake_case`.
 * `PUT .../dersler/:id/yoklamalar` toplu ve tek islemdir; `Idempotency-Key` basligi zorunludur.
 */

export const yoklamaHataKodlari = {
  dersHenuzBaslamadi: 'ders_henuz_baslamadi',
  dersIptalEdildi: 'ders_iptal_edildi',
  yoklamaKilitli: 'yoklama_kilitli',
  ogrenciKatilimciDegil: 'ogrenci_katilimci_degil',
  idempotencyAnahtarCakismasi: 'idempotency_anahtar_cakismasi',
  katilimciYoklamali: 'katilimci_yoklamali',
  tamamlanmisDersYalnizBu: 'tamamlanmis_ders_yalniz_bu',
} as const;

/** Yoklama `isaretlenme_at` istemci saatidir; sunucu saatinden en cok bu kadar ileride olabilir. */
export const YOKLAMA_SAAT_SAPMASI_DK = 5;
/** Tek istekte en cok kac ogrenci. */
export const YOKLAMA_TOPLU_MAKS = 500;
/** `yoklama_istekleri` satirlarinin saklanma suresi (gun). */
export const YOKLAMA_ISTEK_SAKLAMA_GUN = 14;
/** Yoklama bekleyen dersler listesinin geriye bakis suresi (gun). */
export const YOKLAMA_BEKLEYEN_GUN = 14;

const zaman = z.iso.datetime({ offset: true });

export const NotGorunurlukSema = z
  .enum(['ogretmene_ozel', 'ogrenciye'])
  .describe(
    '`ogretmene_ozel` (varsayılan): not öğrenciye ve hiçbir olaya dönmez. `ogrenciye`: öğrenci kendi yoklamasında görür.',
  );

export const YoklamaGirdiSatiriSema = z
  .object({
    ogrenci_id: z.uuid().describe('Dersin katılımcısı olan öğrenci üyeliği.'),
    durum: yoklamaDurumSema,
    gec_dakika: z
      .number()
      .int()
      .min(1)
      .max(240)
      .optional()
      .describe('`durum=gec` ise zorunlu (1-240), aksi hâlde verilemez.'),
    not: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .nullish()
      .describe('Kısa ders notu. Satır tam yazılır: verilmezse mevcut not silinir.'),
    not_gorunurluk: NotGorunurlukSema.optional(),
    isaretlenme_at: zaman.describe(
      'İstemci saati (çevrimdışı kuyrukta işaretlenme anı). Mevcut kayıttan eskiyse `sonuc: eski`.',
    ),
  })
  .superRefine((v, ctx) => {
    if (v.durum === 'gec' && v.gec_dakika === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['gec_dakika'],
        message: '`gec` için gec_dakika gerekli.',
      });
    }
    if (v.durum !== 'gec' && v.gec_dakika !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['gec_dakika'],
        message: 'gec_dakika yalnızca `gec` durumunda verilir.',
      });
    }
  });

export const YoklamaTopluGirdiSema = z
  .object({
    yoklamalar: z.array(YoklamaGirdiSatiriSema).min(1).max(YOKLAMA_TOPLU_MAKS),
  })
  .refine((v) => new Set(v.yoklamalar.map((y) => y.ogrenci_id)).size === v.yoklamalar.length, {
    message: 'Aynı öğrenci bir istekte yalnızca bir kez verilebilir.',
    path: ['yoklamalar'],
  });

export const YoklamaBaslikSema = z.object({
  'idempotency-key': z
    .uuid()
    .describe('İstemcinin ürettiği UUID (çevrimdışı kuyruk her denemede aynısını gönderir).'),
});

export const YoklamaSatiriSema = z.object({
  id: z.uuid(),
  ders_id: z.uuid(),
  ogrenci_id: z.uuid(),
  durum: yoklamaDurumSema,
  gec_dakika: z.number().int().nullable(),
  not: z.string().nullable().describe('Öğrenci rolünde `ogretmene_ozel` not hep `null`.'),
  not_gorunurluk: NotGorunurlukSema,
  isaretleyen_id: z.uuid(),
  isaretlenme_at: zaman,
  sunucu_at: zaman,
  surum: z.number().int(),
});
export type YoklamaSatiriTipi = z.infer<typeof YoklamaSatiriSema>;

export const YoklamaSonucuSema = z.object({
  ogrenci_id: z.uuid(),
  sonuc: z
    .enum(['yeni', 'guncellendi', 'ayni', 'eski'])
    .describe(
      '`yeni`/`guncellendi`: yazıldı. `ayni`: içerik birebir aynı, hiçbir şey değişmedi. `eski`: istemci saati mevcut kayıttan eski, yazılmadı.',
    ),
  yoklama: YoklamaSatiriSema.describe('İşlem sonrası güncel satır (`eski` ise mevcut satır).'),
  kalan_kredi: z
    .number()
    .int()
    .nullable()
    .describe('Bu işlem kredi bakiyesini değiştirdiyse güncel kalan kredi, yoksa `null`.'),
  uyari: z.enum(['ucret_tarifesi_yok']).nullable(),
});

export const YoklamaKaydetYanitSema = z.object({
  ders_id: z.uuid(),
  ders_durumu: z.enum(['planli', 'tamamlandi', 'iptal']),
  sonuclar: z.array(YoklamaSonucuSema),
});

export const YoklamaKatilimcisiSema = z.object({
  ogrenci_id: z.uuid(),
  tur: z.enum(['uye', 'misafir', 'telafi']),
  gorunen_ad: z.string().nullable(),
  yoklama: YoklamaSatiriSema.nullable().describe('Yoklaması henüz alınmamışsa `null`.'),
});

export const YoklamaListeYanitSema = z.object({
  ders: z.object({
    id: z.uuid(),
    grup_id: z.uuid(),
    baslangic_at: zaman,
    bitis_at: zaman,
    durum: z.enum(['planli', 'tamamlandi', 'iptal']),
  }),
  katilimcilar: z.array(YoklamaKatilimcisiSema),
});

export const YoklamaBekleyenSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(200).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});

export const YoklamaBekleyenDersSema = DersSema.extend({
  yoklamasi_eksik_sayisi: z.number().int().describe('Yoklaması girilmemiş katılımcı sayısı.'),
});

export const YoklamaBekleyenYanitSema = z.object({
  dersler: z.array(YoklamaBekleyenDersSema),
  sonraki_imlec: z.string().nullable(),
});
