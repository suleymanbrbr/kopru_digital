-- 0002_yapilandirma: global (kiracisiz, RLS yok) yapilandirma tablolari ve tohumlari
-- (docs/schema/motivasyon.md "Yapilandirma tablolari"). Degerleri yalniz motivasyon_sistem (platform
-- yoneticisi) degistirir; uygulama rolu (motivasyon_app) okur.

-- --- XP tavanlari ve kurallari ---------------------------------------------------------------

create table motivasyon.xp_tavanlari (
  kod               text primary key,
  gunluk_ust_sinir  int  not null,
  aciklama          text,
  constraint xp_tavanlari_gunluk_ust_sinir_chk check (gunluk_ust_sinir > 0)
);

insert into motivasyon.xp_tavanlari (kod, gunluk_ust_sinir, aciklama) values
  ('genel', 300, 'Bir gunde tavana tabi tum kurallardan en cok kazanilabilen toplam XP'),
  ('plan',   40, 'Plan gorevi tamamlama (kendi beyani)'),
  ('odak',  120, 'Odak sayaci'),
  ('soru',   20, 'Soru sorma ve "anladim"'),
  ('kayit',  15, 'Ders kaydi izleme');

create table motivasyon.xp_kurallari (
  kod                  text primary key,
  olay_turu            text        not null,
  kosul                jsonb       not null default '{}',
  xp                   int         not null,
  birim                text,
  olay_basi_ust_sinir  int,
  gec_carpani          numeric(3,2) not null default 1.00,
  tavan_grubu          text,
  genel_tavana_tabi    boolean     not null default true,
  aktif                boolean     not null default true,
  constraint xp_kurallari_xp_chk check (xp >= 0),
  constraint xp_kurallari_birim_chk check (birim is null or birim in ('dakika', 'net')),
  constraint xp_kurallari_gec_carpani_chk check (gec_carpani >= 0 and gec_carpani <= 1),
  constraint xp_kurallari_olay_basi_ust_sinir_chk check (olay_basi_ust_sinir is null or olay_basi_ust_sinir > 0),
  constraint xp_kurallari_tavan_grubu_fk foreign key (tavan_grubu) references motivasyon.xp_tavanlari (kod)
);

insert into motivasyon.xp_kurallari
  (kod, olay_turu, kosul, xp, birim, olay_basi_ust_sinir, gec_carpani, tavan_grubu, genel_tavana_tabi) values
  ('yoklama_geldi',     'ders.yoklama.kaydedildi',          '{"durum": ["geldi", "gec"]}',        20, null,     null, 1.00, null,    true),
  ('odev_teslim',       'ogrenme.odev.teslim_edildi',       '{}',                                  15, null,     null, 0.50, null,    true),
  ('odev_onay',         'ogrenme.odev.incelendi',           '{"inceleme_sonucu": ["tamam"]}',      10, null,     null, 1.00, null,    true),
  ('plan_gorevi_tamam', 'ogrenme.plan_gorevi.guncellendi',  '{"durum": ["tamam"]}',                 5, null,     null, 1.00, 'plan',  true),
  ('odak_oturumu',      'istemci',                          '{}',                                   1, 'dakika', null, 1.00, 'odak',  true),
  ('deneme_girisi',     'ogrenme.deneme.girildi',           '{}',                                  10, null,     null, 1.00, null,    true),
  ('deneme_net_artisi', 'ogrenme.deneme.girildi',           '{}',                                   5, 'net',      50, 1.00, null,    true),
  ('soru_sorma',        'ogrenme.soru.sorildi',             '{}',                                   3, null,     null, 1.00, 'soru',  true),
  ('soru_anladim',      'ogrenme.soru.cozuldu',             '{}',                                   5, null,     null, 1.00, 'soru',  true),
  ('geri_bildirim',     'ders.geri_bildirim.verildi',       '{}',                                   2, null,     null, 1.00, null,    true),
  ('kayit_izledi',      'ders.kaynak.izlendi',              '{}',                                   5, null,     null, 1.00, 'kayit', true),
  ('haftanin_yildizi',  'istemci',                          '{}',                                  50, null,     null, 1.00, null,    false);

-- --- Ayarlar ve degisiklik gunlugu -----------------------------------------------------------

create table motivasyon.motivasyon_ayarlari (
  anahtar   text  primary key,
  deger     jsonb not null,
  aciklama  text
);

insert into motivasyon.motivasyon_ayarlari (anahtar, deger, aciklama) values
  ('seri.plan_esigi',                       '1',                  'Seri gunu icin en az plan gorevi'),
  ('seri.odak_dk_esigi',                    '20',                 'Seri gunu icin en az odak dakikasi'),
  ('seri.odev_esigi',                       '1',                  'Seri gunu icin en az odev teslimi'),
  ('seri.soru_esigi',                       '1',                  'Seri gunu icin en az "anladim" ile cozulen soru'),
  ('seri.dondurma_haftalik',                '1',                  'Haftada biriken dondurma hakki'),
  ('seri.dondurma_azami',                   '2',                  'Biriken en cok dondurma hakki'),
  ('seri.onarim_aylik',                     '1',                  'Ayda onarim hakki'),
  ('seri.kilometre_taslari',                '[3, 7, 14, 30, 60, 100, 365]', 'Seri kilometre taslari (gun)'),
  ('haftanin_yildizi.ogretmen_haftalik_limit', '3',               'Ogretmenin haftada verebilecegi "haftanin yildizi" sayisi (urun onayi bekler)'),
  ('supheli.plan_gorevi_pencere_sn',        '60',                 'Supheli ornek: plan gorevi tamamlama penceresi (sn)'),
  ('supheli.plan_gorevi_esik',              '10',                 'Pencerede bu sayidan FAZLA plan gorevi tamamlanirsa XP verilmez');

create table motivasyon.yapilandirma_gecmisi (
  id                      uuid primary key,
  tablo                   text        not null,
  anahtar                 text        not null,
  once                    jsonb,
  sonra                   jsonb,
  degistiren_kullanici_id uuid,
  neden                   text,
  created_at              timestamptz not null default now(),
  constraint yapilandirma_gecmisi_neden_chk check (neden is null or char_length(neden) <= 500)
);
create index yapilandirma_gecmisi_tablo_anahtar_idx on motivasyon.yapilandirma_gecmisi (tablo, anahtar, created_at desc);
create trigger yapilandirma_gecmisi_degismez_trg
  before update or delete on motivasyon.yapilandirma_gecmisi
  for each row execute function ortak.defter_degistirilemez();

-- --- Seviyeler -------------------------------------------------------------------------------
-- Egri: services/motivasyon/src/seviye-egrisi.ts (hedefler ve varsayimlar docs/schema/motivasyon.md'de).
-- Test, bu tohumun fonksiyonla ayni oldugunu denetler.

create table motivasyon.seviyeler (
  seviye            int    primary key,
  gereken_toplam_xp bigint not null,
  ad                text,
  constraint seviyeler_seviye_chk check (seviye >= 1),
  constraint seviyeler_gereken_toplam_xp_chk check (gereken_toplam_xp >= 0 and (seviye > 1 or gereken_toplam_xp = 0)),
  constraint seviyeler_gereken_toplam_xp_uniq unique (gereken_toplam_xp)
);

insert into motivasyon.seviyeler (seviye, gereken_toplam_xp) values
  (1, 0), (2, 20), (3, 60), (4, 170), (5, 380), (6, 690), (7, 1070), (8, 1480), (9, 1910), (10, 2360),
  (11, 2830), (12, 3300), (13, 3520), (14, 3790), (15, 4080), (16, 4380), (17, 4700), (18, 5030),
  (19, 5360), (20, 5700), (21, 6050), (22, 6410), (23, 6770), (24, 7130), (25, 7500), (26, 8060),
  (27, 8730), (28, 9460), (29, 10230), (30, 11030), (31, 11860), (32, 12700), (33, 13570), (34, 14450),
  (35, 15340), (36, 16250), (37, 17170), (38, 18100), (39, 19050), (40, 20000), (41, 21010), (42, 22080),
  (43, 23210), (44, 24410), (45, 25680), (46, 27030), (47, 28460), (48, 29980), (49, 31590), (50, 33300),
  (51, 35110), (52, 37030), (53, 39070), (54, 41230), (55, 43520), (56, 45950), (57, 48530), (58, 51260),
  (59, 54150), (60, 57210);

-- --- Rozetler --------------------------------------------------------------------------------
-- Bes kategori, bronz/gumus/altin kademeleri. Her rozet bir sayac esigiyle ifade edilir; sayac degeri
-- (`ogrenci_sayaclari`) esige ulasinca kazanilir. Baskasiyla kiyaslayan rozet yoktur. Liste yer tutucudur.
--   toplam_aktif_gun, en_uzun_seri : seri paketi gunceller
--   toplam_odak_dk                 : odak paketi gunceller (oturum kapanisi, dakika)
--   haftanin_yildizi               : yildiz ucu gunceller
--   digerleri                      : XP tuketicisi gunceller

create table motivasyon.rozet_tanimlari (
  kod        text primary key,
  ad         text    not null,
  aciklama   text    not null,
  kategori   text    not null,
  kademe     text    not null,
  sayac_kodu text    not null,
  esik       bigint  not null,
  gizli      boolean not null default false,
  sira       int     not null,
  aktif      boolean not null default true,
  constraint rozet_tanimlari_kategori_chk check (kategori in ('devamlilik', 'emek', 'gelisim', 'merak', 'ozel')),
  constraint rozet_tanimlari_kademe_chk check (kademe in ('bronz', 'gumus', 'altin')),
  constraint rozet_tanimlari_esik_chk check (esik > 0)
);
create index rozet_tanimlari_sayac_kodu_idx on motivasyon.rozet_tanimlari (sayac_kodu) where aktif;

insert into motivasyon.rozet_tanimlari (kod, ad, aciklama, kategori, kademe, sayac_kodu, esik, gizli, sira) values
  ('seri_bronz',   'Bir Haftalık Seri',   '7 gün üst üste çalıştın.',                     'devamlilik', 'bronz', 'en_uzun_seri',       7,    false, 10),
  ('seri_gumus',   'Bir Aylık Seri',      '30 gün üst üste çalıştın.',                    'devamlilik', 'gumus', 'en_uzun_seri',       30,   false, 11),
  ('seri_altin',   'Yüz Günlük Seri',     '100 gün üst üste çalıştın.',                   'devamlilik', 'altin', 'en_uzun_seri',       100,  false, 12),
  ('aktif_gun_bronz', 'On Çalışma Günü',   'Toplam 10 gün çalıştın.',                     'devamlilik', 'bronz', 'toplam_aktif_gun',   10,   false, 13),
  ('aktif_gun_gumus', 'Elli Çalışma Günü', 'Toplam 50 gün çalıştın.',                     'devamlilik', 'gumus', 'toplam_aktif_gun',   50,   false, 14),
  ('aktif_gun_altin', 'Yüz Elli Çalışma Günü', 'Toplam 150 gün çalıştın.',                'devamlilik', 'altin', 'toplam_aktif_gun',   150,  false, 15),

  ('odev_bronz',   'İlk Ödevler',         '5 ödev teslim ettin.',                         'emek',       'bronz', 'toplam_odev_teslim', 5,    false, 20),
  ('odev_gumus',   'Ödev Düzeni',         '25 ödev teslim ettin.',                        'emek',       'gumus', 'toplam_odev_teslim', 25,   false, 21),
  ('odev_altin',   'Ödev Ustası',         '100 ödev teslim ettin.',                       'emek',       'altin', 'toplam_odev_teslim', 100,  false, 22),
  ('odak_bronz',   'Beş Saat Odak',       'Toplam 5 saat odaklandın.',                    'emek',       'bronz', 'toplam_odak_dk',     300,  false, 23),
  ('odak_gumus',   'Yirmi Beş Saat Odak', 'Toplam 25 saat odaklandın.',                   'emek',       'gumus', 'toplam_odak_dk',     1500, false, 24),
  ('odak_altin',   'Yüz Saat Odak',       'Toplam 100 saat odaklandın.',                  'emek',       'altin', 'toplam_odak_dk',     6000, true,  25),
  ('soru_cozum_bronz', 'Yüz Soru',        'Ödevlerinde 100 soru çözdün.',                 'emek',       'bronz', 'toplam_cozulen_soru', 100,  false, 26),
  ('soru_cozum_gumus', 'Beş Yüz Soru',    'Ödevlerinde 500 soru çözdün.',                 'emek',       'gumus', 'toplam_cozulen_soru', 500,  false, 27),
  ('soru_cozum_altin', 'İki Bin Soru',    'Ödevlerinde 2000 soru çözdün.',                'emek',       'altin', 'toplam_cozulen_soru', 2000, false, 28),

  ('net_bronz',    'İlk Gelişim',         'Bir denemede önceki denemelerinden daha iyi yaptın.', 'gelisim', 'bronz', 'net_artisi_deneme', 1,   false, 30),
  ('net_gumus',    'Gelişen Denemeler',   '5 denemede önceki denemelerinden daha iyi yaptın.',   'gelisim', 'gumus', 'net_artisi_deneme', 5,   false, 31),
  ('net_altin',    'Sürekli Gelişim',     '15 denemede önceki denemelerinden daha iyi yaptın.',  'gelisim', 'altin', 'net_artisi_deneme', 15,  false, 32),
  ('net_toplam_bronz', 'On Net Yukarı',   'Denemelerinde toplam 10 net artırdın.',        'gelisim',    'bronz', 'toplam_net_artisi',  10,   false, 33),
  ('net_toplam_gumus', 'Elli Net Yukarı', 'Denemelerinde toplam 50 net artırdın.',        'gelisim',    'gumus', 'toplam_net_artisi',  50,   false, 34),
  ('net_toplam_altin', 'Yüz Elli Net Yukarı', 'Denemelerinde toplam 150 net artırdın.',   'gelisim',    'altin', 'toplam_net_artisi',  150,  false, 35),

  ('merak_soru_bronz',   'Meraklı',       '3 soru sordun.',                               'merak',      'bronz', 'toplam_soru',        3,    false, 40),
  ('merak_soru_gumus',   'Soru Avcısı',   '15 soru sordun.',                              'merak',      'gumus', 'toplam_soru',        15,   false, 41),
  ('merak_soru_altin',   'Soru Ustası',   '50 soru sordun.',                              'merak',      'altin', 'toplam_soru',        50,   false, 42),
  ('merak_anladim_bronz', 'Anladım!',     '3 soruyu "anladım" diyerek tamamladın.',       'merak',      'bronz', 'toplam_anladim',     3,    false, 43),
  ('merak_anladim_gumus', 'Bir Şey Öğrendim', '15 soruyu "anladım" diyerek tamamladın.',  'merak',      'gumus', 'toplam_anladim',     15,   false, 44),
  ('merak_anladim_altin', 'Her Şeyi Çözdüm', '50 soruyu "anladım" diyerek tamamladın.',   'merak',      'altin', 'toplam_anladim',     50,   false, 45),
  ('merak_kayit_bronz',  'Tekrar İzleyen', '3 ders kaydını izledin.',                     'merak',      'bronz', 'toplam_kayit_izleme', 3,   false, 46),
  ('merak_kayit_gumus',  'Kayıt Takipçisi', '15 ders kaydını izledin.',                   'merak',      'gumus', 'toplam_kayit_izleme', 15,  false, 47),
  ('merak_kayit_altin',  'Kayıt Uzmanı',  '50 ders kaydını izledin.',                     'merak',      'altin', 'toplam_kayit_izleme', 50,  false, 48),

  ('yildiz_bronz', 'Haftanın Yıldızı',    'Öğretmenin seni haftanın yıldızı seçti.',      'ozel',       'bronz', 'haftanin_yildizi',   1,    true,  50),
  ('yildiz_gumus', 'Üç Kez Yıldız',       'Öğretmenin seni 3 kez haftanın yıldızı seçti.', 'ozel',      'gumus', 'haftanin_yildizi',   3,    true,  51),
  ('yildiz_altin', 'Yıldız Öğrenci',      'Öğretmenin seni 10 kez haftanın yıldızı seçti.', 'ozel',     'altin', 'haftanin_yildizi',   10,   true,  52);

-- --- Karakter turleri ve asamalari -----------------------------------------------------------

create table motivasyon.karakter_turleri (
  kod    text    primary key,
  ad     text    not null,
  aktif  boolean not null default true
);
insert into motivasyon.karakter_turleri (kod, ad) values
  ('kivilcim', 'Kıvılcım'), ('dinamo', 'Dinamo'), ('sedir', 'Sedir');

create table motivasyon.karakter_asamalari (
  tur_kodu        text     not null,
  asama           smallint not null,
  gereken_seviye  int      not null,
  ad              text,
  primary key (tur_kodu, asama),
  constraint karakter_asamalari_tur_kodu_fk foreign key (tur_kodu) references motivasyon.karakter_turleri (kod),
  constraint karakter_asamalari_asama_chk check (asama between 1 and 5),
  constraint karakter_asamalari_gereken_seviye_chk check (gereken_seviye >= 1)
);
insert into motivasyon.karakter_asamalari (tur_kodu, asama, gereken_seviye, ad)
  select t.kod, a.asama, a.seviye, a.ad
    from motivasyon.karakter_turleri t
   cross join (values (1, 1, 'Tohum'), (2, 5, 'Yavru'), (3, 12, 'Genç'), (4, 25, 'Usta'), (5, 40, 'Efsane'))
     as a (asama, seviye, ad);

-- --- Beceriler ve brans esleme ---------------------------------------------------------------

create table motivasyon.beceri_tanimlari (
  kod   text primary key,
  ad    text not null,
  sira  int  not null
);
insert into motivasyon.beceri_tanimlari (kod, ad, sira) values
  ('sayisal', 'Sayısal', 1), ('sozel', 'Sözel', 2), ('fen', 'Fen', 3), ('sosyal', 'Sosyal', 4), ('dil', 'Dil', 5);

-- brans_kodu = ortak.bransler.kod (api veritabaninda; burada FK yok). `diger` eslenmez.
create table motivasyon.brans_beceri_eslemesi (
  brans_kodu   text primary key,
  beceri_kodu  text not null,
  constraint brans_beceri_eslemesi_beceri_kodu_fk foreign key (beceri_kodu) references motivasyon.beceri_tanimlari (kod)
);
insert into motivasyon.brans_beceri_eslemesi (brans_kodu, beceri_kodu) values
  ('matematik', 'sayisal'), ('geometri', 'sayisal'),
  ('turkce', 'sozel'), ('edebiyat', 'sozel'),
  ('fizik', 'fen'), ('kimya', 'fen'), ('biyoloji', 'fen'), ('fen_bilimleri', 'fen'),
  ('tarih', 'sosyal'), ('cografya', 'sosyal'), ('felsefe', 'sosyal'), ('din_kulturu', 'sosyal'),
  ('sosyal_bilgiler', 'sosyal'), ('inkilap_tarihi', 'sosyal'),
  ('ingilizce', 'dil'), ('almanca', 'dil');

-- --- Kozmetikler -----------------------------------------------------------------------------
-- Yer tutucu tanimlar (gorsel yok). Gercek parayla satilmaz; yalniz seri kilometre tasi, rozet ya da
-- seviye ile acilir (`acilma_kosulu`: {"seri": n} | {"rozet": "kod"} | {"seviye": n}).

create table motivasyon.kozmetik_tanimlari (
  kod            text    primary key,
  slot           text    not null,
  ad             text    not null,
  nadirlik       text    not null,
  acilma_kosulu  jsonb   not null,
  aktif          boolean not null default true,
  constraint kozmetik_tanimlari_slot_chk check (slot in ('sapka', 'gozluk', 'aksesuar', 'arka_plan', 'cerceve')),
  constraint kozmetik_tanimlari_nadirlik_chk check (nadirlik in ('yaygin', 'nadir', 'efsanevi')),
  constraint kozmetik_tanimlari_acilma_kosulu_chk check (
    jsonb_typeof(acilma_kosulu) = 'object'
    and (acilma_kosulu - 'rozet' - 'seviye' - 'seri') = '{}'::jsonb
    and (acilma_kosulu ? 'rozet')::int + (acilma_kosulu ? 'seviye')::int + (acilma_kosulu ? 'seri')::int = 1)
);
insert into motivasyon.kozmetik_tanimlari (kod, slot, ad, nadirlik, acilma_kosulu) values
  ('sapka_kasket',     'sapka',     'Kasket',           'yaygin',   '{"seri": 3}'),
  ('gozluk_yuvarlak',  'gozluk',    'Yuvarlak Gözlük',  'yaygin',   '{"seri": 7}'),
  ('aksesuar_atki',    'aksesuar',  'Atkı',             'nadir',    '{"seri": 14}'),
  ('arka_plan_gece',   'arka_plan', 'Gece Gökyüzü',     'nadir',    '{"seri": 30}'),
  ('cerceve_gumus',    'cerceve',   'Gümüş Çerçeve',    'nadir',    '{"seri": 60}'),
  ('sapka_tac',        'sapka',     'Taç',              'efsanevi', '{"seri": 100}'),
  ('cerceve_altin',    'cerceve',   'Altın Çerçeve',    'efsanevi', '{"seri": 365}'),
  ('aksesuar_kitap',   'aksesuar',  'Kitap',            'yaygin',   '{"rozet": "odev_bronz"}'),
  ('gozluk_bilgin',    'gozluk',    'Bilgin Gözlüğü',   'nadir',    '{"rozet": "merak_soru_gumus"}'),
  ('arka_plan_yildiz', 'arka_plan', 'Yıldızlı Arka Plan', 'efsanevi', '{"rozet": "yildiz_bronz"}'),
  ('arka_plan_orman',  'arka_plan', 'Orman',            'yaygin',   '{"seviye": 5}'),
  ('sapka_mezuniyet',  'sapka',     'Mezuniyet Şapkası', 'nadir',   '{"seviye": 10}');

-- Uygulama rolu yapilandirmayi yalniz okur; degisiklik motivasyon_sistem ile (yapilandirma_gecmisi'ne yazilarak).
revoke insert, update, delete on
  motivasyon.xp_tavanlari, motivasyon.xp_kurallari, motivasyon.motivasyon_ayarlari,
  motivasyon.yapilandirma_gecmisi, motivasyon.seviyeler, motivasyon.rozet_tanimlari,
  motivasyon.karakter_turleri, motivasyon.karakter_asamalari, motivasyon.beceri_tanimlari,
  motivasyon.brans_beceri_eslemesi, motivasyon.kozmetik_tanimlari
  from motivasyon_app;
revoke delete on motivasyon.yapilandirma_gecmisi from motivasyon_sistem;
revoke update on motivasyon.yapilandirma_gecmisi from motivasyon_sistem;
