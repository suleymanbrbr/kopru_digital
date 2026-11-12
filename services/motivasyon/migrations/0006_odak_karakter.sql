-- 0006_odak_karakter: odak oturumlarinda "dogrulanmamis sure" (geriye donuk baslangic) hile korumasi.
-- Istemcinin bildirdigi `baslangic_at` ile sunucunun oturumu ilk gordugu an (`sunucu_gordu_at`) arasindaki sure
-- dogrulanamaz; ogrenci basina gunluk bir paya kadar XP/aktiviteye sayilir (`odak.dogrulanmamis_gunluk_azami_dk`).
-- Sayilan/sayilmayan sure oturumda saklanir; gunluk kullanim `dogrulanmamis_gun` uzerinden toplanir.
alter table motivasyon.odak_oturumlari
  add column sunucu_gordu_at timestamptz not null default now(),
  add column dogrulanmamis_sayilan_sn int not null default 0,
  add column dogrulanmamis_sayilmayan_sn int not null default 0,
  add column dogrulanmamis_gun date,
  add constraint odak_oturumlari_dogrulanmamis_chk
    check (dogrulanmamis_sayilan_sn >= 0 and dogrulanmamis_sayilmayan_sn >= 0);
create index odak_oturumlari_ogrenci_id_dogrulanmamis_gun_idx
  on motivasyon.odak_oturumlari (ogrenci_id, dogrulanmamis_gun) where dogrulanmamis_gun is not null;

insert into motivasyon.motivasyon_ayarlari (anahtar, deger, aciklama) values
  ('odak.dogrulanmamis_gunluk_azami_dk', '30', 'Ogrenci basina gunde, geriye donuk bildirilen (dogrulanmamis) odak suresinden XP ve aktiviteye sayilacak en cok dakika');
