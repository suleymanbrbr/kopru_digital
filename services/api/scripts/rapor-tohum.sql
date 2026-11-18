-- Yonetici paneli olcum tohumu: 1.000 ogrenci, 50 grup, 30 ogretmen, 30 gunluk yoklama / odev / plan / soru /
-- geri bildirim verisi. Sahip/yonetici uyeligi KURUM'a onceden eklenmis olmalidir; bu betik yalniz personel ve
-- ogrenci uyeliklerini ekler (giris yapamayan kullanicilar). Su yer tutucu degistirilir:
--   {{KURUM_ID}}   hedef kurumun kimligi
-- Calistirma (superuser ya da api_sistem): `sed "s/{{KURUM_ID}}/<uuid>/g" scripts/rapor-tohum.sql | psql ...`.
-- Deterministik: rastgelelik `hashtext` tabanlidir; ayni kurum yapisi her seferinde ayni oranlari uretir.
-- Hedef oranlar (kurum geneli, yaklasik): devam %92, anladim %60, odev teslim %88, plan tamamlama %65.

begin;

-- Ogretmenler (30) ve ogrenciler (1000): giris yapamayan kullanicilar.
create temp table tohum_kisi (kullanici_id uuid, uyelik_id uuid, rol text, sira int) on commit drop;
insert into tohum_kisi
select gen_random_uuid(), gen_random_uuid(), 'ogretmen', i from generate_series(0, 29) i;
insert into tohum_kisi
select gen_random_uuid(), gen_random_uuid(), 'ogrenci', i from generate_series(0, 999) i;

insert into hesap.kullanicilar (id, telefon_e164, gorunen_ad)
select kullanici_id,
  '+90' || (case when rol = 'ogretmen' then '532' else '533' end) || lpad((sira + 1)::text, 7, '0'),
  case when rol = 'ogretmen' then 'Öğretmen ' || (sira + 1)::text else 'Öğrenci ' || (sira + 1)::text end
from tohum_kisi;
insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, gorunen_ad)
select uyelik_id, '{{KURUM_ID}}', kullanici_id, rol,
  case when rol = 'ogretmen' then 'Öğretmen ' || (sira + 1)::text else 'Öğrenci ' || (sira + 1)::text end
from tohum_kisi;

-- 50 grup; grup g -> ogretmen (g mod 30); ogrenci i -> grup (i mod 50) => grup basina 20 ogrenci.
create temp table tohum_grup (grup_id uuid, sira int, ogretmen_id uuid) on commit drop;
insert into tohum_grup
select gen_random_uuid(), g, (select uyelik_id from tohum_kisi where rol = 'ogretmen' and sira = g % 30)
from generate_series(0, 49) g;
insert into hesap.gruplar (id, kurum_id, tur, ad)
select grup_id, '{{KURUM_ID}}', 'grup', 'Grup ' || lpad((sira + 1)::text, 2, '0') from tohum_grup;
insert into hesap.atamalar (id, kurum_id, grup_id, ogretmen_id, brans_kodu, ana_ogretmen)
select gen_random_uuid(), '{{KURUM_ID}}', grup_id, ogretmen_id, 'matematik', true from tohum_grup;
insert into hesap.grup_uyeleri (id, kurum_id, grup_id, ogrenci_id, baslangic_tarihi)
select gen_random_uuid(), '{{KURUM_ID}}', g.grup_id, o.uyelik_id, current_date - 40
from tohum_kisi o join tohum_grup g on g.sira = o.sira % 50
where o.rol = 'ogrenci';

create temp table tohum_ogrenci (uyelik_id uuid, grup_id uuid, ogretmen_id uuid, sira int) on commit drop;
insert into tohum_ogrenci
select o.uyelik_id, g.grup_id, g.ogretmen_id, o.sira
from tohum_kisi o join tohum_grup g on g.sira = o.sira % 50 where o.rol = 'ogrenci';

-- Dersler: her grup 30 gunde 10 ders (3 gunde bir, grup sirasina gore kaydirilmis), 10:00 Europe/Istanbul.
create temp table tohum_ders (ders_id uuid, grup_id uuid, ogretmen_id uuid, gun date, bitis timestamptz)
  on commit drop;
insert into tohum_ders
select gen_random_uuid(), g.grup_id, g.ogretmen_id, current_date - (1 + (g.sira % 3) + 3 * k),
  (((current_date - (1 + (g.sira % 3) + 3 * k))::timestamp + interval '11 hours') at time zone 'Europe/Istanbul')
from tohum_grup g cross join generate_series(0, 9) k;
insert into ders.dersler
  (id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_at, bitis_at, ilk_baslangic_at, durum, cakisma_onayli)
select ders_id, '{{KURUM_ID}}', grup_id, ogretmen_id, 'matematik', bitis - interval '1 hour', bitis,
  bitis - interval '1 hour', 'tamamlandi', true
from tohum_ders;
insert into ders.ders_katilimcilari (id, kurum_id, ders_id, ogrenci_id)
select gen_random_uuid(), '{{KURUM_ID}}', d.ders_id, o.uyelik_id
from tohum_ders d join tohum_ogrenci o on o.grup_id = d.grup_id;

-- Yoklama: ~%85 geldi, %5 gec, %7 gelmedi, %3 izinli.
create temp table tohum_yoklama on commit drop as
select y.ders_id, y.ogrenci_id, y.ogretmen_id, y.bitis,
  case when h < 85 then 'geldi' when h < 90 then 'gec' when h < 97 then 'gelmedi' else 'izinli' end as durum
from (
  select d.ders_id, o.uyelik_id as ogrenci_id, d.ogretmen_id, d.bitis,
    abs(hashtext(d.ders_id::text || o.uyelik_id::text)) % 100 as h
  from tohum_ders d join tohum_ogrenci o on o.grup_id = d.grup_id
) y;
insert into ders.yoklamalar
  (id, kurum_id, ders_id, ogrenci_id, durum, gec_dakika, isaretleyen_id, isaretlenme_at)
select gen_random_uuid(), '{{KURUM_ID}}', ders_id, ogrenci_id, durum,
  case when durum = 'gec' then 10 end, ogretmen_id, bitis
from tohum_yoklama;

-- Ders sonu geri bildirimi: gelenlerin ~%70'i verir; %60 anladim, %28 kismen, %12 anlamadim.
insert into ders.geri_bildirimler (id, kurum_id, ders_id, ogrenci_id, deger, created_at)
select gen_random_uuid(), '{{KURUM_ID}}', ders_id, ogrenci_id,
  case when h2 < 60 then 'anladim' when h2 < 88 then 'kismen' else 'anlamadim' end, bitis + interval '10 minutes'
from (
  select y.*, abs(hashtext('gb' || y.ders_id::text || y.ogrenci_id::text)) % 100 as h2,
    abs(hashtext('v' || y.ders_id::text || y.ogrenci_id::text)) % 100 as v
  from tohum_yoklama y where y.durum in ('geldi', 'gec')
) x where v < 70;

-- Odevler: grup basina 6 (son teslimleri 30 gune yayilmis); her ogrenciye bir satir (6.000 satir).
create temp table tohum_odev (odev_id uuid, grup_id uuid, ogretmen_id uuid, son timestamptz, sira int)
  on commit drop;
insert into tohum_odev
select gen_random_uuid(), g.grup_id, g.ogretmen_id,
  (((current_date - (2 + 5 * k + (g.sira % 5)))::timestamp + interval '21 hours') at time zone 'Europe/Istanbul'),
  g.sira * 10 + k
from tohum_grup g cross join generate_series(0, 5) k;
insert into ogrenme.odevler
  (id, kurum_id, baslik, brans_kodu, hedef_turu, hedef_id, veren_id, son_teslim_at, durum, yayin_at,
   fan_out_durum, atanan_sayisi)
select odev_id, '{{KURUM_ID}}', 'Ödev ' || sira::text, 'matematik', 'grup', grup_id, ogretmen_id, son, 'yayinda',
  son - interval '3 days', 'tamamlandi', 20
from tohum_odev;
insert into ogrenme.ogrenci_odevleri
  (id, kurum_id, odev_id, ogrenci_id, durum, son_teslim_at, teslim_at, incelendi_at)
select gen_random_uuid(), '{{KURUM_ID}}', odev_id, ogrenci_id, durum, son,
  case when durum <> 'atandi' then son - interval '5 hours' end,
  case when durum = 'incelendi' then son + interval '2 hours' end
from (
  select od.odev_id, o.uyelik_id as ogrenci_id, od.son,
    case when h < 78 then 'teslim_edildi' when h < 88 then 'incelendi' else 'atandi' end as durum
  from tohum_odev od join tohum_ogrenci o on o.grup_id = od.grup_id,
    lateral (select abs(hashtext('od' || od.odev_id::text || o.uyelik_id::text)) % 100 as h) hh
) z;

-- Haftalik plan: her ogrenci icin son 5 haftanin (Pazartesi baslangicli) plani, haftada 5 gorev (Pzt-Cum).
create temp table tohum_plan (plan_id uuid, ogrenci_id uuid, hazirlayan_id uuid, hafta date) on commit drop;
insert into tohum_plan
select gen_random_uuid(), o.uyelik_id, o.ogretmen_id,
  (date_trunc('week', current_date)::date - 7 * w)
from tohum_ogrenci o cross join generate_series(0, 4) w;
insert into ogrenme.haftalik_planlar
  (id, kurum_id, ogrenci_id, hafta_baslangic, hazirlayan_id, durum, yayin_at)
select plan_id, '{{KURUM_ID}}', ogrenci_id, hafta, hazirlayan_id, 'yayinda', hafta::timestamptz - interval '1 day'
from tohum_plan;
insert into ogrenme.plan_gorevleri
  (id, kurum_id, plan_id, ogrenci_id, hafta_baslangic, gun, brans_kodu, hedef_turu, hedef_miktar, durum,
   tamamlandi_at, ekleyen_id)
select gen_random_uuid(), '{{KURUM_ID}}', plan_id, ogrenci_id, hafta, gun, 'matematik', 'soru', 20, durum,
  case when durum = 'tamam' then gun::timestamptz + interval '15 hours' end, hazirlayan_id
from (
  select p.*, (p.hafta + d) as gun,
    case when h < 65 then 'tamam' when h < 80 then 'kismen' when h < 90 then 'yapilmadi' else 'bekliyor' end as durum
  from tohum_plan p cross join generate_series(0, 4) d,
    lateral (select abs(hashtext('pl' || p.plan_id::text || d::text)) % 100 as h) hh
  where (p.hafta + d) <= current_date
) z;

-- Sorular: 3 / ogrenci (3.000); %85'i cevaplanmis (5 dk - 3 saat), kalan acik.
insert into ogrenme.sorular
  (id, kurum_id, created_at, ogrenci_id, brans_kodu, yonlendirme, durum, kota_donemi, son_hareket_at,
   ilk_cevap_at, ilk_cevaplayan_id)
select gen_random_uuid(), '{{KURUM_ID}}', olusma, ogrenci_id, 'matematik', 'yonetici',
  case when cevaplanan then 'cevaplandi' else 'acik' end, olusma::date, olusma,
  case when cevaplanan then olusma + make_interval(mins => 5 + (h % 175)) end,
  case when cevaplanan then ogretmen_id end
from (
  select o.uyelik_id as ogrenci_id, o.ogretmen_id,
    now() - make_interval(mins => abs(hashtext('s' || o.uyelik_id::text || k::text)) % (30 * 24 * 60)) as olusma,
    abs(hashtext('sh' || o.uyelik_id::text || k::text)) as h,
    (abs(hashtext('sc' || o.uyelik_id::text || k::text)) % 100) < 85 as cevaplanan
  from tohum_ogrenci o cross join generate_series(1, 3) k
) z;

commit;
analyze;
