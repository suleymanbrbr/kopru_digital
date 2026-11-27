# KVKK: hesap silme, anonimleştirme ve kişisel veri dışa aktarma

Durum: uygulandı (paket K1, migration `0020`). Karar kaydı: [ADR 0010](../adr/0010-kullanici-duzeyi-olaylar-ve-kvkk-silme.md). Bağlam: KVKK m.7 (silme/anonimleştirme), m.11 (erişim ve silme hakkı), App Store kuralı (hesap uygulama içinden silinebilmeli).

> **Proje sahibi onayı bekliyor** etiketi taşıyan kararlar makul varsayılanla uygulandı; hukuk danışmanı onayı sonrası değişebilir. Değişiklik yalnız bu dokümandaki sabitleri/listeleri etkiler.

## 1. Kavramlar: ayrılma, silme, anonimleştirme

| | Kurumdan ayrılma | Hesap silme (bu doküman) |
| --- | --- | --- |
| Kapsam | Tek kurumdaki **üyelik** (`uyelikler.durum = 'ayrildi'`) | Kullanıcının **tüm** kurumları ve hesabın kendisi |
| Hesap/giriş | Kalır; başka kurumlarda devam eder | Giriş yöntemleri ve oturumlar silinir; geri dönüş yok |
| Eğitim kayıtları | Kurumda kalır (kişi bağlantısı sürer) | Kurumda kalır, **kişi bağlantısı anonimleşir** |
| Geri alma | Kurum yeniden davet eder | Yalnız 30 günlük soğuma içinde |
| Tetikleyen | Kurum yöneticisi / öğrenci | Yalnız hesap sahibi (yeniden doğrulamayla) |

Hesap silme, tüm üyelikleri `ayrildi` yapmayı **içerir** ama onunla bitmez: kişisel alanlar da silinir.

## 2. Veri envanteri: ne silinir, ne anonimleşir, ne kalır

| Veri | Servis | Karar | Gerekçe |
| --- | --- | --- | --- |
| `kullanicilar`: ad, soyad, görünen ad, telefon, e-posta, avatar, doğrulama zamanları | api | **Silinir (NULL)**; satır `durum='silindi'`, `anonimlestirildi_at` dolar; id kalır | Kimlik tanımlayıcıları; id yabancı anahtarlar için gerekir (anonim) |
| `hesaplar` (Apple/Google/telefon/parola özeti), `oturumlar`, `dogrulamalar`, `otp_istekleri` (ilgili tanımlayıcı) | api | **Silinir** | Giriş verisi; amacı bitti |
| `uyelikler`: `gorunen_ad`, `ogrenci_no` | api | **Silinir (NULL)**; üyelik `ayrildi` olur (kurucu tek sahip kurumunda aşağıya bak) | Kişisel alan |
| `ogrenme.ogretmen_degerlendirmeleri` (öğrenci hakkında yazılan: yorum, ölçekler, görünürlük) | api | Hesabı silinen kişi **öğrenci** ise hakkındaki değerlendirmeler **silinir** (satır silinir; yorum serbest metin kişisel veri içerebilir). Hesabı silinen kişi **yazar öğretmen** ise değerlendirme **kalır** (kurumun eğitim kaydı), yazar üyeliği anonimleştiği için yazar adı boş döner | Serbest metin kişisel veri içerebilir; öğrenci hakkındaki kayıt öğrencinin kişisel verisidir. Öğretmenin kaydı kurumun koçluk geçmişidir |
| `ogrenme.kaynak_onerileri` | api | Öğrenci silinirse ona yapılan öneriler (başlık, bağlantı, not) **silinir**; öneren öğretmen silinirse öneri **kalır**, öneren anonim | Aynı gerekçe |
| Yoklama notu, ders geri bildirim notu, ödev öğrenci notu, deneme notu, ödeyen telefonu, soru mesajı metni | api | **Silinir** (NULL; soru mesajı `[silindi]`) | Serbest metin kişisel veri içerebilir |
| Davet satırları (`hedef_telefon_e164`, `hedef_eposta`, `hedef_ad`) | api | **Silinir**, `kanal='baglanti'` | Kabul eden kullanıcıya ait iletişim |
| Yoklama, ödev sonuçları, deneme net/puanları, soru/cevap kayıtları (metin dışı), plan görevleri | api | **Kalır** (üyelik kimliği anonim hesaba bağlı) | Kurumun eğitim hizmeti kaydı; kişiyle bağlantı yok |
| Finans: tahsilat, bakiye ve kredi defterleri, paket satışları | api | **Kalır**, bağlantı anonim | Yalnız-ekleme defter; VUK m.253 ve 6102 s. TTK m.82 uyarınca 10 yıl saklama; ters kayıt dışında değişmez ([ADR 0007](../adr/0007-para-ve-defterler.md)) |
| Abonelik, ödeme ve e-Arşiv fatura | api | **Kalır** | Vergi mevzuatı (10 yıl); fatura kurumun varlığıdır, kullanıcıya ait değildir |
| `rizalar` (KVKK onay/ret/geri çekme) | api | **Kalır**, yalnız `ip` ve `user_agent` silinir | Veri sorumlusunun rıza ispat yükümlülüğü ve hak düşürücü süre içinde savunma (KVKK m.5/2-e); kayıt kimlik, metin sürümü, özet ve zamandan ibaret. **Proje sahibi onayı bekliyor** (alternatif: 10 yıl yerine 5 yıl sonra silmek) |
| `silme_talepleri` | api | **Kalır** | Silmenin yapıldığının ispatı; kişisel veri yok |
| Denetim kayıtları (`denetim_kayitlari`) | api | **Kalır** | Güvenlik kaydı; yalnız kimlik ve eylem, kişisel alan yok |
| `kullanici_kopyalari` | bildirim | **Silinir**; id + `durum='silindi'` işareti kalır (geç gelen `degisti` olayı satırı geri getirmesin) | Kopya amacını yitirdi |
| Cihazlar (push belirteci), tercihler, ayarlar, gelen kutusu, zamanlanmış bildirimler, duyuru alıcı satırları, gönderim günlüğü | bildirim | **Silinir** | Kişiye özel; yasal saklama nedeni yok |
| Karakter adı | motivasyon | **Anonimleşir** (`Anonim`) | Serbest metin |
| "Haftanın yıldızı" gerekçesi, odak oturumu cihaz bilgisi | motivasyon | **Silinir** (NULL) | Serbest metin / cihaz bilgisi |
| XP defteri, seviye, rozet, seri, sayaçlar, beceri puanları | motivasyon | **Kalır (anonim)** | `ogrenci_id` üyelik kimliğidir; hesap anonimleşince kişiye bağlanamaz. Defter yalnız-ekleme; kurumun sıralama/toplamları bozulmaz. (Şema dokümanındaki "satırlar silinir" planından sapma) |
| Öğrenci yüklediği dosyalar: soru fotoğrafı/çizimi/sesi, ödev teslim fotoğrafı, avatar | medya | **Silinir** (`silinecek_at = now()`; silme işi S3 nesnesini ve küçük resimleri kaldırır, satır `silindi` olur) | Kişisel içerik (el yazısı, yüz) |
| Öğretmenin yüklediği soru cevap fotoğrafı/sesi/çizimi | medya | **Silinir** (sahibi silinen hesap) | **Proje sahibi onayı bekliyor**: alternatif "öğrencinin sorusu için kurum içeriği olarak kalsın" |
| `odev_eki` (ödev materyali), `plan_eki` (hazır haftalık plan dosyası), `kurum_logosu`, `fatura_pdf` | medya | **Kalır** | Kurum varlığı; kişisel veri taşımaz; fatura vergi mevzuatı |
| `ortak.medya_dosya_kopyalari` | api | `medya.dosya.silindi` olayıyla `durum='silindi'` | Mevcut tüketici |

### Kurum ve üyelik kuralları

- Kullanıcı bir kurumun **tek aktif sahibi** değilse üyeliği `ayrildi` olur ve kurum etkilenmez.
- Kullanıcı bir kurumun **tek aktif sahibi ve kurumda başka aktif üye yoksa** (tipik: tek kişilik `bireysel` kurum) kurum **kapatılır** (`durum='kapali'`, `kapatildi_at`; `hesap.kurum.degisti` yayımlanır; medya 90 gün sonra dosyaları siler). Anonim sahip üyeliği kapalı kurumda kalır (son sahip koruma tetikleyicisi).
- Kullanıcı bir kurumun **tek aktif sahibi ve kurumda başka aktif üye varsa** silme **engellenir** (`409 kurum_sahibi_engeli`, `details.kurumlar[]`). Çözüm: başka bir kullanıcıyı sahip yapmak ya da kurumun kapatılması için destekle iletişim (kurum kapatma/devretme ekranı henüz yok; **proje sahibi onayı bekliyor**). Gerekçe: aksi halde kurum, öğrencileri ve ödemeleriyle sahipsiz kalır; sessizce kurum kapatmak başkalarının verisine erişimini keser.
- Engel soğuma sırasında oluşursa (başka sahip ayrıldı, yeni üye geldi) iş talebi `engellendi` yapar (`engel_nedeni='kurum_sahibi_engeli'`), hesaba dokunmaz; kullanıcı durum ucunda görür ve yeniden talep eder.
- Aktif mağaza aboneliği (App Store / Google Play) mağaza tarafında kullanıcı tarafından iptal edilmelidir; hesap silme faturalamayı durdurmaz. Arayüz bunu uyarır.

## 3. Akış ve soğuma süresi

```
kullanici --POST kod-gonder (OTP) / parola--> yeniden doğrulama
          --POST silme-talebi-->  talep(beklemede, planlanan_at = talep_at + 30 gün)
   (30 gün içinde) --DELETE silme-talebi--> talep(geri_alindi)       # normal kullanıma devam
   (planlanan_at geçti) worker (saatlik) --> anonimleştirme (tek işlem) --> talep(tamamlandi)
        --> outbox: hesap.kullanici.silindi.v1 --> bildirim, motivasyon, medya temizler
        --> oturumların sid'leri iptal listesine yazılır (erişim belirteçleri anında 401)
```

- **Soğuma 30 gün** (`SILME_SOGUMA_GUN`): yanlışlıkla/ele geçirilmiş hesapla silme riskine karşı koruma, App Store/KVKK pratiğiyle uyumlu. Süre içinde hesap normal çalışır, oturumlar sürer; geri alma tek çağrıdır. **Proje sahibi onayı bekliyor** (7/14 gün de savunulabilir).
- Talep geri alınırsa veri hiç değişmemiştir. Geri alınmış talep işlenmez. Kullanıcı sonra yeniden talep edebilir (yeni 30 gün).
- Tek aktif talep (kısmi benzersiz dizin). Taklit (impersonation) oturumu talep açamaz/geri alamaz (`403 taklit_salt_okunur`).
- **Yeniden doğrulama:** talep açarken `dogrulama` zorunludur: `{yontem:'otp', kod}` (kendi telefonuna `kod-gonder` ile gönderilen 6 haneli kod; saatte 5 sınır) ya da `{yontem:'parola', parola}` (e-posta/parola hesapları). Kullanılabilir yöntemler durum ucunda döner. Geri alma için yeniden doğrulama gerekmez (zararsız yön). Çalıntı oturumla hesabı sildirmeyi engeller.
- İş idempotenttir ve tek işlemdir; yarıda kalırsa geri alınır, sonraki turda yeniden denenir. Çoklu worker güvenlidir (`FOR UPDATE SKIP LOCKED`).
- Soğuma bitiminde kullanıcıya bilgilendirme gönderilmez (iletişim bilgisi silinmiş olur); talep anında e-posta/SMS bildirimi bildirim servisi geldiğinde eklenecek. **Proje sahibi onayı bekliyor.**

## 4. 18 yaş altı notu

Faz 1'de veli arayüzü yok. 18 yaş altı bayrağı olan öğrencinin hesabını silme hakkını kullanabilmesi için **veli/vasi onayı** gerekip gerekmediği hukuki karardır: varsayılan olarak öğrenci kendi hesabını silebilir (silme, veri sorumlusunun yükümlülüğü ve veli onayı veri **toplamaya** ilişkindir; silmeyi engellemez). Veli adına silme talebi (veli_ogrenci ilişkisiyle) Faz 2'de veli uygulamasıyla gelir; o zamana kadar veli, kurum yöneticisine başvurur. **Proje sahibi onayı bekliyor.** Rıza kaydında `veli_kullanici_id` anonimleşmez (ilgili kayıt kimlik içerir, ad/telefon içermez).

## 5. Olaylar

| Olay | Zarf `kurumId` | Yük | Tüketici |
| --- | --- | --- | --- |
| `hesap.kullanici.degisti.v1` | nil UUID (`KULLANICI_DUZEYI_KURUM_ID`) | `kullanici_id`, `dil`, `durum`, `degisen_alanlar[]` (`olusturuldu`, `gorunen_ad`, `dil`, `durum`; **değer taşımaz**) | `bildirim.kullanici` (`kullanici_kopyalari`) |
| `hesap.kullanici.silindi.v1` | nil UUID | `kullanici_id`, `uyelik_idleri[]`, `anonimlestirildi_at` | `bildirim.kullanici`, `motivasyon.kvkk`, `medya.kvkk` |

`degisti` kullanıcı oluşturulunca (Better Auth `create.after`) ve `PATCH /v1/hesap/ben` ile görünen ad/dil değişince yayımlanır. Görünen ad olaya girmez; gerekirse `api` iç ucundan alınır. Tüketiciler `kiraci:'yok'` ve sistem rolüyle çalışır (ADR 0010). Silme sırasında ayrıca `hesap.uyelik.degisti` (`ayrildi`) ve (kurum kapanırsa) `hesap.kurum.degisti` yayımlanır; mevcut kopya tüketicileri bunları işler.

## 6. HTTP uçları (web ve mobilin kullanacağı akış)

Hepsi `/v1/hesap/ben/...`, kullanıcı JWT'si, `rizaMuaf` (KVKK metnini onaylamamış kullanıcı da kullanır).

| Uç | Amaç |
| --- | --- |
| `GET /ben/silme-talebi` | `{talep, soguma_gun, engeller[], dogrulama_yontemleri[]}`. Ekran açılışında çağrılır; `engeller` doluysa "sil" düğmesi yerine açıklama gösterilir |
| `POST /ben/silme-talebi/kod-gonder` | Kendi telefonuna OTP (`dogrulama_yontemleri` içinde `otp` varsa) |
| `POST /ben/silme-talebi` | Gövde `{dogrulama:{yontem:'otp',kod}\|{yontem:'parola',parola}, kaynak:'web'\|'ios'\|'android'}`; `201 {talep}`. Hatalar: `401 kod_gecersiz`, `409 kurum_sahibi_engeli`, `409 silme_talebi_var`, `429 cok_fazla_istek` |
| `DELETE /ben/silme-talebi` | Bekleyen talebi geri al (`200 {talep}`; yoksa `404`) |
| `GET /ben/verilerim` | Kişisel veri JSON'u (`Content-Disposition: attachment`); dakikada 5 çağrı |
| `PATCH /ben` | `{gorunen_ad?, dil?}` |

**Mobil akış (mağaza paketi için):** Ayarlar > Hesabım > "Hesabımı sil" → durum ucu (engel varsa açıklama + destek bağlantısı) → yöntem seçimi (OTP: `kod-gonder`, kod girişi; ya da parola) → onay metni (30 gün, geri alınabilir, mağaza aboneliğini ayrıca iptal et) → `POST silme-talebi` → "Silinme planlandı: <planlanan_at>" ve "Talebi geri al" düğmesi (`DELETE`). Oturum açılırken talep varsa ana ekranda bir bilgi şeridi gösterilir. Soğuma bitince erişim belirteci `401` döner; uygulama oturumu kapatıp giriş ekranına gider. App Store 5.1.1(v) için akış uygulama içindedir ve web sayfasına yönlendirmez. İstemci tipleri `@kopru/api-client` içindedir.

## 7. Kişisel veri dışa aktarma

**Karar: `api` toplar** (ADR 0010). `GET /v1/hesap/ben/verilerim` yanıtı:

- `hesap`: kullanıcı satırı (ad, telefon, e-posta, dil, durum, tarihler); parola/belirteç yok.
- `bolumler`: `rizalar`, `uyelikler`, `yoklamalar` (öğretmenin `ogretmene_ozel` notları **hariç**: not yalnız `ogrenciye` görünürlükteyse dahil; **proje sahibi onayı bekliyor**), `ders_geri_bildirimleri`, `odevler`, `degerlendirmeler` (öğrenci yalnız **kendisine görünür** işaretlenenleri alır, geri çekilenler yok; öğretmen kendi yazdığı tüm değerlendirmeleri), `kaynak_onerileri` (öğrenci kendine önerilenler, öğretmen kendi önerdikleri), `sorular`, `soru_mesajlari` (kendi yazdıkları), `denemeler`, `sinif_katilim_istekleri`. Her satırda `kurum_id`; yalnız kullanıcının kendi üyelik kimlikleriyle eşleşenler.
- `servisler`: `motivasyon` (XP özeti, hareketler, karakter, rozet, odak, haftanın yıldızı), `bildirim` (kopya, cihaz bilgisi (belirteç yok), tercih, ayar, gelen kutusu), `medya` (dosya kayıtları: tür, boyut, durum; depolama anahtarı yok, içerik `GET /v1/dosyalar/{id}` ile).
- `eksik_servisler`: ulaşılamayan/yapılandırılmamış servisler (kısmi sonuç; istemci kullanıcıya bildirir ve yeniden dener).

Her servis kendi `POST /ic/kvkk/veri` ucunu sunar (gövde `{kurum_id, kullanici_id, uyelik_idleri}`; servis JWT'si `aud=<servis>`, `scope=kvkk.veri`; kurum bağlamında RLS'li uygulama rolü). Sapma: brief `GET /ic/kullanicilar/:id/veri` önermişti; kurumlar arası okuma sistem rolü gerektireceğinden kurum başına POST seçildi, böylece HTTP süreçleri RLS'i atlayamaz. Başka kullanıcı/kurum verisi sızmaz: api sorgularını kullanıcının üyelik kimlikleriyle ve kurum bağlamıyla (RLS) yapar; testler bunu doğrular. Dışa aktarma silinmiş hesapta çalışmaz (`401`).

## 8. Güvenlik ve izlenebilirlik

- Anonimleştirme `withSistem` içinde (`api_sistem`), denetim kaydı (`kvkk.hesap_sil`, hedef kullanıcı id'si, kişisel alan yok) aynı işlemde yazılır.
- Oturumların `sid`'leri commit sonrası NATS iptal listesine yazılır ([ADR 0008](../adr/0008-erisim-belirteci-iptali-sid-listesi.md)); yazım hatası işi bozmaz (oturum satırları silindi, pencere ≤ 15 dk).
- `rizalar` yalnız-ekleme kalır: tetikleyici yalnız `ip` ve `user_agent`'ın NULL'a çekilmesine izin verir, başka güncelleme/silmeyi reddeder.
- Loglara telefon/e-posta/ad yazılmaz; talep ve iş logları yalnız kimlik içerir.

## 9. Bilinen sınırlar

- Veri yedeklerinde (pgBackRest, NATS akışları) silinen veri yedek saklama süresi kadar kalır; yedekten geri yüklemede `silme_talepleri` tamamlanmış kayıtları yeniden uygulanmalıdır (operasyon prosedürü, üretim paketi).
- NATS `EVENTS` akışındaki eski olaylar kişisel veri taşımadığından ayrıca temizlenmez.
- Grup üyeliği ve atama satırları kapatılmaz; türetilmiş kopyalar üyelik `ayrildi` durumundan çalışır.
- E-posta/SMS ile silme talebi bildirimi bildirim servisi e-posta/SMS kanalı geldiğinde eklenecek.
