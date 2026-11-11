import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `ogrenme` odev HTTP sozlesmeleri ve olaylari (docs/schema/api.md "Odev", olaylar.md `ogrenme.odev.*`).
 * Alanlar `snake_case`. Olaylar yalniz kimlik, sayi ve durum tasir: ad, telefon, e-posta, baslik,
 * ogrenci/inceleme notu ASLA girmez.
 */

export const odevHataKodlari = {
  odevTaslakDegil: 'odev_taslak_degil',
  odevYayindaDegil: 'odev_yayinda_degil',
  odevKapali: 'odev_kapali',
  teslimDurumuGecersiz: 'teslim_durumu_gecersiz',
  incelemeDurumuGecersiz: 'inceleme_durumu_gecersiz',
  hedefGecersiz: 'hedef_gecersiz',
  surumCakismasi: 'surum_cakismasi',
} as const;

/** `yayinlandi` olayinin ogrenci listesi parca boyutu. */
export const ODEV_OLAY_PARCA_BOYUTU = 200;
/** Fan-out insert parca boyutu. */
export const ODEV_FAN_OUT_PARCA_BOYUTU = 500;

const zaman = z.iso.datetime({ offset: true });

export const OdevTurSema = z.enum(['soru', 'sayfa', 'serbest']);
export const OdevHedefTuruSema = z.enum(['ogrenci', 'grup', 'kademe', 'kurum']);
export const OdevDurumSema = z.enum(['taslak', 'yayinda', 'kapali']);
export const FanOutDurumSema = z.enum(['bekliyor', 'calisiyor', 'tamamlandi']);
export const OgrenciOdevDurumSema = z.enum([
  'atandi',
  'teslim_edildi',
  'incelendi',
  'tekrar_istendi',
  'iptal',
]);
export const IncelemeSonucuSema = z.enum(['tamam', 'eksik', 'tekrar']);
export type IncelemeSonucu = z.infer<typeof IncelemeSonucuSema>;

// --- Olaylar ---------------------------------------------------------------------------------

/**
 * Fan-out tamamlaninca; ogrenci listesi 200'luk parcalar (ayni `odev_id`, `parca_no`/`parca_sayisi`).
 * `baslik` serbest metin oldugundan (kisisel veri riski) olayda YOKTUR; bildirim `brans_kodu` kullanir.
 */
export const ogrenmeOdevYayinlandiV1 = defineEvent(
  'ogrenme.odev.yayinlandi',
  1,
  z.object({
    odev_id: z.uuid(),
    brans_kodu: z.string(),
    son_teslim_at: zaman.nullable(),
    veren_id: z.uuid(),
    hedef_turu: OdevHedefTuruSema,
    hedef_id: z.uuid(),
    ogrenci_idleri: z.array(z.uuid()).max(ODEV_OLAY_PARCA_BOYUTU),
    parca_no: z.number().int().min(1),
    parca_sayisi: z.number().int().min(1),
  }),
);

export const ogrenmeOdevTeslimEdildiV1 = defineEvent(
  'ogrenme.odev.teslim_edildi',
  1,
  z.object({
    ogrenci_odev_id: z.uuid(),
    odev_id: z.uuid(),
    ogrenci_id: z.uuid(),
    veren_id: z.uuid(),
    brans_kodu: z.string(),
    yapilan_soru_sayisi: z.number().int().min(0),
    dosya_sayisi: z.number().int().min(0),
    gec_teslim: z.boolean(),
    yeniden_teslim: z.boolean(),
  }),
);

export const ogrenmeOdevIncelendiV1 = defineEvent(
  'ogrenme.odev.incelendi',
  1,
  z.object({
    ogrenci_odev_id: z.uuid(),
    odev_id: z.uuid(),
    ogrenci_id: z.uuid(),
    inceleyen_id: z.uuid(),
    brans_kodu: z.string(),
    inceleme_sonucu: IncelemeSonucuSema,
  }),
);

// --- Odev ------------------------------------------------------------------------------------

const baslik = z.string().trim().min(1).max(200);
const aciklama = z.string().trim().min(1).max(4000);
const kaynak = z.string().trim().min(1).max(200);
const sayi = z.number().int().min(1).max(100_000);

export const OdevSema = z.object({
  id: z.uuid(),
  baslik: z.string(),
  aciklama: z.string().nullable(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  tur: OdevTurSema,
  kaynak: z.string().nullable(),
  hedef_turu: OdevHedefTuruSema,
  hedef_id: z.uuid(),
  veren_id: z.uuid(),
  son_teslim_at: zaman.nullable(),
  hedef_soru_sayisi: z.number().int().nullable(),
  fotograf_gerekli: z.boolean(),
  durum: OdevDurumSema,
  yayin_at: zaman.nullable(),
  fan_out_durum: FanOutDurumSema,
  atanan_sayisi: z.number().int(),
  surum: z.number().int(),
  created_at: zaman,
});
export type OdevTipi = z.infer<typeof OdevSema>;

export const OdevOlusturGirdiSema = z.object({
  baslik,
  aciklama: aciklama.optional(),
  brans_kodu: z.string().trim().min(1).max(40),
  konu_id: z.uuid().optional(),
  tur: OdevTurSema.default('soru'),
  kaynak: kaynak.optional(),
  hedef_turu: OdevHedefTuruSema,
  hedef_id: z
    .uuid()
    .optional()
    .describe('`kurum` hedefinde verilmez; sunucu kurum kimliğini yazar.'),
  son_teslim_at: zaman.optional(),
  hedef_soru_sayisi: sayi.optional(),
  fotograf_gerekli: z.boolean().default(false),
});

export const OdevGuncelleGirdiSema = z.object({
  baslik: baslik.optional(),
  aciklama: aciklama.nullable().optional(),
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  konu_id: z.uuid().nullable().optional(),
  tur: OdevTurSema.optional(),
  kaynak: kaynak.nullable().optional(),
  hedef_turu: OdevHedefTuruSema.optional(),
  hedef_id: z.uuid().optional(),
  son_teslim_at: zaman.nullable().optional(),
  hedef_soru_sayisi: sayi.nullable().optional(),
  fotograf_gerekli: z.boolean().optional(),
  surum: z.number().int().min(1).optional().describe('İyimser kilit.'),
});

export const OdevListeSorguSema = z.object({
  durum: OdevDurumSema.optional(),
  brans_kodu: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(200).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});

export const OdevListeYanitSema = z.object({
  odevler: z.array(OdevSema),
  sonraki_imlec: z.string().nullable(),
});

export const OdevSayilariSema = z.object({
  atanan: z.number().int(),
  atandi: z.number().int(),
  teslim_edildi: z.number().int(),
  incelendi: z.number().int(),
  tekrar_istendi: z.number().int(),
  iptal: z.number().int(),
  gec_teslim: z.number().int(),
  ortalama_dogru_orani: z
    .number()
    .nullable()
    .describe('Doğru sayısı girilen teslimlerin ortalaması (0-1).'),
});

export const OdevOgrenciSatiriSema = z.object({
  ogrenci_odev_id: z.uuid(),
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  durum: OgrenciOdevDurumSema,
  teslim_edildi: z.boolean().describe('Bir kez de olsa teslim edilmiş mi.'),
  gec_teslim: z.boolean(),
  son_teslim_at: zaman.nullable(),
  teslim_at: zaman.nullable(),
  yapilan_soru_sayisi: z.number().int().nullable(),
  dogru_sayisi: z.number().int().nullable(),
  yanlis_sayisi: z.number().int().nullable(),
  bos_sayisi: z.number().int().nullable(),
  dogru_orani: z.number().nullable(),
  ogrenci_notu: z.string().nullable(),
  inceleme_sonucu: IncelemeSonucuSema.nullable(),
  inceleme_notu: z.string().nullable(),
});

export const OdevOzetSema = z.object({
  odev: OdevSema,
  sayilar: OdevSayilariSema,
  ogrenciler: z.array(OdevOgrenciSatiriSema),
});

export const AtamaEsitleYanitSema = z.object({
  eklenen: z.number().int(),
  yeniden_acilan: z.number().int(),
  atanan_sayisi: z.number().int(),
});

// --- Ogrenci ---------------------------------------------------------------------------------

export const OgrenciOdeviSema = z.object({
  id: z.uuid().describe('`ogrenci_odevleri.id`; teslim bu kimlikle yapılır.'),
  odev_id: z.uuid(),
  baslik: z.string(),
  aciklama: z.string().nullable(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  tur: OdevTurSema,
  kaynak: z.string().nullable(),
  hedef_soru_sayisi: z.number().int().nullable(),
  fotograf_gerekli: z.boolean(),
  odev_durum: OdevDurumSema,
  durum: OgrenciOdevDurumSema,
  son_teslim_at: zaman.nullable(),
  yapilan_soru_sayisi: z.number().int().nullable(),
  dogru_sayisi: z.number().int().nullable(),
  yanlis_sayisi: z.number().int().nullable(),
  bos_sayisi: z.number().int().nullable(),
  ogrenci_notu: z.string().nullable(),
  teslim_at: zaman.nullable(),
  gec_teslim: z.boolean(),
  inceleme_sonucu: IncelemeSonucuSema.nullable(),
  inceleme_notu: z.string().nullable(),
  incelendi_at: zaman.nullable(),
});
export type OgrenciOdeviTipi = z.infer<typeof OgrenciOdeviSema>;

export const OdevlerimSorguSema = z.object({
  durum: OgrenciOdevDurumSema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(200).optional(),
});

export const OdevlerimYanitSema = z.object({
  odevler: z.array(OgrenciOdeviSema),
  sonraki_imlec: z.string().nullable(),
});

const sayac = z.number().int().min(0).max(100_000);

export const TeslimGirdiSema = z.object({
  yapilan_soru_sayisi: sayac,
  dogru_sayisi: sayac.optional(),
  yanlis_sayisi: sayac.optional(),
  bos_sayisi: sayac.optional(),
  ogrenci_notu: z.string().trim().min(1).max(1000).optional(),
});

export const IncelemeGirdiSema = z.object({
  sonuc: IncelemeSonucuSema,
  not: z.string().trim().min(1).max(1000).optional(),
});

// --- Sablon ----------------------------------------------------------------------------------

export const OdevSablonuSema = z.object({
  id: z.uuid(),
  ogretmen_id: z.uuid(),
  baslik: z.string(),
  aciklama: z.string().nullable(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  tur: OdevTurSema,
  kaynak: z.string().nullable(),
  hedef_soru_sayisi: z.number().int().nullable(),
  created_at: zaman,
});

export const SablonOlusturGirdiSema = z.object({
  baslik,
  aciklama: aciklama.optional(),
  brans_kodu: z.string().trim().min(1).max(40),
  konu_id: z.uuid().optional(),
  tur: OdevTurSema.default('soru'),
  kaynak: kaynak.optional(),
  hedef_soru_sayisi: sayi.optional(),
});

export const SablonGuncelleGirdiSema = z.object({
  baslik: baslik.optional(),
  aciklama: aciklama.nullable().optional(),
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  konu_id: z.uuid().nullable().optional(),
  tur: OdevTurSema.optional(),
  kaynak: kaynak.nullable().optional(),
  hedef_soru_sayisi: sayi.nullable().optional(),
});

export const SablonListeYanitSema = z.object({ sablonlar: z.array(OdevSablonuSema) });

/** Ogretmen/yonetici: incelenecek (ya da baska durumdaki) teslimler, ogrenci odev satiri duzeyinde. */
export const TeslimListeSorguSema = z.object({
  durum: OgrenciOdevDurumSema.default('teslim_edildi'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.string().max(300).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});
export const TeslimSatiriSema = z.object({
  ogrenci_odev_id: z.uuid(),
  odev_id: z.uuid(),
  odev_baslik: z.string(),
  brans_kodu: z.string(),
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  durum: OgrenciOdevDurumSema,
  teslim_at: zaman.nullable(),
  son_teslim_at: zaman.nullable(),
  gec_teslim: z.boolean(),
  yapilan_soru_sayisi: z.number().int().nullable(),
  dogru_sayisi: z.number().int().nullable(),
  yanlis_sayisi: z.number().int().nullable(),
  bos_sayisi: z.number().int().nullable(),
  dogru_orani: z.number().nullable(),
});
export const TeslimListeYanitSema = z.object({
  teslimler: z.array(TeslimSatiriSema),
  sonraki_imlec: z.string().nullable(),
});
