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
- İlk girişte KVKK rıza ekranı zorunludur. Kullanıcı o kurum için güncel `riza_metinleri` sürümünü kabul etmeden `api` kiracı uç noktaları `403 riza_gerekli` döner. Rıza kaydı `hesap.rizalar`a yazılır.

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

### Rol -> izin anahtarları

İzin anahtarı: `{kaynak}.{eylem}`, ör. `yoklama.yaz`, `odev.ver`, `odev.incele`, `finans.tahsilat.yaz`, `duyuru.yaz`, `kurum.ayar.yaz`. Rol-izin-kapsam eşlemesi `hesap.rol_izinleri` tablosundadır (`rol_kodu`, `izin_kodu`, `kapsam`) ve `packages/izinler` içinde TypeScript sabiti olarak da derlenir. Tablo ve sabit aynı tohum betiğinden üretilir, CI aralarındaki farkı yakalar. Servisler izinleri bu paketten okur; veritabanı sorgusu yapmaz. Faz 1'de özel rol yoktur, yalnızca sistem rolleri vardır.

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

### Kontrol sırası

Her kiracı isteğinde sıra sabittir. Her adım başarısızsa sonraki adıma geçilmez:

1. **Kimlik:** JWT imzası, `exp`, `aud`; `sid` kara listede mi. Hata: `401`.
2. **Rıza:** güncel KVKK sürümü kabul edilmiş mi (rıza ekranı uç noktaları hariç). Hata: `403 riza_gerekli`.
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
