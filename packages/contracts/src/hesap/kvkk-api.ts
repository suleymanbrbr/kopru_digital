import { z } from 'zod';

/**
 * KVKK hesap silme ve kisisel veri disa aktarma HTTP sozlesmeleri (docs/schema/kvkk-silme.md).
 */

export const SILME_SOGUMA_GUN = 30;

export const SilmeDogrulamaSema = z.discriminatedUnion('yontem', [
  z.object({
    yontem: z.literal('otp'),
    kod: z.string().regex(/^[0-9]{6}$/, 'Kod 6 haneli olmalı.'),
  }),
  z.object({ yontem: z.literal('parola'), parola: z.string().min(1).max(128) }),
]);
export type SilmeDogrulama = z.infer<typeof SilmeDogrulamaSema>;

export const SilmeTalebiGirdiSema = z.object({
  dogrulama: SilmeDogrulamaSema,
  kaynak: z.enum(['web', 'ios', 'android']).default('web'),
});

export const SilmeTalebiSema = z.object({
  id: z.uuid(),
  durum: z.enum(['beklemede', 'geri_alindi', 'tamamlandi', 'engellendi']),
  talep_at: z.iso.datetime({ offset: true }),
  planlanan_at: z.iso.datetime({ offset: true }),
  geri_alindi_at: z.iso.datetime({ offset: true }).nullable(),
  tamamlandi_at: z.iso.datetime({ offset: true }).nullable(),
});

export const SilmeKurumEngeliSema = z.object({
  kurum_id: z.uuid(),
  kurum_ad: z.string(),
  diger_uye_sayisi: z.number().int(),
});

export const SilmeDurumYanitSema = z.object({
  talep: SilmeTalebiSema.nullable(),
  soguma_gun: z.number().int(),
  /** Bugun talep edilirse engel olusturacak kurumlar (kurumun baska sahibi yok ve baska uye var). */
  engeller: z.array(SilmeKurumEngeliSema),
  /** Dogrulama yontemleri: telefonu varsa `otp`, parolasi varsa `parola`. */
  dogrulama_yontemleri: z.array(z.enum(['otp', 'parola'])),
});
export type SilmeDurumYanit = z.infer<typeof SilmeDurumYanitSema>;

export const SilmeTalebiYanitSema = z.object({ talep: SilmeTalebiSema });
export const SilmeKoduGonderYanitSema = z.object({
  gonderildi: z.literal(true),
  gecerlilik_sn: z.number().int(),
});
export const SilmeGeriAlYanitSema = z.object({ talep: SilmeTalebiSema });

// --- Kisisel veri disa aktarma --------------------------------------------------------------

const kayit = z.record(z.string(), z.unknown());

/**
 * Her servisin `POST /ic/kvkk/veri` ucu (servis JWT, `scope=kvkk.veri`). `api` kullanicinin her kurumu icin
 * ayri cagirir; servis kurum baglaminda (RLS, uygulama rolu) yalniz o kullanicinin verisini doner.
 */
export const KVKK_VERI_SCOPE = 'kvkk.veri';
export const KullaniciVeriIstegiSema = z.object({
  kurum_id: z.uuid(),
  kullanici_id: z.uuid(),
  /** Kullanicinin bu kurumdaki uyelik kimlikleri (`api` verir). */
  uyelik_idleri: z.array(z.uuid()).max(10),
});
export const KullaniciVeriYanitSema = z.object({
  servis: z.enum(['motivasyon', 'bildirim', 'medya']),
  /** Tablo/bolum adi -> kayitlar. Yalniz istenen kullaniciya ait veri. */
  bolumler: z.record(z.string(), z.array(kayit)),
});
export type KullaniciVeriYanit = z.infer<typeof KullaniciVeriYanitSema>;

export const VerilerimYanitSema = z.object({
  olusturuldu_at: z.iso.datetime({ offset: true }),
  kullanici_id: z.uuid(),
  hesap: kayit,
  /** Bolum adi -> kayitlar (uyelikler, rizalar, yoklama, odev, soru, deneme, finans ozeti ...). */
  bolumler: z.record(z.string(), z.array(kayit)),
  /** Diger servislerin verisi; ulasilamayanlar `eksik_servisler`te. */
  servisler: z.record(z.string(), z.record(z.string(), z.array(kayit))),
  eksik_servisler: z.array(z.string()),
});
export type VerilerimYanit = z.infer<typeof VerilerimYanitSema>;

// --- Profil guncelleme (`hesap.kullanici.degisti.v1` tetikler) -------------------------------

export const BenGuncelleGirdiSema = z
  .object({
    gorunen_ad: z.string().trim().min(1).max(100).optional(),
    dil: z.enum(['tr']).optional(),
  })
  .refine((g) => g.gorunen_ad !== undefined || g.dil !== undefined, 'En az bir alan verilmeli.');
export const BenGuncelleYanitSema = z.object({
  gorunen_ad: z.string().nullable(),
  dil: z.string(),
  degisen_alanlar: z.array(z.enum(['gorunen_ad', 'dil'])),
});
