-- 0002_hesap_kimlik: kimlik tablolari (Better Auth eslemesi), riza (KVKK), rol/izin sozlugu.
-- Kiracisiz tablolar (RLS yok): kullanicilar, oturumlar, hesaplar, dogrulamalar, jwks, otp_istekleri,
-- riza_metinleri, roller, izinler, rol_izinleri. Erisim yalnizca ilgili repository uzerinden.

create table hesap.kullanicilar (
  id                      uuid primary key,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  surum                   bigint      not null default 1,
  ad                      text,
  soyad                   text,
  gorunen_ad              text,
  ad_arama                text,
  telefon_e164            text,
  telefon_dogrulandi_at   timestamptz,
  eposta                  citext,
  eposta_dogrulandi_at    timestamptz,
  avatar_dosya_id         uuid,
  dil                     text        not null default 'tr',
  saat_dilimi             text        not null default 'Europe/Istanbul',
  durum                   text        not null default 'aktif',
  platform_rolu           text        not null default 'yok',
  son_giris_at            timestamptz,
  anonimlestirildi_at     timestamptz,
  constraint kullanicilar_durum_chk check (durum in ('aktif', 'askida', 'silindi')),
  constraint kullanicilar_platform_rolu_chk check (platform_rolu in ('yok', 'destek', 'yonetici')),
  constraint kullanicilar_telefon_e164_uniq unique (telefon_e164),
  constraint kullanicilar_eposta_uniq unique (eposta),
  constraint kullanicilar_telefon_e164_chk check (telefon_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint kullanicilar_iletisim_chk
    check (telefon_e164 is not null or eposta is not null or durum = 'silindi')
);
create index kullanicilar_ad_arama_idx on hesap.kullanicilar using gin (ad_arama gin_trgm_ops);
create trigger kullanicilar_updated_at_trg before update on hesap.kullanicilar
  for each row execute function ortak.updated_at_ayarla();
create trigger kullanicilar_surum_trg before update on hesap.kullanicilar
  for each row execute function ortak.surum_artir();

-- Better Auth `session`. Not: belirtec duz saklanir; istemciye giden deger Better Auth sirriyla
-- imzalidir, bu yuzden veritabani sizintisi tek basina oturum acmaya yetmez (docs/schema/api.md).
create table hesap.oturumlar (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  kullanici_id      uuid        not null,
  belirtec          text        not null,
  etkin_kurum_id    uuid,
  etkin_uyelik_id   uuid,
  ip                inet,
  user_agent        text,
  cihaz_adi         text,
  expires_at        timestamptz not null,
  son_kullanim_at   timestamptz not null default now(),
  iptal_at          timestamptz,
  taklit_kayit_id   uuid,
  constraint oturumlar_kullanici_id_fk foreign key (kullanici_id)
    references hesap.kullanicilar (id) on delete cascade,
  constraint oturumlar_belirtec_uniq unique (belirtec)
);
create index oturumlar_kullanici_id_iptal_at_idx on hesap.oturumlar (kullanici_id, iptal_at);
create index oturumlar_expires_at_idx on hesap.oturumlar (expires_at);
create trigger oturumlar_updated_at_trg before update on hesap.oturumlar
  for each row execute function ortak.updated_at_ayarla();

-- Better Auth `account`. saglayici: apple, google, telefon; e-posta/parola icin Better Auth'in
-- sabit degeri `credential`.
create table hesap.hesaplar (
  id                          uuid primary key,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  kullanici_id                uuid        not null,
  saglayici                   text        not null,
  saglayici_hesap_id          text        not null,
  erisim_belirteci            text,
  yenileme_belirteci          text,
  kimlik_belirteci            text,
  erisim_belirteci_expires_at timestamptz,
  yenileme_belirteci_expires_at timestamptz,
  kapsam                      text,
  parola_hash                 text,
  constraint hesaplar_kullanici_id_fk foreign key (kullanici_id)
    references hesap.kullanicilar (id) on delete cascade,
  constraint hesaplar_saglayici_chk check (saglayici in ('apple', 'google', 'telefon', 'credential')),
  constraint hesaplar_saglayici_saglayici_hesap_id_uniq unique (saglayici, saglayici_hesap_id)
);
create index hesaplar_kullanici_id_idx on hesap.hesaplar (kullanici_id);
create trigger hesaplar_updated_at_trg before update on hesap.hesaplar
  for each row execute function ortak.updated_at_ayarla();

-- Better Auth `verification`: telefon OTP ve e-posta kodlari (kisa omurlu).
create table hesap.dogrulamalar (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  tanimlayici  text        not null,
  deger        text        not null,
  expires_at   timestamptz not null
);
create index dogrulamalar_tanimlayici_created_at_idx on hesap.dogrulamalar (tanimlayici, created_at desc);
create index dogrulamalar_expires_at_idx on hesap.dogrulamalar (expires_at);
create trigger dogrulamalar_updated_at_trg before update on hesap.dogrulamalar
  for each row execute function ortak.updated_at_ayarla();

-- JWT imza anahtarlari. Ozel anahtar AES-256-GCM ile sifreli (iv || etiket || sifreli metin).
create table hesap.jwks (
  id                    uuid primary key,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  acik_anahtar          text        not null,
  ozel_anahtar_sifreli  bytea       not null,
  algoritma             text        not null default 'EdDSA',
  expires_at            timestamptz
);
create trigger jwks_updated_at_trg before update on hesap.jwks
  for each row execute function ortak.updated_at_ayarla();

-- OTP istek sayaci: telefon basina saatte 5, IP basina saatte 20 (ADR 0004). Saatlik is temizler.
create table hesap.otp_istekleri (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  tanimlayici  text        not null,
  ip           inet
);
create index otp_istekleri_tanimlayici_created_at_idx on hesap.otp_istekleri (tanimlayici, created_at desc);
create index otp_istekleri_ip_created_at_idx on hesap.otp_istekleri (ip, created_at desc);

-- Rol ve izin sozlugu (global tohum). Icerik `@kopru/contracts` sabitinden senkronize edilir.
create table hesap.roller (
  id          uuid primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kod         text        not null unique,
  ad          text        not null,
  sistem      boolean     not null default true
);
create table hesap.izinler (
  id          uuid primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kod         text        not null unique,
  modul_kodu  text,
  aciklama    text        not null
);
create table hesap.rol_izinleri (
  id          uuid primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  rol_kodu    text        not null references hesap.roller (kod),
  izin_kodu   text        not null references hesap.izinler (kod),
  kapsam      text        not null,
  constraint rol_izinleri_kapsam_chk check (kapsam in ('kendi', 'grup', 'sube', 'kurum')),
  constraint rol_izinleri_rol_kodu_izin_kodu_uniq unique (rol_kodu, izin_kodu)
);
revoke insert, update, delete on hesap.roller, hesap.izinler, hesap.rol_izinleri from api_app;

-- KVKK metinleri: yayinlanmis surum degistirilemez.
create table hesap.riza_metinleri (
  id                    uuid primary key,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  tur                   text        not null,
  surum                 text        not null,
  dil                   text        not null default 'tr',
  baslik                text        not null,
  govde_markdown        text        not null,
  govde_sha256          bytea       not null,
  rol_kapsami           text[]      not null default '{ogrenci,ogretmen,yonetici,sahip,veli}',
  gecerli_baslangic_at  timestamptz not null,
  yayinlandi_at         timestamptz,
  constraint riza_metinleri_tur_chk
    check (tur in ('kvkk_aydinlatma', 'acik_riza', 'kullanim_kosullari', 'veli_onayi')),
  constraint riza_metinleri_tur_surum_dil_uniq unique (tur, surum, dil)
);
create index riza_metinleri_tur_dil_gecerli_baslangic_at_idx
  on hesap.riza_metinleri (tur, dil, gecerli_baslangic_at desc);
create trigger riza_metinleri_updated_at_trg before update on hesap.riza_metinleri
  for each row execute function ortak.updated_at_ayarla();

create function hesap.riza_metni_degismez() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.yayinlandi_at is not null then
      raise exception 'yayinlanmis_riza_metni_degistirilemez' using errcode = 'integrity_constraint_violation';
    end if;
    return old;
  end if;
  if old.yayinlandi_at is not null and (
       new.tur, new.surum, new.dil, new.baslik, new.govde_markdown, new.govde_sha256,
       new.rol_kapsami, new.gecerli_baslangic_at, new.yayinlandi_at
     ) is distinct from (
       old.tur, old.surum, old.dil, old.baslik, old.govde_markdown, old.govde_sha256,
       old.rol_kapsami, old.gecerli_baslangic_at, old.yayinlandi_at) then
    raise exception 'yayinlanmis_riza_metni_degistirilemez' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger riza_metinleri_degismez_trg before update or delete on hesap.riza_metinleri
  for each row execute function hesap.riza_metni_degismez();
revoke insert, update, delete on hesap.riza_metinleri from api_app;

-- Ilk (YER TUTUCU) KVKK aydinlatma metni. Hukuki inceleme beklemektedir; yayin oncesi
-- yeni surum eklenmelidir (yayinlanmis surum degistirilemez).
insert into hesap.riza_metinleri
  (id, tur, surum, dil, baslik, govde_markdown, govde_sha256, rol_kapsami, gecerli_baslangic_at, yayinlandi_at)
select
  '0190b2f0-0000-7000-8000-000000000001', 'kvkk_aydinlatma', '2026-11-07-taslak', 'tr',
  'KVKK Aydınlatma Metni (YER TUTUCU)', m.govde, digest(m.govde, 'sha256'),
  '{ogrenci,ogretmen,yonetici,sahip,veli}', '2026-11-07T00:00:00Z', '2026-11-07T00:00:00Z'
from (select
  E'> **YER TUTUCU METİN - HUKUKİ İNCELEME BEKLİYOR.** Bu metin yalnızca geliştirme ve test içindir; yayına çıkmadan önce hukuk danışmanı tarafından hazırlanan gerçek aydınlatma metniyle (yeni sürüm olarak) değiştirilmelidir.\n\n'
  E'## Kişisel Verilerin Korunması Aydınlatma Metni\n\n'
  E'Bu platform üzerinde ad, iletişim bilgileri, ders ve ödev kayıtları gibi kişisel verileriniz, eğitim hizmetinin yürütülmesi amacıyla 6698 sayılı KVKK kapsamında işlenir. '
  E'Veri sorumlusu, işleme amaçları, aktarım, saklama süreleri ve haklarınız bu metnin nihai sürümünde yer alacaktır.\n\n'
  E'Devam ederek bu yer tutucu metni okuduğunuzu ve kabul ettiğinizi onaylarsınız.' as govde) m;

-- Riza kararlari: yalnizca ekleme. kurum_id bos olabilir: hesap duzeyi riza (ilk giris, henuz kurum yok).
create table hesap.rizalar (
  id                uuid primary key,
  kurum_id          uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  kullanici_id      uuid        not null,
  riza_metni_id     uuid        not null,
  karar             text        not null,
  veli_kullanici_id uuid,
  kaynak            text        not null,
  ip                inet,
  user_agent        text,
  govde_sha256      bytea       not null,
  constraint rizalar_kullanici_id_fk foreign key (kullanici_id) references hesap.kullanicilar (id),
  constraint rizalar_riza_metni_id_fk foreign key (riza_metni_id) references hesap.riza_metinleri (id),
  constraint rizalar_karar_chk check (karar in ('kabul', 'ret', 'geri_cekildi')),
  constraint rizalar_kaynak_chk check (kaynak in ('web', 'ios', 'android'))
);
create index rizalar_kullanici_id_riza_metni_id_created_at_idx
  on hesap.rizalar (kullanici_id, riza_metni_id, created_at desc);
create index rizalar_kurum_id_idx on hesap.rizalar (kurum_id) where kurum_id is not null;
create trigger rizalar_degismez_trg before update or delete on hesap.rizalar
  for each row execute function ortak.defter_degistirilemez();
revoke update, delete on hesap.rizalar from api_app, api_sistem;
alter table hesap.rizalar enable row level security;
alter table hesap.rizalar force row level security;
-- Kendi riza kararlarini her baglamda gorur/ekler; kurum bagli kayitlari kurum baglaminda gorulur.
create policy kullanici_kendi on hesap.rizalar
  using (kullanici_id = ortak.aktif_kullanici())
  with check (kullanici_id = ortak.aktif_kullanici()
              and (kurum_id is null or kurum_id = ortak.aktif_kurum()));
create policy kurum_okuma on hesap.rizalar for select
  using (kurum_id = ortak.aktif_kurum());
