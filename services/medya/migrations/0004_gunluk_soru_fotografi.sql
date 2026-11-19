-- 0004_gunluk_soru_fotografi: gunluk soru takibi (api migration 0022) yanlis soru fotograflari icin yeni dosya
-- turu `gunluk_soru_fotografi` ve yeni bagli tur `gunluk_soru_kaydi`. Genislet-daralt: CHECK listeleri genisler,
-- mevcut satirlar etkilenmez. Saklama: odev teslim fotografi gibi 365 gun (kayit silinince `birakildi` ile hemen).

alter table medya.saklama_politikalari drop constraint saklama_politikalari_tur_chk;
alter table medya.saklama_politikalari add constraint saklama_politikalari_tur_chk check (tur in (
  'soru_fotografi', 'soru_cevap_fotografi', 'soru_cizim', 'soru_ses', 'odev_eki',
  'odev_teslim_fotografi', 'gunluk_soru_fotografi', 'kurum_logosu', 'avatar', 'fatura_pdf'));

insert into medya.saklama_politikalari
  (tur, izinli_mime, azami_boyut_bayt, azami_sure_sn, varsayilan_saklama_gun, yetim_saat, kucuk_resim, ek_islem)
values
  ('gunluk_soru_fotografi', '{image/jpeg,image/png,image/webp}', 10485760, null, 365, 48, true, 'gorsel_yeniden_kodla');

alter table medya.dosyalar drop constraint dosyalar_bagli_tur_chk;
alter table medya.dosyalar add constraint dosyalar_bagli_tur_chk check (bagli_tur is null or bagli_tur in
  ('odev_teslimi', 'odev_eki', 'soru', 'soru_mesaji', 'gunluk_soru_kaydi', 'kurum', 'kullanici', 'fatura'));
