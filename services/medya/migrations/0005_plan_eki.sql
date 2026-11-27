-- 0005_plan_eki: haftalik plana hazir plan dosyasi (PDF/resim) eki (sartname "hazir plani resim/PDF olarak yukle";
-- api migration 0024). Yeni dosya turu `plan_eki` ve yeni bagli tur `plan_eki`. `odev_eki` ile ayni kurallar:
-- personel yukler, gorsel + PDF, 20 MB, bagli oldugu surece saklanir (365 gun; "akademik yil sonuna kadar" yaklasigi).
-- Genislet-daralt: CHECK listeleri genisler, mevcut satirlar etkilenmez.

alter table medya.saklama_politikalari drop constraint saklama_politikalari_tur_chk;
alter table medya.saklama_politikalari add constraint saklama_politikalari_tur_chk check (tur in (
  'soru_fotografi', 'soru_cevap_fotografi', 'soru_cizim', 'soru_ses', 'odev_eki', 'plan_eki',
  'odev_teslim_fotografi', 'gunluk_soru_fotografi', 'kurum_logosu', 'avatar', 'fatura_pdf'));

insert into medya.saklama_politikalari
  (tur, izinli_mime, azami_boyut_bayt, azami_sure_sn, varsayilan_saklama_gun, yetim_saat, kucuk_resim, ek_islem)
select 'plan_eki', izinli_mime, azami_boyut_bayt, azami_sure_sn, varsayilan_saklama_gun, yetim_saat, kucuk_resim, ek_islem
  from medya.saklama_politikalari where tur = 'odev_eki';

alter table medya.dosyalar drop constraint dosyalar_bagli_tur_chk;
alter table medya.dosyalar add constraint dosyalar_bagli_tur_chk check (bagli_tur is null or bagli_tur in
  ('odev_teslimi', 'odev_eki', 'plan_eki', 'soru', 'soru_mesaji', 'gunluk_soru_kaydi', 'kurum', 'kullanici', 'fatura'));
