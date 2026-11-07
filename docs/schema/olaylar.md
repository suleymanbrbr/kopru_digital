# Olay kataloğu

Servisler arası tüm olaylar bu dokümanda tanımlıdır. Sözleşme kuralları (zarf, sürümleme, idempotency, DLQ, sıra) [ADR 0002](../adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)'dedir. Tablolar ve olay üreten yazımlar [api.md](api.md), [motivasyon.md](motivasyon.md), [bildirim.md](bildirim.md), [medya.md](medya.md) içindedir.

Bir olayın yükü değiştiğinde bu doküman aynı PR'da güncellenir.

## Okuma kılavuzu

- Olay adı: `alan.varlik.fiil.vN`. NATS konusu: `{uretici}.{alan}.{varlik}.{fiil}.vN`.
- Zarf alanları (`id`, `tur`, `surum`, `uretici`, `kurum_id`, `olusma_zamani`, `ozne`, `ozne_surumu`, `korelasyon_id`, `neden_id`, `aktor`) tabloda tekrarlanmaz. Tabloda yalnızca `veri` alanları ve öznesi verilir.
- `*.degisti` olayları ilgili kaydın **tam güncel durumunu** taşır (upsert). Tüketici `ozne_surumu`'nu kopyadaki `surum` ile karşılaştırır, eskiyi atar.
- Tüm kimlikler UUID (UUIDv7). Zamanlar RFC 3339 UTC. Tutarlar kuruş tamsayı. `ogrenci_id`, `ogretmen_id`, `uyelik_id` `hesap.uyelikler.id` değeridir.
- Liste yükleri 200 öğe/olay ile parçalanır (`parca_no` 1'den, `parca_sayisi`). Parçalı olaylar yalnızca bu alanları ek taşır.
- "Kurum" sütunu zarf `kurum_id`'sinin dolu (K) ya da boş (-) olduğunu gösterir.
- Faz 1'de tüketicisi olmayan olay tanımlanmaz.

## Özet

| Üretici | Olaylar |
| --- | --- |
| `api` | `hesap.*` (10), `ders.*` (6), `finans.*` (3), `ogrenme.*` (9), `abonelik.*` (3), `ortak.*` (2) |
| `motivasyon` | 6 |
| `bildirim` | 0 |
| `medya` | 3 |

Stream'ler: `API`, `MOTIVASYON`, `BILDIRIM`, `MEDYA`. `API` altındaki tüm olaylar `api.>` konusuna yazılır.

## `api` / hesap

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `hesap.kullanici.degisti.v1` | - | Kullanıcı oluşturulunca, ad/telefon/e-posta/dil/durum değişince. Özne: `kullanici`. | `kullanici_id`, `gorunen_ad`, `telefon_e164`, `eposta`, `dil`, `durum` | `bildirim` (`kullanici_kopyalari`) |
| `hesap.kullanici.silindi.v1` | - | KVKK silme/anonimleştirme tamamlanınca. | `kullanici_id`, `uyelik_idleri[]`, `anonimlestirildi_at` | `bildirim`, `motivasyon`, `medya` |
| `hesap.kurum.degisti.v1` | K | Kurum oluşturma, ad/tür/saat dilimi/durum değişimi. Özne: `kurum`. | `kurum_id`, `ad`, `tur`, `saat_dilimi`, `durum` (`aktif`,`askida`,`kapali`) | `bildirim`, `motivasyon`, `medya` |
| `hesap.kademe.degisti.v1` | K | Kademe oluşturma/güncelleme/arşiv. | `kademe_id`, `ad`, `seviye`, `arsivlendi` (bool) | `bildirim` |
| `hesap.uyelik.degisti.v1` | K | Üyelik oluşunca; rol, durum, kademe, şube değişince; ayrılınca (`durum='ayrildi'`). | `uyelik_id`, `kullanici_id`, `rol`, `durum`, `sube_id`, `kademe_id`, `gorunen_ad` | `motivasyon`, `bildirim` |
| `hesap.grup.degisti.v1` | K | Grup oluşturma/güncelleme/arşiv. | `grup_id`, `tur`, `ad`, `kademe_id`, `sube_id`, `durum` | `motivasyon`, `bildirim` |
| `hesap.grup_uyesi.degisti.v1` | K | Öğrenci gruba eklenince/çıkarılınca. Özne: `grup_uyesi` (`id` = grup_uyeleri.id). | `grup_uyesi_id`, `grup_id`, `ogrenci_id`, `baslangic_tarihi`, `bitis_tarihi` | `motivasyon`, `bildirim` |
| `hesap.atama.degisti.v1` | K | Öğretmen ataması oluşunca/bitince. | `atama_id`, `grup_id`, `ogretmen_id`, `brans_kodu`, `baslangic_tarihi`, `bitis_tarihi`, `ana_ogretmen` | `motivasyon`, `bildirim` |
| `hesap.modul_ayari.degisti.v1` | K | Modül ayarı yazılınca ya da mirasa döndürülünce. | `modul_ayari_id`, `modul_kodu`, `kapsam`, `kapsam_id`, `acik` (mirasa dönüşte `null`) | `motivasyon`, `bildirim` |
| `hesap.davet.kabul_edildi.v1` | K | Davet kabul edilince (üyelik oluştuktan sonra, aynı işlemde). | `davet_id`, `davet_eden_id`, `uyelik_id`, `rol` | `bildirim` |

`hesap.riza.kaydedildi` olayı tanımlı değildir: Faz 1'de tüketicisi yoktur. Rıza kaydı `hesap.rizalar` defterindedir.

## `api` / ders

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `ders.ders.degisti.v1` | K | Ders planlanınca, ertelenince, iptal edilince, tamamlanınca, bilgisi güncellenince. Özne: `ders`. | `ders_id`, `degisim_turu` (`planlandi`,`ertelendi`,`iptal_edildi`,`tamamlandi`,`guncellendi`), `seri_id`, `grup_id`, `ogretmen_id`, `brans_kodu`, `baslangic_at`, `bitis_at`, `onceki_baslangic_at`, `durum`, `telafi`, `online` (bool), `ogrenci_idleri[]` (parçalı), `iptal_nedeni` | `bildirim` |
| `ders.yoklama.kaydedildi.v1` | K | Yoklama eklenince ya da durumu değişince (kredi/ücret işlemiyle aynı işlemde). Özne: `yoklama`. | `yoklama_id`, `ders_id`, `grup_id`, `ogrenci_id`, `durum`, `onceki_durum`, `gec_dakika`, `isaretlenme_at`, `yoklama_surumu` | `motivasyon`, `bildirim` |
| `ders.geri_bildirim.verildi.v1` | K | Öğrenci geri bildirim verince/değiştirince (ilk verişte). | `geri_bildirim_id`, `ders_id`, `ogrenci_id`, `deger`, `konu_id` | `motivasyon` |
| `ders.kaynak.eklendi.v1` | K | Ders kaydı/materyal eklenince ve görünürlüğü öğrencilere açıksa. | `kaynak_id`, `tur`, `ders_id`, `grup_id`, `baslik`, `gorunurluk`, `ekleyen_id`, `ogrenci_idleri[]` (parçalı; `secili_ogrenciler` ya da katılımcılar, `grup` türünde boş = grup üyeleri) | `bildirim` |
| `ders.kaynak.izlendi.v1` | K | Öğrenci "izledim" işaretleyince (ilk işaret). | `kaynak_id`, `ogrenci_id`, `izledi_at` | `motivasyon` |
| `ders.kaynak.sorun_bildirildi.v1` | K | Bozuk bağlantı bildirimi eklenince. | `sorun_id`, `kaynak_id`, `bildiren_id`, `neden`, `ekleyen_id` | `bildirim` |

## `api` / finans

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `finans.kredi.azaldi.v1` | K | Düşüm/iade sonrası kredi bakiyesi `dusuk_kredi_esigi` değerinin altına **inince** (eşik geçişinde bir kez; iade ile eşik üstüne çıkıp tekrar inerse tekrar). | `ogrenci_id`, `kalan_kredi`, `esik`, `yoklama_id` | `bildirim` |
| `finans.tahsilat.alindi.v1` | K | Tahsilat kaydedilince. | `tahsilat_id`, `ogrenci_id`, `tutar_kurus`, `yontem`, `tahsilat_tarihi`, `makbuz_no` | `bildirim` |
| `finans.paket.satildi.v1` | K | Paket satışı yapılınca. | `paket_satisi_id`, `ogrenci_id`, `ad`, `toplam_kredi`, `bitis_tarihi` | `bildirim` |

## `api` / ogrenme

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `ogrenme.odev.yayinlandi.v1` | K | Fan-out tamamlandıktan sonra (parça başına bir olay). | `odev_id`, `baslik`, `brans_kodu`, `son_teslim_at`, `veren_id`, `hedef_turu`, `hedef_id`, `ogrenci_idleri[]`, `parca_no`, `parca_sayisi` | `bildirim` |
| `ogrenme.odev.teslim_edildi.v1` | K | Öğrenci teslim edince (yeniden teslimde tekrar). Özne: `ogrenci_odevi`. | `ogrenci_odev_id`, `odev_id`, `ogrenci_id`, `veren_id`, `yapilan_soru_sayisi`, `dosya_sayisi`, `gec_teslim`, `yeniden_teslim` (bool) | `motivasyon`, `bildirim` |
| `ogrenme.odev.incelendi.v1` | K | Öğretmen inceleyince. | `ogrenci_odev_id`, `odev_id`, `ogrenci_id`, `inceleyen_id`, `inceleme_sonucu` (`tamam`,`eksik`,`tekrar`) | `motivasyon`, `bildirim` |
| `ogrenme.plan_gorevi.guncellendi.v1` | K | Görevin `gerceklesen_miktar`ı veya durumu değişince. | `gorev_id`, `plan_id`, `ogrenci_id`, `hafta_baslangic`, `gun`, `brans_kodu`, `hedef_turu`, `hedef_miktar`, `gerceklesen_miktar`, `onceki_gerceklesen_miktar`, `durum`, `onceki_durum` | `motivasyon` |
| `ogrenme.deneme.girildi.v1` | K | Deneme sonucu kaydedilince. | `deneme_id`, `ogrenci_id`, `kural_kodu`, `sinav_tarihi`, `toplam_net` | `motivasyon` |
| `ogrenme.soru.sorildi.v1` | K | Soru oluşturulunca. | `soru_id`, `ogrenci_id`, `brans_kodu`, `yonlendirme`, `atanan_ogretmen_id`, `masa_id`, `hedef_ogretmen_idleri[]` | `bildirim`, `motivasyon` |
| `ogrenme.soru_mesaji.eklendi.v1` | K | Cevap veya takip sorusu eklenince. Özne: `soru`. | `soru_id`, `mesaj_id`, `tur` (`cevap`,`takip`), `yazar_id`, `ogrenci_id`, `alici_idleri[]` | `bildirim` |
| `ogrenme.soru.cozuldu.v1` | K | Soru `cozuldu` olunca. | `soru_id`, `ogrenci_id`, `cozuldu_at`, `dosya_idleri[]` (soru ve cevap fotoğraf/çizim dosyaları), `silinecek_at` (= `cozuldu_at` + 30 gün) | `medya` |
| `ogrenme.soru.yeniden_acildi.v1` | K | Çözülmüş soru takip sorusuyla yeniden açılınca. | `soru_id`, `ogrenci_id`, `dosya_idleri[]` | `medya` |

## `api` / abonelik

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `abonelik.abonelik.degisti.v1` | K | Abonelik oluşunca; durum, plan, dönem, ek süre değişince. Özne: `abonelik`. | `abonelik_id`, `kaynak`, `durum`, `periyot`, `plan_kodu`, `plan_surumu`, `donem_bitis_at`, `ek_sure_bitis_at`, `iptal_istendi_at`, `limitler` (`max_ogrenci`,`max_ogretmen`,`max_sube`,`medya_kota_bayt`,`sms_aylik`,`soru_aylik_ogrenci`), `moduller[]` | `bildirim`, `medya` |
| `abonelik.odeme.islendi.v1` | K | Abonelik ödemesi sonuçlanınca (başarılı, başarısız, iade). | `odeme_id`, `abonelik_id`, `durum`, `tutar_kurus`, `donem_bitis_at`, `hata_kodu` | `bildirim` |
| `abonelik.fatura.kesildi.v1` | K | e-Arşiv fatura kesilince. | `fatura_id`, `odeme_id`, `fatura_no`, `toplam_kurus`, `pdf_dosya_id` | `bildirim` |

## `api` / ortak

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `ortak.dosya.baglandi.v1` | K | `api` bir medya dosyasını iş kaydına bağlayınca (ödev eki/teslimi, soru, soru mesajı eki, kurum logosu, avatar, fatura pdf). | `dosya_id`, `bagli_tur` (`odev_eki`,`odev_teslimi`,`soru`,`soru_mesaji`,`kurum`,`kullanici`,`fatura`), `bagli_id` | `medya` |
| `ortak.dosya.birakildi.v1` | K | Bağlı dosya kayıttan ayrılınca (teslimden dosya çıkarma, avatar değişimi). | `dosya_id`, `bagli_tur`, `bagli_id`, `hemen_sil` (bool) | `medya` |

## `motivasyon`

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `motivasyon.seviye.atladi.v1` | K | Toplam XP seviye eşiğini geçince. | `ogrenci_id`, `eski_seviye`, `yeni_seviye`, `toplam_xp` | `bildirim` |
| `motivasyon.seri.risk.v1` | K | 19:30 yerel gün işi: bugün henüz seri günü olmayan ve `mevcut_seri >= 3` öğrenciler. | `ogrenci_id`, `mevcut_seri`, `bitis_saati` (yerel 24:00 UTC karşılığı), `dondurma_hakki` | `bildirim` |
| `motivasyon.seri.bozuldu.v1` | K | Gece değerlendirmesinde seri bozulunca. | `ogrenci_id`, `onceki_seri`, `onarilabilir` (bool), `onarim_son_gun` | `bildirim` |
| `motivasyon.seri.kilometre_tasi.v1` | K | Seri 7, 14, 30, 60, 100, 200, 365'e ulaşınca. | `ogrenci_id`, `seri` | `bildirim` |
| `motivasyon.rozet.kazanildi.v1` | K | Yeni rozet kazanılınca (ilk eklemede). | `ogrenci_id`, `rozet_kodu`, `kazanildi_at` | `bildirim` |
| `motivasyon.karakter.evrildi.v1` | K | Karakter aşaması yükselince. | `ogrenci_id`, `tur_kodu`, `eski_asama`, `yeni_asama` | `bildirim` |

## `bildirim`

Faz 1'de olay üretmez.

## `medya`

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `medya.dosya.hazir.v1` | K | İşleme bitip `durum='hazir'` olunca. | `dosya_id`, `sahip_kullanici_id`, `sahip_uyelik_id`, `tur`, `mime_tipi`, `boyut_bayt`, `genislik`, `yukseklik`, `sure_sn`, `kucuk_resim_var` | `api` (`ortak.medya_dosya_kopyalari`) |
| `medya.dosya.islenemedi.v1` | K | İşleme `islenemedi` ile bitince. | `dosya_id`, `sahip_kullanici_id`, `tur`, `hata_kodu` | `api` |
| `medya.dosya.silindi.v1` | K | Fiziksel silme tamamlanınca. | `dosya_id`, `tur`, `silme_nedeni`, `silindi_at` | `api` |

## Tüketici -> olay matrisi

| Tüketici servis (tüketici adı) | Olaylar |
| --- | --- |
| `motivasyon.xp` | `ders.yoklama.kaydedildi`, `ders.geri_bildirim.verildi`, `ders.kaynak.izlendi`, `ogrenme.odev.teslim_edildi`, `ogrenme.odev.incelendi`, `ogrenme.plan_gorevi.guncellendi`, `ogrenme.deneme.girildi`, `ogrenme.soru.sorildi` |
| `motivasyon.kopya` | `hesap.kurum.degisti`, `hesap.uyelik.degisti`, `hesap.grup.degisti`, `hesap.grup_uyesi.degisti`, `hesap.atama.degisti`, `hesap.modul_ayari.degisti`, `hesap.kullanici.silindi` |
| `bildirim.kopya` | `hesap.kullanici.degisti`, `hesap.kullanici.silindi`, `hesap.kurum.degisti`, `hesap.kademe.degisti`, `hesap.uyelik.degisti`, `hesap.grup.degisti`, `hesap.grup_uyesi.degisti`, `hesap.atama.degisti`, `hesap.modul_ayari.degisti`, `abonelik.abonelik.degisti` |
| `bildirim.uretim` | `ders.*` (4), `finans.*` (3), `ogrenme.odev.yayinlandi`, `ogrenme.odev.teslim_edildi`, `ogrenme.odev.incelendi`, `ogrenme.soru.sorildi`, `ogrenme.soru_mesaji.eklendi`, `abonelik.*` (3), `motivasyon.*` (6), `hesap.davet.kabul_edildi` |
| `medya.baglama` | `ortak.dosya.baglandi`, `ortak.dosya.birakildi` |
| `medya.saklama` | `ogrenme.soru.cozuldu`, `ogrenme.soru.yeniden_acildi`, `hesap.kullanici.silindi` |
| `medya.kopya` | `hesap.kurum.degisti`, `abonelik.abonelik.degisti` |
| `api.medya` | `medya.dosya.hazir`, `medya.dosya.islenemedi`, `medya.dosya.silindi` |

`bildirim.uretim` için `ders.*` olayları: `ders.ders.degisti`, `ders.yoklama.kaydedildi`, `ders.kaynak.eklendi`, `ders.kaynak.sorun_bildirildi` (4 olay; `ders.geri_bildirim.verildi` ve `ders.kaynak.izlendi` yalnızca `motivasyon`'a gider).

## Değişiklik süreci

1. Yeni olay: bu dokümana satır ekle (tüketicisi olmayan olay eklenmez).
2. Geriye uyumlu alan ekleme: aynı sürümde, isteğe bağlı alan olarak.
3. Geriye uyumsuz değişiklik: yeni sürüm (`v2`), çift yayın, geçiş sonrası `v1` kaldırma ([ADR 0002](../adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)).
4. Zod şemaları `packages/olaylar` altında bu katalogla aynı adlarla tutulur.
