import { z } from 'zod';

/**
 * Duyuru kullanici sozlesmesi (docs/schema/bildirim.md "Duyurular"). Alanlar `snake_case`.
 * Yol onegi: `/v1/bildirim/kurumlar/{kurum_id}/duyurular...`.
 *
 * - Yazar/yonetici: `POST /duyurular` (taslak), `PATCH /duyurular/{id}`, `POST .../yayinla`, `POST .../arsivle`,
 *   `DELETE /duyurular/{id}`, `GET /duyurular/yonetim`, `GET .../okuyanlar`.
 * - Alici: `GET /duyurular` (duyurularim), `GET /duyurular/{id}`, `POST .../okundu`.
 */

export const DUYURU_BASLIK_EN_FAZLA = 200;
export const DUYURU_GOVDE_EN_FAZLA = 4000;
export const DUYURU_LISTE_VARSAYILAN = 50;
export const DUYURU_LISTE_EN_FAZLA = 100;

const zaman = z.iso.datetime({ offset: true });

export const DUYURU_HEDEF_TURLERI = ['grup', 'kademe', 'kurum'] as const;
export const DuyuruHedefTuruSema = z.enum(DUYURU_HEDEF_TURLERI);
export type DuyuruHedefTuru = z.infer<typeof DuyuruHedefTuruSema>;

/** Faz 1: alici roller yalniz ogrenci ve ogretmen (veli arayuzu yok). */
export const DUYURU_ALICI_ROLLERI = ['ogrenci', 'ogretmen'] as const;
export const DuyuruAliciRolSema = z.enum(DUYURU_ALICI_ROLLERI);
export type DuyuruAliciRol = z.infer<typeof DuyuruAliciRolSema>;

export const DUYURU_DURUMLARI = ['taslak', 'yayinda', 'arsiv'] as const;
export const DuyuruDurumSema = z.enum(DUYURU_DURUMLARI);
export type DuyuruDurum = z.infer<typeof DuyuruDurumSema>;

export const duyuruKurumYolParamSema = z.object({ kurum_id: z.uuid() });
export const duyuruYolParamSema = z.object({ kurum_id: z.uuid(), duyuru_id: z.uuid() });

const baslik = z.string().trim().min(1).max(DUYURU_BASLIK_EN_FAZLA);
const govde = z.string().trim().min(1).max(DUYURU_GOVDE_EN_FAZLA);
const roller = z
  .array(DuyuruAliciRolSema)
  .min(1)
  .max(DUYURU_ALICI_ROLLERI.length)
  .refine((r) => new Set(r).size === r.length, 'Roller yinelenemez');

export const DuyuruOlusturSema = z
  .object({
    baslik,
    govde,
    hedef_turu: DuyuruHedefTuruSema,
    /** `grup` ve `kademe` icin zorunlu; `kurum` icin verilmezse kurum kimligi, verilirse ona esit olmali. */
    hedef_id: z.uuid().optional(),
    hedef_roller: roller.default(['ogrenci']),
    sabit: z.boolean().default(false),
    bitis_at: zaman.nullable().optional(),
    /** `false`: yalniz kutu bildirimi (push yok). */
    push_gonderildi: z.boolean().default(true),
  })
  .refine((v) => v.hedef_turu === 'kurum' || v.hedef_id !== undefined, {
    message: 'hedef_id grup ve kademe hedeflerinde zorunlu',
    path: ['hedef_id'],
  });
export type DuyuruOlustur = z.input<typeof DuyuruOlusturSema>;

/** Taslakta tum alanlar; yayindaki duyuruda yalniz `sabit` ve `bitis_at` degisir. */
export const DuyuruGuncelleSema = z
  .object({
    baslik: baslik.optional(),
    govde: govde.optional(),
    hedef_turu: DuyuruHedefTuruSema.optional(),
    hedef_id: z.uuid().optional(),
    hedef_roller: roller.optional(),
    sabit: z.boolean().optional(),
    bitis_at: zaman.nullable().optional(),
    push_gonderildi: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'En az bir alan verilmeli' });
export type DuyuruGuncelle = z.infer<typeof DuyuruGuncelleSema>;

/** Yazar/yonetici gorunumu (alici ve okunma sayilari dahil). */
export const DuyuruSema = z.object({
  id: z.uuid(),
  baslik: z.string(),
  govde: z.string(),
  hedef_turu: DuyuruHedefTuruSema,
  hedef_id: z.uuid(),
  hedef_roller: z.array(DuyuruAliciRolSema),
  yazar_id: z.uuid(),
  durum: DuyuruDurumSema,
  yayin_at: zaman.nullable(),
  bitis_at: zaman.nullable(),
  sabit: z.boolean(),
  push_gonderildi: z.boolean(),
  alici_sayisi: z.number().int().min(0),
  okunan_sayisi: z.number().int().min(0),
  /** `false`: alici kutusu bildirimleri henuz dagitiliyor (buyuk hedefler). */
  dagitim_tamam: z.boolean(),
  created_at: zaman,
  updated_at: zaman,
});
export type Duyuru = z.infer<typeof DuyuruSema>;

export const DuyuruYonetimSorguSema = z.object({
  durum: DuyuruDurumSema.optional(),
  limit: z.coerce.number().int().min(1).max(DUYURU_LISTE_EN_FAZLA).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export const DuyuruYonetimListesiSema = z.object({
  ogeler: z.array(DuyuruSema),
  toplam: z.number().int().min(0),
});

/** Alici gorunumu: sayac yok. */
export const DuyuruAliciOgesiSema = z.object({
  id: z.uuid(),
  baslik: z.string(),
  govde: z.string(),
  hedef_turu: DuyuruHedefTuruSema,
  hedef_id: z.uuid(),
  yazar_id: z.uuid(),
  sabit: z.boolean(),
  yayin_at: zaman,
  bitis_at: zaman.nullable(),
  okundu_at: zaman.nullable(),
});
export type DuyuruAliciOgesi = z.infer<typeof DuyuruAliciOgesiSema>;

export const DuyuruAliciSorguSema = z.object({
  /** `true`: yalniz okunmamislar. */
  okunmamis: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(DUYURU_LISTE_EN_FAZLA).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export const DuyuruAliciListesiSema = z.object({
  ogeler: z.array(DuyuruAliciOgesiSema),
  toplam: z.number().int().min(0),
});

/** Tekil gorunum: alici alanlari; yazar/yonetici icin `yonetim` blogu da dolar (alicida `null`). */
export const DuyuruDetaySema = DuyuruAliciOgesiSema.extend({
  /** Taslak duyuruda `null` (yalniz yazar/yonetici gorur). */
  yayin_at: zaman.nullable(),
  yonetim: DuyuruSema.nullable(),
});
export type DuyuruDetay = z.infer<typeof DuyuruDetaySema>;

export const DuyuruOkunduYanitiSema = z.object({
  duyuru_id: z.uuid(),
  okundu_at: zaman,
});

export const DuyuruSilYanitiSema = z.object({ id: z.uuid(), silindi: z.literal(true) });

export const DuyuruOkuyanlarSorguSema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

/** Okuyanlar: yalniz uyelik kimlikleri; adlar istemcide api'den cozulur. */
export const DuyuruOkuyanlarSema = z.object({
  okuyanlar: z.array(z.object({ alici_id: z.uuid(), okundu_at: zaman })),
  okunan_sayisi: z.number().int().min(0),
  alici_sayisi: z.number().int().min(0),
});
