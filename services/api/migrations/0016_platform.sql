-- 0016_platform: platform yonetimi cekirdegi (ADR 0004 "Platform yoneticisi ve taklit").
-- Genislet-daralt: yeni tablolar, oturumlar'a bos gelebilen bir sutun, yeni indeksler. Eski kod etkilenmez.

-- Platform kullanicilari icin TOTP ikinci adimi. Yalniz api_sistem erisir; sir AES-256-GCM ile
-- sifreli (anahtar BETTER_AUTH_SECRET'tan turetilir), yedek kodlar tek yonlu ozet olarak tutulur.
create table hesap.platform_ikinci_adim (
  id                  uuid primary key,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  kullanici_id        uuid        not null references hesap.kullanicilar (id),
  sir_sifreli         bytea       not null,
  onaylandi_at        timestamptz,
  son_sayac           bigint,
  yedek_kod_ozetleri  text[]      not null default '{}',
  yanlis_deneme       smallint    not null default 0,
  kilitli_bitis_at    timestamptz,
  constraint platform_ikinci_adim_kullanici_id_uniq unique (kullanici_id)
);
create trigger platform_ikinci_adim_updated_at_trg before update on hesap.platform_ikinci_adim
  for each row execute function ortak.updated_at_ayarla();
revoke all on hesap.platform_ikinci_adim from api_app;

-- Oturumun ikinci adimi tamamladigi an. Platform uclari bunu her istekte denetler.
alter table hesap.oturumlar add column ikinci_adim_at timestamptz;

-- Tum kullanicilara gorunen bakim/duyuru mesaji. Global (kiracisiz); api_app yalniz okur,
-- yazmayi platform yoneticisi `api_sistem` ile yapar.
create table hesap.platform_mesajlari (
  id            uuid primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  baslik        text        not null,
  metin         text        not null,
  onem          text        not null default 'bilgi',
  baslangic_at  timestamptz not null,
  bitis_at      timestamptz not null,
  iptal_at      timestamptz,
  constraint platform_mesajlari_baslik_chk check (char_length(baslik) between 1 and 120),
  constraint platform_mesajlari_metin_chk check (char_length(metin) between 1 and 2000),
  constraint platform_mesajlari_onem_chk check (onem in ('bilgi', 'uyari', 'kritik')),
  constraint platform_mesajlari_sure_chk check (bitis_at > baslangic_at)
);
create index platform_mesajlari_etkin_idx on hesap.platform_mesajlari (baslangic_at, bitis_at)
  where iptal_at is null;
create trigger platform_mesajlari_updated_at_trg before update on hesap.platform_mesajlari
  for each row execute function ortak.updated_at_ayarla();
revoke insert, update, delete on hesap.platform_mesajlari from api_app;

-- Kuruma ozel beta ozellik bayraklari (platform yoneticisi acar). Kiraci tablosu: kurum yalniz kendi
-- bayraklarini okur, yazmaz.
create table hesap.kurum_beta_ozellikleri (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  ozellik_kodu   text        not null,
  acik           boolean     not null,
  degistiren_id  uuid,
  constraint kurum_beta_ozellikleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kurum_beta_ozellikleri_kod_chk check (ozellik_kodu ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint kurum_beta_ozellikleri_kurum_id_ozellik_kodu_uniq unique (kurum_id, ozellik_kodu)
);
select ortak.kiraci_tablosu_koru('hesap', 'kurum_beta_ozellikleri');
revoke insert, update, delete on hesap.kurum_beta_ozellikleri from api_app;

-- Kurum arama (10.000+ kurumda hizli): ad icin trigram; platform denetim listesi icin siralama indeksleri.
-- (i/I/İ/ı tek biciminde; sorgu da ayni translate ile yazilir.)
create index kurumlar_ad_trgm_idx on hesap.kurumlar using gin (translate(ad, 'İIı', 'iii') gin_trgm_ops);
create index denetim_kayitlari_created_at_id_idx on hesap.denetim_kayitlari (created_at desc, id desc);
create index denetim_kayitlari_eylem_created_at_idx on hesap.denetim_kayitlari (eylem, created_at desc);
