-- 0008_ders_yoklama: yoklama (ders x ogrenci), degistirilemez yoklama gecmisi ve istek kimligi tablosu.
-- Genislet-daralt: yalniz yeni tablolar. Kredi/ucret etkisi finans semasindadir (0007), burada yoktur.

-- Ogrenci x ders yoklamasi: tek satir, durum degisince guncellenir (gecmis yoklama_gecmisi'nde).
-- `not` ayrilmis sozcuktur: her yerde cift tirnakla yazilir.
create table ders.yoklamalar (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ders_id          uuid        not null,
  ogrenci_id       uuid        not null,
  durum            text        not null,
  gec_dakika       smallint,
  "not"            text,
  not_gorunurluk   text        not null default 'ogretmene_ozel',
  isaretleyen_id   uuid        not null,
  isaretlenme_at   timestamptz not null,
  sunucu_at        timestamptz not null default now(),
  constraint yoklamalar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint yoklamalar_ders_id_fk foreign key (kurum_id, ders_id) references ders.dersler (kurum_id, id),
  constraint yoklamalar_katilimci_fk foreign key (ders_id, ogrenci_id)
    references ders.ders_katilimcilari (ders_id, ogrenci_id),
  constraint yoklamalar_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint yoklamalar_isaretleyen_id_fk foreign key (kurum_id, isaretleyen_id) references hesap.uyelikler (kurum_id, id),
  constraint yoklamalar_ders_id_ogrenci_id_uniq unique (ders_id, ogrenci_id),
  constraint yoklamalar_kurum_id_id_uniq unique (kurum_id, id),
  constraint yoklamalar_durum_chk check (durum in ('geldi', 'gelmedi', 'izinli', 'gec')),
  constraint yoklamalar_gec_dakika_chk check ((durum = 'gec') = (gec_dakika is not null)),
  constraint yoklamalar_gec_dakika_aralik_chk check (gec_dakika is null or gec_dakika between 1 and 240),
  constraint yoklamalar_not_chk check ("not" is null or char_length("not") <= 500),
  constraint yoklamalar_not_gorunurluk_chk check (not_gorunurluk in ('ogretmene_ozel', 'ogrenciye'))
);
create index yoklamalar_kurum_id_ogrenci_id_ders_id_idx on ders.yoklamalar (kurum_id, ogrenci_id, ders_id);
create index yoklamalar_kurum_id_ders_id_idx on ders.yoklamalar (kurum_id, ders_id);
select ortak.kiraci_tablosu_koru('ders', 'yoklamalar');

-- Yoklama degisiklik gunlugu: degistirilemez defter (UPDATE/DELETE hem yetkiden alinir hem tetikleyiciyle reddedilir).
create table ders.yoklama_gecmisi (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  yoklama_id       uuid        not null,
  ders_id          uuid        not null,
  ogrenci_id       uuid        not null,
  yoklama_surumu   bigint      not null,
  onceki_durum     text,
  yeni_durum       text        not null,
  degistiren_id    uuid        not null,
  istek_id         uuid,
  istemci_zamani   timestamptz not null,
  constraint yoklama_gecmisi_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint yoklama_gecmisi_yoklama_id_fk foreign key (kurum_id, yoklama_id) references ders.yoklamalar (kurum_id, id),
  constraint yoklama_gecmisi_degistiren_id_fk foreign key (kurum_id, degistiren_id) references hesap.uyelikler (kurum_id, id),
  constraint yoklama_gecmisi_yoklama_id_yoklama_surumu_uniq unique (yoklama_id, yoklama_surumu),
  constraint yoklama_gecmisi_onceki_durum_chk check (onceki_durum is null or onceki_durum in ('geldi', 'gelmedi', 'izinli', 'gec')),
  constraint yoklama_gecmisi_yeni_durum_chk check (yeni_durum in ('geldi', 'gelmedi', 'izinli', 'gec'))
);
create index yoklama_gecmisi_kurum_id_yoklama_id_yoklama_surumu_idx
  on ders.yoklama_gecmisi (kurum_id, yoklama_id, yoklama_surumu);
create trigger yoklama_gecmisi_degismez_trg before update or delete on ders.yoklama_gecmisi
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on ders.yoklama_gecmisi from api_app, api_sistem;
alter table ders.yoklama_gecmisi enable row level security;
alter table ders.yoklama_gecmisi force row level security;
create policy kiraci_izolasyonu on ders.yoklama_gecmisi
  using (kurum_id = ortak.aktif_kurum())
  with check (kurum_id = ortak.aktif_kurum());

-- Istemci istek kimligi (Idempotency-Key). Yoklama islemiyle ayni islemde yazilir; islem geri alinirsa
-- satir da gider. 14 gunden eski satirlar saatlik isle silinir.
create table ders.yoklama_istekleri (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  istek_id       uuid        not null,
  ders_id        uuid        not null,
  kullanici_id   uuid        not null,
  govde_sha256   bytea       not null,
  durum_kodu     smallint    not null,
  yanit          jsonb       not null,
  constraint yoklama_istekleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint yoklama_istekleri_kurum_id_istek_id_uniq unique (kurum_id, istek_id)
);
create index yoklama_istekleri_created_at_idx on ders.yoklama_istekleri (created_at);
select ortak.kiraci_tablosu_koru('ders', 'yoklama_istekleri', false);
