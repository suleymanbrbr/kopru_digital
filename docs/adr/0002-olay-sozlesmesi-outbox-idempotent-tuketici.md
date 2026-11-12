# 0002. Olay sözleşmesi, outbox ve idempotent tüketiciler

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Servisler yalnızca olaylarla haberleşir ([0001](0001-pragmatik-mikroservis.md)). İş verisini yazan işlem ile olayı yayımlama işlemi tek atomik adım olmak zorundadır. Aksi halde veri yazılır ama olay kaybolur (ya da tersi). NATS JetStream en az bir kez (at-least-once) teslim eder. Tüketiciler tekrar teslimi ve sıra bozulmasını tolere etmelidir.

## Karar

### Transactional outbox

Her servis veritabanında `ortak.outbox` tablosu vardır (DDL: [schema/README.md](../schema/README.md#outbox-ve-processed_events)). İş verisini yazan işlem, aynı işlemde outbox satırı ekler. Tek bir "relay" süreci (`pg_try_advisory_lock` ile tek örnek) bekleyen satırları `sira` sırasıyla `SELECT ... FOR UPDATE SKIP LOCKED` ile okur, JetStream'e yayımlar ve `yayin_zamani` alanını doldurur. Yayımlama `Nats-Msg-Id = olay.id` ile yapılır. JetStream çift yayımı 2 dakikalık pencerede eler. Yayımlanmış satırlar 7 gün sonra silinir.

Doğrudan NATS'a yayımlamak yasaktır. İş kodu yalnızca `outbox.ekle(tx, olay)` çağırır.

### Zarf (envelope)

Tüm olaylar aynı JSON zarfıyla taşınır. Zarf Zod şemasıyla `packages/olaylar` içinde tanımlanır.

| Alan | Tip | Açıklama |
| --- | --- | --- |
| `id` | UUIDv7 | Olay kimliği. Tüketici tekilleştirme anahtarı. |
| `tur` | string | `alan.varlik.fiil`, ör. `ders.yoklama.kaydedildi`. |
| `surum` | int | Yük şeması sürümü (`1`, `2`, ...). |
| `uretici` | string | `api`, `motivasyon`, `bildirim`, `medya`. |
| `kurum_id` | UUID veya null | Kiracı. Kullanıcı düzeyi olaylarda null. |
| `olusma_zamani` | RFC 3339 UTC | İş olayının gerçekleştiği an (outbox satırının `olusma_zamani`). |
| `ozne` | `{tur, id}` | Olayın ilgili olduğu kayıt (ör. `{tur:"yoklama", id:"..."}`). |
| `ozne_surumu` | int veya null | Öznenin satır `surum` değeri. Sıralama savunması için. |
| `korelasyon_id` | UUIDv7 | Aynı kullanıcı isteğinden doğan olayları bağlar. HTTP `x-istek-id` ile aynıdır. |
| `neden_id` | UUIDv7 veya null | Bu olaya yol açan olayın `id`si (zincirleme tüketicilerde). |
| `aktor` | `{kullanici_id, uyelik_id, rol, taklit}` veya null | Eylemi yapan. Sistem işlerinde null. |
| `veri` | object | Sürüme özgü yük. |

NATS konusu (subject): `{uretici}.{tur}.v{surum}`, ör. `api.ders.yoklama.kaydedildi.v1`. Her üretici için bir stream vardır: `API`, `MOTIVASYON`, `BILDIRIM`, `MEDYA` (konu filtresi `{uretici}.>`). Stream ayarları: `retention=limits`, `max_age=7d`, `storage=file`, `duplicate_window=2m`, `replicas=3` (üretimde).

### Olay türleri

- **Olgu olayları** geçmişte olmuş tek bir şeyi anlatır: `ders.yoklama.kaydedildi`, `ogrenme.odev.teslim_edildi`.
- **Durum anlık görüntüsü olayları** `*.degisti` adını taşır ve ilgili kaydın tam güncel durumunu içerir (`hesap.grup.degisti`). Yerel okuma kopyalarını besler. Tüketici upsert yapar. Silme ayrı olay değildir. Bitiş/arşiv alanları durumda taşınır.

### Sürümleme kuralları

1. Aynı sürüm içinde yalnızca geriye uyumlu değişiklik yapılır: yeni isteğe bağlı alan eklemek. Alan silmek, adını, tipini ya da anlamını değiştirmek geriye uyumsuzdur.
2. Geriye uyumsuz değişiklik yeni sürüm açar (`v2`). Üretici geçiş süresince hem `v1` hem `v2` yayımlar (aynı outbox işleminde iki satır). Tüm tüketiciler `v2`ye geçtikten sonra `v1` yayını kaldırılır. Geçiş en az iki dağıtım döngüsü sürer.
3. Tüketiciler bilinmeyen alanları yok sayar (Zod `.passthrough()` değil, `.strip()`).
4. Tüketici bilmediği `surum` ile karşılaşırsa mesajı `term` ile reddeder ve uyarı üretir. Sessizce atlamaz.
5. Katalog [schema/olaylar.md](../schema/olaylar.md) tek doğruluk kaynağıdır. Yük değişikliği aynı PR'da katalogu günceller.
6. Gizli içerik (OTP kodu, davet belirteci, parola) ve iletişim bilgisi (telefon, e-posta) olay yüküne girmez. İletişim bilgisine ihtiyaç duyan tüketici (`bildirim`) bunu gönderim anında üreticiden senkron alır (istisna, aşağıda).

### Idempotent tüketiciler

Her tüketici servis veritabanında `ortak.processed_events (tuketici, olay_id)` tablosu tutar. İşleme akışı:

1. Mesaj gelir. Tüketici tek veritabanı işlemi açar.
2. `INSERT INTO ortak.processed_events ... ON CONFLICT DO NOTHING`. Etkilenen satır 0 ise mesaj daha önce işlenmiştir, işlem kapatılır ve `ack` verilir.
3. İş mantığı aynı işlemde çalışır. Yan etki yaratan dış çağrılar (SMS gönderimi vb.) işlemin dışında, `gonderimler` tablosundaki doğal anahtarla (ör. `bildirim_id + kanal`) tekilleştirilir.
4. İşlem commit olur, ardından `ack`.

`tuketici` değeri `{servis}.{amac}` biçimindedir (ör. `motivasyon.xp`). Aynı servisteki iki ayrı amaç iki ayrı durable consumer olur. Kayıtlar 30 gün saklanır (stream `max_age` 7 günden uzundur, böylece yeniden oynatma çift işleme yol açmaz).

### Sıra varsayımları

- JetStream, tek stream içinde yayın sırasını korur. Relay satırları `sira` sırasıyla yayımlar. Ancak eşzamanlı işlemlerde daha büyük `sira` önce commit olabilir. Dolayısıyla **farklı özneler arasında sıra garantisi yoktur**.
- **Aynı özne için** yazmalar satır kilidiyle serileşir ve `ozne_surumu` artar. Tüketici, kendi kopyasında `surum >= gelen ozne_surumu` ise `*.degisti` olayını yok sayar (eski olay).
- Yeniden teslim (`nak`, zaman aşımı) sırayı bozar. Bu yüzden tüketiciler değişmeli (commutative) yazar: defter satırı ekleme, `ON CONFLICT` upsert, `ozne_surumu` karşılaştırması. "Bir önceki olay gelmiş olmalı" varsayımı yasaktır.
- Bir olay, kopyada henüz var olmayan bir öğeye (ör. üyelik) başvuruyorsa tüketici `nak` ile gecikmeli (`5s, 30s, 2m, 10m`) yeniden dener.

### Teslim, yeniden deneme ve DLQ

- Durable pull consumer, `ack_policy=explicit`, `ack_wait=30s`, `max_deliver=8`, `backoff=[1s, 5s, 30s, 2m, 10m, 30m, 1h]`.
- Doğrulama hatası (Zod) ya da kalıcı iş hatası: `term` ile sonlandırılır ve DLQ'ya yazılır.
- `max_deliver` aşılınca JetStream "max deliveries" tavsiye olayı yayımlar. Bir izleyici bu olayı `DLQ` stream'ine (`dlq.{tuketici}.{konu}`, `max_age=30d`) özgün mesajla birlikte kopyalar.
- DLQ boyutu için alarm: 0'dan büyük olunca nöbetçiye bildirim. Yeniden oynatma `kopru-cli dlq replay --tuketici ...` ile yapılır. İdempotency sayesinde güvenlidir.

### İstisnalar

Senkron iç çağrı yalnızca üç durumda kullanılır ve [0001](0001-pragmatik-mikroservis.md) maddesi 3'te listelenmiştir: gizli SMS gönderimi, dosya okuma adresi ve `GET /ic/kullanicilar/:id/iletisim`. İç çağrılar servis JWT'si (`aud=bildirim` / `aud=medya`) ile yetkilendirilir.

## Uygulama notu (2026-11-11): `startConsumer` ve kiracı bağlamı

Tüketici çatısı `@kopru/service-kit` içindedir (`startConsumer`, `YenidenDene`, `KaliciHata`, `ensureDlqStream`, `islenmisOlaylariTemizle`). Servisler bunu `runWorker`'ın `setup` fonksiyonunda başlatır ve dönen `stop()`'u temizleyici olarak verir. Karar ayrıntıları:

- **Mevcut kodla uyum.** Kod bugün tek `EVENTS` stream'i (`evt.>`) ve `evt.{tur}.v{surum}` konularını kullanır; zarf alanları `defineEvent` ile tanımlıdır (`kurumId`, `type`, `version`...). Tüketici bunlara uyar (stream adı `stream` seçeneğiyle değiştirilebilir). Üretici başına ayrı stream'e geçiş (yukarıdaki "Zarf" bölümü) ayrı bir iştir; tüketici arayüzü bundan etkilenmez.
- **Consumer.** Durable pull consumer; adı `tuketici` değerinin noktasız hâli (`medya.baglama` -> `medya_baglama`). `ack_policy=explicit`, `ack_wait=30s`, `max_deliver=8`, `backoff=[1s, 5s, 30s, 2m, 10m, 30m, 1h]`. Sunucu `backoff` tanımlıyken `ack_wait` yerine `backoff[0]`'ı kullandığından (ilk teslimden 1s sonra ack gelmediyse yeniden teslim), tüketici işlem sürerken `msg.working()` ile sayacı sıfırlar; uzun işleyici ikinci kez teslim edilmez. NATS, `max_deliver` değerinin `backoff` uzunluğundan büyük olmasını şart koşar; `startConsumer` bunu başta denetler.
- **Filtre.** Her olay türü için `evt.{tur}.*` (tüm sürümler). Bilinmeyen sürüm tüketiciye ulaşır ve sessiz atlanmaz: `term` + DLQ (`bilinmeyen_konu_veya_surum`).
- **Hata sınıfları.** Zod/JSON hatası -> DLQ + `term` (`gecersiz_yuk`, `gecersiz_json`). `KaliciHata` -> işlem geri alınır, DLQ + `term`. `YenidenDene` -> işlem geri alınır, gecikmeli `nak` (varsayılan 5s, 30s, 2m, 10m; `gecikmeMs` ile ezilebilir). Diğer hatalar -> işlem geri alınır, `nak` (backoff listesi). Her durumda son teslimde (`teslimSayisi >= max_deliver`) DLQ + `term` (`teslim_siniri_asildi`). DLQ yazımı başarısız olursa mesaj kaybolmaz, `nak` edilir.
- **DLQ.** Ayrı `DLQ` stream'i (`dlq.>`, `max_age=30d`, file). Konu `dlq.{tuketici}.{özgün konu}`; gövde özgün mesajdır, başlıklar `Kopru-Tuketici`, `Kopru-Konu`, `Kopru-Neden`, `Kopru-Teslim-Sayisi`, `Kopru-Stream-Sirasi`, `Kopru-Hata`. "Max deliveries" tavsiye olayını dinleyen ayrı izleyici **yoktur**: son teslimi tüketici kendisi DLQ'ya yazar. Sınır: işlem son teslimde süreç çökmesiyle kesilirse mesaj DLQ'ya düşmez (stream'de 7 gün durur); bunun için tavsiye izleyicisi ya da DLQ alarmı ileride eklenebilir.
- **Kiracı bağlamı.** `tx`, `processed_events` satırı eklendikten sonra (tablo RLS'sizdir) varsayılan olarak olaydaki `kurumId` ile `app.kurum_id` ayarlanmış açılır (`withTenant` ile aynı `kiraciBaglaminiAyarla`). Böylece işleyici tek bir kurumun verisine RLS altında yazar; `db` uygulama rolüyle (`*_app`) bağlanmalıdır ve rol RLS'i atlayamaz. Kiracıya bağlı olmayan ya da kurumlar arası işler için `kiraci: 'yok'` verilir: bağlam ayarlanmaz ve çağıran, yalnızca gereken yetkiye sahip (gerekirse sistem rollü) bir `db` verir. api'de `withSistem` yalnız `src/sistem/**` içinde kalır; tüketici `withSistem`'i çağırmaz, `db` seçimi worker kurulumundadır. `actor` bilgisi `app.kullanici_id`'ye yazılmaz.
- **Eşzamanlılık ve kapanış.** Aynı anda en çok `esZamanli` (varsayılan 8) mesaj işlenir; sıra garantisi yoktur (yukarıdaki "Sıra varsayımları"). `stop()` yeni mesaj almayı bırakır ve çalışan işlerin commit + ack ile bitmesini bekler.
- **Temizlik.** `islenmisOlaylariTemizle(db)` 30 günden eski `processed_events` satırlarını siler (günlük bir işe bağlanır; zamanlayıcı servisin işidir).

## Uygulama notu (2026-11-12): yeniden yayımlama

Tüketici servislerin `hesap.*` yerel kopyaları yalnız `*.degisti` olaylarıyla dolar; servis sonradan devreye girerse ya da kopya bozulursa mevcut kayıtlar için olay gelmez. `pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap [--kurum <uuid>]... [--kuru] [--parca 500]` komutu bugünkü durumu `hesap.{kurum,kademe,uyelik,grup,grup_uyesi,atama,modul_ayari}.degisti` olarak outbox'a yazar (`src/sistem/olaylari-yeniden-yayimla.ts`, `withSistem` ile, parça başına bir işlem ve denetim kaydı).

- **İşaret.** Zarf sözleşmesi değişmedi: yeniden yayımlama olayları `actor = {tur:'sistem', id:'olay-yeniden-yayimla'}` ve `correlationId = 'yeniden-yayimla:<calistirma_id>'` taşır. Yük, olayı normalde üreten kodla aynıdır (kişisel veri yok).
- **Sıra ve idempotency.** Koddaki zarfta `ozne`/`ozne_surumu` alanı yoktur (yukarıdaki tablo hedef tasarımdır). Tüketiciler eski olayı olay kimliğiyle (UUIDv7, `kaynak_olay_id <`) eler. Yeniden yayımlama her olaya **yeni** kimlik verir ve satırın o anki durumunu taşır; kopya aynı duruma upsert olur. Aynı komut tekrar çalıştırılabilir (kopya değişmez, outbox'a yeni olaylar eklenir). Gerçek bir değişiklikle yarışmaya karşı satırlar `FOR SHARE` ile okunur: eşzamanlı güncelleme ya önce commit olur (güncel durum okunur) ya da kilidi bekler ve olayı bizimkinden sonra kimlik alır. `ozne_surumu` zarfa eklenirse (v2 zarf) komut `surum` sütununu da taşıyacak şekilde genişletilir.
- **Silinmiş/pasif kayıtlar.** Durum alanla taşındığı için tümü yayımlanır: kapalı/askıdaki kurum, `ayrildi` üyelik, `arsivlendi` kademe, `arsiv` grup, `bitis_tarihi` dolu grup üyeliği ve atama. Fiziksel olarak silinen tek kayıt modül ayarıdır (mirasa dönüş satırı siler); satır olmadığı için yayımlanmaz ve komut kopyalardaki eski satırı **silemez** (kopyayı sıfırlamak tüketici servisin işidir).
- **Sınır.** `hesap.kullanici.degisti`, `hesap.kullanici.silindi` (zarfta kurum yok) ve `hesap.davet.kabul_edildi` (olgu olayı) yeniden yayımlanmaz.

## Sonuçlar

Olumlu:

- Veri ve olay atomik yazılır. Olay kaybı yoktur.
- Tüketici hataları üreticiyi etkilemez. DLQ ile kayıp görünür kalır.
- `*.degisti` anlık görüntüleri, okuma kopyalarını basit upsert'e indirger ve yeniden oynatmayı güvenli kılar.

Olumsuz:

- Her veritabanında `outbox` büyür ve temizlik işi gerekir.
- Olay yükleri tam durum taşıdığında büyür. `ogrenci_idleri` gibi listeler en çok 200 öğe/parça ile bölünür (`parca_no`, `parca_sayisi`).
- At-least-once nedeniyle her tüketici `processed_events` yazma maliyetini öder (işlem başına bir ek INSERT).
- Farklı özneler arasında sıra garantisi olmadığı için, bazı akışlar (ör. "üyelik oluştu" ile "yoklama kaydedildi") yeniden denemeyle toparlanır. Bu gecikme kullanıcıya saniyeler içinde yansır.

## Değerlendirilen alternatifler

**Doğrudan NATS yayını (outbox yok).** İş verisi commit olur, yayın başarısız olursa olay kaybolur. İki yönlü commit mümkün değildir. Reddedildi.

**Debezium / mantıksal replikasyon ile CDC.** Outbox'ı ek altyapıyla (Kafka Connect ya da benzeri) okur. Ek işletim yükü getirir ve Faz 1 hacmi için gereksizdir. Relay süreci aynı garantiyi tek küçük bileşenle sağlar.

**Kafka.** Daha güçlü sıralama ve yeniden oynatma sunar. Reddedildi çünkü küme işletimi bu ekip ölçeği için ağırdır. JetStream tek ikili dosyayla yeterli teslim garantisi verir.

**Olay kaynaklı (event-sourced) çekirdek.** Defterler zaten append-only'dir ([0007](0007-para-ve-defterler.md)). Tüm iş durumunu olay deposuna taşımak karmaşıklık ekler ve sorgu modelini zorlaştırır. Reddedildi.

**Yalnızca `id` taşıyan ince olaylar (tüketici geri çağırır).** Servisler arası senkron bağımlılık yaratır ve kopyaları besleyemez. Reddedildi.
