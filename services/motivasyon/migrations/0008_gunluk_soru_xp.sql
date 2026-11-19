-- 0008_gunluk_soru_xp: gunluk soru takibi XP kurali (`ogrenme.gunluk_soru.kaydedildi.v1`).
-- Kayit basina sabit XP, kendi gunluk tavani; supheli orunti ayarlari. `xp_ozne_durumlari.miktar`: etkin
-- kaydin soru sayisi (supheli orunti penceresi toplami icin). Yeni tablo yok.

insert into motivasyon.xp_tavanlari (kod, gunluk_ust_sinir, aciklama) values
  ('gunluk_soru', 10, 'Gunluk soru kaydi (en cok bes kayit)');

insert into motivasyon.xp_kurallari
  (kod, olay_turu, kosul, xp, birim, olay_basi_ust_sinir, gec_carpani, tavan_grubu, genel_tavana_tabi) values
  ('gunluk_soru', 'ogrenme.gunluk_soru.kaydedildi', '{}', 2, null, null, 1.00, 'gunluk_soru', true);

alter table motivasyon.xp_ozne_durumlari add column miktar int not null default 0;
alter table motivasyon.xp_ozne_durumlari add constraint xp_ozne_durumlari_miktar_chk check (miktar >= 0);

insert into motivasyon.motivasyon_ayarlari (anahtar, deger, aciklama) values
  ('gunluk_soru.en_az_soru',           '5',   'Kayit XP almak icin en az soru sayisi (D+Y+B)'),
  ('supheli.gunluk_soru_pencere_sn',   '600', 'Supheli ornek: gunluk soru kayitlarinin toplandigi pencere (sn)'),
  ('supheli.gunluk_soru_esik',         '150', 'Pencerede toplam soru bu sayidan FAZLA ise yeni kayit XP almaz');

-- Surum 1 "ilk tohum degerleri"dir: yeni kural tohuma da eklenir (platform ayar GET'i gecerli degerlerle tohumun
-- ayni olmasini bekler; sonraki surumler `xp_kurallari`ndan tam kopya alir). Yalniz bu migration icin, defter
-- tetikleyicisi gecici olarak kapatilir; baska satira dokunulmaz.
alter table motivasyon.platform_ayar_surumleri disable trigger platform_ayar_surumleri_degismez_trg;
update motivasyon.platform_ayar_surumleri
   set degerler = jsonb_set(
         jsonb_set(degerler, '{kurallar,gunluk_soru}',
                   '{"xp": 2, "olay_basi_ust_sinir": null, "gec_carpani": 1, "aktif": true}'::jsonb),
         '{tavanlar,gunluk_soru}', '10'::jsonb)
 where surum = 1 and not (degerler->'kurallar' ? 'gunluk_soru');
alter table motivasyon.platform_ayar_surumleri enable trigger platform_ayar_surumleri_degismez_trg;
