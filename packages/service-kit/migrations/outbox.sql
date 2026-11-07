-- Transactional outbox. Her servis kendi veritabaninda (veya semasinda) bu tabloyu olusturur.
-- Sablon: {{schema}} yer tutucusunu renderOutboxMigration(schema) doldurur.
-- Not: outbox tablosunda RLS yoktur; yalnizca servisin kendi relay'i okur/yazar.

create table if not exists {{schema}}.outbox (
  id          uuid primary key,                 -- olay id'si (uuidv7)
  kurum_id    uuid not null,
  subject     text not null,                    -- NATS subject, ornek: evt.yoklama.alindi.v1
  payload     jsonb not null,                   -- tam olay zarfi
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text
);

-- Relay yalnizca gonderilmemis satirlari tarar.
create index if not exists outbox_pending_idx
  on {{schema}}.outbox (created_at, id)
  where sent_at is null;
