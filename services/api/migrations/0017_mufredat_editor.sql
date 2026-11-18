-- 0017_mufredat_editor: platform mufredat editoru (taslak surum, degisiklik gunlugu).
-- Genislet-daralt: yalniz yeni tablo/indeks; konular kisiti gevsetilir (bitis >= baslangic).

-- Bir katalogda ayni anda en cok bir taslak (yayinlanmamis) surum.
create unique index mufredat_surumleri_tek_taslak_idx
  on ogrenme.mufredat_surumleri (katalog_kodu) where yayinlandi_at is null;

-- Taslakta eklenip ayni taslakta kaldirilan konu "hic var olmadi": bitis = baslangic (bos aralik).
-- Gecerlilik sorgusu (baslangic <= v AND bitis > v) bu satiri hicbir surumde dondurmez.
alter table ogrenme.konular drop constraint konular_surum_araligi_chk;
alter table ogrenme.konular add constraint konular_surum_araligi_chk
  check (gecerli_surum_bitis is null or gecerli_surum_bitis >= gecerli_surum_baslangic);

-- Degisiklik gunlugu (G): taslakta yapilan her islem ve notu. Yayinlanmis surumun gunlugu degismez.
create table ogrenme.mufredat_degisiklikleri (
  id             uuid primary key,
  created_at     timestamptz not null default now(),
  katalog_kodu   text        not null,
  surum_no       int         not null,
  tur            text        not null,
  konu_id        uuid        not null,
  hedef_konu_id  uuid,
  ad_once        text,
  ad_sonra       text,
  ayrinti        jsonb       not null default '{}'::jsonb,
  not_metni      text        not null,
  olusturan_id   uuid,
  constraint mufredat_degisiklikleri_surum_fk foreign key (katalog_kodu, surum_no)
    references ogrenme.mufredat_surumleri (katalog_kodu, surum_no),
  constraint mufredat_degisiklikleri_konu_fk foreign key (konu_id) references ogrenme.konular (id),
  constraint mufredat_degisiklikleri_hedef_fk foreign key (hedef_konu_id) references ogrenme.konular (id),
  constraint mufredat_degisiklikleri_tur_chk
    check (tur in ('ekle', 'adlandir', 'tasi', 'birlestir', 'kaldir')),
  constraint mufredat_degisiklikleri_not_chk check (char_length(not_metni) between 1 and 1000)
);
create index mufredat_degisiklikleri_surum_idx
  on ogrenme.mufredat_degisiklikleri (katalog_kodu, surum_no, created_at, id);
create index mufredat_degisiklikleri_konu_idx on ogrenme.mufredat_degisiklikleri (konu_id);
-- Kiraci verisi degil: herkes okur (api_app select), yazma yalniz api_sistem (platform editoru).
revoke insert, update, delete on ogrenme.mufredat_degisiklikleri from api_app;
revoke update, delete on ogrenme.mufredat_degisiklikleri from api_sistem;

create function ogrenme.yayinli_surum_gunlugu_degismez() returns trigger
  language plpgsql as $$
begin
  if exists (
    select 1 from ogrenme.mufredat_surumleri s
    where s.katalog_kodu = new.katalog_kodu and s.surum_no = new.surum_no and s.yayinlandi_at is not null
  ) then
    raise exception 'yayinli_surum_degismez' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger mufredat_degisiklikleri_yayinli_trg before insert on ogrenme.mufredat_degisiklikleri
  for each row execute function ogrenme.yayinli_surum_gunlugu_degismez();
