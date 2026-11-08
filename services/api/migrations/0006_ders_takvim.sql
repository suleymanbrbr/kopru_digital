-- 0006_ders_takvim: ders takvimi (seri kurali, dersler, katilimcilar). Yoklama tablolari sonraki paketin.
-- Genislet-daralt: yalniz yeni sema ve tablolar. `btree_gist` uzantisi bootstrap adiminda etkinlestirilir.

create schema if not exists ders;
grant usage on schema ders to api_app, api_sistem;
alter default privileges for role api_owner in schema ders
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema ders
  grant usage, select on sequences to api_app, api_sistem;

-- Tekrarlayan ders kurali. Dersler kuraldan 12 hafta ileriye uretilir (olusturma + gece isi).
create table ders.ders_serileri (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  surum               bigint      not null default 1,
  grup_id             uuid        not null,
  ogretmen_id         uuid        not null,
  brans_kodu          text        not null,
  baslik              text,
  tekrar_kurali       text        not null,
  baslangic_tarihi    date        not null,
  bitis_tarihi        date,
  adet                int,
  baslangic_saati     time        not null,
  sure_dk             smallint    not null,
  saat_dilimi         text        not null default 'Europe/Istanbul',
  online_baglanti     text,
  yer                 text,
  uretildi_son_tarih  date        not null,
  durum               text        not null default 'aktif',
  constraint ders_serileri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_serileri_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint ders_serileri_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_serileri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint ders_serileri_kurum_id_id_uniq unique (kurum_id, id),
  constraint ders_serileri_sure_chk check (sure_dk between 10 and 480),
  constraint ders_serileri_durum_chk check (durum in ('aktif', 'bitti', 'iptal')),
  constraint ders_serileri_bitis_adet_chk check (bitis_tarihi is null or adet is null),
  constraint ders_serileri_adet_chk check (adet is null or adet > 0),
  constraint ders_serileri_bitis_chk check (bitis_tarihi is null or bitis_tarihi >= baslangic_tarihi),
  constraint ders_serileri_baslik_chk check (baslik is null or char_length(baslik) <= 200),
  constraint ders_serileri_kural_chk check (char_length(tekrar_kurali) <= 200),
  constraint ders_serileri_online_baglanti_chk check (online_baglanti is null or char_length(online_baglanti) <= 2000),
  constraint ders_serileri_yer_chk check (yer is null or char_length(yer) <= 500)
);
create index ders_serileri_kurum_id_durum_uretildi_son_tarih_idx
  on ders.ders_serileri (kurum_id, durum, uretildi_son_tarih);
create index ders_serileri_grup_id_idx on ders.ders_serileri (kurum_id, grup_id);
select ortak.kiraci_tablosu_koru('ders', 'ders_serileri');

-- Takvimdeki tek ders (tekil ve seri dersleri).
create table ders.dersler (
  id                     uuid primary key,
  kurum_id               uuid        not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  surum                  bigint      not null default 1,
  grup_id                uuid        not null,
  seri_id                uuid,
  seri_sirasi            int,
  ogretmen_id            uuid        not null,
  brans_kodu             text        not null,
  konu_id                uuid,
  baslik                 text,
  baslangic_at           timestamptz not null,
  bitis_at               timestamptz not null,
  durum                  text        not null default 'planli',
  iptal_nedeni           text,
  iptal_eden_id          uuid,
  iptal_at               timestamptz,
  ilk_baslangic_at       timestamptz not null,
  ertelendi_sayisi       smallint    not null default 0,
  telafi                 boolean     not null default false,
  telafi_kaynak_ders_id  uuid,
  seri_istisna           boolean     not null default false,
  online_baglanti        text,
  yer                    text,
  cakisma_onayli         boolean     not null default false,
  iptal_kaynagi          text,
  gec_iptal              boolean     not null default false,
  constraint dersler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint dersler_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint dersler_seri_id_fk foreign key (kurum_id, seri_id) references ders.ders_serileri (kurum_id, id),
  constraint dersler_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint dersler_iptal_eden_id_fk foreign key (kurum_id, iptal_eden_id) references hesap.uyelikler (kurum_id, id),
  constraint dersler_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint dersler_kurum_id_id_uniq unique (kurum_id, id),
  constraint dersler_telafi_kaynak_ders_id_fk foreign key (kurum_id, telafi_kaynak_ders_id) references ders.dersler (kurum_id, id),
  constraint dersler_zaman_chk check (bitis_at > baslangic_at),
  constraint dersler_durum_chk check (durum in ('planli', 'tamamlandi', 'iptal')),
  constraint dersler_iptal_chk check (durum <> 'iptal' or (iptal_at is not null and iptal_kaynagi is not null)),
  constraint dersler_iptal_kaynagi_chk check (iptal_kaynagi is null or iptal_kaynagi in ('ogretmen', 'ogrenci', 'yonetici')),
  -- NULL kaynak da reddedilir (`iptal_kaynagi = 'ogrenci'` NULL olunca CHECK'ten gecerdi).
  constraint dersler_gec_iptal_chk check (not gec_iptal or coalesce(iptal_kaynagi = 'ogrenci', false)),
  constraint dersler_telafi_chk check (telafi or telafi_kaynak_ders_id is null),
  constraint dersler_ertelendi_sayisi_chk check (ertelendi_sayisi >= 0),
  constraint dersler_seri_sirasi_chk check ((seri_id is null) = (seri_sirasi is null)),
  constraint dersler_baslik_chk check (baslik is null or char_length(baslik) <= 200),
  constraint dersler_iptal_nedeni_chk check (iptal_nedeni is null or char_length(iptal_nedeni) <= 500),
  constraint dersler_online_baglanti_chk check (online_baglanti is null or char_length(online_baglanti) <= 2000),
  constraint dersler_yer_chk check (yer is null or char_length(yer) <= 500),
  -- Ogretmen cakismasi: onaylanmamis planli dersler ust uste binemez. Uygulama once sorgular
  -- (409 ders_cakismasi), kullanici onaylarsa cakisma_onayli=true yazilir; bu kisit yaris durumunu kapatir.
  constraint dersler_ogretmen_id_cakisma_excl exclude using gist (
    ogretmen_id with =, tstzrange(baslangic_at, bitis_at) with &&
  ) where (durum = 'planli' and not cakisma_onayli)
);
-- Seri uretiminin idempotent olmasi: ayni seri sirasi iki kez yazilamaz.
create unique index dersler_seri_id_seri_sirasi_uniq
  on ders.dersler (seri_id, seri_sirasi) where seri_id is not null;
create index dersler_kurum_id_baslangic_at_idx on ders.dersler (kurum_id, baslangic_at);
create index dersler_kurum_id_grup_id_baslangic_at_idx on ders.dersler (kurum_id, grup_id, baslangic_at);
create index dersler_kurum_id_ogretmen_id_baslangic_at_idx on ders.dersler (kurum_id, ogretmen_id, baslangic_at);
create index dersler_seri_id_idx on ders.dersler (seri_id);
select ortak.kiraci_tablosu_koru('ders', 'dersler');

-- Dersin beklenen ogrenci listesi (olusturulurken grubun etkin uyelerinden dondurulur).
create table ders.ders_katilimcilari (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  ders_id     uuid        not null,
  ogrenci_id  uuid        not null,
  tur         text        not null default 'uye',
  constraint ders_katilimcilari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_katilimcilari_ders_id_fk foreign key (kurum_id, ders_id) references ders.dersler (kurum_id, id),
  constraint ders_katilimcilari_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_katilimcilari_ders_id_ogrenci_id_uniq unique (ders_id, ogrenci_id),
  constraint ders_katilimcilari_tur_chk check (tur in ('uye', 'misafir', 'telafi'))
);
create index ders_katilimcilari_kurum_id_ogrenci_id_ders_id_idx
  on ders.ders_katilimcilari (kurum_id, ogrenci_id, ders_id);
select ortak.kiraci_tablosu_koru('ders', 'ders_katilimcilari', false);
