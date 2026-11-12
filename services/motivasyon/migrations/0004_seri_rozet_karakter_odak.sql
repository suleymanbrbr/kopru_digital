-- 0004_seri_rozet_karakter_odak: seri, haftanin yildizlari, rozet, karakter, kozmetik ve odak
-- oturumlari tablolari (docs/schema/motivasyon.md). Bu migration yalniz TABLOLARI kurar; seri, odak,
-- karakter ve yildiz mantigi sonraki paketlerdedir (migration eklemeden calisabilmeleri icin sema tamdir).

-- --- Seri ------------------------------------------------------------------------------------
create table motivasyon.seriler (
  id                 uuid        primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  surum              bigint      not null default 1,
  ogrenci_id         uuid        not null,
  mevcut_seri        int         not null default 0,
  en_uzun_seri       int         not null default 0,
  son_aktif_gun      date,
  dondurma_stogu     smallint    not null default 0,
  dondurma_son_hafta date,
  onarim_hakki       smallint    not null default 1,
  onarim_son_ay      date,
  bozulan_seri       int,
  bozulan_gun        date,
  onarim_bitis_at    timestamptz,
  constraint seriler_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id),
  constraint seriler_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint seriler_seri_chk check (mevcut_seri >= 0 and en_uzun_seri >= mevcut_seri),
  constraint seriler_dondurma_stogu_chk check (dondurma_stogu between 0 and 2),
  constraint seriler_onarim_hakki_chk check (onarim_hakki between 0 and 1)
);
-- Gece isi taramasi (sistem rolu).
create index seriler_son_aktif_gun_idx on motivasyon.seriler (son_aktif_gun);
select ortak.kiraci_tablosu_koru('motivasyon', 'seriler');

-- Gun bazli seri kaydi. Yazim: `on conflict (ogrenci_id, gun) do update set durum = excluded.durum
-- where seri_gunleri.durum = 'kacirildi'` (yalniz kacirildi gun yukseltilebilir).
create table motivasyon.seri_gunleri (
  ogrenci_id      uuid        not null,
  gun             date        not null,
  kurum_id        uuid        not null,
  durum           text        not null,
  kaynak_olay_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (ogrenci_id, gun),
  constraint seri_gunleri_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint seri_gunleri_durum_chk check (durum in ('aktif', 'dondurma', 'duraklatma', 'onarim', 'kacirildi'))
);
create index seri_gunleri_kurum_id_ogrenci_id_gun_idx on motivasyon.seri_gunleri (kurum_id, ogrenci_id, gun desc);
select ortak.kiraci_tablosu_koru('motivasyon', 'seri_gunleri', false);

-- Ogretmen duraklatmalari (grup basina tarih araligi).
create table motivasyon.seri_duraklatmalari (
  id                 uuid        primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  surum              bigint      not null default 1,
  grup_id            uuid        not null,
  veren_ogretmen_id  uuid        not null,
  baslangic_gun      date        not null,
  bitis_gun          date        not null,
  neden              text,
  iptal_at           timestamptz,
  constraint seri_duraklatmalari_grup_id_fk foreign key (grup_id) references motivasyon.grup_kopyalari (grup_id),
  constraint seri_duraklatmalari_aralik_chk check (bitis_gun >= baslangic_gun and bitis_gun - baslangic_gun <= 30),
  constraint seri_duraklatmalari_neden_chk check (neden is null or char_length(neden) <= 200),
  constraint seri_duraklatmalari_cakisma_excl exclude using gist
    (grup_id with =, daterange(baslangic_gun, bitis_gun, '[]') with &&) where (iptal_at is null)
);
create index seri_duraklatmalari_kurum_id_grup_id_baslangic_gun_idx
  on motivasyon.seri_duraklatmalari (kurum_id, grup_id, baslangic_gun);
select ortak.kiraci_tablosu_koru('motivasyon', 'seri_duraklatmalari');

-- --- Haftanin yildizlari ---------------------------------------------------------------------
create table motivasyon.haftanin_yildizlari (
  id                 uuid        primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  ogrenci_id         uuid        not null,
  veren_ogretmen_id  uuid        not null,
  grup_id            uuid        not null,
  hafta_baslangic    date        not null,
  gerekce            text,
  constraint haftanin_yildizlari_ogrenci_id_hafta_baslangic_uniq unique (ogrenci_id, hafta_baslangic),
  constraint haftanin_yildizlari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint haftanin_yildizlari_hafta_chk check (extract(isodow from hafta_baslangic) = 1),
  constraint haftanin_yildizlari_gerekce_chk check (gerekce is null or char_length(gerekce) <= 200)
);
create index haftanin_yildizlari_kurum_id_veren_ogretmen_id_hafta_baslangic_idx
  on motivasyon.haftanin_yildizlari (kurum_id, veren_ogretmen_id, hafta_baslangic);
select ortak.kiraci_tablosu_koru('motivasyon', 'haftanin_yildizlari', false);

-- --- Rozet -----------------------------------------------------------------------------------
create table motivasyon.ogrenci_rozetleri (
  id              uuid        primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  ogrenci_id      uuid        not null,
  rozet_kodu      text        not null,
  kazanildi_at    timestamptz not null default now(),
  kaynak_olay_id  uuid        not null,
  constraint ogrenci_rozetleri_ogrenci_id_rozet_kodu_uniq unique (ogrenci_id, rozet_kodu),
  constraint ogrenci_rozetleri_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint ogrenci_rozetleri_rozet_kodu_fk foreign key (rozet_kodu) references motivasyon.rozet_tanimlari (kod)
);
create index ogrenci_rozetleri_kurum_id_ogrenci_id_kazanildi_at_idx
  on motivasyon.ogrenci_rozetleri (kurum_id, ogrenci_id, kazanildi_at desc);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_rozetleri', false);

-- --- Karakter --------------------------------------------------------------------------------
create table motivasyon.ogrenci_karakterleri (
  id                    uuid        primary key,
  kurum_id              uuid        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  surum                 bigint      not null default 1,
  ogrenci_id            uuid        not null,
  tur_kodu              text        not null,
  ad                    text        not null,
  asama                 smallint    not null default 1,
  secildi_at            timestamptz not null default now(),
  tur_degistirme_hakki  smallint    not null default 1,
  constraint ogrenci_karakterleri_kurum_id_ogrenci_id_uniq unique (kurum_id, ogrenci_id),
  constraint ogrenci_karakterleri_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint ogrenci_karakterleri_tur_kodu_fk foreign key (tur_kodu) references motivasyon.karakter_turleri (kod),
  constraint ogrenci_karakterleri_ad_chk check (char_length(ad) between 1 and 24),
  constraint ogrenci_karakterleri_asama_chk check (asama between 1 and 5),
  constraint ogrenci_karakterleri_tur_degistirme_hakki_chk check (tur_degistirme_hakki between 0 and 1)
);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_karakterleri');

create table motivasyon.ogrenci_kozmetikleri (
  id              uuid        primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  ogrenci_id      uuid        not null,
  kozmetik_kodu   text        not null,
  acildi_at       timestamptz not null default now(),
  kaynak_olay_id  uuid,
  constraint ogrenci_kozmetikleri_ogrenci_id_kozmetik_kodu_uniq unique (ogrenci_id, kozmetik_kodu),
  constraint ogrenci_kozmetikleri_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint ogrenci_kozmetikleri_kozmetik_kodu_fk foreign key (kozmetik_kodu) references motivasyon.kozmetik_tanimlari (kod)
);
create index ogrenci_kozmetikleri_kurum_id_ogrenci_id_idx on motivasyon.ogrenci_kozmetikleri (kurum_id, ogrenci_id);
select ortak.kiraci_tablosu_koru('motivasyon', 'ogrenci_kozmetikleri', false);

-- Slot basina giyilen kozmetik: sahip olunmayan kozmetik giyilemez (bilesik FK), slot eslesmesi tetikleyiciyle.
create table motivasyon.karakter_kusanimlari (
  ogrenci_id     uuid        not null,
  slot           text        not null,
  kurum_id       uuid        not null,
  kozmetik_kodu  text        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (ogrenci_id, slot),
  constraint karakter_kusanimlari_slot_chk check (slot in ('sapka', 'gozluk', 'aksesuar', 'arka_plan', 'cerceve')),
  constraint karakter_kusanimlari_sahiplik_fk foreign key (ogrenci_id, kozmetik_kodu)
    references motivasyon.ogrenci_kozmetikleri (ogrenci_id, kozmetik_kodu)
);
create index karakter_kusanimlari_kurum_id_ogrenci_id_idx on motivasyon.karakter_kusanimlari (kurum_id, ogrenci_id);

create function motivasyon.kusanim_slot_dogrula() returns trigger
  language plpgsql as $$
begin
  if (select slot from motivasyon.kozmetik_tanimlari where kod = new.kozmetik_kodu) is distinct from new.slot then
    raise exception 'kusanim_slot_uyusmuyor' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger karakter_kusanimlari_slot_trg
  before insert or update on motivasyon.karakter_kusanimlari
  for each row execute function motivasyon.kusanim_slot_dogrula();
select ortak.kiraci_tablosu_koru('motivasyon', 'karakter_kusanimlari', false);

-- --- Odak oturumlari -------------------------------------------------------------------------
-- Istemci dogrudan motivasyon'a yazar (JWT). XP: tamam (ya da yarida ve >= 60 sn) oturumdan
-- floor(gerceklesen_sn / 60) XP, `odak` gunluk tavani 120. Kaynak olay yerine oturum kimligi
-- (`odak:{id}` UUIDv5) `kaynak_olay_id` olur.
create table motivasyon.odak_oturumlari (
  id               uuid        primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  ogrenci_id       uuid        not null,
  istemci_id       uuid        not null,
  baslangic_at     timestamptz not null,
  bitis_at         timestamptz,
  planlanan_dk     smallint    not null,
  gerceklesen_sn   int         not null default 0,
  durum            text        not null default 'devam',
  brans_kodu       text,
  plan_gorev_id    uuid,
  cihaz            text,
  constraint odak_oturumlari_kurum_id_ogrenci_id_istemci_id_uniq unique (kurum_id, ogrenci_id, istemci_id),
  constraint odak_oturumlari_ogrenci_fk foreign key (kurum_id, ogrenci_id)
    references motivasyon.ogrenci_durumlari (kurum_id, ogrenci_id),
  constraint odak_oturumlari_planlanan_dk_chk check (planlanan_dk between 5 and 180),
  constraint odak_oturumlari_gerceklesen_sn_chk check (gerceklesen_sn >= 0),
  constraint odak_oturumlari_durum_chk check (durum in ('devam', 'tamam', 'yarida')),
  constraint odak_oturumlari_cihaz_chk check (cihaz is null or char_length(cihaz) <= 100)
);
-- Ayni anda tek `devam` oturumu.
create unique index odak_oturumlari_ogrenci_id_devam_uniq on motivasyon.odak_oturumlari (ogrenci_id)
  where durum = 'devam';
create index odak_oturumlari_kurum_id_ogrenci_id_baslangic_at_idx
  on motivasyon.odak_oturumlari (kurum_id, ogrenci_id, baslangic_at desc);
-- 6 saatten uzun devam eden oturumlari yarida yapan gece isi (sistem rolu).
create index odak_oturumlari_devam_baslangic_at_idx on motivasyon.odak_oturumlari (baslangic_at)
  where durum = 'devam';
select ortak.kiraci_tablosu_koru('motivasyon', 'odak_oturumlari');
