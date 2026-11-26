-- 0023_ogrenme_degerlendirme: ogretmen degerlendirmeleri ve onerilen kaynaklar (kocluk gorunumu).
-- Genislet-daralt: yalniz yeni tablolar. `konu_id` mufredat tablolarina FK'siz uuid'dir (gunluk soru ile ayni).
-- Tasarim: docs/schema/api.md "Ogretmen degerlendirmeleri, onerilen kaynaklar ve kocluk gorunumu".

-- Ogretmenin ogrenci hakkinda donemlik degerlendirmesi. Silinmez, geri cekilir (api_app'ten DELETE alinir;
-- yalniz KVKK silme isi `api_sistem` ile siler).
create table ogrenme.ogretmen_degerlendirmeleri (
  id                     uuid primary key,
  kurum_id               uuid        not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  surum                  bigint      not null default 1,
  ogrenci_id             uuid        not null,
  yazar_id               uuid        not null,
  donem_baslangic        date        not null,
  donem_bitis            date        not null,
  brans_kodu             text,
  calisma_duzeni         smallint,
  derse_katilim          smallint,
  odev_disiplini         smallint,
  anlama_duzeyi          smallint,
  yorum                  text,
  ogrenci_gorur          boolean     not null default false,
  ogrenci_bildirildi_at  timestamptz,
  geri_cekildi_at        timestamptz,
  geri_cekilen_id        uuid,
  constraint ogretmen_degerlendirmeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint ogretmen_degerlendirmeleri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint ogretmen_degerlendirmeleri_yazar_id_fk foreign key (kurum_id, yazar_id) references hesap.uyelikler (kurum_id, id),
  constraint ogretmen_degerlendirmeleri_geri_cekilen_id_fk foreign key (kurum_id, geri_cekilen_id) references hesap.uyelikler (kurum_id, id),
  constraint ogretmen_degerlendirmeleri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint ogretmen_degerlendirmeleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint ogretmen_degerlendirmeleri_donem_chk check (donem_bitis >= donem_baslangic and donem_bitis - donem_baslangic <= 30),
  constraint ogretmen_degerlendirmeleri_olcek_chk check (
    (calisma_duzeni is null or calisma_duzeni between 1 and 5)
    and (derse_katilim is null or derse_katilim between 1 and 5)
    and (odev_disiplini is null or odev_disiplini between 1 and 5)
    and (anlama_duzeyi is null or anlama_duzeyi between 1 and 5)),
  constraint ogretmen_degerlendirmeleri_yorum_chk check (yorum is null or char_length(yorum) between 1 and 4000),
  constraint ogretmen_degerlendirmeleri_icerik_chk check (
    yorum is not null or calisma_duzeni is not null or derse_katilim is not null
    or odev_disiplini is not null or anlama_duzeyi is not null),
  constraint ogretmen_degerlendirmeleri_geri_cekme_chk check ((geri_cekildi_at is null) = (geri_cekilen_id is null))
);
-- Zaman cizelgesi (ogrenci basina, en yeni once).
create index ogretmen_degerlendirmeleri_ogrenci_created_at_idx
  on ogrenme.ogretmen_degerlendirmeleri (kurum_id, ogrenci_id, created_at desc);
-- Son 4 haftanin olcek ortalamalari.
create index ogretmen_degerlendirmeleri_ogrenci_donem_idx
  on ogrenme.ogretmen_degerlendirmeleri (kurum_id, ogrenci_id, donem_baslangic) where geri_cekildi_at is null;
-- Hatirlatma: yazarin bu hafta yazdiklari.
create index ogretmen_degerlendirmeleri_yazar_donem_idx
  on ogrenme.ogretmen_degerlendirmeleri (kurum_id, yazar_id, donem_baslangic) where geri_cekildi_at is null;
select ortak.kiraci_tablosu_koru('ogrenme', 'ogretmen_degerlendirmeleri');
revoke delete on ogrenme.ogretmen_degerlendirmeleri from api_app;

-- Ogrenci rolu (oturumda `app.roller` `ogrenci` icerir) yalniz kendisine GORUNUR ve geri cekilmemis olani okur.
-- RESTRICTIVE: kiraci politikasi ile VE'lenir; uygulama kodu hatali olsa bile gizli yorum ogrenciye sizmaz.
create policy ogrenci_yalniz_gorunen on ogrenme.ogretmen_degerlendirmeleri
  as restrictive for select
  using (
    not (string_to_array(coalesce(current_setting('app.roller', true), ''), ',') @> array['ogrenci'])
    or (
      ogrenci_gorur and geri_cekildi_at is null
      and ogrenci_id in (select u.id from hesap.uyelikler u where u.kullanici_id = ortak.aktif_kullanici())
    )
  );

-- Ogretmenin ogrenciye onerdigi kaynak. Silinmez, geri cekilir.
create table ogrenme.kaynak_onerileri (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ogrenci_id       uuid        not null,
  oneren_id        uuid        not null,
  tur              text        not null,
  kaynak_kitap_id  uuid,
  kaynak_test_id   uuid,
  baglanti_url     text,
  baslik           text,
  brans_kodu       text,
  konu_id          uuid,
  not_metni        text,
  geri_cekildi_at  timestamptz,
  geri_cekilen_id  uuid,
  constraint kaynak_onerileri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kaynak_onerileri_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint kaynak_onerileri_oneren_id_fk foreign key (kurum_id, oneren_id) references hesap.uyelikler (kurum_id, id),
  constraint kaynak_onerileri_geri_cekilen_id_fk foreign key (kurum_id, geri_cekilen_id) references hesap.uyelikler (kurum_id, id),
  constraint kaynak_onerileri_kaynak_kitap_id_fk foreign key (kurum_id, kaynak_kitap_id) references ogrenme.kaynak_kitaplar (kurum_id, id),
  constraint kaynak_onerileri_kaynak_test_id_fk foreign key (kurum_id, kaynak_test_id) references ogrenme.kaynak_kitap_testleri (kurum_id, id),
  constraint kaynak_onerileri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint kaynak_onerileri_kurum_id_id_uniq unique (kurum_id, id),
  constraint kaynak_onerileri_tur_chk check (tur in ('kaynak_kitap', 'kaynak_kitap_testi', 'link', 'serbest')),
  constraint kaynak_onerileri_tur_alan_chk check (
    case tur
      when 'kaynak_kitap' then kaynak_kitap_id is not null and kaynak_test_id is null and baglanti_url is null and baslik is null
      when 'kaynak_kitap_testi' then kaynak_kitap_id is not null and kaynak_test_id is not null and baglanti_url is null and baslik is null
      when 'link' then kaynak_kitap_id is null and kaynak_test_id is null and baglanti_url is not null and baslik is not null
      else kaynak_kitap_id is null and kaynak_test_id is null and baglanti_url is null and baslik is not null
    end),
  constraint kaynak_onerileri_baslik_chk check (baslik is null or char_length(baslik) between 1 and 200),
  constraint kaynak_onerileri_url_chk check (baglanti_url is null or (char_length(baglanti_url) <= 2000 and baglanti_url ~* '^https?://')),
  constraint kaynak_onerileri_not_chk check (not_metni is null or char_length(not_metni) between 1 and 1000),
  constraint kaynak_onerileri_geri_cekme_chk check ((geri_cekildi_at is null) = (geri_cekilen_id is null))
);
create index kaynak_onerileri_ogrenci_created_at_idx on ogrenme.kaynak_onerileri (kurum_id, ogrenci_id, created_at desc);
create index kaynak_onerileri_oneren_id_idx on ogrenme.kaynak_onerileri (kurum_id, oneren_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'kaynak_onerileri');
revoke delete on ogrenme.kaynak_onerileri from api_app;

-- Ogrenci rolu yalniz kendine onerilen ve geri cekilmemis kaynagi okur.
create policy ogrenci_yalniz_kendi on ogrenme.kaynak_onerileri
  as restrictive for select
  using (
    not (string_to_array(coalesce(current_setting('app.roller', true), ''), ',') @> array['ogrenci'])
    or (
      geri_cekildi_at is null
      and ogrenci_id in (select u.id from hesap.uyelikler u where u.kullanici_id = ortak.aktif_kullanici())
    )
  );
