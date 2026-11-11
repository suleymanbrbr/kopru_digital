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

export const geriBildirimDegerSema = z.enum(['anladim', 'kismen', 'anlamadim']);
export type GeriBildirimDeger = z.infer<typeof geriBildirimDegerSema>;

/**
 * Ogrenci derse ILK kez geri bildirim verince (sonraki guncellemeler olay uretmez). Yuk yalniz kimlik ve
 * deger tasir: `not` ve ad ASLA girmez.
 */
export const dersGeriBildirimVerildiV1 = defineEvent(
  'ders.geri_bildirim.verildi',
  1,
  z.object({
    geri_bildirim_id: z.uuid(),
    ders_id: z.uuid(),
    ogrenci_id: z.uuid(),
    brans_kodu: z.string(),
    deger: geriBildirimDegerSema,
    konu_id: z.uuid().nullable(),
  }),
);

export const kaynakTuruSema = z.enum(['kayit', 'materyal']);
export const kaynakGorunurlukSema = z.enum(['ogretmen', 'grup', 'secili_ogrenciler']);
export const kaynakSorunNedeniSema = z.enum([
  'acilmiyor',
  'parola_yanlis',
  'suresi_doldu',
  'diger',
]);

/**
 * Ders kaydi/materyal eklenince ve gorunurluk ogrencilere aciksa. `ogrenci_idleri` cozumlenmis
 * alicilardir (ders katilimcilari, grubun etkin uyeleri ya da secilenler) ve 200'luk parcalara bolunur:
 * ayni `kaynak_id` ve `parca_sayisi` tasir. Baslik, url ve parola ASLA girmez (sapma: docs/schema/olaylar.md
 * `baslik` listeler; serbest metin olay yukune girmez, bunun yerine `brans_kodu` konuldu).
 */
export const dersKaynakEklendiV1 = defineEvent(
  'ders.kaynak.eklendi',
  1,
  z.object({
    kaynak_id: z.uuid(),
    tur: kaynakTuruSema,
    ders_id: z.uuid().nullable(),
    grup_id: z.uuid(),
    brans_kodu: z.string().nullable(),
    gorunurluk: kaynakGorunurlukSema,
    ekleyen_id: z.uuid(),
    ogrenci_idleri: z.array(z.uuid()).max(DERS_OLAY_PARCA_BOYUTU),
    parca_no: z.number().int().min(1),
    parca_sayisi: z.number().int().min(1),
  }),
);

/** Ogrenci kaydi "izledim" isaretleyince (yalniz ilk isaret). */
export const dersKaynakIzlendiV1 = defineEvent(
  'ders.kaynak.izlendi',
  1,
  z.object({
    kaynak_id: z.uuid(),
    ogrenci_id: z.uuid(),
    ders_id: z.uuid().nullable(),
    grup_id: z.uuid(),
    brans_kodu: z.string().nullable(),
    izledi_at: z.iso.datetime({ offset: true }),
  }),
);

/** Ogrenci bozuk baglanti bildirince; `ekleyen_id` bildirimin gidecegi ogretmendir. */
export const dersKaynakSorunBildirildiV1 = defineEvent(
  'ders.kaynak.sorun_bildirildi',
  1,
  z.object({
    sorun_id: z.uuid(),
    kaynak_id: z.uuid(),
    ders_id: z.uuid().nullable(),
    grup_id: z.uuid(),
    bildiren_id: z.uuid(),
    neden: kaynakSorunNedeniSema,
    ekleyen_id: z.uuid(),
  }),
);
