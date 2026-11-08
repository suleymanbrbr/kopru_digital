-- 0004_davet_eposta_kanali: davetlere e-posta kanali. Genislet-daralt: yeni sutun bos (null) kabul eder,
-- kanal CHECK'i yalniz genisler; mevcut satirlar ve eski uygulama surumu etkilenmez.

alter table hesap.davetler add column hedef_eposta citext;

alter table hesap.davetler drop constraint davetler_kanal_chk;
alter table hesap.davetler
  add constraint davetler_kanal_chk check (kanal in ('baglanti', 'sms', 'eposta'));

alter table hesap.davetler
  add constraint davetler_eposta_hedef_chk check (kanal <> 'eposta' or hedef_eposta is not null);
