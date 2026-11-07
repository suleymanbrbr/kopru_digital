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
