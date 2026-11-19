import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
 * `ogrenme` semasi, gunluk soru takibi tablolari (migrations/0022_ogrenme_gunluk_soru.sql). `schema.ts` bunu
 * yeniden disa aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK ve CHECK kisitlari
 * SQL'dedir.
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

export const kaynakKitaplar = ogrenme.table(
  'kaynak_kitaplar',
  {
    ...kiraci(),
    ...surumlu(),
    ad: text('ad').notNull(),
    yayinevi: text('yayinevi'),
    brans_kodu: text('brans_kodu').notNull(),
    kademe_id: uuid('kademe_id'),
    sahip_uyelik_id: uuid('sahip_uyelik_id'),
    aktif: boolean('aktif').notNull().default(true),
  },
  (t) => [
    index('kaynak_kitaplar_kurum_id_brans_kodu_aktif_idx').on(t.kurum_id, t.brans_kodu, t.aktif),
  ],
);

export const kaynakKitapTestleri = ogrenme.table(
  'kaynak_kitap_testleri',
  {
    ...kiraci(),
    kitap_id: uuid('kitap_id').notNull(),
    sira: integer('sira').notNull(),
    ad: text('ad').notNull(),
    soru_sayisi: integer('soru_sayisi').notNull(),
    konu_id: uuid('konu_id'),
  },
  (t) => [
    unique('kaynak_kitap_testleri_kitap_id_sira_uniq').on(t.kitap_id, t.sira),
    index('kaynak_kitap_testleri_kurum_id_kitap_id_sira_idx').on(t.kurum_id, t.kitap_id, t.sira),
  ],
);

export const gunlukSoruKayitlari = ogrenme.table(
  'gunluk_soru_kayitlari',
  {
    ...kiraci(),
    ...surumlu(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    gun: date('gun', { mode: 'string' }).notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id').notNull(),
    zorluk: text('zorluk').notNull(),
    kaynak_test_id: uuid('kaynak_test_id'),
    kaynak_metin: text('kaynak_metin'),
    dogru: integer('dogru').notNull().default(0),
    yanlis: integer('yanlis').notNull().default(0),
    bos: integer('bos').notNull().default(0),
    toplam: integer('toplam')
      .notNull()
      .generatedAlwaysAs(sql`dogru + yanlis + bos`),
    plan_gorev_id: uuid('plan_gorev_id'),
    istek_id: uuid('istek_id'),
  },
  (t) => [
    uniqueIndex('gunluk_soru_kayitlari_istek_id_uniq').on(t.kurum_id, t.ogrenci_id, t.istek_id),
    index('gunluk_soru_kayitlari_ogrenci_brans_gun_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.brans_kodu,
      t.gun,
    ),
    index('gunluk_soru_kayitlari_brans_gun_idx').on(t.kurum_id, t.brans_kodu, t.gun),
    index('gunluk_soru_kayitlari_ogrenci_created_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.created_at,
    ),
    index('gunluk_soru_kayitlari_plan_gorev_id_idx').on(t.kurum_id, t.plan_gorev_id),
  ],
);

export const gunlukSoruDosyalari = ogrenme.table(
  'gunluk_soru_dosyalari',
  {
    ...kiraci(),
    kayit_id: uuid('kayit_id').notNull(),
    medya_dosya_id: uuid('medya_dosya_id').notNull(),
    sira: smallint('sira').notNull().default(0),
  },
  (t) => [
    unique('gunluk_soru_dosyalari_medya_dosya_id_uniq').on(t.medya_dosya_id),
    unique('gunluk_soru_dosyalari_kayit_id_sira_uniq').on(t.kayit_id, t.sira),
    index('gunluk_soru_dosyalari_kurum_id_kayit_id_idx').on(t.kurum_id, t.kayit_id),
  ],
);
