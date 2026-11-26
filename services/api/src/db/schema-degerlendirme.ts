import { bigint, boolean, date, index, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { ogrenme } from './schema-mufredat.js';

/**
 * `ogrenme` semasi, ogretmen degerlendirmeleri ve kaynak onerileri (migrations/0023_ogrenme_degerlendirme.sql).
 * `schema.ts` bunu yeniden disa aktarir; sutun anahtarlari veritabani adlariyla aynidir (ADR 0006). FK, CHECK
 * ve RESTRICTIVE ogrenci politikalari SQL'dedir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });

const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: tstz('created_at').notNull().defaultNow(),
  updated_at: tstz('updated_at').notNull().defaultNow(),
  created_by: uuid('created_by'),
  surum: bigint('surum', { mode: 'number' }).notNull().default(1),
});

export const ogretmenDegerlendirmeleri = ogrenme.table(
  'ogretmen_degerlendirmeleri',
  {
    ...kiraci(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    yazar_id: uuid('yazar_id').notNull(),
    donem_baslangic: date('donem_baslangic', { mode: 'string' }).notNull(),
    donem_bitis: date('donem_bitis', { mode: 'string' }).notNull(),
    brans_kodu: text('brans_kodu'),
    calisma_duzeni: smallint('calisma_duzeni'),
    derse_katilim: smallint('derse_katilim'),
    odev_disiplini: smallint('odev_disiplini'),
    anlama_duzeyi: smallint('anlama_duzeyi'),
    yorum: text('yorum'),
    ogrenci_gorur: boolean('ogrenci_gorur').notNull().default(false),
    ogrenci_bildirildi_at: tstz('ogrenci_bildirildi_at'),
    geri_cekildi_at: tstz('geri_cekildi_at'),
    geri_cekilen_id: uuid('geri_cekilen_id'),
  },
  (t) => [
    index('ogretmen_degerlendirmeleri_ogrenci_created_at_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.created_at,
    ),
    index('ogretmen_degerlendirmeleri_ogrenci_donem_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.donem_baslangic,
    ),
    index('ogretmen_degerlendirmeleri_yazar_donem_idx').on(
      t.kurum_id,
      t.yazar_id,
      t.donem_baslangic,
    ),
  ],
);

export const kaynakOnerileri = ogrenme.table(
  'kaynak_onerileri',
  {
    ...kiraci(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    oneren_id: uuid('oneren_id').notNull(),
    tur: text('tur').notNull(),
    kaynak_kitap_id: uuid('kaynak_kitap_id'),
    kaynak_test_id: uuid('kaynak_test_id'),
    baglanti_url: text('baglanti_url'),
    baslik: text('baslik'),
    brans_kodu: text('brans_kodu'),
    konu_id: uuid('konu_id'),
    not_metni: text('not_metni'),
    geri_cekildi_at: tstz('geri_cekildi_at'),
    geri_cekilen_id: uuid('geri_cekilen_id'),
  },
  (t) => [
    index('kaynak_onerileri_ogrenci_created_at_idx').on(t.kurum_id, t.ogrenci_id, t.created_at),
    index('kaynak_onerileri_oneren_id_idx').on(t.kurum_id, t.oneren_id),
  ],
);
