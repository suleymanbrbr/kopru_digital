# Mağaza listesi taslağı (App Store ve Google Play)

Durum: **taslak.** Apple Developer ve Google Play hesapları, alan adı ve destek/gizlilik sayfaları henüz yok; `YER TUTUCU` etiketli her şey hesap açılınca gerçek değerle değişir. Gizlilik cevapları: [magaza-gizlilik.md](magaza-gizlilik.md). Derleme ve gönderim adımları: [gelistirme.md](../gelistirme.md) "Mobil > Mağaza derlemesi".

## 1. Kimlik ve bağlantılar

| Alan                                  | Değer                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uygulama adı                          | **Köprü** (geçici; marka ve ticari marka taraması sonrası değişebilir. App Store en çok 30 karakter)                                               |
| Alt başlık (App Store, en çok 30 kr.) | `Ders, ödev, yoklama tek yerde` (29 kr.)                                                                                                           |
| Kısa açıklama (Play, en çok 80 kr.)   | `Öğretmen ve öğrenciler için ders, yoklama, ödev ve soru-cevap uygulaması.`                                                                        |
| Birincil kategori                     | Eğitim (Education)                                                                                                                                 |
| İkincil kategori                      | Verimlilik (Productivity), isteğe bağlı                                                                                                            |
| Paket kimliği                         | iOS `bundleIdentifier` ve Android `package`: `com.koprudigital.app` (**YER TUTUCU**, `APP_BUNDLE_ID` ile; mağazaya ilk gönderimden sonra değişmez) |
| Destek URL'si                         | `https://kopru.example/destek` (**YER TUTUCU**; uygulama kurum sahibi engelinde `EXPO_PUBLIC_DESTEK_URL` ile açar)                                 |
| Gizlilik politikası URL'si            | `https://kopru.example/gizlilik` (**YER TUTUCU**, zorunlu; KVKK aydınlatma metniyle uyumlu)                                                        |
| Hesap silme URL'si (Play zorunlu)     | `https://kopru.example/hesap-sil` (**YER TUTUCU**)                                                                                                 |
| Pazarlama URL'si                      | `https://kopru.example` (**YER TUTUCU**, isteğe bağlı)                                                                                             |
| Telif                                 | `© 2026 <ŞİRKET ADI>` (**YER TUTUCU**)                                                                                                             |
| Fiyat                                 | Ücretsiz indirme; kurum sahibi için uygulama içi abonelik (RevenueCat). Abonelik ürünleri mağaza hesabı açılınca oluşturulur                       |
| Diller                                | Türkçe (tek)                                                                                                                                       |
| Ülke/bölge                            | Türkiye                                                                                                                                            |

## 2. Açıklama (TR, App Store "Description" ve Play "Full description")

> **Köprü, öğretmenin ve öğrencinin aynı yerde buluştuğu eğitim uygulaması.**
>
> Özel ders veren bir öğretmen de olsan, bir kursun ya da dershanenin yöneticisi de, Köprü günlük işi tek ekrana toplar.
>
> **Öğretmenler ve kurumlar için**
> • Ders programı, yoklama (internet olmasa da alır, bağlanınca gönderir)
> • Ödev verme, deneme sonucu girişi ve gelişim takibi
> • Öğrenci kartı: ders hakkı, ödemeler ve bakiye
> • Sınıf koduyla öğrenci katılımı, duyurular
> • Öğrencinin gönderdiği soruya fotoğraf, çizim ya da sesle cevap
>
> **Öğrenciler için**
> • Bugün ekranında dersin, görevlerin ve ödevin
> • Çözemediğin sorunun fotoğrafını çek, öğretmenine gönder; cevabı bildirimle al
> • Deneme sonuçlarını ve gelişimini gör
> • Yol arkadaşın Közü ile seri tut, rozet kazan, birlikte gelişin
>
> **Verin sende**
> • Verilerini JSON olarak indirebilirsin
> • Hesabını uygulamadan silebilirsin (30 gün içinde geri alınabilir)
> • Veriler Türkiye'de saklanır; reklam yok, takip yok
>
> Köprü'yü kullanmak için bir kurumdan ya da öğretmeninden davet almış olman ya da sınıf kodunu girmen gerekir.

(Uzunluk: App Store en çok 4000 kr., Play en çok 4000 kr. Özellik listesi ürün şartnamesine göredir; yayında olmayan özellik yazılmaz: yazmadan önce `docs/urun/devir-notu.md` ile karşılaştır. "Közü" karakter adı kesinleşince güncelle.)

## 3. Anahtar kelimeler (App Store, en çok 100 karakter, virgüllü, boşluksuz)

`ders,özel ders,öğretmen,öğrenci,ödev,yoklama,kurs,dershane,deneme,soru çöz,takvim,eğitim,etüt`

(Uygulama adı ve kategori kelimeleri anahtar alanına tekrar yazılmaz. Play'de ayrı alan yok; kelimeler açıklamada doğal geçer.)

## 4. Yaş derecelendirmesi ve çocuk verisi gerekçesi

Hedef kitle öğretmenler, kurum yöneticileri ve **öğrenciler**; öğrencilerin bir kısmı 18 yaşından küçüktür (ortaokul/lise). Uygulama **çocuklara yönelik değildir**: Apple "Kids" kategorisine ve Google "Designed for Families" programına **başvurulmaz**. Gerekçe: hesap açma kurum daveti ya da sınıf koduyla olur, kurum öğrencinin öğretmeniyle ilişkisini yönetir; reklam, takip ve herkese açık içerik yoktur; KVKK'da 18 yaş altı onayı kurum ve veli onayı süreciyle ele alınır (`docs/schema/kvkk-silme.md` bölüm 4; hukuk danışmanı onayı bekliyor).

> **Proje sahibi kararı gerekli:** 13 yaş altı (ilkokul/ortaokul) öğrenci hedeflenirse Apple "Made for Kids"/çocuk gizliliği ve Google Families politikaları devreye girer (reklam ve takip zaten yok, ama ek inceleme ve ebeveyn denetimi beklentisi doğar). Bu taslak **13 yaş ve üstü** varsayar.

### Apple yaş derecelendirme anketi (önerilen cevaplar)

| Soru                                                      | Cevap                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sohbet/mesajlaşma, kullanıcı üretimi içerik               | **Evet, sınırlı**: öğrenci ile kendi öğretmeni arasında soru-cevap; herkese açık akış yok, yabancıyla eşleşme yok, kurum içi |
| Şiddet, korku, cinsellik, küfür, uyuşturucu, kumar, tıbbi | Hiçbiri / yok                                                                                                                |
| Sınırsız web erişimi                                      | Hayır (yalnız uygulama içi tarayıcıyla öğretmenin paylaştığı kayıt bağlantısı)                                               |
| Kumar, ödüllü çekiliş                                     | Hayır (XP/rozet gerçek değer taşımaz)                                                                                        |
| Uygulama içi satın alma                                   | Evet (abonelik, yalnız kurum sahibi)                                                                                         |
| Önerilen sonuç                                            | **13+** (yeni Apple ölçeği) ya da 12+ (eski ölçek)                                                                           |

### Google Play IARC anketi ve hedef kitle (önerilen)

- Hedef yaş grupları: **13–15, 16–17, 18+** (13 yaş altı seçilmez).
- IARC: şiddet/cinsellik/uyuşturucu/kumar yok; "Kullanıcılar etkileşebilir": evet (öğretmen–öğrenci soru-cevap, kurum içi); "Kullanıcı konumu paylaşılır": hayır; "Dijital satın alma": evet.
- Beklenen derece: PEGI 3 / Everyone, etkileşim notuyla. Reklam: yok. "Haber uygulaması", "COVID", "finans" beyanları: hayır.

## 5. Ekran görüntüleri listesi

Hepsi **mock ya da test kurumu** verisiyle, gerçek kişi adı olmadan (kurumsal örnek: "Deniz Yılmaz", "8-A"). Türkçe arayüz, açık tema; koyu tema için 1 ek görüntü isteğe bağlı. Çekim: `apps/mobile` mock modu (`EXPO_PUBLIC_API_MOCK=1`) ya da `scripts/*-akisi.sh` gerçek api.

| #   | Ekran                                             | Rol            | Başlık metni önerisi                                       |
| --- | ------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| 1   | Bugün (öğrenci): görevler, seri, yol arkadaşı     | Öğrenci        | "Bugün ne yapacağın tek ekranda"                           |
| 2   | Soru sor: fotoğraf + çizim + sesli anlatım        | Öğrenci        | "Çözemediğin soruyu öğretmenine gönder"                    |
| 3   | Soru detayı ve öğretmen cevabı                    | Öğrenci        | "Cevabı bildirimle al"                                     |
| 4   | Bugün (öğretmen): dersler, bekleyen sorular       | Öğretmen       | "Günün dersleri ve bekleyen sorular"                       |
| 5   | Yoklama alma (çevrimdışı şeridiyle)               | Öğretmen       | "İnternet olmasa da yoklama al"                            |
| 6   | Ödev ver ve ödev özeti                            | Öğretmen       | "Ödev ver, teslimleri izle"                                |
| 7   | Deneme gelişimi (grafik)                          | Öğrenci        | "Gelişimini gör"                                           |
| 8   | Öğrenci kartı (ders hakkı, ödeme, bakiye)         | Öğretmen/sahip | "Ders hakkı ve ödemeler net"                               |
| 9   | Karakterim (rozet, seri, evrim)                   | Öğrenci        | "Yol arkadaşınla birlikte büyü"                            |
| 10  | Profil > Hesabım (verilerimi indir, hesabımı sil) | Hepsi          | "Verin sende" (App Store inceleme notu için de kullanılır) |

Boyutlar:

- **iOS** (zorunlu): 6,9" iPhone (iPhone 17 Pro Max/16 Pro Max, **1320×2868**) ve 6,5" iPhone (**1284×2778** ya da 1242×2688). iPad yok (`supportsTablet: false`, iPad görüntüsü istenmez). Her set en çok 10 görüntü, en az 1.
- **Android**: telefon, 16:9–9:16 aralığında, kenar 320–3840 px (öneri **1080×1920** ya da 1080×2400), en az 2, en çok 8. Tablet görüntüsü ve 7"/10" tablet seti gerekmez (telefon uygulaması). Özellik grafiği (feature graphic) **1024×500** ve uygulama simgesi **512×512** ayrıca gerekir (görsel varlık işi; `assets/ikon.png` kaynaktır).
- Çekim: iOS simülatöründe iPhone 17 Pro Max (1320×2868); `xcrun simctl io <udid> screenshot`. Durum çubuğu temiz (`xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4`).

## 6. İnceleme ekibi için notlar (App Review / Play inceleme erişimi)

> **YER TUTUCU: demo hesaplar gerçek api'de oluşturulunca doldurulur.** Hesap açma telefon OTP'siyle yapılır; inceleme ekibi gerçek SMS alamayacağından sabit OTP'li inceleme hesabı (yalnız staging/üretimde izole bir "inceleme kurumu") gerekir. Bu özellik **henüz yok**: api'de "inceleme hesabı" için sabit kod yolu açmadan önce ADR yazılmalı (güvenlik riski: sabit kod yalnız o kuruma bağlı, kısıtlı, kapatılabilir olmalı). Karar bekliyor.

Taslak not metni:

```
Demo hesaplar (inceleme kurumu "Köprü İnceleme Kursu"):
  Öğretmen:  telefon <YER TUTUCU: +90 5xx xxx xx xx>   doğrulama kodu: <YER TUTUCU>
  Öğrenci:   telefon <YER TUTUCU: +90 5xx xxx xx xx>   doğrulama kodu: <YER TUTUCU>
Giriş: telefon numarasını gir, SMS ile gelen 6 haneli kodu gir, gizlilik/KVKK metnini onayla.
Hesap silme (5.1.1(v)): Profil sekmesi > "Hesabım ve verilerim" > "Hesabımı sil".
  Doğrulama için demo telefonuna kod gönderilir; talep 30 gün beklemede kalır ve uygulamadan geri alınabilir.
Veri indirme: aynı ekranda "Verilerimi indir".
Kamera/mikrofon: Öğrenci > Soru sor. Bildirimler: Bugün ekranındaki izin kartı.
Abonelik (yalnız kurum sahibi): Profil > Abonelik. İnceleme hesabı sahibi değildir; abonelik ekranı görünmez.
Uygulama bir kurum ya da öğretmen daveti gerektirir; herkese açık kayıt yoktur.
```

Sahip rolü ve abonelik satın alma akışını inceleme ekibinin görmesi gerekiyorsa (Apple 3.1.1 uygulama içi satın alma testi) üçüncü bir "sahip" demo hesabı ve mağaza sandbox/test ürünü gerekir.

## 7. Gönderim öncesi denetim listesi

- [ ] Gizlilik politikası, destek ve hesap silme URL'leri canlı.
- [ ] `magaza-gizlilik.md` cevapları App Store Connect ve Play Console formlarına girildi; hukuk danışmanı onayı alındı.
- [ ] Demo hesaplar (bölüm 6) ve inceleme notu hazır.
- [ ] `eas build --profile production` sırasında `uretimDenetimi` geçti (sahte api yok, https).
- [ ] Ekran görüntüleri (bölüm 5) her boyutta yüklendi.
- [ ] Abonelik ürünleri ve RevenueCat mağaza bağlantıları oluşturuldu; yurt dışı işleyici listesine RevenueCat eklendi.
- [ ] Yaş derecelendirmesi ve hedef kitle anketleri (bölüm 4) dolduruldu.
