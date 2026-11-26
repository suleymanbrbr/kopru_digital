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

-- Platform ayar defteri yalniz eklemelidir: yeni kural ve tavan, guncel tablolarin tam kopyasiyla YENI bir surum
-- satiri olarak yazilir (onceki surumlere dokunulmaz).
insert into motivasyon.platform_ayar_surumleri (id, surum, degerler, onceki_surum, degistiren_kullanici_id, neden)
select gen_random_uuid(), m.surum + 1,
       jsonb_build_object(
         'kurallar', (select jsonb_object_agg(kod, jsonb_build_object(
                        'xp', xp, 'olay_basi_ust_sinir', olay_basi_ust_sinir,
                        'gec_carpani', gec_carpani::float8, 'aktif', aktif))
                      from motivasyon.xp_kurallari),
         'tavanlar', (select jsonb_object_agg(kod, gunluk_ust_sinir) from motivasyon.xp_tavanlari)),
       m.surum, null, 'Göç 0008: günlük soru XP kuralı'
  from (select max(surum) as surum from motivasyon.platform_ayar_surumleri) m;
