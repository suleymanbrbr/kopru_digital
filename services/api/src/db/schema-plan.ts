import {
  bigint,
  date,
  index,
  integer,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { ogrenme } from './schema-mufredat.js';

/**
 * `ogrenme` semasi, haftalik plan tablolari (migrations/0011_ogrenme_plan.sql). `schema.ts` bunu yeniden
 * disa aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK ve CHECK kisitlari SQL'dedir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });
const tarih = (ad: string) => date(ad, { mode: 'string' });

const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  created_by: uuid('created_by'),
});
const surumlu = () => ({ surum: bigint('surum', { mode: 'number' }).notNull().default(1) });

export const haftalikPlanlar = ogrenme.table(
  'haftalik_planlar',
  {
    ...kiraci(),
    ...surumlu(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    hafta_baslangic: tarih('hafta_baslangic').notNull(),
    hazirlayan_id: uuid('hazirlayan_id').notNull(),
    durum: text('durum').notNull().default('taslak'),
    yayin_at: tstz('yayin_at'),
    not: text('not'),
  },
  (t) => [
    unique('haftalik_planlar_ogrenci_hafta_uniq').on(t.kurum_id, t.ogrenci_id, t.hafta_baslangic),
    index('haftalik_planlar_kurum_id_ogrenci_id_hafta_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.hafta_baslangic,
    ),
  ],
);

export const planGorevleri = ogrenme.table(
  'plan_gorevleri',
  {
    ...kiraci(),
    ...surumlu(),
    plan_id: uuid('plan_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    hafta_baslangic: tarih('hafta_baslangic').notNull(),
    gun: tarih('gun').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    baslik: text('baslik'),
    hedef_turu: text('hedef_turu').notNull(),
    hedef_miktar: integer('hedef_miktar').notNull(),
    gerceklesen_miktar: integer('gerceklesen_miktar'),
    durum: text('durum').notNull().default('bekliyor'),
    tamamlandi_at: tstz('tamamlandi_at'),
    devreden_gorev_id: uuid('devreden_gorev_id'),
    sira: smallint('sira').notNull().default(0),
    ekleyen_id: uuid('ekleyen_id').notNull(),
  },
  (t) => [
    uniqueIndex('plan_gorevleri_devreden_gorev_id_uniq').on(t.devreden_gorev_id),
    index('plan_gorevleri_kurum_id_ogrenci_id_hafta_gun_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.hafta_baslangic,
      t.gun,
    ),
    index('plan_gorevleri_plan_id_sira_idx').on(t.plan_id, t.sira),
  ],
);

export const planSablonlari = ogrenme.table(
  'plan_sablonlari',
  {
    ...kiraci(),
    ogretmen_id: uuid('ogretmen_id').notNull(),
    ad: text('ad').notNull(),
    aciklama: text('aciklama'),
  },
  (t) => [
    index('plan_sablonlari_kurum_id_ogretmen_id_created_at_idx').on(
      t.kurum_id,
      t.ogretmen_id,
      t.created_at,
    ),
  ],
);

export const planSablonGorevleri = ogrenme.table(
  'plan_sablon_gorevleri',
  {
    ...kiraci(),
    sablon_id: uuid('sablon_id').notNull(),
    gun_sirasi: smallint('gun_sirasi').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    baslik: text('baslik'),
    hedef_turu: text('hedef_turu').notNull(),
    hedef_miktar: integer('hedef_miktar').notNull(),
    sira: smallint('sira').notNull().default(0),
  },
  (t) => [
    index('plan_sablon_gorevleri_kurum_id_sablon_id_idx').on(
      t.kurum_id,
      t.sablon_id,
      t.gun_sirasi,
      t.sira,
    ),
  ],
);
