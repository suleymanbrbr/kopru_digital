-- Mufredat ORNEK tohumu: yalniz yapiyi gostermek icin kucuk bir ornek (gercek icerik sonradan girilecek).
-- Global satirlari RLS'i atlayan bir rol yazar (api_sistem ya da yerelde superuser); api_app ve api_owner yazamaz.
-- Idempotent: tekrar calistirilabilir. Kullanim:
--   psql "$API_DATABASE_SISTEM_URL" -f services/api/scripts/mufredat-tohum.sql
-- Not: kurum konulari bu dosyada degil; API'den (POST /konular) eklenir.

insert into ogrenme.mufredat_surumleri (id, katalog_kodu, surum_no, ad, aciklama, yayinlandi_at)
values ('019a0000-0000-7000-8000-000000000001', 'lgs', 1, '2026-2027 LGS (ornek)',
        'Yalniz yapiyi gostermek icin ornek icerik.', '2026-09-01T00:00:00Z')
on conflict (katalog_kodu, surum_no) do nothing;

-- Unite > konu > alt konu (matematik, 8. sinif).
insert into ogrenme.konular
  (id, katalog_kodu, brans_kodu, ust_id, seviye, ad, kazanim_kodu, sira, sinif_seviyesi, gecerli_surum_baslangic)
values
  ('019a0000-0000-7000-8000-000000000101', 'lgs', 'matematik', null,
   'unite', 'Üslü İfadeler', null, 10, 8, 1),
  ('019a0000-0000-7000-8000-000000000102', 'lgs', 'matematik', '019a0000-0000-7000-8000-000000000101',
   'konu', 'Tam sayıların negatif kuvvetleri', 'M.8.1.1.1', 11, 8, 1),
  ('019a0000-0000-7000-8000-000000000103', 'lgs', 'matematik', '019a0000-0000-7000-8000-000000000101',
   'konu', 'Bilimsel gösterim', 'M.8.1.1.2', 12, 8, 1),
  ('019a0000-0000-7000-8000-000000000104', 'lgs', 'matematik', '019a0000-0000-7000-8000-000000000103',
   'alt_konu', 'Çok büyük sayıların bilimsel gösterimi', null, 13, 8, 1),
  ('019a0000-0000-7000-8000-000000000105', 'lgs', 'matematik', null,
   'unite', 'Kareköklü İfadeler', null, 20, 8, 1)
on conflict (id) do nothing;
