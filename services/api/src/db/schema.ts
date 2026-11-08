import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { bytea, citext, dogrulandiMi } from './tipler.js';

/**
 * Drizzle tablo tanimlari, `migrations/*.sql` dosyalarinin ve docs/schema/api.md'nin yansimasidir.
 * Sema degisikligi once SQL migration'inda yapilir; `schema.test.ts` iki tarafin sutunlarini karsilastirir.
 * Sutun anahtarlari veritabani sutun adlariyla aynidir (ADR 0006: donusum katmani yok).
 */

const tstz = (ad: string) => timestamp(ad, { withTimezone: true, mode: 'date' });
const olusturma = () => tstz('created_at').notNull().defaultNow();
const guncelleme = () => tstz('updated_at').notNull().defaultNow();

export const ortak = pgSchema('ortak');
export const hesap = pgSchema('hesap');

// --- ortak ---------------------------------------------------------------------------------

export const bransler = ortak.table('bransler', {
  kod: text('kod').primaryKey(),
  ad: text('ad').notNull(),
  sira: smallint('sira').notNull().default(100),
  aktif: boolean('aktif').notNull().default(true),
  created_at: olusturma(),
  updated_at: guncelleme(),
});

export const outbox = ortak.table('outbox', {
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  subject: text('subject').notNull(),
  payload: jsonb('payload').notNull(),
  created_at: olusturma(),
  sent_at: tstz('sent_at'),
  attempts: integer('attempts').notNull().default(0),
  last_error: text('last_error'),
});

export const medyaDosyaKopyalari = ortak.table('medya_dosya_kopyalari', {
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  sahip_kullanici_id: uuid('sahip_kullanici_id').notNull(),
  tur: text('tur').notNull(),
  durum: text('durum').notNull(),
  mime_tipi: text('mime_tipi').notNull(),
  boyut_bayt: bigint('boyut_bayt', { mode: 'number' }).notNull(),
  genislik: integer('genislik'),
  yukseklik: integer('yukseklik'),
  sure_sn: integer('sure_sn'),
  kucuk_resim_var: boolean('kucuk_resim_var').notNull().default(false),
  kaynak_olay_id: uuid('kaynak_olay_id').notNull(),
  created_at: olusturma(),
  updated_at: guncelleme(),
});

// --- hesap: kimlik -------------------------------------------------------------------------

export const kullanicilar = hesap.table('kullanicilar', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  surum: bigint('surum', { mode: 'number' }).notNull().default(1),
  ad: text('ad'),
  soyad: text('soyad'),
  gorunen_ad: text('gorunen_ad'),
  ad_arama: text('ad_arama'),
  telefon_e164: text('telefon_e164'),
  telefon_dogrulandi_at: dogrulandiMi('telefon_dogrulandi_at').notNull(),
  eposta: citext('eposta'),
  eposta_dogrulandi_at: dogrulandiMi('eposta_dogrulandi_at').notNull(),
  avatar_dosya_id: uuid('avatar_dosya_id'),
  avatar_url: text('avatar_url'),
  dil: text('dil').notNull().default('tr'),
  saat_dilimi: text('saat_dilimi').notNull().default('Europe/Istanbul'),
  durum: text('durum').notNull().default('aktif'),
  platform_rolu: text('platform_rolu').notNull().default('yok'),
  son_giris_at: tstz('son_giris_at'),
  anonimlestirildi_at: tstz('anonimlestirildi_at'),
});

export const oturumlar = hesap.table('oturumlar', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  kullanici_id: uuid('kullanici_id')
    .notNull()
    .references(() => kullanicilar.id, { onDelete: 'cascade' }),
  belirtec: text('belirtec').notNull(),
  etkin_kurum_id: uuid('etkin_kurum_id'),
  etkin_uyelik_id: uuid('etkin_uyelik_id'),
  ip: inet('ip'),
  user_agent: text('user_agent'),
  cihaz_adi: text('cihaz_adi'),
  expires_at: tstz('expires_at').notNull(),
  son_kullanim_at: tstz('son_kullanim_at').notNull().defaultNow(),
  iptal_at: tstz('iptal_at'),
  taklit_kayit_id: uuid('taklit_kayit_id'),
});

export const hesaplar = hesap.table('hesaplar', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  kullanici_id: uuid('kullanici_id')
    .notNull()
    .references(() => kullanicilar.id, { onDelete: 'cascade' }),
  saglayici: text('saglayici').notNull(),
  saglayici_hesap_id: text('saglayici_hesap_id').notNull(),
  erisim_belirteci: text('erisim_belirteci'),
  yenileme_belirteci: text('yenileme_belirteci'),
  kimlik_belirteci: text('kimlik_belirteci'),
  erisim_belirteci_expires_at: tstz('erisim_belirteci_expires_at'),
  yenileme_belirteci_expires_at: tstz('yenileme_belirteci_expires_at'),
  kapsam: text('kapsam'),
  parola_hash: text('parola_hash'),
});

export const dogrulamalar = hesap.table('dogrulamalar', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  tanimlayici: text('tanimlayici').notNull(),
  deger: text('deger').notNull(),
  expires_at: tstz('expires_at').notNull(),
});

export const jwks = hesap.table('jwks', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  acik_anahtar: text('acik_anahtar').notNull(),
  ozel_anahtar_sifreli: bytea('ozel_anahtar_sifreli').notNull(),
  algoritma: text('algoritma').notNull().default('EdDSA'),
  expires_at: tstz('expires_at'),
});

export const otpIstekleri = hesap.table('otp_istekleri', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  tanimlayici: text('tanimlayici').notNull(),
  ip: inet('ip'),
});

export const roller = hesap.table('roller', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  kod: text('kod').notNull(),
  ad: text('ad').notNull(),
  sistem: boolean('sistem').notNull().default(true),
});

export const izinler = hesap.table('izinler', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  kod: text('kod').notNull(),
  modul_kodu: text('modul_kodu'),
  aciklama: text('aciklama').notNull(),
});

export const rolIzinleri = hesap.table('rol_izinleri', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  rol_kodu: text('rol_kodu').notNull(),
  izin_kodu: text('izin_kodu').notNull(),
  kapsam: text('kapsam').notNull(),
});

// --- hesap: riza (KVKK) --------------------------------------------------------------------

export const rizaMetinleri = hesap.table('riza_metinleri', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  tur: text('tur').notNull(),
  surum: text('surum').notNull(),
  dil: text('dil').notNull().default('tr'),
  baslik: text('baslik').notNull(),
  govde_markdown: text('govde_markdown').notNull(),
  govde_sha256: bytea('govde_sha256').notNull(),
  rol_kapsami: text('rol_kapsami').array().notNull(),
  gecerli_baslangic_at: tstz('gecerli_baslangic_at').notNull(),
  yayinlandi_at: tstz('yayinlandi_at'),
});

export const rizalar = hesap.table('rizalar', {
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id'),
  created_at: olusturma(),
  created_by: uuid('created_by'),
  kullanici_id: uuid('kullanici_id')
    .notNull()
    .references(() => kullanicilar.id),
  riza_metni_id: uuid('riza_metni_id')
    .notNull()
    .references(() => rizaMetinleri.id),
  karar: text('karar').notNull(),
  veli_kullanici_id: uuid('veli_kullanici_id'),
  kaynak: text('kaynak').notNull(),
  ip: inet('ip'),
  user_agent: text('user_agent'),
  govde_sha256: bytea('govde_sha256').notNull(),
});

// --- hesap: kurum yapisi -------------------------------------------------------------------

/** Kiraci tablolari icin ortak profil (K / KS). */
const kiraci = () => ({
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id').notNull(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  created_by: uuid('created_by'),
});
const surumlu = () => ({ surum: bigint('surum', { mode: 'number' }).notNull().default(1) });

export const kurumlar = hesap.table('kurumlar', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  surum: bigint('surum', { mode: 'number' }).notNull().default(1),
  ad: text('ad').notNull(),
  tur: text('tur').notNull(),
  kisa_ad: citext('kisa_ad'),
  vergi_no: text('vergi_no'),
  telefon_e164: text('telefon_e164'),
  eposta: text('eposta'),
  adres: jsonb('adres'),
  logo_dosya_id: uuid('logo_dosya_id'),
  saat_dilimi: text('saat_dilimi').notNull().default('Europe/Istanbul'),
  durum: text('durum').notNull().default('aktif'),
  ayarlar: jsonb('ayarlar')
    .notNull()
    .default(sql`'{}'::jsonb`),
  olusturan_kullanici_id: uuid('olusturan_kullanici_id')
    .notNull()
    .references(() => kullanicilar.id),
  kapatildi_at: tstz('kapatildi_at'),
});

export const subeler = hesap.table('subeler', {
  ...kiraci(),
  ...surumlu(),
  ad: text('ad').notNull(),
  adres: jsonb('adres'),
  telefon_e164: text('telefon_e164'),
  arsivlendi_at: tstz('arsivlendi_at'),
});

export const kademeler = hesap.table('kademeler', {
  ...kiraci(),
  ...surumlu(),
  ad: text('ad').notNull(),
  seviye: smallint('seviye'),
  sira: smallint('sira').notNull().default(100),
  arsivlendi_at: tstz('arsivlendi_at'),
});

export const uyelikler = hesap.table(
  'uyelikler',
  {
    ...kiraci(),
    ...surumlu(),
    kullanici_id: uuid('kullanici_id')
      .notNull()
      .references(() => kullanicilar.id),
    rol: text('rol').notNull(),
    durum: text('durum').notNull().default('aktif'),
    sube_id: uuid('sube_id'),
    kademe_id: uuid('kademe_id'),
    ogrenci_no: text('ogrenci_no'),
    gorunen_ad: text('gorunen_ad'),
    katildi_at: tstz('katildi_at'),
    ayrildi_at: tstz('ayrildi_at'),
  },
  (t) => [index('uyelikler_kullanici_id_idx').on(t.kullanici_id)],
);

export const veliOgrenci = hesap.table('veli_ogrenci', {
  ...kiraci(),
  veli_id: uuid('veli_id').notNull(),
  ogrenci_id: uuid('ogrenci_id').notNull(),
  yakinlik: text('yakinlik'),
  birincil: boolean('birincil').notNull().default(false),
  onaylandi_at: tstz('onaylandi_at'),
});

export const gruplar = hesap.table('gruplar', {
  ...kiraci(),
  ...surumlu(),
  tur: text('tur').notNull(),
  ad: text('ad').notNull(),
  sube_id: uuid('sube_id'),
  kademe_id: uuid('kademe_id'),
  kapasite: smallint('kapasite'),
  renk: text('renk'),
  durum: text('durum').notNull().default('aktif'),
  arsivlendi_at: tstz('arsivlendi_at'),
});

export const grupUyeleri = hesap.table(
  'grup_uyeleri',
  {
    ...kiraci(),
    ...surumlu(),
    grup_id: uuid('grup_id').notNull(),
    ogrenci_id: uuid('ogrenci_id').notNull(),
    baslangic_tarihi: date('baslangic_tarihi')
      .notNull()
      .default(sql`current_date`),
    bitis_tarihi: date('bitis_tarihi'),
    katilim_yolu: text('katilim_yolu').notNull().default('yonetici'),
  },
  (t) => [
    uniqueIndex('grup_uyeleri_grup_id_ogrenci_id_uniq')
      .on(t.grup_id, t.ogrenci_id)
      .where(sql`${t.bitis_tarihi} is null`),
  ],
);

export const atamalar = hesap.table('atamalar', {
  ...kiraci(),
  ...surumlu(),
  grup_id: uuid('grup_id').notNull(),
  ogretmen_id: uuid('ogretmen_id').notNull(),
  brans_kodu: text('brans_kodu')
    .notNull()
    .references(() => bransler.kod),
  baslangic_tarihi: date('baslangic_tarihi')
    .notNull()
    .default(sql`current_date`),
  bitis_tarihi: date('bitis_tarihi'),
  ana_ogretmen: boolean('ana_ogretmen').notNull().default(false),
});

export const davetler = hesap.table('davetler', {
  ...kiraci(),
  ...surumlu(),
  kanal: text('kanal').notNull(),
  rol: text('rol').notNull(),
  belirtec_hash: bytea('belirtec_hash').notNull(),
  hedef_telefon_e164: text('hedef_telefon_e164'),
  hedef_eposta: citext('hedef_eposta'),
  hedef_ad: text('hedef_ad'),
  grup_id: uuid('grup_id'),
  kademe_id: uuid('kademe_id'),
  sube_id: uuid('sube_id'),
  davet_eden_id: uuid('davet_eden_id').notNull(),
  max_kullanim: integer('max_kullanim').notNull().default(1),
  kullanim_sayisi: integer('kullanim_sayisi').notNull().default(0),
  durum: text('durum').notNull().default('bekliyor'),
  expires_at: tstz('expires_at').notNull(),
  sms_gonderim_sayisi: smallint('sms_gonderim_sayisi').notNull().default(0),
  son_sms_at: tstz('son_sms_at'),
  kabul_eden_kullanici_id: uuid('kabul_eden_kullanici_id'),
});

export const sinifKatilimKodlari = hesap.table('sinif_katilim_kodlari', {
  ...kiraci(),
  ...surumlu(),
  grup_id: uuid('grup_id').notNull(),
  kod: text('kod').notNull(),
  aktif: boolean('aktif').notNull().default(true),
  expires_at: tstz('expires_at'),
  max_kullanim: integer('max_kullanim'),
  kullanim_sayisi: integer('kullanim_sayisi').notNull().default(0),
  iptal_at: tstz('iptal_at'),
});

export const sinifKatilimIstekleri = hesap.table('sinif_katilim_istekleri', {
  ...kiraci(),
  ...surumlu(),
  grup_id: uuid('grup_id').notNull(),
  kod_id: uuid('kod_id').notNull(),
  kullanici_id: uuid('kullanici_id')
    .notNull()
    .references(() => kullanicilar.id),
  durum: text('durum').notNull().default('bekliyor'),
  karar_veren_id: uuid('karar_veren_id'),
  karar_at: tstz('karar_at'),
});

export const modulAyarlari = hesap.table('modul_ayarlari', {
  ...kiraci(),
  ...surumlu(),
  modul_kodu: text('modul_kodu').notNull(),
  kapsam: text('kapsam').notNull(),
  kapsam_id: uuid('kapsam_id').notNull(),
  acik: boolean('acik').notNull(),
  degistiren_id: uuid('degistiren_id'),
});

export const taklitKayitlari = hesap.table('taklit_kayitlari', {
  id: uuid('id').primaryKey(),
  created_at: olusturma(),
  updated_at: guncelleme(),
  platform_kullanici_id: uuid('platform_kullanici_id').notNull(),
  hedef_kullanici_id: uuid('hedef_kullanici_id').notNull(),
  hedef_kurum_id: uuid('hedef_kurum_id').notNull(),
  neden: text('neden').notNull(),
  baslangic_at: tstz('baslangic_at').notNull().defaultNow(),
  bitis_at: tstz('bitis_at').notNull(),
  sonlandirildi_at: tstz('sonlandirildi_at'),
  ip: inet('ip'),
});

export const denetimKayitlari = hesap.table('denetim_kayitlari', {
  id: uuid('id').primaryKey(),
  kurum_id: uuid('kurum_id'),
  created_at: olusturma(),
  created_by: uuid('created_by'),
  aktor_kullanici_id: uuid('aktor_kullanici_id'),
  aktor_uyelik_id: uuid('aktor_uyelik_id'),
  taklit_kayit_id: uuid('taklit_kayit_id'),
  eylem: text('eylem').notNull(),
  hedef_turu: text('hedef_turu'),
  hedef_id: uuid('hedef_id'),
  once: jsonb('once'),
  sonra: jsonb('sonra'),
  neden: text('neden'),
  istek_id: uuid('istek_id'),
  ip: inet('ip'),
});

export * from './schema-ders.js';
export * from './schema-finans.js';
