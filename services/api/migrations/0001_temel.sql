-- 0001_temel: sema, yardimci fonksiyonlar, varsayilan yetkiler, outbox ve processed_events.
-- Bu dosya `api_owner` rolu ile calisir (runner `SET ROLE api_owner` yapar).
-- Roller ve uzantilar runner'in "bootstrap" adiminda hazirlanir (bkz. src/db/migrate.ts).

create schema if not exists ortak;
create schema if not exists hesap;

grant usage on schema ortak, hesap to api_app, api_sistem;

-- Tablolar api_owner tarafindan olusturulur; uygulama rolleri varsayilan olarak
-- yalnizca DML alir. Defter/guvenlik tablolarinda UPDATE/DELETE ayrica REVOKE edilir.
alter default privileges for role api_owner in schema ortak, hesap
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema ortak, hesap
  grant usage, select on sequences to api_app, api_sistem;

-- Oturum degiskenlerini okuyan yardimcilar. Degisken yoksa NULL doner (fail-closed).
create function ortak.aktif_kurum() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.kurum_id', true), '')::uuid $$;

create function ortak.aktif_kullanici() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.kullanici_id', true), '')::uuid $$;

create function ortak.updated_at_ayarla() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create function ortak.surum_artir() returns trigger
  language plpgsql as $$ begin new.surum := old.surum + 1; return new; end $$;

create function ortak.defter_degistirilemez() returns trigger
  language plpgsql as $$
begin
  raise exception 'defter_degistirilemez' using errcode = 'integrity_constraint_violation';
end $$;

-- Transactional outbox (service-kit sablonu). Kiraci tablosu degildir, RLS yoktur.
-- @outbox-sablonu ortak

-- Uygulama olay yazar; relay (api_sistem) okur, gonderildi isaretler ve temizler.
revoke update, delete on ortak.outbox from api_app;

create table ortak.processed_events (
  tuketici        text        not null,
  olay_id         uuid        not null,
  islenme_zamani  timestamptz not null default now(),
  primary key (tuketici, olay_id)
);
create index processed_events_islenme_idx on ortak.processed_events (islenme_zamani);

-- ortak.bransler: global referans listesi (RLS yok).
create table ortak.bransler (
  kod         text primary key,
  ad          text        not null,
  sira        smallint    not null default 100,
  aktif       boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint bransler_kod_chk check (kod ~ '^[a-z_]+$')
);
create trigger bransler_updated_at_trg before update on ortak.bransler
  for each row execute function ortak.updated_at_ayarla();
revoke insert, update, delete on ortak.bransler from api_app;

insert into ortak.bransler (kod, ad, sira) values
  ('matematik', 'Matematik', 10), ('geometri', 'Geometri', 11), ('fizik', 'Fizik', 20),
  ('kimya', 'Kimya', 21), ('biyoloji', 'Biyoloji', 22), ('fen_bilimleri', 'Fen Bilimleri', 23),
  ('turkce', 'Türkçe', 30), ('edebiyat', 'Edebiyat', 31), ('tarih', 'Tarih', 40),
  ('inkilap_tarihi', 'İnkılap Tarihi', 41), ('cografya', 'Coğrafya', 42),
  ('sosyal_bilgiler', 'Sosyal Bilgiler', 43), ('felsefe', 'Felsefe', 44),
  ('din_kulturu', 'Din Kültürü', 45), ('ingilizce', 'İngilizce', 50),
  ('almanca', 'Almanca', 51), ('diger', 'Diğer', 999);

-- ortak.medya_dosya_kopyalari: medya servisinin dosya kaydinin yerel okuma kopyasi.
create table ortak.medya_dosya_kopyalari (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  sahip_kullanici_id  uuid        not null,
  tur                 text        not null,
  durum               text        not null,
  mime_tipi           text        not null,
  boyut_bayt          bigint      not null,
  genislik            int,
  yukseklik           int,
  sure_sn             int,
  kucuk_resim_var     boolean     not null default false,
  kaynak_olay_id      uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint medya_dosya_kopyalari_durum_chk check (durum in ('hazir', 'islenemedi', 'silindi'))
);
create index medya_dosya_kopyalari_kurum_id_sahip_kullanici_id_idx
  on ortak.medya_dosya_kopyalari (kurum_id, sahip_kullanici_id);
create trigger medya_dosya_kopyalari_updated_at_trg before update on ortak.medya_dosya_kopyalari
  for each row execute function ortak.updated_at_ayarla();
alter table ortak.medya_dosya_kopyalari enable row level security;
alter table ortak.medya_dosya_kopyalari force row level security;
create policy kiraci_izolasyonu on ortak.medya_dosya_kopyalari
  using (kurum_id = ortak.aktif_kurum())
  with check (kurum_id = ortak.aktif_kurum());
