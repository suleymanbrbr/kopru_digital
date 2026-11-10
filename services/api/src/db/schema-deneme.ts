import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { ogrenme } from './schema-mufredat.js';

/**
 * `ogrenme` semasi, deneme tablolari (migrations/0012_ogrenme_deneme.sql). `schema.ts` bunu yeniden disa
 * aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK ve CHECK kisitlari SQL'dedir.
 * `numeric` sutunlar surucu tarafindan string gelir; API'ye cikarken sayiya cevrilir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });

export interface DenemeKuraliBolumu {
  bolum_kodu: string;
  brans_kodu: string;
  ad: string;
  soru_sayisi: number;
}

export const denemeKurallari = ogrenme.table(
  'deneme_kurallari',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id'),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    created_by: uuid('created_by'),
    surum: bigint('surum', { mode: 'number' }).notNull().default(1),
    kod: text('kod').notNull(),
    ad: text('ad').notNull(),
    yanlis_katsayisi: numeric('yanlis_katsayisi', { precision: 5, scale: 4 }).notNull(),
    bolumler: jsonb('bolumler').notNull().$type<DenemeKuraliBolumu[]>(),
    toplam_sure_dk: integer('toplam_sure_dk'),
    gecerli_yil: integer('gecerli_yil'),
    aktif: boolean('aktif').notNull().default(true),
  },
  (t) => [index('deneme_kurallari_kurum_id_aktif_idx').on(t.kurum_id, t.aktif)],
);

export const denemeler = ogrenme.table(
  'denemeler',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id').notNull(),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    created_by: uuid('created_by'),
    surum: bigint('surum', { mode: 'number' }).notNull().default(1),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    kural_id: uuid('kural_id').notNull(),
    kural_kodu: text('kural_kodu').notNull(),
    yanlis_katsayisi: numeric('yanlis_katsayisi', { precision: 5, scale: 4 }).notNull(),
    ad: text('ad').notNull(),
    yayinevi: text('yayinevi'),
    sinav_tarihi: date('sinav_tarihi', { mode: 'string' }).notNull(),
    toplam_net: numeric('toplam_net', { precision: 6, scale: 2 }).notNull().default('0'),
    giren_id: uuid('giren_id').notNull(),
    kaynak: text('kaynak').notNull(),
    sure_dk: integer('sure_dk'),
    not_metni: text('not_metni'),
    onay_durumu: text('onay_durumu').notNull().default('bekliyor'),
    onaylayan_id: uuid('onaylayan_id'),
    onay_at: tstz('onay_at'),
    red_nedeni: text('red_nedeni'),
  },
  (t) => [
    unique('denemeler_kurum_id_id_uniq').on(t.kurum_id, t.id),
    unique('denemeler_tekil_uniq').on(t.ogrenci_id, t.kural_id, t.sinav_tarihi, t.ad),
    index('denemeler_kurum_id_ogrenci_id_sinav_tarihi_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.sinav_tarihi,
    ),
  ],
);

export const denemeBolumleri = ogrenme.table(
  'deneme_bolumleri',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id').notNull(),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    created_by: uuid('created_by'),
    deneme_id: uuid('deneme_id').notNull(),
    bolum_kodu: text('bolum_kodu').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    soru_sayisi: smallint('soru_sayisi').notNull(),
    dogru: smallint('dogru').notNull(),
    yanlis: smallint('yanlis').notNull(),
    bos: smallint('bos').notNull(),
    katsayi: numeric('katsayi', { precision: 5, scale: 4 }).notNull(),
    /** Veritabaninca uretilir: round(dogru - yanlis * katsayi, 2). Uygulama yazmaz, hesaplamaz. */
    net: numeric('net', { precision: 6, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`round(dogru - yanlis * katsayi, 2)`),
  },
  (t) => [
    unique('deneme_bolumleri_deneme_id_bolum_kodu_uniq').on(t.deneme_id, t.bolum_kodu),
    index('deneme_bolumleri_kurum_id_deneme_id_idx').on(t.kurum_id, t.deneme_id),
    index('deneme_bolumleri_kurum_id_brans_kodu_deneme_id_idx').on(
      t.kurum_id,
      t.brans_kodu,
      t.deneme_id,
    ),
  ],
);
