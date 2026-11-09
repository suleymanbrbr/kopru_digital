-- 0010_ogrenme_odev: odev tanimi, ogrenci odev satirlari (fan-out cikti) ve ogretmen sablonlari.
-- Genislet-daralt: yalniz yeni tablolar. `odev_ekleri` ve `teslim_dosyalari` medya blogunda eklenir.
-- `konu_id` mufredat tablolarina FK'siz uuid'dir (mufredat paketi ayri).

create schema if not exists ogrenme;
grant usage on schema ogrenme to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant usage, select on sequences to api_app, api_sistem;

create table ogrenme.odevler (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  surum               bigint      not null default 1,
  baslik              text        not null,
  aciklama            text,
  brans_kodu          text        not null,
  konu_id             uuid,
  tur                 text        not null default 'soru',
  kaynak              text,
  hedef_turu          text        not null,
  hedef_id            uuid        not null,
  veren_id            uuid        not null,
  son_teslim_at       timestamptz,
  hedef_soru_sayisi   int,
  fotograf_gerekli    boolean     not null default false,
  durum               text        not null default 'taslak',
  yayin_at            timestamptz,
  fan_out_durum       text        not null default 'bekliyor',
  atanan_sayisi       int         not null default 0,
  constraint odevler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint odevler_veren_id_fk foreign key (kurum_id, veren_id) references hesap.uyelikler (kurum_id, id),
  constraint odevler_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint odevler_kurum_id_id_uniq unique (kurum_id, id),
  constraint odevler_baslik_chk check (char_length(baslik) between 1 and 200),
  constraint odevler_aciklama_chk check (aciklama is null or char_length(aciklama) <= 4000),
  constraint odevler_tur_chk check (tur in ('soru', 'sayfa', 'serbest')),
  constraint odevler_kaynak_chk check (kaynak is null or char_length(kaynak) <= 200),
  constraint odevler_hedef_turu_chk check (hedef_turu in ('ogrenci', 'grup', 'kademe', 'kurum')),
  constraint odevler_hedef_kurum_chk check (hedef_turu <> 'kurum' or hedef_id = kurum_id),
  constraint odevler_hedef_soru_sayisi_chk check (hedef_soru_sayisi is null or hedef_soru_sayisi > 0),
  constraint odevler_durum_chk check (durum in ('taslak', 'yayinda', 'kapali')),
  constraint odevler_yayin_chk check (durum = 'taslak' or yayin_at is not null),
  constraint odevler_fan_out_durum_chk check (fan_out_durum in ('bekliyor', 'calisiyor', 'tamamlandi')),
  constraint odevler_atanan_sayisi_chk check (atanan_sayisi >= 0)
);
create index odevler_kurum_id_veren_id_created_at_idx on ogrenme.odevler (kurum_id, veren_id, created_at desc);
create index odevler_kurum_id_hedef_turu_hedef_id_durum_idx on ogrenme.odevler (kurum_id, hedef_turu, hedef_id, durum);
create index odevler_kurum_id_durum_son_teslim_at_idx on ogrenme.odevler (kurum_id, durum, son_teslim_at);
select ortak.kiraci_tablosu_koru('ogrenme', 'odevler');

create table ogrenme.ogrenci_odevleri (
  id                    uuid primary key,
  kurum_id              uuid        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  surum                 bigint      not null default 1,
  odev_id               uuid        not null,
  ogrenci_id            uuid        not null,
  durum                 text        not null default 'atandi',
  son_teslim_at         timestamptz,
  yapilan_soru_sayisi   int,
  dogru_sayisi          int,
  yanlis_sayisi         int,
  bos_sayisi            int,
  ogrenci_notu          text,
  teslim_at             timestamptz,
  gec_teslim            boolean     not null default false,
  inceleme_sonucu       text,
  inceleme_notu         text,
  inceleyen_id          uuid,
  incelendi_at          timestamptz,
  constraint ogrenci_odevleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ogrenci_odevleri_odev_id_fk foreign key (kurum_id, odev_id) references ogrenme.odevler (kurum_id, id),
  constraint ogrenci_odevleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ogrenci_odevleri_inceleyen_id_fk foreign key (kurum_id, inceleyen_id) references hesap.uyelikler (kurum_id, id),
  constraint ogrenci_odevleri_odev_id_ogrenci_id_uniq unique (odev_id, ogrenci_id),
  constraint ogrenci_odevleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint ogrenci_odevleri_durum_chk check (durum in ('atandi', 'teslim_edildi', 'incelendi', 'tekrar_istendi', 'iptal')),
  constraint ogrenci_odevleri_sayilar_chk check (
    (yapilan_soru_sayisi is null or yapilan_soru_sayisi >= 0)
    and (dogru_sayisi is null or dogru_sayisi >= 0)
    and (yanlis_sayisi is null or yanlis_sayisi >= 0)
    and (bos_sayisi is null or bos_sayisi >= 0)
  ),
  constraint ogrenci_odevleri_toplam_chk check (
    coalesce(dogru_sayisi, 0) + coalesce(yanlis_sayisi, 0) + coalesce(bos_sayisi, 0)
      <= coalesce(yapilan_soru_sayisi, 0)
  ),
  constraint ogrenci_odevleri_ogrenci_notu_chk check (ogrenci_notu is null or char_length(ogrenci_notu) <= 1000),
  constraint ogrenci_odevleri_inceleme_sonucu_chk check (inceleme_sonucu is null or inceleme_sonucu in ('tamam', 'eksik', 'tekrar')),
  constraint ogrenci_odevleri_inceleme_notu_chk check (inceleme_notu is null or char_length(inceleme_notu) <= 1000),
  constraint ogrenci_odevleri_teslim_at_chk check (
    (durum in ('teslim_edildi', 'incelendi', 'tekrar_istendi')) = (teslim_at is not null) or durum = 'iptal'
  ),
  constraint ogrenci_odevleri_incelendi_at_chk check (
    (durum = 'incelendi') = (incelendi_at is not null) or durum in ('tekrar_istendi', 'iptal')
  )
);
create index ogrenci_odevleri_kurum_id_ogrenci_id_durum_son_teslim_at_idx
  on ogrenme.ogrenci_odevleri (kurum_id, ogrenci_id, durum, son_teslim_at);
create index ogrenci_odevleri_kurum_id_odev_id_durum_idx on ogrenme.ogrenci_odevleri (kurum_id, odev_id, durum);
select ortak.kiraci_tablosu_koru('ogrenme', 'ogrenci_odevleri');

-- Ogretmen basina tekrar kullanilabilir odev taslagi (hedef ve tarih icermez).
create table ogrenme.odev_sablonlari (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  ogretmen_id         uuid        not null,
  baslik              text        not null,
  aciklama            text,
  brans_kodu          text        not null,
  konu_id             uuid,
  tur                 text        not null default 'soru',
  kaynak              text,
  hedef_soru_sayisi   int,
  constraint odev_sablonlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint odev_sablonlari_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint odev_sablonlari_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint odev_sablonlari_baslik_chk check (char_length(baslik) between 1 and 200),
  constraint odev_sablonlari_aciklama_chk check (aciklama is null or char_length(aciklama) <= 4000),
  constraint odev_sablonlari_tur_chk check (tur in ('soru', 'sayfa', 'serbest')),
  constraint odev_sablonlari_kaynak_chk check (kaynak is null or char_length(kaynak) <= 200),
  constraint odev_sablonlari_hedef_soru_sayisi_chk check (hedef_soru_sayisi is null or hedef_soru_sayisi > 0)
);
create index odev_sablonlari_kurum_id_ogretmen_id_created_at_idx on ogrenme.odev_sablonlari (kurum_id, ogretmen_id, created_at desc);
select ortak.kiraci_tablosu_koru('ogrenme', 'odev_sablonlari', false);
