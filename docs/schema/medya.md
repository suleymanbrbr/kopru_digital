# `medya` veritabanı şeması

Medya servisi: dosya kayıtları, yükleme izinleri (presigned URL), işleme, küçük resimler, saklama ve silme. Dosya baytları S3 uyumlu, Türkiye'deki nesne depolamada tutulur ([ADR 0005](../adr/0005-dagitim-docker-kamal.md)). Ortak kurallar [README.md](README.md)'dedir. Olay yükleri [olaylar.md](olaylar.md)'dedir.

Tek şema: `medya` (+ `ortak`). Roller: `medya_owner`, `medya_app`, `medya_sistem`.

## Tasarım kuralları

- **Yükleme akışı** (3 adım):
  1. İstemci `POST /v1/dosyalar` ile `{tur, mime_tipi, boyut_bayt, sha256, istemci_anahtari}` gönderir. Servis kota, tür ve boyut denetimini yapar, `dosyalar` satırını `yukleme_bekliyor` durumunda açar, presigned `PUT` adresi (15 dk geçerli) döner. `istemci_anahtari` tekrar eden istekte aynı satırı döndürür (idempotency).
  2. İstemci baytları doğrudan depolamaya yükler.
  3. İstemci `POST /v1/dosyalar/{id}/tamam` çağırır. Servis nesneyi `HEAD` ile doğrular (boyut, içerik türü), durumu `yuklendi` yapar ve işleme işini kuyruğa alır. İşleme biter: `hazir` + `medya.dosya.hazir.v1`.
- **Okuma:** İstemciye kalıcı adres verilmez. Okuma adresi kısa ömürlü (10 dk) presigned `GET`'tir. Sahip kendi dosyasını doğrudan, başkasının dosyasını yalnızca `api` aracılığıyla (iç uç nokta `POST /ic/okuma-adresleri`, servis JWT'si) alır; yetki kararı `api`dadır (öğretmen-öğrenci ilişkisi `api` verisidir). Böylece `medya` üyelik kopyası tutmaz.
- **Bağlama (referans):** Yüklenen dosya, bir iş kaydına bağlanana kadar "yetim"dir. `api`, dosyayı bir ödev teslimi/soru/mesajına bağlayınca `ortak.dosya.baglandi.v1` yayımlar. Yetim dosyalar `saklama_politikalari.yetim_saat` sonra silinir.
- **Silme:** Fiziksel silme `silinecek_at` zamanı gelince işlenir. Satır silinmez, `durum='silindi'` olur ve depolama anahtarı `NULL`lanır; `sha256`, boyut, tür ve silme nedeni denetim için kalır.
- **Güvenlik:** Yükleme sonrası içerik türü bayt imzasıyla (magic bytes) doğrulanır, bildirilen `mime_tipi` ile uyuşmazsa dosya reddedilir (`islenemedi`, `mime_uyusmazligi`). Görseller yeniden kodlanır (EXIF konum bilgisi silinir). Virüs taraması Faz 1 dışı.
- **Depolama anahtarı:** `{kurum_id}/{tur}/{yyyy}/{mm}/{dosya_id}` (kullanıcı adı veya özgün dosya adı içermez). İstemci baytları presigned PUT ile `{anahtar}.yukleme` nesnesine yazar; işleme yeniden kodlanmış çıktıyı `{anahtar}`a yazar ve commit sonrası `.yukleme` nesnesini siler (çökme/yeniden denemede özgün bayt ve `sha256` hep elde kalır). Küçük resimler `{anahtar}.kucuk.webp` ve `{anahtar}.orta.webp`.
- **İşleme:** worker `durum='yuklendi'` satırlarını `FOR UPDATE SKIP LOCKED` ile alıp `isleniyor` yapar (kısa işlem), ağır işi işlem dışında yapar, sonucu (`hazir` + `medya.dosya.hazir.v1` ya da `islenemedi` + `medya.dosya.islenemedi.v1`) tek işlemde yazar. Geçici (depolama) hatada satır `yuklendi`ye döner ve 10 sn / 30 sn / 2 dk / 10 dk / 30 dk gecikmeyle en çok 5 kez denenir; `isleniyor`da 10 dakikadan uzun kalan satır (çökmüş worker) kuyruğa geri alınır. Sıra: boyut → SHA-256 (`bozuk_dosya`) → bayt imzası (`mime_uyusmazligi`) → görsel yeniden kodlama / ses süresi.
- **İzinli içerik:** görseller `image/jpeg`, `image/png`, `image/webp`; **HEIC/HEIF ve SVG kabul edilmez** (istemci yüklemeden önce JPEG'e çevirir). Ses: `audio/mp4` (m4a/AAC), `audio/aac`, `audio/mpeg`, `audio/webm`, `audio/ogg`; azami süre **180 sn**, azami 5 MB; süresi doğrulanamayan ses reddedilir. Süre önce `music-metadata` ile, başlıkta yoksa (Chrome `MediaRecorder` WebM/Opus, Ogg/Opus) dosyanın tamamı taranarak bulunur: WebM'de son bloğun Cluster zamanı + Opus paket süresi, Ogg'da son sayfanın granule konumu. PDF `application/pdf` (`odev_eki`, `fatura_pdf`). Kural tek kaynağı `@kopru/contracts` `MEDYA_TUR_KURALLARI`; tohum testle birebir doğrulanır.
- **Rol × tür** (JWT `rol`; medya üyelik kopyası tutmaz): `soru_fotografi`, `odev_teslim_fotografi` öğrenci; `soru_cevap_fotografi`, `soru_ses` öğretmen/yönetici/sahip; `soru_cizim` öğrenci ve personel; `odev_eki` personel; `kurum_logosu` sahip/yönetici; `avatar` herkes; `fatura_pdf` istemciden yüklenemez (403 `dosya_turu_yetkisi_yok`).

```mermaid
erDiagram
  dosyalar ||--o{ kucuk_resimler : "varyant"
  dosyalar }o--|| saklama_politikalari : "tur"
  kurum_kopyalari ||--o{ dosyalar : "kota"
  kurum_kotalari ||--|| kurum_kopyalari : "kullanim"
```

## `medya.saklama_politikalari`

Dosya türü kuralları. Profil: `G`. RLS: hayır. Tohum verisi.

| Sütun | Tip | Null | Varsayılan | Not |
| --- | --- | --- | --- | --- |
| `tur` | text | hayır | | `UNIQUE`. `dosyalar.tur` değerleri (aşağıda) |
| `izinli_mime` | text[] | hayır | | Ör. `{image/jpeg,image/png,image/webp}` (HEIC/SVG yok) |
| `azami_boyut_bayt` | bigint | hayır | | Fotoğraf 10 MB (logo/avatar 5 MB), ses 5 MB, PDF 20 MB |
| `azami_sure_sn` | int | evet | | Yalnız ses: 180 sn (şartname "3 dk") |
| `varsayilan_saklama_gun` | int | evet | | Bağlandıktan sonra silinme süresi. NULL = süresiz |
| `yetim_saat` | int | hayır | 48 | Bağlanmamış dosya silme süresi |
| `kucuk_resim` | boolean | hayır | true | Küçük resim üretilsin mi |
| `ek_islem` | text | evet | | `gorsel_yeniden_kodla`, `ses_sure_cikar`, `yok` |

Tür değerleri (CHECK, `dosyalar.tur` ile aynı): `soru_fotografi`, `soru_cevap_fotografi`, `soru_cizim`, `soru_ses`, `odev_eki`, `odev_teslim_fotografi`, `kurum_logosu`, `avatar`, `fatura_pdf`. Başlangıç saklama: `soru_*` bağlanma sonrası `NULL` ( `soru.cozuldu` olayı süreyi 30 güne ayarlar); `odev_teslim_fotografi` 365 gün; `odev_eki` 365 gün; `kurum_logosu`, `avatar` süresiz; `fatura_pdf` 3650 gün (10 yıl, vergi mevzuatı için saklama yükümlülüğü teyit edilmeli, bkz. Q7).

## `medya.dosyalar`

Dosya kaydı.

Profil: `KS`. RLS: evet.

| Sütun | Tip | Null | Varsayılan | Not |
| --- | --- | --- | --- | --- |
| `sahip_kullanici_id` | uuid | hayır | | Yükleyen kullanıcı (JWT `sub`) |
| `sahip_uyelik_id` | uuid | hayır | | Yükleyen üyelik (JWT `uyelik_id`) |
| `tur` | text | hayır | | FK `saklama_politikalari(tur)` |
| `mime_tipi` | text | hayır | | Yükleme anında bildirilen; işleme sonrası saklanan (yeniden kodlanmış) içeriğin gerçek türü |
| `bildirilen_boyut_bayt` | bigint | hayır | | İstemci beyanı |
| `boyut_bayt` | bigint | evet | | `tamam`da `HEAD` ile doğrulanan boyut (`bildirilen` ile eşit olmalı); işleme sonrası saklanan (yeniden kodlanmış) nesnenin boyutu |
| `bildirilen_sha256` | bytea | hayır | | İstemcinin bildirdiği özet (işleme doğrular) |
| `sha256` | bytea | evet | | Yüklenen özgün baytların doğrulanan özeti (denetim için silinse de kalır) |
| `depolama_anahtari` | text | evet | | UNIQUE; silinince NULL |
| `kova` | text | hayır | `'medya-ozel'` | |
| `durum` | text | hayır | `'yukleme_bekliyor'` | CHECK `IN ('yukleme_bekliyor','yuklendi','isleniyor','hazir','islenemedi','silindi')` |
| `hata_kodu` | text | evet | | `mime_uyusmazligi`, `boyut_uyusmazligi`, `bozuk_dosya`, `sure_asimi`, `yukleme_zaman_asimi` (olay enum'u `yukleme_zaman_asimi` dahil aynı kümedir; `sure_asimi` olayda da `sure_asimi` yayımlanır) |
| `genislik`, `yukseklik` | int | evet | | Görseller |
| `sure_sn` | int | evet | | Ses |
| `istemci_anahtari` | uuid | hayır | | Yükleme idempotency |
| `yukleme_son_at` | timestamptz | hayır | | Presigned URL geçerlilik sonu (`created_at + 15 dk`) |
| `tamamlandi_at` | timestamptz | evet | | İstemci `tamam` dediği an |
| `hazir_at` | timestamptz | evet | | |
| `baglandi` | boolean | hayır | false | `ortak.dosya.baglandi.v1` ile true olur |
| `bagli_tur` | text | evet | | `odev_teslimi`, `odev_eki`, `soru`, `soru_mesaji`, `kurum`, `kullanici`, `fatura` |
| `bagli_id` | uuid | evet | | |
| `baglandi_at` | timestamptz | evet | | |
| `silinecek_at` | timestamptz | evet | | Silme zamanı (retention / `delete_after`). NULL = silme planlı değil. |
| `silme_nedeni` | text | evet | | `yetim`, `saklama_suresi`, `soru_cozuldu`, `kullanici_silindi`, `kurum_kapandi`, `birakildi`, `yukleme_zaman_asimi` |
| `silindi_at` | timestamptz | evet | | |
| `kota_bayt` | bigint | hayır | 0 | Dosyanın kota hesabına şu anki katkısı: rezervasyon (`bildirilen_boyut_bayt`) → hazır olunca asıl + küçük resimler; silinince 0. Gece denetimi bunun toplamını kullanır. |
| `isleme_basladi_at`, `isleme_deneme`, `sonraki_isleme_at` | timestamptz, int, timestamptz | | | İşleme kuyruğu: takılan satır geri alma, yeniden deneme sayacı ve gecikmesi |
| `silme_hata_sayisi` | int | hayır | 0 | Depolamadan silme hatası sayacı |
| `saklama_olay_at` | timestamptz | evet | | Dosyaya son uygulanan soru saklama olayının (`soru.cozuldu` / `soru.yeniden_acildi`) `occurredAt`i. Daha eski olay (ters sıra / yeniden teslim) durumu ezmez; `<=` ile uygulanır. |

Kısıtlar:
- `UNIQUE (kurum_id, sahip_kullanici_id, istemci_anahtari)`.
- `UNIQUE (depolama_anahtari) WHERE depolama_anahtari IS NOT NULL`.
- `CHECK (boyut_bayt IS NULL OR boyut_bayt > 0)`.
- `CHECK (durum <> 'hazir' OR (boyut_bayt IS NOT NULL AND sha256 IS NOT NULL AND hazir_at IS NOT NULL))`.
- `CHECK ((durum = 'silindi') = (silindi_at IS NOT NULL))`.
- `CHECK (durum = 'silindi' OR depolama_anahtari IS NOT NULL OR durum = 'yukleme_bekliyor')`.
- `CHECK (baglandi = (bagli_id IS NOT NULL))`.

Durum makinesi: `yukleme_bekliyor` -> `yuklendi` -> `isleniyor` -> `hazir` | `islenemedi`; herhangi bir durumdan -> `silindi`. `yukleme_bekliyor` dosyası `yukleme_son_at + 1 saat` geçince `silinecek_at = now()` ile işaretlenir (`yukleme_zaman_asimi`).

**Silinecek_at kuralları** (hesaplandığı yerler):
1. Yetim: `hazir_at + yetim_saat` (bağlanmadıkça). `dosya.baglandi` bunu temizler (`silinecek_at = NULL` ya da politikanın saklama süresi).
2. Saklama süresi: `baglandi_at + varsayilan_saklama_gun`.
3. `ogrenme.soru.cozuldu.v1`: olaydaki `dosya_idleri` için `silinecek_at = olay.silinecek_at` (api: `cozuldu_at + 30 gün`).
4. `ogrenme.soru.yeniden_acildi.v1`: ilgili `silinecek_at = NULL` (silinmiş olanlara dokunulmaz).
   Kural 3-4 sıra bağımsızdır: dosyanın `saklama_olay_at`inden eski `occurredAt`li olay yok sayılır. `kullanici_silindi`, `kurum_kapandi`, `birakildi`, `yukleme_zaman_asimi` nedenli daha güçlü planlar `soru.cozuldu` ile ezilmez; yeniden açılma yalnız `soru_cozuldu` nedenli planı geri alır.
5. `ortak.dosya.birakildi.v1`: `hemen_sil` ise `now()`, değilse yetim kuralı.
6. `hesap.kullanici.silindi.v1`: kullanıcının tüm dosyaları `now()` (`avatar` ve kullanıcı içeriği; `fatura_pdf` hariç, kurum varlığıdır).
7. Kurum `kapali`: kurumun dosyaları 90 gün sonra.

Silme işi (worker, `medya_sistem`): 5 dakikada bir; aynı turda yükleme zaman aşımı, yetim kuralı (hazır, bağlanmamış ve planı olmayan dosyaya `hazir_at + yetim_saat`) ve takılan işleme geri alma da çalışır. Günlük `processed_events` temizliği (30 gün) ve gece kota denetimi (İstanbul 03:00) ayrı zamanlanır. `WHERE silinecek_at <= now() AND durum <> 'silindi' ORDER BY silinecek_at LIMIT 200 FOR UPDATE SKIP LOCKED`; her dosya için nesne + küçük resimler depolamadan silinir (nesne yoksa hata sayılmaz), sonra `durum='silindi'`, `depolama_anahtari=NULL`, kota düşülür, `medya.dosya.silindi.v1` yayımlanır. Silme başarısızsa satır `silinecek_at` yarın olarak ertelenir ve hata sayacı artar. Nesne silinirken `.yukleme` (ham yükleme) ve küçük resim nesneleri de silinir. `islenemedi` dosyalar `silinecek_at = now()` ile (neden `yetim`) bir sonraki turda silinir.

İndeks: `(kurum_id, sahip_kullanici_id, created_at DESC)`, `(silinecek_at) WHERE durum <> 'silindi' AND silinecek_at IS NOT NULL`, `(durum, yukleme_son_at) WHERE durum = 'yukleme_bekliyor'`, `(kurum_id, bagli_tur, bagli_id)`, `(durum, hazir_at) WHERE baglandi = false AND durum = 'hazir'`.
Olaylar: `medya.dosya.hazir.v1`, `medya.dosya.islenemedi.v1`, `medya.dosya.silindi.v1`.

## `medya.kucuk_resimler`

Üretilen küçük resim varyantları.

Profil: `K`. RLS: evet.

| Sütun | Tip | Null | Varsayılan | Not |
| --- | --- | --- | --- | --- |
| `dosya_id` | uuid | hayır | | Bileşik FK `dosyalar` ON DELETE CASCADE |
| `varyant` | text | hayır | | CHECK `IN ('kucuk','orta')`. `kucuk` 256 px, `orta` 1024 px (uzun kenar) |
| `depolama_anahtari` | text | hayır | | `{asil_anahtar}.{varyant}.webp` |
| `genislik`, `yukseklik` | int | hayır | | |
| `boyut_bayt` | int | hayır | | |
| `mime_tipi` | text | hayır | `'image/webp'` | |

Kısıtlar: `UNIQUE (dosya_id, varyant)`, `UNIQUE (depolama_anahtari)`. Ana dosya silinince fiziksel nesneler silme işinde silinir ve satırlar `DELETE` edilir (yedek veri değildir). İndeks: `(kurum_id, dosya_id)`. Olaylar: yok.

## `medya.kurum_kotalari`

Kurum başına depolama kullanımı (türetilmiş). Gece denetimi `dosyalar.kota_bayt` toplamıyla karşılaştırır, farkı loglar (`error`) ve düzeltir.

Profil: `KS` (kurum başına tek satır). RLS: evet. Sütunlar: `kullanilan_bayt bigint NOT NULL DEFAULT 0`, `dosya_sayisi int NOT NULL DEFAULT 0`. `UNIQUE (kurum_id)`. Artırım: yükleme izni verilirken **rezervasyon** (`bildirilen_boyut_bayt` eklenir); koşul `kullanilan_bayt + :boyut <= kurum_kopyalari.medya_kota_bayt`, aksi halde `413 kota_asildi`. Yükleme zaman aşımı ve silme rezervasyonu/kullanımı düşürür. Gece işi `SUM(boyut_bayt)` ile denetler. Olaylar: yok.

## Yerel okuma kopyaları

| Tablo | Kaynak olay | Sütunlar | Neden gerekli |
| --- | --- | --- | --- |
| `kurum_kopyalari` | `hesap.kurum.degisti.v1`, `abonelik.abonelik.degisti.v1` | `kurum_id` PK, `durum`, `plan_kodu`, `abonelik_durumu`, `medya_kota_bayt`, `surum`, `abonelik_surumu`, `son_olay_at` | Kota, askıdaki/kapalı kurumda yeni yüklemeyi reddetme |

Olay zarfında özne sürümü olmadığından sıralama `son_olay_at` (olay `occurredAt`) ile yapılır: daha eski olay kopyayı geri almaz. Kopya yoksa kurum aktif ve kota `MEDYA_VARSAYILAN_KOTA_BAYT` (varsayılan 5 GiB) sayılır; `askida`/`kapali` kurumda yeni yükleme 403 `kurum_askida` olur. `kapali` olayı kurumun dosyalarını `occurredAt + 90 gün`e planlar (neden `kurum_kapandi`); kurum yeniden açılırsa bu plan geri alınır.

Üyelik veya grup kopyası **tutulmaz**: yükleme yetkisi JWT rolünden (`ogrenci`, `ogretmen`...) ve `tur` kuralından belirlenir (ör. `kurum_logosu` yalnızca `yonetici`/`sahip`), okuma yetkisi `api`dadır. Kopya RLS: evet (`kurum_id`).

## Tüketilen olaylar

| Olay | İşleme | Tüketici adı |
| --- | --- | --- |
| `ortak.dosya.baglandi.v1` | `baglandi=true`, `bagli_tur/id`, `silinecek_at` politikaya göre | `medya.baglama` |
| `ortak.dosya.birakildi.v1` | Bağlantıyı çöz, yetim/silme kuralı | `medya.baglama` |
| `ogrenme.soru.cozuldu.v1` | `silinecek_at = olay.silinecek_at` (`silme_nedeni='soru_cozuldu'`) | `medya.saklama` |
| `ogrenme.soru.yeniden_acildi.v1` | `silinecek_at = NULL` (yalnız `soru_cozuldu` nedenli plan) | `medya.saklama` |
| `hesap.kullanici.silindi.v1` | Kullanıcı dosyalarını sil | `medya.saklama` (**henüz bağlı değil**: sözleşme `contracts`ta yok; olay kullanıcı düzeyinde, zarf `kurumId` zorunlu) |
| `hesap.kurum.degisti.v1` | `kurum_kopyalari` upsert; `kapali` ise silme planı | `medya.kopya` |
| `abonelik.abonelik.degisti.v1` | Kota ve durum güncelle | `medya.kopya` |

`ortak.dosya.baglandi.v1` dosya henüz `hazir` değilken gelirse (yarış: dosya `isleniyor`), bağlama bilgisi yine yazılır (`baglandi` durumdan bağımsız).

## Üretilen olaylar

`medya.dosya.hazir.v1`, `medya.dosya.islenemedi.v1`, `medya.dosya.silindi.v1`. Tüketici: `api` (`ortak.medya_dosya_kopyalari`).

## HTTP uçları (özet)

| Uç | Kimlik | Açıklama |
| --- | --- | --- |
| `POST /v1/dosyalar` | kullanıcı JWT | Yükleme izni (201 yeni, 200 aynı `istemci_anahtari`); 15 dk presigned PUT, `Content-Type` ve `Content-Length` imzada |
| `POST /v1/dosyalar/{id}/tamam` | kullanıcı JWT (sahip) | HEAD doğrulama, `yuklendi`, kuyruk (202); idempotent |
| `GET /v1/dosyalar/{id}` | kullanıcı JWT (sahip) | Durum; `hazir` ise 10 dk presigned GET (asıl, küçük, orta) |
| `POST /ic/okuma-adresleri` | servis JWT (`aud=medya`, `scope=medya.okuma`) | `contracts/medya/ic-api.ts` |

Hata kodları: 403 `dosya_turu_yetkisi_yok`, 403 `kurum_askida`, 415 `mime_desteklenmiyor`, 413 `dosya_cok_buyuk`, 413 `kota_asildi`, 409 `istemci_anahtari_cakisti`, 409 `yukleme_suresi_doldu`, 409 `yukleme_bulunamadi` (PUT bitince `tamam` yeniden denenir), 422 `boyut_uyusmazligi` / `mime_uyusmazligi`, 503 `depolama_yapilandirilmamis`.

## Açık sorular (bu servis)

- Q7: `fatura_pdf` saklama süresi yasal gerekliliklerle teyit edilmeli (varsayım 10 yıl).
- Q8: Nesne depolama sağlayıcısı ve CDN kullanılmaması (Türkiye içi) performans etkisi.
