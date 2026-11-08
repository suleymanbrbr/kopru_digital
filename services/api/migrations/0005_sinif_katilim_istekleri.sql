-- 0005_sinif_katilim_istekleri: sinif katilim kodu ile ogretmen onayli katilim.
-- Genislet-daralt: yeni tablo; kod cozme fonksiyonu yalniz kod_id kolonu ekleyerek yeniden tanimlanir
-- (fonksiyonu cagiran tek kod bu surumle birlikte gelir).

-- Isteklerin koda bilesik FK ile baglanabilmesi icin (kurum_id, id) tekilligi.
alter table hesap.sinif_katilim_kodlari
  add constraint sinif_katilim_kodlari_kurum_id_id_uniq unique (kurum_id, id);

create table hesap.sinif_katilim_istekleri (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  surum           bigint      not null default 1,
  grup_id         uuid        not null,
  kod_id          uuid        not null,
  kullanici_id    uuid        not null,
  durum           text        not null default 'bekliyor',
  karar_veren_id  uuid,
  karar_at        timestamptz,
  constraint sinif_katilim_istekleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint sinif_katilim_istekleri_grup_id_fk foreign key (kurum_id, grup_id) references hesap.gruplar (kurum_id, id),
  constraint sinif_katilim_istekleri_kod_id_fk foreign key (kurum_id, kod_id) references hesap.sinif_katilim_kodlari (kurum_id, id),
  constraint sinif_katilim_istekleri_kullanici_id_fk foreign key (kullanici_id) references hesap.kullanicilar (id),
  constraint sinif_katilim_istekleri_karar_veren_id_fk foreign key (kurum_id, karar_veren_id) references hesap.uyelikler (kurum_id, id),
  constraint sinif_katilim_istekleri_durum_chk check (durum in ('bekliyor', 'onaylandi', 'reddedildi', 'iptal')),
  -- Karar alanlari yalniz onay/ret ile dolar.
  constraint sinif_katilim_istekleri_karar_chk check (
    (durum in ('onaylandi', 'reddedildi') and karar_veren_id is not null and karar_at is not null)
    or (durum in ('bekliyor', 'iptal') and karar_veren_id is null and karar_at is null)
  )
);
-- Ayni kullanici icin grup basina tek bekleyen istek.
create unique index sinif_katilim_istekleri_grup_id_kullanici_id_bekleyen_uniq
  on hesap.sinif_katilim_istekleri (grup_id, kullanici_id) where durum = 'bekliyor';
create index sinif_katilim_istekleri_kurum_id_grup_id_durum_idx
  on hesap.sinif_katilim_istekleri (kurum_id, grup_id, durum, id);
create index sinif_katilim_istekleri_kullanici_id_idx
  on hesap.sinif_katilim_istekleri (kullanici_id, durum);
select ortak.kiraci_tablosu_koru('hesap', 'sinif_katilim_istekleri');

-- Kullanici henuz hicbir kurumun uyesi degilken kendi isteklerini kurum secmeden gorur ve iptal eder.
create policy kendi_istekleri_okuma on hesap.sinif_katilim_istekleri for select
  using (kullanici_id = ortak.aktif_kullanici());
create policy kendi_istekleri_iptal on hesap.sinif_katilim_istekleri for update
  using (kullanici_id = ortak.aktif_kullanici() and durum = 'bekliyor')
  with check (kullanici_id = ortak.aktif_kullanici() and durum = 'iptal');

-- Kod cozme artik kod_id de doner (istek koda baglanir). Gecersiz/pasif/dolu/bulunamayan kod ayni sekilde bos doner.
drop function hesap.katilim_kodu_coz(text);
create function hesap.katilim_kodu_coz(p_kod text)
  returns table (kurum_id uuid, grup_id uuid, kod_id uuid)
  language sql stable security definer set search_path = hesap, pg_temp
  as $$ select k.kurum_id, k.grup_id, k.id from hesap.sinif_katilim_kodlari k
        where k.kod = p_kod and k.aktif and k.iptal_at is null
          and (k.expires_at is null or k.expires_at > now())
          and (k.max_kullanim is null or k.kullanim_sayisi < k.max_kullanim) $$;
revoke all on function hesap.katilim_kodu_coz(text) from public;
grant execute on function hesap.katilim_kodu_coz(text) to api_app, api_sistem;
