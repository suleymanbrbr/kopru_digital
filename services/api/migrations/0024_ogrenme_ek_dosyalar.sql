-- 0024_ogrenme_ek_dosyalar: odev ve haftalik plan ek dosyalari (docs/schema/api.md `odev_ekleri`, `plan_ekleri`).
-- Dosya baytlari `medya` servisindedir (dosya turu `odev_eki` / `plan_eki`, medya migration 0005); burada yalniz
-- `ortak.medya_dosya_kopyalari` kimligi tutulur, `ortak.dosya.baglandi.v1` ile baglanir. Genislet-daralt: yalniz
-- yeni tablolar. Bir medya dosyasi tek kayda baglanir (`medya_dosya_id` tekil). En cok 10 ek (sira 0..9).

create table ogrenme.odev_ekleri (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  odev_id         uuid        not null,
  medya_dosya_id  uuid        not null,
  sira            smallint    not null default 0,
  constraint odev_ekleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint odev_ekleri_odev_id_fk foreign key (kurum_id, odev_id) references ogrenme.odevler (kurum_id, id),
  constraint odev_ekleri_medya_dosya_id_uniq unique (medya_dosya_id),
  constraint odev_ekleri_odev_id_sira_uniq unique (odev_id, sira),
  constraint odev_ekleri_sira_chk check (sira between 0 and 9)
);
create index odev_ekleri_kurum_id_odev_id_idx on ogrenme.odev_ekleri (kurum_id, odev_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'odev_ekleri', false);

create table ogrenme.plan_ekleri (
  id              uuid primary key,
  kurum_id        uuid        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  plan_id         uuid        not null,
  medya_dosya_id  uuid        not null,
  sira            smallint    not null default 0,
  constraint plan_ekleri_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint plan_ekleri_plan_id_fk foreign key (kurum_id, plan_id) references ogrenme.haftalik_planlar (kurum_id, id),
  constraint plan_ekleri_medya_dosya_id_uniq unique (medya_dosya_id),
  constraint plan_ekleri_plan_id_sira_uniq unique (plan_id, sira),
  constraint plan_ekleri_sira_chk check (sira between 0 and 9)
);
create index plan_ekleri_kurum_id_plan_id_idx on ogrenme.plan_ekleri (kurum_id, plan_id);
select ortak.kiraci_tablosu_koru('ogrenme', 'plan_ekleri', false);
