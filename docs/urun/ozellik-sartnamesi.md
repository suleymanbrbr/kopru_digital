# Özellik Şartnamesi — Kapsam, Kullanım ve Kalite Çıtası

> Kaynak: claude.ai'deki "Özellik Şartnamesi" dokümanından 7 Kasım 2026'da aktarıldı. Ürün kararları için bu dosya esastır; değişiklikleri burada yapın.

## Alınan kararlar

Kapsam dokümanına yazdığın yorumlar aşağıdaki kararlara çevrildi ve bu şartname bunlara göre yazıldı. En büyük değişiklik: **Faz 1'de veli tarafı yok**; sistemi öğrenci, öğretmen ve yöneticiler kullanır.

| Konu                                                                                                                  | Kararın                                                                             | Plana etkisi                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Veli                                                                                                                  | Faz 1'de veli kullanımı yok                                                         | Veli uygulaması ve rapor linki Faz 2'ye. Rol ve veri modeli hazır kalır. KVKK için uygulamaya ilk girişte aydınlatma ve onay ekranı (aşağıdaki karar) |
| Hedefleme ve dağıtım                                                                                                  | Katılıyorsun                                                                        | Sınıfa/gruba verilen iş her öğrenciye ayrı satır olur; sonradan katılana atama seçeneği                                                               |
| Yıl kapanışı                                                                                                          | Otomatik sınıf atlatma yok; öğrenci elle güncellenir veya yeniden eklenir           | Sihirbaz Faz 2+; Faz 1'de sınıf/kademe elle düzenlenir, öğrenci arşivlenir                                                                            |
| Çoklu ilişki                                                                                                          | Öğrenci birden çok grupta; öğretmen birden çok sınıf ve öğrenciyle                  | Çoka-çok atama modeli                                                                                                                                 |
| Müfredat                                                                                                              | Sürekli güncel olmalı                                                               | Sürümlü katalog + yönetim paneli + güncelleme süreci (Çekirdek bölümü)                                                                                |
| Fotoğraf maliyeti                                                                                                     | Mimari optimize edilmeli                                                            | Ayrı bölüm: istemcide sıkıştırma, doğrudan depolamaya yükleme, yaşam döngüsü kuralları                                                                |
| Hedef puan                                                                                                            | İlk aşamada yok                                                                     | Faz 2+ listesinde                                                                                                                                     |
| Optik form                                                                                                            | Sonraki faz                                                                         | Faz 2+                                                                                                                                                |
| Karakter, streak, XP, seviye, rozet                                                                                   | Kaliteli, öğrenciyi etkileyecek, düzgün tasarlanmış olmalı; karakterde **B veya C** | Evrilen yol arkadaşı (B) + Rive animasyonu (C) birleşik çözüm; motivasyon sistemi en ayrıntılı bölüm                                                  |
| Mesajlaşma                                                                                                            | Planlarda olsun, ilk aşamada yok                                                    | Faz 2+                                                                                                                                                |
| Otomatik SMS/WhatsApp                                                                                                 | Planlarda olsun, ilk aşamada yok                                                    | Faz 2+                                                                                                                                                |
| Öğretmen sabah özeti                                                                                                  | Olsun ama yalnız bugünkü dersler ve cevap bekleyen sorular                          | Ana ekran sade                                                                                                                                        |
| Erken uyarı, sınav geri sayımı, veli ödül sözleşmesi, QR yoklama, takvim aboneliği, sınav haftası modu, mezun vitrini | Gerek yok                                                                           | Kapsamdan çıktı                                                                                                                                       |
| Ders sonu geri bildirim                                                                                               | Mantıklı                                                                            | Faz 1                                                                                                                                                 |
| Widget, ortak sınıf hedefi, çalışma odası, konu haritası, paylaşım kartı, kaynak kitap takibi                         | Olabilir                                                                            | Faz 2+ listesinde, kapsamları yazılı                                                                                                                  |
| Yapay zekâ koç asistanı                                                                                               | Mantıklı                                                                            | Faz 2+ (veri biriktikten sonra), kapsamı yazılı                                                                                                       |
| KVKK onayı                                                                                                            | Uygulamaya girişte KVKK metni çıksın, kullanıcı kabul etsin; şimdilik bu yeterli    | İlk girişte aydınlatma + onay ekranı; sürümlü metin, onay kaydı saklanır                                                                              |
| Ders kayıtları                                                                                                        | Zoom/Drive kayıt linkleri için bir özellik, ilk fazda                               | Yeni modül: derse bağlı kayıt linkleri + “Kayıtlarım” sayfası; +2 hafta                                                                               |

## Şartname nasıl okunur

Her özellik aynı kalıpla yazıldı: **amaç**, **kim ve nerede kullanır**, **kullanım akışı**, **Faz 1 kapsamı**, **kalite çıtası** (lansman için ölçülebilir minimum), **sonraki iyileştirmeler** ve **kapsam dışı**. Kalite çıtası karşılanmadan özellik “bitti” sayılmaz.

**Tüm özellikler için ortak kalite kuralları**

- Her ekranın yükleniyor, boş (ilk kullanım) ve hata halleri tasarlanır. Boş ekran ne yapacağını anlatır (“İlk ödevini ver” butonu gibi).
- Sık yapılan işler en fazla 3 dokunuştur; kaydetme anında görünür (iyimser güncelleme), bağlantı yoksa kuyruğa alınır.
- Mobilde liste ve geçişler orta seviye bir Android telefonda akıcı (hedef 60 kare/sn); uygulama soğuk açılışı 3 saniyenin altında.
- Erişilebilirlik: sistem yazı boyutuna uyum, yeterli renk kontrastı, ekran okuyucu etiketleri, “hareketi azalt” ayarına saygı.
- Koyu ve açık tema. Türkçe karakterler ve sıralama (Ç, Ğ, İ, Ö, Ş, Ü) her yerde doğru.
- Her yazma işlemi denetim kaydına düşer; her liste sayfalanır ve aranabilir.
- Her özellik bir modüldür; kurum veya plan kapattığında menüden ve API'den kaybolur.

**Faz 1 roller**

| Rol      | Platform              | Faz 1'de ne yapar                                                              |
| -------- | --------------------- | ------------------------------------------------------------------------------ |
| Sahip    | Web + mobil           | Kurumu kurar, abonelik, öğretmen/yönetici ekler, her şeyi görür                |
| Yönetici | Web + mobil           | Sınıf/grup, öğretmen atamaları, öğrenciler, duyurular, kurum raporları         |
| Öğretmen | Mobil ağırlıklı + web | Ders, yoklama, ödev, plan, deneme, soru cevaplama, paket ve tahsilat           |
| Öğrenci  | Mobil ağırlıklı + web | Programı, ödevleri, görevleri, soru sorma, karakteri, serisi, deneme sonuçları |
| Veli     | —                     | Faz 1'de yok                                                                   |

Solo hoca hem sahip hem öğretmen rolündedir ve kurum menülerini (şube, kademe, öğretmen ataması) görmez.

## Çekirdek

### Hesap ve kurum kurulumu

**Amaç:** Bir hocanın 3 dakikada kayıt olup ilk öğrencisini ekleyebilmesi.

**Akış:** Telefon veya e-posta (ya da Apple/Google) ile kayıt → “Nasıl çalışıyorsun?” (birebir ders / grup dersleri / koçluk / kurum) → branş ve sınav türü (LGS, YKS, ara sınıf) → kurum adı ve logo (atlanabilir) → ilk öğrenciyi ekle veya demo veriyle gez.

**Faz 1 kapsamı:** OTP ile giriş, Apple ve Google ile giriş, şifre sıfırlama, kurum tipine göre hazır ayar şablonu (hangi modüller açık gelir), logo ve vurgu rengi, birden çok kuruma üyelik ve kurum değiştirici, ilk girişte KVKK aydınlatma ve onay ekranı (kabul edilmeden devam edilemez; metin sürümü değişince yeniden gösterilir; kim, ne zaman, hangi sürümü onayladı saklanır), hesap silme, oturum yönetimi (açık cihazları görme, çıkış yaptırma).

**Kalite çıtası:** Kayıttan ilk öğrenci eklemeye medyan süre < 3 dk; OTP SMS'i 10 sn içinde; kurulum her adımda yarıda bırakılıp kaldığı yerden devam edilebilir.

**Sonraki iyileştirmeler:** İlk hafta için rehberli görev listesi (“ilk dersini planla, ilk ödevini ver”), Excel'den toplu öğrenci aktarımı, kurumsal tek oturum açma.

**Kapsam dışı:** Kurumların kendi alan adı, beyaz etiket uygulama.

### Kurum yapısı: gruplar, sınıflar, atamalar

**Amaç:** Birebir dersten okula kadar her yapıyı aynı modelle kurmak.

**Kim:** Sahip ve yönetici kurar; öğretmen kendi gruplarını oluşturabilir (kurum izin verirse).

**Akış (kurum):** Kademeleri seç (ör. 5–8. sınıf) → sınıf oluştur (6-A) → öğrencileri ekle → öğretmen ata (6-A · Matematik → Ayşe Hoca). **Akış (solo):** Öğrenci eklediğinde birebir grup arka planda oluşur; istersen “Grup oluştur” ile 2–15 kişilik grup kurarsın.

**Faz 1 kapsamı:** Grup tipleri (birebir, grup, sınıf, etüt), kademe kataloğu, öğretmen × grup × branş ataması, bir öğrencinin birden çok grupta, bir öğretmenin birden çok grup ve öğrenciyle ilişkisi, öğrenciyi arşivleme ve elle sınıf/kademe değiştirme, tek varsayılan şube.

**Kalite çıtası:** 30 kişilik sınıf oluşturup öğrencileri eklemek 2 dakikayı geçmez (çoklu seçim, yapıştırarak ekleme); bir öğretmen yalnız atandığı grupların verisini görür (otomatik testle kanıtlı).

**Sonraki iyileştirmeler:** Çoklu şube, yıl kapanışı sihirbazı, kuruma özel roller, rehber öğretmen rolü, sınıf bazlı ders programı (haftalık çizelge).

### Üye yönetimi ve davet

**Amaç:** Öğrenci ve öğretmenin hesabını güvenli ve zahmetsiz açmak.

**Akış:** Öğretmen öğrencinin adını ve telefonunu girer → sistem davet linki üretir → öğretmen linki WhatsApp'tan gönderir veya SMS ile gönderilir → öğrenci linke dokunur, uygulama açılır (yoksa mağazaya gider, kurulumdan sonra davet hatırlanır) → telefon doğrulama → karakterini seçer.

**Faz 1 kapsamı:** Tekil ve toplu davet, davet durumu (bekliyor/kabul edildi/süresi doldu), yeniden gönderme, sınıf davet kodu (öğrenci 8 karakterli kodla kendini sınıfa ekler, öğretmen onaylar; 6 haneli rakam tahmin edilebilir olduğu için 8 karakter seçildi), öğrenci profili (ad, sınıf, hedef sınav, notlar), 18 yaş altı bayrağı.

**Kalite çıtası:** Davetten aktif öğrenciye dönüşüm ölçülür, hedef %80+; derin link iOS ve Android'de kurulumdan sonra da çalışır.

### Müfredat kütüphanesi

**Amaç:** Ödev, plan, deneme ve soru sormanın bağlanacağı tek, güncel ders–ünite–konu ağacı.

**Faz 1 kapsamı:** LGS (5–8. sınıf), TYT, AYT, YDT ve 9–12. sınıf ders konuları; her konuda kademe, sınav türü ve sıra. Kurum kendi özel konusunu ekleyebilir. Konu seçimi her yerde aramalı ve son kullanılanlar üstte.

**Güncel tutma süreci:**

1. Katalog **sürümlüdür** (ör. “2026–2027 MEB/ÖSYM”). Bir konu silinmez, “kullanımdan kalktı” olarak işaretlenir; eski ödev ve denemeler bozulmaz.
2. Platform yönetim panelinde müfredat editörü: konu ekle, taşı, birleştir, değişiklik notu yaz.
3. Takvim: her Haziran–Ağustos yeni yıl gözden geçirmesi; ayrıca MEB öğretim programı veya ÖSYM sınav kapsamı değişikliğinde ara güncelleme. MEB'in yeni programa geçişi kademe kademe sürdüğü için ilk yıllarda daha sık güncelleme beklenmeli.
4. Sorumlu: sözleşmeli bir branş öğretmeni (konu listesi) + platform yöneticisi (yayın). Kurumlara “müfredat güncellendi” bildirimi gider.

**Kalite çıtası:** Lansmanda tüm sınav türleri eksiksiz; konu seçimi 2 dokunuş/aramayla; değişiklik geçmişi izlenebilir.

**Sonraki iyileştirmeler:** Kazanım (öğrenme çıktısı) düzeyinde ayrıntı, konu başına sınavda çıkma sıklığı bilgisi, konu haritası görselleştirmesi.

## Operasyon

### Takvim ve dersler

**Amaç:** Hocanın haftasını tek yerde görmesi; öğrencinin ders saatini bilmesi.

**Kim, nerede:** Öğretmen mobilde günlük liste, web'de haftalık görünüm; öğrenci kendi dersleri; yönetici tüm kurumun takvimi.

**Akış:** “+” → öğrenci veya grup seç → gün, saat, süre → “her hafta tekrarla” (bitiş tarihi) → kaydet. Erteleme: derse uzun bas → “taşı” → yeni saat; öğrenciye push gider.

**Faz 1 kapsamı:** Tekil ve tekrarlayan ders, birebir ve grup dersi, çevrimiçi ders linki alanı, konum notu, öğretmen için çakışma uyarısı, iptal (öğrenci/öğretmen kaynaklı ayrımı), erteleme, telafi dersi işareti, ders öncesi hatırlatma (öğrenciye ve öğretmene, varsayılan 1 saat önce).

**Kalite çıtası:** Tekrarlayan ders 4 dokunuşta; seride “yalnız bu ders / bu ve sonrakiler” değişikliği doğru çalışır; saat dilimi ve yaz saati hatası yok; takvim 200 dersle açılışta 300 ms içinde.

**Sonraki iyileştirmeler:** Sürükle-bırak taşıma (web), öğretmen müsaitlik saatleri, kurum geneli ders çizelgesi, oda/derslik çakışması.

### Yoklama

**Amaç:** Ders bittiğinde 3 dokunuşta kayıt; paket ve oyunlaştırmanın güvenilir veri kaynağı.

**Akış:** Ders saati gelince öğretmenin ana ekranında “Yoklama al” → birebirde tek dokunuş “Geldi”; grupta liste, varsayılan herkes “geldi”, yalnız gelmeyenler işaretlenir → isteğe bağlı kısa ders notu → kaydet.

**Faz 1 kapsamı:** Geldi / gelmedi / izinli / geç kaldı; paketten otomatik ders düşümü; sonradan düzeltmede otomatik iade; gelecek derse yoklama engeli; çevrimdışı kuyruk; “geldi” olayı öğrenciye XP verir; ders notu öğrenciye görünür veya öğretmene özel olarak işaretlenir.

**Kalite çıtası:** Birebirde 3, 20 kişilik grupta 10 saniyenin altında; aynı yoklama iki kez gönderilse kredi bir kez düşer; çevrimdışı alınan yoklama bağlantı gelince 1 dk içinde eşitlenir.

**Sonraki iyileştirmeler:** Yoklama alınmamış dersler için akşam hatırlatması, devamsızlık raporu, kurum için devamsızlık eşiği.

### Paket, kredi ve tahsilat

**Amaç:** “Kaç dersimiz kaldı?” ve “Kim ne kadar borçlu?” sorularını bitirmek.

**Kim:** Öğretmen (kendi öğrencileri), sahip/yönetici (tüm kurum). Öğrenci yalnız kalan ders sayısını görür (kurum ayarıyla gizlenebilir); fiyat ve borç görmez.

**Akış:** Öğrenci kartı → “Paket sat” → hazır paket seç (ör. 8 ders, 6.000 ₺) → ödeme alındı mı? (tamamı/kısmi/sonra) → kaydet. Tahsilat: “Ödeme al” → tutar, yöntem (nakit, havale, kart) → kaydet.

**Faz 1 kapsamı:** Paket şablonları, paketsiz ders için ders başı ücret, değiştirilemez kredi defteri, cari bakiye, kısmi ödeme, ödeme iptali (ters kayıt), kalan ders rozeti (2 ders kaldı sarı, 0 kırmızı), aylık gelir özeti, Excel dışa aktarım. Faz 1'de veli hesabı olmadığı için ödeyen kişinin adı ve telefonu öğrenci kartında düz bilgi olarak tutulur; ödeme hatırlatması öğretmenin elle WhatsApp'tan göndereceği hazır metinle yapılır.

**Kalite çıtası:** Bakiye her zaman defterden yeniden hesaplanabilir ve tutar; kuruş yuvarlama hatası yok; finans uçlarının test kapsamı %95+.

**Sonraki iyileştirmeler:** Veliden online ödeme, taksit/senet, kurum muhasebe raporları, öğretmen hakediş hesabı (kurumda öğretmenin ders başı ücreti).

## Akademik

### Ödev

**Amaç:** Ödevi vermek, kimin yaptığını görmek ve geri bildirim vermek; Excel ve WhatsApp listelerini bitirmek.

**Akış (öğretmen):** “Yeni ödev” → hedef (öğrenci, grup, sınıf, kademe) → ders ve konu → tür (soru sayısı / sayfa / serbest metin) → kaynak (isteğe bağlı: “X Yayınları Test 4”) → teslim tarihi → ek dosya (PDF/fotoğraf) → gönder. **Akış (öğrenci):** Bildirim → ödev kartı → çözüp “Teslim et” → doğru/yanlış/boş sayısı ve isteğe bağlı fotoğraf → XP kazanır.

**Faz 1 kapsamı:** Hedefleme ve her öğrenciye ayrı durum satırı, sonradan katılana atama seçeneği, teslim (sayı + fotoğraf), öğretmen değerlendirmesi (onay, kısa yorum, yeniden yap), gecikme işareti, ödev şablonları (tekrar kullanım), öğretmen için özet (kim teslim etti, ortalama doğru oranı), teslim tarihinden önceki akşam hatırlatma.

**Kalite çıtası:** Sınıfa ödev vermek 30 saniyenin altında; öğretmen 30 kişilik sınıfın teslim durumunu tek ekranda görür; öğrenci teslimi 3 dokunuşta.

**Sonraki iyileştirmeler:** Konu bazında başarı ısı haritası, ödevden hata defterine aktarma, kaynak kitap takibi ile bağlantı, yapay zekâ ile fotoğraftan sayı okuma.

### Haftalık plan

**Amaç:** Koçluğun omurgası: öğrencinin haftasını planlamak, planlanan ile gerçekleşeni karşılaştırmak.

**Akış (öğretmen, web'de rahat):** Öğrenci seç → hafta (Pazartesi–Pazar) → günlere görev ekle (ders, konu, hedef soru sayısı veya dakika) → şablondan kopyala veya geçen haftayı çoğalt → yayınla. Alternatif: hazır planı resim/PDF olarak yükle. **Akış (öğrenci, mobilde):** “Bugün” ekranında günün görevleri → göreve dokun → çözdüğü sayıyı gir veya odak sayacını başlat → tamamlandı.

**Faz 1 kapsamı:** Görev oluşturma, şablonlar, haftayı kopyalama, gruba toplu plan, tamamlanmayan görevi sonraki güne taşıma (öğrenci önerir, öğretmen görür), haftalık planlanan/gerçekleşen özeti (ders bazında), öğretmen notu, PDF/resim yükleme. Öğrenci hedefi değiştiremez, yalnız gerçekleşeni girer.

**Kalite çıtası:** Bir öğrencinin haftasını şablondan kurmak 2 dakikayı geçmez; öğrencinin günlük görev girişi tek ekranda; hafta sonu özeti otomatik.

**Sonraki iyileştirmeler:** Yapay zekâ ile deneme sonuçlarından plan taslağı, sürükle-bırak plan düzenleyici, öğrencinin kendi planını önerip öğretmenin onaylaması.

### Deneme analizi

**Amaç:** Deneme sonuçlarını tek yerde toplamak ve gelişimi göstermek.

**Akış:** Öğretmen “Deneme ekle” → tür (LGS, TYT, AYT, YDT veya özel) → ad ve tarih → öğrenci(ler) → ders bazında doğru/yanlış/boş → net otomatik hesaplanır. Öğrenci de kendi sonucunu girebilir (öğretmen onayıyla). Grupta: tablo görünümünde hızlı giriş veya Excel'den yükleme.

**Faz 1 kapsamı:** Sınav türlerine göre ders şablonu ve net formülü (yanlışın doğruyu götürme oranı sınava göre), ders bazında trend grafiği, son 5 denemeye göre gelişim, sınıf ortalaması (öğretmen ve yöneticiye), öğrenciye kendi gelişim grafiği, net artışı XP verir. Toplu giriş için Excel şablonu.

**Kalite çıtası:** 30 öğrencinin tek bir denemesini girmek tablo görünümünde 10 dakikayı geçmez; net hesabı resmi formüllerle birebir; grafikler mobilde okunaklı.

**Sonraki iyileştirmeler:** Konu bazında yanlış analizi (soru–konu eşleşmesi), hedef puan ve bölüm/lise farkı, optik form içe aktarımı, deneme sonrası otomatik plan önerisi.

## Soru sor

**Amaç:** Öğrenci takıldığı an yardım alır; öğretmen yükünü kontrol ederek hızlı ve zengin cevap verir. Rakipten en net ayrışabileceğimiz özellik.

**Akış (öğrenci):** “Soru sor” → kamera (otomatik kenar algılama, kırpma, döndürme; en fazla 3 fotoğraf) → ders ve konu (son seçilen önerilir) → “burada takıldım” notu veya fotoğrafın üzerine işaret → gönder → tahmini cevap süresini görür → cevap gelince push.

**Akış (öğretmen):** Ana ekranda “Cevap bekleyen sorular (4)” → soruyu aç → cevap türü seç: metin, kendi çözümünün fotoğrafı, fotoğrafın üzerine çizerek açıklama, sesli anlatım (en fazla 3 dk; çizimle birlikte kaydedilebilir), “derste konuşalım” → gönder.

**Faz 1 kapsamı:**

- Soru yönlendirme: öğrencinin o branştaki atanmış öğretmeni; kurumda isteğe bağlı branş soru masası (ilk üstlenen cevaplar).
- Cevap türleri: metin, fotoğraf, fotoğraf üzerine çizim, ses. Çizim + ses birlikte “mini anlatım” olarak oynatılır.
- Öğrenci tepkisi: “anladım” / “hala anlamadım” + takip sorusu (aynı başlıkta).
- Kota: öğrenci başına günlük ve haftalık limit (öğretmen/kurum ayarı), plan üst sınırı.
- Öğretmen durumu: “müsait / bugün cevap veremiyorum”; tahmini cevap süresi geçmiş ortalamadan hesaplanır.
- Kuyruk: filtre (branş, öğrenci, en eski), öğretmenin cevapladığı soru arşivi.
- Öğrencinin kendi soru arşivi (ders ve konuya göre, aranabilir).
- Soru sormak ve “anladım” demek küçük XP verir (günlük tavanlı, spamı ödüllendirmez).
- Yönetici yazışmaları görüntüleyebilir; uygunsuz içerik bildirimi.

**Kalite çıtası:**

- Fotoğrafı çekip göndermek 20 saniyenin altında; zayıf bağlantıda yükleme arka planda devam eder ve yarıda kalırsa kaldığı yerden sürer.
- Çizim akıcı (kalem gecikmesi hissedilmez), geri al/yinele, 3 renk ve silgi; ses kaydı net (gürültü bastırma), oynatırken çizim senkron.
- Fotoğraf okunaklı kalırken ortalama 250–400 KB; ses 3 dk için \~1 MB.
- Kurum panelinde ölçülür: ortalama cevap süresi, “anladım” oranı.

**Sonraki iyileştirmeler:** Kısa ekran videosu cevabı; yapay zekânın öğretmene ipucu/çözüm taslağı önermesi (öğretmen onayıyla); benzer soru daha önce cevaplandıysa öğrenciye gösterme; cevaplanan soruyu tek dokunuşla hata defterine ekleme; canlı görüntülü mini oturum.

**Kapsam dışı:** Herkese açık soru havuzu, başka öğrencilerin sorularını görme (telif ve gizlilik nedeniyle).

## Ders kayıtları ve materyaller

**Amaç:** Öğretmenin Zoom, Google Drive veya YouTube'a yüklediği ders kayıtlarının WhatsApp yazışmalarında kaybolmasını bitirmek. Öğrenci tüm kayıtlarını tek yerde, hangi derse ve konuya ait olduğuyla birlikte bulur. Faz 1'e eklendi.

**Sayfa mı, özellik mi? İkisi birden.** Kayıt, ait olduğu **derse bağlanır** (ders kartında “Kayıt” alanı) ve öğrencinin **“Kayıtlarım” sayfası** bu bağlantıları toplar. Böylece tarih, ders, öğretmen ve konu bilgisi kendiliğinden gelir; öğretmen ayrı bir yerde liste yönetmez.

| Seçenek                                        | Artı                                                                                        | Eksi                                                                       | Karar                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| A. Yalnız link sayfası (kütüphane)             | En basit                                                                                    | Kayıt dersle ve konuyla bağlantısız; zamanla dağınık bir liste olur        | Hayır                          |
| **B. Derse bağlı link + “Kayıtlarım” sayfası** | Bağlam korunur; kayıt eklenince doğru öğrencilere bildirim; maliyet yok (video bizde değil) | Link izinleri öğretmenin elinde; izleme süresi ölçülemez                   | **Faz 1**                      |
| C. Videoyu kendi sunucumuzda barındırma        | En iyi izleme deneyimi, izleme takibi                                                       | Video depolama ve bant genişliği maliyeti çok yüksek; dönüştürme altyapısı | Belki ileride ücretli ek paket |
| D. Zoom ve Google Drive entegrasyonu           | Kayıt kendiliğinden derse düşer                                                             | OAuth, API izinleri ve inceleme süreleri                                   | Faz 2                          |

**Akış (öğretmen):** Ders bitince yoklama ekranında ya da ders kartında “Kayıt ekle” → linki yapıştır (birden çok link olabilir) → tür otomatik tanınır (Zoom, Drive, YouTube, OneDrive, diğer) → isteğe bağlı: konu, kısa not, Zoom kayıt şifresi, son erişim tarihi → kaydet. Dersteki öğrencilere “Matematik dersinin kaydı eklendi” bildirimi gider. Dersten bağımsız olarak bir gruba **materyal** de eklenebilir (PDF linki, Drive klasörü, konu anlatım videosu).

**Akış (öğrenci):** Bildirime dokun veya “Kayıtlarım” → ders, tarih ya da konuya göre filtrele (izlenmemişler üstte) → dokun → kayıt uygulama içi tarayıcıda açılır (şifre varsa tek dokunuşla kopyalanır) → “izledim” işaretler.

**Faz 1 kapsamı:**

- Derse ve gruba bağlı kayıt linkleri; gruba bağlı materyal linkleri; müfredat konusuna bağlama.
- Link türü tanıma ve ikon; geçersiz link uyarısı; Zoom şifresi alanı; son erişim tarihi (Zoom bulut kayıtlarının süresi dolabilir).
- Görünürlük: birebir derste yalnız o öğrenci, grup/sınıf dersinde grubun tüm üyeleri; yönetici kurumun tüm kayıtlarını görür.
- Öğrencide “izledim” işareti (küçük XP, günlük tavanlı); öğretmen ders kartında kimin izlediğini görür.
- “Açılmıyor” bildirimi: öğrenci tek dokunuşla bildirir, öğretmene uyarı gider (çoğu zaman Drive paylaşım izni sorunu).
- Öğretmene Drive linki eklerken kısa uyarı: “Paylaşım ayarını kontrol et; öğrencin erişemezse kaydı açamaz.”
- Gizlilik: kayıtlar öğrencinin yüzünü ve sesini içerebilir. Linkler yalnız ilgili öğrencilere gösterilir, aramalarda veya herkese açık sayfalarda yer almaz. Videonun kendisi bizde değil, öğretmenin hesabındadır.

**Kalite çıtası:** Kayıt eklemek yapıştır-kaydet ile 15 saniyenin altında; öğrenci 2 dokunuşta izlemeye başlar; 200+ kayıtlı listede filtreleme anında; bildirime dokununca doğrudan o kaydın sayfası açılır.

**Sonraki iyileştirmeler:** Zoom entegrasyonu (bulut kaydı bitince ders saatiyle eşleştirilip otomatik eklenir), Google Drive entegrasyonu (klasör seçimi, paylaşım iznini otomatik ayarlama), Google Meet kayıtları, kayda zaman damgalı bölümler, yapay zekâ ile kayıttan konu özeti, veli görünürlüğü (Faz 2), kendi video barındırma (ek paket).

**Kapsam dışı (Faz 1):** Video yükleme ve barındırma, izleme süresi takibi, canlı ders (Zoom'un yerine geçmek).

**Efor:** M (yaklaşık 2 hafta). Modül adı: `ders_kayitlari`.

## Motivasyon sistemi

Amaç: öğrencinin her gün gerçekten çalışmak için uygulamayı açması. Döngü: **çalış → XP kazan → karakter büyüsün ve seri uzasın → yarın tekrar gel.** Bu sistem ürünün imza özelliği olacağı için çizim, animasyon ve dengelemeye ayrı bütçe ve zaman ayrılır.

### Yol arkadaşı karakter (B + C)

**Karar:** Evrilen bir yol arkadaşı (seçenek B), Rive ile animasyonlu olarak (seçenek C). Karakter süs değil; öğrencinin çalışmasının canlı bir yansımasıdır.

**Konsept:**

- Kayıtta öğrenci 3 türden birini seçer ve ad verir (örnek yön: bir ateş yaratığı, bir robot, bir orman ruhu; adlar ve tasarımlar özgün çizilecek).
- Her tür **5 evrim aşamasından** geçer: tohum/yumurta → yavru → genç → usta → efsane (ör. seviye 1, 5, 12, 25, 40).
- **Yaş uyumu:** çizim yönü “sevimli ama havalı”. Ortaokul için daha yuvarlak ve renkli, lise için daha keskin ve sade varyantlar; kurum kademe bazında tür setini seçebilir.
- **Ders yetenekleri:** Sayısal, Sözel, Fen, Sosyal, Dil. Bir branşta kazanılan XP o yeteneği büyütür; her yetenek seviyesi karaktere görsel bir iz ekler (aura, aksesuar, renk). Profilde 5 köşeli yetenek grafiği: öğrenci ve öğretmen zayıf alanı karakterin üzerinde görür.
- **Ruh halleri ve animasyonlar:** bekleme, mutlu (görev tamamlanınca), kutlama (seviye/rozet), odak (odak sayacında yanında çalışır), uykulu (2+ gün çalışılmadıysa; suçlamadan “seni bekledim”), evrim sahnesi (tam ekran, titreşim).
- **Kostüm ve eşyalar:** çalışarak kazanılan şapka, aksesuar, arka plan, tema; seri kilometre taşları ve rozetlerle açılır. Gerçek parayla hiçbir şey satılmaz.
- **Yuva ekranı:** karakter, seviye çubuğu, yetenekler, seri alevi, son kazanımlar ve kostüm dolabı.

**Teknik yaklaşım:** Her tür için tek bir Rive dosyası; seviye, aşama, ruh hali ve yetenekler durum makinesine girdi olarak verilir. Dosyalar sunucudan indirilip önbelleğe alınır, böylece yeni tür ve kostüm uygulama güncellemesi beklemeden eklenir. Web ve mobilde aynı dosya kullanılır. Faz 0'da tek tür ve 3 animasyonla teknik prototip yapılıp düşük seviye Android cihazda performans doğrulanır.

**Üretim:** Bir illustratör + bir Rive animatörü (serbest çalışan). Teslimatlar: stil rehberi, 3 tür × 5 aşama = 15 tasarım, her tür için 6 animasyon durumu, 20–30 kostüm parçası, 30 rozet ikonu. Faz 1'in ilk haftalarında başlatılır, geliştirmeyle paralel yürür.

**Kalite çıtası:** Orta seviye Android'de 60 kare/sn; tür başına dosya < 1,5 MB; evrim sahnesi ≤ 4 sn ve atlanabilir; ses varsayılan kapalı; “hareketi azalt” açıkken statik görsel; tüm çizimler özgün, bilinen bir karaktere benzemez. Beta'da öğrencilerle kısa görüşmelerle “karakterini sevdin mi?” testi.

**Sonraki iyileştirmeler:** Yeni türler, sezonluk kostümler, yuva dekorasyonu, çalışma odasında arkadaşların karakterlerini görme, karakterin ana ekran widget'ında görünmesi.

### XP ve seviye

| Olay                             | XP (başlangıç değeri)                   | Kural                                 |
| -------------------------------- | --------------------------------------- | ------------------------------------- |
| Derse geldi (öğretmen yoklaması) | 20                                      | Doğrulanmış                           |
| Ödev teslim                      | 15; öğretmen onaylarsa +10              | Geç teslimde yarısı                   |
| Plan görevi tamamlandı           | 5                                       | Kendi beyanı; günlük tavan 40         |
| Odak sayacı                      | Dakikada 1                              | Günlük tavan 120                      |
| Deneme girildi                   | 10                                      |                                       |
| Bir derste net artışı            | Artış başına 5, deneme başına en çok 50 | Kişinin kendi geçmişine göre          |
| Soru sordu / “anladım” dedi      | 3 / 5                                   | Günlük tavan 20                       |
| Ders sonu geri bildirimi         | 2                                       |                                       |
| Öğretmenden “haftanın yıldızı”   | 50 + rozet                              | Öğretmen haftada sınırlı sayıda verir |

- Günlük toplam XP tavanı (başlangıçta 300). Şüpheli örüntüde (ör. 1 dakikada 10 görev) puan verilmez.
- **Seviye eğrisi hedefi:** ilk gün 2 seviye, ilk hafta ilk evrim, düzenli çalışanda \~2 ayda 3. aşama, dönem sonunda 4. aşama, efsane için bir yıl düzenli çalışma.
- XP kazanımı anında görünür: uçan “+15”, karakter tepkisi, hafif titreşim.
- Tüm değerler sunucuda ayar dosyasındadır; uygulama güncellenmeden dengelenir ve küçük gruplarda denenebilir.

### Streak (seri)

- **Günün sayılması için:** en az bir plan görevi, 20 dakika odak, bir ödev teslimi veya bir soru çözümü. Uygulamayı açmak yetmez.
- Gün gece 04:00'te döner (gece çalışan öğrenci cezalandırılmaz). Seri sunucuda hesaplanır; cihaz saatini değiştirmek işe yaramaz.
- **Dondurma hakkı:** her hafta 1 hak otomatik birikir (en fazla 2). Kaçırılan günde otomatik kullanılır.
- **Seriyi kurtarma:** hak yoksa, kaçırılan günden sonraki 24 saatte iki günlük hedefi tamamlayan seriyi kurtarır (ayda bir).
- **Öğretmen arası:** öğretmen gruba tatil/bayram aralığı tanımlar; seriler donar.
- **Kilometre taşları:** 3, 7, 14, 30, 60, 100, 365 gün → rozet ve kostüm.
- **Hatırlatma:** günün hedefi tamamlanmadıysa saat 20:00'de tek push (saat ve kapatma ayarlanabilir). 22:00–08:00 arası bildirim yok. Seri bozulunca suçlayan dil yok: “Rekorun 23 gün. Yeni seri bugün başlıyor.”
- **Kalite çıtası:** saat dilimi ve gece yarısı testleri, çevrimdışı yapılan çalışma eşitlenince güne doğru yazılır.

### Rozetler

- Lansmanda yaklaşık 30 rozet, beş kategori: süreklilik (seri), emek (toplam soru, odak saati), gelişim (net artışı), merak (soru sorma, “anladım”), özel (öğretmenin verdiği).
- Bronz, gümüş, altın kademeleri; kazanınca kutlama animasyonu; profilde seçilen 3 rozet vitrinde.
- Başkasıyla kıyaslayan rozet yok (“sınıf birincisi” gibi).

### Odak sayacı

- Modlar: 25/5, 50/10, serbest. Başlarken ders veya plan görevi seçilir; bitince süre göreve “gerçekleşen” olarak otomatik yazılır.
- Karakter odak animasyonuyla öğrencinin yanında “çalışır”.
- Süre başlangıç ve bitiş zamanından hesaplanır; ekran kapalıyken de doğru sayar. Tek oturum en fazla 3 saat.
- **Sonraki iyileştirmeler:** iOS Canlı Etkinlik ve Android sürekli bildirimde geri sayım, odak sırasında bildirimleri susturma önerisi, haftalık odak raporu.

### Ders sonu geri bildirimi

- Ders bittikten 10 dakika sonra öğrenciye: “Bugünkü ders nasıldı?” → anladım / kısmen / anlamadım + isteğe bağlı “zorlandığım konu”.
- Öğretmen ders kartında ve öğrenci profilinde görür; yönetici toplam oranları görür. Anonim değildir.
- Kalite çıtası: tek dokunuşla cevaplanır, bildirimden çıkmadan.

### Kurum kontrolleri ve ölçüm

- Kurum, kademe veya grup bazında motivasyon sistemi kapatılabilir; liderlik tablosu Faz 1'de yok.
- Ölçülecekler: öğrencinin 1., 7. ve 30. gün geri dönüş oranı, günlük aktif öğrenci, ortalama seri uzunluğu, plan tamamlama oranı. XP ve seri ayarları bu verilere göre düzenlenir.

## Ana ekranlar, bildirimler ve yönetim

### Öğretmen ana ekranı (“Bugün”)

**Kapsam (kararına göre sade):** bugünkü dersler (saat sırasıyla, yoklaması alınmamış olanlar işaretli, tek dokunuşla yoklama) ve cevap bekleyen sorular (sayı ve en eskisi). Altında hızlı eylemler: ders ekle, ödev ver, öğrenci ekle.

**Kalite çıtası:** Uygulama açılınca 1 saniyede dolu gelir (önbellekten gösterilir, arkada tazelenir); günün ilk dersinden 30 dk önce isteğe bağlı sabah bildirimi.

### Öğrenci ana ekranı (“Bugün”)

**Kapsam:** üstte karakter ve seri alevi, günün hedef çubuğu (“2/3 görev”), bugünün plan görevleri, yaklaşan ödevler, sıradaki ders, cevaplanan sorularım. Büyük “Odaklan” ve “Soru sor” düğmeleri.

**Kalite çıtası:** “Bugün ne yapmalıyım?” sorusunun cevabı kaydırmadan görünür; tamamlanan her görev anında karakter tepkisi ve XP gösterir.

### Bildirimler

- Kanallar: push (mobil) ve uygulama içi bildirim kutusu (web + mobil). E-posta yalnız hesap ve abonelik için.
- Faz 1 bildirim tipleri: ders hatırlatma, ders iptal/erteleme, yeni ödev, ödev teslim tarihi yaklaşıyor, ödev değerlendirildi, soru cevaplandı (öğrenci), yeni soru (öğretmen), seri hatırlatması, seviye/rozet, duyuru, ders sonu geri bildirimi.
- Her kullanıcı tip bazında açıp kapatır; sessiz saatler (varsayılan 22:00–08:00).
- Push metinlerinde ücret, not veya hassas bilgi yer almaz.
- **Kalite çıtası:** olaydan push'a p95 < 30 sn; bildirime dokununca doğru ekran açılır; aynı olay için tekrar bildirim yok; öğrenci başına günlük push üst sınırı (ör. 5).

### Duyurular

**Kapsam:** Öğretmen veya yönetici bir gruba, sınıfa, kademeye veya tüm kuruma duyuru yapar (metin + ek dosya + isteğe bağlı sabitleme). Okundu sayısı görünür. Cevap ve sohbet yok (mesajlaşma Faz 2+).

### Yönetici paneli ve raporlar (web ağırlıklı)

**Kapsam:**

- Öğretmenler, sınıflar/gruplar, öğrenciler ve atamaların yönetimi.
- Kurum özeti: aktif öğrenci, haftalık ödev teslim oranı, plan tamamlama oranı, ortalama soru cevap süresi, ders sonu “anladım” oranı, devam oranı.
- Sınıf ve öğretmen bazında aynı göstergeler; öğrenci detayına inme.
- Finans özeti (sahip ve yetkili yönetici): aylık tahsilat, açık bakiyeler.
- Modül ayarları: kurum, kademe veya grup bazında modül açma/kapama.

**Kalite çıtası:** 1.000 öğrencili kurumda panel 2 saniyede açılır; her sayı tıklanınca altındaki listeye iner; Excel dışa aktarım.

**Sonraki iyileştirmeler:** Zamanlanmış haftalık yönetici raporu (e-posta), öğretmen hakediş raporu, şube karşılaştırması.

## Abonelik ve platform yönetimi

### Abonelik ve planlar

**Kapsam:** Başlangıç / Koç / Kurum paketleri ve modül eşleşmesi; 14 günlük deneme (kart istemeden); web'de iyzico, iOS'ta App Store, Android'de Google Play (RevenueCat); kurum için teklif + fatura ile elle aktivasyon; öğrenci ve öğretmen sayısı limitleri; plan yükseltme/düşürme; süre bitince 7 gün ek süre, sonra salt-okunur; web satışlarında e-Arşiv fatura.

**Kullanım:** Yalnız sahip abonelik ekranını görür. Limit dolunca (ör. 16. öğrenci) “planını yükselt” ekranı çıkar; mevcut veri asla silinmez.

**Kalite çıtası:** Üç kanalın hepsinde satın alma → aktivasyon 10 sn içinde; iptal, iade ve başarısız ödeme senaryoları sandbox'ta test edilmiş; aynı kurum iki kanaldan çift abone olamaz.

### Platform yönetim paneli (yalnız senin için)

**Kapsam:** Kurum listesi ve arama, abonelik durumu ve elle düzeltme, kuruma özel modül açma/kapama ve beta erişimi, müfredat editörü, motivasyon sistemi ayarları (XP değerleri, tavanlar), destek için kayıtlı ve salt-okunur hesaba bürünme, denetim kayıtları, sistem sağlığı (kuyruk, hata oranı), duyuru/bakım mesajı yayınlama.

**Kalite çıtası:** Her yönetici işlemi denetim kaydında; iki adımlı giriş zorunlu; ayrı alt alan adı ve IP kısıtlaması.

## Fotoğraf ve medya mimarisi

Maliyeti düşük tutan üç ilke: **dosyayı telefonda küçült, sunucudan geçirmeden doğrudan depolamaya yükle, süresi dolanı otomatik sil.** Örnek bir 1.000 öğrencili kurumda kalıcı depolama yaklaşık 30–35 GB'ta dengelenir.

**Yükleme hattı**

1. **Telefonda:** fotoğraf uzun kenarı 1.600 piksele küçültülür, JPEG/WebP kalite \~0,7 ile sıkıştırılır, konum ve cihaz bilgisi (EXIF) silinir. Ses AAC 48 kbps mono kaydedilir.
2. **İzinli yükleme:** API kısa ömürlü, tek dosyalık bir yükleme izni (imzalı URL) verir; dosya API sunucusundan geçmeden doğrudan nesne depolamaya gider. Boyut ve tür sınırı izinde tanımlıdır (fotoğraf ≤ 2 MB, ses ≤ 3 MB).
3. **Kaldığı yerden devam:** zayıf bağlantıda yükleme arka planda sürer; uygulama kapanırsa kuyrukta bekler.
4. **Sunucuda (worker):** dosya doğrulanır (gerçekten resim mi), küçük önizleme (≈ 400 px, WebP) üretilir, içerik özeti (hash) ile aynı dosyanın tekrarı saklanmaz.
5. **Gösterim:** listelerde önizleme, açınca asıl dosya; dosyalar herkese kapalı depoda, birkaç dakikalık imzalı linklerle açılır. Mobil uygulama görüntüleri cihazda önbelleğe alır.

**Saklama kuralları (depolama yaşam döngüsü)**

| Medya                          | Ortalama boyut         | Saklama                                                         |
| ------------------------------ | ---------------------- | --------------------------------------------------------------- |
| Soru fotoğrafı                 | 250–400 KB             | Çözüldükten 30 gün sonra silinir (hata defterine eklenen kalır) |
| Cevap sesi (3 dk)              | \~1 MB                 | Soruyla birlikte silinir                                        |
| Cevap çizimi                   | 20–60 KB (vektör veri) | Soruyla birlikte silinir                                        |
| Ödev teslim fotoğrafı          | 250–400 KB             | Değerlendirmeden 90 gün sonra silinir                           |
| Ödev eki / haftalık plan PDF'i | ≤ 10 MB                | Akademik yıl sonuna kadar                                       |
| Logo, profil fotoğrafı         | < 200 KB               | Hesap süresince                                                 |

**Kabaca hesap (1.000 öğrenci):** günde \~1.000 soru fotoğrafı × 350 KB × 30 gün ≈ 10 GB; günde \~500 ödev fotoğrafı × 350 KB × 90 gün ≈ 16 GB; günde \~200 sesli cevap × 1 MB × 30 gün ≈ 6 GB. Toplam \~32 GB. Plan başına depolama kotası ve kurum panelinde kullanım göstergesi bulunur.

**Sonraki iyileştirmeler:** AVIF biçimi, sık erişilen dosyalar için Türkiye içinde önbellek sunucusu, eski dosyaları daha ucuz depolama sınıfına taşıma.

## Faz 2 ve sonrası

Bunlar planlarda duruyor; veri modeli ve modül sistemi hepsinin sonradan eklenebilmesine göre kuruluyor. Öncelik, Faz 1 beta verisine göre yeniden sıralanacak.

| Özellik                              | Kapsam özeti                                                                                                                       | Ön koşul                                                       | Önerilen faz           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| Veli modülü                          | Veli uygulaması (çocuk seçici, program, devam, ödevler, seri, deneme grafiği, kalan ders), haftalık rapor linki, veli–öğrenci bağı | Faz 1 rol ve veri modeli                                       | Faz 2 (ilk)            |
| Yapay zekâ koç asistanı              | Deneme ve ödev verisinden zayıf konuları çıkarıp haftalık plan taslağı önerir; öğretmen düzenleyip onaylar                         | Yeterli deneme/ödev verisi; KVKK uyumlu model sağlayıcı kararı | Faz 2                  |
| Yapay zekâ soru ipucu                | Soru fotoğrafından öğretmene çözüm/ipucu taslağı; öğretmen onaylamadan öğrenciye gitmez                                            | Aynı KVKK kararı                                               | Faz 2                  |
| Ana ekran widget'ı                   | Seri, bugünün görevi, sıradaki ders, karakter                                                                                      | Motivasyon sistemi                                             | Faz 2                  |
| Hata defteri                         | Fotoğraf + konu + 1-3-7-21 gün tekrarı; cevaplanan sorudan tek dokunuşla ekleme                                                    | Soru sor, medya hattı                                          | Faz 2                  |
| Uygulama içi mesajlaşma              | Öğretmen–öğrenci ve grup sohbeti; kayıtlı, yönetici/veli görünürlüğü, raporlama, sessiz saatler                                    | Çocuk güvenliği kuralları                                      | Faz 2                  |
| Otomatik SMS/WhatsApp                | Şablonlu hatırlatmalar (ders, ödeme, ödev); İYS ayrımı                                                                             | SMS sağlayıcı, WhatsApp iş hesabı                              | Faz 2                  |
| Ortak sınıf hedefi                   | Grup için haftalık toplam hedef ve ortak ilerleme çubuğu                                                                           | Motivasyon sistemi                                             | Faz 2                  |
| Sessiz çalışma odası                 | Grupta o an odak modunda olanlar karakterleriyle görünür; isteğe bağlı                                                             | Odak sayacı, karakter                                          | Faz 2                  |
| Haftalık paylaşım kartı              | Haftanın özeti hikâye formatında görsel; ad ve kurum gizli seçeneği                                                                | Karakter                                                       | Faz 2                  |
| Kaynak kitap takibi                  | Öğrencinin kitap/test ilerlemesi (ad ve sayı)                                                                                      | Ödev modülü                                                    | Faz 2                  |
| Quiz ve soru havuzu                  | Kurumun kendi sorularından çoktan seçmeli test, otomatik puan                                                                      | Telif kuralları                                                | Faz 2–3                |
| Konu haritası                        | Müfredat karakterin dünyası gibi; bitirilen konular bölge açar                                                                     | Konu bazında ilerleme verisi, çizim                            | Faz 3                  |
| Hedef puan                           | Tahmini TYT/AYT/LGS puanı, hedef bölüm/lise farkı                                                                                  | Yıllık katsayı/taban puan verisi                               | Faz 3                  |
| Optik form içe aktarımı              | Optik okuyucu çıktılarından deneme sonuçları                                                                                       | Deneme modülü                                                  | Faz 3                  |
| Yıl kapanışı sihirbazı               | Öğrencileri toplu arşivleme/yeni sınıfa taşıma (otomatik atlatma yok)                                                              | Kurum yapısı                                                   | Faz 3                  |
| Kurum paketi genişletme              | Çoklu şube, sekreter/muhasebe, taksit/senet, toplu içe aktarım, özel roller                                                        | Kurum müşterisi                                                | Müşteri geldikçe       |
| Veliden online tahsilat              | Velinin paketi kartla ödemesi                                                                                                      | Veli modülü, alt üye işyeri yapısı                             | Faz 3                  |
| Hoca vitrini ve herkese açık araçlar | Hoca tanıtım sayfası, ön kayıt, puan hesaplama ve taban puan sayfaları (SEO)                                                       | —                                                              | Büyüme ihtiyacına göre |
| Liderlik tablosu                     | İsteğe bağlı, kurum ayarıyla                                                                                                       | Motivasyon verisi                                              | Belki                  |

## Güncellenmiş süre ve açık sorular

Veli tarafının çıkması yaklaşık 2 hafta kazandırıyor; karakterin B+C olması yaklaşık 2 hafta ekliyor. Ders kayıtları modülü 2 hafta ekliyor. (Güncelleme: mikroservis kararıyla toplam 48 hafta, lansman Ekim 2027 başı; güncel takvim “kopru\_digital (v2) — Uçtan Uca Ürün ve Teknik Plan” dokümanındadır. Aşağıdaki tablo mikroservis öncesi tahmindir.) Faz 1 toplamı **\~43 hafta**: 9 Kasım 2026 başlangıcıyla **Eylül 2027'nin ilk haftası**; okulların açılışına sınırda. Bu yüzden beta hocalarının Eylül'den önce sistemde olması önemli. Nisan 2027'de dar kapsamlı ücretli beta önerim duruyor.

| Blok                                                                      | Hafta  |
| ------------------------------------------------------------------------- | ------ |
| Keşif, tasarım, karakter teknik prototipi                                 | 3      |
| Çekirdek, modül sistemi, kurum yapısı, üyeler, müfredat, KVKK onay ekranı | 5      |
| Operasyon: takvim, yoklama, paket ve tahsilat                             | 5      |
| Akademik: ödev, haftalık plan, deneme                                     | 6      |
| Soru sor (çizim + ses dahil)                                              | 3      |
| Ders kayıtları ve materyaller                                             | 2      |
| Motivasyon: karakter entegrasyonu, XP, seri, rozet, odak, geri bildirim   | 6      |
| Ana ekranlar, bildirimler, duyurular, yönetici paneli                     | 3      |
| Abonelik ve platform yönetim paneli                                       | 3      |
| Production hazırlığı                                                      | 3      |
| Beta                                                                      | 4      |
| **Toplam**                                                                | **43** |

Karakter çizimi ve animasyonu dış kaynakla paralel yürür; geliştirme süresine dahil değil ama bütçe ister.

**Senin cevaplaman gereken sorular**

- [ ] Ürün adı (TakipHocam kullanılamaz).
- [ ] Karakter çizimi ve animasyonu için bütçe aralığı; illustratör ve animatörden teklif alayım mı?
- [ ] Öğrencinin günlük soru sorma limiti varsayılanı (önerim: günde 5, haftada 20; hoca değiştirebilir).
- [ ] Öğrenci kendi deneme sonucunu girebilsin mi (öğretmen onayıyla)? Önerim: evet.
- [ ] Kurumda öğretmen kendi grubunu oluşturabilsin mi, yoksa yalnız yönetici mi? Önerim: kurum ayarı, varsayılan evet.
- [ ] Öğrenci kalan ders sayısını görsün mü? Önerim: evet, kurum kapatabilsin.

Bu sorular netleşince “Uçtan Uca Ürün ve Teknik Plan” dokümanını bu şartnameye göre güncelleyip (modül sistemi, kurum yapısı, Faz 1 kapsamı, 41 haftalık sprint planı) uygulamaya geçebiliriz.
