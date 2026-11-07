# 0006. Adlandırma ve dil kuralları

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Ürün Türkiye pazarı içindir ve alan terimleri Türkçedir (yoklama, ödev, kademe, tahsilat). Kod tabanı TypeScript, SQL ve JSON içerir. Türkçe karakterler (`ç ğ ı ö ş ü`) tanımlayıcılarda araç uyumsuzluğu, sıralama (collation) ve URL sorunu yaratır. Tutarsız adlandırma (bir yerde `student`, başka yerde `ogrenci`) okunabilirliği bozar.

## Karar

### Üç katman

| Katman | Dil | Örnek |
| --- | --- | --- |
| Alan terimleri (varlıklar, durumlar, olaylar, izinler) | Türkçe, **ASCII** (`ç->c, ğ->g, ı->i, ö->o, ş->s, ü->u`), `snake_case` | `ogrenci`, `yoklama`, `odev`, `tahsilat`, `gelmedi` |
| Teknik tanımlayıcılar (altyapı kavramları) | İngilizce | `id`, `created_at`, `idempotency`, `outbox`, `jwt`, `hash`, `status_code` |
| Kullanıcıya görünen metin (UI, e-posta, SMS, push, hata iletisi) | Türkçe, tam Unicode | "Ödevini teslim ettin." |

### Kurallar

1. **Tanımlayıcılarda Türkçe karakter yok.** Tablo, sütun, enum değeri, olay adı, izin anahtarı, dosya adı, URL yolu, JSON alanı, TypeScript tanımlayıcısı yalnızca `[a-z0-9_]` (TS tipleri/sınıfları `PascalCase`, değişkenler `camelCase`).
2. **İkinci dil karışımı:** Bir kavram için tek ad kullanılır. Alan kavramı Türkçe adıyla, teknik kavram İngilizce adıyla geçer. Aynı kavramın iki adı olmaz (`student` + `ogrenci` yasak). Sözlük `docs/schema/README.md` içinde ve `packages/sozluk` altında tutulur.
3. **Veritabanı:**
   - Şema adı: modül adı (`hesap`, `ders`, `finans`, `ogrenme`, `abonelik`, `motivasyon`, `bildirim`, `medya`, ortak yardımcılar için `ortak`).
   - Tablo adı: çoğul, Türkçe alan terimi (`dersler`, `yoklamalar`, `kredi_hareketleri`). Bağlantı tablosu: iki varlık adı (`grup_uyeleri`). Okuma kopyası: `*_kopyalari`.
   - Ortak sütunlar İngilizce sabittir: `id`, `kurum_id`, `created_at`, `updated_at`, `created_by`.
   - Alan sütunları Türkçe: `baslangic_at`, `durum`, `tutar_kurus`.
   - Sonekler: zaman damgası `_at`, tarih `_tarihi`, saat `_saati`, tutar `_kurus`, sayı `_sayisi`, süre `_dk`/`_sn`, yabancı anahtar `{tekil_ad}_id`, kullanıcı rolüne göre ad (`ogrenci_id`, `ogretmen_id`; bunlar `hesap.uyelikler.id`'ye işaret eder).
   - Enum: PostgreSQL `enum` tipi yerine `text` + `CHECK`. Değerler Türkçe ASCII küçük harf (`geldi`, `gelmedi`, `izinli`, `gec`).
4. **Olaylar:** `alan.varlik.fiil` biçimi, Türkçe ASCII, fiil geçmiş zaman (`kaydedildi`, `teslim_edildi`, `iptal_edildi`) ya da anlık görüntü için `degisti`. Sürüm soneki `.v1`. Yük alanları `snake_case`.
5. **İzin anahtarları:** `{kaynak}.{eylem}`: `yoklama.yaz`, `odev.incele`. Küçük harf, nokta ayırıcı.
6. **API:**
   - Yol: çoğul Türkçe, `kebab-case` ASCII (`/v1/yoklamalar`, `/v1/kredi-hareketleri`). Sürüm yolda: `/v1`.
   - JSON alanları `snake_case`, veritabanı sütun adıyla aynı olur (dönüşüm katmanı yok).
   - HTTP, kimlik ve doğrulama hata kodları İngilizce teknik (`validation_failed`, `unauthorized`, `rate_limited`). Alan hata kodları Türkçe ASCII (`kota_asildi`, `riza_gerekli`, `modul_kapali`, `izin_yok`, `abonelik_gerekli`). Kod makine içindir, kullanıcıya gösterilen metin istemcide çevrilir.
   - Ortak başlıklar İngilizce: `Idempotency-Key`, `x-istek-id`.
7. **Kod:**
   - Dosya/dizin: `kebab-case` (`yoklama-servisi.ts`). Paketler: `@kopru/olaylar`, `@kopru/izinler`, `@kopru/sozluk`.
   - Alan sınıfları, tipleri ve fonksiyonları Türkçe alan terimiyle adlandırılır: `YoklamaKaydi`, `KrediHareketi`, `yoklamaKaydet`, `krediDus`. Çerçeve ve altyapı adları İngilizce kalır: `withTenant`, `OdevRepository`, `handle`.
   - Zod şemaları `...Sema` ile biter (`YoklamaKaydetSema`). Drizzle tablo nesneleri tablo adıyla aynıdır camelCase (`yoklamalar`, `krediHareketleri`).
8. **Yorumlar ve dokümanlar:** Türkçe. Kod içi yorumlar Türkçe ya da İngilizce olabilir, dosya içinde tutarlı olmalıdır. ADR, şema ve olay dokümanları Türkçe; teknik terimler (outbox, RLS, JWT) İngilizce kalabilir.
9. **Kullanıcı metinleri:** Kodda sabit metin yok. `tr` i18n kataloğunda anahtarlar İngilizce teknik + Türkçe alan: `yoklama.durum.geldi`, `hata.kota_asildi`. Metinler Unicode (Türkçe karakterli). İlk dil `tr`; katalog yapısı diğer dillere izin verir, Faz 1'de yoktur.
10. **Büyük/küçük harf ve sıralama:** Arama ve ad karşılaştırması Türkçe `İ/ı` farkını hesaba katar. Veritabanında `tr-TR-x-icu` collation yalnızca görüntüleme sıralamasında, kimlik/eşsizlik alanlarında `citext`/ASCII normalleştirilmiş sütunlar kullanılır. Kullanıcıya görünen ad ayrı sütundadır (Unicode), arama için normalleştirilmiş `*_arama` sütunu tutulur.

### Sözlük (kısaltılmış)

`kurum` (organizasyon/kiracı), `sube`, `kademe` (sınıf seviyesi), `grup`, `uyelik`, `sahip`, `yonetici`, `ogretmen`, `ogrenci`, `veli`, `brans` (ders branşı), `konu`, `ders` (oturum), `yoklama`, `geri_bildirim`, `kredi`, `paket`, `ucret`, `tahsilat`, `bakiye`, `odev`, `deneme`, `soru`, `duyuru`, `bildirim`, `cihaz`, `abonelik`, `fatura`, `dosya`, `rozet`, `seri`, `seviye`. Tam sözlük her şema dokümanının başındaki kavramlar bölümündedir.

## Sonuçlar

Olumlu:

- Araç ve URL uyumsuzluğu yok. Arama (`grep`) tek yazımla çalışır.
- Alan terimi her katmanda aynıdır: veritabanı, olay, API, kod. Yeni geliştirici sözlüğü bir kez öğrenir.

Olumsuz:

- ASCII Türkçe ilk bakışta okunmayabilir (`ogretmen`, `uyelik`). Sözlük gerekir.
- Dış kitaplıklar İngilizce adlar üretir (Better Auth `user`, `session`). Eşleme katmanı gerekir (bkz. [0004](0004-kimlik-dogrulama-ve-yetkilendirme.md)).
- Karma dil (Türkçe alan + İngilizce teknik) kimi isimlerde (`yoklama_istekleri.istek_id`) sınır belirsizliği yaratır. Sözlükte karara bağlanır.

## Değerlendirilen alternatifler

**Her şey İngilizce (`attendance`, `homework`).** Uluslararası okunur, ama ürün ve alan uzmanları (kurum yöneticileri) Türkçe konuşur. Terim çevirisi hata kaynağıdır (ör. `kademe` -> `grade level`/`stage`/`level` karışır). Reddedildi.

**Türkçe karakterli tanımlayıcılar (`öğrenci`).** PostgreSQL tırnaklı tanımlayıcı, URL kodlama ve araç sorunları yaratır. Reddedildi.

**PostgreSQL `enum` tipleri.** Değer eklemek/çıkarmak migrasyon zorluğu yaratır, olay yükleriyle eşleşme zordur. `text + CHECK` seçildi.
