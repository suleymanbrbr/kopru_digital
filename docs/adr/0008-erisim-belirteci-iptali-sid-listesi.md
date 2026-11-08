# 0008. Erişim belirteci iptali: NATS KV `sid` listesi

## Durum

Kabul edildi (2026-11-08). [ADR 0004](0004-kimlik-dogrulama-ve-yetkilendirme.md)'ün "Belirteç iptali" paragrafını somutlaştırır ve genişletir (ADR 0004'e değişiklik notu eklendi).

## Bağlam

Erişim belirteci 15 dakikalık, kendi kendine yeten bir JWT'dir (ADR 0004). Oturum iptali (çıkış) yalnızca `hesap.oturumlar` satırını siler; çıkıştan sonra elde kalan erişim belirteci süresi dolana kadar çalışmaya devam ediyordu (`POST /auth/cikis` sonrası `GET /v1/hesap/uyeliklerim` 200 dönüyordu). Çalınmış cihaz, "tüm cihazlardan çıkış" ve hesap askıya alma senaryolarında 15 dakikalık pencere kabul edilemez.

Gereksinimler:

- Çıkışta ve oturum iptalinde aynı `sid`'li tüm erişim belirteçleri hemen `401` dönmeli; başka oturumların belirteçleri etkilenmemeli.
- Kontrol, kimlik doğrulamanın 1. adımında (imza, `exp`, `aud` sonrası) ve **tüm servislerde aynı kodla** yapılmalı. `motivasyon`, `bildirim`, `medya` kendi veritabanlarına sahiptir ve `api` veritabanını okuyamaz (ADR 0001).
- Kayıt kendiliğinden temizlenmeli; liste sonsuza büyümemeli.
- Hafif olmalı: yeni altyapı bileşeni yok, istek başına kabul edilebilir gecikme.

## Karar

Seçenek (b): **NATS JetStream KV kovası `iptal`**.

- Anahtar `sid` (oturum UUID'si), değer `1`. Kova `history: 1` ve **TTL = belirteç ömrü + 1 dakika** (`IPTAL_KAYIT_OMRU_MS` = 16 dk) ile oluşturulur; süresi dolan kayıtları NATS siler. Çünkü iptal edilmiş `sid`'li hiçbir belirteç bu süreden sonra zaten geçerli olamaz.
- Yazan: `api`. `POST /auth/cikis` oturumu çözer, Better Auth `signOut` ile satırı siler ve `sid`'i KV'ye yazar. Sonraki iptal noktaları (oturum yönetiminde "çıkış yaptır", hesap askıya alma, üyelik sonlandırma) aynı `app.iptal.iptalEt(sid)` çağrısını kullanır.
- Okuyan: `@kopru/service-kit` `installAuth`. JWT doğrulandıktan sonra `sid` claim'i varsa `iptal.iptalEdildiMi(sid)` sorulur; `true` ise `401 unauthorized`. Her servis `createService` ile otomatik alır; ek yapılandırma gerekmez. Arayüz `IptalDeposu`'dur; uygulamalar `NatsIptalDeposu` (`NATS_URL` varsa) ve `BellekIptalDeposu` (NATS olmayan ortam ve testler; TTL'li, süreç içi) olarak ayrılır.
- Okuma hızı: tek `kv.get` (direct get, yerel NATS'ta ~1 ms). Görülen iptaller süreç içinde TTL kadar önbelleğe alınır (iptal geri alınmaz, olumlu önbellek güvenlidir). Olumsuz sonuç **önbelleğe alınmaz**, çünkü iptalin hemen görünmesi şarttır.
- **Bağımlılık erişilemezse: fail-open.** Okuma `300 ms` içinde dönmezse veya hata verirse istek geçirilir, uyarı loglanır ve 5 saniye boyunca KV'ye sorulmaz (her isteğin gecikmesini önlemek için). Gerekçe: belirteç zaten imzalı ve en çok 15 dk geçerli; NATS kesintisinin tüm servisleri kimlik doğrulama açısından düşürmesi (fail-closed) bu güvenlik kazancından daha pahalıdır. Kesinti süresince risk, ADR 0004'te kabul edilen mevcut pencereyle sınırlıdır. Kesintiyi `/ready` NATS kontrolü ve uyarı logu görünür kılar. Daha sıkı politika gereken bir uç nokta çıkarsa (ör. platform taklidi) tercihe bağlı fail-closed seçeneği eklenir.
- **Yazma hatası** (NATS erişilemez): çıkış yine başarılı sayılır (oturum satırı silindi, yenileme yok), hata `error` olarak loglanır; kalan pencere en çok 15 dk'dır. Askıya alma gibi güvenlik açısından zorunlu iptal noktalarında çağıran, hatayı kendi akışında ele alır (`iptalEt` hata fırlatır).
- Log ve olaylar: yalnızca `sid` (kişisel veri değil) yazılır. Bununla ilgili olarak istek log'unda sorgu dizisindeki `belirtec|token|code|kod|state` değerleri maskelenir (`service-kit` `urlTemizle`).

## Sonuçlar

- Çıkıştan sonra aynı `sid`'li tüm erişim belirteçleri anında 401 verir; diğer oturumlar etkilenmez. Diğer servisler ek kod yazmadan aynı korumayı alır.
- Kayıtlar NATS TTL'iyle silinir; liste en çok "son 16 dakikada iptal edilen oturum sayısı" kadar büyür.
- Her korumalı istek için bir NATS gidiş-dönüşü eklenir (yerel/aynı ağ). `NATS_URL` olmayan geliştirme ortamında iptal yalnızca aynı süreçte etkilidir; çok süreçli üretimde NATS zorunludur.
- Kova yapılandırması (TTL, history) tüm servislerde `@kopru/service-kit` sabitlerinden gelir; farklı bir TTL ile kova açan servis oluşturma hatası alır. Belirteç ömrü değişirse `IPTAL_KAYIT_OMRU_MS` de değişmeli ve kova yeniden oluşturulmalıdır.
- `hesap.oturumlar.iptal_at` sütunu bu mekanizmanın parçası değildir; Better Auth çıkışta satırı sildiği için kullanılmaz (şema dokümanındaki sütun, ileride "çıkış yaptır" yönetim ekranı için denetim izi olarak saklanabilir).
- E-posta doğrulama (aynı teslimat): `eposta_dogrulandi_at` doğrulama bağlantısıyla dolar, **girişi zorlamaz**: `requireEmailVerification` kapalı kalır, çünkü Faz 1'de telefon OTP asıl giriştir ve e-posta isteğe bağlı bir kanaldır. Doğrulanmamış e-postanın kullanıldığı yerler (e-posta davetleri) `GET /v1/hesap/ben` yanıtındaki `kullanici.eposta_dogrulandi` alanına bakar. Gönderim şimdilik `api` içinde SMTP uygulamasıyla (yerelde Mailpit) yapılır; gerçek gönderim `bildirim` servisine taşınacaktır (`EpostaGonderici` arayüzü bu geçişi tek noktada tutar).

## Değerlendirilen alternatifler

- **(a) `hesap.oturumlar` kontrolü + kısa önbellek (api içinde).** Yalnızca `api` için çalışır; diğer servisler `api` veritabanını okuyamaz, bu yüzden her biri `api`'ye HTTP çağrısı yapmak zorunda kalırdı. Önbellek TTL'i iptal gecikmesine eşittir (örn. 30 sn bayat). Her istekte veritabanı okuması ya da bayatlık ikilemi. Reddedildi.
- **(c) Postgres tablo + LISTEN/NOTIFY.** Servislerin ayrı veritabanları olduğundan NOTIFY servisler arası ulaşmaz; ortak tablo ADR 0001'in "servisler birbirinin veritabanını kullanmaz" kuralını bozar. Reddedildi.
- **(b') KV `watch` ile bellekte tam kopya.** İstek başına ağ gidiş-dönüşünü sıfırlar, ama başlangıçta yeniden oynatma, bağlantı kopma/yeniden kurma ve bayatlık yönetimi gerektirir. Gidiş-dönüş maliyeti şu an ölçülebilir bir sorun değil; ihtiyaç doğarsa `IptalDeposu` arayüzünün arkasında değiştirilebilir.
- **Kısa ömürlü belirteç (ör. 1-2 dk).** Her istemcide sık yenileme, daha fazla `POST /auth/token` yükü ve mobilde pil/ağ maliyeti; yine de sıfır pencere sağlamaz. Reddedildi.
- **Fail-closed varsayılan.** NATS kesintisinde tüm servisler 401 verirdi; mevcut 15 dk risk penceresine karşı orantısız. Yukarıda gerekçelendirildi.
