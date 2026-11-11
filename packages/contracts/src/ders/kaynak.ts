import { z } from 'zod';

import { kaynakGorunurlukSema, kaynakSorunNedeniSema, kaynakTuruSema } from './olaylar.js';

/**
 * Ders kayitlari ve materyaller HTTP sozlesmeleri (docs/schema/api.md `ders.ders_kaynaklari`).
 * Dosya yuklemesi degil, harici baglantidir. Alanlar `snake_case`.
 */

export const kaynakHataKodlari = {
  urlGecersiz: 'kaynak_url_gecersiz',
  aliciGecersiz: 'kaynak_alici_gecersiz',
  sifrelemeYok: 'kaynak_sifreleme_yapilandirilmamis',
  sorunZatenAcik: 'kaynak_sorun_zaten_acik',
  dersIptal: 'kaynak_ders_iptal',
  suresiGecmis: 'kaynak_suresi_gecmis',
} as const;

export const KAYNAK_URL_MAKS = 2000;
/** Tek istekte eklenebilecek en cok baglanti. */
export const KAYNAK_TOPLU_MAKS = 20;

const zaman = z.iso.datetime({ offset: true });

export const kaynakSaglayiciSema = z.enum(['zoom', 'drive', 'youtube', 'onedrive', 'diger']);
export type KaynakSaglayici = z.infer<typeof kaynakSaglayiciSema>;
export const kaynakDurumSema = z.enum(['aktif', 'suresi_doldu', 'bozuk', 'gizli']);

// --- Girdiler ------------------------------------------------------------------------------

export const KaynakLinkSema = z.object({
  baslik: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .min(1)
    .max(KAYNAK_URL_MAKS)
    .describe('`https://` ile başlamalı; sağlayıcı alan adından sunucuda tanınır.'),
  parola: z.string().min(1).max(200).nullish().describe('Zoom kayıt parolası; şifreli saklanır.'),
  gecerlilik_bitis_at: zaman.nullish().describe('Son erişim tarihi (gelecekte olmalı).'),
  konu_id: z.uuid().nullish().describe('Müfredat konusu.'),
});

const gorunurlukAlanlari = {
  gorunurluk: kaynakGorunurlukSema.default('grup'),
  ogrenci_idleri: z
    .array(z.uuid())
    .max(500)
    .optional()
    .describe('`secili_ogrenciler` için zorunlu; dersin katılımcısı / grubun etkin üyesi olmalı.'),
};

const linklerSema = z
  .array(KaynakLinkSema)
  .min(1)
  .max(KAYNAK_TOPLU_MAKS)
  .describe('Bir ya da birden çok bağlantı (tek istek, tek işlem).');

const aliciKurali = (v: { gorunurluk: string; ogrenci_idleri?: string[] | undefined }) =>
  v.gorunurluk === 'secili_ogrenciler'
    ? (v.ogrenci_idleri?.length ?? 0) > 0
    : v.ogrenci_idleri === undefined || v.ogrenci_idleri.length === 0;
const aliciMesaji = {
  message:
    '`ogrenci_idleri` yalnızca ve zorunlu olarak `secili_ogrenciler` görünürlüğünde verilir.',
  path: ['ogrenci_idleri'],
};

export const KaynakDersEkleGirdiSema = z
  .object({
    tur: kaynakTuruSema.default('kayit'),
    linkler: linklerSema,
    ...gorunurlukAlanlari,
  })
  .refine(aliciKurali, aliciMesaji);

export const KaynakMateryalEkleGirdiSema = z
  .object({ linkler: linklerSema, ...gorunurlukAlanlari })
  .refine(aliciKurali, aliciMesaji);

export const KaynakGuncelleGirdiSema = z
  .object({
    baslik: z.string().trim().min(1).max(200).optional(),
    url: z.string().trim().min(1).max(KAYNAK_URL_MAKS).optional(),
    parola: z.string().min(1).max(200).nullable().optional().describe('`null`: parolayı kaldır.'),
    gecerlilik_bitis_at: zaman.nullable().optional(),
    konu_id: z.uuid().nullable().optional(),
    gorunurluk: kaynakGorunurlukSema.optional(),
    ogrenci_idleri: z.array(z.uuid()).max(500).optional(),
    durum: z
      .enum(['aktif', 'gizli'])
      .optional()
      .describe('`gizli`: öğrenciden gizler. `aktif`: yeniden açar.'),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'En az bir alan verilmeli.',
  });

export const KaynakSorunGirdiSema = z.object({
  neden: kaynakSorunNedeniSema,
  aciklama: z.string().trim().min(1).max(500).nullish(),
});

const listeAlanlari = {
  tur: kaynakTuruSema.optional(),
  grup_id: z.uuid().optional(),
  brans_kodu: z.string().max(60).optional(),
  ders_id: z.uuid().optional(),
  konu_id: z.uuid().optional(),
  baslangic: z.iso
    .date()
    .optional()
    .describe('Ders tarihi (yoksa eklenme tarihi), kurum yerel günü, dahil.'),
  bitis: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  imlec: z.string().max(300).optional(),
};
const aralikKurali = (v: { baslangic?: string | undefined; bitis?: string | undefined }) =>
  v.baslangic === undefined || v.bitis === undefined || v.baslangic <= v.bitis;
const aralikMesaji = { message: 'baslangic bitisten sonra olamaz.' };

export const KaynakListeSorguSema = z.object(listeAlanlari).refine(aralikKurali, aralikMesaji);

export const KaynakYonetimSorguSema = z
  .object({ ...listeAlanlari, durum: kaynakDurumSema.optional() })
  .refine(aralikKurali, aralikMesaji);

// --- Yanitlar ------------------------------------------------------------------------------

/** Ortak alanlar (parola ASLA listede donmez). */
const kaynakTemel = {
  id: z.uuid(),
  tur: kaynakTuruSema,
  ders_id: z.uuid().nullable(),
  grup_id: z.uuid(),
  baslik: z.string(),
  saglayici: kaynakSaglayiciSema,
  url: z.string(),
  parola_var: z.boolean(),
  gecerlilik_bitis_at: zaman.nullable(),
  gorunurluk: kaynakGorunurlukSema,
  konu_id: z.uuid().nullable(),
  durum: kaynakDurumSema,
  ekleyen_id: z.uuid(),
  created_at: zaman,
  updated_at: zaman,
  ders_baslangic_at: zaman.nullable(),
  brans_kodu: z.string().nullable(),
  ogretmen_id: z.uuid().nullable().describe('Derse bağlıysa dersin öğretmeni, değilse ekleyen.'),
};

export const KaynakSema = z.object({
  ...kaynakTemel,
  izleyen_sayisi: z.number().int(),
  acik_sorun_sayisi: z.number().int(),
});

export const KaynakDetaySema = KaynakSema.extend({
  parola: z
    .string()
    .nullable()
    .describe('Yalnız görünürlük kurallarını sağlayan öğrenciye ve yetkili öğretmene düz metin.'),
  ogrenci_idleri: z
    .array(z.uuid())
    .nullable()
    .describe('`secili_ogrenciler` alıcıları (yalnız personel); aksi `null`.'),
});

export const KaynakEkleYanitSema = z.object({ kaynaklar: z.array(KaynakDetaySema) });
export const KaynakListeYanitSema = z.object({
  kaynaklar: z.array(KaynakSema),
  sonraki_imlec: z.string().nullable(),
});

/** Ogrencinin "Kayitlarim" satiri. */
export const KayitlarimSatiriSema = z.object({
  ...kaynakTemel,
  izlendi: z.boolean(),
  izledi_at: zaman.nullable(),
  bozuk: z.boolean(),
});
export const KayitlarimYanitSema = z.object({
  kayitlar: z.array(KayitlarimSatiriSema),
  sonraki_imlec: z.string().nullable(),
});

export const KayitlarimDetaySema = KayitlarimSatiriSema.extend({
  parola: z.string().nullable(),
  acik_sorun_var: z.boolean().describe('Bu öğrencinin bu kaynak için açık bildirimi var mı.'),
});

export const KaynakIzledimYanitSema = z.object({
  kaynak_id: z.uuid(),
  izledi_at: zaman,
  ilk: z.boolean().describe('`true`: ilk işaret (olay yayımlandı); `false`: zaten işaretliydi.'),
});

export const KaynakSorunSema = z.object({
  id: z.uuid(),
  kaynak_id: z.uuid(),
  bildiren_id: z.uuid(),
  neden: kaynakSorunNedeniSema,
  aciklama: z.string().nullable(),
  durum: z.enum(['acik', 'cozuldu']),
  cozen_id: z.uuid().nullable(),
  cozuldu_at: zaman.nullable(),
  created_at: zaman,
});
export const KaynakSorunYanitSema = z.object({
  sorun: KaynakSorunSema,
  kaynak_durumu: kaynakDurumSema,
});
export const KaynakSorunListeYanitSema = z.object({
  sorunlar: z.array(KaynakSorunSema.extend({ bildiren_ad: z.string().nullable() })),
});
export const KaynakSorunCozYanitSema = z.object({
  cozulen_sayisi: z.number().int(),
  kaynak_durumu: kaynakDurumSema,
});

export const KaynakIzlemeYanitSema = z.object({
  kaynak_id: z.uuid(),
  hedef_sayisi: z.number().int(),
  izleyenler: z.array(
    z.object({ ogrenci_id: z.uuid(), gorunen_ad: z.string().nullable(), izledi_at: zaman }),
  ),
  izlemeyenler: z.array(z.object({ ogrenci_id: z.uuid(), gorunen_ad: z.string().nullable() })),
});

export const KaynakSilYanitSema = z.object({ id: z.uuid(), silindi: z.literal(true) });
