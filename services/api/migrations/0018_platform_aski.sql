-- 0018_platform_aski: platform askisi ile abonelik askisinin ayrilmasi (ADR 0004, degisiklik notu 2026-11-19).
-- Genislet-daralt: iki bos gelebilen sutun. `hesap.kurumlar.durum = 'askida'` gostergesi korunur (iki
-- sebepten de 'askida' gorunur); sebep ayrimi `platform_askida_at` ile yapilir: doluysa platform kurumu elle
-- askiya almistir ve abonelik isi (odeme gelmesi, kurumsal aktivasyon) kurumu YENIDEN ACAMAZ.
alter table hesap.kurumlar
  add column platform_askida_at   timestamptz,
  add column platform_aski_nedeni text;
alter table hesap.kurumlar add constraint kurumlar_platform_aski_chk
  check ((platform_askida_at is null) = (platform_aski_nedeni is null));
