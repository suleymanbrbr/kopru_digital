-- Ders plan kopyasi (docs/schema/bildirim.md "ders_planlari"): ders olaylarindan beslenen kucuk yerel tablo.
-- Ogretmen sabah ozeti (gunun ders sayisi/ilk ders) ve ders sonu geri bildirimi (ders tamamlandi mi) icin gerekir.
-- Kisisel veri yok: yalniz kimlik, zaman ve durum. Siralama (son_olay_at, son_olay_id) ikilisiyledir (kopyalar gibi).
create table bildirim.ders_planlari (
  ders_id       uuid        primary key,
  kurum_id      uuid        not null,
  ogretmen_id   uuid        not null,
  baslangic_at  timestamptz not null,
  bitis_at      timestamptz not null,
  durum         text        not null,
  son_olay_at   timestamptz not null,
  son_olay_id   uuid        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ders_planlari_durum_chk check (durum in ('planli', 'tamamlandi', 'iptal')),
  constraint ders_planlari_zaman_chk check (bitis_at > baslangic_at)
);
create index ders_planlari_kurum_id_ogretmen_id_baslangic_at_idx
  on bildirim.ders_planlari (kurum_id, ogretmen_id, baslangic_at) where durum <> 'iptal';
select ortak.kiraci_tablosu_koru('bildirim', 'ders_planlari', false);

-- Zamanlanmis bildirimlerde iptal nedeni (sapma: docs/schema/bildirim.md). 'ayar' (hatirlatma kapatildi) ve
-- 'gecmis' (zamani gecti) nedenleri geri alinabilir (ayar degisince / erteleme ile); digerleri kalicidir.
alter table bildirim.zamanlanmis_bildirimler add column iptal_nedeni text;
