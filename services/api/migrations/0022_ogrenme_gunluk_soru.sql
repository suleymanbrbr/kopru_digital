-- 0022_ogrenme_gunluk_soru: gunluk soru takibi ve konu analizi (kaynak kitap, test, gunluk kayit, fotograf).
-- Genislet-daralt: yalniz yeni tablolar. `konu_id` mufredat tablolarina FK'siz uuid'dir (odev/plan ile ayni;
-- konu gorunurlugu uygulamada RLS'li `konular` okumasiyla dogrulanir). Tasarim: docs/schema/api.md
-- "Gunluk soru takibi ve konu analizi".

-- Kurum ya da ogretmen tanimi kaynak kitap (KS). Icerik/PDF yok (telif).
create table ogrenme.kaynak_kitaplar (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ad               text        not null,
  yayinevi         text,
  brans_kodu       text        not null,
  kademe_id        uuid,
  sahip_uyelik_id  uuid,
  aktif            boolean     not null default true,
  constraint kaynak_kitaplar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kaynak_kitaplar_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint kaynak_kitaplar_kademe_id_fk foreign key (kurum_id, kademe_id) references hesap.kademeler (kurum_id, id),
  constraint kaynak_kitaplar_sahip_uyelik_id_fk foreign key (kurum_id, sahip_uyelik_id) references hesap.uyelikler (kurum_id, id),
  constraint kaynak_kitaplar_kurum_id_id_uniq unique (kurum_id, id),
  constraint kaynak_kitaplar_ad_chk check (char_length(ad) between 1 and 200),
  constraint kaynak_kitaplar_yayinevi_chk check (yayinevi is null or char_length(yayinevi) between 1 and 200)
);
create index kaynak_kitaplar_kurum_id_brans_kodu_aktif_idx on ogrenme.kaynak_kitaplar (kurum_id, brans_kodu, aktif);
select ortak.kiraci_tablosu_koru('ogrenme', 'kaynak_kitaplar');

-- Kitabin test/bolum listesi (KS, surumsuz).
create table ogrenme.kaynak_kitap_testleri (
  id           uuid primary key,
  kurum_id     uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  kitap_id     uuid        not null,
  sira         int         not null,
  ad           text        not null,
  soru_sayisi  int         not null,
  konu_id      uuid,
  constraint kaynak_kitap_testleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kaynak_kitap_testleri_kitap_id_fk foreign key (kurum_id, kitap_id) references ogrenme.kaynak_kitaplar (kurum_id, id),
  constraint kaynak_kitap_testleri_kitap_id_sira_uniq unique (kitap_id, sira),
  constraint kaynak_kitap_testleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint kaynak_kitap_testleri_sira_chk check (sira >= 1),
  constraint kaynak_kitap_testleri_ad_chk check (char_length(ad) between 1 and 200),
  constraint kaynak_kitap_testleri_soru_sayisi_chk check (soru_sayisi between 1 and 500)
);
create index kaynak_kitap_testleri_kurum_id_kitap_id_sira_idx on ogrenme.kaynak_kitap_testleri (kurum_id, kitap_id, sira);
select ortak.kiraci_tablosu_koru('ogrenme', 'kaynak_kitap_testleri', false);

-- Ogrencinin "Soru cozdum" kaydi (KS). Ayni gun duzeltme/silme; silme gercek silmedir (ters XP olayi gider).
create table ogrenme.gunluk_soru_kayitlari (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  surum           bigint      not null default 1,
  ogrenci_id      uuid        not null,
  gun             date        not null,
  brans_kodu      text        not null,
  konu_id         uuid        not null,
  zorluk          text        not null,
  kaynak_test_id  uuid,
  kaynak_metin    text,
  dogru           int         not null default 0,
  yanlis          int         not null default 0,
  bos             int         not null default 0,
  toplam          int         generated always as (dogru + yanlis + bos) stored,
  plan_gorev_id   uuid,
  istek_id        uuid,
  constraint gunluk_soru_kayitlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint gunluk_soru_kayitlari_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint gunluk_soru_kayitlari_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint gunluk_soru_kayitlari_kaynak_test_id_fk foreign key (kurum_id, kaynak_test_id) references ogrenme.kaynak_kitap_testleri (kurum_id, id),
  constraint gunluk_soru_kayitlari_plan_gorev_id_fk foreign key (kurum_id, plan_gorev_id) references ogrenme.plan_gorevleri (kurum_id, id),
  constraint gunluk_soru_kayitlari_kurum_id_id_uniq unique (kurum_id, id),
  constraint gunluk_soru_kayitlari_zorluk_chk check (zorluk in ('kolay', 'orta', 'zor')),
  constraint gunluk_soru_kayitlari_sayilar_chk check (dogru >= 0 and yanlis >= 0 and bos >= 0),
  constraint gunluk_soru_kayitlari_toplam_chk check (dogru + yanlis + bos between 1 and 500),
  constraint gunluk_soru_kayitlari_kaynak_chk check (kaynak_test_id is null or kaynak_metin is null),
  constraint gunluk_soru_kayitlari_kaynak_metin_chk check (kaynak_metin is null or char_length(kaynak_metin) between 1 and 200)
);
-- Cevrimdisi tekrar gonderim: ayni istemci istegi tek kayit.
create unique index gunluk_soru_kayitlari_istek_id_uniq
  on ogrenme.gunluk_soru_kayitlari (kurum_id, ogrenci_id, istek_id) where istek_id is not null;
-- Analiz: ogrenci + brans + gun araligi -> konu x zorluk toplami (dizin-yalniz tarama).
create index gunluk_soru_kayitlari_ogrenci_brans_gun_idx
  on ogrenme.gunluk_soru_kayitlari (kurum_id, ogrenci_id, brans_kodu, gun)
  include (konu_id, zorluk, dogru, yanlis, bos);
-- Grup/sinif gorunumu: brans + gun araligi, ogrenci kumesi sorguda suzulur.
create index gunluk_soru_kayitlari_brans_gun_idx
  on ogrenme.gunluk_soru_kayitlari (kurum_id, brans_kodu, gun)
  include (ogrenci_id, konu_id, zorluk, dogru, yanlis, bos);
-- Kendi liste ve "son kullanilanlar".
create index gunluk_soru_kayitlari_ogrenci_created_at_idx
  on ogrenme.gunluk_soru_kayitlari (kurum_id, ogrenci_id, created_at desc);
create index gunluk_soru_kayitlari_plan_gorev_id_idx
  on ogrenme.gunluk_soru_kayitlari (kurum_id, plan_gorev_id) where plan_gorev_id is not null;
select ortak.kiraci_tablosu_koru('ogrenme', 'gunluk_soru_kayitlari');

-- Yanlis soru fotograflari (K, sira 0..4). Medya baglama: `ortak.dosya.baglandi.v1`.
create table ogrenme.gunluk_soru_dosyalari (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  kayit_id        uuid        not null,
  medya_dosya_id  uuid        not null,
  sira            smallint    not null default 0,
  constraint gunluk_soru_dosyalari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint gunluk_soru_dosyalari_kayit_id_fk foreign key (kurum_id, kayit_id) references ogrenme.gunluk_soru_kayitlari (kurum_id, id),
  constraint gunluk_soru_dosyalari_medya_dosya_id_uniq unique (medya_dosya_id),
  constraint gunluk_soru_dosyalari_kayit_id_sira_uniq unique (kayit_id, sira),
  constraint gunluk_soru_dosyalari_sira_chk check (sira between 0 and 4)
);
create index gunluk_soru_dosyalari_kurum_id_kayit_id_idx on ogrenme.gunluk_soru_dosyalari (kurum_id, kayit_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'gunluk_soru_dosyalari', false);
