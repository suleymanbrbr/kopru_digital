import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `finans` semasi (migrations/0007_finans.sql, docs/schema/api.md `finans`). Sutun anahtarlari veritabani
 * sutun adlariyla aynidir (ADR 0006). Defter tablolari (`kredi_hareketleri`, `bakiye_hareketleri`)
 * yalnizca ekleme alir: uygulama rolunden UPDATE/DELETE geri alinmistir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });
const olusturma = () => tstz('created_at').notNull().defaultNow();
const guncelleme = () => tstz('updated_at').notNull().defaultNow();
const kurus = (ad: string) => bigint(ad, { mode: 'number' });

export const finans = pgSchema('finans');

/** Standart (KS) kiraci tablosu sutunlari. */
const ks = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  created_by: uuid('created_by'),
  surum: bigint('surum', { mode: 'number' }).notNull().default(1),
});

/** Defter (D) tablosu sutunlari. */
const defter = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: olusturma(),
  created_by: uuid('created_by'),
});

export const krediPolitikalari = finans.table('kredi_politikalari', {
  ...ks(),
  geldi_dusurur: boolean('geldi_dusurur').notNull().default(true),
  gec_dusurur: boolean('gec_dusurur').notNull().default(true),
  gelmedi_dusurur: boolean('gelmedi_dusurur').notNull().default(true),
  izinli_dusurur: boolean('izinli_dusurur').notNull().default(false),
  ogrenci_gec_iptal_dusurur: boolean('ogrenci_gec_iptal_dusurur').notNull().default(true),
  gec_iptal_saat: smallint('gec_iptal_saat').notNull().default(24),
  dusuk_kredi_esigi: smallint('dusuk_kredi_esigi').notNull().default(2),
});

export const ogrenciFinansProfilleri = finans.table('ogrenci_finans_profilleri', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  model: text('model').notNull().default('paket'),
  odeyen_ad: text('odeyen_ad'),
  odeyen_telefon: text('odeyen_telefon'),
});

export const paketler = finans.table('paketler', {
  ...ks(),
  ad: text('ad').notNull(),
  kredi_adedi: integer('kredi_adedi').notNull(),
  fiyat_kurus: kurus('fiyat_kurus').notNull(),
  kredi_politikasi: jsonb('kredi_politikasi'),
  gecerlilik_gun: integer('gecerlilik_gun'),
  grup_turu: text('grup_turu'),
  brans_kodu: text('brans_kodu'),
  aktif: boolean('aktif').notNull().default(true),
  arsivlendi_at: tstz('arsivlendi_at'),
});

export const paketSatislari = finans.table('paket_satislari', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  paket_id: uuid('paket_id'),
  ad: text('ad').notNull(),
  toplam_kredi: integer('toplam_kredi').notNull(),
  fiyat_kurus: kurus('fiyat_kurus').notNull(),
  baslangic_tarihi: date('baslangic_tarihi', { mode: 'string' }).notNull(),
  bitis_tarihi: date('bitis_tarihi', { mode: 'string' }),
  durum: text('durum').notNull().default('aktif'),
  satan_id: uuid('satan_id').notNull(),
  iptal_at: tstz('iptal_at'),
});

export const krediHareketleri = finans.table('kredi_hareketleri', {
  ...defter(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  paket_satisi_id: uuid('paket_satisi_id'),
  tur: text('tur').notNull(),
  miktar: integer('miktar').notNull(),
  ders_id: uuid('ders_id'),
  yoklama_id: uuid('yoklama_id'),
  yoklama_surumu: bigint('yoklama_surumu', { mode: 'number' }),
  ters_cevrilen_id: uuid('ters_cevrilen_id'),
  neden: text('neden'),
});

export const krediBakiyeleri = finans.table('kredi_bakiyeleri', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  bakiye: integer('bakiye').notNull().default(0),
});

export const ucretTarifeleri = finans.table('ucret_tarifeleri', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id'),
  grup_id: uuid('grup_id'),
  brans_kodu: text('brans_kodu'),
  ucret_kurus: kurus('ucret_kurus').notNull(),
  gecerlilik_baslangic: date('gecerlilik_baslangic', { mode: 'string' }).notNull(),
  gecerlilik_bitis: date('gecerlilik_bitis', { mode: 'string' }),
});

export const tahsilatlar = finans.table('tahsilatlar', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  tutar_kurus: kurus('tutar_kurus').notNull(),
  yontem: text('yontem').notNull(),
  tahsilat_tarihi: date('tahsilat_tarihi', { mode: 'string' }).notNull(),
  makbuz_no: text('makbuz_no'),
  paket_satisi_id: uuid('paket_satisi_id'),
  aciklama: text('aciklama'),
  alan_id: uuid('alan_id').notNull(),
  durum: text('durum').notNull().default('gecerli'),
  iptal_at: tstz('iptal_at'),
  iptal_nedeni: text('iptal_nedeni'),
  istek_id: uuid('istek_id'),
});

export const bakiyeHareketleri = finans.table('bakiye_hareketleri', {
  ...defter(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  tur: text('tur').notNull(),
  tutar_kurus: kurus('tutar_kurus').notNull(),
  para_birimi: text('para_birimi').notNull().default('TRY'),
  kaynak_turu: text('kaynak_turu').notNull(),
  kaynak_id: uuid('kaynak_id'),
  ders_id: uuid('ders_id'),
  yoklama_id: uuid('yoklama_id'),
  yoklama_surumu: bigint('yoklama_surumu', { mode: 'number' }),
  ters_cevrilen_id: uuid('ters_cevrilen_id'),
  neden: text('neden'),
});

export const ogrenciBakiyeleri = finans.table('ogrenci_bakiyeleri', {
  ...ks(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  bakiye_kurus: kurus('bakiye_kurus').notNull().default(0),
});
