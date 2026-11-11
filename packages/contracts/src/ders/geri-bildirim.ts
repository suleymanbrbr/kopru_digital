import { z } from 'zod';

import { geriBildirimDegerSema } from './olaylar.js';

/**
 * Ders sonu geri bildirimi HTTP sozlesmeleri (docs/schema/api.md `ders.geri_bildirimler`).
 * Alanlar `snake_case`. Ogrenci anlama durumunu tek dokunusla bildirir; anonim degildir.
 */

export const geriBildirimHataKodlari = {
  dersBitmedi: 'geri_bildirim_ders_bitmedi',
  yoklamaUygunDegil: 'geri_bildirim_yoklama_uygun_degil',
  guncellemeSuresiDoldu: 'geri_bildirim_guncelleme_suresi_doldu',
} as const;

/** Dersin bitisinden sonra geri bildirimin guncellenebildigi sure (saat); "bekleyen" listesinin penceresi. */
export const GERI_BILDIRIM_PENCERE_SAAT = 24;
export const GERI_BILDIRIM_OZET_MAKS_GUN = 366;

const zaman = z.iso.datetime({ offset: true });
const tarih = z.iso.date();

export const GeriBildirimGirdiSema = z.object({
  deger: geriBildirimDegerSema,
  konu_id: z.uuid().nullish().describe('Zorlanılan müfredat konusu (isteğe bağlı).'),
  not: z.string().trim().min(1).max(500).nullish(),
});

export const GeriBildirimSema = z.object({
  id: z.uuid(),
  ders_id: z.uuid(),
  ogrenci_id: z.uuid(),
  deger: geriBildirimDegerSema,
  konu_id: z.uuid().nullable(),
  not: z.string().nullable(),
  created_at: zaman,
  updated_at: zaman,
});

export const GeriBildirimKaydetYanitSema = z.object({
  geri_bildirim: GeriBildirimSema,
  yeni: z.boolean().describe('`true`: ilk veriş (olay yayımlandı). `false`: güncelleme.'),
});

export const GeriBildirimKendiYanitSema = z.object({
  geri_bildirim: GeriBildirimSema.nullable(),
});

export const GeriBildirimBekleyenDersSema = z.object({
  ders_id: z.uuid(),
  grup_id: z.uuid(),
  ogretmen_id: z.uuid(),
  brans_kodu: z.string(),
  baslik: z.string().nullable(),
  konu_id: z.uuid().nullable(),
  baslangic_at: zaman,
  bitis_at: zaman,
  son_verme_at: zaman.describe('Bu zamandan sonra geri bildirim güncellenemez (bitiş + 24 saat).'),
});

export const GeriBildirimBekleyenYanitSema = z.object({
  dersler: z.array(GeriBildirimBekleyenDersSema),
});

export const GeriBildirimSayilariSema = z.object({
  anladim: z.number().int(),
  kismen: z.number().int(),
  anlamadim: z.number().int(),
  toplam: z.number().int(),
});

export const GeriBildirimSatiriSema = GeriBildirimSema.extend({
  gorunen_ad: z.string().nullable(),
});

export const GeriBildirimDersYanitSema = z.object({
  ders_id: z.uuid(),
  ozet: GeriBildirimSayilariSema,
  geri_bildirimler: z.array(GeriBildirimSatiriSema),
  katilimci_sayisi: z.number().int(),
});

export const GeriBildirimOgrenciSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(200).optional(),
});

export const GeriBildirimOgrenciSatiriSema = GeriBildirimSema.extend({
  brans_kodu: z.string(),
  ders_baslangic_at: zaman,
  ders_bitis_at: zaman,
  ogretmen_id: z.uuid(),
});

export const GeriBildirimOgrenciYanitSema = z.object({
  geri_bildirimler: z.array(GeriBildirimOgrenciSatiriSema),
  sonraki_imlec: z.string().nullable(),
});

export const GeriBildirimOzetSorguSema = z
  .object({
    baslangic: tarih.describe('Kurum yerel tarihi (dahil).'),
    bitis: tarih.describe('Kurum yerel tarihi (dahil).'),
  })
  .refine((v) => v.baslangic <= v.bitis, { message: 'baslangic bitisten sonra olamaz.' })
  .refine(
    (v) =>
      (new Date(`${v.bitis}T00:00:00Z`).getTime() -
        new Date(`${v.baslangic}T00:00:00Z`).getTime()) /
        86_400_000 <
      GERI_BILDIRIM_OZET_MAKS_GUN,
    { message: `Aralık en çok ${String(GERI_BILDIRIM_OZET_MAKS_GUN)} gün olabilir.` },
  );

export const GeriBildirimOranSema = GeriBildirimSayilariSema.extend({
  oran: z
    .object({ anladim: z.number(), kismen: z.number(), anlamadim: z.number() })
    .describe('Toplama bölünmüş oranlar (0-1, 4 hane). Toplam 0 ise hepsi 0.'),
});

export const GeriBildirimOzetYanitSema = z.object({
  baslangic: tarih,
  bitis: tarih,
  toplam: GeriBildirimOranSema,
  ogretmenler: z.array(
    GeriBildirimOranSema.extend({ ogretmen_id: z.uuid(), gorunen_ad: z.string().nullable() }),
  ),
  branslar: z.array(GeriBildirimOranSema.extend({ brans_kodu: z.string() })),
});
