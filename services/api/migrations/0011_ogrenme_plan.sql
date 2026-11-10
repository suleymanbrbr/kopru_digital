-- 0011_ogrenme_plan: haftalik plan, plan gorevleri ve ogretmen plan sablonlari.
-- Genislet-daralt: yalniz yeni tablolar. `konu_id` mufredat tablolarina FK'siz uuid'dir (odev ile ayni).
-- Hafta Pazartesi baslar; hafta/gun hesabi uygulamada `Europe/Istanbul` takvimiyle yapilir, veritabani
-- yalniz Pazartesi ve gun araligi kisitini zorlar.

create table ogrenme.haftalik_planlar (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  surum             bigint      not null default 1,
  ogrenci_id        uuid        not null,
  hafta_baslangic   date        not null,
  hazirlayan_id     uuid        not null,
  durum             text        not null default 'taslak',
  yayin_at          timestamptz,
  "not"             text,
  constraint haftalik_planlar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint haftalik_planlar_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint haftalik_planlar_hazirlayan_id_fk foreign key (kurum_id, hazirlayan_id) references hesap.uyelikler (kurum_id, id),
  constraint haftalik_planlar_pazartesi_chk check (extract(isodow from hafta_baslangic) = 1),
  constraint haftalik_planlar_durum_chk check (durum in ('taslak', 'yayinda')),
  constraint haftalik_planlar_yayin_chk check (durum = 'taslak' or yayin_at is not null),
  constraint haftalik_planlar_not_chk check ("not" is null or char_length("not") <= 2000),
  constraint haftalik_planlar_ogrenci_hafta_uniq unique (kurum_id, ogrenci_id, hafta_baslangic),
  constraint haftalik_planlar_kurum_id_id_uniq unique (kurum_id, id),
  constraint haftalik_planlar_id_hafta_uniq unique (id, hafta_baslangic)
);
create index haftalik_planlar_kurum_id_ogrenci_id_hafta_idx
  on ogrenme.haftalik_planlar (kurum_id, ogrenci_id, hafta_baslangic desc);
select ortak.kiraci_tablosu_koru('ogrenme', 'haftalik_planlar');

create table ogrenme.plan_gorevleri (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  surum               bigint      not null default 1,
  plan_id             uuid        not null,
  ogrenci_id          uuid        not null,
  hafta_baslangic     date        not null,
  gun                 date        not null,
  brans_kodu          text        not null,
  konu_id             uuid,
  baslik              text,
  hedef_turu          text        not null,
  hedef_miktar        int         not null,
  gerceklesen_miktar  int,
  durum               text        not null default 'bekliyor',
  tamamlandi_at       timestamptz,
  devreden_gorev_id   uuid,
  sira                smallint    not null default 0,
  ekleyen_id          uuid        not null,
  constraint plan_gorevleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  -- Bilesik FK: gorevin haftasi plan ile ayni (hafta_baslangic denormalize) ve plan ayni kiracidadir.
  constraint plan_gorevleri_plan_hafta_fk foreign key (plan_id, hafta_baslangic)
    references ogrenme.haftalik_planlar (id, hafta_baslangic),
  constraint plan_gorevleri_kurum_plan_fk foreign key (kurum_id, plan_id)
    references ogrenme.haftalik_planlar (kurum_id, id),
  constraint plan_gorevleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint plan_gorevleri_ekleyen_id_fk foreign key (kurum_id, ekleyen_id) references hesap.uyelikler (kurum_id, id),
  constraint plan_gorevleri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint plan_gorevleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint plan_gorevleri_devreden_fk foreign key (kurum_id, devreden_gorev_id)
    references ogrenme.plan_gorevleri (kurum_id, id),
  constraint plan_gorevleri_gun_chk check (gun >= hafta_baslangic and gun < hafta_baslangic + 7),
  constraint plan_gorevleri_baslik_chk check (baslik is null or char_length(baslik) between 1 and 200),
  constraint plan_gorevleri_hedef_turu_chk check (hedef_turu in ('soru', 'dakika')),
  constraint plan_gorevleri_hedef_miktar_chk check (hedef_miktar > 0),
  constraint plan_gorevleri_gerceklesen_chk check (gerceklesen_miktar is null or gerceklesen_miktar >= 0),
  constraint plan_gorevleri_durum_chk check (durum in ('bekliyor', 'tamam', 'kismen', 'yapilmadi', 'devredildi')),
  constraint plan_gorevleri_tamamlandi_chk check (durum <> 'tamam' or tamamlandi_at is not null),
  constraint plan_gorevleri_devreden_kendisi_chk check (devreden_gorev_id is null or devreden_gorev_id <> id)
);
-- Bir gorev yalniz bir kez devredilir.
create unique index plan_gorevleri_devreden_gorev_id_uniq
  on ogrenme.plan_gorevleri (devreden_gorev_id) where devreden_gorev_id is not null;
create index plan_gorevleri_kurum_id_ogrenci_id_hafta_gun_idx
  on ogrenme.plan_gorevleri (kurum_id, ogrenci_id, hafta_baslangic, gun);
create index plan_gorevleri_plan_id_sira_idx on ogrenme.plan_gorevleri (plan_id, sira);
select ortak.kiraci_tablosu_koru('ogrenme', 'plan_gorevleri');

-- Ogretmen basina tekrar kullanilabilir hafta sablonu (ogrenci, hafta ve gerceklesen icermez).
create table ogrenme.plan_sablonlari (
  id            uuid primary key,
  kurum_id      uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  ogretmen_id   uuid        not null,
  ad            text        not null,
  aciklama      text,
  constraint plan_sablonlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint plan_sablonlari_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint plan_sablonlari_kurum_id_id_uniq unique (kurum_id, id),
  constraint plan_sablonlari_ad_chk check (char_length(ad) between 1 and 200),
  constraint plan_sablonlari_aciklama_chk check (aciklama is null or char_length(aciklama) <= 2000)
);
create index plan_sablonlari_kurum_id_ogretmen_id_created_at_idx
  on ogrenme.plan_sablonlari (kurum_id, ogretmen_id, created_at desc);
select ortak.kiraci_tablosu_koru('ogrenme', 'plan_sablonlari', false);

create table ogrenme.plan_sablon_gorevleri (
  id            uuid primary key,
  kurum_id      uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  sablon_id     uuid        not null,
  gun_sirasi    smallint    not null,
  brans_kodu    text        not null,
  konu_id       uuid,
  baslik        text,
  hedef_turu    text        not null,
  hedef_miktar  int         not null,
  sira          smallint    not null default 0,
  constraint plan_sablon_gorevleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint plan_sablon_gorevleri_sablon_id_fk foreign key (kurum_id, sablon_id)
    references ogrenme.plan_sablonlari (kurum_id, id) on delete cascade,
  constraint plan_sablon_gorevleri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint plan_sablon_gorevleri_gun_sirasi_chk check (gun_sirasi between 0 and 6),
  constraint plan_sablon_gorevleri_baslik_chk check (baslik is null or char_length(baslik) between 1 and 200),
  constraint plan_sablon_gorevleri_hedef_turu_chk check (hedef_turu in ('soru', 'dakika')),
  constraint plan_sablon_gorevleri_hedef_miktar_chk check (hedef_miktar > 0)
);
create index plan_sablon_gorevleri_kurum_id_sablon_id_idx
  on ogrenme.plan_sablon_gorevleri (kurum_id, sablon_id, gun_sirasi, sira);
select ortak.kiraci_tablosu_koru('ogrenme', 'plan_sablon_gorevleri', false);
