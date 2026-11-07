# 0001. Pragmatik mikroservis: 4 servis ve sınırları

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Ürün; bireysel öğretmenlere, koçluk ekiplerine ve kurumlara hizmet veren bir eğitim operasyon platformudur. Faz 1 kapsamı geniştir: kimlik, takvim, yoklama, finans, ödev, plan, deneme, "soru sor", oyunlaştırma, bildirim, medya ve abonelik.

Bu kapsamdaki parçaların yük ve tutarlılık profilleri farklıdır:

- Yoklama ile kredi düşümü aynı anda doğru olmak zorundadır. Biri olmadan diğeri kalırsa öğrenci yanlış faturalanır. Bu iş atomik bir veritabanı işlemi ister.
- XP, seri ve rozet hesapları olaylardan türetilir. Gecikmesi kabul edilebilir, ama sınav dönemlerinde yazma yükü ani artar.
- Bildirim gönderimi dış sağlayıcılara (SMS, e-posta, push) bağlıdır. Sağlayıcı hataları ve yavaşlığı çekirdek işlemleri etkilememelidir.
- Medya yüklemeleri büyük ve CPU yoğun (küçük resim üretimi) işlerdir. Çekirdek API sürecini bloke etmemelidir.

Ekip küçüktür. Her servis ayrı veritabanı, ayrı dağıtım hattı ve ayrı nöbet yükü getirir.

## Karar

Dört servis kurulur. Her servisin kendi PostgreSQL veritabanı ve veritabanı kullanıcısı vardır. Hiçbir servis başka servisin veritabanına bağlanmaz.

| Servis | Sorumluluk | Veritabanı |
| --- | --- | --- |
| `api` | Çekirdek iş alanı. İçeride modüler monolit: `hesap`, `ders`, `finans`, `ogrenme`, `abonelik`. | `api` |
| `motivasyon` | XP, seviye, seri, rozet, karakter durumu, odak oturumları. Yalnızca olaylarla beslenir. | `motivasyon` |
| `bildirim` | Cihazlar, tercihler, gelen kutusu, duyuru dağıtımı, e-posta/SMS/push gönderim günlüğü. | `bildirim` |
| `medya` | Dosya kayıtları, yükleme izinleri, işleme, küçük resimler, saklama ve silme. | `medya` |

Sınır kuralları:

1. `api` içinde her modül ayrı PostgreSQL şemasına sahiptir. Modüller birbirinin tablosuna yazmaz. Başka modülün verisi, o modülün dışa açtığı TypeScript arayüzü üzerinden okunur.
2. Yoklama ve kredi/ücret düşümü `ders` ve `finans` modüllerinde, aynı veritabanı işleminde yapılır. Bu işlem servis sınırını geçmez.
3. Servisler arası iletişim varsayılan olarak asenkron olaylardır (bkz. [0002](0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)). İki istisna vardır: gizli içerik taşıyan SMS (OTP, davet bağlantısı) `bildirim` servisinin iç uç noktasına senkron gider, ve dosya okuma adresi üretimi `api` tarafından `medya` iç uç noktasından istenir.
4. Bir servis, ihtiyaç duyduğu üyelik/grup verisini olaylardan beslenen yerel okuma kopyalarında tutar. Kopya tablolar `*_kopyalari` adını taşır ve yalnızca olay tüketicisi yazar.
5. Yeni bir servis, ancak aşağıdaki üç koşuldan en az ikisi sağlandığında açılır: ayrı ölçekleme profili, ayrı hata bağımsızlığı ihtiyacı, çekirdek işlemlerle atomik tutarlılık gerektirmemesi.

## Sonuçlar

Olumlu:

- Çekirdek tutarlılık (yoklama, kredi, bakiye) tek veritabanı işleminde kalır. Dağıtık işlem, saga veya telafi mantığı gerekmez.
- Bildirim sağlayıcısı çökerse yoklama, ödev ve takvim çalışmaya devam eder. Olaylar JetStream'de birikir.
- Medya işleme (görüntü) ayrı ölçeklenir ve çekirdek sürecin bellek/CPU bütçesini etkilemez.
- `motivasyon` baştan sona yeniden hesaplanabilir. Olay akışından yeniden oynatma mümkündür.

Olumsuz:

- Dört dağıtım hattı, dört migrasyon akışı ve bir mesaj altyapısı (NATS JetStream) işletilir.
- Yerel okuma kopyaları nihai tutarlıdır. Yeni üyelik oluştuktan hemen sonra `bildirim` kopyası henüz hazır olmayabilir. Tüketiciler bunu yeniden deneme ile karşılar (bkz. 0002, DLQ).
- Servisler arası sorgu (ör. "öğrencinin XP'si ve ödevleri tek ekranda") istemci tarafında birleştirilir. Birleştirme için backend-for-frontend katmanı Faz 1'de kurulmaz.
- `api` büyüdükçe modül sınırlarının disiplini kod incelemesine ve bağımlılık lint kuralına (`eslint-plugin-boundaries`) bağlıdır.

## Değerlendirilen alternatifler

**Tek monolit (tek veritabanı, tek süreç).** En basit işletim modelidir. Reddedildi çünkü bildirim ve medya iş yükleri çekirdek süreçle kaynak paylaşır. SMS sağlayıcısı yavaşladığında ya da görüntü işleme CPU'yu doldurduğunda yoklama gibi kritik yazmalar etkilenir. `motivasyon` yazma yükü de çekirdek veritabanını paylaşırdı. Dört servisli tasarımın ek maliyeti, bu üç yük için kabul edilebilir bulundu.

**Dokuz servis (hesap, ders, finans, ogrenme, abonelik, motivasyon, bildirim, medya, platform).** Modül sınırlarına birebir uyar. Reddedildi çünkü yoklama + kredi düşümü `ders` ile `finans` arasında dağıtık işleme dönüşür. `hesap` verisi (üyelik, rol, grup) her isteğin yetkilendirmesinde gerekir. Ağ üzerinden okumak gecikme ve hata zinciri ekler. Küçük ekip için dokuz hat işletilemez.

**İki servis (api + yardımcı işçiler).** Bildirim ve medyayı `api`ya gömer, yalnızca arka plan işlerini ayırır. Reddedildi çünkü `bildirim` ve `medya` kendi verisine ve hata alanına sahiptir. Veritabanı ayrımı, ileride bağımsız ölçeklemeyi ve sağlayıcı değişikliğini ucuzlatır.

**Paylaşılan veritabanı, ayrı süreçler.** Reddedildi çünkü servisler arası şema bağımlılığı oluşur ve satır düzeyi güvenlik rolleri servis başına ayrıştırılamaz.
