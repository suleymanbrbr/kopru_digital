-- 0002_bildirim: okuma kopyalari, cihaz/tercih/ayar, sablonlar, gelen kutusu, gonderim gunlugu,
-- zamanlanmis bildirimler, duyurular ve SMS kotasi (docs/schema/bildirim.md).
-- Kiraci tablolarinin hepsinde kurum_id + RLS. `cihazlar`, `tercihler` ve `kullanici_ayarlari` kullanici kollu.

-- --- Yerel okuma kopyalari -------------------------------------------------------------------
-- Yalniz olay tuketicisi (`bildirim.kopya`) yazar. Olay zarfinda ozne surumu olmadigindan eski olay,
-- (`son_olay_at`, `son_olay_id`) ikilisi (olayin `occurredAt` ve UUIDv7 kimligi; esitlikte buyuk kimlik
-- kazanir) karsilastirilarak yok sayilir. Iletisim bilgisi (telefon, e-posta, ad) KOPYALANMAZ.

-- Kullanici duzeyinde (kurum_id yok, RLS yok). `hesap.kullanici.degisti.v1` sozlesmesi henuz yok:
-- tablo hazir, tuketici yok; dil/durum yoksa varsayilan (`tr`, `aktif`) uygulanir.
create table bildirim.kullanici_kopyalari (
  kullanici_id uuid        primary key,
  dil          text        not null default 'tr',
  durum        text        not null default 'aktif',
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint kullanici_kopyalari_durum_chk check (durum in ('aktif', 'askida', 'silindi'))
);
create trigger kullanici_kopyalari_updated_at_trg before update on bildirim.kullanici_kopyalari
  for each row execute function ortak.updated_at_ayarla();

-- Abonelik alanlari (plan_kodu, abonelik_durumu, sms_aylik_limit) abonelik olaylari gelene kadar bos kalir.
create table bildirim.kurum_kopyalari (
  kurum_id                 uuid        primary key,
  ad                       text        not null,
  durum                    text        not null,
  saat_dilimi              text        not null,
  plan_kodu                text,
  abonelik_durumu          text,
  sms_aylik_limit          int,
  son_olay_at              timestamptz not null,
  son_olay_id              uuid        not null,
  abonelik_son_olay_at     timestamptz,
  abonelik_son_olay_id     uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint kurum_kopyalari_durum_chk check (durum in ('aktif', 'askida', 'kapali'))
);
select ortak.kiraci_tablosu_koru('bildirim', 'kurum_kopyalari', false);

create table bildirim.uyelik_kopyalari (
  uyelik_id    uuid        primary key,
  kurum_id     uuid        not null,
  kullanici_id uuid        not null,
  rol          text        not null,
  durum        text        not null,
  kademe_id    uuid,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uyelik_kopyalari_rol_chk check (rol in ('sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli')),
  constraint uyelik_kopyalari_durum_chk check (durum in ('davetli', 'aktif', 'askida', 'ayrildi'))
);
create index uyelik_kopyalari_kurum_id_kullanici_id_idx on bildirim.uyelik_kopyalari (kurum_id, kullanici_id);
create index uyelik_kopyalari_kurum_id_kademe_id_idx on bildirim.uyelik_kopyalari (kurum_id, kademe_id);
select ortak.kiraci_tablosu_koru('bildirim', 'uyelik_kopyalari', false);

create table bildirim.kademe_kopyalari (
  kademe_id    uuid        primary key,
  kurum_id     uuid        not null,
  ad           text        not null,
  arsivlendi   boolean     not null default false,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index kademe_kopyalari_kurum_id_idx on bildirim.kademe_kopyalari (kurum_id);
select ortak.kiraci_tablosu_koru('bildirim', 'kademe_kopyalari', false);

create table bildirim.grup_kopyalari (
  grup_id      uuid        primary key,
  kurum_id     uuid        not null,
  kademe_id    uuid,
  tur          text        not null,
  ad           text        not null,
  durum        text        not null,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint grup_kopyalari_tur_chk check (tur in ('birebir', 'grup', 'sinif', 'etut')),
  constraint grup_kopyalari_durum_chk check (durum in ('aktif', 'arsiv'))
);
create index grup_kopyalari_kurum_id_kademe_id_idx on bildirim.grup_kopyalari (kurum_id, kademe_id);
select ortak.kiraci_tablosu_koru('bildirim', 'grup_kopyalari', false);

create table bildirim.grup_uyesi_kopyalari (
  grup_id           uuid        not null,
  ogrenci_id        uuid        not null,
  kurum_id          uuid        not null,
  grup_uyesi_id     uuid        not null,
  baslangic_tarihi  date        not null,
  bitis_tarihi      date,
  son_olay_at       timestamptz not null,
  son_olay_id       uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (grup_id, ogrenci_id)
);
create index grup_uyesi_kopyalari_kurum_id_ogrenci_id_idx on bildirim.grup_uyesi_kopyalari (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('bildirim', 'grup_uyesi_kopyalari', false);

create table bildirim.atama_kopyalari (
  atama_id          uuid        primary key,
  kurum_id          uuid        not null,
  grup_id           uuid        not null,
  ogretmen_id       uuid        not null,
  brans_kodu        text        not null,
  baslangic_tarihi  date        not null,
  bitis_tarihi      date,
  son_olay_at       timestamptz not null,
  son_olay_id       uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index atama_kopyalari_kurum_id_ogretmen_id_idx on bildirim.atama_kopyalari (kurum_id, ogretmen_id);
create index atama_kopyalari_kurum_id_grup_id_idx on bildirim.atama_kopyalari (kurum_id, grup_id);
select ortak.kiraci_tablosu_koru('bildirim', 'atama_kopyalari', false);

-- `acik: null` (mirasa donus) olayi satiri SILER; bu yuzden `acik` bos olamaz.
create table bildirim.modul_ayari_kopyalari (
  kurum_id     uuid        not null,
  modul_kodu   text        not null,
  kapsam       text        not null,
  kapsam_id    uuid        not null,
  acik         boolean     not null,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (kurum_id, modul_kodu, kapsam, kapsam_id),
  constraint modul_ayari_kopyalari_kapsam_chk check (kapsam in ('kurum', 'kademe', 'grup'))
);
select ortak.kiraci_tablosu_koru('bildirim', 'modul_ayari_kopyalari', false);

-- --- Cihaz, tercih, ayar ---------------------------------------------------------------------
-- Kullanici basinadir. RLS kullanici kollu: `kullanici_id = ortak.aktif_kullanici()`.
--
-- Sapma (docs/schema/bildirim.md guncellendi): `push_belirteci` benzersizligi yalniz ETKIN satirlar icin
-- (kismi indeks). Cihaz el degistirince eski kullanicinin satiri `aktif = false` olur ve belirtec yeni
-- kullanicida etkin kalir. Eski satirin pasiflenmesi, belirteci sunan istegin `app.devir_belirteci`
-- degiskeniyle yetkilendirilir (asagidaki devir politikalari).

create table bildirim.cihazlar (
  id               uuid        primary key,
  kullanici_id     uuid        not null,
  platform         text        not null,
  saglayici        text        not null default 'expo',
  push_belirteci   text        not null,
  cihaz_kimligi    text        not null,
  uygulama_surumu  text,
  dil              text        not null default 'tr',
  aktif            boolean     not null default true,
  gecersiz_at      timestamptz,
  son_gorulme_at   timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cihazlar_platform_chk check (platform in ('ios', 'android', 'web')),
  constraint cihazlar_saglayici_chk check (saglayici in ('expo', 'fcm', 'apns', 'webpush')),
  constraint cihazlar_kullanici_id_cihaz_kimligi_uniq unique (kullanici_id, cihaz_kimligi)
);
create unique index cihazlar_push_belirteci_aktif_uniq on bildirim.cihazlar (push_belirteci) where aktif;
create index cihazlar_kullanici_id_idx on bildirim.cihazlar (kullanici_id) where aktif;
create index cihazlar_son_gorulme_at_idx on bildirim.cihazlar (son_gorulme_at) where aktif;
create trigger cihazlar_updated_at_trg before update on bildirim.cihazlar
  for each row execute function ortak.updated_at_ayarla();
-- Satirin sahibi degistirilemez (devir politikasi yalniz pasiflestirme icindir; izin verici politikalar
-- birlesince "baskasinin satirini kendine al" yolu da acik kalmasin).
create function bildirim.cihaz_sahibi_degismez() returns trigger
  language plpgsql as $$
begin
  if new.kullanici_id <> old.kullanici_id then
    raise exception 'cihaz_sahibi_degistirilemez' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger cihazlar_sahip_degismez_trg before update on bildirim.cihazlar
  for each row execute function bildirim.cihaz_sahibi_degismez();
alter table bildirim.cihazlar enable row level security;
alter table bildirim.cihazlar force row level security;
create policy kullanici_izolasyonu on bildirim.cihazlar
  using (kullanici_id = ortak.aktif_kullanici()) with check (kullanici_id = ortak.aktif_kullanici());
-- Devir: belirteci sunan istek, o belirtecli satiri YALNIZ pasiflestirebilir.
create policy cihaz_devri_okuma on bildirim.cihazlar for select
  using (push_belirteci = nullif(current_setting('app.devir_belirteci', true), ''));
create policy cihaz_devri_pasiflestirme on bildirim.cihazlar for update
  using (push_belirteci = nullif(current_setting('app.devir_belirteci', true), ''))
  with check (push_belirteci = nullif(current_setting('app.devir_belirteci', true), '') and not aktif);

-- Tercih ve ayar: iki kollu RLS (kurum baglami: olay tuketicisi; kullanici baglami: API).
create table bildirim.tercihler (
  kullanici_id  uuid        not null,
  kurum_id      uuid        not null,
  kategori      text        not null,
  kanal         text        not null,
  acik          boolean     not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (kullanici_id, kurum_id, kategori, kanal),
  constraint tercihler_kategori_chk check (kategori in
    ('ders', 'yoklama', 'odev', 'soru', 'kayit', 'duyuru', 'finans', 'oyunlastirma', 'abonelik', 'sistem')),
  constraint tercihler_kanal_chk check (kanal in ('kutu', 'push', 'eposta', 'sms')),
  constraint tercihler_sistem_chk check (kategori <> 'sistem'),
  constraint tercihler_kutu_chk check (kanal <> 'kutu' or acik)
);
create index tercihler_kurum_id_idx on bildirim.tercihler (kurum_id);
create trigger tercihler_updated_at_trg before update on bildirim.tercihler
  for each row execute function ortak.updated_at_ayarla();
alter table bildirim.tercihler enable row level security;
alter table bildirim.tercihler force row level security;
create policy kiraci_izolasyonu on bildirim.tercihler
  using (kurum_id = ortak.aktif_kurum() or kullanici_id = ortak.aktif_kullanici())
  with check (kurum_id = ortak.aktif_kurum() or kullanici_id = ortak.aktif_kullanici());

-- Sessiz saat varsayilani (kayit yoksa ya da bos): 22:00-08:00, her gun, Europe/Istanbul (kodda uygulanir).
-- `sessiz_gunler = '{}'` sessiz saati kapatir.
create table bildirim.kullanici_ayarlari (
  kullanici_id         uuid        not null,
  kurum_id             uuid        not null,
  sessiz_baslangic     time,
  sessiz_bitis         time,
  sessiz_gunler        smallint[]  not null default '{1,2,3,4,5,6,7}',
  saat_dilimi          text        not null default 'Europe/Istanbul',
  ders_hatirlatma_dk   smallint    not null default 60,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (kullanici_id, kurum_id),
  constraint kullanici_ayarlari_sessiz_chk check ((sessiz_baslangic is null) = (sessiz_bitis is null)),
  constraint kullanici_ayarlari_ders_hatirlatma_dk_chk check (ders_hatirlatma_dk in (0, 15, 30, 60, 120, 1440)),
  constraint kullanici_ayarlari_sessiz_gunler_chk check (sessiz_gunler <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
create index kullanici_ayarlari_kurum_id_idx on bildirim.kullanici_ayarlari (kurum_id);
create trigger kullanici_ayarlari_updated_at_trg before update on bildirim.kullanici_ayarlari
  for each row execute function ortak.updated_at_ayarla();
alter table bildirim.kullanici_ayarlari enable row level security;
alter table bildirim.kullanici_ayarlari force row level security;
create policy kiraci_izolasyonu on bildirim.kullanici_ayarlari
  using (kurum_id = ortak.aktif_kurum() or kullanici_id = ortak.aktif_kullanici())
  with check (kurum_id = ortak.aktif_kurum() or kullanici_id = ortak.aktif_kullanici());

-- --- Sablonlar -------------------------------------------------------------------------------
-- Kiracisiz (RLS yok). Kaynak KODdur (src/sablonlar.ts); worker acilista buraya upsert eder (ayna).
create table bildirim.sablonlar (
  id                     uuid        primary key,
  kod                    text        not null,
  kategori               text        not null,
  kanal                  text        not null,
  dil                    text        not null default 'tr',
  baslik                 text,
  govde                  text        not null,
  derin_baglanti         text,
  kisisel_veri_iceriyor  boolean     not null default false,
  surum                  bigint      not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint sablonlar_kod_kanal_dil_uniq unique (kod, kanal, dil),
  constraint sablonlar_kategori_chk check (kategori in
    ('ders', 'yoklama', 'odev', 'soru', 'kayit', 'duyuru', 'finans', 'oyunlastirma', 'abonelik', 'sistem')),
  constraint sablonlar_kanal_chk check (kanal in ('kutu', 'push', 'eposta', 'sms')),
  constraint sablonlar_kisisel_veri_chk check (not kisisel_veri_iceriyor or kanal in ('kutu', 'eposta'))
);
create trigger sablonlar_updated_at_trg before update on bildirim.sablonlar
  for each row execute function ortak.updated_at_ayarla();
create trigger sablonlar_surum_trg before update on bildirim.sablonlar
  for each row execute function ortak.surum_artir();

-- --- Gelen kutusu ----------------------------------------------------------------------------
create table bildirim.bildirimler (
  id                    uuid        primary key,
  kurum_id              uuid        not null,
  alici_id              uuid        not null,
  kategori              text        not null,
  sablon_kodu           text        not null,
  baslik                text        not null,
  govde                 text        not null,
  derin_baglanti        text,
  veri                  jsonb       not null default '{}',
  kaynak_olay_id        uuid        not null,
  tekil_anahtar         text        not null,
  okundu_at             timestamptz,
  arsivlendi_at         timestamptz,
  gecerlilik_bitis_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  constraint bildirimler_kategori_chk check (kategori in
    ('ders', 'yoklama', 'odev', 'soru', 'kayit', 'duyuru', 'finans', 'oyunlastirma', 'abonelik', 'sistem')),
  constraint bildirimler_kurum_id_alici_id_tekil_anahtar_uniq unique (kurum_id, alici_id, tekil_anahtar),
  constraint bildirimler_kurum_id_id_uniq unique (kurum_id, id)
);
create index bildirimler_kurum_id_alici_id_created_at_idx
  on bildirim.bildirimler (kurum_id, alici_id, created_at desc, id desc);
create index bildirimler_okunmamis_idx
  on bildirim.bildirimler (kurum_id, alici_id) where okundu_at is null and arsivlendi_at is null;
create index bildirimler_created_at_idx on bildirim.bildirimler (created_at);
select ortak.kiraci_tablosu_koru('bildirim', 'bildirimler', false);

-- Gonderim gunlugu (push; e-posta/SMS sonraki paketler). Kutu icin satir yazilmaz.
-- Sapmalar (docs/schema/bildirim.md guncellendi): (1) `baslik`, `govde`, `derin_baglanti`: PUSH metni
-- (kisisel veri icermez; bildirimler satiri 90 gunde silinse de gonderim gunlugu okunur kalir). Gizli
-- icerik (OTP, davet) bu sutunlara YAZILMAZ. (2) `bildirim_id` bileşik FK, bildirim silinince bos kalir.
create table bildirim.gonderimler (
  id                    uuid        primary key,
  kurum_id              uuid        not null,
  bildirim_id           uuid,
  alici_kullanici_id    uuid        not null,
  kanal                 text        not null,
  sablon_kodu           text        not null,
  hedef_anahtar         text        not null,
  hedef_maske           text,
  saglayici             text,
  saglayici_mesaj_id    text,
  durum                 text        not null default 'beklemede',
  atlama_nedeni         text,
  hata_kodu             text,
  deneme_sayisi         smallint    not null default 0,
  zamanlanan_at         timestamptz not null default now(),
  gonderildi_at         timestamptz,
  maliyet_kurus         int,
  baslik                text,
  govde                 text,
  derin_baglanti        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  constraint gonderimler_kanal_chk check (kanal in ('push', 'eposta', 'sms')),
  constraint gonderimler_durum_chk check (durum in
    ('beklemede', 'ertelendi', 'gonderildi', 'teslim_edildi', 'basarisiz', 'atlandi')),
  constraint gonderimler_atlama_nedeni_chk check (atlama_nedeni is null or atlama_nedeni in
    ('tercih', 'sessiz_saat', 'kota', 'cihaz_yok', 'kurum_askida', 'bayat')),
  constraint gonderimler_atlama_durum_chk check ((durum = 'atlandi') = (atlama_nedeni is not null)),
  constraint gonderimler_deneme_sayisi_chk check (deneme_sayisi between 0 and 5),
  constraint gonderimler_bildirim_fk foreign key (kurum_id, bildirim_id)
    references bildirim.bildirimler (kurum_id, id) on delete set null (bildirim_id)
);
create unique index gonderimler_bildirim_id_kanal_hedef_uniq
  on bildirim.gonderimler (bildirim_id, kanal, hedef_anahtar) where bildirim_id is not null;
create index gonderimler_bekleyen_idx on bildirim.gonderimler (durum, zamanlanan_at)
  where durum in ('beklemede', 'ertelendi');
create index gonderimler_kurum_id_alici_kullanici_id_created_at_idx
  on bildirim.gonderimler (kurum_id, alici_kullanici_id, created_at desc);
create index gonderimler_kurum_id_bildirim_id_idx on bildirim.gonderimler (kurum_id, bildirim_id);
create index gonderimler_created_at_idx on bildirim.gonderimler (created_at);
select ortak.kiraci_tablosu_koru('bildirim', 'gonderimler', false);

-- Gelecekte uretilecek bildirimler (ders hatirlatmasi; sonraki paket kullanir).
create table bildirim.zamanlanmis_bildirimler (
  id            uuid        primary key,
  kurum_id      uuid        not null,
  kaynak_turu   text        not null,
  kaynak_id     uuid        not null,
  alici_id      uuid        not null,
  sablon_kodu   text        not null,
  gonderim_at   timestamptz not null,
  veri          jsonb       not null default '{}',
  iptal_at      timestamptz,
  uretildi_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  constraint zamanlanmis_bildirimler_kaynak_uniq
    unique (kurum_id, kaynak_turu, kaynak_id, alici_id, sablon_kodu)
);
create index zamanlanmis_bildirimler_bekleyen_idx on bildirim.zamanlanmis_bildirimler (gonderim_at)
  where iptal_at is null and uretildi_at is null;
create index zamanlanmis_bildirimler_kurum_id_kaynak_id_idx
  on bildirim.zamanlanmis_bildirimler (kurum_id, kaynak_id);
select ortak.kiraci_tablosu_koru('bildirim', 'zamanlanmis_bildirimler', false);

-- --- Duyurular (tablo ve RLS; yayin ve fan-out sonraki paket) --------------------------------
create table bildirim.duyurular (
  id               uuid        primary key,
  kurum_id         uuid        not null,
  baslik           text        not null,
  govde            text        not null,
  hedef_turu       text        not null,
  hedef_id         uuid        not null,
  hedef_roller     text[]      not null default '{ogrenci}',
  yazar_id         uuid        not null,
  durum            text        not null default 'taslak',
  yayin_at         timestamptz,
  bitis_at         timestamptz,
  sabit            boolean     not null default false,
  alici_sayisi     int         not null default 0,
  okunan_sayisi    int         not null default 0,
  push_gonderildi  boolean     not null default true,
  silindi_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  constraint duyurular_baslik_chk check (char_length(baslik) <= 200),
  constraint duyurular_govde_chk check (char_length(govde) <= 4000),
  constraint duyurular_hedef_turu_chk check (hedef_turu in ('grup', 'kademe', 'kurum')),
  constraint duyurular_hedef_roller_chk check (hedef_roller <@ array['ogrenci', 'ogretmen', 'veli']::text[]),
  constraint duyurular_durum_chk check (durum in ('taslak', 'yayinda', 'arsiv')),
  constraint duyurular_kurum_hedef_chk check (hedef_turu <> 'kurum' or hedef_id = kurum_id),
  constraint duyurular_yayin_chk check (durum = 'taslak' or yayin_at is not null),
  constraint duyurular_okunan_chk check (okunan_sayisi <= alici_sayisi),
  constraint duyurular_kurum_id_id_uniq unique (kurum_id, id)
);
create index duyurular_kurum_id_durum_yayin_at_idx on bildirim.duyurular (kurum_id, durum, yayin_at desc);
create index duyurular_kurum_id_hedef_idx on bildirim.duyurular (kurum_id, hedef_turu, hedef_id);
select ortak.kiraci_tablosu_koru('bildirim', 'duyurular', true);

create table bildirim.duyuru_alicilari (
  id           uuid        primary key,
  kurum_id     uuid        not null,
  duyuru_id    uuid        not null,
  alici_id     uuid        not null,
  okundu_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  constraint duyuru_alicilari_duyuru_alici_uniq unique (duyuru_id, alici_id),
  constraint duyuru_alicilari_duyuru_fk foreign key (kurum_id, duyuru_id)
    references bildirim.duyurular (kurum_id, id) on delete cascade
);
create index duyuru_alicilari_kurum_id_alici_id_okundu_at_idx
  on bildirim.duyuru_alicilari (kurum_id, alici_id, okundu_at);
create index duyuru_alicilari_okunmamis_idx on bildirim.duyuru_alicilari (kurum_id, duyuru_id)
  where okundu_at is null;
select ortak.kiraci_tablosu_koru('bildirim', 'duyuru_alicilari', false);

-- --- Kota ------------------------------------------------------------------------------------
create table bildirim.sms_kullanimlari (
  kurum_id       uuid        not null,
  donem          date        not null,
  adet           int         not null default 0,
  maliyet_kurus  bigint      not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (kurum_id, donem),
  constraint sms_kullanimlari_adet_chk check (adet >= 0)
);
select ortak.kiraci_tablosu_koru('bildirim', 'sms_kullanimlari', false);
