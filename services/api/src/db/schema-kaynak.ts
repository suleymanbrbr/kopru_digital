import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  index,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { ders } from './schema-ders.js';

/**
 * Ders geri bildirimi ve kaynaklari (migrations/0013_ders_kaynak_geri_bildirim.sql). `schema.ts` bunu
 * yeniden disa aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006).
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
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const geriBildirimler = ders.table(
  'geri_bildirimler',
  {
    ...kiraci(),
    ...surumlu(),
    ders_id: uuid('ders_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    deger: text('deger').notNull(),
    konu_id: uuid('konu_id'),
    not: text('not'),
  },
  (t) => [
    unique('geri_bildirimler_ders_id_ogrenci_id_uniq').on(t.ders_id, t.ogrenci_id),
    index('geri_bildirimler_kurum_id_ders_id_idx').on(t.kurum_id, t.ders_id),
    index('geri_bildirimler_kurum_id_ogrenci_id_created_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.created_at.desc(),
    ),
  ],
);

export const dersKaynaklari = ders.table(
  'ders_kaynaklari',
  {
    ...kiraci(),
    ...surumlu(),
    tur: text('tur').notNull(),
    ders_id: uuid('ders_id'),
    grup_id: uuid('grup_id').notNull(),
    baslik: text('baslik').notNull(),
    saglayici: text('saglayici').notNull(),
    url: text('url').notNull(),
    parola_sifreli: bytea('parola_sifreli'),
    gecerlilik_bitis_at: tstz('gecerlilik_bitis_at'),
    gorunurluk: text('gorunurluk').notNull().default('grup'),
    konu_id: uuid('konu_id'),
    durum: text('durum').notNull().default('aktif'),
    ekleyen_id: uuid('ekleyen_id').notNull(),
    silindi_at: tstz('silindi_at'),
  },
  (t) => [
    unique('ders_kaynaklari_kurum_id_id_uniq').on(t.kurum_id, t.id),
    index('ders_kaynaklari_kurum_id_grup_id_created_at_idx')
      .on(t.kurum_id, t.grup_id, t.created_at.desc())
      .where(sql`${t.silindi_at} is null`),
    index('ders_kaynaklari_kurum_id_ders_id_idx').on(t.kurum_id, t.ders_id),
    index('ders_kaynaklari_kurum_id_durum_gecerlilik_bitis_at_idx').on(
      t.kurum_id,
      t.durum,
      t.gecerlilik_bitis_at,
    ),
    index('ders_kaynaklari_sure_sonu_idx')
      .on(t.gecerlilik_bitis_at)
      .where(
        sql`${t.durum} = 'aktif' and ${t.silindi_at} is null and ${t.gecerlilik_bitis_at} is not null`,
      ),
  ],
);

export const dersKaynagiAlicilari = ders.table(
  'ders_kaynagi_alicilari',
  {
    ...kiraci(),
    kaynak_id: uuid('kaynak_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
  },
  (t) => [
    unique('ders_kaynagi_alicilari_kaynak_id_ogrenci_id_uniq').on(t.kaynak_id, t.ogrenci_id),
    index('ders_kaynagi_alicilari_kurum_id_ogrenci_id_idx').on(t.kurum_id, t.ogrenci_id),
  ],
);

export const dersKaynagiIzlemeleri = ders.table(
  'ders_kaynagi_izlemeleri',
  {
    ...kiraci(),
    kaynak_id: uuid('kaynak_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    izledi_at: tstz('izledi_at').notNull().defaultNow(),
  },
  (t) => [
    unique('ders_kaynagi_izlemeleri_kaynak_id_ogrenci_id_uniq').on(t.kaynak_id, t.ogrenci_id),
    index('ders_kaynagi_izlemeleri_kurum_id_ogrenci_id_izledi_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.izledi_at.desc(),
    ),
  ],
);

export const dersKaynagiSorunlari = ders.table(
  'ders_kaynagi_sorunlari',
  {
    ...kiraci(),
    kaynak_id: uuid('kaynak_id').notNull(),
    bildiren_id: uuid('bildiren_id').notNull(),
    neden: text('neden').notNull(),
    aciklama: text('aciklama'),
    durum: text('durum').notNull().default('acik'),
    cozen_id: uuid('cozen_id'),
    cozuldu_at: tstz('cozuldu_at'),
  },
  (t) => [
    uniqueIndex('ders_kaynagi_sorunlari_acik_uniq')
      .on(t.kaynak_id, t.bildiren_id)
      .where(sql`${t.durum} = 'acik'`),
    index('ders_kaynagi_sorunlari_kurum_id_kaynak_id_durum_idx').on(
      t.kurum_id,
      t.kaynak_id,
      t.durum,
    ),
  ],
);
