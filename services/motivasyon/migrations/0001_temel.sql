-- 0001_temel: sema, yardimci fonksiyonlar, varsayilan yetkiler, outbox ve processed_events.
-- Bu dosya `motivasyon_owner` rolu ile calisir (runner `SET ROLE motivasyon_owner` yapar).
-- Roller ve uzantilar runner'in "bootstrap" adiminda hazirlanir (bkz. src/db/migrate.ts).

create schema if not exists ortak;
create schema if not exists motivasyon;

grant usage on schema ortak, motivasyon to motivasyon_app, motivasyon_sistem;

-- Tablolar motivasyon_owner tarafindan olusturulur; uygulama rolleri varsayilan olarak yalnizca DML alir.
alter default privileges for role motivasyon_owner in schema ortak, motivasyon
  grant select, insert, update, delete on tables to motivasyon_app, motivasyon_sistem;
alter default privileges for role motivasyon_owner in schema ortak, motivasyon
  grant usage, select on sequences to motivasyon_app, motivasyon_sistem;

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

-- Yalnizca ekleme (defter) tablolarinin UPDATE/DELETE'ini engeller (hicbir rol atlayamaz).
create function ortak.defter_degistirilemez() returns trigger
  language plpgsql as $$ begin raise exception 'defter_degistirilemez' using errcode = 'integrity_constraint_violation'; end $$;

-- Standart kiraci tablosu korumasi: RLS (ENABLE + FORCE), kiraci politikasi, updated_at ve
-- (istenirse) surum tetikleyicileri. `zaman_damgali` false ise tabloda `updated_at` yoktur (defter,
-- yalnizca-ekleme tablolari) ve tetikleyici kurulmaz; `surumlu` yalniz `surum` sutunu olan tablolarda true.
create function ortak.kiraci_tablosu_koru(sema text, tablo text, surumlu boolean default true, zaman_damgali boolean default true)
  returns void language plpgsql as $$
begin
  execute format('alter table %I.%I enable row level security', sema, tablo);
  execute format('alter table %I.%I force row level security', sema, tablo);
  execute format(
    'create policy kiraci_izolasyonu on %I.%I using (kurum_id = ortak.aktif_kurum()) with check (kurum_id = ortak.aktif_kurum())',
    sema, tablo);
  if zaman_damgali then
    execute format(
      'create trigger %I before update on %I.%I for each row execute function ortak.updated_at_ayarla()',
      tablo || '_updated_at_trg', sema, tablo);
  end if;
  if surumlu then
    execute format(
      'create trigger %I before update on %I.%I for each row execute function ortak.surum_artir()',
      tablo || '_surum_trg', sema, tablo);
  end if;
end $$;

-- Transactional outbox (service-kit sablonu). Kiraci tablosu degildir, RLS yoktur.
-- @outbox-sablonu ortak

-- Uygulama olay yazar; relay (motivasyon_sistem) okur ve gonderildi isaretler.
revoke update, delete on ortak.outbox from motivasyon_app;

create table ortak.processed_events (
  tuketici        text        not null,
  olay_id         uuid        not null,
  islenme_zamani  timestamptz not null default now(),
  primary key (tuketici, olay_id)
);
create index processed_events_islenme_idx on ortak.processed_events (islenme_zamani);
-- Temizligi sistem rolu yapar; uygulama rolu yalnizca ekler/okur.
revoke update, delete on ortak.processed_events from motivasyon_app;
