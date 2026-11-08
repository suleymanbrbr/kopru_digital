import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `ders` olaylari (docs/schema/olaylar.md). Yuk `snake_case`; ad, telefon, e-posta gibi kisisel veri
 * tasimaz (yalniz kimlikler). `ogrenci_idleri` 200'luk parcalara bolunur: ayni dersin parcalari ayni
 * `ders_id` ve `parca_sayisi` tasir, tuketici parcalari birlestirir.
 */

export const DERS_OLAY_PARCA_BOYUTU = 200;

export const dersDegisimTuruSema = z.enum([
  'planlandi',
  'ertelendi',
  'iptal_edildi',
  'tamamlandi',
  'guncellendi',
]);

export const dersDurumSema = z.enum(['planli', 'tamamlandi', 'iptal']);
export const dersIptalKaynagiSema = z.enum(['ogretmen', 'ogrenci', 'yonetici']);

export const dersDersDegistiV1 = defineEvent(
  'ders.ders.degisti',
  1,
  z.object({
    ders_id: z.uuid(),
    degisim_turu: dersDegisimTuruSema,
    seri_id: z.uuid().nullable(),
    grup_id: z.uuid(),
    ogretmen_id: z.uuid(),
    brans_kodu: z.string(),
    baslangic_at: z.iso.datetime({ offset: true }),
    bitis_at: z.iso.datetime({ offset: true }),
    onceki_baslangic_at: z.iso.datetime({ offset: true }).nullable(),
    durum: dersDurumSema,
    telafi: z.boolean(),
    online: z.boolean(),
    ogrenci_idleri: z.array(z.uuid()).max(DERS_OLAY_PARCA_BOYUTU),
    parca_no: z.number().int().min(1),
    parca_sayisi: z.number().int().min(1),
    iptal_nedeni: z.string().max(500).nullable(),
    iptal_kaynagi: dersIptalKaynagiSema.nullable(),
    gec_iptal: z.boolean(),
  }),
);

export const yoklamaDurumSema = z.enum(['geldi', 'gelmedi', 'izinli', 'gec']);
export type YoklamaDurumTipi = z.infer<typeof yoklamaDurumSema>;

/**
 * Yoklama eklenince ya da durumu gercekten degisince (kredi/ucret islemiyle ayni islemde). Yuk yalniz
 * kimlik ve durum tasir: ders notu, ad, telefon, e-posta ASLA girmez.
 */
export const dersYoklamaKaydedildiV1 = defineEvent(
  'ders.yoklama.kaydedildi',
  1,
  z.object({
    yoklama_id: z.uuid(),
    ders_id: z.uuid(),
    grup_id: z.uuid(),
    ogrenci_id: z.uuid(),
    brans_kodu: z.string(),
    durum: yoklamaDurumSema,
    onceki_durum: yoklamaDurumSema.nullable(),
    gec_dakika: z.number().int().min(1).max(240).nullable(),
    isaretlenme_at: z.iso.datetime({ offset: true }),
    yoklama_surumu: z.number().int().min(1),
  }),
);
