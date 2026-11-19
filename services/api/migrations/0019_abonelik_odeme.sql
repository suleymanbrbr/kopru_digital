-- 0019_abonelik_odeme: odeme baslatma oturumlari (docs/schema/api.md `abonelik`, "Uygulama (migration 0019)").
-- Sahibin baslattigi iyzico odemesi: saglayici belirteci (token) -> kurum + plan + periyot eslemesi. Donus
-- (callback) ve ilk webhook bu kayitla kuruma baglanir. Yazma `api_sistem` ile, uygulama rolu yalniz okur.

create table abonelik.odeme_oturumlari (
  id               uuid primary key,
  kurum_id         uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  kaynak           text        not null,
  dis_islem_id     text,
  plan_id          uuid        not null,
  periyot          text        not null,
  tutar_kurus      bigint      not null,
  kdv_kurus        bigint      not null,
  durum            text        not null default 'bekliyor',
  dis_abonelik_id  text,
  constraint odeme_oturumlari_kurum_id_fk foreign key (kurum_id) references hesap.kurumlar (id),
  constraint odeme_oturumlari_plan_id_fk foreign key (plan_id) references abonelik.planlar (id),
  constraint odeme_oturumlari_kaynak_chk check (kaynak in ('iyzico')),
  constraint odeme_oturumlari_periyot_chk check (periyot in ('aylik', 'yillik')),
  constraint odeme_oturumlari_durum_chk check (durum in ('bekliyor', 'tamamlandi', 'basarisiz')),
  constraint odeme_oturumlari_tutar_chk check (tutar_kurus >= 0 and kdv_kurus >= 0 and kdv_kurus <= tutar_kurus)
);
create unique index odeme_oturumlari_kaynak_dis_islem_id_uniq on abonelik.odeme_oturumlari (kaynak, dis_islem_id)
  where dis_islem_id is not null;
create index odeme_oturumlari_kurum_id_created_at_idx on abonelik.odeme_oturumlari (kurum_id, created_at desc);
select ortak.kiraci_tablosu_koru('abonelik', 'odeme_oturumlari', false);
revoke insert, update, delete on abonelik.odeme_oturumlari from api_app;
