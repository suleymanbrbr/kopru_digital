-- 0015_abonelik: plan katalogu, kurum abonelikleri, saglayici olaylari, odemeler, fatura bilgisi ve e-Arsiv
-- faturalari (docs/schema/api.md `abonelik`). Genislet-daralt: yeni sema ve tablolar; `hesap.modul_acik_mi`
-- plan hakkini da denetleyecek sekilde yeniden tanimlanir (yalniz fonksiyon govdesi degisir).
-- Semadan farklar docs/schema/api.md `abonelik` bolumunde gerekcelendirilmistir:
--   * abonelikler.kaynak CHECK'ine 'deneme' eklendi (kart istemeden 14 gunluk deneme, saglayicisi yok);
--   * abonelikler.bekleyen_plan_id / bekleyen_periyot (plan degisikligi istegi, donem sonunda uygulanir);
--   * abonelik_odemeleri.ters_cevrilen_id (semada metinde vardi, tabloda yoktu).

create schema if not exists abonelik;

grant usage on schema abonelik to api_app, api_sistem;
alter default privileges for role api_owner in schema abonelik
  grant select, insert, update, delete on tables to api_app, api_sistem;
alter default privileges for role api_owner in schema abonelik
  grant usage, select on sequences to api_app, api_sistem;

-- Tohum satirlari icin UUIDv7 (uygulama kimlikleri TS'te uuidv7 ile uretilir; bu yalniz migration icindir).
create function ortak.uuid_v7_uret() returns uuid language sql volatile as $$
  select encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid $$;

-- ---------------------------------------------------------------------------------------------
-- abonelik.planlar: herkese acik katalog (RLS yok). Uygulama rolu yalniz okur; yazma `_sistem`.
-- ---------------------------------------------------------------------------------------------
create table abonelik.planlar (
  id                   uuid primary key,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  kod                  text        not null,
  surum                int         not null default 1,
  ad                   text        not null,
  kurum_turu           text        not null,
  aylik_fiyat_kurus    bigint      not null,
  yillik_fiyat_kurus   bigint,
  kdv_orani            smallint    not null default 20,
  limitler             jsonb       not null,
  moduller             text[]      not null,
  magaza_urun_kodlari  jsonb,
  aktif                boolean     not null default true,
  constraint planlar_kod_surum_uniq unique (kod, surum),
  constraint planlar_kod_chk check (kod ~ '^[a-z][a-z0-9_]*$'),
  constraint planlar_kurum_turu_chk check (kurum_turu in ('bireysel', 'ekip', 'kurum')),
  constraint planlar_fiyat_chk check (aylik_fiyat_kurus >= 0 and (yillik_fiyat_kurus is null or yillik_fiyat_kurus >= 0)),
  constraint planlar_kdv_orani_chk check (kdv_orani between 0 and 100),
  constraint planlar_limitler_chk check (jsonb_typeof(limitler) = 'object')
);
create index planlar_kurum_turu_aktif_idx on abonelik.planlar (kurum_turu) where aktif;
create trigger planlar_updated_at_trg before update on abonelik.planlar
  for each row execute function ortak.updated_at_ayarla();
revoke insert, update, delete on abonelik.planlar from api_app;

-- PLAN KATALOGU TOHUMU: fiyatlar ve limitler YER TUTUCUDUR (proje sahibi onayi bekliyor). Sartnamedeki
-- Baslangic / Koc / Kurum paketleri; Baslangic 15 ogrenci ("16. ogrenci" ornegi). Gercek degerler karar
-- verilince YENI plan surumu (ayni kod, surum 2) olarak eklenir; eskisi aktif=false olur. Modul eslesmesi de
-- henuz kararlastirilmadi: tum planlar butun modulleri icerir (kullanici-gorunur davranis degismesin).
-- limitler: -1 = sinirsiz. Anahtarlar: max_ogrenci, max_ogretmen, max_sube, medya_kota_bayt, sms_aylik, soru_aylik_ogrenci.
insert into abonelik.planlar (id, kod, surum, ad, kurum_turu, aylik_fiyat_kurus, yillik_fiyat_kurus, limitler, moduller) values
  (ortak.uuid_v7_uret(), 'baslangic', 1, 'Başlangıç', 'bireysel', 29900, 299000,
   '{"max_ogrenci":15,"max_ogretmen":1,"max_sube":1,"medya_kota_bayt":5368709120,"sms_aylik":0,"soru_aylik_ogrenci":-1}',
   array['takvim','yoklama','geri_bildirim','kayitlar','finans','odev','haftalik_plan','deneme','soru_sor','oyunlastirma','duyuru']),
  (ortak.uuid_v7_uret(), 'koc', 1, 'Koç', 'bireysel', 69900, 699000,
   '{"max_ogrenci":60,"max_ogretmen":1,"max_sube":1,"medya_kota_bayt":21474836480,"sms_aylik":200,"soru_aylik_ogrenci":-1}',
   array['takvim','yoklama','geri_bildirim','kayitlar','finans','odev','haftalik_plan','deneme','soru_sor','oyunlastirma','duyuru']),
  (ortak.uuid_v7_uret(), 'ekip', 1, 'Ekip', 'ekip', 149900, 1499000,
   '{"max_ogrenci":150,"max_ogretmen":5,"max_sube":1,"medya_kota_bayt":53687091200,"sms_aylik":500,"soru_aylik_ogrenci":-1}',
   array['takvim','yoklama','geri_bildirim','kayitlar','finans','odev','haftalik_plan','deneme','soru_sor','oyunlastirma','duyuru']),
  (ortak.uuid_v7_uret(), 'kurum', 1, 'Kurum', 'kurum', 499900, 4999000,
   '{"max_ogrenci":500,"max_ogretmen":40,"max_sube":5,"medya_kota_bayt":214748364800,"sms_aylik":2000,"soru_aylik_ogrenci":-1}',
   array['takvim','yoklama','geri_bildirim','kayitlar','finans','odev','haftalik_plan','deneme','soru_sor','oyunlastirma','duyuru']);

-- ---------------------------------------------------------------------------------------------
-- abonelik.abonelikler (KS). Kurum kendi aboneligini okur; yazma `_sistem` ile (webhook, zamanlayici,
-- platform, kurum olusturma). Kurum basina en cok bir etkin abonelik.
-- ---------------------------------------------------------------------------------------------
create table abonelik.abonelikler (
  id                      uuid primary key,
  kurum_id                uuid        not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  surum                   bigint      not null default 1,
  plan_id                 uuid        not null,
  kaynak                  text        not null,
  durum                   text        not null,
  periyot                 text        not null default 'aylik',
  donem_baslangic_at      timestamptz not null,
  donem_bitis_at          timestamptz not null,
  deneme_bitis_at         timestamptz,
  ek_sure_bitis_at        timestamptz,
  otomatik_yenileme       boolean     not null default true,
  iptal_istendi_at        timestamptz,
  dis_abonelik_id         text,
  dis_musteri_id          text,
  fiyat_kurus             bigint      not null,
  kurumsal_sozlesme_no    text,
  bekleyen_plan_id        uuid,
  bekleyen_periyot        text,
  constraint abonelikler_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint abonelikler_plan_id_fk foreign key (plan_id) references abonelik.planlar (id),
  constraint abonelikler_bekleyen_plan_id_fk foreign key (bekleyen_plan_id) references abonelik.planlar (id),
  constraint abonelikler_kurum_id_id_uniq unique (kurum_id, id),
  constraint abonelikler_kaynak_chk check (kaynak in ('iyzico', 'apple', 'google', 'kurumsal', 'deneme')),
  constraint abonelikler_durum_chk check (durum in ('deneme', 'aktif', 'odeme_bekliyor', 'ek_sure', 'askida', 'iptal', 'sona_erdi')),
  constraint abonelikler_periyot_chk check (periyot in ('aylik', 'yillik')),
  constraint abonelikler_bekleyen_periyot_chk check (bekleyen_periyot is null or bekleyen_periyot in ('aylik', 'yillik')),
  constraint abonelikler_donem_chk check (donem_bitis_at > donem_baslangic_at),
  constraint abonelikler_ek_sure_chk check (durum <> 'ek_sure' or ek_sure_bitis_at is not null),
  constraint abonelikler_kurumsal_chk check (kaynak <> 'kurumsal' or kurumsal_sozlesme_no is not null),
  constraint abonelikler_deneme_chk check (durum <> 'deneme' or (kaynak = 'deneme' and deneme_bitis_at is not null)),
  constraint abonelikler_fiyat_chk check (fiyat_kurus >= 0)
);
-- Tek etkin abonelik: askida / iptal / sona_erdi etkin sayilmaz.
create unique index abonelikler_tek_etkin_uniq on abonelik.abonelikler (kurum_id)
  where durum in ('deneme', 'aktif', 'odeme_bekliyor', 'ek_sure');
create unique index abonelikler_kaynak_dis_abonelik_id_uniq on abonelik.abonelikler (kaynak, dis_abonelik_id)
  where dis_abonelik_id is not null;
create index abonelikler_kurum_id_durum_idx on abonelik.abonelikler (kurum_id, durum);
-- Zamanlayici tum kiracilarda tarar.
create index abonelikler_durum_donem_bitis_at_idx on abonelik.abonelikler (durum, donem_bitis_at);
create index abonelikler_ek_sure_idx on abonelik.abonelikler (durum, ek_sure_bitis_at) where durum = 'ek_sure';

-- Mevcut kurumlar: abonelik satiri yoksa 14 gunluk deneme (kurum turune gore varsayilan plan). Owner rolu
-- FORCE RLS altinda kurumlari goremez; okuma icin gecici olarak FORCE kapatilir ve geri acilir.
alter table hesap.kurumlar no force row level security;
insert into abonelik.abonelikler
  (id, kurum_id, plan_id, kaynak, durum, periyot, donem_baslangic_at, donem_bitis_at, deneme_bitis_at,
   otomatik_yenileme, fiyat_kurus)
select ortak.uuid_v7_uret(), k.id, p.id, 'deneme', 'deneme', 'aylik', now(), now() + interval '14 days',
       now() + interval '14 days', false, 0
from hesap.kurumlar k
join abonelik.planlar p
  on p.kod = case k.tur when 'bireysel' then 'baslangic' when 'ekip' then 'ekip' else 'kurum' end
 and p.surum = 1
where k.durum = 'aktif'
  and not exists (select 1 from abonelik.abonelikler a where a.kurum_id = k.id);
alter table hesap.kurumlar force row level security;

select ortak.kiraci_tablosu_koru('abonelik', 'abonelikler');
revoke insert, update, delete on abonelik.abonelikler from api_app;

-- ---------------------------------------------------------------------------------------------
-- abonelik.abonelik_olaylari: saglayicilardan gelen ham webhook'lar. Kurum bilinmeden alinir: RLS yok,
-- yalniz `_sistem` yazar/okur.
-- ---------------------------------------------------------------------------------------------
create table abonelik.abonelik_olaylari (
  id               uuid primary key,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  kurum_id         uuid,
  abonelik_id      uuid,
  kaynak           text        not null,
  dis_olay_id      text        not null,
  tur              text        not null,
  ham_govde        text        not null,
  basliklar        jsonb,
  imza_dogrulandi  boolean     not null,
  durum            text        not null default 'alindi',
  hata             text,
  deneme_sayisi    smallint    not null default 0,
  alindi_at        timestamptz not null default now(),
  islendi_at       timestamptz,
  constraint abonelik_olaylari_kaynak_chk check (kaynak in ('iyzico', 'apple', 'google')),
  constraint abonelik_olaylari_durum_chk check (durum in ('alindi', 'islendi', 'hata', 'yoksayildi')),
  constraint abonelik_olaylari_kaynak_dis_olay_id_uniq unique (kaynak, dis_olay_id),
  constraint abonelik_olaylari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint abonelik_olaylari_abonelik_id_fk foreign key (abonelik_id) references abonelik.abonelikler (id)
);
create index abonelik_olaylari_durum_alindi_at_idx on abonelik.abonelik_olaylari (durum, alindi_at)
  where durum in ('alindi', 'hata');
create index abonelik_olaylari_kurum_id_alindi_at_idx on abonelik.abonelik_olaylari (kurum_id, alindi_at desc);
create trigger abonelik_olaylari_updated_at_trg before update on abonelik.abonelik_olaylari
  for each row execute function ortak.updated_at_ayarla();
revoke all on abonelik.abonelik_olaylari from api_app;

-- ---------------------------------------------------------------------------------------------
-- abonelik.abonelik_odemeleri (K): yalniz ekleme (durum gecisi disinda). Kurum okur; yazma `_sistem`.
-- ---------------------------------------------------------------------------------------------
create table abonelik.abonelik_odemeleri (
  id                  uuid primary key,
  kurum_id            uuid        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  abonelik_id         uuid        not null,
  kaynak              text        not null,
  dis_islem_id        text        not null,
  olay_id             uuid,
  durum               text        not null,
  tutar_kurus         bigint      not null,
  kdv_kurus           bigint      not null,
  donem_baslangic_at  timestamptz not null,
  donem_bitis_at      timestamptz not null,
  odeme_at            timestamptz not null,
  hata_kodu           text,
  ters_cevrilen_id    uuid,
  constraint abonelik_odemeleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint abonelik_odemeleri_abonelik_id_fk foreign key (kurum_id, abonelik_id) references abonelik.abonelikler (kurum_id, id),
  constraint abonelik_odemeleri_olay_id_fk foreign key (olay_id) references abonelik.abonelik_olaylari (id),
  constraint abonelik_odemeleri_ters_cevrilen_id_fk foreign key (ters_cevrilen_id) references abonelik.abonelik_odemeleri (id),
  constraint abonelik_odemeleri_kurum_id_id_uniq unique (kurum_id, id),
  constraint abonelik_odemeleri_kaynak_dis_islem_id_durum_uniq unique (kaynak, dis_islem_id, durum),
  constraint abonelik_odemeleri_durum_chk check (durum in ('basarili', 'basarisiz', 'iade')),
  constraint abonelik_odemeleri_tutar_chk check (tutar_kurus >= 0 and kdv_kurus >= 0),
  constraint abonelik_odemeleri_donem_chk check (donem_bitis_at > donem_baslangic_at)
);
create index abonelik_odemeleri_kurum_id_abonelik_id_odeme_at_idx
  on abonelik.abonelik_odemeleri (kurum_id, abonelik_id, odeme_at desc);
select ortak.kiraci_tablosu_koru('abonelik', 'abonelik_odemeleri', false);
revoke insert, update, delete on abonelik.abonelik_odemeleri from api_app;

-- ---------------------------------------------------------------------------------------------
-- abonelik.kurum_fatura_bilgileri (KS): kurum basina tek satir; sahip okur ve yazar.
-- ---------------------------------------------------------------------------------------------
create table abonelik.kurum_fatura_bilgileri (
  id                    uuid primary key,
  kurum_id              uuid        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  surum                 bigint      not null default 1,
  unvan                 text        not null,
  vergi_no              text        not null,
  vergi_dairesi         text,
  adres                 jsonb       not null,
  eposta                text        not null,
  e_fatura_mukellefi    boolean     not null default false,
  constraint kurum_fatura_bilgileri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint kurum_fatura_bilgileri_kurum_id_uniq unique (kurum_id),
  constraint kurum_fatura_bilgileri_vergi_no_chk check (vergi_no ~ '^[0-9]{10,11}$'),
  constraint kurum_fatura_bilgileri_unvan_chk check (char_length(unvan) between 1 and 300),
  constraint kurum_fatura_bilgileri_eposta_chk check (char_length(eposta) between 3 and 320)
);
select ortak.kiraci_tablosu_koru('abonelik', 'kurum_fatura_bilgileri');

-- ---------------------------------------------------------------------------------------------
-- abonelik.faturalar (KS): e-Arsiv faturalari. Kurum okur; kesim `_sistem` ile (sonraki paket).
-- ---------------------------------------------------------------------------------------------
create table abonelik.faturalar (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  odeme_id         uuid        not null,
  tur              text        not null default 'e_arsiv',
  durum            text        not null default 'bekliyor',
  fatura_no        text,
  ettn             uuid,
  alici_unvan      text        not null,
  alici_vergi_no   text        not null,
  alici_adres      jsonb       not null,
  matrah_kurus     bigint      not null,
  kdv_kurus        bigint      not null,
  toplam_kurus     bigint      not null,
  kdv_orani        smallint    not null,
  entegrator       text,
  entegrator_ref   text,
  pdf_dosya_id     uuid,
  kesim_at         timestamptz,
  hata             text,
  deneme_sayisi    smallint    not null default 0,
  constraint faturalar_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint faturalar_odeme_id_fk foreign key (kurum_id, odeme_id) references abonelik.abonelik_odemeleri (kurum_id, id),
  constraint faturalar_odeme_id_tur_uniq unique (odeme_id, tur),
  constraint faturalar_tur_chk check (tur in ('e_arsiv', 'iade')),
  constraint faturalar_durum_chk check (durum in ('bekliyor', 'kesildi', 'hata', 'iptal')),
  constraint faturalar_toplam_chk check (toplam_kurus = matrah_kurus + kdv_kurus),
  constraint faturalar_kesildi_chk check (durum <> 'kesildi' or (fatura_no is not null and ettn is not null and kesim_at is not null))
);
create unique index faturalar_kurum_id_fatura_no_uniq on abonelik.faturalar (kurum_id, fatura_no)
  where fatura_no is not null;
create index faturalar_kurum_id_kesim_at_idx on abonelik.faturalar (kurum_id, kesim_at desc);
create index faturalar_durum_created_at_idx on abonelik.faturalar (durum, created_at)
  where durum in ('bekliyor', 'hata');
select ortak.kiraci_tablosu_koru('abonelik', 'faturalar');
revoke insert, update, delete on abonelik.faturalar from api_app;

-- ---------------------------------------------------------------------------------------------
-- Plan hakki (ADR 0004 "Modul acik/kapali onceligi" son madde): etkin deger
-- plan_hakki AND kurum_acik AND kademe_acik AND grup_acik. Plan hakki, kurumun gecerli planinin
-- `moduller` listesidir: etkin abonelik varsa o, yoksa en son (iptal edilmemis) abonelik. Abonelik hic yoksa
-- ya da iptal edilmisse ucretsiz katman: butun moduller hak sahibidir. Modul ayari satiri yoksa varsayilan
-- boylece plana baglidir; satir plan hakkini ASAMAZ (alt duzey ve ayar yalniz daraltir).
-- Kiraci baglami (RLS) icinde cagrilmalidir; baglam yoksa abonelik satiri gorunmez ve plan hakki serbesttir.
-- ---------------------------------------------------------------------------------------------
create or replace function hesap.modul_acik_mi(p_kurum uuid, p_modul text, p_kademe uuid default null, p_grup uuid default null)
  returns boolean language sql stable as $$
  with hedef as (
    select p_kurum as kurum_id,
           coalesce(p_kademe, (select g.kademe_id from hesap.gruplar g
                               where g.id = p_grup and g.kurum_id = p_kurum)) as kademe_id,
           p_grup as grup_id
  ),
  plan_hakki as (
    select coalesce(
      (select p_modul = any(p.moduller)
         from abonelik.abonelikler a
         join abonelik.planlar p on p.id = a.plan_id
        where a.kurum_id = p_kurum and a.durum <> 'iptal'
        order by (a.durum in ('deneme', 'aktif', 'odeme_bekliyor', 'ek_sure')) desc, a.created_at desc, a.id desc
        limit 1),
      true) as acik
  )
  select (select acik from plan_hakki) and coalesce(bool_and(coalesce(m.acik, true)), true)
  from hedef h
  cross join lateral (values ('kurum', h.kurum_id), ('kademe', h.kademe_id), ('grup', h.grup_id)) as d(kapsam, kid)
  left join hesap.modul_ayarlari m
    on m.kurum_id = p_kurum and m.modul_kodu = p_modul and m.kapsam = d.kapsam and m.kapsam_id = d.kid
  where d.kid is not null $$;
