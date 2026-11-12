-- 0014_ogrenme_soru: "soru sor" (soru masasi, ayarlar, ogretmen durumu, soru ileti dizisi, ekler, kota sayaclari,
-- uygunsuz icerik bildirimi). Genislet-daralt: yalniz yeni tablolar. `ortak.medya_dosya_kopyalari` 0001'de
-- vardir; bu migration ona dokunmaz (tuketici `api.medya` onu doldurur).
-- Siema ile farklar docs/schema/api.md "Soru sor" bolumunde gerekcelendirilmistir.

-- Branş soru masasi (KS). Branş basina tek ARSIVLENMEMIS masa.
create table ogrenme.soru_masalari (
  id             uuid primary key,
  kurum_id       uuid        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  surum          bigint      not null default 1,
  brans_kodu     text        not null,
  ad             text        not null,
  aktif          boolean     not null default true,
  arsivlendi_at  timestamptz,
  constraint soru_masalari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_masalari_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint soru_masalari_kurum_id_id_uniq unique (kurum_id, id),
  constraint soru_masalari_ad_chk check (char_length(ad) between 1 and 100)
);
create unique index soru_masalari_kurum_id_brans_kodu_uniq
  on ogrenme.soru_masalari (kurum_id, brans_kodu) where arsivlendi_at is null;
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_masalari');

-- Masada cevap veren ogretmenler (K).
create table ogrenme.soru_masasi_uyeleri (
  id          uuid primary key,
  kurum_id    uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  masa_id     uuid        not null,
  ogretmen_id uuid        not null,
  constraint soru_masasi_uyeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_masasi_uyeleri_masa_id_fk foreign key (kurum_id, masa_id) references ogrenme.soru_masalari (kurum_id, id),
  constraint soru_masasi_uyeleri_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_masasi_uyeleri_masa_id_ogretmen_id_uniq unique (masa_id, ogretmen_id)
);
create index soru_masasi_uyeleri_kurum_id_ogretmen_id_idx on ogrenme.soru_masasi_uyeleri (kurum_id, ogretmen_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_masasi_uyeleri', false);

-- Kurum basina kota ve sinirlar (KS, tek satir). Satir yoksa asagidaki varsayilanlar uygulanir.
-- Proje sahibi karari: gunde 3 soru; haftalik/aylik varsayilan sinir yok (aylik NULL).
create table ogrenme.soru_ayarlari (
  id                        uuid primary key,
  kurum_id                  uuid        not null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid,
  surum                     bigint      not null default 1,
  aylik_soru_limiti         int,
  gunluk_soru_limiti        int         default 3,
  soru_basina_takip_limiti  smallint    not null default 3,
  ses_azami_sn              smallint    not null default 180,
  foto_saklama_gun          smallint    not null default 30,
  constraint soru_ayarlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_ayarlari_kurum_id_uniq unique (kurum_id),
  constraint soru_ayarlari_aylik_chk check (aylik_soru_limiti is null or aylik_soru_limiti between 1 and 10000),
  constraint soru_ayarlari_gunluk_chk check (gunluk_soru_limiti is null or gunluk_soru_limiti between 1 and 1000),
  constraint soru_ayarlari_takip_chk check (soru_basina_takip_limiti between 0 and 20),
  constraint soru_ayarlari_ses_chk check (ses_azami_sn between 10 and 180),
  constraint soru_ayarlari_saklama_chk check (foto_saklama_gun between 1 and 365)
);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_ayarlari');

-- EK (semada yok): ogretmenin "bugun cevap veremiyorum" durumu. `musait_degil_tarihi` kurum yerel gunudur;
-- gun gecince kendiliginden gecersiz olur (temizleme isi gerekmez). NULL = musait.
create table ogrenme.soru_ogretmen_durumlari (
  id                   uuid primary key,
  kurum_id             uuid        not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  ogretmen_id          uuid        not null,
  musait_degil_tarihi  date,
  constraint soru_ogretmen_durumlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_ogretmen_durumlari_ogretmen_id_fk foreign key (kurum_id, ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_ogretmen_durumlari_kurum_id_ogretmen_id_uniq unique (kurum_id, ogretmen_id)
);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_ogretmen_durumlari', false);

-- Soru ileti dizisinin koku (KS).
-- Semaya ekler: istek_id (istemci yeniden denemesi), ilk_cevap_at / ilk_cevaplayan_id (cevap suresi olcumu ve
-- tahmini sure), cozuldu_kaynagi (ogrenci "anladim" mi, otomatik mi: olcum "anladim orani" icin).
create table ogrenme.sorular (
  id                     uuid primary key,
  kurum_id               uuid        not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  surum                  bigint      not null default 1,
  ogrenci_id             uuid        not null,
  brans_kodu             text        not null,
  konu_id                uuid,
  baslik                 text,
  yonlendirme            text        not null,
  atanan_ogretmen_id     uuid,
  masa_id                uuid,
  ustlenen_id            uuid,
  durum                  text        not null default 'acik',
  kota_donemi            date        not null,
  son_hareket_at         timestamptz not null default now(),
  cozuldu_at             timestamptz,
  cozuldu_kaynagi        text,
  foto_silinme_at        timestamptz,
  yeniden_acilma_sayisi  smallint    not null default 0,
  ilk_cevap_at           timestamptz,
  ilk_cevaplayan_id      uuid,
  istek_id               uuid,
  constraint sorular_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint sorular_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint sorular_atanan_ogretmen_id_fk foreign key (kurum_id, atanan_ogretmen_id) references hesap.uyelikler (kurum_id, id),
  constraint sorular_ustlenen_id_fk foreign key (kurum_id, ustlenen_id) references hesap.uyelikler (kurum_id, id),
  constraint sorular_ilk_cevaplayan_id_fk foreign key (kurum_id, ilk_cevaplayan_id) references hesap.uyelikler (kurum_id, id),
  constraint sorular_masa_id_fk foreign key (kurum_id, masa_id) references ogrenme.soru_masalari (kurum_id, id),
  constraint sorular_brans_kodu_fk foreign key (brans_kodu) references ortak.bransler (kod),
  constraint sorular_konu_id_fk foreign key (konu_id) references ogrenme.konular (id),
  constraint sorular_kurum_id_id_uniq unique (kurum_id, id),
  constraint sorular_kurum_id_istek_id_uniq unique (kurum_id, istek_id),
  constraint sorular_baslik_chk check (baslik is null or char_length(baslik) between 1 and 200),
  constraint sorular_yonlendirme_chk check (yonlendirme in ('atanan_ogretmen', 'masa', 'yonetici')),
  constraint sorular_durum_chk check (durum in ('acik', 'cevaplandi', 'takip_bekliyor', 'cozuldu', 'kapandi')),
  constraint sorular_cozuldu_chk check ((durum = 'cozuldu') = (cozuldu_at is not null) or durum = 'kapandi'),
  constraint sorular_cozuldu_kaynagi_chk check (cozuldu_kaynagi is null or cozuldu_kaynagi in ('ogrenci', 'otomatik')),
  constraint sorular_atanan_chk check (yonlendirme <> 'atanan_ogretmen' or atanan_ogretmen_id is not null),
  constraint sorular_masa_chk check (yonlendirme <> 'masa' or masa_id is not null)
);
create index sorular_kurum_id_ogrenci_id_son_hareket_at_idx on ogrenme.sorular (kurum_id, ogrenci_id, son_hareket_at desc);
create index sorular_kurum_id_atanan_ogretmen_id_durum_idx on ogrenme.sorular (kurum_id, atanan_ogretmen_id, durum);
create index sorular_kurum_id_masa_id_durum_idx on ogrenme.sorular (kurum_id, masa_id, durum);
create index sorular_kurum_id_durum_son_hareket_at_idx on ogrenme.sorular (kurum_id, durum, son_hareket_at);
-- Saatlik otomatik cozme isi tum kiracilarda tarar.
create index sorular_otomatik_cozme_idx on ogrenme.sorular (son_hareket_at) where durum = 'cevaplandi';
create index sorular_baslik_trgm_idx on ogrenme.sorular using gin (translate(baslik, 'İIı', 'iii') gin_trgm_ops);
select ortak.kiraci_tablosu_koru('ogrenme', 'sorular');

-- Sorunun fotograflari (K). Soru basina en cok 3 (sira 0..2). Bir medya dosyasi tek kayda baglanir.
-- Semadaki "en cok 4" proje sahibi karariyla 3'e indi (sartname).
create table ogrenme.soru_dosyalari (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  soru_id         uuid        not null,
  medya_dosya_id  uuid        not null,
  sira            smallint    not null default 0,
  constraint soru_dosyalari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_dosyalari_soru_id_fk foreign key (kurum_id, soru_id) references ogrenme.sorular (kurum_id, id),
  constraint soru_dosyalari_soru_id_medya_dosya_id_uniq unique (soru_id, medya_dosya_id),
  constraint soru_dosyalari_soru_id_sira_uniq unique (soru_id, sira),
  constraint soru_dosyalari_medya_dosya_id_uniq unique (medya_dosya_id),
  constraint soru_dosyalari_sira_chk check (sira between 0 and 2)
);
create index soru_dosyalari_kurum_id_soru_id_idx on ogrenme.soru_dosyalari (kurum_id, soru_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_dosyalari', false);

-- Soru ileti dizisi: ilk soru, cevaplar, takip sorulari (K).
-- Semadan farklar: istek_id; derste_konusalim ("derste konusalim" cevabi); CHECK gevsetildi: ilk soru metinsiz
-- olabilir (en az 1 fotograf uygulamada zorunlu), takip metin ister.
create table ogrenme.soru_mesajlari (
  id                 uuid primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  soru_id            uuid        not null,
  yazar_id           uuid        not null,
  yazar_rolu         text        not null,
  tur                text        not null,
  metin              text,
  sira               int         not null,
  derste_konusalim   boolean     not null default false,
  istek_id           uuid,
  constraint soru_mesajlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_mesajlari_soru_id_fk foreign key (kurum_id, soru_id) references ogrenme.sorular (kurum_id, id),
  constraint soru_mesajlari_yazar_id_fk foreign key (kurum_id, yazar_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_mesajlari_kurum_id_id_uniq unique (kurum_id, id),
  constraint soru_mesajlari_soru_id_sira_uniq unique (soru_id, sira),
  constraint soru_mesajlari_kurum_id_istek_id_uniq unique (kurum_id, istek_id),
  constraint soru_mesajlari_yazar_rolu_chk check (yazar_rolu in ('ogrenci', 'ogretmen', 'yonetici')),
  constraint soru_mesajlari_tur_chk check (tur in ('soru', 'cevap', 'takip')),
  constraint soru_mesajlari_metin_chk check (metin is null or char_length(metin) between 1 and 4000),
  constraint soru_mesajlari_metin_zorunlu_chk check (metin is not null or tur in ('soru', 'cevap')),
  constraint soru_mesajlari_derste_chk check (not derste_konusalim or tur = 'cevap')
);
create index soru_mesajlari_kurum_id_soru_id_sira_idx on ogrenme.soru_mesajlari (kurum_id, soru_id, sira);
create index soru_mesajlari_metin_trgm_idx on ogrenme.soru_mesajlari using gin (translate(metin, 'İIı', 'iii') gin_trgm_ops);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_mesajlari', false);

-- Mesaj ekleri (K): fotograf, fotograf uzerine cizim, ses. Mesaj basina en cok 4 (sira 0..3).
-- Semadan fark: sure_sn <= 180 (120 degil, sartname 3 dk); cizim_verisi <= 256 KB CHECK ile de zorlanir.
create table ogrenme.soru_mesaj_ekleri (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  mesaj_id         uuid        not null,
  tur              text        not null,
  medya_dosya_id   uuid        not null,
  kaynak_dosya_id  uuid,
  cizim_verisi     jsonb,
  sure_sn          smallint,
  sira             smallint    not null default 0,
  constraint soru_mesaj_ekleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_mesaj_ekleri_mesaj_id_fk foreign key (kurum_id, mesaj_id) references ogrenme.soru_mesajlari (kurum_id, id),
  constraint soru_mesaj_ekleri_mesaj_id_medya_dosya_id_uniq unique (mesaj_id, medya_dosya_id),
  constraint soru_mesaj_ekleri_mesaj_id_sira_uniq unique (mesaj_id, sira),
  constraint soru_mesaj_ekleri_medya_dosya_id_uniq unique (medya_dosya_id),
  constraint soru_mesaj_ekleri_tur_chk check (tur in ('fotograf', 'cizimli_fotograf', 'ses')),
  constraint soru_mesaj_ekleri_kaynak_chk check (tur <> 'cizimli_fotograf' or kaynak_dosya_id is not null),
  constraint soru_mesaj_ekleri_ses_chk check (tur <> 'ses' or sure_sn is not null),
  constraint soru_mesaj_ekleri_sure_chk check (sure_sn is null or sure_sn between 1 and 180),
  constraint soru_mesaj_ekleri_sira_chk check (sira between 0 and 3),
  constraint soru_mesaj_ekleri_cizim_boyut_chk check (cizim_verisi is null or octet_length(cizim_verisi::text) <= 262144)
);
create index soru_mesaj_ekleri_kurum_id_mesaj_id_idx on ogrenme.soru_mesaj_ekleri (kurum_id, mesaj_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_mesaj_ekleri', false);

-- Kota sayaclari (K, UUID `id` yok). Atomik artirim: INSERT .. ON CONFLICT DO UPDATE .. WHERE kullanilan < limit.
create table ogrenme.soru_kota_sayaclari (
  kurum_id     uuid        not null,
  ogrenci_id   uuid        not null,
  donem_turu   text        not null,
  donem        date        not null,
  kullanilan   int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (ogrenci_id, donem_turu, donem),
  constraint soru_kota_sayaclari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_kota_sayaclari_ogrenci_id_fk foreign key (kurum_id, ogrenci_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_kota_sayaclari_donem_turu_chk check (donem_turu in ('gun', 'ay')),
  constraint soru_kota_sayaclari_kullanilan_chk check (kullanilan >= 0)
);
-- 400 gunden eski sayaclari silen is tum kiracilarda tarar.
create index soru_kota_sayaclari_donem_idx on ogrenme.soru_kota_sayaclari (donem);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_kota_sayaclari', false);

-- EK (semada yok): uygunsuz icerik bildirimi (KS). Herkes (ogrenci, ogretmen) bildirebilir; yonetici kapatir.
-- Ayni kisi ayni soru icin tek ACIK bildirim acabilir. `aciklama` serbest metindir: olaya girmez.
create table ogrenme.soru_bildirimleri (
  id            uuid primary key,
  kurum_id      uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  surum         bigint      not null default 1,
  soru_id       uuid        not null,
  mesaj_id      uuid,
  bildiren_id   uuid        not null,
  neden         text        not null,
  aciklama      text,
  durum         text        not null default 'acik',
  kapatan_id    uuid,
  kapandi_at    timestamptz,
  kapatma_notu  text,
  constraint soru_bildirimleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint soru_bildirimleri_soru_id_fk foreign key (kurum_id, soru_id) references ogrenme.sorular (kurum_id, id),
  constraint soru_bildirimleri_mesaj_id_fk foreign key (kurum_id, mesaj_id) references ogrenme.soru_mesajlari (kurum_id, id),
  constraint soru_bildirimleri_bildiren_id_fk foreign key (kurum_id, bildiren_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_bildirimleri_kapatan_id_fk foreign key (kurum_id, kapatan_id) references hesap.uyelikler (kurum_id, id),
  constraint soru_bildirimleri_neden_chk check (neden in ('uygunsuz', 'kisisel_bilgi', 'diger')),
  constraint soru_bildirimleri_aciklama_chk check (aciklama is null or char_length(aciklama) <= 500),
  constraint soru_bildirimleri_durum_chk check (durum in ('acik', 'kapandi')),
  constraint soru_bildirimleri_kapandi_chk check ((durum = 'kapandi') = (kapandi_at is not null)),
  constraint soru_bildirimleri_kapatma_notu_chk check (kapatma_notu is null or char_length(kapatma_notu) <= 500)
);
create unique index soru_bildirimleri_acik_uniq on ogrenme.soru_bildirimleri (soru_id, bildiren_id) where durum = 'acik';
create index soru_bildirimleri_kurum_id_durum_created_at_idx on ogrenme.soru_bildirimleri (kurum_id, durum, created_at desc);
select ortak.kiraci_tablosu_koru('ogrenme', 'soru_bildirimleri');
