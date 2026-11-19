import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `abonelik` semasi (migrations/0015_abonelik.sql). `schema.ts` bunu yeniden disa aktarir; sutun anahtarlari
 * veritabani adlariyla aynidir (ADR 0006). FK, CHECK ve kismi benzersiz indeksler SQL'dedir.
 */

export const abonelik = pgSchema('abonelik');

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });

const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  created_by: uuid('created_by'),
});
const surumlu = () => ({ surum: bigint('surum', { mode: 'number' }).notNull().default(1) });

export const planlar = abonelik.table('planlar', {
  id: uuid('id').primaryKey(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  kod: text('kod').notNull(),
  surum: integer('surum').notNull().default(1),
  ad: text('ad').notNull(),
  kurum_turu: text('kurum_turu').notNull(),
  aylik_fiyat_kurus: bigint('aylik_fiyat_kurus', { mode: 'number' }).notNull(),
  yillik_fiyat_kurus: bigint('yillik_fiyat_kurus', { mode: 'number' }),
  kdv_orani: smallint('kdv_orani').notNull().default(20),
  limitler: jsonb('limitler').notNull(),
  moduller: text('moduller').array().notNull(),
  magaza_urun_kodlari: jsonb('magaza_urun_kodlari'),
  aktif: boolean('aktif').notNull().default(true),
});

export const abonelikler = abonelik.table(
  'abonelikler',
  {
    ...kiraci(),
    ...surumlu(),
    plan_id: uuid('plan_id').notNull(),
    kaynak: text('kaynak').notNull(),
    durum: text('durum').notNull(),
    periyot: text('periyot').notNull().default('aylik'),
    donem_baslangic_at: tstz('donem_baslangic_at').notNull(),
    donem_bitis_at: tstz('donem_bitis_at').notNull(),
    deneme_bitis_at: tstz('deneme_bitis_at'),
    ek_sure_bitis_at: tstz('ek_sure_bitis_at'),
    otomatik_yenileme: boolean('otomatik_yenileme').notNull().default(true),
    iptal_istendi_at: tstz('iptal_istendi_at'),
    dis_abonelik_id: text('dis_abonelik_id'),
    dis_musteri_id: text('dis_musteri_id'),
    fiyat_kurus: bigint('fiyat_kurus', { mode: 'number' }).notNull(),
    kurumsal_sozlesme_no: text('kurumsal_sozlesme_no'),
    bekleyen_plan_id: uuid('bekleyen_plan_id'),
    bekleyen_periyot: text('bekleyen_periyot'),
  },
  (t) => [index('abonelikler_kurum_id_durum_idx').on(t.kurum_id, t.durum)],
);

export const abonelikOlaylari = abonelik.table('abonelik_olaylari', {
  id: uuid('id').primaryKey(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  kurum_id: uuid('kurum_id'),
  abonelik_id: uuid('abonelik_id'),
  kaynak: text('kaynak').notNull(),
  dis_olay_id: text('dis_olay_id').notNull(),
  tur: text('tur').notNull(),
  ham_govde: text('ham_govde').notNull(),
  basliklar: jsonb('basliklar'),
  imza_dogrulandi: boolean('imza_dogrulandi').notNull(),
  durum: text('durum').notNull().default('alindi'),
  hata: text('hata'),
  deneme_sayisi: smallint('deneme_sayisi').notNull().default(0),
  alindi_at: tstz('alindi_at').notNull().defaultNow(),
  islendi_at: tstz('islendi_at'),
});

export const abonelikOdemeleri = abonelik.table('abonelik_odemeleri', {
  ...kiraci(),
  abonelik_id: uuid('abonelik_id').notNull(),
  kaynak: text('kaynak').notNull(),
  dis_islem_id: text('dis_islem_id').notNull(),
  olay_id: uuid('olay_id'),
  durum: text('durum').notNull(),
  tutar_kurus: bigint('tutar_kurus', { mode: 'number' }).notNull(),
  kdv_kurus: bigint('kdv_kurus', { mode: 'number' }).notNull(),
  donem_baslangic_at: tstz('donem_baslangic_at').notNull(),
  donem_bitis_at: tstz('donem_bitis_at').notNull(),
  odeme_at: tstz('odeme_at').notNull(),
  hata_kodu: text('hata_kodu'),
  ters_cevrilen_id: uuid('ters_cevrilen_id'),
});

export const kurumFaturaBilgileri = abonelik.table('kurum_fatura_bilgileri', {
  ...kiraci(),
  ...surumlu(),
  unvan: text('unvan').notNull(),
  vergi_no: text('vergi_no').notNull(),
  vergi_dairesi: text('vergi_dairesi'),
  adres: jsonb('adres').notNull(),
  eposta: text('eposta').notNull(),
  e_fatura_mukellefi: boolean('e_fatura_mukellefi').notNull().default(false),
});

export const faturalar = abonelik.table('faturalar', {
  ...kiraci(),
  ...surumlu(),
  odeme_id: uuid('odeme_id').notNull(),
  tur: text('tur').notNull().default('e_arsiv'),
  durum: text('durum').notNull().default('bekliyor'),
  fatura_no: text('fatura_no'),
  ettn: uuid('ettn'),
  alici_unvan: text('alici_unvan').notNull(),
  alici_vergi_no: text('alici_vergi_no').notNull(),
  alici_adres: jsonb('alici_adres').notNull(),
  matrah_kurus: bigint('matrah_kurus', { mode: 'number' }).notNull(),
  kdv_kurus: bigint('kdv_kurus', { mode: 'number' }).notNull(),
  toplam_kurus: bigint('toplam_kurus', { mode: 'number' }).notNull(),
  kdv_orani: smallint('kdv_orani').notNull(),
  entegrator: text('entegrator'),
  entegrator_ref: text('entegrator_ref'),
  pdf_dosya_id: uuid('pdf_dosya_id'),
  kesim_at: tstz('kesim_at'),
  hata: text('hata'),
  deneme_sayisi: smallint('deneme_sayisi').notNull().default(0),
});

/** Sahibin baslattigi odeme oturumu (migrations/0019): saglayici belirteci -> kurum + plan + periyot. */
export const odemeOturumlari = abonelik.table('odeme_oturumlari', {
  ...kiraci(),
  kaynak: text('kaynak').notNull(),
  dis_islem_id: text('dis_islem_id'),
  plan_id: uuid('plan_id').notNull(),
  periyot: text('periyot').notNull(),
  tutar_kurus: bigint('tutar_kurus', { mode: 'number' }).notNull(),
  kdv_kurus: bigint('kdv_kurus', { mode: 'number' }).notNull(),
  durum: text('durum').notNull().default('bekliyor'),
  dis_abonelik_id: text('dis_abonelik_id'),
});
