-- 0009_ogrenme_mufredat: mufredat kutuphanesi (surumler, konu agaci, kurum atamalari). Icerik (tohum) migration'da degil.
-- Genislet-daralt: yalniz yeni sema ve tablolar. Odev tablolari sonraki paketin.

create schema if not exists ogrenme;
grant usage on schema ogrenme to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant usage, select on sequences to api_app, api_sistem;

-- Global katalog surumu (G). RLS yok; yazma yalniz api_owner (tohum/platform editoru).
create table ogrenme.mufredat_surumleri (
  id             uuid primary key,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  katalog_kodu   text        not null,
  surum_no       int         not null,
  ad             text        not null,
  aciklama       text,
  yayinlandi_at  timestamptz,
  constraint mufredat_surumleri_katalog_kodu_chk check (katalog_kodu in ('lgs', 'tyt', 'ayt', 'ydt', 'okul')),
  constraint mufredat_surumleri_surum_no_chk check (surum_no > 0),
  constraint mufredat_surumleri_ad_chk check (char_length(ad) between 1 and 200),
  constraint mufredat_surumleri_aciklama_chk check (aciklama is null or char_length(aciklama) <= 4000),
  constraint mufredat_surumleri_katalog_kodu_surum_no_uniq unique (katalog_kodu, surum_no)
);
create trigger mufredat_surumleri_updated_at_trg before update on ogrenme.mufredat_surumleri
  for each row execute function ortak.updated_at_ayarla();
revoke insert, update, delete on ogrenme.mufredat_surumleri from api_app;

create function ogrenme.yayinli_surum_degismez() returns trigger
  language plpgsql as $$
begin
  if old.yayinlandi_at is not null then
    raise exception 'yayinli_surum_degismez' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger mufredat_surumleri_yayinli_trg before update on ogrenme.mufredat_surumleri
  for each row execute function ogrenme.yayinli_surum_degismez();

-- Konu agaci (GS + kurum_id NULL). kurum_id NULL = global katalog; dolu = kuruma ozel konu.
create table ogrenme.konular (
  id                       uuid primary key,
  kurum_id                 uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  surum                    bigint      not null default 1,
  katalog_kodu             text,
  brans_kodu               text        not null,
  ust_id                   uuid,
  seviye                   text        not null,
  ad                       text        not null,
  kazanim_kodu             text,
  sira                     int         not null default 0,
  sinif_seviyesi           smallint,
  gecerli_surum_baslangic  int,
  gecerli_surum_bitis      int,
  yerine_gecen_id          uuid,
  arsivlendi_at            timestamptz,
  constraint konular_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint konular_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint konular_ust_id_fk foreign key (ust_id) references ogrenme.konular (id),
  constraint konular_yerine_gecen_id_fk foreign key (yerine_gecen_id) references ogrenme.konular (id),
  constraint konular_katalog_kodu_chk check (katalog_kodu is null or katalog_kodu in ('lgs', 'tyt', 'ayt', 'ydt', 'okul')),
  constraint konular_seviye_chk check (seviye in ('unite', 'konu', 'alt_konu')),
  constraint konular_ad_chk check (char_length(ad) between 1 and 200),
  constraint konular_kazanim_kodu_chk check (kazanim_kodu is null or char_length(kazanim_kodu) <= 50),
  constraint konular_sinif_seviyesi_chk check (sinif_seviyesi is null or sinif_seviyesi between 5 and 12),
  constraint konular_global_chk check (kurum_id is not null or (katalog_kodu is not null and gecerli_surum_baslangic is not null)),
  constraint konular_kurum_chk check (kurum_id is null or (katalog_kodu is null and gecerli_surum_baslangic is null and gecerli_surum_bitis is null)),
  constraint konular_surum_araligi_chk check (gecerli_surum_bitis is null or gecerli_surum_bitis > gecerli_surum_baslangic),
  constraint konular_ust_kendisi_chk check (ust_id is null or ust_id <> id)
);
create index konular_global_agac_idx on ogrenme.konular (katalog_kodu, brans_kodu, ust_id, sira) where kurum_id is null;
create index konular_kurum_agac_idx on ogrenme.konular (kurum_id, brans_kodu, ust_id) where kurum_id is not null;
create index konular_ust_id_idx on ogrenme.konular (ust_id);
-- Turkce duyarsiz arama: sorgu da ayni translate'ten gecer (I, İ, ı -> i); ILIKE ü/Ü/ş/Ş... katlar.
create index konular_ad_trgm_idx on ogrenme.konular using gin (translate(ad, 'İIı', 'iii') gin_trgm_ops);

-- Karma RLS: global satirlari herkes okur; yalniz kendi kurumunun satirlarini yazar. DELETE yok.
alter table ogrenme.konular enable row level security;
alter table ogrenme.konular force row level security;
create policy konular_oku on ogrenme.konular for select
  using (kurum_id is null or kurum_id = ortak.aktif_kurum());
create policy konular_ekle on ogrenme.konular for insert
  with check (kurum_id = ortak.aktif_kurum());
create policy konular_guncelle on ogrenme.konular for update
  using (kurum_id = ortak.aktif_kurum()) with check (kurum_id = ortak.aktif_kurum());
revoke delete on ogrenme.konular from api_app, api_sistem;
create trigger konular_updated_at_trg before update on ogrenme.konular
  for each row execute function ortak.updated_at_ayarla();
create trigger konular_surum_trg before update on ogrenme.konular
  for each row execute function ortak.surum_artir();

-- Ust-alt ayni kapsamda: global konunun ustu global (ayni katalog), kurum konusunun ustu global veya ayni kurumun.
create function ogrenme.konu_ust_kapsami() returns trigger
  language plpgsql as $$
declare
  ust record;
begin
  if new.ust_id is null then
    return new;
  end if;
  select kurum_id, katalog_kodu into ust from ogrenme.konular where id = new.ust_id;
  if not found then
    raise exception 'konu_ust_bulunamadi' using errcode = 'foreign_key_violation';
  end if;
  if new.kurum_id is null then
    if ust.kurum_id is not null or ust.katalog_kodu is distinct from new.katalog_kodu then
      raise exception 'konu_ust_kapsami' using errcode = 'integrity_constraint_violation';
    end if;
  elsif ust.kurum_id is not null and ust.kurum_id <> new.kurum_id then
    raise exception 'konu_ust_kapsami' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger konular_ust_kapsami_trg before insert or update of ust_id, kurum_id, katalog_kodu on ogrenme.konular
  for each row execute function ogrenme.konu_ust_kapsami();

-- Kurum/kademe/grup icin katalog surumu secimi (KS). Kayit yoksa en yuksek yayinlanmis surum.
create table ogrenme.mufredat_atamalari (
  id            uuid primary key,
  kurum_id      uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  surum         bigint      not null default 1,
  kapsam        text        not null,
  kapsam_id     uuid        not null,
  katalog_kodu  text        not null,
  surum_no      int         not null,
  constraint mufredat_atamalari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint mufredat_atamalari_surum_fk foreign key (katalog_kodu, surum_no)
    references ogrenme.mufredat_surumleri (katalog_kodu, surum_no),
  constraint mufredat_atamalari_kapsam_chk check (kapsam in ('kurum', 'kademe', 'grup')),
  constraint mufredat_atamalari_kapsam_uniq unique (kurum_id, kapsam, kapsam_id, katalog_kodu)
);
select ortak.kiraci_tablosu_koru('ogrenme', 'mufredat_atamalari');
