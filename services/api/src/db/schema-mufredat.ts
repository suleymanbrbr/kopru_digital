import {
  bigint,
  index,
  integer,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `ogrenme` semasi, mufredat tablolari (migrations/0009_ogrenme_mufredat.sql). `schema.ts` bunu yeniden
 * disa aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK ve kismi indeksler SQL'dedir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });

export const ogrenme = pgSchema('ogrenme');

export const mufredatSurumleri = ogrenme.table(
  'mufredat_surumleri',
  {
    id: uuid('id').primaryKey(),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    katalog_kodu: text('katalog_kodu').notNull(),
    surum_no: integer('surum_no').notNull(),
    ad: text('ad').notNull(),
    aciklama: text('aciklama'),
    yayinlandi_at: tstz('yayinlandi_at'),
  },
  (t) => [unique('mufredat_surumleri_katalog_kodu_surum_no_uniq').on(t.katalog_kodu, t.surum_no)],
);

export const konular = ogrenme.table(
  'konular',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id'),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    surum: bigint('surum', { mode: 'number' }).notNull().default(1),
    katalog_kodu: text('katalog_kodu'),
    brans_kodu: text('brans_kodu').notNull(),
    ust_id: uuid('ust_id'),
    seviye: text('seviye').notNull(),
    ad: text('ad').notNull(),
    kazanim_kodu: text('kazanim_kodu'),
    sira: integer('sira').notNull().default(0),
    sinif_seviyesi: smallint('sinif_seviyesi'),
    gecerli_surum_baslangic: integer('gecerli_surum_baslangic'),
    gecerli_surum_bitis: integer('gecerli_surum_bitis'),
    yerine_gecen_id: uuid('yerine_gecen_id'),
    arsivlendi_at: tstz('arsivlendi_at'),
  },
  (t) => [index('konular_ust_id_idx').on(t.ust_id)],
);

export const mufredatAtamalari = ogrenme.table(
  'mufredat_atamalari',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id').notNull(),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
    created_by: uuid('created_by'),
    surum: bigint('surum', { mode: 'number' }).notNull().default(1),
    kapsam: text('kapsam').notNull(),
    kapsam_id: uuid('kapsam_id').notNull(),
    katalog_kodu: text('katalog_kodu').notNull(),
    surum_no: integer('surum_no').notNull(),
  },
  (t) => [
    unique('mufredat_atamalari_kapsam_uniq').on(t.kurum_id, t.kapsam, t.kapsam_id, t.katalog_kodu),
  ],
);
