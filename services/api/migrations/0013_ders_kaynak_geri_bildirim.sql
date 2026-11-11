-- 0013_ders_kaynak_geri_bildirim: ders sonu geri bildirimi, ders kayitlari/materyalleri (harici baglanti),
-- alicilar, izleme ve "aciliyor" bildirimleri. Genislet-daralt: yalniz yeni tablolar.
-- `not` ayrilmis sozcuktur: her yerde cift tirnakla yazilir.

-- Ogrencinin ders sonrasi anlama bildirimi (KS: olay uretir). Ders basina ogrenci basina tek satir.
create table ders.geri_bildirimler (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  surum       bigint      not null default 1,
  ders_id     uuid        not null,
  ogrenci_id  uuid        not null,
  deger       text        not null,
  konu_id     uuid,
  "not"       text,
  constraint geri_bildirimler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint geri_bildirimler_ders_id_fk foreign key (kurum_id, ders_id) references ders.dersler (kurum_id, id),
  constraint geri_bildirimler_katilimci_fk foreign key (ders_id, ogrenci_id)
    references ders.ders_katilimcilari (ders_id, ogrenci_id),
  constraint geri_bildirimler_ders_id_ogrenci_id_uniq unique (ders_id, ogrenci_id),
  constraint geri_bildirimler_deger_chk check (deger in ('anladim', 'kismen', 'anlamadim')),
  constraint geri_bildirimler_not_chk check ("not" is null or char_length("not") <= 500)
);
create index geri_bildirimler_kurum_id_ders_id_idx on ders.geri_bildirimler (kurum_id, ders_id);
create index geri_bildirimler_kurum_id_ogrenci_id_created_at_idx
  on ders.geri_bildirimler (kurum_id, ogrenci_id, created_at desc);
select ortak.kiraci_tablosu_koru('ders', 'geri_bildirimler');

-- Ders kaydi ve materyal (KS). Video bizde degil: harici baglanti. Parola AES-256-GCM ile uygulamada
-- sifrelenir (`parola_sifreli` = iv(12) || etiket(16) || sifreli metin).
create table ders.ders_kaynaklari (
  id                   uuid primary key,
  kurum_id             uuid        not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  surum                bigint      not null default 1,
  tur                  text        not null,
  ders_id              uuid,
  grup_id              uuid        not null,
  baslik               text        not null,
  saglayici            text        not null,
  url                  text        not null,
  parola_sifreli       bytea,
  gecerlilik_bitis_at  timestamptz,
  gorunurluk           text        not null default 'grup',
  konu_id              uuid,
  durum                text        not null default 'aktif',
  ekleyen_id           uuid        not null,
  silindi_at           timestamptz,
  constraint ders_kaynaklari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_kaynaklari_ders_id_fk foreign key (kurum_id, ders_id) references ders.dersler (kurum_id, id),
  constraint ders_kaynaklari_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint ders_kaynaklari_ekleyen_id_fk foreign key (kurum_id, ekleyen_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_kaynaklari_kurum_id_id_uniq unique (kurum_id, id),
  constraint ders_kaynaklari_tur_chk check (tur in ('kayit', 'materyal')),
  -- Kayit her zaman bir derse baglidir; materyal dersten bagimsiz (ders_id bos) ya da derse bagli olabilir.
  constraint ders_kaynaklari_kayit_ders_chk check (tur <> 'kayit' or ders_id is not null),
  constraint ders_kaynaklari_baslik_chk check (char_length(baslik) between 1 and 200),
  constraint ders_kaynaklari_saglayici_chk check (saglayici in ('zoom', 'drive', 'youtube', 'onedrive', 'diger')),
  constraint ders_kaynaklari_url_chk check (url ~ '^https://' and char_length(url) <= 2000),
  constraint ders_kaynaklari_gorunurluk_chk check (gorunurluk in ('ogretmen', 'grup', 'secili_ogrenciler')),
  constraint ders_kaynaklari_durum_chk check (durum in ('aktif', 'suresi_doldu', 'bozuk', 'gizli'))
);
create index ders_kaynaklari_kurum_id_grup_id_created_at_idx
  on ders.ders_kaynaklari (kurum_id, grup_id, created_at desc) where silindi_at is null;
create index ders_kaynaklari_kurum_id_ders_id_idx on ders.ders_kaynaklari (kurum_id, ders_id);
create index ders_kaynaklari_kurum_id_durum_gecerlilik_bitis_at_idx
  on ders.ders_kaynaklari (kurum_id, durum, gecerlilik_bitis_at);
-- Ek (semada yok): saatlik sure sonu isi kurum baglami olmadan tum kiracilarda tarar.
create index ders_kaynaklari_sure_sonu_idx on ders.ders_kaynaklari (gecerlilik_bitis_at)
  where durum = 'aktif' and silindi_at is null and gecerlilik_bitis_at is not null;
select ortak.kiraci_tablosu_koru('ders', 'ders_kaynaklari');

-- `secili_ogrenciler` gorunurlugu icin alici listesi (K).
create table ders.ders_kaynagi_alicilari (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  kaynak_id   uuid        not null,
  ogrenci_id  uuid        not null,
  constraint ders_kaynagi_alicilari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_kaynagi_alicilari_kaynak_id_fk foreign key (kurum_id, kaynak_id) references ders.ders_kaynaklari (kurum_id, id),
  constraint ders_kaynagi_alicilari_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_kaynagi_alicilari_kaynak_id_ogrenci_id_uniq unique (kaynak_id, ogrenci_id)
);
create index ders_kaynagi_alicilari_kurum_id_ogrenci_id_idx on ders.ders_kaynagi_alicilari (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('ders', 'ders_kaynagi_alicilari', false);

-- "Izledim" isareti (K). Ikinci isaret `ON CONFLICT DO NOTHING` ile yok sayilir; geri alinmaz.
create table ders.ders_kaynagi_izlemeleri (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  kaynak_id   uuid        not null,
  ogrenci_id  uuid        not null,
  izledi_at   timestamptz not null default now(),
  constraint ders_kaynagi_izlemeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_kaynagi_izlemeleri_kaynak_id_fk foreign key (kurum_id, kaynak_id) references ders.ders_kaynaklari (kurum_id, id),
  constraint ders_kaynagi_izlemeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_kaynagi_izlemeleri_kaynak_id_ogrenci_id_uniq unique (kaynak_id, ogrenci_id)
);
create index ders_kaynagi_izlemeleri_kurum_id_ogrenci_id_izledi_at_idx
  on ders.ders_kaynagi_izlemeleri (kurum_id, ogrenci_id, izledi_at desc);
select ortak.kiraci_tablosu_koru('ders', 'ders_kaynagi_izlemeleri', false);

-- Bozuk baglanti bildirimleri (K). Ayni ogrenci ayni kaynak icin tek ACIK bildirim.
create table ders.ders_kaynagi_sorunlari (
  id           uuid primary key,
  kurum_id     uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  kaynak_id    uuid        not null,
  bildiren_id  uuid        not null,
  neden        text        not null,
  aciklama     text,
  durum        text        not null default 'acik',
  cozen_id     uuid,
  cozuldu_at   timestamptz,
  constraint ders_kaynagi_sorunlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ders_kaynagi_sorunlari_kaynak_id_fk foreign key (kurum_id, kaynak_id) references ders.ders_kaynaklari (kurum_id, id),
  constraint ders_kaynagi_sorunlari_bildiren_id_fk foreign key (kurum_id, bildiren_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_kaynagi_sorunlari_cozen_id_fk foreign key (kurum_id, cozen_id) references hesap.uyelikler (kurum_id, id),
  constraint ders_kaynagi_sorunlari_neden_chk check (neden in ('acilmiyor', 'parola_yanlis', 'suresi_doldu', 'diger')),
  constraint ders_kaynagi_sorunlari_aciklama_chk check (aciklama is null or char_length(aciklama) <= 500),
  constraint ders_kaynagi_sorunlari_durum_chk check (durum in ('acik', 'cozuldu')),
  constraint ders_kaynagi_sorunlari_cozum_chk check ((durum = 'cozuldu') = (cozuldu_at is not null))
);
create unique index ders_kaynagi_sorunlari_acik_uniq
  on ders.ders_kaynagi_sorunlari (kaynak_id, bildiren_id) where durum = 'acik';
create index ders_kaynagi_sorunlari_kurum_id_kaynak_id_durum_idx
  on ders.ders_kaynagi_sorunlari (kurum_id, kaynak_id, durum);
select ortak.kiraci_tablosu_koru('ders', 'ders_kaynagi_sorunlari', false);
