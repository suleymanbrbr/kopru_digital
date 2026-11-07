-- 0003_hesap_kurum: kurum yapisi, uyelik, grup, atama, davet, modul ayarlari, denetim.

-- Standart kiraci tablosu korumasi: RLS (ENABLE + FORCE), kiraci politikasi, updated_at ve
-- (istenirse) surum tetikleyicileri. Sonraki moduller de bunu kullanir.
create function ortak.kiraci_tablosu_koru(sema text, tablo text, surumlu boolean default true)
  returns void language plpgsql as $$
begin
  execute format('alter table %I.%I enable row level security', sema, tablo);
  execute format('alter table %I.%I force row level security', sema, tablo);
  execute format(
    'create policy kiraci_izolasyonu on %I.%I using (kurum_id = ortak.aktif_kurum()) with check (kurum_id = ortak.aktif_kurum())',
    sema, tablo);
  execute format(
    'create trigger %I before update on %I.%I for each row execute function ortak.updated_at_ayarla()',
    tablo || '_updated_at_trg', sema, tablo);
  if surumlu then
    execute format(
      'create trigger %I before update on %I.%I for each row execute function ortak.surum_artir()',
      tablo || '_surum_trg', sema, tablo);
  end if;
end $$;

-- Kiraci koku: id kiracidir. Satirlari yalnizca aktif kurum gorur.
create table hesap.kurumlar (
  id                       uuid primary key,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  surum                    bigint      not null default 1,
  ad                       text        not null,
  tur                      text        not null,
  kisa_ad                  citext,
  vergi_no                 text,
  telefon_e164             text,
  eposta                   text,
  adres                    jsonb,
  logo_dosya_id            uuid,
  saat_dilimi              text        not null default 'Europe/Istanbul',
  durum                    text        not null default 'aktif',
  ayarlar                  jsonb       not null default '{}',
  olusturan_kullanici_id   uuid        not null,
  kapatildi_at             timestamptz,
  constraint kurumlar_tur_chk check (tur in ('bireysel', 'ekip', 'kurum')),
  constraint kurumlar_durum_chk check (durum in ('aktif', 'askida', 'kapali')),
  constraint kurumlar_ad_chk check (char_length(ad) between 1 and 200),
  constraint kurumlar_kisa_ad_uniq unique (kisa_ad),
  constraint kurumlar_olusturan_kullanici_id_fk foreign key (olusturan_kullanici_id)
    references hesap.kullanicilar (id)
);
alter table hesap.kurumlar enable row level security;
alter table hesap.kurumlar force row level security;
create policy kiraci_izolasyonu on hesap.kurumlar
  using (id = ortak.aktif_kurum())
  with check (id = ortak.aktif_kurum());
create trigger kurumlar_updated_at_trg before update on hesap.kurumlar
  for each row execute function ortak.updated_at_ayarla();
create trigger kurumlar_surum_trg before update on hesap.kurumlar
  for each row execute function ortak.surum_artir();

create table hesap.subeler (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  ad             text        not null,
  adres          jsonb,
  telefon_e164   text,
  arsivlendi_at  timestamptz,
  constraint subeler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint subeler_kurum_id_id_uniq unique (kurum_id, id),
  constraint subeler_ad_chk check (char_length(ad) between 1 and 200)
);
create unique index subeler_kurum_id_ad_uniq on hesap.subeler (kurum_id, ad) where arsivlendi_at is null;
select ortak.kiraci_tablosu_koru('hesap', 'subeler');

create table hesap.kademeler (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  ad             text        not null,
  seviye         smallint,
  sira           smallint    not null default 100,
  arsivlendi_at  timestamptz,
  constraint kademeler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kademeler_kurum_id_id_uniq unique (kurum_id, id),
  constraint kademeler_seviye_chk check (seviye between 1 and 13),
  constraint kademeler_ad_chk check (char_length(ad) between 1 and 200)
);
create unique index kademeler_kurum_id_ad_uniq on hesap.kademeler (kurum_id, ad) where arsivlendi_at is null;
select ortak.kiraci_tablosu_koru('hesap', 'kademeler');

create table hesap.uyelikler (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  kullanici_id   uuid        not null,
  rol            text        not null,
  durum          text        not null default 'aktif',
  sube_id        uuid,
  kademe_id      uuid,
  ogrenci_no     text,
  gorunen_ad     text,
  katildi_at     timestamptz,
  ayrildi_at     timestamptz,
  constraint uyelikler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint uyelikler_kullanici_id_fk foreign key (kullanici_id) references hesap.kullanicilar (id),
  constraint uyelikler_sube_id_fk foreign key (kurum_id, sube_id) references hesap.subeler (kurum_id, id),
  constraint uyelikler_kademe_id_fk foreign key (kurum_id, kademe_id) references hesap.kademeler (kurum_id, id),
  constraint uyelikler_rol_chk check (rol in ('sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli')),
  constraint uyelikler_durum_chk check (durum in ('davetli', 'aktif', 'askida', 'ayrildi')),
  constraint uyelikler_kurum_id_kullanici_id_rol_uniq unique (kurum_id, kullanici_id, rol),
  constraint uyelikler_kurum_id_id_uniq unique (kurum_id, id),
  constraint uyelikler_kademe_rol_chk check (kademe_id is null or rol = 'ogrenci'),
  constraint uyelikler_ayrildi_chk check (durum <> 'ayrildi' or ayrildi_at is not null)
);
create index uyelikler_kullanici_id_idx on hesap.uyelikler (kullanici_id);
create index uyelikler_kurum_id_rol_durum_idx on hesap.uyelikler (kurum_id, rol, durum);
create index uyelikler_kurum_id_kademe_id_idx on hesap.uyelikler (kurum_id, kademe_id) where rol = 'ogrenci';
create index uyelikler_kurum_id_sube_id_idx on hesap.uyelikler (kurum_id, sube_id);
select ortak.kiraci_tablosu_koru('hesap', 'uyelikler');
-- Giris sonrasi kurum secimi icin kullanici kendi uyeliklerini (yalnizca SELECT) her kurumda gorur.
create policy kendi_uyelikleri on hesap.uyelikler for select
  using (kullanici_id = ortak.aktif_kullanici());

-- Kullanici, uyesi oldugu kurumlarin satirini (ad, tur) kurum secmeden de okuyabilir.
create policy uyelik_okuma on hesap.kurumlar for select
  using (exists (
    select 1 from hesap.uyelikler u
    where u.kurum_id = kurumlar.id and u.kullanici_id = ortak.aktif_kullanici()
      and u.durum = 'aktif'));

-- Bir kurumun en az bir etkin sahibi olmalidir (islem sonunda denetlenir).
create function hesap.son_sahip_korumasi() returns trigger
  language plpgsql as $$
begin
  if exists (select 1 from hesap.kurumlar k where k.id = old.kurum_id)
     and not exists (
       select 1 from hesap.uyelikler u
       where u.kurum_id = old.kurum_id and u.rol = 'sahip' and u.durum = 'aktif') then
    raise exception 'son_sahip_ayrilamaz' using errcode = 'integrity_constraint_violation';
  end if;
  return null;
end $$;
create constraint trigger uyelikler_sahip_var_trg
  after update or delete on hesap.uyelikler
  deferrable initially deferred
  for each row when (old.rol = 'sahip' and old.durum = 'aktif')
  execute function hesap.son_sahip_korumasi();

create table hesap.veli_ogrenci (
  id            uuid primary key,
  kurum_id      uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  veli_id       uuid        not null,
  ogrenci_id    uuid        not null,
  yakinlik      text,
  birincil      boolean     not null default false,
  onaylandi_at  timestamptz,
  constraint veli_ogrenci_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint veli_ogrenci_veli_id_fk foreign key (kurum_id, veli_id) references hesap.uyelikler (kurum_id, id),
  constraint veli_ogrenci_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint veli_ogrenci_yakinlik_chk check (yakinlik in ('anne', 'baba', 'vasi', 'diger')),
  constraint veli_ogrenci_veli_id_ogrenci_id_uniq unique (veli_id, ogrenci_id),
  constraint veli_ogrenci_farkli_chk check (veli_id <> ogrenci_id)
);
create index veli_ogrenci_ogrenci_id_idx on hesap.veli_ogrenci (ogrenci_id);
create index veli_ogrenci_kurum_id_idx on hesap.veli_ogrenci (kurum_id);
select ortak.kiraci_tablosu_koru('hesap', 'veli_ogrenci', false);

-- Uyelik rolu denetimi (veli_ogrenci, grup_uyeleri, atamalar tetikleyicileri ortak kullanir).
create function hesap.uyelik_rolu_denetle() returns trigger
  language plpgsql as $$
declare
  alan text := tg_argv[0];
  beklenen text := tg_argv[1];
  uyelik_id uuid;
  gercek text;
begin
  uyelik_id := (to_jsonb(new) ->> alan)::uuid;
  select rol into gercek from hesap.uyelikler where id = uyelik_id and kurum_id = new.kurum_id;
  if gercek is distinct from beklenen then
    raise exception 'uyelik_rolu_uygun_degil: % rolu % olmali', alan, beklenen
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger veli_ogrenci_veli_rol_trg before insert or update on hesap.veli_ogrenci
  for each row execute function hesap.uyelik_rolu_denetle('veli_id', 'veli');
create trigger veli_ogrenci_ogrenci_rol_trg before insert or update on hesap.veli_ogrenci
  for each row execute function hesap.uyelik_rolu_denetle('ogrenci_id', 'ogrenci');

create table hesap.gruplar (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  tur            text        not null,
  ad             text        not null,
  sube_id        uuid,
  kademe_id      uuid,
  kapasite       smallint,
  renk           text,
  durum          text        not null default 'aktif',
  arsivlendi_at  timestamptz,
  constraint gruplar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint gruplar_sube_id_fk foreign key (kurum_id, sube_id) references hesap.subeler (kurum_id, id),
  constraint gruplar_kademe_id_fk foreign key (kurum_id, kademe_id) references hesap.kademeler (kurum_id, id),
  constraint gruplar_tur_chk check (tur in ('birebir', 'grup', 'sinif', 'etut')),
  constraint gruplar_durum_chk check (durum in ('aktif', 'arsiv')),
  constraint gruplar_kurum_id_id_uniq unique (kurum_id, id),
  constraint gruplar_birebir_kapasite_chk check (tur <> 'birebir' or kapasite = 1),
  constraint gruplar_kapasite_chk check (kapasite is null or kapasite > 0),
  constraint gruplar_arsiv_chk check ((durum = 'arsiv') = (arsivlendi_at is not null)),
  constraint gruplar_renk_chk check (renk is null or renk ~ '^#[0-9A-Fa-f]{6}$'),
  constraint gruplar_ad_chk check (char_length(ad) between 1 and 200)
);
create index gruplar_kurum_id_tur_durum_idx on hesap.gruplar (kurum_id, tur, durum);
create index gruplar_kurum_id_kademe_id_idx on hesap.gruplar (kurum_id, kademe_id);
create index gruplar_kurum_id_sube_id_idx on hesap.gruplar (kurum_id, sube_id);
select ortak.kiraci_tablosu_koru('hesap', 'gruplar');

create table hesap.grup_uyeleri (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  surum             bigint      not null default 1,
  grup_id           uuid        not null,
  ogrenci_id        uuid        not null,
  baslangic_tarihi  date        not null default current_date,
  bitis_tarihi      date,
  katilim_yolu      text        not null default 'yonetici',
  constraint grup_uyeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint grup_uyeleri_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint grup_uyeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint grup_uyeleri_katilim_yolu_chk check (katilim_yolu in ('yonetici', 'davet', 'sinif_kodu')),
  constraint grup_uyeleri_tarih_chk check (bitis_tarihi is null or bitis_tarihi >= baslangic_tarihi)
);
create unique index grup_uyeleri_grup_id_ogrenci_id_uniq
  on hesap.grup_uyeleri (grup_id, ogrenci_id) where bitis_tarihi is null;
create index grup_uyeleri_kurum_id_grup_id_idx on hesap.grup_uyeleri (kurum_id, grup_id) where bitis_tarihi is null;
create index grup_uyeleri_kurum_id_ogrenci_id_idx on hesap.grup_uyeleri (kurum_id, ogrenci_id) where bitis_tarihi is null;
select ortak.kiraci_tablosu_koru('hesap', 'grup_uyeleri');
create trigger grup_uyeleri_ogrenci_rol_trg before insert or update on hesap.grup_uyeleri
  for each row execute function hesap.uyelik_rolu_denetle('ogrenci_id', 'ogrenci');

create table hesap.atamalar (
  id                uuid primary key,
  kurum_id          uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  surum             bigint      not null default 1,
  grup_id           uuid        not null,
  ogretmen_id       uuid        not null,
  brans_kodu        text        not null,
  baslangic_tarihi  date        not null default current_date,
  bitis_tarihi      date,
  ana_ogretmen      boolean     not null default false,
  constraint atamalar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint atamalar_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint atamalar_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint atamalar_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint atamalar_tarih_chk check (bitis_tarihi is null or bitis_tarihi >= baslangic_tarihi)
);
create unique index atamalar_grup_id_ogretmen_id_brans_kodu_uniq
  on hesap.atamalar (grup_id, ogretmen_id, brans_kodu) where bitis_tarihi is null;
create unique index atamalar_grup_id_brans_kodu_ana_uniq
  on hesap.atamalar (grup_id, brans_kodu) where ana_ogretmen and bitis_tarihi is null;
create index atamalar_kurum_id_ogretmen_id_idx on hesap.atamalar (kurum_id, ogretmen_id) where bitis_tarihi is null;
create index atamalar_kurum_id_grup_id_idx on hesap.atamalar (kurum_id, grup_id);
select ortak.kiraci_tablosu_koru('hesap', 'atamalar');
create trigger atamalar_ogretmen_rol_trg before insert or update on hesap.atamalar
  for each row execute function hesap.uyelik_rolu_denetle('ogretmen_id', 'ogretmen');

-- Davetler: duz belirtec saklanmaz.
create table hesap.davetler (
  id                       uuid primary key,
  kurum_id                 uuid        not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid,
  surum                    bigint      not null default 1,
  kanal                    text        not null,
  rol                      text        not null,
  belirtec_hash            bytea       not null,
  hedef_telefon_e164       text,
  hedef_ad                 text,
  grup_id                  uuid,
  kademe_id                uuid,
  sube_id                  uuid,
  davet_eden_id            uuid        not null,
  max_kullanim             int         not null default 1,
  kullanim_sayisi          int         not null default 0,
  durum                    text        not null default 'bekliyor',
  expires_at               timestamptz not null,
  sms_gonderim_sayisi      smallint    not null default 0,
  son_sms_at               timestamptz,
  kabul_eden_kullanici_id  uuid,
  constraint davetler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint davetler_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint davetler_kademe_id_fk foreign key (kurum_id, kademe_id) references hesap.kademeler (kurum_id, id),
  constraint davetler_sube_id_fk foreign key (kurum_id, sube_id) references hesap.subeler (kurum_id, id),
  constraint davetler_davet_eden_id_fk foreign key (kurum_id, davet_eden_id) references hesap.uyelikler (kurum_id, id),
  constraint davetler_kanal_chk check (kanal in ('baglanti', 'sms')),
  constraint davetler_rol_chk check (rol in ('yonetici', 'ogretmen', 'ogrenci', 'veli')),
  constraint davetler_durum_chk check (durum in ('bekliyor', 'kullanildi', 'iptal', 'suresi_doldu')),
  constraint davetler_belirtec_hash_uniq unique (belirtec_hash),
  constraint davetler_kullanim_chk check (kullanim_sayisi <= max_kullanim),
  constraint davetler_max_kullanim_chk check (max_kullanim between 1 and 100),
  constraint davetler_sms_hedef_chk check (kanal <> 'sms' or hedef_telefon_e164 is not null),
  constraint davetler_sms_gonderim_sayisi_chk check (sms_gonderim_sayisi <= 3)
);
create index davetler_kurum_id_durum_expires_at_idx on hesap.davetler (kurum_id, durum, expires_at);
select ortak.kiraci_tablosu_koru('hesap', 'davetler');

create table hesap.sinif_katilim_kodlari (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  grup_id          uuid        not null,
  kod              text        not null,
  aktif            boolean     not null default true,
  expires_at       timestamptz,
  max_kullanim     int,
  kullanim_sayisi  int         not null default 0,
  iptal_at         timestamptz,
  constraint sinif_katilim_kodlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint sinif_katilim_kodlari_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint sinif_katilim_kodlari_kod_uniq unique (kod),
  constraint sinif_katilim_kodlari_kod_chk check (kod ~ '^[2-9A-HJKMNP-Z]{8}$')
);
create unique index sinif_katilim_kodlari_grup_id_aktif_uniq
  on hesap.sinif_katilim_kodlari (grup_id) where aktif;
select ortak.kiraci_tablosu_koru('hesap', 'sinif_katilim_kodlari');

create function hesap.sinif_kodu_tur_denetle() returns trigger
  language plpgsql as $$
declare gercek text;
begin
  select tur into gercek from hesap.gruplar where id = new.grup_id and kurum_id = new.kurum_id;
  if gercek is distinct from 'sinif' then
    raise exception 'katilim_kodu_yalniz_sinif_icin' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger sinif_katilim_kodlari_tur_trg before insert or update on hesap.sinif_katilim_kodlari
  for each row execute function hesap.sinif_kodu_tur_denetle();

-- Giris oncesi akislar (davet / sinif kodu cozme) kiraci baglami olmadan calisir. SECURITY DEFINER
-- fonksiyonlar api_owner olarak calisir; FORCE RLS sahibi de kapsadigi icin yalnizca api_owner
-- icin SELECT politikasi vardir (api_app bu politikadan yararlanamaz). Fonksiyonlar dar kimlik doner.
create policy fonksiyon_okuma on hesap.davetler for select to api_owner using (true);
create policy fonksiyon_okuma on hesap.sinif_katilim_kodlari for select to api_owner using (true);

create function hesap.davet_coz(p_belirtec_hash bytea)
  returns table (kurum_id uuid, davet_id uuid, durum text, expires_at timestamptz)
  language sql stable security definer set search_path = hesap, pg_temp
  as $$ select d.kurum_id, d.id, d.durum, d.expires_at from hesap.davetler d
        where d.belirtec_hash = p_belirtec_hash $$;

create function hesap.katilim_kodu_coz(p_kod text)
  returns table (kurum_id uuid, grup_id uuid)
  language sql stable security definer set search_path = hesap, pg_temp
  as $$ select k.kurum_id, k.grup_id from hesap.sinif_katilim_kodlari k
        where k.kod = p_kod and k.aktif and k.iptal_at is null
          and (k.expires_at is null or k.expires_at > now())
          and (k.max_kullanim is null or k.kullanim_sayisi < k.max_kullanim) $$;

revoke all on function hesap.davet_coz(bytea), hesap.katilim_kodu_coz(text) from public;
grant execute on function hesap.davet_coz(bytea), hesap.katilim_kodu_coz(text) to api_app, api_sistem;

-- Modul ayarlari. Oncelik kurum > kademe > grup; alt duzey yalnizca daraltir.
create table hesap.modul_ayarlari (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  modul_kodu     text        not null,
  kapsam         text        not null,
  kapsam_id      uuid        not null,
  acik           boolean     not null,
  degistiren_id  uuid,
  constraint modul_ayarlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint modul_ayarlari_modul_kodu_chk check (modul_kodu in
    ('takvim', 'yoklama', 'geri_bildirim', 'kayitlar', 'finans', 'odev', 'haftalik_plan',
     'deneme', 'soru_sor', 'oyunlastirma', 'duyuru')),
  constraint modul_ayarlari_kapsam_chk check (kapsam in ('kurum', 'kademe', 'grup')),
  constraint modul_ayarlari_kurum_kapsam_chk check (kapsam <> 'kurum' or kapsam_id = kurum_id),
  constraint modul_ayarlari_kurum_id_modul_kodu_kapsam_kapsam_id_uniq
    unique (kurum_id, modul_kodu, kapsam, kapsam_id)
);
create index modul_ayarlari_kurum_id_modul_kodu_idx on hesap.modul_ayarlari (kurum_id, modul_kodu);
select ortak.kiraci_tablosu_koru('hesap', 'modul_ayarlari');

-- Etkin deger = plan_hakki AND kurum_acik AND kademe_acik AND grup_acik; satir yoksa o duzey true.
-- Plan hakki (abonelik.planlar) abonelik modulu gelince eklenir; simdilik her modul hak sahibidir.
-- Kademe verilmediyse grubun kademesi kullanilir. Kiraci baglami (RLS) icinde cagrilmalidir.
create function hesap.modul_acik_mi(p_kurum uuid, p_modul text, p_kademe uuid default null, p_grup uuid default null)
  returns boolean language sql stable as $$
  with hedef as (
    select p_kurum as kurum_id,
           coalesce(p_kademe, (select g.kademe_id from hesap.gruplar g
                               where g.id = p_grup and g.kurum_id = p_kurum)) as kademe_id,
           p_grup as grup_id
  )
  select coalesce(bool_and(coalesce(m.acik, true)), true)
  from hedef h
  cross join lateral (values ('kurum', h.kurum_id), ('kademe', h.kademe_id), ('grup', h.grup_id)) as d(kapsam, kid)
  left join hesap.modul_ayarlari m
    on m.kurum_id = p_kurum and m.modul_kodu = p_modul and m.kapsam = d.kapsam and m.kapsam_id = d.kid
  where d.kid is not null $$;

-- Platform yoneticisi taklit kayitlari: yalnizca api_sistem erisir.
create table hesap.taklit_kayitlari (
  id                     uuid primary key,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  platform_kullanici_id  uuid        not null references hesap.kullanicilar (id),
  hedef_kullanici_id     uuid        not null references hesap.kullanicilar (id),
  hedef_kurum_id         uuid        not null,
  neden                  text        not null,
  baslangic_at           timestamptz not null default now(),
  bitis_at               timestamptz not null,
  sonlandirildi_at       timestamptz,
  ip                     inet,
  constraint taklit_kayitlari_neden_chk check (char_length(neden) >= 10),
  constraint taklit_kayitlari_sure_chk check (bitis_at <= baslangic_at + interval '15 minutes')
);
create index taklit_kayitlari_hedef_kurum_id_baslangic_at_idx on hesap.taklit_kayitlari (hedef_kurum_id, baslangic_at desc);
create index taklit_kayitlari_platform_kullanici_id_baslangic_at_idx on hesap.taklit_kayitlari (platform_kullanici_id, baslangic_at desc);
create trigger taklit_kayitlari_updated_at_trg before update on hesap.taklit_kayitlari
  for each row execute function ortak.updated_at_ayarla();
revoke all on hesap.taklit_kayitlari from api_app;

-- Degismez denetim gunlugu. kurum_id bos olabilir (platform eylemleri); bos satirlari yalniz api_sistem gorur.
create table hesap.denetim_kayitlari (
  id                 uuid primary key,
  kurum_id           uuid,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  aktor_kullanici_id uuid,
  aktor_uyelik_id    uuid,
  taklit_kayit_id    uuid,
  eylem              text        not null,
  hedef_turu         text,
  hedef_id           uuid,
  once               jsonb,
  sonra              jsonb,
  neden              text,
  istek_id           uuid,
  ip                 inet
);
create index denetim_kayitlari_kurum_id_created_at_idx on hesap.denetim_kayitlari (kurum_id, created_at desc);
create index denetim_kayitlari_hedef_turu_hedef_id_idx on hesap.denetim_kayitlari (hedef_turu, hedef_id);
create index denetim_kayitlari_aktor_kullanici_id_created_at_idx on hesap.denetim_kayitlari (aktor_kullanici_id, created_at desc);
create trigger denetim_kayitlari_degismez_trg before update or delete on hesap.denetim_kayitlari
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on hesap.denetim_kayitlari from api_app, api_sistem;
alter table hesap.denetim_kayitlari enable row level security;
alter table hesap.denetim_kayitlari force row level security;
create policy kiraci_izolasyonu on hesap.denetim_kayitlari
  using (kurum_id = ortak.aktif_kurum())
  with check (kurum_id = ortak.aktif_kurum());

-- Guncel riza gorunumu: (kullanici, tur) basina en yeni karar. RLS cagirana gore uygulanir.
create view hesap.v_guncel_rizalar with (security_invoker = true) as
select distinct on (r.kullanici_id, m.tur, m.dil)
       r.kullanici_id, m.tur, m.dil, r.riza_metni_id, r.karar, r.created_at
from hesap.rizalar r
join hesap.riza_metinleri m on m.id = r.riza_metni_id
order by r.kullanici_id, m.tur, m.dil, r.created_at desc, r.id desc;
