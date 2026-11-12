-- Her servisin kendi veritabani ve kullanicisi vardir (servisler birbirinin verisine erisemez).
-- Bu betik yalnizca veri dizini ilk olusturulurken calisir (docker-entrypoint-initdb.d).
-- Sifirlamak icin: pnpm infra:down && docker volume rm kopru_postgres_data
--
-- Not: Tablo sahibi RLS'i atlar. Uygulama kullanicisi tablo sahibi ise tablolarda
-- `alter table ... force row level security` gerekir (bkz. docs/gelistirme.md).
-- Gelistirme sifreleri = kullanici adi; uretimde gizli yoneticiden gelir.

create role api login password 'api';
create role motivasyon login password 'motivasyon';
create role bildirim login password 'bildirim';
create role medya login password 'medya';

create database api owner api;
create database motivasyon owner motivasyon;
create database bildirim owner bildirim;
create database medya owner medya;

revoke connect on database api from public;
revoke connect on database motivasyon from public;
revoke connect on database bildirim from public;
revoke connect on database medya from public;

-- api servisi (ADR 0003): migration kullanicisi `api` (db sahibi) api_owner rolune gecerek tablolari olusturur.
-- Uygulama `api_app` (NOBYPASSRLS), sistem isleri `api_sistem` (BYPASSRLS) ile baglanir.
-- Sifreler yalnizca gelistirme icindir (= rol adi); uretimde gizli yoneticiden gelir.
create role api_owner nologin;
create role api_app login nosuperuser nobypassrls password 'api_app';
create role api_sistem login nosuperuser bypassrls password 'api_sistem';
grant api_owner to api;

-- medya servisi (ADR 0003 deseni): migration kullanicisi `medya` (db sahibi) medya_owner rolune gecerek tablolari
-- olusturur. Uygulama `medya_app` (NOBYPASSRLS), sistem isleri (isleme, silme, outbox relay) `medya_sistem` (BYPASSRLS).
create role medya_owner nologin;
create role medya_app login nosuperuser nobypassrls password 'medya_app';
create role medya_sistem login nosuperuser bypassrls password 'medya_sistem';
grant medya_owner to medya;

-- motivasyon servisi (ADR 0003 deseni): migration kullanicisi `motivasyon` (db sahibi) motivasyon_owner rolune
-- gecerek tablolari olusturur. Uygulama `motivasyon_app` (NOBYPASSRLS, olay tuketicileri ve kullanici uclari),
-- sistem isleri (outbox relay, haftalik sifirlama, temizlik) `motivasyon_sistem` (BYPASSRLS).
create role motivasyon_owner nologin;
create role motivasyon_app login nosuperuser nobypassrls password 'motivasyon_app';
create role motivasyon_sistem login nosuperuser bypassrls password 'motivasyon_sistem';
grant motivasyon_owner to motivasyon;
