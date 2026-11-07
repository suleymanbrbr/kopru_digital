# 0004. Kimlik doğrulama ve yetkilendirme

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Girişler telefon OTP, Apple ve Google ile yapılır. Web (Next.js) ve mobil (Expo) aynı hesapları kullanır. Dört servis, aynı kullanıcıyı ayrı ayrı doğrulamak zorundadır. Bir kullanıcı birden fazla kurumda farklı rollerde olabilir (ör. bir kurumda öğretmen, başka bir kurumda veli). Yetki, role ve kapsama bağlıdır (kendi, grup, şube, kurum). Modüller kurum, kademe ve grup düzeyinde açılıp kapatılır.

## Karar

### Kimlik doğrulama: Better Auth

- Better Auth yalnızca `api` içinde çalışır. Eklentiler: `phoneNumber` (OTP), `socialProviders` (Apple, Google), `jwt` (JWKS), `bearer` (mobil).
- Better Auth tabloları `hesap` şemasına, kendi adlarımızla eşlenir: `user` -> `hesap.kullanicilar`, `session` -> `hesap.oturumlar`, `account` -> `hesap.hesaplar`, `verification` -> `hesap.dogrulamalar`, `jwks` -> `hesap.jwks`. Eşleme Better Auth `modelName`/`fields` yapılandırmasıyla yapılır.
- OTP: 6 hane, 5 dakika geçerli, en çok 5 yanlış deneme, telefon başına saatte 5 istek, IP başına saatte 20 istek. OTP SMS'i `bildirim` servisinin iç uç noktasına senkron gönderilir. Kod olaya yazılmaz ([0002](0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)).
- Oturum: opak, veritabanında saklanan yenileme belirteci (30 gün, kayan). Web için `httpOnly; Secure; SameSite=Lax` çerez. Mobil için güvenli depoda (Keychain/Keystore) taşıyıcı belirteç. Çıkışta ve şüpheli kullanımda `oturumlar.iptal_at` doldurulur.
- İlk girişte KVKK rıza ekranı zorunludur. Rıza **hesap düzeyindedir ve kurum seçiminden önce** alınır: kullanıcı zorunlu metin türlerinin (`kvkk_aydinlatma`, `kullanim_kosullari`) güncel yayınlanmış sürümünü kabul etmeden muaf olmayan her uç nokta `403 riza_gerekli` döner. Rıza kaydı `hesap.rizalar`a `kurum_id = NULL` ile yazılır. Ayrıntı ve gerekçe: aşağıdaki "Değişiklik notu".

### Erişim belirteci (JWT)

`api`, 15 dakikalık JWT üretir (`EdDSA`/Ed25519). Yenileme, oturum belirteciyle `POST /auth/token` ile yapılır ve kurum seçimini içerir.

| Claim | Anlam |
| --- | --- |
| `iss`, `aud` | `https://api.<alan>`; `aud` = `kopru`. Servis içi çağrılarda `aud` hedef servistir. |
| `sub` | `kullanici_id` |
| `sid` | oturum kimliği |
| `kurum_id` | etkin kurum |
| `uyelik_id` | etkin üyelik |
| `rol` | `sahip`, `yonetici`, `ogretmen`, `ogrenci`, `veli` |
| `pv` | izin sözlüğü sürümü (`hesap.roller` değiştiğinde artar) |
| `imp` | taklit varsa `{taklit_id, bitis}`, yoksa yok |
| `plat` | platform yöneticisi rolü (`destek`, `yonetici`) |

Belirteç; izin listesi, grup listesi ya da modül ayarı taşımaz. Bunlar belirteci şişirir ve bayat kalır.

Diğer servisler `GET /.well-known/jwks.json` adresindeki anahtarları önbelleğe alır (10 dakika, bilinmeyen `kid` görülürse anında yenile). İmza, `iss`, `aud`, `exp` doğrulanır. Anahtar döndürme: 90 günde bir yeni anahtar yayımlanır, eskisi 30 gün daha JWKS'te kalır.

Belirteç iptali: 15 dakikalık ömür kabul edilen penceredir. `api`, oturum iptalini kendi kontrol eder (yenilemede). Diğer servisler anında iptal görmez. Acil durumda (hesap askıya alma) `sid` kara listesi NATS KV'ye (`kv.iptal`) yazılır ve servisler istek başına bu anahtarı kontrol eder.

### Servisler arası çağrı kimliği

İç uç noktalar (`/ic/*`) kullanıcı JWT'sini kabul etmez. Çağıran servis, `api` tarafından JWKS ile imzalanan kısa ömürlü (5 dk) servis JWT'si kullanır (`sub=servis:bildirim`, `aud=api`, `scope=iletisim.oku`). Servis anahtarları dağıtım sırrıdır. Örnek: `bildirim` -> `GET /ic/kullanicilar/:id/iletisim` yalnızca `scope=iletisim.oku` ile çalışır ve telefon, e-posta, görünen ad, dil döner. Her çağrı `api` tarafında denetim günlüğüne (`denetim_kayitlari`, `eylem='iletisim.oku'`) yazılır.

### Rol -> izin anahtarları

İzin anahtarı: `{kaynak}.{eylem}`, ör. `yoklama.yaz`, `odev.ver`, `odev.incele`, `finans.tahsilat.yaz`, `duyuru.yaz`, `kurum.ayar.yaz`. Rol-izin-kapsam eşlemesi `hesap.rol_izinleri` tablosundadır (`rol_kodu`, `izin_kodu`, `kapsam`) ve `packages/izinler` içinde TypeScript sabiti olarak da derlenir. Tablo ve sabit aynı tohum betiğinden üretilir, CI aralarındaki farkı yakalar. Servisler izinleri bu paketten okur; veritabanı sorgusu yapmaz. Faz 1'de özel rol yoktur, yalnızca sistem rolleri vardır.

Bir kullanıcı aynı kurumda birden çok rol taşıyabilir (`hesap.uyelikler` bir kullanıcı x kurum x rol için bir satırdır). Tek kişilik kurumda öğretmen hem `sahip` hem `ogretmen` üyeliğine sahiptir. JWT her zaman tek bir etkin `uyelik_id` taşır; istemci üyelikler arası geçişi `POST /auth/token` ile yeni belirteç alarak yapar. Ders ve atama kayıtları `ogretmen` üyeliğine, kurum yönetimi `sahip` üyeliğine bağlıdır.

### Kapsamlar

Her `rol_izinleri` satırı bir kapsam taşır. Kapsamlar genişlik sırasıyla:

1. `kendi`: yalnızca kendi kaydı (öğrencinin kendi yoklaması, kendi ödevi).
2. `grup`: atandığı gruplardaki kayıtlar. Öğretmen için `hesap.atamalar` ile, öğrenci için `hesap.grup_uyeleri` ile belirlenir.
3. `sube`: `uyelikler.sube_id` ile aynı şube.
4. `kurum`: kurumun tamamı.

Genel eşleme (ayrıntılı tablo `packages/izinler/src/esleme.ts`):

| Rol | Tipik kapsam |
| --- | --- |
| `sahip` | `kurum` (tüm izinler, abonelik ve rol yönetimi dahil) |
| `yonetici` | `kurum` veya `sube` (üyelik `sube_id` doluysa `sube`) |
| `ogretmen` | `grup` (kendi atamaları) |
| `ogrenci` | `kendi` |
| `veli` | `kendi` çocuklar üzerinden (`veli_ogrenci`), Faz 1'de UI yok, uç nokta açık değil |

Kapsam, istek anında repository'ye bir süzgeç olarak çözülür (`KapsamSuzgeci`): `kendi` -> `ogrenci_id = :uyelik`, `grup` -> `grup_id IN (atanan gruplar)`, `sube` -> `sube_id = :sube`. Liste uç noktaları süzgeci SQL'e ekler. Tekil kayıt uç noktaları getirip kapsamı doğrular; kapsam dışıysa `404` döner (varlığı ifşa etmez).

> **Uygulama notu.** JWT'de `rol` (etkin üyelik rolü) yanında `roller` (kullanıcının o kurumdaki tüm etkin rolleri) de taşınır; izin kararı yalnızca etkin üyeliğin `rol`ü ile verilir ve `requirePermission` üyeliğin hâlâ etkin olduğunu doğrular (belirteç ömrü içindeki ayrılma anında etkili olur). Kurum seçilmemiş kullanıcı (ilk giriş) `kurum_id`/`uyelik_id` claim'i olmayan belirteç alır. Rol-izin sözlüğü şimdilik `@kopru/contracts` içindedir (`packages/izinler` ayrı paket olarak açılmadı).

### Kontrol sırası

Her kiracı isteğinde sıra sabittir. Her adım başarısızsa sonraki adıma geçilmez:

1. **Kimlik:** JWT imzası, `exp`, `aud`; `sid` kara listede mi. Hata: `401`.
2. **Rıza:** kullanıcı (kurumdan bağımsız) zorunlu metinlerin güncel sürümünü kabul etmiş mi. Muaf uçlar: `/auth/*`, `/.well-known/*`, `/v1/hesap/ben`, `/v1/hesap/rizalar*`. Hata: `403 riza_gerekli`.
3. **Kiracı:** `kurum_id` claim'i ve `withTenant` bağlamı. URL'de kurum kimliği varsa claim ile eşleşmeli. Hata: `403`.
4. **Abonelik durumu:** kurum aboneliği `askida` ya da `sona_erdi` ise yalnızca okuma ve abonelik uç noktaları açıktır. Hata: `402 abonelik_gerekli`.
5. **Modül:** uç noktanın ait olduğu modül, istek bağlamındaki kademe/grup için açık mı (aşağıdaki öncelik kuralı). Hata: `403 modul_kapali`.
6. **İzin:** rol bu izne sahip mi. Hata: `403 izin_yok`.
7. **Kapsam ve sahiplik:** kayıt kapsam süzgecinde mi. Hata: `404`.
8. **Taklit:** `imp` varsa yazma izni her zaman reddedilir (`403 taklit_salt_okunur`). Bu kontrol 6. adımdan önce de çalışır, ama yazma yollarında son güvence olarak veritabanı işlemi `READ ONLY` açılır.

Modül (5) izinden (6) önce gelir. Böylece kapalı modül, izin ayrıntısını sızdırmadan tek tip yanıt verir.

### Modül açık/kapalı önceliği

Ayarlar `hesap.modul_ayarlari` tablosundadır. Düzeyler: `kurum`, `kademe`, `grup`. Kayıt yoksa "miras al" demektir.

Etkin değer: **bir modül ancak her düzey izin veriyorsa açıktır.**

- Kurum düzeyi kapalıysa modül her yerde kapalıdır. Alt düzey açmaya çalışsa da kurum düzeyi kazanır (öncelik kurum > kademe > grup).
- Kurum düzeyi açık/kayıtsızsa ve ilgili kademe kapalıysa, o kademedeki gruplar için kapalıdır.
- Kurum ve kademe açık/kayıtsızsa ve grup kapalıysa, o grup için kapalıdır.
- Hiç kayıt yoksa varsayılan, kurumun plan hakkına bağlıdır (`planlar.moduller`). Plan modülü içermiyorsa kapalıdır.

Alt düzeyler yalnızca daraltabilir. Kurum kapalıyken kademe satırı `acik=true` yazılsa bile etkisizdir; arayüz bu durumu göstermez ve API bu satırı reddeder (`422`). Çözümleme `hesap.modul_acik_mi(kurum_id, modul_kodu, kademe_id, grup_id)` fonksiyonunda tek yerde yapılır. Diğer servisler aynı kuralı yerel `modul_ayari_kopyalari` ve `packages/izinler/modul.ts` ile uygular.

### Platform yöneticisi ve taklit

- `hesap.kullanicilar.platform_rolu` doluysa JWT'ye `plat` claim'i girer. Platform uç noktaları ayrı rotadır (`/platform/*`) ve `_sistem` rolü kullanır.
- Taklit: platform yöneticisi hedef kullanıcı, kurum ve zorunlu neden metniyle `POST /platform/taklit` çağırır. `hesap.taklit_kayitlari`na satır yazılır, 15 dakikalık JWT üretilir (`imp` claim'i, `sub` hedef kullanıcıdır, `aktor` olayı yöneticiyi gösterir). Yenilenemez. Her istek `denetim_kayitlari`na düşer. Yazma yapılamaz (kontrol sırası 8).

## Değişiklik notu (2026-11-07): KVKK rızası hesap düzeyinde

İlk hâlinde bu ADR rızayı kurum başına tanımlıyordu ("kullanıcı o kurum için güncel sürümü kabul etmeden"). Uygulama (`services/api/src/modules/hesap/riza.ts`, `kimlik.ts`) ve istemciler (web, mobil) rızayı **hesap düzeyinde ve kurum seçiminden önce** aldı. Bu not kararı uygulamaya göre günceller.

**Karar**

- Rıza kullanıcıya bağlıdır, kuruma değil. `hesap.rizalar.kurum_id` bu akışta `NULL` yazılır. Kullanıcı yeni bir kuruma katıldığında yeniden onay istenmez.
- Akış: giriş (OTP/Apple/Google) → kurum içermeyen erişim belirteci → KVKK ekranı → kurum seçimi/oluşturma. Kurum seçimi ve kurum oluşturma da rıza kapısının arkasındadır.
- Zorunlu türler `kvkk_aydinlatma` ve `kullanim_kosullari`dır. Her tür için güncel sürüm: yayınlanmış ve `gecerli_baslangic_at <= now()` olan en yüksek `surum`. `riza_metinleri.rol_kapsami` kullanıcının belirteçteki rolleriyle süzülür; kurumsuz belirteçte (rol yok) tüm zorunlu metinler sayılır.
- Yeni sürüm yayınlanınca bir sonraki istekte `403 riza_gerekli` döner ve istemci KVKK ekranını yeniden gösterir.
- Denetim kapısı `api` içinde `onRequest` kancasıdır ve kontrol sırasındaki 2. adımdır (kimlikten sonra, kiracıdan önce).

**Gerekçe**

- Kullanıcı kurum seçmeden önce de kişisel veri işleniyor (telefon, oturum, cihaz). Aydınlatma bu noktada yapılmalı.
- Faz 1 metinleri platform metnidir. Veri sorumlusu kurum bazında ayrışmadığı sürece kurum başına onay kullanıcıya tekrar eden ekran gösterir, hukuki kazanç getirmez.
- Kurum başına rıza, kurum seçimi ile rıza ekranı arasında döngüsel bir bağımlılık yaratıyordu (kurum seçmek için rıza, rıza için kurum).

**Açık kalanlar**

- Kuruma özgü metin (ör. kurumun kendi aydınlatma metni, 18 yaş altı veli onayı) Faz 2'de gelirse `riza_metinleri`ne kurum kapsamı eklenir ve `rizalar.kurum_id` dolu satırlar kullanılır. Şema iki kollu RLS ile buna hazırdır.
- Kapı her istekte rıza durumunu veritabanından okur. Ölçümle gerekli görülürse süreç içi kısa önbellek (kullanıcı + metin sürümü anahtarı) eklenir.
- Diğer servisler (`motivasyon`, `bildirim`, `medya`) rızayı kendileri denetlemez. İstemci bunlara yalnızca `api` rıza kapısını geçtikten sonra ulaşır. Bir servis istemciye doğrudan açılırsa bu karar yeniden değerlendirilir.

## Sonuçlar

Olumlu:

- Servisler bağımsız doğrulama yapar, `api`ya senkron bağımlılık yoktur.
- İzin ve kapsam mantığı tek pakette; her servis aynı anahtarları kullanır.
- Kısa ömürlü JWT ve veritabanı düzeyinde RLS çift savunma sağlar.

Olumsuz:

- Rol veya üyelik değişikliği, JWT süresi dolana (en çok 15 dk) kadar eski claim ile görünür. Üyelik sonlandırma bu pencerede `sid` kara listesiyle hızlandırılır.
- Birden fazla kurumda üyelikte kurum değiştirmek yeni belirteç ister.
- `packages/izinler` sürümü servisler arasında uyumsuz kalırsa farklı karar çıkabilir. CI, sürüm uyumsuzluğunu `pv` testiyle yakalar.

## Değerlendirilen alternatifler

**Opak oturum çerezi ve her istekte `api` doğrulaması.** İptal anında geçerlidir. Reddedildi çünkü her servis her istekte `api`ya bağımlı olurdu.

**İzinleri JWT içine koymak.** Belirteç büyür, rol değişikliğinde bayat kalır. Reddedildi. Bunun yerine `rol` + `pv` yeterlidir.

**Harici kimlik sağlayıcı (Keycloak, Auth0).** Veriyi Türkiye dışına çıkarabilir ya da ek işletim yükü getirir. Telefon OTP akışı özelleştirme ister. Better Auth `api` içinde, kendi veritabanımızda çalışır. Reddedildi.

**Özel roller ve ABAC (Faz 1).** Esnek, ama kapsam ve UI maliyeti yüksek. Tablo yapısı özel role izin verecek biçimde tasarlandı, Faz 1'de açılmaz.

**Modül önceliğinde "en özel kural kazanır" (grup > kademe > kurum).** Kurum yöneticisinin bir modülü tüm kurumda kesin kapatamamasına yol açar. Reddedildi.
