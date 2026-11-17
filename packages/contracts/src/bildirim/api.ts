import { z } from 'zod';

/**
 * `bildirim` servisinin kullaniciya acik sozlesmesi (docs/schema/bildirim.md). Alanlar `snake_case`.
 * Gelistirmede bildirim ayri portta calisir (4002); canlida istemciler ayni alan adindan
 * `/v1/bildirim/*` ile ulasir.
 *
 * - Cihaz (kullanici duzeyi): `PUT /v1/bildirim/cihazlar`, `DELETE /v1/bildirim/cihazlar/{cihaz_kimligi}`.
 * - Gelen kutusu (kurum baglami, alici = istegi yapanin o kurumdaki uyeligi):
 *   `/v1/bildirim/kurumlar/{kurum_id}/kutu...`.
 * - Tercihler ve ayarlar: `/v1/bildirim/kurumlar/{kurum_id}/tercihler` ve `.../ayarlar`.
 */

export const BILDIRIM_KATEGORILERI = [
  'ders',
  'yoklama',
  'odev',
  'soru',
  'kayit',
  'duyuru',
  'finans',
  'oyunlastirma',
  'abonelik',
  'sistem',
] as const;
export const BildirimKategoriSema = z.enum(BILDIRIM_KATEGORILERI);
export type BildirimKategori = z.infer<typeof BildirimKategoriSema>;

export const BILDIRIM_KANALLARI = ['kutu', 'push', 'eposta', 'sms'] as const;
export const BildirimKanalSema = z.enum(BILDIRIM_KANALLARI);
export type BildirimKanal = z.infer<typeof BildirimKanalSema>;

export const BILDIRIM_DERS_HATIRLATMA_DK = [0, 15, 30, 60, 120, 1440] as const;

const zaman = z.iso.datetime({ offset: true });
const saat = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM biçiminde olmalı');

export const bildirimKurumYolParamSema = z.object({ kurum_id: z.uuid() });
export const bildirimKutuOgeYolParamSema = z.object({ kurum_id: z.uuid(), bildirim_id: z.uuid() });
export const bildirimCihazYolParamSema = z.object({
  cihaz_kimligi: z.string().min(1).max(200),
});

// --- Cihaz -----------------------------------------------------------------------------------

export const BildirimCihazKayitSema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  /** Expo push belirteci (`ExponentPushToken[...]`). */
  push_belirteci: z.string().min(1).max(500),
  /** Uygulamanin urettigi kalici cihaz kimligi. */
  cihaz_kimligi: z.string().min(1).max(200),
  uygulama_surumu: z.string().max(50).optional(),
  dil: z.string().min(2).max(10).optional(),
});
export type BildirimCihazKayit = z.infer<typeof BildirimCihazKayitSema>;

export const BildirimCihazYanitiSema = z.object({
  cihaz_kimligi: z.string(),
  aktif: z.boolean(),
});

// --- Gelen kutusu ----------------------------------------------------------------------------

export const BILDIRIM_KUTU_SAYFA_VARSAYILAN = 20;
export const BILDIRIM_KUTU_SAYFA_EN_FAZLA = 50;

export const BildirimKutuSorguSema = z.object({
  /** `true`: yalniz okunmamislar. */
  okunmamis: z.enum(['true', 'false']).optional(),
  /** Onceki yanittaki `sonraki_imlec`. */
  imlec: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(BILDIRIM_KUTU_SAYFA_EN_FAZLA).optional(),
});

export const BildirimKutuOgesiSema = z.object({
  id: z.uuid(),
  kategori: BildirimKategoriSema,
  sablon_kodu: z.string(),
  baslik: z.string(),
  govde: z.string(),
  /** Uygulama ici hedef, ornek `kopru://soru/<id>`. */
  derin_baglanti: z.string().nullable(),
  /** Nesne kimlikleri. */
  veri: z.record(z.string(), z.unknown()),
  okundu_at: zaman.nullable(),
  gecerlilik_bitis_at: zaman.nullable(),
  created_at: zaman,
});
export type BildirimKutuOgesi = z.infer<typeof BildirimKutuOgesiSema>;

export const BildirimKutuListesiSema = z.object({
  ogeler: z.array(BildirimKutuOgesiSema),
  /** Sonraki sayfa yoksa `null`. */
  sonraki_imlec: z.string().nullable(),
});

/** `okundu` / `arsivle` sonucu: bildirimin guncel durumu. */
export const BildirimKutuIslemYanitiSema = z.object({
  id: z.uuid(),
  okundu_at: zaman.nullable(),
  arsivlendi_at: zaman.nullable(),
});

export const BildirimOkunmamisSayisiSema = z.object({ okunmamis: z.number().int().min(0) });
export const BildirimTumunuOkuYanitiSema = z.object({ guncellenen: z.number().int().min(0) });

// --- Tercihler ve ayarlar --------------------------------------------------------------------

export const BildirimTercihSema = z.object({
  kategori: BildirimKategoriSema,
  kanal: BildirimKanalSema,
  acik: z.boolean(),
  /** `true`: degistirilemez (`sistem` kategorisi, `kutu` kanali). */
  kilitli: z.boolean(),
});

export const BildirimTercihListesiSema = z.object({ tercihler: z.array(BildirimTercihSema) });

export const BildirimTercihGuncelleSema = z.object({
  tercihler: z
    .array(
      z.object({ kategori: BildirimKategoriSema, kanal: BildirimKanalSema, acik: z.boolean() }),
    )
    .min(1)
    .max(40),
});

export const BildirimAyarlariSema = z.object({
  /** Sessiz saat baslangici (yerel saat, `HH:MM`). Varsayilan `22:00`. */
  sessiz_baslangic: saat,
  /** Gece yarisini asabilir. Varsayilan `08:00`. */
  sessiz_bitis: saat,
  /** ISO gun numaralari (1 Pazartesi ... 7 Pazar); sessiz araligin BASLADIGI gun. Bos dizi: sessiz saat kapali. */
  sessiz_gunler: z.array(z.number().int().min(1).max(7)).max(7),
  saat_dilimi: z.string(),
  /** Ders oncesi hatirlatma (dk); 0 kapali. */
  ders_hatirlatma_dk: z.union([
    z.literal(0),
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(120),
    z.literal(1440),
  ]),
});
export type BildirimAyarlari = z.infer<typeof BildirimAyarlariSema>;

export const BildirimAyarlariGuncelleSema = BildirimAyarlariSema.partial().refine(
  (v) => (v.sessiz_baslangic === undefined) === (v.sessiz_bitis === undefined),
  { message: 'sessiz_baslangic ve sessiz_bitis birlikte verilmeli' },
);
