import { z } from 'zod';

import { defineEvent } from '../event.js';

/**
 * `ogrenme` "soru sor" HTTP sozlesmeleri ve olaylari (docs/schema/api.md "Soru sor", olaylar.md `ogrenme.soru.*`).
 * Alanlar `snake_case`. Olaylar yalniz kimlik, sayi ve durum tasir: ad, telefon, e-posta, baslik, soru/cevap
 * metni ASLA girmez.
 */

export const soruHataKodlari = {
  kotaAsildi: 'kota_asildi',
  dosyaHazirDegil: 'dosya_hazir_degil',
  dosyaGecersiz: 'dosya_gecersiz',
  dosyaIslenemedi: 'dosya_islenemedi',
  dosyaZatenBagli: 'dosya_zaten_bagli',
  kaynakDosyaGecersiz: 'kaynak_dosya_gecersiz',
  bransGecersiz: 'brans_gecersiz',
  konuGecersiz: 'konu_gecersiz',
  soruDurumuGecersiz: 'soru_durumu_gecersiz',
  takipLimitiAsildi: 'takip_limiti_asildi',
  masaUstlenildi: 'masa_ustlenildi',
  cevapBos: 'cevap_bos',
  sesCokUzun: 'ses_cok_uzun',
  masaVar: 'masa_var',
  ogretmenGecersiz: 'ogretmen_gecersiz',
  surumCakismasi: 'surum_cakismasi',
  istekCakismasi: 'istek_cakismasi',
} as const;

/** Sartname: soru basina en cok 3 fotograf. */
export const SORU_EN_FAZLA_FOTOGRAF = 3;
/** Bir mesajda en cok 4 ek (fotograf, cizimli fotograf, ses). */
export const SORU_MESAJ_EN_FAZLA_EK = 4;
/** Ses cevabi en cok 180 sn (sartname 3 dk). */
export const SORU_SES_EN_FAZLA_SN = 180;
export const SORU_METIN_EN_FAZLA = 4000;
/** Cizim vektor verisi (JSON metni) en cok 256 KB. */
export const SORU_CIZIM_EN_FAZLA_BAYT = 256 * 1024;
/** Proje sahibi karari: varsayilan gunde 3 soru; aylik varsayilan sinir yok. */
export const SORU_VARSAYILAN_GUNLUK_LIMIT = 3;
export const SORU_VARSAYILAN_TAKIP_LIMITI = 3;
export const SORU_VARSAYILAN_FOTO_SAKLAMA_GUN = 30;
/** Tahmini cevap suresi: son 30 gun, en az 3 ornek. */
export const SORU_TAHMIN_PENCERE_GUN = 30;
export const SORU_TAHMIN_EN_AZ_ORNEK = 3;
/** Cevaplanmis ve takipsiz soru bu kadar gun sonra kendiliginden `cozuldu` olur. */
export const SORU_OTOMATIK_COZME_GUN = 7;
/** `soru.sorildi` / `soru_mesaji.eklendi` alici listesi ust siniri. */
export const SORU_OLAY_EN_FAZLA_ALICI = 200;
/** `soru.cozuldu` / `soru.yeniden_acildi` dosya listesi ust siniri. */
export const SORU_OLAY_EN_FAZLA_DOSYA = 500;

const zaman = z.iso.datetime({ offset: true });
/** Vektör çizgi verisi: serbest JSON nesne ya da dizi (en çok 256 KB, sunucuda denetlenir). */
const cizimVerisi = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export const SoruDurumSema = z.enum(['acik', 'cevaplandi', 'takip_bekliyor', 'cozuldu', 'kapandi']);
export type SoruDurum = z.infer<typeof SoruDurumSema>;
export const SoruYonlendirmeSema = z.enum(['atanan_ogretmen', 'masa', 'yonetici']);
export const SoruMesajTuruSema = z.enum(['soru', 'cevap', 'takip']);
export const SoruYazarRoluSema = z.enum(['ogrenci', 'ogretmen', 'yonetici']);
export const SoruEkTuruSema = z.enum(['fotograf', 'cizimli_fotograf', 'ses']);
export const SoruBildirimNedeniSema = z.enum(['uygunsuz', 'kisisel_bilgi', 'diger']);
export const SoruCozulduKaynagiSema = z.enum(['ogrenci', 'otomatik']);

// --- Olaylar ---------------------------------------------------------------------------------

export const ogrenmeSoruSorildiV1 = defineEvent(
  'ogrenme.soru.sorildi',
  1,
  z.object({
    soru_id: z.uuid(),
    ogrenci_id: z.uuid(),
    brans_kodu: z.string(),
    yonlendirme: SoruYonlendirmeSema,
    atanan_ogretmen_id: z.uuid().nullable(),
    masa_id: z.uuid().nullable(),
    hedef_ogretmen_idleri: z.array(z.uuid()).max(SORU_OLAY_EN_FAZLA_ALICI),
  }),
);

/** Cevap ya da takip sorusu eklenince. `metin` olayda yoktur. */
export const ogrenmeSoruMesajiEklendiV1 = defineEvent(
  'ogrenme.soru_mesaji.eklendi',
  1,
  z.object({
    soru_id: z.uuid(),
    mesaj_id: z.uuid(),
    tur: z.enum(['cevap', 'takip']),
    yazar_id: z.uuid(),
    ogrenci_id: z.uuid(),
    alici_idleri: z.array(z.uuid()).max(SORU_OLAY_EN_FAZLA_ALICI),
  }),
);

/** `silinecek_at` = `cozuldu_at` + kurumun `foto_saklama_gun` suresi (varsayilan 30 gun). */
export const ogrenmeSoruCozulduV1 = defineEvent(
  'ogrenme.soru.cozuldu',
  1,
  z.object({
    soru_id: z.uuid(),
    ogrenci_id: z.uuid(),
    brans_kodu: z.string(),
    cozuldu_at: zaman,
    dosya_idleri: z.array(z.uuid()).max(SORU_OLAY_EN_FAZLA_DOSYA),
    silinecek_at: zaman,
  }),
);

export const ogrenmeSoruYenidenAcildiV1 = defineEvent(
  'ogrenme.soru.yeniden_acildi',
  1,
  z.object({
    soru_id: z.uuid(),
    ogrenci_id: z.uuid(),
    dosya_idleri: z.array(z.uuid()).max(SORU_OLAY_EN_FAZLA_DOSYA),
  }),
);

// --- Ortak parcalar --------------------------------------------------------------------------

const metin = z.string().trim().min(1).max(SORU_METIN_EN_FAZLA);
const istekId = z
  .uuid()
  .optional()
  .describe(
    'İstemci yeniden denemesine karşı tekil anahtar (UUID). Aynı kurumda aynı `istek_id` ikinci kez gelirse yeni kayıt açılmaz, önceki sonuç döner.',
  );

export const SoruOkumaAdresiSema = z.object({
  mime_tipi: z.string(),
  asil_url: z.string(),
  kucuk_url: z.string().nullable(),
  orta_url: z.string().nullable(),
  genislik: z.number().int().nullable(),
  yukseklik: z.number().int().nullable(),
  sure_sn: z.number().int().nullable(),
  gecerlilik_bitis_at: zaman,
});

export const SoruEkGirdiSema = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('fotograf'), medya_dosya_id: z.uuid() }),
  z.object({
    tur: z.literal('cizimli_fotograf'),
    medya_dosya_id: z.uuid().describe('Düzleştirilmiş görsel (`soru_cizim` türünde dosya).'),
    kaynak_dosya_id: z.uuid().describe('Üzerine çizilen, aynı sorunun fotoğrafı.'),
    cizim_verisi: cizimVerisi.optional().describe('Vektör çizgi verisi (JSON, en çok 256 KB).'),
  }),
  z.object({
    tur: z.literal('ses'),
    medya_dosya_id: z.uuid(),
    sure_sn: z.number().int().min(1).max(SORU_SES_EN_FAZLA_SN).optional(),
  }),
]);
export type SoruEkGirdi = z.infer<typeof SoruEkGirdiSema>;

export const SoruEkSema = z.object({
  id: z.uuid(),
  tur: SoruEkTuruSema,
  medya_dosya_id: z.uuid(),
  kaynak_dosya_id: z.uuid().nullable(),
  sure_sn: z.number().int().nullable(),
  cizim_verisi: cizimVerisi.nullable(),
  sira: z.number().int(),
  adres: SoruOkumaAdresiSema.nullable().describe(
    'Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`.',
  ),
});

export const SoruMesajSema = z.object({
  id: z.uuid(),
  yazar_id: z.uuid(),
  yazar_adi: z.string().nullable(),
  yazar_rolu: SoruYazarRoluSema,
  tur: SoruMesajTuruSema,
  metin: z.string().nullable(),
  derste_konusalim: z.boolean(),
  sira: z.number().int(),
  created_at: zaman,
  ekler: z.array(SoruEkSema),
});

export const SoruFotografSema = z.object({
  medya_dosya_id: z.uuid(),
  sira: z.number().int(),
  adres: SoruOkumaAdresiSema.nullable(),
});

export const SoruTahminSema = z.object({
  sure_sn: z
    .number()
    .int()
    .nullable()
    .describe("Hedefin son 30 gündeki ilk cevap sürelerinin medyanı; 3'ten az örnek varsa `null`."),
  ornek_sayisi: z.number().int(),
  hedef_musait: z
    .boolean()
    .nullable()
    .describe(
      '`false`: hedef öğretmen(ler) bugün cevap veremiyorum dedi. Yönetici kuyruğunda `null`.',
    ),
});

export const SoruOzetSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  ogrenci_adi: z.string().nullable(),
  brans_kodu: z.string(),
  konu_id: z.uuid().nullable(),
  baslik: z.string().nullable(),
  metin_onizleme: z.string().nullable(),
  durum: SoruDurumSema,
  yonlendirme: SoruYonlendirmeSema,
  atanan_ogretmen_id: z.uuid().nullable(),
  masa_id: z.uuid().nullable(),
  ustlenen_id: z.uuid().nullable(),
  mesaj_sayisi: z.number().int(),
  created_at: zaman,
  son_hareket_at: zaman,
  ilk_cevap_at: zaman.nullable(),
  cozuldu_at: zaman.nullable(),
});
export type SoruOzet = z.infer<typeof SoruOzetSema>;

export const SoruDetaySema = SoruOzetSema.extend({
  foto_silinme_at: zaman.nullable(),
  yeniden_acilma_sayisi: z.number().int(),
  kalan_takip_hakki: z.number().int(),
  fotograflar: z.array(SoruFotografSema),
  mesajlar: z.array(SoruMesajSema),
  adres_alinamadi: z
    .boolean()
    .describe(
      '`true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner.',
    ),
});
export type SoruDetay = z.infer<typeof SoruDetaySema>;

export const SoruKotaSema = z.object({
  gunluk_limit: z.number().int().nullable(),
  gunluk_kullanilan: z.number().int(),
  gunluk_kalan: z.number().int().nullable().describe('`null`: sınırsız.'),
  gunluk_sifirlanma_at: zaman.describe('Kurumun yerel gününün bitişi (UTC).'),
  aylik_limit: z.number().int().nullable(),
  aylik_kullanilan: z.number().int(),
  aylik_kalan: z.number().int().nullable(),
  aylik_sifirlanma_at: zaman,
});
export type SoruKota = z.infer<typeof SoruKotaSema>;

export const SoruListeSorguSema = z.object({
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  konu_id: z.uuid().optional(),
  durum: SoruDurumSema.optional(),
  q: z.string().trim().min(1).max(100).optional().describe('Türkçe harf duyarsız metin araması.'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(300).optional().describe('Önceki sayfanın `sonraki_imlec` değeri.'),
});

export const SoruListeYanitSema = z.object({
  sorular: z.array(SoruOzetSema),
  sonraki_imlec: z.string().nullable(),
});

// --- Ogrenci ---------------------------------------------------------------------------------

export const SoruIsaretGirdiSema = z.object({
  medya_dosya_id: z.uuid().describe('Düzleştirilmiş görsel (`soru_cizim`).'),
  kaynak_dosya_id: z.uuid().describe('`fotograflar` içindeki fotoğraflardan biri.'),
  cizim_verisi: cizimVerisi.optional(),
});

export const SoruOlusturGirdiSema = z.object({
  brans_kodu: z.string().trim().min(1).max(40),
  konu_id: z.uuid().optional(),
  baslik: z.string().trim().min(1).max(200).optional(),
  metin: metin.optional().describe('"Burada takıldım" notu.'),
  fotograflar: z
    .array(z.uuid())
    .min(1)
    .max(SORU_EN_FAZLA_FOTOGRAF)
    .describe('Medya dosya kimlikleri (`soru_fotografi`, hazır).'),
  isaretler: z.array(SoruIsaretGirdiSema).max(SORU_EN_FAZLA_FOTOGRAF).optional(),
  istek_id: istekId,
});

export const SoruOlusturYanitSema = SoruDetaySema.extend({
  tekrar: z.boolean().describe('`true`: aynı `istek_id` önceki istekle işlendi, kota tüketilmedi.'),
  kota: SoruKotaSema,
  tahmini_cevap: SoruTahminSema,
});

export const SoruTakipGirdiSema = z.object({
  metin,
  ekler: z
    .array(
      z.discriminatedUnion('tur', [
        z.object({ tur: z.literal('fotograf'), medya_dosya_id: z.uuid() }),
        z.object({
          tur: z.literal('cizimli_fotograf'),
          medya_dosya_id: z.uuid(),
          kaynak_dosya_id: z.uuid(),
          cizim_verisi: cizimVerisi.optional(),
        }),
      ]),
    )
    .max(SORU_MESAJ_EN_FAZLA_EK)
    .optional(),
  istek_id: istekId,
});

// --- Ogretmen --------------------------------------------------------------------------------

export const SoruCevapGirdiSema = z.object({
  metin: metin.optional(),
  derste_konusalim: z.boolean().default(false),
  ekler: z.array(SoruEkGirdiSema).max(SORU_MESAJ_EN_FAZLA_EK).optional(),
  istek_id: istekId,
});

export const SoruKuyrukSorguSema = z.object({
  durum: SoruDurumSema.optional().describe(
    'Verilmezse cevap bekleyenler (`acik` ve `takip_bekliyor`).',
  ),
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  ogrenci_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(300).optional(),
});

export const SoruKuyrukSayiYanitSema = z.object({
  bekleyen: z.number().int(),
  branslar: z.array(z.object({ brans_kodu: z.string(), bekleyen: z.number().int() })),
  en_eski_at: zaman.nullable(),
});

export const SoruCevapladiklarimSorguSema = z.object({
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  ogrenci_id: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(300).optional(),
});

export const SoruMusaitlikSema = z.object({
  musait: z.boolean(),
  musait_degil_tarihi: z
    .string()
    .nullable()
    .describe('Kurum yerel günü (YYYY-AA-GG); o gün geçince kendiliğinden geçersiz.'),
});
export const SoruMusaitlikGirdiSema = z.object({ musait: z.boolean() });

// --- Bildirim (uygunsuz icerik) --------------------------------------------------------------

export const SoruBildirimGirdiSema = z.object({
  neden: SoruBildirimNedeniSema,
  aciklama: z.string().trim().min(1).max(500).optional(),
  mesaj_id: z.uuid().optional(),
});

export const SoruBildirimSema = z.object({
  id: z.uuid(),
  soru_id: z.uuid(),
  mesaj_id: z.uuid().nullable(),
  brans_kodu: z.string(),
  bildiren_id: z.uuid(),
  bildiren_adi: z.string().nullable(),
  neden: SoruBildirimNedeniSema,
  aciklama: z.string().nullable(),
  durum: z.enum(['acik', 'kapandi']),
  created_at: zaman,
  kapandi_at: zaman.nullable(),
  kapatma_notu: z.string().nullable(),
});

export const SoruBildirimListeSorguSema = z.object({
  durum: z.enum(['acik', 'kapandi']).default('acik'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(300).optional(),
});
export const SoruBildirimListeYanitSema = z.object({
  bildirimler: z.array(SoruBildirimSema),
  sonraki_imlec: z.string().nullable(),
});
export const SoruBildirimKapatGirdiSema = z.object({
  not: z.string().trim().min(1).max(500).optional(),
});

// --- Yonetim ---------------------------------------------------------------------------------

export const SoruMasasiUyesiSema = z.object({
  ogretmen_id: z.uuid(),
  gorunen_ad: z.string().nullable(),
});

export const SoruMasasiSema = z.object({
  id: z.uuid(),
  brans_kodu: z.string(),
  ad: z.string(),
  aktif: z.boolean(),
  arsivlendi_at: zaman.nullable(),
  uyeler: z.array(SoruMasasiUyesiSema),
  surum: z.number().int(),
  created_at: zaman,
});
export const SoruMasasiOlusturGirdiSema = z.object({
  brans_kodu: z.string().trim().min(1).max(40),
  ad: z.string().trim().min(1).max(100),
  aktif: z.boolean().default(true),
  ogretmen_idleri: z.array(z.uuid()).max(100).optional(),
});
export const SoruMasasiGuncelleGirdiSema = z.object({
  ad: z.string().trim().min(1).max(100).optional(),
  aktif: z.boolean().optional(),
  surum: z.number().int().min(1),
});
export const SoruMasasiUyeGirdiSema = z.object({ ogretmen_id: z.uuid() });
export const SoruMasasiListeYanitSema = z.object({ masalar: z.array(SoruMasasiSema) });

const limit = z.number().int().min(1);
export const SoruAyarlariSema = z.object({
  gunluk_soru_limiti: limit.max(1000).nullable().describe('`null`: sınırsız. Varsayılan 3.'),
  aylik_soru_limiti: limit
    .max(10_000)
    .nullable()
    .describe(
      '`null`: sınırsız (varsayılan). Abonelik plan üst sınırıyla `LEAST` alınır (henüz yok).',
    ),
  soru_basina_takip_limiti: z.number().int().min(0).max(20),
  ses_azami_sn: z.number().int().min(10).max(SORU_SES_EN_FAZLA_SN),
  foto_saklama_gun: z.number().int().min(1).max(365),
  varsayilan: z.boolean().describe('`true`: kurum henüz ayar kaydetmedi, varsayılanlar geçerli.'),
  surum: z.number().int().nullable(),
});
export const SoruAyarlariGuncelleGirdiSema = z.object({
  gunluk_soru_limiti: limit.max(1000).nullable().optional(),
  aylik_soru_limiti: limit.max(10_000).nullable().optional(),
  soru_basina_takip_limiti: z.number().int().min(0).max(20).optional(),
  ses_azami_sn: z.number().int().min(10).max(SORU_SES_EN_FAZLA_SN).optional(),
  foto_saklama_gun: z.number().int().min(1).max(365).optional(),
});

export const SoruYonetimSorguSema = z.object({
  brans_kodu: z.string().trim().min(1).max(40).optional(),
  durum: SoruDurumSema.optional(),
  ogrenci_id: z.uuid().optional(),
  ogretmen_id: z
    .uuid()
    .optional()
    .describe('Yönlendirilen, üstlenen ya da ilk cevaplayan öğretmen.'),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  imlec: z.string().max(300).optional(),
});

export const SoruOlcumSorguSema = z.object({
  baslangic: z.iso.date().optional().describe('Varsayılan: 30 gün önce (kurum yerel günü).'),
  bitis: z.iso.date().optional().describe('Dahil. Varsayılan: bugün.'),
});
const olcumSatiri = {
  soru_sayisi: z.number().int(),
  cevaplanan: z.number().int(),
  anladim: z.number().int().describe('Öğrencinin "anladım" dediği.'),
  anladim_orani: z.number().nullable().describe('anladım / cevaplanan; cevaplanan 0 ise `null`.'),
  ortalama_ilk_cevap_sn: z.number().int().nullable(),
};
export const SoruOlcumSema = z.object({
  baslangic: z.string(),
  bitis: z.string(),
  ...olcumSatiri,
  ogretmenler: z.array(
    z.object({ ogretmen_id: z.uuid(), gorunen_ad: z.string().nullable(), ...olcumSatiri }),
  ),
  branslar: z.array(z.object({ brans_kodu: z.string(), ...olcumSatiri })),
});
