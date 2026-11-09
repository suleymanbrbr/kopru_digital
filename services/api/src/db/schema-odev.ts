import {
  bigint,
  boolean,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { ogrenme } from './schema-mufredat.js';

/**
 * `ogrenme` semasi, odev tablolari (migrations/0010_ogrenme_odev.sql). `schema.ts` bunu yeniden disa
 * aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK ve CHECK kisitlari SQL'dedir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });

const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  created_by: uuid('created_by'),
});
const surumlu = () => ({ surum: bigint('surum', { mode: 'number' }).notNull().default(1) });

export const odevler = ogrenme.table(
  'odevler',
  {
    ...kiraci(),
    ...surumlu(),
    baslik: text('baslik').notNull(),
    aciklama: text('aciklama'),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    tur: text('tur').notNull().default('soru'),
    kaynak: text('kaynak'),
    hedef_turu: text('hedef_turu').notNull(),
    hedef_id: uuid('hedef_id').notNull(),
    veren_id: uuid('veren_id').notNull(),
    son_teslim_at: tstz('son_teslim_at'),
    hedef_soru_sayisi: integer('hedef_soru_sayisi'),
    fotograf_gerekli: boolean('fotograf_gerekli').notNull().default(false),
    durum: text('durum').notNull().default('taslak'),
    yayin_at: tstz('yayin_at'),
    fan_out_durum: text('fan_out_durum').notNull().default('bekliyor'),
    atanan_sayisi: integer('atanan_sayisi').notNull().default(0),
  },
  (t) => [
    index('odevler_kurum_id_veren_id_created_at_idx').on(t.kurum_id, t.veren_id, t.created_at),
    index('odevler_kurum_id_hedef_turu_hedef_id_durum_idx').on(
      t.kurum_id,
      t.hedef_turu,
      t.hedef_id,
      t.durum,
    ),
    index('odevler_kurum_id_durum_son_teslim_at_idx').on(t.kurum_id, t.durum, t.son_teslim_at),
  ],
);

export const ogrenciOdevleri = ogrenme.table(
  'ogrenci_odevleri',
  {
    ...kiraci(),
    ...surumlu(),
    odev_id: uuid('odev_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    durum: text('durum').notNull().default('atandi'),
    son_teslim_at: tstz('son_teslim_at'),
    yapilan_soru_sayisi: integer('yapilan_soru_sayisi'),
    dogru_sayisi: integer('dogru_sayisi'),
    yanlis_sayisi: integer('yanlis_sayisi'),
    bos_sayisi: integer('bos_sayisi'),
    ogrenci_notu: text('ogrenci_notu'),
    teslim_at: tstz('teslim_at'),
    gec_teslim: boolean('gec_teslim').notNull().default(false),
    inceleme_sonucu: text('inceleme_sonucu'),
    inceleme_notu: text('inceleme_notu'),
    inceleyen_id: uuid('inceleyen_id'),
    incelendi_at: tstz('incelendi_at'),
  },
  (t) => [
    unique('ogrenci_odevleri_odev_id_ogrenci_id_uniq').on(t.odev_id, t.ogrenci_id),
    index('ogrenci_odevleri_kurum_id_ogrenci_id_durum_son_teslim_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.durum,
      t.son_teslim_at,
    ),
    index('ogrenci_odevleri_kurum_id_odev_id_durum_idx').on(t.kurum_id, t.odev_id, t.durum),
  ],
);

export const odevSablonlari = ogrenme.table(
  'odev_sablonlari',
  {
    ...kiraci(),
    ogretmen_id: uuid('ogretmen_id').notNull(),
    baslik: text('baslik').notNull(),
    aciklama: text('aciklama'),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    tur: text('tur').notNull().default('soru'),
    kaynak: text('kaynak'),
    hedef_soru_sayisi: integer('hedef_soru_sayisi'),
  },
  (t) => [
    index('odev_sablonlari_kurum_id_ogretmen_id_created_at_idx').on(
      t.kurum_id,
      t.ogretmen_id,
      t.created_at,
    ),
  ],
);
