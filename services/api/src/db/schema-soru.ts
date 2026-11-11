import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { ogrenme } from './schema-mufredat.js';

/**
 * `ogrenme` semasi, "soru sor" tablolari (migrations/0014_ogrenme_soru.sql). `schema.ts` bunu yeniden disa
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

export const soruMasalari = ogrenme.table('soru_masalari', {
  ...kiraci(),
  ...surumlu(),
  brans_kodu: text('brans_kodu').notNull(),
  ad: text('ad').notNull(),
  aktif: boolean('aktif').notNull().default(true),
  arsivlendi_at: tstz('arsivlendi_at'),
});

export const soruMasasiUyeleri = ogrenme.table(
  'soru_masasi_uyeleri',
  {
    ...kiraci(),
    masa_id: uuid('masa_id').notNull(),
    ogretmen_id: uuid('ogretmen_id').notNull(),
  },
  (t) => [
    unique('soru_masasi_uyeleri_masa_id_ogretmen_id_uniq').on(t.masa_id, t.ogretmen_id),
    index('soru_masasi_uyeleri_kurum_id_ogretmen_id_idx').on(t.kurum_id, t.ogretmen_id),
  ],
);

export const soruAyarlari = ogrenme.table(
  'soru_ayarlari',
  {
    ...kiraci(),
    ...surumlu(),
    aylik_soru_limiti: integer('aylik_soru_limiti'),
    gunluk_soru_limiti: integer('gunluk_soru_limiti').default(3),
    soru_basina_takip_limiti: smallint('soru_basina_takip_limiti').notNull().default(3),
    ses_azami_sn: smallint('ses_azami_sn').notNull().default(180),
    foto_saklama_gun: smallint('foto_saklama_gun').notNull().default(30),
  },
  (t) => [unique('soru_ayarlari_kurum_id_uniq').on(t.kurum_id)],
);

export const soruOgretmenDurumlari = ogrenme.table(
  'soru_ogretmen_durumlari',
  {
    ...kiraci(),
    ogretmen_id: uuid('ogretmen_id').notNull(),
    musait_degil_tarihi: date('musait_degil_tarihi'),
  },
  (t) => [
    unique('soru_ogretmen_durumlari_kurum_id_ogretmen_id_uniq').on(t.kurum_id, t.ogretmen_id),
  ],
);

export const sorular = ogrenme.table(
  'sorular',
  {
    ...kiraci(),
    ...surumlu(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    baslik: text('baslik'),
    yonlendirme: text('yonlendirme').notNull(),
    atanan_ogretmen_id: uuid('atanan_ogretmen_id'),
    masa_id: uuid('masa_id'),
    ustlenen_id: uuid('ustlenen_id'),
    durum: text('durum').notNull().default('acik'),
    kota_donemi: date('kota_donemi').notNull(),
    son_hareket_at: tstz('son_hareket_at').notNull().defaultNow(),
    cozuldu_at: tstz('cozuldu_at'),
    cozuldu_kaynagi: text('cozuldu_kaynagi'),
    foto_silinme_at: tstz('foto_silinme_at'),
    yeniden_acilma_sayisi: smallint('yeniden_acilma_sayisi').notNull().default(0),
    ilk_cevap_at: tstz('ilk_cevap_at'),
    ilk_cevaplayan_id: uuid('ilk_cevaplayan_id'),
    istek_id: uuid('istek_id'),
  },
  (t) => [
    unique('sorular_kurum_id_istek_id_uniq').on(t.kurum_id, t.istek_id),
    index('sorular_kurum_id_ogrenci_id_son_hareket_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.son_hareket_at.desc(),
    ),
    index('sorular_kurum_id_atanan_ogretmen_id_durum_idx').on(
      t.kurum_id,
      t.atanan_ogretmen_id,
      t.durum,
    ),
    index('sorular_kurum_id_masa_id_durum_idx').on(t.kurum_id, t.masa_id, t.durum),
    index('sorular_kurum_id_durum_son_hareket_at_idx').on(t.kurum_id, t.durum, t.son_hareket_at),
  ],
);

export const soruDosyalari = ogrenme.table(
  'soru_dosyalari',
  {
    ...kiraci(),
    soru_id: uuid('soru_id').notNull(),
    medya_dosya_id: uuid('medya_dosya_id').notNull(),
    sira: smallint('sira').notNull().default(0),
  },
  (t) => [
    unique('soru_dosyalari_soru_id_medya_dosya_id_uniq').on(t.soru_id, t.medya_dosya_id),
    unique('soru_dosyalari_soru_id_sira_uniq').on(t.soru_id, t.sira),
    unique('soru_dosyalari_medya_dosya_id_uniq').on(t.medya_dosya_id),
    index('soru_dosyalari_kurum_id_soru_id_idx').on(t.kurum_id, t.soru_id),
  ],
);

export const soruMesajlari = ogrenme.table(
  'soru_mesajlari',
  {
    ...kiraci(),
    soru_id: uuid('soru_id').notNull(),
    yazar_id: uuid('yazar_id').notNull(),
    yazar_rolu: text('yazar_rolu').notNull(),
    tur: text('tur').notNull(),
    metin: text('metin'),
    sira: integer('sira').notNull(),
    derste_konusalim: boolean('derste_konusalim').notNull().default(false),
    istek_id: uuid('istek_id'),
  },
  (t) => [
    unique('soru_mesajlari_soru_id_sira_uniq').on(t.soru_id, t.sira),
    unique('soru_mesajlari_kurum_id_istek_id_uniq').on(t.kurum_id, t.istek_id),
    index('soru_mesajlari_kurum_id_soru_id_sira_idx').on(t.kurum_id, t.soru_id, t.sira),
  ],
);

export const soruMesajEkleri = ogrenme.table(
  'soru_mesaj_ekleri',
  {
    ...kiraci(),
    mesaj_id: uuid('mesaj_id').notNull(),
    tur: text('tur').notNull(),
    medya_dosya_id: uuid('medya_dosya_id').notNull(),
    kaynak_dosya_id: uuid('kaynak_dosya_id'),
    cizim_verisi: jsonb('cizim_verisi'),
    sure_sn: smallint('sure_sn'),
    sira: smallint('sira').notNull().default(0),
  },
  (t) => [
    unique('soru_mesaj_ekleri_mesaj_id_medya_dosya_id_uniq').on(t.mesaj_id, t.medya_dosya_id),
    unique('soru_mesaj_ekleri_mesaj_id_sira_uniq').on(t.mesaj_id, t.sira),
    unique('soru_mesaj_ekleri_medya_dosya_id_uniq').on(t.medya_dosya_id),
    index('soru_mesaj_ekleri_kurum_id_mesaj_id_idx').on(t.kurum_id, t.mesaj_id),
  ],
);

export const soruKotaSayaclari = ogrenme.table(
  'soru_kota_sayaclari',
  {
    kurum_id: uuid('kurum_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    donem_turu: text('donem_turu').notNull(),
    donem: date('donem').notNull(),
    kullanilan: integer('kullanilan').notNull().default(0),
    created_at: tstz('created_at').notNull().defaultNow(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ogrenci_id, t.donem_turu, t.donem] }),
    index('soru_kota_sayaclari_donem_idx').on(t.donem),
  ],
);

export const soruBildirimleri = ogrenme.table(
  'soru_bildirimleri',
  {
    ...kiraci(),
    ...surumlu(),
    soru_id: uuid('soru_id').notNull(),
    mesaj_id: uuid('mesaj_id'),
    bildiren_id: uuid('bildiren_id').notNull(),
    neden: text('neden').notNull(),
    aciklama: text('aciklama'),
    durum: text('durum').notNull().default('acik'),
    kapatan_id: uuid('kapatan_id'),
    kapandi_at: tstz('kapandi_at'),
    kapatma_notu: text('kapatma_notu'),
  },
  (t) => [
    index('soru_bildirimleri_kurum_id_durum_created_at_idx').on(
      t.kurum_id,
      t.durum,
      t.created_at.desc(),
    ),
  ],
);
