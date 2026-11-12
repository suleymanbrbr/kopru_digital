-- 0003_saklama_olay_at: soru saklama olaylarinin (cozuldu / yeniden_acildi) sira bagimsizligi icin son olay zamani.
-- Yeniden teslimde eski olay yeni durumu ezmesin: guncelleme yalniz olay `occurredAt`i >= bu deger ise yapilir.
alter table medya.dosyalar add column saklama_olay_at timestamptz;
