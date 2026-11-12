-- 0003_ogrenci_xp: yerel okuma kopyalari, ogrenci durumu, XP defteri, gunluk toplamlar, aktivite,
-- sayaclar, beceri puanlari, ozne durumlari ve deneme gecmisi (docs/schema/motivasyon.md).
-- Kiraci tablolarinin hepsinde kurum_id + RLS (ortak.kiraci_tablosu_koru).

-- --- Yerel okuma kopyalari -------------------------------------------------------------------
-- Yalniz olay tuketicisi (`motivasyon.kopya`) yazar. Olay zarfinda ozne surumu olmadigindan eski olay,
-- (`son_olay_at`, `son_olay_id`) ikilisi (olayin `occurredAt` ve UUIDv7 kimligi; esitlikte buyuk kimlik
-- kazanir) karsilastirilarak yok sayilir. Ayni durumun yeniden yayimi upsert olarak etkisizdir.

create table motivasyon.kurum_kopyalari (
  kurum_id     uuid        primary key,
  tur          text        not null,
  durum        text        not null,
  saat_dilimi  text        not null,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint kurum_kopyalari_durum_chk check (durum in ('aktif', 'askida', 'kapali'))
);
select ortak.kiraci_tablosu_koru('motivasyon', 'kurum_kopyalari', false);

create table motivasyon.uyelik_kopyalari (
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
create index uyelik_kopyalari_kurum_id_kullanici_id_idx on motivasyon.uyelik_kopyalari (kurum_id, kullanici_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'uyelik_kopyalari', false);

create table motivasyon.grup_kopyalari (
  grup_id      uuid        primary key,
  kurum_id     uuid        not null,
  kademe_id    uuid,
  tur          text        not null,
  durum        text        not null,
  son_olay_at  timestamptz not null,
  son_olay_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint grup_kopyalari_tur_chk check (tur in ('birebir', 'grup', 'sinif', 'etut')),
  constraint grup_kopyalari_durum_chk check (durum in ('aktif', 'arsiv'))
);
create index grup_kopyalari_kurum_id_kademe_id_idx on motivasyon.grup_kopyalari (kurum_id, kademe_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'grup_kopyalari', false);

create table motivasyon.grup_uyesi_kopyalari (
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
create index grup_uyesi_kopyalari_kurum_id_ogrenci_id_idx on motivasyon.grup_uyesi_kopyalari (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'grup_uyesi_kopyalari', false);

create table motivasyon.atama_kopyalari (
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
create index atama_kopyalari_kurum_id_ogretmen_id_idx on motivasyon.atama_kopyalari (kurum_id, ogretmen_id);
create index atama_kopyalari_kurum_id_grup_id_idx on motivasyon.atama_kopyalari (kurum_id, grup_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'atama_kopyalari', false);

-- `acik: null` (mirasa donus) olayi satiri SILER; bu yuzden `acik` bos olamaz.
create table motivasyon.modul_ayari_kopyalari (
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
select ortak.kiraci_tablosu_koru('motivasyon', 'modul_ayari_kopyalari', false);

-- --- Ogrenci durumu --------------------------------------------------------------------------
-- Ogrenci (= hesap.uyelikler.id, kurum basina) ozeti; defterden yeniden kurulabilir. `hafta_baslangic`,
-- `bu_hafta_xp`'in ait oldugu haftadir (Pazartesi, kurum saat dilimi, 04:00 kurali): hafta degisince hem
-- XP yazimi hem haftalik is `bu_hafta_xp`'i sifirlar (idempotent).

create table motivasyon.ogrenci_durumlari (
  id                 uuid        primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  surum              bigint      not null default 1,
  ogrenci_id         uuid        not null,
  toplam_xp          bigint      not null default 0,
  seviye             int         not null default 1,
  bu_hafta_xp        int         not null default 0,
  hafta_baslangic    date,
  son_aktivite_gun   date,
  pasif_olay_sayisi  int         not null default 0,
  constraint ogrenci_durumlari_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id),
  constraint ogrenci_durumlari_toplam_xp_chk check (toplam_xp >= 0),
  constraint ogrenci_durumlari_seviye_chk check (seviye >= 1),
  constraint ogrenci_durumlari_bu_hafta_xp_chk check (bu_hafta_xp >= 0),
  constraint ogrenci_durumlari_pasif_olay_sayisi_chk check (pasif_olay_sayisi >= 0)
);
create index ogrenci_durumlari_kurum_id_bu_hafta_xp_idx on motivasyon.ogrenci_durumlari (kurum_id, bu_hafta_xp desc);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_durumlari');

-- --- XP defteri (yalnizca ekleme) ------------------------------------------------------------
-- Duzeltme = ters kayit (negatif xp, ters_cevrilen_id). `olusma_at` tetikleyen olayin zamanidir
-- (`created_at` isleme zamani); `gun` olusma_at'ten kurum saat dilimi + 04:00 kuraliyla hesaplanir.

create table motivasyon.xp_hareketleri (
  id                  uuid        primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  ogrenci_id          uuid        not null,
  kural_kodu          text        not null,
  kaynak_olay_id      uuid        not null,
  kaynak_ozne_id      uuid,
  kaynak_ozne_surumu  bigint      not null default 0,
  brans_kodu          text,
  xp                  int         not null,
  gun                 date        not null,
  olusma_at           timestamptz not null,
  kismi               boolean     not null default false,
  ters_cevrilen_id    uuid,
  neden               text,
  constraint xp_hareketleri_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint xp_hareketleri_kural_kodu_fk foreign key (kural_kodu) references motivasyon.xp_kurallari (kod),
  constraint xp_hareketleri_ters_cevrilen_id_fk foreign key (ters_cevrilen_id) references motivasyon.xp_hareketleri (id),
  constraint xp_hareketleri_xp_chk check (xp <> 0),
  constraint xp_hareketleri_ters_chk check ((xp < 0) = (ters_cevrilen_id is not null)),
  constraint xp_hareketleri_neden_chk check ((xp > 0 or neden is not null) and (neden is null or char_length(neden) <= 200)),
  constraint xp_hareketleri_kaynak_olay_id_kural_kodu_uniq unique (kaynak_olay_id, kural_kodu)
);
-- Bir kazanim bir kez ters cevrilir.
create unique index xp_hareketleri_ters_cevrilen_id_uniq on motivasyon.xp_hareketleri (ters_cevrilen_id)
  where ters_cevrilen_id is not null;
-- Ayni ozneden tekrar XP engeli (ayni odevi yeniden teslim ederek XP kazanilamaz). Yoklamada her
-- `yoklama_surumu` ayri ozne surumudur: geldi -> izinli -> geldi sirasinda yeniden kazanim mumkundur.
create unique index xp_hareketleri_ozne_tekrar_uniq
  on motivasyon.xp_hareketleri (ogrenci_id, kural_kodu, kaynak_ozne_id, kaynak_ozne_surumu)
  where xp > 0 and kaynak_ozne_id is not null;
create index xp_hareketleri_kurum_id_ogrenci_id_created_at_idx on motivasyon.xp_hareketleri (kurum_id, ogrenci_id, created_at desc);
create index xp_hareketleri_kurum_id_ogrenci_id_gun_idx on motivasyon.xp_hareketleri (kurum_id, ogrenci_id, gun);
create index xp_hareketleri_kurum_id_ogrenci_id_kural_kodu_kaynak_ozne_id_idx
  on motivasyon.xp_hareketleri (kurum_id, ogrenci_id, kural_kodu, kaynak_ozne_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'xp_hareketleri', false, false);
create trigger xp_hareketleri_degismez_trg
  before update or delete on motivasyon.xp_hareketleri
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on motivasyon.xp_hareketleri from motivasyon_app, motivasyon_sistem;

-- --- Gunluk tavan sayaclari ------------------------------------------------------------------
create table motivasyon.xp_gunluk_toplamlari (
  ogrenci_id   uuid        not null,
  gun          date        not null,
  tavan_grubu  text        not null,
  kurum_id     uuid        not null,
  toplam       int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (ogrenci_id, gun, tavan_grubu),
  constraint xp_gunluk_toplamlari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint xp_gunluk_toplamlari_tavan_grubu_fk foreign key (tavan_grubu) references motivasyon.xp_tavanlari (kod),
  constraint xp_gunluk_toplamlari_toplam_chk check (toplam >= 0)
);
create index xp_gunluk_toplamlari_kurum_id_ogrenci_id_gun_idx on motivasyon.xp_gunluk_toplamlari (kurum_id, ogrenci_id, gun);
select ortak.kiraci_tablosu_koru('motivasyon', 'xp_gunluk_toplamlari', false);

-- --- Aktivite sayaclari (seri icin) ----------------------------------------------------------
create table motivasyon.ogrenci_gunluk_aktivite (
  ogrenci_id            uuid        not null,
  gun                   date        not null,
  kurum_id              uuid        not null,
  plan_gorevi_sayisi    int         not null default 0,
  odak_sn               int         not null default 0,
  odev_teslim_sayisi    int         not null default 0,
  soru_anladim_sayisi   int         not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (ogrenci_id, gun),
  constraint ogrenci_gunluk_aktivite_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint ogrenci_gunluk_aktivite_sayilar_chk check
    (plan_gorevi_sayisi >= 0 and odak_sn >= 0 and odev_teslim_sayisi >= 0 and soru_anladim_sayisi >= 0)
);
create index ogrenci_gunluk_aktivite_kurum_id_gun_idx on motivasyon.ogrenci_gunluk_aktivite (kurum_id, gun);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_gunluk_aktivite', false);

-- --- Rozet sayaclari -------------------------------------------------------------------------
create table motivasyon.ogrenci_sayaclari (
  ogrenci_id  uuid        not null,
  sayac_kodu  text        not null,
  kurum_id    uuid        not null,
  deger       bigint      not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (ogrenci_id, sayac_kodu),
  constraint ogrenci_sayaclari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint ogrenci_sayaclari_deger_chk check (deger >= 0)
);
create index ogrenci_sayaclari_kurum_id_ogrenci_id_idx on motivasyon.ogrenci_sayaclari (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_sayaclari', false);

-- --- Beceri puanlari -------------------------------------------------------------------------
create table motivasyon.beceri_puanlari (
  ogrenci_id   uuid        not null,
  beceri_kodu  text        not null,
  kurum_id     uuid        not null,
  puan         int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (ogrenci_id, beceri_kodu),
  constraint beceri_puanlari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint beceri_puanlari_beceri_kodu_fk foreign key (beceri_kodu) references motivasyon.beceri_tanimlari (kod),
  constraint beceri_puanlari_puan_chk check (puan >= 0)
);
create index beceri_puanlari_kurum_id_ogrenci_id_idx on motivasyon.beceri_puanlari (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'beceri_puanlari', false);

-- --- Ozne durumlari (sira bagimsizligi ve sayaclarin dogrulugu) -------------------------------
-- Olay zarfinda ozne surumu olmadigindan, "durumu degisebilen" ozneler (yoklama: geldi/gec mi; plan
-- gorevi: tamam mi) icin son islenen surum/zaman ve guncel "etkin" durum burada tutulur. Eski olay
-- (surum ya da zaman olarak geride) yok sayilir; sayaclar (toplam_yoklama, plan_gorevi_sayisi) XP
-- tavanindan bagimsiz, etkin durumun gecislerine gore guncellenir.
create table motivasyon.xp_ozne_durumlari (
  ogrenci_id   uuid        not null,
  kural_kodu   text        not null,
  ozne_id      uuid        not null,
  kurum_id     uuid        not null,
  surum        bigint      not null default 0,
  etkin        boolean     not null,
  gun          date,
  etkin_at     timestamptz,
  son_olay_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (ogrenci_id, kural_kodu, ozne_id),
  constraint xp_ozne_durumlari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint xp_ozne_durumlari_kural_kodu_fk foreign key (kural_kodu) references motivasyon.xp_kurallari (kod)
);
create index xp_ozne_durumlari_etkin_at_idx on motivasyon.xp_ozne_durumlari (ogrenci_id, kural_kodu, etkin_at)
  where etkin;
select ortak.kiraci_tablosu_koru('motivasyon', 'xp_ozne_durumlari', false);

-- --- Deneme gecmisi --------------------------------------------------------------------------
-- Net artisi: max(0, toplam_net - ortalama(ayni kural_kodu'ndaki onceki en son 3 deneme)); onceki yoksa 0.
create table motivasyon.deneme_gecmisi (
  id            uuid          primary key,
  kurum_id      uuid          not null,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  created_by    uuid,
  ogrenci_id    uuid          not null,
  deneme_id     uuid          not null,
  kural_kodu    text          not null,
  sinav_tarihi  date          not null,
  toplam_net    numeric(6,2)  not null,
  constraint deneme_gecmisi_deneme_id_uniq unique (deneme_id),
  constraint deneme_gecmisi_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id)
);
create index deneme_gecmisi_kurum_id_ogrenci_id_kural_kodu_sinav_tarihi_idx
  on motivasyon.deneme_gecmisi (kurum_id, ogrenci_id, kural_kodu, sinav_tarihi desc);
select ortak.kiraci_tablosu_koru('motivasyon', 'deneme_gecmisi', false);
