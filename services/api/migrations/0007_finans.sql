-- 0007_finans: paket, kredi, ucret, tahsilat ve defterler (ADR 0007, docs/schema/api.md `finans`).
-- Genislet-daralt: yalnizca yeni sema ve tablolar. `finans` semasi api_owner tarafindan olusturulur;
-- uygulama rolleri varsayilan olarak DML alir, defter tablolarinda UPDATE/DELETE ayrica geri alinir.

create schema if not exists finans;

grant usage on schema finans to api_app, api_sistem;
alter default privileges for role api_owner in schema finans
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema finans
  grant usage, select on sequences to api_app, api_sistem;

-- Kurum bazli kredi dusum politikasi (kurum basina tek satir; satir yoksa varsayilanlar).
create table finans.kredi_politikalari (
  id                         uuid primary key,
  kurum_id                   uuid        not null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  surum                      bigint      not null default 1,
  geldi_dusurur              boolean     not null default true,
  gec_dusurur                boolean     not null default true,
  gelmedi_dusurur            boolean     not null default true,
  izinli_dusurur             boolean     not null default false,
  ogrenci_gec_iptal_dusurur  boolean     not null default true,
  gec_iptal_saat             smallint    not null default 24,
  dusuk_kredi_esigi          smallint    not null default 2,
  constraint kredi_politikalari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kredi_politikalari_kurum_id_uniq unique (kurum_id),
  constraint kredi_politikalari_gec_iptal_saat_chk check (gec_iptal_saat between 0 and 168),
  constraint kredi_politikalari_dusuk_kredi_esigi_chk check (dusuk_kredi_esigi between 0 and 1000)
);
select ortak.kiraci_tablosu_koru('finans', 'kredi_politikalari');

-- Ogrencinin faturalama modeli ve (Faz 1'de duz bilgi olarak) odeyen kisi. Odeyen bilgisi
-- hicbir olaya, loga veya Excel disindaki dis ciktiya girmez.
create table finans.ogrenci_finans_profilleri (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ogrenci_id       uuid        not null,
  model            text        not null default 'paket',
  odeyen_ad        text,
  odeyen_telefon   text,
  constraint ogrenci_finans_profilleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ogrenci_finans_profilleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id)
    references hesap.uyelikler (kurum_id, id),
  constraint ogrenci_finans_profilleri_model_chk check (model in ('paket', 'ders_basi', 'yok')),
  constraint ogrenci_finans_profilleri_odeyen_ad_chk check (odeyen_ad is null or char_length(odeyen_ad) between 1 and 200),
  constraint ogrenci_finans_profilleri_odeyen_telefon_chk check (odeyen_telefon is null or char_length(odeyen_telefon) between 1 and 32),
  constraint ogrenci_finans_profilleri_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id)
);
select ortak.kiraci_tablosu_koru('finans', 'ogrenci_finans_profilleri');
create trigger ogrenci_finans_profilleri_ogrenci_rol_trg before insert or update on finans.ogrenci_finans_profilleri
  for each row execute function hesap.uyelik_rolu_denetle('ogrenci_id', 'ogrenci');

create table finans.paketler (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  surum             bigint      not null default 1,
  ad                text        not null,
  kredi_adedi       int         not null,
  fiyat_kurus       bigint      not null,
  kredi_politikasi  jsonb,
  gecerlilik_gun    int,
  grup_turu         text,
  brans_kodu        text,
  aktif             boolean     not null default true,
  arsivlendi_at     timestamptz,
  constraint paketler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint paketler_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint paketler_kurum_id_id_uniq unique (kurum_id, id),
  constraint paketler_ad_chk check (char_length(ad) between 1 and 200),
  constraint paketler_kredi_adedi_chk check (kredi_adedi > 0),
  constraint paketler_fiyat_kurus_chk check (fiyat_kurus >= 0),
  constraint paketler_gecerlilik_gun_chk check (gecerlilik_gun is null or gecerlilik_gun > 0),
  constraint paketler_grup_turu_chk check (grup_turu is null or grup_turu in ('birebir', 'grup', 'sinif', 'etut')),
  constraint paketler_arsiv_chk check ((arsivlendi_at is not null) = (not aktif))
);
create index paketler_kurum_id_aktif_idx on finans.paketler (kurum_id, aktif);
select ortak.kiraci_tablosu_koru('finans', 'paketler');

create table finans.paket_satislari (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  surum             bigint      not null default 1,
  ogrenci_id        uuid        not null,
  paket_id          uuid,
  ad                text        not null,
  toplam_kredi      int         not null,
  fiyat_kurus       bigint      not null,
  baslangic_tarihi  date        not null default current_date,
  bitis_tarihi      date,
  durum             text        not null default 'aktif',
  satan_id          uuid        not null,
  iptal_at          timestamptz,
  constraint paket_satislari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint paket_satislari_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint paket_satislari_paket_id_fk foreign key (kurum_id, paket_id) references finans.paketler (kurum_id, id),
  constraint paket_satislari_kurum_id_id_uniq unique (kurum_id, id),
  constraint paket_satislari_ad_chk check (char_length(ad) between 1 and 200),
  constraint paket_satislari_toplam_kredi_chk check (toplam_kredi > 0),
  constraint paket_satislari_fiyat_kurus_chk check (fiyat_kurus >= 0),
  constraint paket_satislari_durum_chk check (durum in ('aktif', 'tukendi', 'suresi_doldu', 'iptal')),
  constraint paket_satislari_tarih_chk check (bitis_tarihi is null or bitis_tarihi >= baslangic_tarihi),
  constraint paket_satislari_iptal_chk check ((durum = 'iptal') = (iptal_at is not null))
);
create index paket_satislari_kurum_id_ogrenci_id_durum_bitis_idx
  on finans.paket_satislari (kurum_id, ogrenci_id, durum, bitis_tarihi);
create index paket_satislari_kurum_id_paket_id_idx on finans.paket_satislari (kurum_id, paket_id);
select ortak.kiraci_tablosu_koru('finans', 'paket_satislari');
create trigger paket_satislari_ogrenci_rol_trg before insert or update on finans.paket_satislari
  for each row execute function hesap.uyelik_rolu_denetle('ogrenci_id', 'ogrenci');

-- Kredi defteri (yalnizca ekleme).
create table finans.kredi_hareketleri (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  ogrenci_id        uuid        not null,
  paket_satisi_id   uuid,
  tur               text        not null,
  miktar            int         not null,
  ders_id           uuid,
  yoklama_id        uuid,
  yoklama_surumu    bigint,
  ters_cevrilen_id  uuid,
  neden             text,
  constraint kredi_hareketleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kredi_hareketleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint kredi_hareketleri_paket_satisi_id_fk foreign key (kurum_id, paket_satisi_id)
    references finans.paket_satislari (kurum_id, id),
  constraint kredi_hareketleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint kredi_hareketleri_ters_cevrilen_id_fk foreign key (kurum_id, ters_cevrilen_id)
    references finans.kredi_hareketleri (kurum_id, id),
  constraint kredi_hareketleri_tur_chk check (tur in
    ('satin_alma', 'dusum', 'iptal_dusum', 'iade', 'duzeltme', 'son_kullanma', 'ters_kayit')),
  constraint kredi_hareketleri_miktar_chk check (miktar <> 0),
  constraint kredi_hareketleri_isaret_chk check (
    (tur not in ('satin_alma', 'iade') or miktar > 0)
    and (tur not in ('dusum', 'iptal_dusum', 'son_kullanma') or miktar < 0)),
  constraint kredi_hareketleri_dusum_chk check (
    tur <> 'dusum' or (yoklama_id is not null and yoklama_surumu is not null and miktar < 0)),
  constraint kredi_hareketleri_ters_chk check (
    (tur not in ('iade', 'ters_kayit') or ters_cevrilen_id is not null)
    and (ters_cevrilen_id is null or tur in ('iade', 'ters_kayit'))),
  constraint kredi_hareketleri_neden_chk check (tur not in ('duzeltme', 'ters_kayit') or neden is not null),
  constraint kredi_hareketleri_neden_uzunluk_chk check (neden is null or char_length(neden) <= 500)
);
create unique index kredi_hareketleri_dusum_uniq
  on finans.kredi_hareketleri (yoklama_id, yoklama_surumu) where tur = 'dusum';
create unique index kredi_hareketleri_ters_cevrilen_id_uniq
  on finans.kredi_hareketleri (ters_cevrilen_id) where ters_cevrilen_id is not null;
create unique index kredi_hareketleri_iptal_dusum_uniq
  on finans.kredi_hareketleri (ders_id, ogrenci_id) where tur = 'iptal_dusum';
create unique index kredi_hareketleri_satin_alma_uniq
  on finans.kredi_hareketleri (paket_satisi_id) where tur = 'satin_alma';
create index kredi_hareketleri_kurum_id_ogrenci_id_created_at_idx
  on finans.kredi_hareketleri (kurum_id, ogrenci_id, created_at desc, id desc);
create index kredi_hareketleri_kurum_id_paket_satisi_id_idx
  on finans.kredi_hareketleri (kurum_id, paket_satisi_id);
create index kredi_hareketleri_kurum_id_yoklama_id_idx on finans.kredi_hareketleri (kurum_id, yoklama_id);
create index kredi_hareketleri_kurum_id_ders_id_idx on finans.kredi_hareketleri (kurum_id, ders_id);
create trigger kredi_hareketleri_degismez_trg before update or delete on finans.kredi_hareketleri
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on finans.kredi_hareketleri from api_app, api_sistem;
alter table finans.kredi_hareketleri enable row level security;
alter table finans.kredi_hareketleri force row level security;
create policy kiraci_izolasyonu on finans.kredi_hareketleri
  using (kurum_id = ortak.aktif_kurum())
  with check (kurum_id = ortak.aktif_kurum());

-- Net gorunum: ters cevrilmemis ozgun satirlar (ters kayitlar ve ters cevrilen satirlar disarida).
create view finans.v_kredi_hareketleri_net with (security_invoker = true) as
select k.*
from finans.kredi_hareketleri k
where k.ters_cevrilen_id is null
  and not exists (
    select 1 from finans.kredi_hareketleri t
    where t.kurum_id = k.kurum_id and t.ters_cevrilen_id = k.id);

create table finans.kredi_bakiyeleri (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  surum       bigint      not null default 1,
  ogrenci_id  uuid        not null,
  bakiye      int         not null default 0,
  constraint kredi_bakiyeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kredi_bakiyeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint kredi_bakiyeleri_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id)
);
select ortak.kiraci_tablosu_koru('finans', 'kredi_bakiyeleri');

create table finans.ucret_tarifeleri (
  id                    uuid primary key,
  kurum_id              uuid        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  surum                 bigint      not null default 1,
  ogrenci_id            uuid,
  grup_id               uuid,
  brans_kodu            text,
  ucret_kurus           bigint      not null,
  gecerlilik_baslangic  date        not null,
  gecerlilik_bitis      date,
  constraint ucret_tarifeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ucret_tarifeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ucret_tarifeleri_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint ucret_tarifeleri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint ucret_tarifeleri_ucret_kurus_chk check (ucret_kurus >= 0),
  constraint ucret_tarifeleri_tarih_chk check (gecerlilik_bitis is null or gecerlilik_bitis >= gecerlilik_baslangic)
);
create index ucret_tarifeleri_kurum_id_ogrenci_id_idx on finans.ucret_tarifeleri (kurum_id, ogrenci_id);
create index ucret_tarifeleri_kurum_id_grup_id_idx on finans.ucret_tarifeleri (kurum_id, grup_id);
select ortak.kiraci_tablosu_koru('finans', 'ucret_tarifeleri');

create table finans.tahsilatlar (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ogrenci_id       uuid        not null,
  tutar_kurus      bigint      not null,
  yontem           text        not null,
  tahsilat_tarihi  date        not null default current_date,
  makbuz_no        text,
  paket_satisi_id  uuid,
  aciklama         text,
  alan_id          uuid        not null,
  durum            text        not null default 'gecerli',
  iptal_at         timestamptz,
  iptal_nedeni     text,
  istek_id         uuid,
  constraint tahsilatlar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint tahsilatlar_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint tahsilatlar_paket_satisi_id_fk foreign key (kurum_id, paket_satisi_id)
    references finans.paket_satislari (kurum_id, id),
  constraint tahsilatlar_kurum_id_id_uniq unique (kurum_id, id),
  constraint tahsilatlar_tutar_kurus_chk check (tutar_kurus > 0),
  constraint tahsilatlar_yontem_chk check (yontem in ('nakit', 'havale', 'kart', 'diger')),
  constraint tahsilatlar_durum_chk check (durum in ('gecerli', 'iptal')),
  constraint tahsilatlar_iptal_chk check ((durum = 'iptal') = (iptal_at is not null)),
  constraint tahsilatlar_makbuz_no_chk check (makbuz_no is null or char_length(makbuz_no) between 1 and 64),
  constraint tahsilatlar_aciklama_chk check (aciklama is null or char_length(aciklama) <= 500),
  constraint tahsilatlar_iptal_nedeni_chk check (iptal_nedeni is null or char_length(iptal_nedeni) between 1 and 500)
);
create unique index tahsilatlar_kurum_id_makbuz_no_uniq
  on finans.tahsilatlar (kurum_id, makbuz_no) where makbuz_no is not null;
create unique index tahsilatlar_kurum_id_istek_id_uniq
  on finans.tahsilatlar (kurum_id, istek_id) where istek_id is not null;
create index tahsilatlar_kurum_id_ogrenci_id_tarih_idx
  on finans.tahsilatlar (kurum_id, ogrenci_id, tahsilat_tarihi desc);
create index tahsilatlar_kurum_id_tarih_idx on finans.tahsilatlar (kurum_id, tahsilat_tarihi);
select ortak.kiraci_tablosu_koru('finans', 'tahsilatlar');
create trigger tahsilatlar_ogrenci_rol_trg before insert or update on finans.tahsilatlar
  for each row execute function hesap.uyelik_rolu_denetle('ogrenci_id', 'ogrenci');

-- Ogrenci parasal hesabi defteri (yalnizca ekleme). Negatif bakiye = ogrenci borclu.
-- Dokumana eklenen sutun: `ders_id` (iptal kaynakli ders ucretinin dersle/ogrenciyle tekilligi icin).
create table finans.bakiye_hareketleri (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  ogrenci_id        uuid        not null,
  tur               text        not null,
  tutar_kurus       bigint      not null,
  para_birimi       text        not null default 'TRY',
  kaynak_turu       text        not null,
  kaynak_id         uuid,
  ders_id           uuid,
  yoklama_id        uuid,
  yoklama_surumu    bigint,
  ters_cevrilen_id  uuid,
  neden             text,
  constraint bakiye_hareketleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint bakiye_hareketleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint bakiye_hareketleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint bakiye_hareketleri_ters_cevrilen_id_fk foreign key (kurum_id, ters_cevrilen_id)
    references finans.bakiye_hareketleri (kurum_id, id),
  constraint bakiye_hareketleri_tur_chk check (tur in
    ('ders_ucreti', 'paket_satisi', 'tahsilat', 'duzeltme', 'ters_kayit')),
  constraint bakiye_hareketleri_tutar_kurus_chk check (tutar_kurus <> 0),
  constraint bakiye_hareketleri_isaret_chk check (
    (tur not in ('ders_ucreti', 'paket_satisi') or tutar_kurus < 0)
    and (tur <> 'tahsilat' or tutar_kurus > 0)),
  constraint bakiye_hareketleri_para_birimi_chk check (para_birimi = 'TRY'),
  constraint bakiye_hareketleri_kaynak_turu_chk check (kaynak_turu in
    ('yoklama', 'paket_satisi', 'tahsilat', 'elle', 'ders_iptal')),
  constraint bakiye_hareketleri_ters_chk check (
    (tur <> 'ters_kayit' or ters_cevrilen_id is not null)
    and (ters_cevrilen_id is null or tur = 'ters_kayit')),
  constraint bakiye_hareketleri_neden_chk check (tur not in ('duzeltme', 'ters_kayit') or neden is not null),
  constraint bakiye_hareketleri_neden_uzunluk_chk check (neden is null or char_length(neden) <= 500)
);
create unique index bakiye_hareketleri_ders_ucreti_uniq
  on finans.bakiye_hareketleri (yoklama_id, yoklama_surumu) where tur = 'ders_ucreti' and yoklama_id is not null;
create unique index bakiye_hareketleri_iptal_ucreti_uniq
  on finans.bakiye_hareketleri (ders_id, ogrenci_id) where tur = 'ders_ucreti' and kaynak_turu = 'ders_iptal';
create unique index bakiye_hareketleri_ters_cevrilen_id_uniq
  on finans.bakiye_hareketleri (ters_cevrilen_id) where ters_cevrilen_id is not null;
create unique index bakiye_hareketleri_kaynak_uniq
  on finans.bakiye_hareketleri (kaynak_turu, kaynak_id) where tur in ('tahsilat', 'paket_satisi');
create index bakiye_hareketleri_kurum_id_ogrenci_id_created_at_idx
  on finans.bakiye_hareketleri (kurum_id, ogrenci_id, created_at desc, id desc);
create index bakiye_hareketleri_kurum_id_yoklama_id_idx on finans.bakiye_hareketleri (kurum_id, yoklama_id);
create index bakiye_hareketleri_kurum_id_ders_id_idx on finans.bakiye_hareketleri (kurum_id, ders_id);
create trigger bakiye_hareketleri_degismez_trg before update or delete on finans.bakiye_hareketleri
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on finans.bakiye_hareketleri from api_app, api_sistem;
alter table finans.bakiye_hareketleri enable row level security;
alter table finans.bakiye_hareketleri force row level security;
create policy kiraci_izolasyonu on finans.bakiye_hareketleri
  using (kurum_id = ortak.aktif_kurum())
  with check (kurum_id = ortak.aktif_kurum());

create table finans.ogrenci_bakiyeleri (
  id           uuid primary key,
  kurum_id     uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  surum        bigint      not null default 1,
  ogrenci_id   uuid        not null,
  bakiye_kurus bigint      not null default 0,
  constraint ogrenci_bakiyeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ogrenci_bakiyeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ogrenci_bakiyeleri_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id)
);
select ortak.kiraci_tablosu_koru('finans', 'ogrenci_bakiyeleri');
