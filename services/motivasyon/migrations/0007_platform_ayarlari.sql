-- 0007_platform_ayarlari: XP kurallari ve gunluk tavanlarin platformdan yonetimi (surumlu global ayar).
-- Gecerli degerler yine `xp_kurallari` / `xp_tavanlari` tablolarindadir (XP isleyicisi oradan okur, onbellek
-- yok); her degisiklik burada yeni bir surum satiri olarak (kim, ne zaman, neden, tam deger kopyasi) tutulur ve
-- degerleri ayni islemde bu tablolara uygular. Geri alma = eski surumun degerleriyle yeni surum.
-- Global tablodur (kiracisiz, RLS yok); kurum/ogrenci verisi icermez. Yalniz ekleme.

create table motivasyon.platform_ayar_surumleri (
  id                      uuid primary key,
  surum                   int         not null unique,
  -- {"kurallar": {kod: {xp, olay_basi_ust_sinir, gec_carpani, aktif}}, "tavanlar": {kod: gunluk_ust_sinir}}
  degerler                jsonb       not null,
  onceki_surum            int,
  geri_alinan_surum       int references motivasyon.platform_ayar_surumleri (surum),
  degistiren_kullanici_id uuid,
  neden                   text        not null,
  uyarilar                jsonb       not null default '[]',
  created_at              timestamptz not null default now(),
  constraint platform_ayar_surumleri_surum_chk check (surum >= 1),
  constraint platform_ayar_surumleri_neden_chk check (char_length(neden) between 1 and 500)
);

create trigger platform_ayar_surumleri_degismez_trg
  before update or delete on motivasyon.platform_ayar_surumleri
  for each row execute function ortak.defter_degistirilemez();

-- Surum 1: tohum degerleri (degistiren yok).
insert into motivasyon.platform_ayar_surumleri (id, surum, degerler, neden)
select '01900000-0000-7000-8000-000000000001', 1,
       jsonb_build_object(
         'kurallar', (select jsonb_object_agg(kod, jsonb_build_object(
                        'xp', xp, 'olay_basi_ust_sinir', olay_basi_ust_sinir,
                        'gec_carpani', gec_carpani::float8, 'aktif', aktif))
                      from motivasyon.xp_kurallari),
         'tavanlar', (select jsonb_object_agg(kod, gunluk_ust_sinir) from motivasyon.xp_tavanlari)),
       'Ilk tohum degerleri';

-- Uygulama rolu yalniz okur; yazim motivasyon_sistem ile (platform ucu). Surum satiri degistirilemez/silinemez.
revoke insert, update, delete on motivasyon.platform_ayar_surumleri from motivasyon_app;
revoke update, delete on motivasyon.platform_ayar_surumleri from motivasyon_sistem;
