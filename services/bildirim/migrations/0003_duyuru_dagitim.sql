-- Duyuru dagitimi (docs/schema/bildirim.md "Duyurular"): yayinda alici satirlari tek islemde yazilir;
-- buyuk hedeflerde alici kutusu bildirimleri worker'da partiler halinde uretilir. `dagitim_tamam_at` NULL ve
-- `durum = 'yayinda'` olan duyurular dagitim isinin kuyrugudur.
alter table bildirim.duyurular add column dagitim_tamam_at timestamptz;

create index duyurular_dagitim_bekleyen_idx on bildirim.duyurular (yayin_at)
  where durum = 'yayinda' and dagitim_tamam_at is null and silindi_at is null;
