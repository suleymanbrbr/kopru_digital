# Mağaza gizlilik beyanları: App Store "App Privacy" ve Google Play "Data safety"

Durum: **taslak, hukuk danışmanı onayı bekliyor.** Kaynaklar: [kvkk-silme.md](../schema/kvkk-silme.md) (veri envanteri), [ADR 0005](../adr/0005-dagitim-docker-kamal.md) (yurt dışı işleyiciler), `apps/mobile/app.config.ts` (iOS `privacyManifests`). Bu belge formlara girilecek cevapları verir; formlar App Store Connect ve Play Console hesapları açılınca doldurulur. Beyan, uygulamanın **kendisi ve arka ucu** için yapılır (uygulama verisi Köprü sunucularına gider).

Özet cevaplar:

- **Takip (tracking) yok.** Reklam yok, IDFA/ATT yok, üçüncü taraf reklam/analitik SDK'sı yok, veri aracısına satış yok. iOS'ta `NSPrivacyTracking = false`, App Tracking Transparency istemi gösterilmez.
- Toplanan her veri **kimlikle bağlantılıdır** (hesapla ilişkilidir) ve tek amacı **uygulama işlevselliğidir** (hizmetin kendisi). Pazarlama, kişiselleştirilmiş reklam, analitik amacı yok.
- Tüm aktarım TLS ile şifrelenir. Veri Türkiye'de saklanır (ADR 0005); yurt dışına yalnızca aşağıdaki işleyicilere en az veri gider.
- Kullanıcı **uygulama içinden** hesabını silebilir (Profil > Hesabım) ve verisini indirebilir (JSON).
- Uygulama çocuklara yönelik **değildir** ama 18 yaş altı öğrenciler kurum aracılığıyla kullanır (bkz. [magaza-listesi.md](magaza-listesi.md) yaş derecelendirmesi).

## 1. Toplanan veriler

| Veri                                                                                                                            | Nerede/neden                                                                                   | Apple kategorisi                                   | Google Play kategorisi                      | Amaç                            | İsteğe bağlı mı                |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------- | ------------------------------ |
| Ad, görünen ad                                                                                                                  | Profil, kurum içi listeler, öğretmenin öğrenciyi görmesi                                       | Contact Info > Name                                | Personal info > Name                        | Uygulama işlevi                 | Hayır                          |
| Telefon numarası                                                                                                                | Giriş (SMS OTP), kurum davetleri                                                               | Contact Info > Phone Number                        | Personal info > Phone number                | Uygulama işlevi, hesap yönetimi | Hayır                          |
| E-posta                                                                                                                         | Yalnız e-posta/parola veya sosyal girişle açılmış hesaplarda (mobilde OTP girişi telefonladır) | Contact Info > Email Address                       | Personal info > Email address               | Uygulama işlevi                 | Evet                           |
| Kullanıcı kimliği (UUID), üyelik kimliği                                                                                        | Oturum, kurum bağlamı, XP/seri kayıtları                                                       | Identifiers > User ID                              | Personal info > User IDs                    | Uygulama işlevi                 | Hayır                          |
| Cihaz kimliği (push belirteci)                                                                                                  | Bildirim göndermek                                                                             | Identifiers > Device ID                            | Device or other IDs                         | Uygulama işlevi                 | Evet (bildirim izni verilirse) |
| Fotoğraflar (soru, çizim, ödev teslim, avatar)                                                                                  | Öğrencinin seçtiği/çektiği görseller                                                           | User Content > Photos or Videos                    | Photos and videos > Photos                  | Uygulama işlevi                 | Evet (özelliği kullanınca)     |
| Ses kayıtları (sesli anlatım, mini anlatım)                                                                                     | Soru ve cevaplarda                                                                             | User Content > Audio Data                          | Audio > Voice or sound recordings           | Uygulama işlevi                 | Evet (özelliği kullanınca)     |
| Diğer kullanıcı içeriği (soru ve cevap metinleri, yoklama/ders geri bildirim notları, ödev ve deneme sonuçları, plan görevleri) | Eğitim hizmeti kaydı                                                                           | User Content > Other User Content                  | App activity > Other user-generated content | Uygulama işlevi                 | Hayır (hizmetin içeriği)       |
| Satın alma geçmişi (abonelik durumu; kurum sahibi)                                                                              | Abonelik ve limit denetimi; mağaza makbuzu RevenueCat'e gider                                  | Purchases > Purchase History                       | Financial info > Purchase history           | Uygulama işlevi                 | Evet (yalnız sahip rolü)       |
| Uygulama içi etkinlik (XP, seri, rozet, karakter)                                                                               | Motivasyon hizmeti                                                                             | (ayrı kategori yok: Other User Content kapsamında) | App activity > In-app actions               | Uygulama işlevi                 | Hayır                          |

Toplanmayanlar (formda "hayır" işaretlenir): konum, kişi rehberi, tarama/arama geçmişi, sağlık ve spor, hassas bilgiler (ırk, din vb.), kredi kartı numarası (mağaza ödemeyi Apple/Google yapar; web'de iyzico'nun sayfası kullanılır, kart verisi bize gelmez), reklam kimliği, çökme/performans verisi (uygulama içinde çökme raporlayıcı yok), tanılama.

Notlar:

- Soru fotoğrafı/sesi öğrencinin hesabıyla ilişkilidir; silme akışında medya servisinde silinir ([kvkk-silme.md](../schema/kvkk-silme.md) bölüm 2).
- Google Play "Data safety" formunda "Data is shared" (üçüncü tarafla paylaşım) sorusu: işleyici (service provider) olarak çalışan servisler "paylaşım" sayılmaz; aşağıdaki işleyiciler yalnız bizim adımıza işler. Hukuk danışmanıyla netleştirilecek; çekince olursa push belirteci ve satın alma kimliği "paylaşılan" olarak işaretlenir.

## 2. Yurt dışı işleyiciler ve alt işleyiciler (ADR 0005)

| İşleyici                                    | Ne gider                                                                                                                        | Neden              | Not                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple APNs / Google FCM / Expo push hizmeti | Push belirteci, genel bildirim metni ve derin bağlantı. İsim, not, ödev metni yok (CLAUDE.md: kişisel veri push metnine konmaz) | Anlık bildirim     | Kaçınılmaz yurt dışı aktarımı; aydınlatma metninde ve KVKK envanterinde yer alır                                                                            |
| Apple / Google ile giriş (açıksa)           | Kimlik sağlayıcının verdiği kimlik ve e-posta                                                                                   | Giriş              | Mobil uygulama bugün yalnız telefon OTP'si kullanır; sosyal giriş açılırsa bu satır geçerlidir ve "Sign in with Apple" kuralı (4.8) yeniden değerlendirilir |
| RevenueCat                                  | Rastgele uygulama kullanıcı kimliği (kurum kimliği), mağaza makbuzu                                                             | Abonelik doğrulama | **ADR 0005 listesinde yok**: aydınlatma metni ve KVKK envanterine eklenmeli (yer tutucu iş)                                                                 |
| Netgsm (Türkiye)                            | Telefon numarası, OTP metni                                                                                                     | SMS gönderimi      | Yurt içi                                                                                                                                                    |
| iyzico (Türkiye)                            | Ödeme akışı (web)                                                                                                               | Web aboneliği      | Yurt içi; mobilde mağaza ödemesi                                                                                                                            |

Her işleyici için "tracking" yoktur; veriler yalnız hizmetin sunulması için kullanılır.

## 3. iOS `PrivacyInfo.xcprivacy`

`app.config.ts` > `ios.privacyManifests` alanı prebuild'de `ios/Kopru/PrivacyInfo.xcprivacy` olarak üretilir (doğrulandı: `expo prebuild`). Bağımlılıkların kendi bildirimleri (React Native, `expo-constants`, `expo-file-system`, `expo-notifications`, `expo-system-ui`) pakete ayrıca girer; uygulama düzeyindeki bildirim toplam ihtiyacı (üst küme) beyan eder.

**Required reason API'leri** (bağımlılık taraması: native kaynak kodunda `UserDefaults`, `stat`/dosya zaman damgası, sistem açılış süresi, disk alanı):

| Kategori         | Neden kodu                                                   | Kaynak                                                                                             |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `UserDefaults`   | `CA92.1` (yalnız uygulamanın kendi erişimi)                  | `expo-constants`, `expo-notifications`, `expo-system-ui` (ve Expo geliştirme menüsü; yalnız Debug) |
| `FileTimestamp`  | `C617.1` (uygulama dizinindeki dosyalar), `0A2A.1`, `3B52.1` | React Native çekirdeği, `expo-file-system` (yükleme kuyruğu ve geçici dosyalar)                    |
| `SystemBootTime` | `35F9.1` (olay zamanı farkı ölçümü)                          | React Native zamanlama, Reanimated                                                                 |
| `DiskSpace`      | `E174.1` (yazmadan önce yer denetimi), `85F4.1`              | `expo-file-system`                                                                                 |

MMKV (`react-native-mmkv` > MMKVCore), RevenueCat (`PurchasesHybridCommon`), Skia ve Rive kendi bildirimleriyle gelir. Yeni bağımlılık eklenince bu tabloyu ve `app.config.ts`'i güncelle (`grep -rE "UserDefaults|stat\(|systemUptime|volumeAvailable"` ile `ios/` ve `node_modules/<paket>/ios` taranır). `NSPrivacyTrackingDomains` boştur.

`NSPrivacyCollectedDataTypes` yukarıdaki tablonun Apple karşılığıdır (ad, telefon, e-posta, fotoğraf/video, ses, diğer kullanıcı içeriği, satın alma geçmişi, kullanıcı kimliği, cihaz kimliği; hepsi `Linked = true`, `Tracking = false`, amaç `AppFunctionality`).

## 4. App Store Connect > App Privacy cevapları

1. "Do you or your third-party partners collect data from this app?" **Yes.**
2. Veri türleri: Contact Info (Name, Email Address, Phone Number), User Content (Photos or Videos, Audio Data, Other User Content), Purchases (Purchase History), Identifiers (User ID, Device ID).
3. Her tür için: **Linked to the user: Yes. Used for tracking: No.** Amaç: **App Functionality** (yalnızca).
4. "Data Used to Track You": **boş**. Privacy Policy URL: [magaza-listesi.md](magaza-listesi.md) yer tutucusu (zorunlu).
5. Hesap silme: uygulama içinde (Profil > Hesabım > "Hesabımı sil"); 5.1.1(v) karşılığıdır. İnceleme notuna akışın yolu yazılır.

## 5. Google Play > Data safety cevapları

| Soru                                                                           | Cevap                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uygulama veri topluyor mu / paylaşıyor mu?                                     | Topluyor: evet. Üçüncü taraflarla paylaşım: işleyici bildirimi dışında hayır (bölüm 1 notu)                                                                                                                                            |
| Veri aktarımda şifreli mi?                                                     | Evet (TLS)                                                                                                                                                                                                                             |
| Kullanıcı veri silme talep edebilir mi?                                        | Evet: uygulama içi (Hesabım) **ve web URL'si** (Play zorunlu kılar; yer tutucu: `https://kopru.example/hesap-sil`, web Ayarlar > Hesabım'a yönlendirir)                                                                                |
| Güvenlik uygulamaları: bağımsız güvenlik incelemesi                            | Hayır (şimdilik)                                                                                                                                                                                                                       |
| Aile Politikası / çocuklara yönelik mi?                                        | Hayır (hedef kitle: öğretmen, kurum ve öğrenciler; bkz. magaza-listesi.md)                                                                                                                                                             |
| Toplanan türler                                                                | Personal info (Name, Phone number, Email address, User IDs), Photos and videos, Audio (Voice or sound recordings), App activity (In-app actions, Other user-generated content), Financial info (Purchase history), Device or other IDs |
| Her tür: toplanıyor mu / paylaşılıyor mu / zorunlu mu / amaç                   | Toplanıyor; paylaşılmıyor (işleyici istisnası); Zorunlu: ad, telefon, kullanıcı kimliği ve uygulama etkinliği; isteğe bağlı: e-posta, fotoğraf, ses, satın alma, cihaz kimliği. Amaç: **App functionality**, **Account management**    |
| Konum, kişiler, dosya ve belgeler, takvim, mesajlar (SMS), sağlık, web geçmişi | Toplanmıyor                                                                                                                                                                                                                            |

## 6. İzin metinleri

Metinler `app.config.ts`'te (Türkçe, gerçek kullanıma göre). Reddedilirse uygulama içi açıklamalar `packages/i18n` `mobil.soru.izin.*` ve `mobil.bildirim.izin.*` altındadır.

| İzin                                                      | Metin özeti                                                                                                                   | Ne zaman istenir        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Kamera (`NSCameraUsageDescription`, `CAMERA`)             | Soru ya da ödev çözümünün fotoğrafını çekip öğretmene göndermek                                                               | "Fotoğraf çek"e basınca |
| Fotoğraflar (`NSPhotoLibraryUsageDescription`)            | Yalnızca seçilen fotoğraflar yüklenir. iOS PHPicker ve Android foto seçici izin penceresi çıkarmaz; yine de Apple metin ister | Galeri seçicisi         |
| Mikrofon (`NSMicrophoneUsageDescription`, `RECORD_AUDIO`) | Yalnız kullanıcı kaydı başlatınca sesli anlatım                                                                               | "Kaydet"e basınca       |
| Bildirim (`POST_NOTIFICATIONS`, iOS sistem istemi)        | Uygulama içi izin kartı önce açıklar (ödev, cevap, ders bildirimleri), sonra sistem istemi gelir                              | Bugün'deki kart         |
| Face ID (`NSFaceIDUsageDescription`)                      | Kullanılmaz; `expo-secure-store` Apple için metin gerektirir ("Face ID kullanmaz")                                            | Hiç                     |

Android'de kalan izinler: `CAMERA`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `VIBRATE`, `INTERNET` (kütüphaneden). Depolama, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `MODIFY_AUDIO_SETTINGS`, ön plan servisi izinleri çıkarıldı; iOS `audio` arka plan modu kapalıdır (`expo-audio` `enableBackgroundPlayback: false`). Denetim: `expo prebuild` sonrası `android/app/src/main/AndroidManifest.xml`.
