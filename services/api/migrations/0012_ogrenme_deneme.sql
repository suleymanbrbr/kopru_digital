-- 0012_ogrenme_deneme: deneme sinavi kurallari (global + kurum ozel), deneme basligi ve bolum sonuclari.
-- Genislet-daralt: yalniz yeni tablolar. Net tam sayi olmayan TEK yerdir (numeric); defter degil, kanit degil.
-- Global kural tohumu RESMI KILAVUZDAN DOGRULANACAKTIR (docs/schema/api.md "Deneme sinavi" tohum notu):
-- yanlis katsayilari ve soru dagilimlari yer tutucudur; yeni yil icin yeni satir eklenir, eskisi kalir.

create schema if not exists ogrenme;
grant usage on schema ogrenme to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema ogrenme
  grant usage, select on sequences to api_app, api_sistem;

-- Sinav turu ve net kurali (GS: kurum_id NULL = global). Karma RLS asagida, tohumdan SONRA acilir
-- (tablo sahibi zorlanmis RLS altinda global satir ekleyemez).
create table ogrenme.deneme_kurallari (
  id                uuid primary key,
  kurum_id          uuid,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  created_by        uuid,
  surum             bigint        not null default 1,
  kod               text          not null,
  ad                text          not null,
  yanlis_katsayisi  numeric(5,4)  not null,
  bolumler          jsonb         not null,
  toplam_sure_dk    int,
  gecerli_yil       int,
  aktif             boolean       not null default true,
  constraint deneme_kurallari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint deneme_kurallari_kod_chk check (kod ~ '^[a-z][a-z0-9_]{1,59}$'),
  constraint deneme_kurallari_kapsam_kod_chk check (
    (kurum_id is null and kod not like 'ozel\_%') or (kurum_id is not null and kod like 'ozel\_%')
  ),
  constraint deneme_kurallari_ad_chk check (char_length(ad) between 1 and 200),
  constraint deneme_kurallari_katsayi_chk check (yanlis_katsayisi >= 0 and yanlis_katsayisi <= 1),
  constraint deneme_kurallari_bolumler_chk check (
    jsonb_typeof(bolumler) = 'array' and jsonb_array_length(bolumler) between 1 and 40
  ),
  constraint deneme_kurallari_sure_chk check (toplam_sure_dk is null or toplam_sure_dk between 1 and 1000),
  constraint deneme_kurallari_yil_chk check (gecerli_yil is null or gecerli_yil between 2000 and 2100)
);
create unique index deneme_kurallari_kod_uniq
  on ogrenme.deneme_kurallari (coalesce(kurum_id, '00000000-0000-0000-0000-000000000000'::uuid), kod, coalesce(gecerli_yil, 0));
create index deneme_kurallari_kurum_id_aktif_idx on ogrenme.deneme_kurallari (kurum_id, aktif);
create trigger deneme_kurallari_updated_at_trg before update on ogrenme.deneme_kurallari
  for each row execute function ortak.updated_at_ayarla();
create trigger deneme_kurallari_surum_trg before update on ogrenme.deneme_kurallari
  for each row execute function ortak.surum_artir();

-- Global tohum. Sabit UUIDv7 bicimli kimlikler: migration tekrar kosulmaz, yeniden uretilebilir.
-- bolumler: [{bolum_kodu, brans_kodu, ad, soru_sayisi}]; `bolum_kodu` kuralda tekildir
-- (AYT Tarih-1/Tarih-2 ayni branstan iki bolumdur).
insert into ogrenme.deneme_kurallari (id, kod, ad, yanlis_katsayisi, bolumler, toplam_sure_dk, gecerli_yil) values
  ('01990000-0000-7000-8000-000000000001', 'lgs', 'LGS', 0.3333,
   '[{"bolum_kodu":"turkce","brans_kodu":"turkce","ad":"Türkçe","soru_sayisi":20},
     {"bolum_kodu":"inkilap_tarihi","brans_kodu":"inkilap_tarihi","ad":"T.C. İnkılap Tarihi ve Atatürkçülük","soru_sayisi":10},
     {"bolum_kodu":"din_kulturu","brans_kodu":"din_kulturu","ad":"Din Kültürü ve Ahlak Bilgisi","soru_sayisi":10},
     {"bolum_kodu":"yabanci_dil","brans_kodu":"ingilizce","ad":"Yabancı Dil","soru_sayisi":10},
     {"bolum_kodu":"matematik","brans_kodu":"matematik","ad":"Matematik","soru_sayisi":20},
     {"bolum_kodu":"fen_bilimleri","brans_kodu":"fen_bilimleri","ad":"Fen Bilimleri","soru_sayisi":20}]'::jsonb,
   155, 2026),
  ('01990000-0000-7000-8000-000000000002', 'tyt', 'TYT', 0.2500,
   '[{"bolum_kodu":"turkce","brans_kodu":"turkce","ad":"Türkçe","soru_sayisi":40},
     {"bolum_kodu":"sosyal","brans_kodu":"sosyal_bilgiler","ad":"Sosyal Bilimler","soru_sayisi":20},
     {"bolum_kodu":"matematik","brans_kodu":"matematik","ad":"Temel Matematik","soru_sayisi":40},
     {"bolum_kodu":"fen","brans_kodu":"fen_bilimleri","ad":"Fen Bilimleri","soru_sayisi":20}]'::jsonb,
   135, 2026),
  ('01990000-0000-7000-8000-000000000003', 'ayt_say', 'AYT Sayısal', 0.2500,
   '[{"bolum_kodu":"matematik","brans_kodu":"matematik","ad":"Matematik","soru_sayisi":40},
     {"bolum_kodu":"fizik","brans_kodu":"fizik","ad":"Fizik","soru_sayisi":14},
     {"bolum_kodu":"kimya","brans_kodu":"kimya","ad":"Kimya","soru_sayisi":13},
     {"bolum_kodu":"biyoloji","brans_kodu":"biyoloji","ad":"Biyoloji","soru_sayisi":13}]'::jsonb,
   180, 2026),
  ('01990000-0000-7000-8000-000000000004', 'ayt_ea', 'AYT Eşit Ağırlık', 0.2500,
   '[{"bolum_kodu":"edebiyat","brans_kodu":"edebiyat","ad":"Türk Dili ve Edebiyatı","soru_sayisi":24},
     {"bolum_kodu":"tarih_1","brans_kodu":"tarih","ad":"Tarih-1","soru_sayisi":10},
     {"bolum_kodu":"cografya_1","brans_kodu":"cografya","ad":"Coğrafya-1","soru_sayisi":6},
     {"bolum_kodu":"matematik","brans_kodu":"matematik","ad":"Matematik","soru_sayisi":40}]'::jsonb,
   180, 2026),
  ('01990000-0000-7000-8000-000000000005', 'ayt_soz', 'AYT Sözel', 0.2500,
   '[{"bolum_kodu":"edebiyat","brans_kodu":"edebiyat","ad":"Türk Dili ve Edebiyatı","soru_sayisi":24},
     {"bolum_kodu":"tarih_1","brans_kodu":"tarih","ad":"Tarih-1","soru_sayisi":10},
     {"bolum_kodu":"cografya_1","brans_kodu":"cografya","ad":"Coğrafya-1","soru_sayisi":6},
     {"bolum_kodu":"tarih_2","brans_kodu":"tarih","ad":"Tarih-2","soru_sayisi":11},
     {"bolum_kodu":"cografya_2","brans_kodu":"cografya","ad":"Coğrafya-2","soru_sayisi":11},
     {"bolum_kodu":"felsefe","brans_kodu":"felsefe","ad":"Felsefe Grubu","soru_sayisi":12},
     {"bolum_kodu":"din_kulturu","brans_kodu":"din_kulturu","ad":"Din Kültürü ve Ahlak Bilgisi","soru_sayisi":6}]'::jsonb,
   180, 2026),
  ('01990000-0000-7000-8000-000000000006', 'ayt_dil', 'AYT Dil', 0.2500,
   '[{"bolum_kodu":"yabanci_dil","brans_kodu":"ingilizce","ad":"Yabancı Dil","soru_sayisi":80}]'::jsonb,
   120, 2026),
  ('01990000-0000-7000-8000-000000000007', 'ydt', 'YDT (Yabancı Dil Testi)', 0.2500,
   '[{"bolum_kodu":"yabanci_dil","brans_kodu":"ingilizce","ad":"Yabancı Dil","soru_sayisi":80}]'::jsonb,
   120, 2026);

-- Tohum butunlugu: kullanilan her brans kodu ortak.bransler'de olmali (JSON icinde FK olmaz).
do $$
declare
  eksik text;
begin
  select string_agg(distinct b ->> 'brans_kodu', ', ') into eksik
  from ogrenme.deneme_kurallari k, jsonb_array_elements(k.bolumler) b
  where not exists (select 1 from ortak.bransler br where br.kod = b ->> 'brans_kodu');
  if eksik is not null then
    raise exception 'deneme_kurali_tohum_brans_yok: %', eksik;
  end if;
end $$;

-- Karma RLS: global satirlari herkes okur; kurum yalniz kendi ozel kurallarini yazar/siler.
alter table ogrenme.deneme_kurallari enable row level security;
alter table ogrenme.deneme_kurallari force row level security;
create policy deneme_kurallari_oku on ogrenme.deneme_kurallari for select
  using (kurum_id is null or kurum_id = ortak.aktif_kurum());
create policy deneme_kurallari_ekle on ogrenme.deneme_kurallari for insert
  with check (kurum_id = ortak.aktif_kurum());
create policy deneme_kurallari_guncelle on ogrenme.deneme_kurallari for update
  using (kurum_id = ortak.aktif_kurum()) with check (kurum_id = ortak.aktif_kurum());
create policy deneme_kurallari_sil on ogrenme.deneme_kurallari for delete
  using (kurum_id = ortak.aktif_kurum());

-- Ogrencinin girdigi deneme sonucu basligi.
-- `not_metni`: dokumandaki `not` sutunu SQL ayrilmis sozcugu oldugu icin bu adla tutulur.
create table ogrenme.denemeler (
  id                uuid primary key,
  kurum_id          uuid          not null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  created_by        uuid,
  surum             bigint        not null default 1,
  ogrenci_id        uuid          not null,
  kural_id          uuid          not null,
  kural_kodu        text          not null,
  yanlis_katsayisi  numeric(5,4)  not null,
  ad                text          not null,
  yayinevi          text,
  sinav_tarihi      date          not null,
  toplam_net        numeric(6,2)  not null default 0,
  giren_id          uuid          not null,
  kaynak            text          not null,
  sure_dk           int,
  not_metni         text,
  onay_durumu       text          not null default 'bekliyor',
  onaylayan_id      uuid,
  onay_at           timestamptz,
  red_nedeni        text,
  constraint denemeler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint denemeler_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint denemeler_giren_id_fk foreign key (kurum_id, giren_id) references hesap.uyelikler (kurum_id, id),
  constraint denemeler_onaylayan_id_fk foreign key (kurum_id, onaylayan_id) references hesap.uyelikler (kurum_id, id),
  constraint denemeler_kural_id_fk foreign key (kural_id) references ogrenme.deneme_kurallari (id),
  constraint denemeler_kurum_id_id_uniq unique (kurum_id, id),
  -- Ayni ogrenci/kural/tarih/ad ikinci kez girilemez (cift tiklama ve Excel'in yeniden yuklenmesine karsi).
  constraint denemeler_tekil_uniq unique (ogrenci_id, kural_id, sinav_tarihi, ad),
  constraint denemeler_ad_chk check (char_length(ad) between 1 and 200),
  constraint denemeler_yayinevi_chk check (yayinevi is null or char_length(yayinevi) <= 200),
  constraint denemeler_not_chk check (not_metni is null or char_length(not_metni) <= 2000),
  constraint denemeler_sure_chk check (sure_dk is null or sure_dk between 1 and 1000),
  constraint denemeler_katsayi_chk check (yanlis_katsayisi >= 0 and yanlis_katsayisi <= 1),
  constraint denemeler_kaynak_chk check (kaynak in ('ogrenci', 'ogretmen')),
  constraint denemeler_kaynak_giren_chk check (kaynak <> 'ogrenci' or giren_id = ogrenci_id),
  constraint denemeler_onay_durumu_chk check (onay_durumu in ('bekliyor', 'onaylandi', 'reddedildi')),
  -- Ogretmen/yonetici girisi dogrudan onaylidir; yalniz ogrenci girisi bekleyebilir/reddedilebilir.
  constraint denemeler_ogretmen_onayli_chk check (kaynak = 'ogrenci' or onay_durumu = 'onaylandi'),
  constraint denemeler_onay_chk check (
    (onay_durumu = 'bekliyor' and onay_at is null and onaylayan_id is null and red_nedeni is null)
    or (onay_durumu = 'onaylandi' and onay_at is not null and onaylayan_id is not null and red_nedeni is null)
    or (onay_durumu = 'reddedildi' and onay_at is not null and onaylayan_id is not null
        and red_nedeni is not null and char_length(red_nedeni) between 1 and 500)
  )
);
create index denemeler_kurum_id_ogrenci_id_sinav_tarihi_idx
  on ogrenme.denemeler (kurum_id, ogrenci_id, sinav_tarihi desc);
create index denemeler_gelisim_idx
  on ogrenme.denemeler (kurum_id, ogrenci_id, kural_kodu, sinav_tarihi desc, id desc)
  where onay_durumu = 'onaylandi';
create index denemeler_onay_kuyrugu_idx
  on ogrenme.denemeler (kurum_id, created_at desc) where onay_durumu = 'bekliyor';
select ortak.kiraci_tablosu_koru('ogrenme', 'denemeler');

-- Bolum (brans) bazinda dogru/yanlis/bos. `net` veritabaninca uretilir; uygulama net hesaplamaz.
-- `bolum_kodu`: kuralin bolum kimligi (AYT Tarih-1 ve Tarih-2 ayni `brans_kodu` ile iki bolumdur).
create table ogrenme.deneme_bolumleri (
  id          uuid primary key,
  kurum_id    uuid          not null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  created_by  uuid,
  deneme_id   uuid          not null,
  bolum_kodu  text          not null,
  brans_kodu  text          not null,
  soru_sayisi smallint      not null,
  dogru       smallint      not null,
  yanlis      smallint      not null,
  bos         smallint      not null,
  katsayi     numeric(5,4)  not null,
  net         numeric(6,2)  generated always as (round(dogru - yanlis * katsayi, 2)) stored,
  constraint deneme_bolumleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint deneme_bolumleri_deneme_id_fk foreign key (kurum_id, deneme_id)
    references ogrenme.denemeler (kurum_id, id) on delete cascade,
  constraint deneme_bolumleri_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint deneme_bolumleri_bolum_kodu_chk check (bolum_kodu ~ '^[a-z][a-z0-9_]{0,59}$'),
  constraint deneme_bolumleri_soru_sayisi_chk check (soru_sayisi > 0),
  constraint deneme_bolumleri_sayilar_chk check (dogru >= 0 and yanlis >= 0 and bos >= 0),
  constraint deneme_bolumleri_toplam_chk check (dogru + yanlis + bos = soru_sayisi),
  constraint deneme_bolumleri_katsayi_chk check (katsayi >= 0 and katsayi <= 1),
  constraint deneme_bolumleri_deneme_id_bolum_kodu_uniq unique (deneme_id, bolum_kodu)
);
create index deneme_bolumleri_kurum_id_deneme_id_idx on ogrenme.deneme_bolumleri (kurum_id, deneme_id);
create index deneme_bolumleri_kurum_id_brans_kodu_deneme_id_idx
  on ogrenme.deneme_bolumleri (kurum_id, brans_kodu, deneme_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'deneme_bolumleri', false);
