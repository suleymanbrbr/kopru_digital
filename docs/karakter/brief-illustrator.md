# Freelance İllüstratör + Rive Animatör: İş Brifingi

Proje: kopru_digital, Türk ortaokul (LGS) ve lise (YKS) öğrencileri için eğitim uygulaması
Konu: Öğrencinin "yol arkadaşı" karakter seti (3 tür, 5 evre, 2 varyant), animasyon ve kozmetikler
Dil: Türkçe/İngilizce iletişim; teslim dosyaları ASCII adlandırma
Durum: v0.1 taslak (bütçe, tarih ve iletişim bilgileri başvuru öncesi doldurulacak)

## 1. Proje özeti

Öğrenci kayıt sırasında 3 türden birini seçer ve ona isim verir. Karakter seviye atladıkça 5 evrede büyür (yumurta/tohum → yavru → genç → usta → efsane), çalışma/odak zamanında öğrenciye eşlik eder, görev bitirince sevinir, 2 gün çalışılmazsa uykuya yatar (asla suçlayıcı değil). Öğrenci ödül olarak kozmetikler kazanır (gerçek para yok).

Üç tür: **Kıvılcım** (ateş yaratığı), **Dinamo** (küçük robot), **Sedir** (orman ruhu). Tür konseptleri ve yapay zekâ konsept görselleri sizin için **yön ve ilham** amaçlıdır; nihai tasarım ve çizim size aittir ve sıfırdan yapılır.

Görsel dil: **"Sevimli ama havalı."** 11 yaşındakine tatlı, 17 yaşındakine bebeksi gelmeyen karakterler. İki varyant: ortaokul (daha yuvarlak, canlı) ve lise (daha keskin, sakin palet).

Referans belgeler (size verilecek): `stil-rehberi.md`, `istem-seti.md` (konsept görseller), `rive-yapisi.md` (teknik sözleşme), placeholder SVG'ler (`assets/karakter/placeholder/`).

## 2. Aranan profil

- Karakter tasarımı ve flat vektör illüstrasyonda güçlü portfolyo (oyun/mobil uygulama mascot çalışmaları).
- **Rive** (rive.app) deneyimi: kemik (bone) sistemi, state machine, Solo, Nested Artboard, event, performans optimizasyonu. Tercihen yayınlanmış en az 2 Rive çalışması.
- Mobil için hafif vektör animasyon bilgisi (dosya boyutu, kare süresi).
- Çocuk/genç hedef kitleye uygun, olumlu ve kapsayıcı tasarım anlayışı.
- Aynı kişi veya iş birliği yapan iki kişilik ekip (illüstratör + animatör) olabilir; tek sorumlu muhatap şarttır.
- Türkçe iletişim tercih sebebi (zorunlu değil).

## 3. Teslim edilecekler

| # | Teslim | Adet | Açıklama |
|---|---|---|---|
| 1 | Karakter tasarımı | 3 tür × 5 evre × 2 varyant = **30 karakter** | Her biri: ön görünüş, 3/4 görünüş; vektör, katmanlı |
| 2 | İfade sayfaları | 3 tür × (evre 2-5) × 2 varyant, 8 ifade | Nötr, mutlu, kutlama, odak, uyku, merak, gurur, cesaret |
| 3 | Turnaround | 3 tür × 5 evre (ortaokul), lise için evre 3 ve 5 | 5 açı |
| 4 | Rive dosyaları | **3 adet `.riv`** (tür başına tek dosya; hem ortaokul hem lise varyantı) | `rive-yapisi.md` sözleşmesine birebir uyumlu |
| 5 | Animasyon durumları | **6 durum**: idle, happy, celebrate, focus, sleepy, evolution (+ blink, wake, tap) | Her tür, evre ve varyant için çalışır |
| 6 | Beceri özellikleri | 5 beceri (Sayısal, Sözel, Fen, Sosyal, Dil) × 3 tür × 5 evre | Renk vurgusu, aksesuar, aura (stil-rehberi bölüm 11) |
| 7 | Kozmetikler | **20-30** adet: şapka 8-10, aksesuar 6-8, arka plan 5-8, tema 3-5 | Hem statik hem Rive bağlantılı |
| 8 | Rozet ikonları | **30 adet** | Uygulama içi başarı rozetleri (konu: çalışma serileri, konu tamamlama, beceri dalları vb.); 3 boyut: 512, 128, 48 px; renkli + tek renk sürüm |
| 9 | Statik görseller | Her tür × evre × varyant (30) | Hareket azaltma modu ve bildirim görselleri için WebP/PNG/SVG |
| 10 | Anchor/meta | 3 JSON (`karakter-<tur>.json`) | Kozmetik bağlantı noktaları |
| 11 | Kaynak dosyalar | Tüm kaynaklar | Rive editör dosyası, vektör kaynak (SVG/AI/Figma), PSD varsa |
| 12 | Özgünlük kaydı | 1 dosya | Referanslar, benzerlik kontrolü sonuçları (bkz. bölüm 8) |
| 13 | Teslim belgesi | 1 dosya | Dosya listesi, sürüm notu, performans ölçümleri |

Kapsam dışı: Uygulama kodu, ses efekti, 3D, müzik. Bunlar ayrı iş.

## 4. Aşamalar ve takvim (öneri; toplam ~10-12 hafta)

| Aşama | Süre | İçerik | Çıktı | Ödeme payı (öneri) |
|---|---|---|---|---|
| M0: Değerlendirme görevi | 1 hafta | Bölüm 9'daki mini görev | 1 tür, 1 evre, 1 mini animasyon | Ücretli (sabit) |
| M1: Konsept ve tasarım | 2 hafta | 3 tür × 5 evre ortaokul tasarımı (siyah silüet testi ile), lise varyantlarına yön, özgünlük kaydı | Tasarım onayı | %20 |
| M2: Varyant + ifade + turnaround | 2 hafta | Lise varyantları, ifade ve turnaround sayfaları, beceri özellikleri tasarımı | Stil onayı (kilit nokta: **sonrası tasarım değişikliği ücrete tabidir**) | %15 |
| M3: Rive rig ve animasyon (1 tür pilot) | 2 hafta | Pilot tür (örn. Kıvılcım) tam rig, 6 durum, state machine, performans testi | Pilot onayı | %20 |
| M4: Diğer iki tür rig | 2 hafta | Aynı şablonla Dinamo ve Sedir | 3 .riv | %20 |
| M5: Kozmetik + rozet | 1.5 hafta | 20-30 kozmetik, 30 rozet ikonu | Kozmetik ve rozet paketi | %15 |
| M6: Cila ve teslim | 0.5-1 hafta | Hata düzeltme, performans, dokümantasyon, kaynak dosya teslimi | Son teslim, devir | %10 (teslim sonrası) |

Her aşama sonunda: Ürün sahibi 5 iş günü içinde geri bildirim verir; bir aşamada **en fazla 2 revizyon turu** dahil (kapsam dışı değişiklikler ek ücrete tabi).

Haftalık 30 dakikalık ilerleme görüşmesi, aşama sonunda ekran paylaşımlı sunum.

## 5. Kabul kriterleri

Her teslim aşağıdaki ölçütlere göre kabul edilir. Karşılanmayanlar düzeltme listesi olarak geri verilir.

**Tasarım**
- [ ] Siyah silüet testi: 3 tür ve 5 evre birbirinden ayırt edilir; 48 px'te en az 2 imza öğe görünür.
- [ ] Stil rehberine (flat, 2 ton gölge, dış çizgi yok, göz stili) uygun.
- [ ] Evre büyümesi hem **sevimli** hem **havalı**; efsane evre bebeksi değil, tehditkâr da değil.
- [ ] Ortaokul ve lise varyantı aynı türden olduğu tek bakışta anlaşılır ama belirgin farklıdır.
- [ ] Palet: stil rehberi hex değerlerine uyum (±küçük ayar önerisiyle yazılı onay); açık ve koyu zeminde 3:1 grafik kontrastı.
- [ ] Yasak ifadeler yok (üzgün, ağlayan, kızgın, hasta, aç); uyku hali huzurlu.
- [ ] **Özgünlük:** Hiçbir bilinen karaktere benzemez; özgünlük kontrol listesi (stil-rehberi bölüm 15) imzalı teslim edilir.
- [ ] Görsel içinde metin, rakam, logo yok.

**Animasyon (Rive)**
- [ ] `rive-yapisi.md` sözleşmesi birebir: artboard, state machine, input ve event adları.
- [ ] Tüm 6 durum + evrim + wake her evre × varyantta çalışır (test matrisi ile).
- [ ] Animasyon süreleri belirtilen sürelerle ±%10 uyumlu; loop'lar dikişsiz.
- [ ] Performans: ≤ 1.5 MB / tür; orta seviye Android'de 60 fps (3 cihaz testi tablosu); blur/feather yok.
- [ ] `skill_*` 0-10, `variant`, `stage`, `level`, kozmetik slotları doğru çalışır.
- [ ] Hareket azaltma için statik görseller ve kozmetik bindirme verileri teslim edildi.
- [ ] Evrim animasyonunda `evo_midpoint` / `evo_done` event'leri doğru zamanlarda.

**Kozmetik ve rozet**
- [ ] Kozmetikler her evrede doğru oturur; imza öğeyi kapatmaz.
- [ ] Rozetler 48 px'te okunur; tek renk sürümleri çalışır; kültürel/dini/siyasi sembol yok.

**Dosya ve doküman**
- [ ] Dosya adları ASCII; klasör yapısı bölüm 6'da belirtildiği gibi.
- [ ] Kaynak dosyalar açık ve düzenli (katman isimleri anlamlı, gruplandırılmış).
- [ ] Teslim belgesi ve sürüm notu eksiksiz.

## 6. Dosya formatları ve klasör yapısı

| Tür | Format |
|---|---|
| Rive çıktısı | `.riv` (+ editör kaynağı `.rev` ya da Rive bulut bağlantısı/dışa aktarım) |
| Vektör kaynak | SVG + AI veya Figma (kaynak katmanlı) |
| Statik görseller | SVG (kaynak), WebP + PNG (512 px ve 128 px, şeffaf zeminli) |
| Rozetler | SVG, PNG (512, 128, 48 px) |
| Renkler | sRGB; kullanılan hex paleti `palette.json` ile |
| Önizleme | Her animasyon için MP4 ya da GIF (kalite referansı) |

Klasör yapısı (örnek):

```
karakter/
  kivilcim/
    kaynak/        (rive editör dosyası, vektör kaynaklar)
    cikti/         (kivilcim.riv, karakter-kivilcim.json)
    statik/        (kivilcim-3-v0.webp ...)
    onizleme/      (mp4/gif)
    kozmetik/
  dinamo/ ...
  sedir/ ...
  rozetler/
  ozgunluk-kaydi/
  teslim-belgesi.md
```

Adlandırma: `<tur>-<asama>-v<varyant>.<uzanti>` (ör. `sedir-4-v1.webp`), tür kodları `kivilcim`, `dinamo`, `sedir`; kozmetik `cos-<slot>-<id>-<ad>.svg`; rozet `badge-<id>-<ad>.svg`.

## 7. Lisans ve mülkiyet (zorunlu)

Başvuruda bu şartları kabul edenler değerlendirmeye alınır. Sözleşme yazılı yapılır; hukuk danışmanı onaylı şablon kullanılır.

1. **Tam ticari fikri mülkiyet devri:** Tüm teslimlerin (karakter tasarımları, çizimler, rig'ler, animasyonlar, kozmetikler, rozetler, kaynak dosyalar, ara çalışmalar, adlar ve karakter kimlikleri) tüm fikri ve sınai mülkiyet hakları (telif hakkı dahil mali haklar, marka ve tasarım tescil hakları) **süresiz, dünya çapında, devredilebilir ve münhasır** olarak kopru_digital'e devredilir. (Türk hukukunda manevi haklar devredilemediği için sözleşme manevi haklar için kullanımı ve değişiklik yapılmasını açıkça onaylar; "isim belirtme" yükümlülüğü yoktur.)
2. **Özgün eser beyanı:** Teslimin tamamı yüklenicinin özgün eseridir; üçüncü kişi haklarını ihlal etmez. Devralan, değiştirme, çoğaltma, dağıtma, ticari kullanım, türev eser üretme, marka olarak tescil etme hakkına sahiptir.
3. **Üçüncü taraf materyal yok:** Stok görsel, hazır font, şablon, hazır Rive topluluk dosyası, diğer karakterlerin parçaları kullanılamaz. İstisna yazılı onay ve geniş lisans şartıyla.
4. **Yapay zekâ kullanımı:** Nihai çizim, rig ve animasyon yapay zekâ üretim araçlarının çıktısı **olarak** teslim edilemez. Yapay zekâ konsept görselleri yalnızca ilham/yön amaçlıdır ve doğrudan kullanılamaz; yüklenici kullandığı araçları (yardımcı olarak, varsa) yazılı bildirir. Yapay zekâyla üretilmiş parçalar için ayrıca yazılı onay gerekir.
5. **Özgünlük beyanı ve tazminat:** Yüklenici, eserlerin başka bir eserin kopyası veya türevi olmadığını beyan ve taahhüt eder; üçüncü taraf hak iddiasında koruma ve tazminat sorumluluğu sözleşmede düzenlenir.
6. **Portfolyo kullanımı:** Yüklenici, lansmandan sonra ve yazılı onayla, eserleri portfolyosunda gösterebilir (kaynak dosya paylaşmadan, sınırlı görsel). Daha önce yayın yapılmaz.
7. **Gizlilik:** Proje ve uygulama bilgileri yayına kadar gizlidir (NDA).
8. **Rakip kullanım yasağı:** Yüklenici bu karakterlere benzer karakterleri başka bir eğitim uygulamasına üretmeyeceğini (münhasırlık) taahhüt eder; kapsam ve süre sözleşmede (ör. 2 yıl) belirlenir.
9. **Düzeltme ve bakım:** Teslimden sonra 60 gün içinde bildirilen hata ve sözleşme dışı uyumsuzluklar ücretsiz düzeltilir.
10. **Ödeme ve vergi:** Ödemeler aşamalara göre (bölüm 4), fatura/serbest meslek makbuzu ile; vergi yükümlülüğü yüklenicinin statüsüne göre yapılır.
11. **Çocuk güvenliği ve içerik:** Yüklenici, 11-18 yaş grubuna uygun içerik üretir; uygunsuz, korkutucu, cinselleştirilmiş, şiddet, bağımlılık çağrıştıran öğe kullanmaz.

*Not: Bu madde listesi sözleşme değil, ön şarttır; nihai sözleşme hukuk danışmanıyla hazırlanır.*

## 8. Özgünlük süreci (yüklenici için)

- İlk tasarım turunda her tür için **özgünlük kaydı**: referans/ilham listesi (karakter olmayan: hayvan, doğa, mimari, tipografi vb.), siyah silüet, ters görsel arama (Google Lens, TinEye) sonuçlarının ekran görüntüleri.
- Yasak referanslar: Pokémon, Digimon, Tamagotchi, Duolingo, Disney/Pixar, Studio Ghibli ve diğer tanınmış franchise karakterleri; "bunlara benzer" yön de yasak.
- Üç kişiden ikisi "bu şuna benziyor" diyorsa tasarım revize edilir.
- Yasal gözden geçirme: Nihai set, yayın öncesi bir fikri mülkiyet danışmanına gösterilir.

## 9. Önerilen değerlendirme görevi (M0, ücretli, ~1 hafta)

**Amaç:** Beceri, stil uyumu, Rive bilgisi ve iletişim kalitesini düşük riskle ölçmek.

**Görev:** Verilen konsepte göre (Kıvılcım **veya** Sedir; aday seçer) aşağıdakileri teslim edin:

1. **Tasarım:** Seçilen türün **evre 3 (genç)** karakteri, **ortaokul varyantı** ön + 3/4 görünüş; vektör, katmanlı, stil rehberine uygun, siyah silüet testi eki.
2. **Evre geçişi:** Evre 2 (yavru) ve evre 4 (usta) için basit ön görünüş taslakları (gelişim mantığını gösteren).
3. **İfade:** 4 ifade (nötr, mutlu, odak, uyku) evre 3 için.
4. **Rive mini rig:** Evre 3 karakteri için en az: `idle` (loop 4 s), `happy` (1.2 s), `sleepy` (loop 5 s), **state machine** `Companion_SM` (inputs: `happy` trigger, `sleepy` boolean, `focus` boolean) + `blink`. İskelet ve göz katmanları ayrı. Dosya ≤ 400 KB.
5. **Kısa not:** Tasarım kararları, referanslar, özgünlük kontrol notu (en fazla 1 sayfa).

**Değerlendirme (1-5 puan):**

| Kriter | Ağırlık |
|---|---|
| Sevimli-ama-havalı dengesi, 11 ve 17 yaş çekiciliği | %25 |
| Özgünlük | %20 |
| 48 px okunurluk / silüet | %10 |
| Rig kalitesi (parça ayrımı, hareket doğallığı) | %20 |
| State machine doğruluğu ve performans | %15 |
| İletişim, süreye uyum, not kalitesi | %10 |

Eşik: Özgünlük < 3 ise elenir; toplam ≥ 4.0 hedeflenir. Görev çıktısının mülkiyeti ücreti ödenince bize geçer (bölüm 7).

## 10. Başvuru için istenenler

1. Portfolyo (karakter tasarımı + Rive çalışmaları, canlı bağlantılar).
2. Rive çalışmalarından en az 1 örnek (.riv ya da yayın bağlantısı) ve kullanılan state machine açıklaması.
3. Önerilen takvim, bütçe teklifi (aşama bazlı), haftalık çalışma kapasitesi.
4. Bölüm 7'deki lisans şartlarını kabul beyanı.
5. İki referans (önceki müşteri).

Başvuru ve sorular: `<iletisim bilgisi doldurulacak>` · Son başvuru: `<tarih doldurulacak>`
