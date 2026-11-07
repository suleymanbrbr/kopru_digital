# Yol Arkadaşı: Rive Teknik Şartnamesi

Hedef okur: Rive animatörü ve mobil geliştiriciler. Bu belge **sözleşmedir**: animatör ve uygulama arasındaki isimler (artboard, state machine, input, event) değişmez; değişirse `contract_version` yükseltilir.

Rive sürümü: Teslimde animatörle kararlaştırılan güncel Rive editörü/runtime sürümü yazılı olarak sabitlenir (öneri: teslim anındaki kararlı sürüm) ve `manifest` içine yazılır. Bu belgedeki özellik adları (Solo, Nested Artboard, Events, Listeners, Data Binding) Rive editöründeki güncel karşılıklarıyla eşlenir; runtime sürümünün desteklemediği özellik kullanılmaz.

## 1. Dosya düzeni

Tür başına **tek** `.riv`; içinde hem ortaokul hem lise varyantı (inputla seçilir).

| Dosya | İçerik |
|---|---|
| `kivilcim.riv` | Ateş yaratığı, 5 evre × 2 varyant, kozmetikler |
| `dinamo.riv` | Robot, aynı |
| `sedir.riv` | Orman ruhu, aynı |
| `rozetler.riv` (opsiyonel) | 30 rozet ikonu (statik SVG ana teslim, Rive opsiyonel) |

Adlandırma: tür kodu küçük harf, ASCII: `kivilcim`, `dinamo`, `sedir`. Türkçe karakter (ı, ş, ğ, ü, ö, ç) dosya, artboard, katman ve input adlarında kullanılmaz.

## 2. Artboard yapısı

Boyut: **512 x 512** (kare), orijin merkez-alt "ayak noktası" (pivot) `x=256, y=480`. Uygulama artboard'u ölçekleyerek yerleştirir (48-320 dp).

| Artboard | Rol |
|---|---|
| `main` | Uygulamanın yüklediği **tek** artboard; state machine bunda. Tür adı artboard adında yoktur (dosya zaten tür). |
| `st1` ... `st5` | Evre artboard'ları (Nested Artboard olarak `main` içinde). Her birinin kendi iskeleti ve animasyonları var. |
| `cos_*` (opsiyonel) | Kozmetik parçaları, `main` içinde Solo olarak. |

Not: Aynı yapıyı tek artboard + Solo gruplarıyla kurmak da kabul edilir; **sözleşme yalnızca `main` artboard adını, state machine adını, input adlarını ve event adlarını** sabitler. İç mimariyi animatör performans ve dosya boyutuna göre seçer.

Evre ve varyant seçimi:
- `stage` (1-5) hangi evre grubunun görünür olduğunu belirler (Solo).
- `variant` (0/1) hangi şekil/palet setinin görünür olduğunu belirler. İskelet ortaktır, yalnızca şekiller ve renkler farklıdır; böylece dosya boyutu artmaz.

## 3. State machine

Ad: **`Companion_SM`** (tek state machine, `main` artboard'unda).

### 3.1 Inputlar

| Input | Tür | Aralık | Anlam |
|---|---|---|---|
| `stage` | Number | 1-5 | Görünen evre |
| `level` | Number | 1-99 | Seviye; yalnızca ince görsel ödüller için (ör. aura parıltı yoğunluğu); evreyi belirlemez |
| `variant` | Number | 0 veya 1 | 0 ortaokul, 1 lise |
| `skill_sayisal` | Number | 0-10 | Sayısal beceri |
| `skill_sozel` | Number | 0-10 | Sözel beceri |
| `skill_fen` | Number | 0-10 | Fen beceri |
| `skill_sosyal` | Number | 0-10 | Sosyal beceri |
| `skill_dil` | Number | 0-10 | Dil beceri |
| `celebrate` | Trigger | | Seviye/rozet kutlaması |
| `happy` | Trigger | | Görev tamamlandı sevinci |
| `focus` | Boolean | | Odak sayacı çalışırken true |
| `sleepy` | Boolean | | 2+ gün çalışılmadıysa true |
| `evolve` | Trigger | | Evrim dizisini başlatır (ek input) |
| `cos_hat` | Number | 0-N | Şapka kimliği, 0 = yok |
| `cos_accessory` | Number | 0-N | Aksesuar kimliği, 0 = yok |
| `cos_background` | Number | 0-N | Arka plan kimliği, 0 = varsayılan |
| `cos_theme` | Number | 0-N | Tema kimliği, 0 = varsayılan |
| `reduce_motion` | Boolean | | true ise yalnızca statik poz (bkz. bölüm 8); uygulama normalde Rive'ı hiç çalıştırmaz, güvenlik ağı olarak vardır |

Kurallar:
- Girdi adları küçük harf, ASCII, alt çizgi ayracı. Asla yeniden adlandırılmaz.
- `skill_*` değerleri 0-10 tam sayı; animatör ara değer (float) gelirse de bozulmamalı.
- Kozmetik kimlikleri `cosmetics.json` tablosundaki `id` ile eşleşir (bkz. bölüm 9).

### 3.2 Events (Rive Events)

| Event | Ne zaman | Uygulama tepkisi |
|---|---|---|
| `evo_midpoint` | Evrim animasyonunda beyaz parlama zirvesinde (~1.5 s) | Uygulama `stage`'i yeni değere ayarlar |
| `evo_done` | Evrim bitti | UI "yeni evre" ekranını gösterir |
| `celebrate_done` | Kutlama bitti | UI konfeti kapatır |
| `happy_done` | Sevinç bitti | (opsiyonel) |
| `wake_done` | Uykudan uyanma bitti | (opsiyonel) |

Event adları değişmez. Uygulama event gelmese bile 2.5 s sonra `stage`'i güncelleyen bir zaman aşımı koyar (güvenlik).

### 3.3 Katmanlar (State Machine Layers)

| Katman | Durumlar | Notlar |
|---|---|---|
| `L_base` | `idle` ↔ `focus` ↔ `sleepy`, `evolution` | Ana durum; öncelik: evolution > sleepy > focus > idle |
| `L_blink` | `blink` (rastgele aralık) | Göz kırpma, idle/focus'ta çalışır, sleepy'de kapalı |
| `L_oneshot` | `none` → `happy` / `celebrate` → `none` | Üst üste binmez; focus modundayken `happy` kısaltılmış (yarım) oynar |
| `L_skill` | `skill_*` additive mikro animasyonları | Sürekli, çok düşük maliyet |
| `L_cos` | Şapka/aksesuar salınımı (physics-lite) | Kuyruk/anten ikincil hareket |
| `L_bg` | Arka plan canlılığı | Yavaş loop, düşük maliyet |

Geçiş kuralları:
- `focus=true` iken `celebrate`/`happy` gelirse sevinç **kısa** oynar ve focus'a döner; odak bozulmaz.
- `sleepy=true` iken `happy` veya `celebrate` tetiklenirse karakter önce 0.8 s'de uyanır (`wake`), sonra animasyonu oynar, ardından uygulama `sleepy`'yi false yapar (genelde çalışınca zaten false olacak).
- `sleepy` **suçlayıcı değil**: gözler kapalı, gevşek ve rahat bir uyku; ağır "z" harfleri yok (metin yok), küçük parıltı/baloncuk var.
- `evolution` tetiklenince diğer tüm geçişler bastırılır.
- Her durumdan `idle`'a dönüş mümkündür (ör. `focus=false`).

## 4. Animasyon listesi

FPS: tüm animasyonlar **60 fps** zaman çizelgesinde yazılır; tüm loop'lar dikişsizdir (ilk/son kare aynı).

| Animasyon | Tip | Süre | Açıklama |
|---|---|---|---|
| `idle` | Loop | 4.0 s | Nefes alma (gövde y-ölçek ±%2), kuyruk/antena/alev ikincil hareketi, kulak/kanat mikro hareket |
| `blink` | One-shot | 0.25 s | Göz kırpma; 2.5-5 s rastgele aralık |
| `happy` | One-shot | 1.2 s | Zıplama (yükseklik ≈ gövde %10), göz kavisi, parlama, kuyruk sallama |
| `celebrate` | One-shot | 2.4 s | Çift zıplama, kollar/kanatlar/anten yukarı, parçacık patlaması (düz yıldızlar, 12 parçaya kadar) |
| `focus_in` | One-shot | 0.5 s | İdle → odak geçişi |
| `focus` | Loop | 6.0 s | Sakin; gözler kısık ve masaya bakıyor, çok hafif nefes, hareket genliği idle'ın %40'ı; arka plan sakinleşir; alev/anten daha az hareket (pil dostu) |
| `focus_out` | One-shot | 0.4 s | Odaktan çıkış |
| `sleepy_in` | One-shot | 1.0 s | Yavaşça kıvrılıp uykuya geçiş, gözler kapanır |
| `sleepy` | Loop | 5.0 s | Yavaş nefes, minik parıltı baloncukları, ton hafif soğur |
| `wake` | One-shot | 0.8 s | Gerinme + esneme, sıcak karşılama (asla "neredeydin" jesti yok) |
| `evolution` | One-shot | 4.5 s | Aşağıdaki dizi |
| `tap` | One-shot (opsiyonel) | 0.8 s | Dokunmaya cevap: göz kırpma + küçük sallanma |
| `skill_*` | Additive loop | 3-6 s | Beceri özelliği mikro hareketi (parıltı, parçacık dönmesi) |

### Evrim dizisi (`evolution`, 4.5 s)

| Zaman | Olay |
|---|---|
| 0.0-1.2 s | Mevcut evre titrer, vücut ışıması büyür, parçacıklar toplanır (anticipation) |
| 1.2-1.5 s | Silüet beyaz/açık renk siluet olur, ışık patlaması |
| **1.5 s** | **`evo_midpoint` event.** Uygulama `stage`'i yeni değere çeker; evre solo'su değişir (ışık zirvesinde, gizlenmiş) |
| 1.5-3.0 s | Yeni evre büyüyerek ortaya çıkar (scale 0.6 → 1.05 → 1.0), parçacık dalgası |
| 3.0-4.2 s | Poz: imza hareket (Kıvılcım alev patlaması, Dinamo anten ışığı, Sedir boynuz yaprak açılması) |
| 4.2-4.5 s | Idle'a yumuşak dönüş; **`evo_done` event** |

Evre 1 → 2 evrimi yumurtadan çıkış gibi (çatlak, kabuk parçaları düz şekiller); diğerleri "yükselme". Her evre geçişinde animasyon aynı süre ve aynı iskelet; yalnızca imza poz tür/evreye özel.

## 5. Parça hiyerarşisi (kemik / katman)

### 5.1 Ortak kurallar

- Her evre artboard'unda iskelet **aynı adlandırma şemasında**: `root → hip → body → chest → head ...`. Ortak isimler sayesinde animasyon klonlanır (evreler arası kopyala-yapıştır).
- Ortak kemik adları: `root`, `hip`, `body`, `chest`, `neck`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r`, `tail_1`, `tail_2`, `tail_3`.
- Gözler **ayrı katman grubu**: `eye_l`, `eye_r` (her biri `open`, `half`, `closed`, `happy`, `focus` kareleri), göz parlaması (`eye_hl_*`), `brow_l`, `brow_r`, `mouth` (kareler: `smile`, `open`, `flat`, `sleep`).
- Kulak/anten/alev gibi ikincil hareketler **kendi kemiğine** sahip.
- Etiketler: Kemikler `bone_*` ön eki taşımaz ama kozmetik bağlantı noktaları (`anchor_*`) boş (null) kemik olarak eklenir.
- Silüet etkileyen parçalar bağımsız katman: gövde, baş, uzuvlar, kulak/boynuz/anten, kanat/kuyruk.
- Katman adları İngilizce/ASCII, küçük harf, `_` ayraç.
- Ortaokul/lise şekilleri **aynı kemik adlarına** bağlı, farklı şekil katmanları `*_v0`, `*_v1` (Solo `variant`).

### 5.2 Kıvılcım

```
root
 └ hip
    ├ body ── belly_patch, back_ridge_flames (evre 4+)
    │   └ chest ── chest_gem (evre 5)
    │        ├ neck ── head
    │        │    ├ eye_l, eye_r, brow_l, brow_r, mouth, cheek_l, cheek_r
    │        │    ├ horn_l, horn_r (evre 2+ tomurcuk, 3+ gerçek)
    │        │    ├ flame_tuft_1..3 (ayrı alev şekilleri, alev ikincil hareket)
    │        │    └ anchor_hat
    │        ├ arm_l, arm_r
    │        └ wing_l_1/2, wing_r_1/2 (evre 3+; kanat 2 segment + membran; mesh deform ≤ 1/kanat)
    ├ leg_l, leg_r (foot_l, foot_r)
    └ tail_1 → tail_2 → tail_3 → tail_flame
 anchors: anchor_neck, anchor_back, anchor_tail
```

Ayrı olması **zorunlu** parçalar: tüm göz/ağız kareleri, alev tüyü parçaları, boynuz, kanat segmentleri, kuyruk segmentleri, kuyruk alevi, göğüs kristali, aura (efekt katmanı).

### 5.3 Dinamo

```
root
 └ hip
    ├ body ── panel_chest, indicator_light, gear_back (rotate)
    │   └ chest
    │        ├ neck ── head
    │        │    ├ screen (şekil), eye_l, eye_r (dikdörtgen, kareler: open/half/closed/happy/focus), mouth
    │        │    ├ antenna_1 → bulb_1, antenna_2 → bulb_2 (evre 4+)
    │        │    ├ ear_fin_l, ear_fin_r (evre 4+)
    │        │    └ anchor_hat
    │        ├ shoulder_plate_l/r (evre 4+) → arm_l, arm_r → hand_l, hand_r
    ├ leg_l, leg_r
 evre 5: halo_gear (tepede, dönen), orbit_ring_1, orbit_ring_2 (ayrı efekt katmanı), core_crystal
 anchors: anchor_neck, anchor_back, anchor_hand
```

Ayrı olması **zorunlu**: ekran + gözler, anten (yay/ikincil sallanma), dişli (dönme animasyonu), omuz plakaları, halka dişli, yörünge halkaları.

### 5.4 Sedir

```
root
 └ hip
    ├ body ── belly_patch, leaf_collar (yaka yaprakları)
    │   └ chest
    │        ├ neck ── head
    │        │    ├ eye_l, eye_r, brow_l, brow_r, nose, mouth, cheek_l/r
    │        │    ├ ear_l → ear_inner_l, ear_r → ear_inner_r
    │        │    ├ sprout_1, sprout_2 (evre 1-2 filiz → evre 3+ antler_*)
    │        │    ├ antler_l_1..3, antler_r_1..3 (dal segmentleri + yapraklar leaf_*)
    │        │    ├ forehead_gem (evre 5)
    │        │    └ anchor_hat
    │        ├ arm_l, arm_r
    ├ leg_l, leg_r
    └ tail_1 → tail_2 → tail_3 (yaprak uçlu, tek kuyruk) → leaf_tail_*
 anchors: anchor_neck, anchor_back, anchor_tail
```

Ayrı olması **zorunlu**: kulaklar, her boynuz dalı ve yaprak kümeleri, filiz yaprakları, kuyruk segmentleri, yaka yaprakları, alın taşı, düşen yaprak parçacıkları.

### 5.5 Beceri katmanları (tüm türler)

Her evrede, kemiklere bağlı beş grup:
`skill_sayisal_fx`, `skill_sozel_fx`, `skill_fen_fx`, `skill_sosyal_fx`, `skill_dil_fx`.
- Her grup: (a) renk vurgusu/desen, (b) küçük aksesuar/iz, (c) aura parçacığı.
- Opaklık ve ölçek `skill_*` değerinden hesaplanır (0 → görünmez, 10 → tam). Aralık: 0-2 kapalı, 3-6 orta, 7-10 tam.
- Aynı anda yalnızca en yüksek **2** beceri tam yoğunlukta gösterilir; diğerleri en fazla %50 (state machine mantığı veya animasyon verisi; kodlama animatörün sorumluluğu).
- Her beceri ayrı Solo/opaklık kontrolü; birbirinden bağımsız çalışır.

## 6. Kozmetik slotları

| Input | Kapsam | Bağlantı |
|---|---|---|
| `cos_hat` | Şapkalar (8-10 adet) | `anchor_hat` (baş kemiğinin altında); şapka imza öğeyi gizlemez (bölüm 12 stil-rehberi) |
| `cos_accessory` | Aksesuarlar (6-8 adet) | `anchor_neck`, `anchor_back`, `anchor_tail` (her aksesuarın kendi bağlantı noktası) |
| `cos_background` | Arka planlar (5-8 adet) | `bg` grubu (karakterin arkasında, ayrı katman) |
| `cos_theme` | Temalar (3-5 adet) | Tema = ikincil renk + ışık rengi değişimi; Rive'da renk/solo ile |

- Her kozmetik bağlantı noktası **her evrede ayrı konum/ölçek** tanımı gerektirir (evre 1'de şapka yok).
- Kozmetik parçası kendi kemik/ikincil hareketine sahip olabilir (püskül, küpe salınımı) ama en fazla 2 kemik.
- Kozmetik toplam 20-30 adet: şapka 8-10, aksesuar 6-8, arka plan 5-8, tema 3-5. Her biri ≤ 8 KB.
- Kimlik tablosu `cosmetics.json`: `{ "id": 7, "slot": "hat", "name_tr": "...", "name_en": "...", "unlock": {"type": "badge|level|streak", "value": ...}, "rarity": 1-3 }`. `unlock` yalnızca oyun içi kazanım olabilir; gerçek para alanı **yoktur**.

## 7. Performans bütçesi

| Metrik | Hedef |
|---|---|
| `.riv` boyutu | **≤ 1.5 MB per tür** (hedef ≤ 1.0 MB), kozmetikler dahil |
| Kare hızı | 60 fps, orta seviye Android (örn. 3 GB RAM, Snapdragon 6xx/7xx, Mali-G5x); CPU ≤ %12, bellek ≤ 30 MB aktif |
| Path sayısı | ≤ 160 path/evre artboard, toplam görünür ≤ 220 |
| Kemik sayısı | ≤ 45 kemik/evre; ≤ 3 mesh deform (kuyruk, kanat) |
| Efektler | **Blur / feather / gölge efekti yok**; glow = düz şekil + düşük opaklık + gradyan (≤ 3 gradyan görünür) |
| Clipping | ≤ 2 aktif clip (göz kapağı/ekran); gerekirse maskesiz çözüm |
| Parçacıklar | ≤ 12 parçacık aynı anda; kutlama anında ≤ 24 |
| Gradyan | Sadece aura/ışık; vücutta düz renk |
| Görsel (raster) | Yok (yalnızca vektör) |
| Odak modu | 30 fps'e düşürülebilir, hareket genliği düşük (pil) |
| Uygulama dışı | Ekran dışındayken ve arka plandayken Rive durdurulur |

Test: En az 3 cihazda (düşük/orta/üst) 60 sn idle + kutlama + evrim; kare süresi p95 < 16.7 ms; boyut ve bellek ölçüm tablosu teslimle gelir.

### Dosya boyutu dağılımı (öneri)

| Parça | KB (hedef) |
|---|---|
| 5 evre × 2 varyant şekilleri | 450-600 |
| İskelet + animasyonlar | 150-250 |
| Beceri katmanları | 80-120 |
| Kozmetikler (20-30) | 150-250 |
| Arka planlar | 60-100 |
| **Toplam** | **≈ 900-1300** |

## 8. Hareket azaltma ve yedekler

- **`reduce_motion` fallback = statik evre görseli.** İşletim sistemi "animasyonları kaldır/azalt" ayarı açıksa ya da uygulama içi ayar kapalıysa Rive çalıştırılmaz; yerine karakterin evre ve varyanta uygun **statik görsel** (SVG ya da WebP) gösterilir.
- Statik görsel adı: `<tur>-<asama>[-<varyant>].svg|webp` (ör. `kivilcim-3-v1.webp`; geçici yer tutucular `assets/karakter/placeholder/<tur>-<asama>.svg`).
- Statik görsel üzerine kozmetik bindirme: Kozmetik de statik PNG/WebP olarak `anchor` tablosundan hesaplanıp bindirilir (ya da kombinasyon önceden pişirilir); karakter kozmetiği yine görünür.
- Rive yüklenemez, bozuk ya da çok yavaşsa (kare süresi sürekli > 33 ms) otomatik statik görsele düşülür.
- Hareket azaltma modunda **kutlama/evrim** için parlama yerine yumuşak fade geçiş (süre 0.3 s), parlama ve zıplama yok.
- Parlama güvenliği: Saniyede 3'ten fazla yüksek kontrastlı parlama yok (WCAG 2.3.1).
- Ekran okuyucu: Karakter görselinin alt metni uygulama tarafından verilir ("Yol arkadaşın Kıvılcım, 3. evre, uykuda"), Rive içinde metin yok.

## 9. Anchor ve meta veri (JSON)

Her tür dosyası ile birlikte `karakter-<tur>.json` teslim edilir (animatör doldurur, geliştirici statik katmanlar için okur):

```json
{
  "species": "kivilcim",
  "contract_version": 1,
  "rive_version": "<editor/runtime sürümü>",
  "artboard": "main",
  "state_machine": "Companion_SM",
  "stages": [1, 2, 3, 4, 5],
  "variants": [0, 1],
  "anchors": {
    "hat":       { "1": null, "2": {"x": 256, "y": 150, "rot": 0, "scale": 0.8}, "3": {} },
    "neck":      {},
    "back":      {},
    "tail":      {}
  },
  "static_images": {
    "3-v0": "kivilcim-3-v0.webp"
  }
}
```

Koordinatlar `main` artboard (512 x 512) uzayında; animatör her evre için doldurur.

## 10. Teslim (export) kontrol listesi

Animatör her sürümde şunu işaretler:

- [ ] `main` artboard var, adı doğru, 512 x 512.
- [ ] State machine adı `Companion_SM`; tüm input adları bölüm 3'tekiyle **birebir** aynı (büyük/küçük harf dahil).
- [ ] Tüm event adları bölüm 3.2'deki gibi.
- [ ] Tüm 6 durum + evrim + wake çalışıyor: idle, happy, celebrate, focus, sleepy, evolution (ve blink).
- [ ] Her evre (1-5) × her varyant (0/1) tüm durumlarda test edildi (matris tablo ekli).
- [ ] `skill_*` 0, 5, 10 değerlerinde görseller doğru; ikili yüksek beceri kuralı çalışıyor.
- [ ] Kozmetik slotları: her kimlik her evrede doğru bağlanıyor; şapka imza öğeyi gizlemiyor.
- [ ] Loop'lar dikişsiz; animasyon süreleri bölüm 4 ile uyumlu (±%10).
- [ ] Boyut ≤ 1.5 MB; path/kemik/efekt bütçesi tablosu dolduruldu.
- [ ] 3 cihazda performans testi (60 fps) ve sonuç tablosu eklendi.
- [ ] Blur/feather yok; raster görsel yok; fontlar/metin yok.
- [ ] Dosya içi adlandırma ASCII, Türkçe karakter yok; katmanlar düzenli klasörlerde.
- [ ] `karakter-<tur>.json` (anchor, static) ve statik görseller (5 evre × 2 varyant) teslim edildi.
- [ ] Rive kaynak dosyası (editörde düzenlenebilir) ve `.riv` ihracat dosyası ikisi birden teslim.
- [ ] Sürüm notu (changelog) yazıldı, `contract_version` güncel.
- [ ] Hareket azaltma için statik görseller eklendi ve kozmetik bindirmeye uygun.
- [ ] Orijinal vektör (SVG/AI/Figma) kaynaklar teslim.

## 11. Sürümleme ve uzaktan indirme

**Amaç:** Uygulama mağaza güncellemesi olmadan karakter güncellemelerini alabilir; kullanıcı yalnızca seçtiği türü indirir (≤ 1.5 MB).

**Sürüm şeması:** `MAJOR.MINOR.PATCH` (semver).
- `MAJOR`: Sözleşme kırıldı (input/event/artboard adı değişti, input silindi). Uygulama sürümünün desteklediği `contract_version` ile eşleşmeyen dosya indirilmez.
- `MINOR`: Yeni içerik (yeni kozmetik, yeni animasyon, yeni input; geriye uyumlu).
- `PATCH`: Görsel/hatalı düzeltme, boyut optimizasyonu.

**Manifest (`karakter-manifest.json`, CDN üzerinde):**

```json
{
  "schema": 1,
  "updated_at": "2026-12-01T00:00:00Z",
  "species": {
    "kivilcim": {
      "version": "1.2.0",
      "contract_version": 1,
      "min_app_version": "1.4.0",
      "url": "https://cdn.example.com/karakter/kivilcim/1.2.0/kivilcim.riv",
      "sha256": "<hex>",
      "size_bytes": 981234,
      "meta_url": "https://cdn.example.com/karakter/kivilcim/1.2.0/karakter-kivilcim.json",
      "static_pack_url": "https://cdn.example.com/karakter/kivilcim/1.2.0/static.zip",
      "changelog_tr": "Yeni şapkalar eklendi."
    }
  }
}
```

(`cdn.example.com` yer tutucudur; gerçek adres altyapıdan gelir.)

**Dosya yolu kuralı:** `/<tur>/<semver>/<tur>.riv` (sürüm klasörü değişmez; üzerine yazılmaz; `immutable` cache başlığı).

**İstemci davranışı:**
1. Uygulama açılışta (ve günde en fazla 1 kez) manifesti `ETag` / `If-None-Match` ile ister.
2. Kullanıcının seçtiği tür için `contract_version` uyumlu ve sürüm daha yeniyse arka planda (Wi-Fi tercihli) indirir.
3. İndirme bitince **sha256 doğrulanır**; geçerliyse geçici dosyadan atomik olarak yerine taşınır ve bir sonraki karakter ekranı açılışında kullanılır (animasyon ortasında değiştirilmez).
4. Önceki sürüm bir sürüm daha saklanır (geri dönüş); eski sürümler 2 sürümden sonra silinir.
5. Hata/offline: uygulama paketinde (bundle) bulunan **temel sürüm** (her tür için evre 1-2 .riv ya da statik görseller) ile çalışır; hiçbir ekran karakter yüzünden bloke olmaz.
6. Yeni tür seçildiğinde (kayıt sırasında) indirme sırasında statik evre-1 görseli ve ilerleme çubuğu gösterilir; indirilemezse statik görsel + "daha sonra dene".

**Güvenlik:** HTTPS zorunlu; sha256 doğrulama; yalnızca imzalı/kendi alan adından indirme; manifest küçük, önbellekli. `.riv` dosyaları çalıştırılabilir kod içermez (yine de yalnızca kendi CDN'inden alınır).

**Yayın akışı:** Animatör teslim → geliştirici kontrol listesi + otomatik test (artboard/input adı doğrulama betiği) → staging manifest → %10 kullanıcıda aşamalı yayın → tam yayın. Geri alma: manifestte önceki sürüme dönmek yeterli.

**Otomatik doğrulama (öneri):** CI'da bir betik `.riv` dosyasını Rive runtime ile açıp `main` artboard, `Companion_SM` state machine'i ve tüm input adlarının varlığını doğrular, boyutu ölçer (>1.5 MB ise başarısız), evre × varyant matrisini render alıp kare boş değil mi diye bakar.
