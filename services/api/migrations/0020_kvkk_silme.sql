-- 0020_kvkk_silme: KVKK hesap silme talepleri (docs/schema/kvkk-silme.md).
-- Kullanici duzeyi (kurum_id yok): RLS politikasi `kullanici_kendi`; soguma sonu isi `api_sistem` (BYPASSRLS) ile calisir.

create table hesap.silme_talepleri (
  id                 uuid primary key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  surum              bigint      not null default 1,
  kullanici_id       uuid        not null,
  durum              text        not null default 'beklemede',
  talep_at           timestamptz not null default now(),
  planlanan_at       timestamptz not null,
  geri_alindi_at     timestamptz,
  tamamlandi_at      timestamptz,
  engel_nedeni       text,
  dogrulama_yontemi  text        not null,
  kaynak             text        not null,
  constraint silme_talepleri_kullanici_id_fk foreign key (kullanici_id) references hesap.kullanicilar (id),
  constraint silme_talepleri_durum_chk check (durum in ('beklemede', 'geri_alindi', 'tamamlandi', 'engellendi')),
  constraint silme_talepleri_yontem_chk check (dogrulama_yontemi in ('otp', 'parola')),
  constraint silme_talepleri_kaynak_chk check (kaynak in ('web', 'ios', 'android')),
  constraint silme_talepleri_planlanan_chk check (planlanan_at > talep_at)
);
-- Kullanici basina tek bekleyen talep.
create unique index silme_talepleri_kullanici_id_bekleyen_uniq
  on hesap.silme_talepleri (kullanici_id) where durum = 'beklemede';
create index silme_talepleri_planlanan_at_idx on hesap.silme_talepleri (planlanan_at) where durum = 'beklemede';
create trigger silme_talepleri_updated_at_trg before update on hesap.silme_talepleri
  for each row execute function ortak.updated_at_ayarla();
create trigger silme_talepleri_surum_trg before update on hesap.silme_talepleri
  for each row execute function ortak.surum_artir();
alter table hesap.silme_talepleri enable row level security;
alter table hesap.silme_talepleri force row level security;
create policy kullanici_kendi on hesap.silme_talepleri
  using (kullanici_id = ortak.aktif_kullanici())
  with check (kullanici_id = ortak.aktif_kullanici());
revoke delete on hesap.silme_talepleri from api_app, api_sistem;

-- Riza kayitlari yasal kanit olarak kalir (KVKK m.5/2-e); yalniz kisisel veri sayilan ip ve user_agent
-- anonimlestirmede NULL'lanabilir. Baska her degisiklik ve silme reddedilir.
create function hesap.rizalar_degismez() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.ip is null and new.user_agent is null
     and (new.id, new.kurum_id, new.created_at, new.created_by, new.kullanici_id, new.riza_metni_id,
          new.karar, new.veli_kullanici_id, new.kaynak, new.govde_sha256)
         is not distinct from
         (old.id, old.kurum_id, old.created_at, old.created_by, old.kullanici_id, old.riza_metni_id,
          old.karar, old.veli_kullanici_id, old.kaynak, old.govde_sha256) then
    return new;
  end if;
  raise exception 'defter_degistirilemez' using errcode = 'integrity_constraint_violation';
end $$;
drop trigger rizalar_degismez_trg on hesap.rizalar;
create trigger rizalar_degismez_trg before update or delete on hesap.rizalar
  for each row execute function hesap.rizalar_degismez();
grant update (ip, user_agent) on hesap.rizalar to api_sistem;
