import { z } from 'zod';

import { KapsamSema } from '../hesap/izinler.js';

/**
 * `finans` HTTP API sozlesmeleri (docs/schema/api.md `finans`). Alanlar `snake_case`; tum tutarlar
 * kurus tamsayisidir (ADR 0007). Ogrenci rolu icin tum yanitlar `gorunum: 'ogrenci'` ile daralir:
 * fiyat, borc, tahsilat, defter satiri ve odeyen bilgisi ogrenciye asla donmez.
 */

export const finansHataKodlari = {
  paketKullanilmis: 'paket_kullanilmis',
  paketIptal: 'paket_iptal_edilmis',
  tahsilatIptal: 'tahsilat_iptal_edilmis',
  istekCakismasi: 'istek_cakismasi',
  makbuzNoKullanimda: 'makbuz_no_kullanimda',
  tarifeCakisiyor: 'tarife_cakisiyor',
  odemeGecersiz: 'odeme_gecersiz',
  ogrenciDegil: 'ogrenci_degil',
  paketArsivde: 'paket_arsivde',
} as const;

const tarih = z.iso.date();
const zaman = z.iso.datetime({ offset: true });
const kurus = z.number().int();
const pozitifKurus = kurus.positive();
const negatifOlmayanKurus = kurus.nonnegative();

export const GrupTuruSema = z.enum(['birebir', 'grup', 'sinif', 'etut']);
export const FinansModeliSema = z.enum(['paket', 'ders_basi', 'yok']);
export const TahsilatYontemiSema = z.enum(['nakit', 'havale', 'kart', 'diger']);
export const PaketSatisDurumuSema = z.enum(['aktif', 'tukendi', 'suresi_doldu', 'iptal']);

const nedenSema = z.string().trim().min(1).max(500);

/** `?borclu` gibi bayraklar: bos deger, `true`, `1` => true; `false`, `0` => false. */
const sorguBayrak = z
  .union([z.literal(''), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === '' || v === 'true' || v === '1');

const sayfaSorgusu = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  imlec: z.uuid().optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
};

export const KurumParamSema = z.object({ kurum_id: z.uuid() });
export const OgrenciParamSema = KurumParamSema.extend({ ogrenci_id: z.uuid() });

// --- Kredi politikasi ----------------------------------------------------------------------

export const KrediPolitikaAnahtarlariSema = z.object({
  geldi_dusurur: z.boolean(),
  gec_dusurur: z.boolean(),
  gelmedi_dusurur: z.boolean(),
  izinli_dusurur: z.boolean(),
  ogrenci_gec_iptal_dusurur: z.boolean(),
});
/** Paket bazli gecersiz kilma: anahtarlarin bir alt kumesi. */
export const KrediPolitikasiKismiSema = KrediPolitikaAnahtarlariSema.partial().strict();

export const KrediPolitikasiSema = KrediPolitikaAnahtarlariSema.extend({
  gec_iptal_saat: z.number().int().min(0).max(168),
  dusuk_kredi_esigi: z.number().int().min(0).max(1000),
  /** Kurum satiri yoksa varsayilan degerler doner. */
  varsayilan: z.boolean(),
});
export const KrediPolitikasiYazGirdiSema = KrediPolitikaAnahtarlariSema.extend({
  gec_iptal_saat: z.number().int().min(0).max(168),
  dusuk_kredi_esigi: z.number().int().min(0).max(1000),
}).partial();

export const FinansAyarSema = z.object({
  ogrenci_kalan_ders_gorur: z.boolean(),
});

// --- Paket sablonlari ----------------------------------------------------------------------

export const PaketSema = z.object({
  id: z.uuid(),
  ad: z.string(),
  kredi_adedi: z.number().int(),
  fiyat_kurus: kurus,
  kredi_politikasi: KrediPolitikasiKismiSema.nullable(),
  gecerlilik_gun: z.number().int().nullable(),
  grup_turu: GrupTuruSema.nullable(),
  brans_kodu: z.string().nullable(),
  aktif: z.boolean(),
  arsivlendi_at: zaman.nullable(),
  surum: z.number().int(),
  created_at: zaman,
});

export const PaketOlusturGirdiSema = z.object({
  ad: z.string().trim().min(1).max(200),
  kredi_adedi: z.number().int().positive().max(10_000),
  fiyat_kurus: negatifOlmayanKurus,
  kredi_politikasi: KrediPolitikasiKismiSema.nullable().optional(),
  gecerlilik_gun: z.number().int().positive().max(3650).nullable().optional(),
  grup_turu: GrupTuruSema.nullable().optional(),
  brans_kodu: z
    .string()
    .regex(/^[a-z_]+$/)
    .nullable()
    .optional(),
});
export const PaketGuncelleGirdiSema = PaketOlusturGirdiSema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'En az bir alan gerekli.' },
);

export const PaketListeSorguSema = z.object({
  durum: z.enum(['aktif', 'arsiv', 'hepsi']).default('aktif'),
  ...sayfaSorgusu,
});
export const PaketListeYanitSema = z.object({
  paketler: z.array(PaketSema),
  sonraki_imlec: z.uuid().nullable(),
});

// --- Paket satisi --------------------------------------------------------------------------

export const PaketSatisiSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  paket_id: z.uuid().nullable(),
  ad: z.string(),
  toplam_kredi: z.number().int(),
  /** Havuzda kalan kredi (defter toplami). */
  kalan_kredi: z.number().int(),
  fiyat_kurus: kurus,
  baslangic_tarihi: tarih,
  bitis_tarihi: tarih.nullable(),
  durum: PaketSatisDurumuSema,
  satan_id: z.uuid(),
  iptal_at: zaman.nullable(),
  created_at: zaman,
});

const makbuzNo = z.string().trim().min(1).max(64);

/** `tamami`: tutar paket fiyatıdır; `kismi`: alınan tutar (< fiyat); `sonra`: ödeme yok. */
export const OdemeSema = z.discriminatedUnion('tur', [
  z.strictObject({ tur: z.literal('sonra') }),
  z.strictObject({
    tur: z.literal('tamami'),
    yontem: TahsilatYontemiSema,
    makbuz_no: makbuzNo.optional(),
  }),
  z.strictObject({
    tur: z.literal('kismi'),
    tutar_kurus: pozitifKurus,
    yontem: TahsilatYontemiSema,
    makbuz_no: makbuzNo.optional(),
  }),
]);

export const PaketSatisGirdiSema = z.object({
  ogrenci_id: z.uuid(),
  paket_id: z.uuid(),
  odeme: OdemeSema.default({ tur: 'sonra' }),
  baslangic_tarihi: tarih.optional().describe('Varsayılan: bugün (Europe/Istanbul).'),
});

export const TahsilatSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  tutar_kurus: pozitifKurus,
  yontem: TahsilatYontemiSema,
  tahsilat_tarihi: tarih,
  makbuz_no: z.string().nullable(),
  paket_satisi_id: z.uuid().nullable(),
  aciklama: z.string().nullable(),
  alan_id: z.uuid(),
  durum: z.enum(['gecerli', 'iptal']),
  iptal_at: zaman.nullable(),
  iptal_nedeni: z.string().nullable(),
  created_at: zaman,
});

export const PaketSatisYanitSema = z.object({
  satis: PaketSatisiSema,
  tahsilat: TahsilatSema.nullable(),
  kalan_kredi: z.number().int(),
  bakiye_kurus: kurus,
});

export const IptalGirdiSema = z.object({ neden: nedenSema });

// --- Tahsilat ------------------------------------------------------------------------------

export const TahsilatGirdiSema = z.object({
  ogrenci_id: z.uuid(),
  tutar_kurus: pozitifKurus,
  yontem: TahsilatYontemiSema,
  tahsilat_tarihi: tarih.optional().describe('Varsayılan: bugün (Europe/Istanbul).'),
  makbuz_no: z.string().trim().min(1).max(64).optional(),
  paket_satisi_id: z.uuid().optional(),
  aciklama: z.string().trim().min(1).max(500).optional(),
});

export const TahsilatBaslikSema = z.object({
  'idempotency-key': z.uuid().optional().describe('Çift gönderim koruması (UUID).'),
});

export const TahsilatListeSorguSema = z.object({
  ogrenci_id: z.uuid().optional(),
  ay: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  durum: z.enum(['gecerli', 'iptal', 'hepsi']).default('hepsi'),
  ...sayfaSorgusu,
});
export const TahsilatListeYanitSema = z.object({
  tahsilatlar: z.array(TahsilatSema),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});

export const TahsilatYanitSema = TahsilatSema.extend({
  /** Aynı `Idempotency-Key` ile yinelenen istekte `true` (yeni kayıt oluşmadı). */
  tekrar: z.boolean(),
});

// --- Ogrenci karti -------------------------------------------------------------------------

export const KrediHareketiSema = z.object({
  id: z.uuid(),
  tur: z.enum([
    'satin_alma',
    'dusum',
    'iptal_dusum',
    'iade',
    'duzeltme',
    'son_kullanma',
    'ters_kayit',
  ]),
  miktar: z.number().int(),
  paket_satisi_id: z.uuid().nullable(),
  ders_id: z.uuid().nullable(),
  yoklama_id: z.uuid().nullable(),
  yoklama_surumu: z.number().int().nullable(),
  ters_cevrilen_id: z.uuid().nullable(),
  neden: z.string().nullable(),
  created_at: zaman,
});

export const BakiyeHareketiSema = z.object({
  id: z.uuid(),
  tur: z.enum(['ders_ucreti', 'paket_satisi', 'tahsilat', 'duzeltme', 'ters_kayit']),
  tutar_kurus: kurus,
  kaynak_turu: z.enum(['yoklama', 'paket_satisi', 'tahsilat', 'elle', 'ders_iptal']),
  kaynak_id: z.uuid().nullable(),
  ders_id: z.uuid().nullable(),
  yoklama_id: z.uuid().nullable(),
  ters_cevrilen_id: z.uuid().nullable(),
  neden: z.string().nullable(),
  created_at: zaman,
});

export const OgrenciFinansTamSema = z.object({
  gorunum: z.literal('tam'),
  ogrenci_id: z.uuid(),
  model: FinansModeliSema,
  kalan_kredi: z.number().int(),
  dusuk_kredi_esigi: z.number().int(),
  /** Negatif = öğrenci borçlu. */
  bakiye_kurus: kurus,
  borclu: z.boolean(),
  etkin_paketler: z.array(PaketSatisiSema),
  son_kredi_hareketleri: z.array(KrediHareketiSema),
  son_bakiye_hareketleri: z.array(BakiyeHareketiSema),
  odeyen_ad: z.string().nullable(),
  odeyen_telefon: z.string().nullable(),
});

/** Ogrenci rolunun gorebildigi tek sey: kalan ders sayisi (kurum ayariyla kapaliysa `null`). */
export const OgrenciFinansOgrenciSema = z.object({
  gorunum: z.literal('ogrenci'),
  ogrenci_id: z.uuid(),
  kalan_kredi: z.number().int().nullable(),
});

export const OgrenciFinansYanitSema = z.discriminatedUnion('gorunum', [
  OgrenciFinansTamSema,
  OgrenciFinansOgrenciSema,
]);

export const FinansProfiliSema = z.object({
  ogrenci_id: z.uuid(),
  model: FinansModeliSema,
  odeyen_ad: z.string().nullable(),
  odeyen_telefon: z.string().nullable(),
  /** Henüz hiç profil satırı yoksa `null` (model `yok` sayılır). */
  surum: z.number().int().nullable(),
});
export const FinansProfiliYazGirdiSema = z
  .object({
    model: FinansModeliSema,
    odeyen_ad: z.string().trim().min(1).max(200).nullable(),
    odeyen_telefon: z.string().trim().min(1).max(32).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'En az bir alan gerekli.' });

export const HareketSorguSema = z.object(sayfaSorgusu);
export const KrediHareketListeYanitSema = z.object({
  hareketler: z.array(KrediHareketiSema),
  kalan_kredi: z.number().int(),
  sonraki_imlec: z.uuid().nullable(),
});
export const BakiyeHareketListeYanitSema = z.object({
  hareketler: z.array(BakiyeHareketiSema),
  bakiye_kurus: kurus,
  sonraki_imlec: z.uuid().nullable(),
});

// --- Ogrenci listesi (rozet) ---------------------------------------------------------------

export const FinansOgrenciListeSorguSema = z.object({
  borclu: sorguBayrak.optional(),
  dusuk_kredi: sorguBayrak.optional(),
  q: z.string().trim().min(1).max(100).optional().describe('Ada göre arama.'),
  ...sayfaSorgusu,
});
export const FinansOgrenciSatiriSema = z.object({
  ogrenci_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
  model: FinansModeliSema,
  kalan_kredi: z.number().int(),
  dusuk_kredi: z.boolean(),
  bakiye_kurus: kurus,
  borclu: z.boolean(),
});
export const FinansOgrenciListeYanitSema = z.object({
  ogrenciler: z.array(FinansOgrenciSatiriSema),
  dusuk_kredi_esigi: z.number().int(),
  kapsam: KapsamSema,
  sonraki_imlec: z.uuid().nullable(),
});

// --- Ucret tarifeleri ----------------------------------------------------------------------

export const UcretTarifesiSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid().nullable(),
  grup_id: z.uuid().nullable(),
  brans_kodu: z.string().nullable(),
  ucret_kurus: negatifOlmayanKurus,
  gecerlilik_baslangic: tarih,
  gecerlilik_bitis: tarih.nullable(),
  surum: z.number().int(),
});
export const UcretTarifesiGirdiSema = z.object({
  ogrenci_id: z.uuid().nullable().optional(),
  grup_id: z.uuid().nullable().optional(),
  brans_kodu: z
    .string()
    .regex(/^[a-z_]+$/)
    .nullable()
    .optional(),
  ucret_kurus: negatifOlmayanKurus,
  gecerlilik_baslangic: tarih,
  gecerlilik_bitis: tarih.nullable().optional(),
});
export const UcretTarifesiGuncelleGirdiSema = UcretTarifesiGirdiSema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'En az bir alan gerekli.' },
);
export const UcretTarifesiListeYanitSema = z.object({ tarifeler: z.array(UcretTarifesiSema) });

// --- Ozet ve disa aktarim ------------------------------------------------------------------

export const AySorguSema = z.object({
  ay: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-MM biçiminde olmalı.')
    .describe('Europe/Istanbul takvim ayı, ör. 2026-11.'),
});

export const AylikOzetSema = z.object({
  ay: z.string(),
  /** Geçerli (iptal edilmemiş) tahsilatların toplamı. */
  toplam_kurus: kurus,
  tahsilat_sayisi: z.number().int(),
  yonteme_gore: z.array(
    z.object({ yontem: TahsilatYontemiSema, toplam_kurus: kurus, adet: z.number().int() }),
  ),
  kapsam: KapsamSema,
});

export type PaketSatisGirdi = z.infer<typeof PaketSatisGirdiSema>;
export type TahsilatGirdi = z.infer<typeof TahsilatGirdiSema>;
export type KrediPolitikasiKismi = z.infer<typeof KrediPolitikasiKismiSema>;
