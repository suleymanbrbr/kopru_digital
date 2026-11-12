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
| `hesap.kullanici.degisti.v1` | - | Kullanıcı oluşturulunca, dil/durum değişince. Özne: `kullanici`. **Telefon, e-posta ve ad olayda taşınmaz** (KVKK); `bildirim` iletişim bilgisini gönderim anında `api`dan alır (`GET /ic/kullanicilar/:id/iletisim`). | `kullanici_id`, `dil`, `durum` | `bildirim` (`kullanici_kopyalari`) |
| `hesap.kullanici.silindi.v1` | - | KVKK silme/anonimleştirme tamamlanınca. | `kullanici_id`, `uyelik_idleri[]`, `anonimlestirildi_at` | `bildirim`, `motivasyon`, `medya` |
| `hesap.kurum.degisti.v1` | K | Kurum oluşturma, ad/tür/saat dilimi/durum değişimi. Özne: `kurum`. | `kurum_id`, `ad`, `tur`, `saat_dilimi`, `durum` (`aktif`,`askida`,`kapali`) | `bildirim`, `motivasyon`, `medya` |
| `hesap.kademe.degisti.v1` | K | Kademe oluşturma/güncelleme/arşiv. | `kademe_id`, `ad`, `seviye`, `arsivlendi` (bool) | `bildirim` |
| `hesap.uyelik.degisti.v1` | K | Üyelik oluşunca; rol, durum, kademe, şube değişince; ayrılınca (`durum='ayrildi'`). | `uyelik_id`, `kullanici_id`, `rol`, `durum`, `sube_id`, `kademe_id` | `motivasyon`, `bildirim` |
| `hesap.grup.degisti.v1` | K | Grup oluşturma/güncelleme/arşiv. | `grup_id`, `tur`, `ad`, `kademe_id`, `sube_id`, `durum` | `motivasyon`, `bildirim` |
| `hesap.grup_uyesi.degisti.v1` | K | Öğrenci gruba eklenince/çıkarılınca. Özne: `grup_uyesi` (`id` = grup_uyeleri.id). | `grup_uyesi_id`, `grup_id`, `ogrenci_id`, `baslangic_tarihi`, `bitis_tarihi` | `motivasyon`, `bildirim` |
| `hesap.atama.degisti.v1` | K | Öğretmen ataması oluşunca/bitince. | `atama_id`, `grup_id`, `ogretmen_id`, `brans_kodu`, `baslangic_tarihi`, `bitis_tarihi`, `ana_ogretmen` | `motivasyon`, `bildirim` |
| `hesap.modul_ayari.degisti.v1` | K | Modül ayarı yazılınca ya da mirasa döndürülünce. | `modul_ayari_id`, `modul_kodu`, `kapsam`, `kapsam_id`, `acik` (mirasa dönüşte `null`) | `motivasyon`, `bildirim` |
| `hesap.davet.kabul_edildi.v1` | K | Davet kabul edilince (üyelik oluştuktan sonra, aynı işlemde). | `davet_id`, `davet_eden_id`, `uyelik_id`, `rol` | `bildirim` |

`hesap.riza.kaydedildi` olayı tanımlı değildir: Faz 1'de tüketicisi yoktur. Rıza kaydı `hesap.rizalar` defterindedir.

> **Değişiklik notu (8 Kasım 2026).** `hesap.uyelik.degisti.v1` yükünden `gorunen_ad` çıkarıldı: ad kişisel veridir ve olaylara konmaz; `motivasyon` ve `bildirim` kopya tabloları bu alanı zaten saklamıyordu. Alan silmek normalde yeni sürüm ister ([ADR 0002](../adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)); henüz üretim ortamı ve bu olayı tüketen kod olmadığı için v1 yerinde değiştirildi. Yasak alanlar `packages/contracts/src/hesap/olaylar.test.ts` ile denetlenir.

## `api` / ders

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `ders.ders.degisti.v1` | K | Ders planlanınca, ertelenince, iptal edilince, tamamlanınca, bilgisi güncellenince. Özne: `ders`. | `ders_id`, `degisim_turu` (`planlandi`,`ertelendi`,`iptal_edildi`,`tamamlandi`,`guncellendi`), `seri_id`, `grup_id`, `ogretmen_id`, `brans_kodu`, `baslangic_at`, `bitis_at`, `onceki_baslangic_at`, `durum`, `telafi`, `online` (bool), `ogrenci_idleri[]` (≤ 200; fazlası aynı `ders_id` ile `parca_no`/`parca_sayisi` taşıyan ayrı olaylar), `parca_no`, `parca_sayisi`, `iptal_nedeni`, `iptal_kaynagi` (`ogretmen`,`ogrenci`,`yonetici`), `gec_iptal` (bool) | `bildirim` |
| `ders.yoklama.kaydedildi.v1` | K | Yoklama eklenince ya da durumu değişince (kredi/ücret işlemiyle aynı işlemde). Özne: `yoklama`. | `yoklama_id`, `ders_id`, `grup_id`, `ogrenci_id`, `brans_kodu`, `durum` (`geldi`,`gelmedi`,`izinli`,`gec`), `onceki_durum`, `gec_dakika`, `isaretlenme_at`, `yoklama_surumu`. **Ders notu (`not`), ad, telefon, e-posta yükte yoktur** (yasak alan testi `packages/contracts/src/ders/olaylar.test.ts`). Yalnız gerçek değişimde yazılır (`sonuc: ayni`/`eski` olay üretmez). Durum `geldi`/`gec`ten başka bir duruma değişince `motivasyon` ters XP satırı yazar. | `motivasyon`, `bildirim` |
| `ders.geri_bildirim.verildi.v1` | K | Öğrenci derse geri bildirimi ilk kez verince (sonraki güncellemeler olay üretmez; `not` ve ad olaya girmez). | `geri_bildirim_id`, `ders_id`, `ogrenci_id`, `brans_kodu`, `deger`, `konu_id` | `motivasyon` |
| `ders.kaynak.eklendi.v1` | K | Ders kaydı/materyal eklenince ve görünürlüğü öğrencilere açıksa. | `kaynak_id`, `tur`, `ders_id` (null: materyal), `grup_id`, `brans_kodu` (null: dersten bağımsız materyal), `gorunurluk` (`grup`/`secili_ogrenciler`), `ekleyen_id`, `ogrenci_idleri[]` (200'lük parçalar, `parca_no`/`parca_sayisi`; her zaman çözümlenmiş alıcılar: ders katılımcıları, grubun etkin üyeleri ya da seçilenler). Uygulama sapması: `baslik` serbest metin olduğu için olay yükünde yoktur, bildirim metni `brans_kodu` ile kurulur. Alıcısı olmayan kaynak için olay yayımlanmaz | `bildirim` |
| `ders.kaynak.izlendi.v1` | K | Öğrenci "izledim" işaretleyince (ilk işaret). | `kaynak_id`, `ogrenci_id`, `ders_id` (null: materyal), `grup_id`, `brans_kodu` (null: materyal), `izledi_at` | `motivasyon` |
| `ders.kaynak.sorun_bildirildi.v1` | K | Bozuk bağlantı bildirimi eklenince. | `sorun_id`, `kaynak_id`, `ders_id` (null: materyal), `grup_id`, `bildiren_id`, `neden`, `ekleyen_id` (bildirimin gideceği öğretmen; açıklama metni olaya girmez) | `bildirim` |

## `api` / finans

Finans olaylarında ad, telefon, e-posta, ödeyen kişi ve serbest metin yoktur; tek serbest alan `makbuz_no`dur (paket adı da taşınmaz: bildirim servisi `paket_id` ile yetinir).

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `finans.kredi.azaldi.v1` | K | Düşüm/iade sonrası kredi bakiyesi `dusuk_kredi_esigi` değerine ya da altına **inince** (eşik geçişinde bir kez; iade ile eşik üstüne çıkıp tekrar inerse tekrar). | `ogrenci_id`, `kalan_kredi`, `esik`, `yoklama_id` | `bildirim` |
| `finans.tahsilat.alindi.v1` | K | Tahsilat kaydedilince. | `tahsilat_id`, `ogrenci_id`, `tutar_kurus`, `yontem`, `tahsilat_tarihi`, `makbuz_no` | `bildirim` |
| `finans.paket.satildi.v1` | K | Paket satışı yapılınca. | `paket_satisi_id`, `ogrenci_id`, `paket_id`, `toplam_kredi`, `bitis_tarihi` | `bildirim` |

## `api` / ogrenme

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `ogrenme.odev.yayinlandi.v1` | K | Fan-out tamamlandıktan sonra (parça başına bir olay); `atama-esitle` ile sonradan açılan satırlar için de (yalnız yeni öğrenciler). Yeni satır açılmadıysa olay yok. **`baslik` serbest metin olduğundan (kişisel veri riski) yükte yoktur**; bildirim `brans_kodu` ve `odev_id` kullanır. | `odev_id`, `brans_kodu`, `son_teslim_at`, `veren_id`, `hedef_turu`, `hedef_id`, `ogrenci_idleri[]` (≤ 200), `parca_no`, `parca_sayisi` | `bildirim` |
| `ogrenme.odev.teslim_edildi.v1` | K | Öğrenci teslim edince (yeniden teslimde tekrar). Özne: `ogrenci_odevi`. | `ogrenci_odev_id`, `odev_id`, `ogrenci_id`, `veren_id`, `brans_kodu`, `yapilan_soru_sayisi`, `dosya_sayisi`, `gec_teslim`, `yeniden_teslim` (bool) | `motivasyon`, `bildirim` |
| `ogrenme.odev.incelendi.v1` | K | Öğretmen inceleyince. | `ogrenci_odev_id`, `odev_id`, `ogrenci_id`, `inceleyen_id`, `brans_kodu`, `inceleme_sonucu` (`tamam`,`eksik`,`tekrar`) | `motivasyon`, `bildirim` |
| `ogrenme.plan_gorevi.guncellendi.v1` | K | Görevin `gerceklesen_miktar`ı veya durumu değişince (öğrenci girişi, öğretmenin hedefi değiştirip durumun yeniden hesaplanması, devretme: eski görev `devredildi`). Aynı değer tekrar yazılırsa olay yok. Ad, telefon, e-posta, başlık ve not yük dışıdır. | `gorev_id`, `plan_id`, `ogrenci_id`, `hafta_baslangic`, `gun`, `brans_kodu`, `hedef_turu`, `hedef_miktar`, `gerceklesen_miktar`, `onceki_gerceklesen_miktar`, `durum`, `onceki_durum` | `motivasyon` |
| `ogrenme.deneme.girildi.v1` | K | Deneme sonucu kaydedilince. | `deneme_id`, `ogrenci_id`, `kural_kodu`, `sinav_tarihi`, `toplam_net` | `motivasyon` |
| `ogrenme.plan_gorevi.guncellendi.v1` | K | Görevin `gerceklesen_miktar`ı veya durumu değişince. | `gorev_id`, `plan_id`, `ogrenci_id`, `hafta_baslangic`, `gun`, `brans_kodu`, `hedef_turu`, `hedef_miktar`, `gerceklesen_miktar`, `onceki_gerceklesen_miktar`, `durum`, `onceki_durum` | `motivasyon` |
| `ogrenme.deneme.girildi.v1` | K | Yalnız **onaylanmış** sonuçta: öğretmen/yönetici girişinde kayıt anında, öğrenci girişinde öğretmen onayı anında. Düzeltmede tekrarlanmaz. Ad, telefon, e-posta, deneme adı ve not yoktur. | `deneme_id`, `ogrenci_id`, `kural_kodu`, `sinav_tarihi`, `toplam_net` | `motivasyon` |
| `ogrenme.soru.sorildi.v1` | K | Soru oluşturulunca. | `soru_id`, `ogrenci_id`, `brans_kodu`, `yonlendirme`, `atanan_ogretmen_id`, `masa_id`, `hedef_ogretmen_idleri[]` | `bildirim`, `motivasyon` |
| `ogrenme.soru_mesaji.eklendi.v1` | K | Cevap veya takip sorusu eklenince (alıcı: cevapta öğrenci; takipte masada üstlenen varsa yalnız o, yoksa hedef öğretmenler). Metin ve başlık yükte yoktur. Özne: `soru`. | `soru_id`, `mesaj_id`, `tur` (`cevap`,`takip`), `yazar_id`, `ogrenci_id`, `alici_idleri[]` | `bildirim` |
| `ogrenme.soru.cozuldu.v1` | K | Soru `cozuldu` olunca (öğrenci "anladım" ya da 7 gün sonra otomatik, aktör `sistem`). | `soru_id`, `ogrenci_id`, `brans_kodu`, `cozuldu_at`, `dosya_idleri[]` (soru ve cevap fotoğraf/çizim dosyaları), `silinecek_at` (= `cozuldu_at` + kurumun `foto_saklama_gun` süresi, varsayılan 30 gün) | `medya`, `motivasyon` (`soru_anladim` XP) |
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

> **Uygulama notu (dosya olayları).** Beş dosya olayının Zod tanımları `packages/contracts/src/ortak/dosya.ts` (`ortak.dosya.*`) ve `packages/contracts/src/medya/olaylar.ts` (`medya.dosya.*`) içindedir. Dosya `tur` ve `bagli_tur` listeleri tek kaynaktır (`MEDYA_DOSYA_TURLERI`, `MEDYA_BAGLI_TURLERI`; [medya.md](medya.md) ile aynı); `medya.dosya.hazir` yükü `ortak.medya_dosya_kopyalari` sütunlarını besler (`sahip_uyelik_id` dahil). `medya.dosya.islenemedi.hata_kodu` ve `medya.dosya.silindi.silme_nedeni` medya.md'deki listelerle sınırlı bir enum'dur. Yüklerde depolama anahtarı, dosya adı, özet (`sha256`) ve kişisel veri yoktur; `packages/contracts/src/ortak/dosya.test.ts` yasak alanları denetler.

## `motivasyon`

| Olay | Kurum | Ne zaman yayımlanır | Yük (`veri`) | Tüketiciler |
| --- | --- | --- | --- | --- |
| `motivasyon.seviye.atladi.v1` | K | Toplam XP seviye eşiğini geçince. | `ogrenci_id`, `eski_seviye`, `yeni_seviye`, `toplam_xp` | `bildirim` |
| `motivasyon.seri.risk.v1` | K | 21:00 yerel iş: bugün (04:00 kuralı) henüz `aktif` olmayan ve `mevcut_seri >= 3` öğrenciler. | `ogrenci_id`, `mevcut_seri`, `gun_bitis_at` (ertesi gün 04:00'ün UTC karşılığı), `dondurma_stogu` | `bildirim` |
| `motivasyon.seri.bozuldu.v1` | K | Gece değerlendirmesinde seri bozulunca. | `ogrenci_id`, `onceki_seri`, `onarilabilir` (bool), `onarim_son_gun` | `bildirim` |
| `motivasyon.seri.kilometre_tasi.v1` | K | Seri 3, 7, 14, 30, 60, 100, 365'e ulaşınca. | `ogrenci_id`, `seri` | `bildirim` |
| `motivasyon.rozet.kazanildi.v1` | K | Yeni rozet kazanılınca (ilk eklemede). | `ogrenci_id`, `rozet_kodu`, `kazanildi_at` | `bildirim` |
| `motivasyon.karakter.evrildi.v1` | K | Karakter aşaması yükselince. | `ogrenci_id`, `tur_kodu`, `eski_asama`, `yeni_asama` | `bildirim` |

> **Uygulama notu (motivasyon olayları).** Altı olayın Zod tanımları `packages/contracts/src/motivasyon/olaylar.ts` içindedir (`packages/contracts/src/motivasyon/olaylar.test.ts` kişisel veri alanlarını denetler; karakter adı, rozet adı gibi görünen adlar yükte yoktur). `seviye.atladi`, `rozet.kazanildi` ve `karakter.evrildi` `motivasyon.xp` tüketicisinden, ilgili XP/sayaç işlemiyle aynı işlemde outbox'a (`ortak.outbox`) yazılır; çoklu seviye atlayışı tek olaydır (`eski_seviye` → `yeni_seviye`). `seri.*` olaylarını seri paketi yayımlar (sözleşmeleri hazır). `seri.bozuldu.onarim_son_gun` onarılamazsa `null` olabilir.
>
> **Kopya sıralaması.** Olay zarfında `ozne_surumu` yoktur; `motivasyon.kopya` eski olayı `(occurredAt, olay id)` ikilisiyle ayıklar (eşit zamanda büyük UUIDv7 kazanır), aynı durumun yeniden yayımı upsert olarak etkisizdir. `hesap.modul_ayari.degisti` `acik: null` ise kopya satırı silinir. `hesap.kullanici.silindi.v1` sözleşmesi henüz olmadığı için `motivasyon.kopya` bu olayı tüketmez.

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
| `motivasyon.xp` | `ders.yoklama.kaydedildi`, `ders.geri_bildirim.verildi`, `ders.kaynak.izlendi`, `ogrenme.odev.teslim_edildi`, `ogrenme.odev.incelendi`, `ogrenme.plan_gorevi.guncellendi`, `ogrenme.deneme.girildi`, `ogrenme.soru.sorildi`, `ogrenme.soru.cozuldu` |
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
