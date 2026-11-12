-- 0002_medya: saklama politikalari (tohum), dosyalar, kucuk resimler, kurum kotalari, kurum kopyalari.
-- Sema ve kurallar: docs/schema/medya.md. Kiraci tablolari `ortak.kiraci_tablosu_koru` ile korunur.

-- --- saklama_politikalari (global referans, RLS yok) ------------------------------------------------
create table medya.saklama_politikalari (
  tur                     text primary key,
  izinli_mime             text[]      not null,
  azami_boyut_bayt        bigint      not null,
  azami_sure_sn           int,
  varsayilan_saklama_gun  int,
  yetim_saat              int         not null default 48,
  kucuk_resim             boolean     not null default true,
  ek_islem                text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint saklama_politikalari_tur_chk check (tur in (
    'soru_fotografi', 'soru_cevap_fotografi', 'soru_cizim', 'soru_ses', 'odev_eki',
    'odev_teslim_fotografi', 'kurum_logosu', 'avatar', 'fatura_pdf')),
  constraint saklama_politikalari_ek_islem_chk
    check (ek_islem is null or ek_islem in ('gorsel_yeniden_kodla', 'ses_sure_cikar', 'yok')),
  constraint saklama_politikalari_boyut_chk check (azami_boyut_bayt > 0),
  constraint saklama_politikalari_yetim_chk check (yetim_saat > 0)
);
create trigger saklama_politikalari_updated_at_trg before update on medya.saklama_politikalari
  for each row execute function ortak.updated_at_ayarla();
revoke insert, update, delete on medya.saklama_politikalari from medya_app;

-- HEIC/HEIF ve SVG kabul edilmez. Boyutlar: foto 10 MB (logo/avatar 5 MB), ses 5 MB (en fazla 180 sn), PDF 20 MB.
-- Bu degerler `@kopru/contracts` MEDYA_TUR_KURALLARI ile birebir ayni olmalidir (test dogrular).
insert into medya.saklama_politikalari
  (tur, izinli_mime, azami_boyut_bayt, azami_sure_sn, varsayilan_saklama_gun, yetim_saat, kucuk_resim, ek_islem)
values
  ('soru_fotografi', '{image/jpeg,image/png,image/webp}', 10485760, null, null, 48, true, 'gorsel_yeniden_kodla'),
  ('soru_cevap_fotografi', '{image/jpeg,image/png,image/webp}', 10485760, null, null, 48, true, 'gorsel_yeniden_kodla'),
  ('soru_cizim', '{image/jpeg,image/png,image/webp}', 10485760, null, null, 48, true, 'gorsel_yeniden_kodla'),
  ('soru_ses', '{audio/mp4,audio/aac,audio/mpeg,audio/webm,audio/ogg}', 5242880, 180, null, 48, false, 'ses_sure_cikar'),
  ('odev_eki', '{image/jpeg,image/png,image/webp,application/pdf}', 20971520, null, 365, 48, true, 'gorsel_yeniden_kodla'),
  ('odev_teslim_fotografi', '{image/jpeg,image/png,image/webp}', 10485760, null, 365, 48, true, 'gorsel_yeniden_kodla'),
  ('kurum_logosu', '{image/jpeg,image/png,image/webp}', 5242880, null, null, 48, true, 'gorsel_yeniden_kodla'),
  ('avatar', '{image/jpeg,image/png,image/webp}', 5242880, null, null, 48, true, 'gorsel_yeniden_kodla'),
  ('fatura_pdf', '{application/pdf}', 20971520, null, 3650, 48, false, 'yok');

-- --- kurum_kopyalari (hesap.kurum.degisti.v1 yerel okuma kopyasi) -----------------------------------
-- `surum` / `abonelik_surumu` ileride abonelik olayinin `ozne_surumu` degeri icin ayrilmistir; mevcut
-- zarfta surum olmadigindan siralama `son_olay_at` (olay occurredAt) ile yapilir.
create table medya.kurum_kopyalari (
  kurum_id          uuid primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  durum             text        not null default 'aktif',
  plan_kodu         text,
  abonelik_durumu   text,
  medya_kota_bayt   bigint,
  surum             bigint      not null default 0,
  abonelik_surumu   bigint      not null default 0,
  son_olay_at       timestamptz,
  constraint kurum_kopyalari_durum_chk check (durum in ('aktif', 'askida', 'kapali')),
  constraint kurum_kopyalari_kota_chk check (medya_kota_bayt is null or medya_kota_bayt >= 0)
);
select ortak.kiraci_tablosu_koru('medya', 'kurum_kopyalari', false);

-- --- kurum_kotalari ---------------------------------------------------------------------------------
create table medya.kurum_kotalari (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  surum            bigint      not null default 1,
  kullanilan_bayt  bigint      not null default 0,
  dosya_sayisi     int         not null default 0,
  constraint kurum_kotalari_kurum_id_uniq unique (kurum_id),
  constraint kurum_kotalari_kullanilan_chk check (kullanilan_bayt >= 0),
  constraint kurum_kotalari_dosya_sayisi_chk check (dosya_sayisi >= 0)
);
select ortak.kiraci_tablosu_koru('medya', 'kurum_kotalari');

-- --- dosyalar ---------------------------------------------------------------------------------------
create table medya.dosyalar (
  id                      uuid primary key,
  kurum_id                uuid        not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  surum                   bigint      not null default 1,
  sahip_kullanici_id      uuid        not null,
  sahip_uyelik_id         uuid        not null,
  tur                     text        not null,
  -- Yukleme aninda bildirilen; isleme sonrasi saklanan (yeniden kodlanmis) icerigin gercek turu.
  mime_tipi               text        not null,
  bildirilen_boyut_bayt   bigint      not null,
  -- HEAD ile dogrulanan boyut; isleme sonrasi saklanan (yeniden kodlanmis) nesnenin boyutu.
  boyut_bayt              bigint,
  -- Istemcinin bildirdigi ozet; `sha256` yuklenen ozgun baytlarin dogrulanan ozeti.
  bildirilen_sha256       bytea       not null,
  sha256                  bytea,
  depolama_anahtari       text,
  kova                    text        not null default 'medya-ozel',
  durum                   text        not null default 'yukleme_bekliyor',
  hata_kodu               text,
  genislik                int,
  yukseklik               int,
  sure_sn                 int,
  istemci_anahtari        uuid        not null,
  yukleme_son_at          timestamptz not null,
  tamamlandi_at           timestamptz,
  hazir_at                timestamptz,
  baglandi                boolean     not null default false,
  bagli_tur               text,
  bagli_id                uuid,
  baglandi_at             timestamptz,
  silinecek_at            timestamptz,
  silme_nedeni            text,
  silindi_at              timestamptz,
  -- Kota hesabina bu dosyanin su an katkisi (rezervasyon -> isleme sonrasi gercek boyut; silinince 0).
  kota_bayt               bigint      not null default 0,
  isleme_basladi_at       timestamptz,
  isleme_deneme           int         not null default 0,
  sonraki_isleme_at       timestamptz,
  silme_hata_sayisi       int         not null default 0,
  constraint dosyalar_tur_fk foreign key (tur) references medya.saklama_politikalari (tur),
  constraint dosyalar_kurum_id_id_uniq unique (kurum_id, id),
  constraint dosyalar_kurum_id_sahip_kullanici_id_istemci_anahtari_uniq
    unique (kurum_id, sahip_kullanici_id, istemci_anahtari),
  constraint dosyalar_boyut_chk check (boyut_bayt is null or boyut_bayt > 0),
  constraint dosyalar_bildirilen_boyut_chk check (bildirilen_boyut_bayt > 0),
  constraint dosyalar_durum_chk check (durum in
    ('yukleme_bekliyor', 'yuklendi', 'isleniyor', 'hazir', 'islenemedi', 'silindi')),
  constraint dosyalar_hata_kodu_chk check (hata_kodu is null or hata_kodu in
    ('mime_uyusmazligi', 'boyut_uyusmazligi', 'bozuk_dosya', 'sure_asimi', 'yukleme_zaman_asimi')),
  constraint dosyalar_bagli_tur_chk check (bagli_tur is null or bagli_tur in
    ('odev_teslimi', 'odev_eki', 'soru', 'soru_mesaji', 'kurum', 'kullanici', 'fatura')),
  constraint dosyalar_silme_nedeni_chk check (silme_nedeni is null or silme_nedeni in
    ('yetim', 'saklama_suresi', 'soru_cozuldu', 'kullanici_silindi', 'kurum_kapandi', 'birakildi',
     'yukleme_zaman_asimi')),
  constraint dosyalar_hazir_chk check (durum <> 'hazir'
    or (boyut_bayt is not null and sha256 is not null and hazir_at is not null)),
  constraint dosyalar_silindi_chk check ((durum = 'silindi') = (silindi_at is not null)),
  constraint dosyalar_depolama_anahtari_chk check (
    durum = 'silindi' or depolama_anahtari is not null or durum = 'yukleme_bekliyor'),
  constraint dosyalar_baglandi_chk check (baglandi = (bagli_id is not null)),
  constraint dosyalar_kota_chk check (kota_bayt >= 0)
);
create unique index dosyalar_depolama_anahtari_uniq on medya.dosyalar (depolama_anahtari)
  where depolama_anahtari is not null;
create index dosyalar_kurum_id_sahip_kullanici_id_created_at_idx
  on medya.dosyalar (kurum_id, sahip_kullanici_id, created_at desc);
create index dosyalar_silinecek_at_idx on medya.dosyalar (silinecek_at)
  where durum <> 'silindi' and silinecek_at is not null;
create index dosyalar_durum_yukleme_son_at_idx on medya.dosyalar (durum, yukleme_son_at)
  where durum = 'yukleme_bekliyor';
create index dosyalar_kurum_id_bagli_tur_bagli_id_idx on medya.dosyalar (kurum_id, bagli_tur, bagli_id);
create index dosyalar_durum_hazir_at_idx on medya.dosyalar (durum, hazir_at)
  where baglandi = false and durum = 'hazir';
-- Isleme kuyrugu (worker): yuklendi satirlari.
create index dosyalar_durum_sonraki_isleme_at_idx on medya.dosyalar (sonraki_isleme_at nulls first, created_at)
  where durum = 'yuklendi';
create index dosyalar_isleniyor_idx on medya.dosyalar (isleme_basladi_at) where durum = 'isleniyor';
select ortak.kiraci_tablosu_koru('medya', 'dosyalar');

-- --- kucuk_resimler ---------------------------------------------------------------------------------
create table medya.kucuk_resimler (
  id                 uuid primary key,
  kurum_id           uuid        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  dosya_id           uuid        not null,
  varyant            text        not null,
  depolama_anahtari  text        not null,
  genislik           int         not null,
  yukseklik          int         not null,
  boyut_bayt         int         not null,
  mime_tipi          text        not null default 'image/webp',
  constraint kucuk_resimler_dosya_fk foreign key (kurum_id, dosya_id)
    references medya.dosyalar (kurum_id, id) on delete cascade,
  constraint kucuk_resimler_varyant_chk check (varyant in ('kucuk', 'orta')),
  constraint kucuk_resimler_dosya_id_varyant_uniq unique (dosya_id, varyant),
  constraint kucuk_resimler_depolama_anahtari_uniq unique (depolama_anahtari)
);
create index kucuk_resimler_kurum_id_dosya_id_idx on medya.kucuk_resimler (kurum_id, dosya_id);
select ortak.kiraci_tablosu_koru('medya', 'kucuk_resimler', false);
