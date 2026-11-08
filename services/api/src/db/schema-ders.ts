import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `ders` semasi (migrations/0006_ders_takvim.sql). `schema.ts` bunu yeniden disa aktarir; sutun
 * anahtarlari veritabani adlariyla aynidir (ADR 0006). Iliski kisitlari (FK, EXCLUDE) SQL'dedir.
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });
const olusturma = () => tstz('created_at').notNull().defaultNow();
const guncelleme = () => tstz('updated_at').notNull().defaultNow();

const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  created_by: uuid('created_by'),
});
const surumlu = () => ({ surum: bigint('surum', { mode: 'number' }).notNull().default(1) });

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const ders = pgSchema('ders');

export const dersSerileri = ders.table(
  'ders_serileri',
  {
    ...kiraci(),
    ...surumlu(),
    grup_id: uuid('grup_id').notNull(),
    ogretmen_id: uuid('ogretmen_id').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    baslik: text('baslik'),
    tekrar_kurali: text('tekrar_kurali').notNull(),
    baslangic_tarihi: date('baslangic_tarihi').notNull(),
    bitis_tarihi: date('bitis_tarihi'),
    adet: integer('adet'),
    baslangic_saati: time('baslangic_saati').notNull(),
    sure_dk: smallint('sure_dk').notNull(),
    saat_dilimi: text('saat_dilimi').notNull().default('Europe/Istanbul'),
    online_baglanti: text('online_baglanti'),
    yer: text('yer'),
    uretildi_son_tarih: date('uretildi_son_tarih').notNull(),
    durum: text('durum').notNull().default('aktif'),
  },
  (t) => [
    index('ders_serileri_kurum_id_durum_uretildi_son_tarih_idx').on(
      t.kurum_id,
      t.durum,
      t.uretildi_son_tarih,
    ),
    index('ders_serileri_grup_id_idx').on(t.kurum_id, t.grup_id),
  ],
);

export const dersler = ders.table(
  'dersler',
  {
    ...kiraci(),
    ...surumlu(),
    grup_id: uuid('grup_id').notNull(),
    seri_id: uuid('seri_id'),
    seri_sirasi: integer('seri_sirasi'),
    ogretmen_id: uuid('ogretmen_id').notNull(),
    brans_kodu: text('brans_kodu').notNull(),
    konu_id: uuid('konu_id'),
    baslik: text('baslik'),
    baslangic_at: tstz('baslangic_at').notNull(),
    bitis_at: tstz('bitis_at').notNull(),
    durum: text('durum').notNull().default('planli'),
    iptal_nedeni: text('iptal_nedeni'),
    iptal_eden_id: uuid('iptal_eden_id'),
    iptal_at: tstz('iptal_at'),
    ilk_baslangic_at: tstz('ilk_baslangic_at').notNull(),
    ertelendi_sayisi: smallint('ertelendi_sayisi').notNull().default(0),
    telafi: boolean('telafi').notNull().default(false),
    telafi_kaynak_ders_id: uuid('telafi_kaynak_ders_id'),
    seri_istisna: boolean('seri_istisna').notNull().default(false),
    online_baglanti: text('online_baglanti'),
    yer: text('yer'),
    cakisma_onayli: boolean('cakisma_onayli').notNull().default(false),
    iptal_kaynagi: text('iptal_kaynagi'),
    gec_iptal: boolean('gec_iptal').notNull().default(false),
  },
  (t) => [
    uniqueIndex('dersler_seri_id_seri_sirasi_uniq')
      .on(t.seri_id, t.seri_sirasi)
      .where(sql`${t.seri_id} is not null`),
    index('dersler_kurum_id_baslangic_at_idx').on(t.kurum_id, t.baslangic_at),
    index('dersler_kurum_id_grup_id_baslangic_at_idx').on(t.kurum_id, t.grup_id, t.baslangic_at),
    index('dersler_kurum_id_ogretmen_id_baslangic_at_idx').on(
      t.kurum_id,
      t.ogretmen_id,
      t.baslangic_at,
    ),
    index('dersler_seri_id_idx').on(t.seri_id),
  ],
);

export const dersKatilimcilari = ders.table(
  'ders_katilimcilari',
  {
    ...kiraci(),
    ders_id: uuid('ders_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    tur: text('tur').notNull().default('uye'),
  },
  (t) => [
    unique('ders_katilimcilari_ders_id_ogrenci_id_uniq').on(t.ders_id, t.ogrenci_id),
    index('ders_katilimcilari_kurum_id_ogrenci_id_ders_id_idx').on(
      t.kurum_id,
      t.ogrenci_id,
      t.ders_id,
    ),
  ],
);

export const yoklamalar = ders.table(
  'yoklamalar',
  {
    ...kiraci(),
    ...surumlu(),
    ders_id: uuid('ders_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    durum: text('durum').notNull(),
    gec_dakika: smallint('gec_dakika'),
    not: text('not'),
    not_gorunurluk: text('not_gorunurluk').notNull().default('ogretmene_ozel'),
    isaretleyen_id: uuid('isaretleyen_id').notNull(),
    isaretlenme_at: tstz('isaretlenme_at').notNull(),
    sunucu_at: tstz('sunucu_at').notNull().defaultNow(),
  },
  (t) => [
    unique('yoklamalar_ders_id_ogrenci_id_uniq').on(t.ders_id, t.ogrenci_id),
    index('yoklamalar_kurum_id_ogrenci_id_ders_id_idx').on(t.kurum_id, t.ogrenci_id, t.ders_id),
    index('yoklamalar_kurum_id_ders_id_idx').on(t.kurum_id, t.ders_id),
  ],
);

/** Degistirilemez defter: `updated_at`/`surum` yok. */
export const yoklamaGecmisi = ders.table(
  'yoklama_gecmisi',
  {
    id: uuid('id').primaryKey(),
    kurum_id: uuid('kurum_id').notNull(),
    created_at: olusturma(),
    created_by: uuid('created_by'),
    yoklama_id: uuid('yoklama_id').notNull(),
    ders_id: uuid('ders_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    yoklama_surumu: bigint('yoklama_surumu', { mode: 'number' }).notNull(),
    onceki_durum: text('onceki_durum'),
    yeni_durum: text('yeni_durum').notNull(),
    degistiren_id: uuid('degistiren_id').notNull(),
    istek_id: uuid('istek_id'),
    istemci_zamani: tstz('istemci_zamani').notNull(),
  },
  (t) => [
    unique('yoklama_gecmisi_yoklama_id_yoklama_surumu_uniq').on(t.yoklama_id, t.yoklama_surumu),
    index('yoklama_gecmisi_kurum_id_yoklama_id_yoklama_surumu_idx').on(
      t.kurum_id,
      t.yoklama_id,
      t.yoklama_surumu,
    ),
  ],
);

export const yoklamaIstekleri = ders.table(
  'yoklama_istekleri',
  {
    ...kiraci(),
    istek_id: uuid('istek_id').notNull(),
    ders_id: uuid('ders_id').notNull(),
    kullanici_id: uuid('kullanici_id').notNull(),
    govde_sha256: bytea('govde_sha256').notNull(),
    durum_kodu: smallint('durum_kodu').notNull(),
    yanit: jsonb('yanit').notNull(),
  },
  (t) => [
    unique('yoklama_istekleri_kurum_id_istek_id_uniq').on(t.kurum_id, t.istek_id),
    index('yoklama_istekleri_created_at_idx').on(t.created_at),
  ],
);
