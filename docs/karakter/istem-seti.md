# Yol Arkadaşı: Yapay Zekâ Konsept İstem Seti

Amaç: Midjourney / GPT image / Ideogram ile tutarlı konsept görseller üretmek. Bu görseller **yön ve ilham** içindir; nihai çizim illüstratör tarafından sıfırdan yapılır (bkz. `brief-illustrator.md`, `stil-rehberi.md` bölüm 15).

Kural: İstemler İngilizce (araçlar daha iyi çalışır), her istemin Türkçe tek satır açıklaması vardır. Köşeli parantezli alanlar doldurulur: `[VARIANT]` = aşağıdaki ortaokul/lise bloklarından biri.

## 1. Çalışma sırası (özet)

1. Önce **tür başına** "bible" istemiyle evre 3 (genç) ön görünüş üret; 20-40 varyasyon.
2. Rubrikle (bölüm 8) puanla; en iyi 1 görseli **ana referans (anchor)** seç.
3. Ana referanstan diğer evreleri **sırayla** üret (3 → 4 → 5, sonra 2, sonra 1), her seferinde bir önceki onaylı evreyi referans ver.
4. Ön + 3/4 görünüş, ifade sayfası, turnaround üret.
5. Sonra varyantı (ortaokul ↔ lise) aynı referanstan ikinci tura çevir.
6. Özgünlük kontrolü (stil-rehberi bölüm 15) ve seçim tablosu.

## 2. Ortak stil bloğu (her isteme eklenir)

```
STYLE_BLOCK:
original cute-but-cool creature mascot design, modern 2D game character concept art, flat vector illustration style, clean smooth shapes, no outlines (color-shape edges only), limited 2-tone cel shading with a soft ground shadow, large expressive glossy eyes with two highlights, simple readable silhouette that works at 48px, friendly confident personality, appeals to both 11-year-old kids and 17-year-old teens, polished mobile-game quality, plain light neutral background (#F3EFE6), centered, full body visible with margin, high resolution
```

## 3. Ortak olumsuz istem bloğu

```
NEGATIVE_BLOCK:
realistic, photorealistic, 3D render, fur texture, scales texture, metallic realism, heavy gradients, outlines, thick black outline, sketchy lines, text, letters, numbers, logo, watermark, signature, UI, frame, multiple characters, human, hands holding, weapons, blood, scary, creepy, sad, crying, angry, sick, exhausted, babyish diaper-style, kawaii overload, chibi blob only, busy background, clutter, extra limbs, deformed, asymmetry errors, cropped, blurry, low quality, existing franchise character, anime franchise mascot, Pokemon, Digimon, Tamagotchi, Disney, Pixar, Studio Ghibli, Duolingo, Nintendo, Sonic, Pikachu, Charizard, Charmander, Toothless, Eevee, Leafeon, Baymax, WALL-E, BB-8
```

Araç notları:
- **Midjourney:** Olumsuz istem için `--no` kullan; blok çok uzunsa en önemli 15-20 öğeyi al: `--no text, outline, 3D, realistic, human, background clutter, logo, watermark, scary, sad`. 
- **Ideogram:** "Negative prompt" alanına bloğun tamamı yapıştırılabilir.
- **GPT image:** Olumsuz alan yoktur; "Avoid: ..." cümlesiyle bloğun kısaltılmışını isteme ekle.

## 4. Varyant blokları

```
VARIANT_ORTAOKUL:
rounder shapes, bigger head-to-body ratio, shorter limbs, softer rounded corners, saturated vibrant colorful palette, playful and cheerful look, big sparkling eyes
```
```
VARIANT_LISE:
sharper angular cuts, slimmer proportions, longer limbs, restrained muted palette that works on dark backgrounds, single accent color, confident calm look, slightly smaller horizontal eyes with a subtle brow line, stylish and understated
```

Kısa Türkçe: Ortaokul = yuvarlak, canlı, oyuncu. Lise = keskin, sakin, tek vurgu renkli.

## 5. Tutarlılık ipuçları

**Genel iş akışı**
- **Tek anchor kuralı:** Bir türün tüm evreleri, onaylanmış tek bir ana görselden türetilir. Anchor değişirse tüm tür baştan başlar.
- **Sabit parçalar:** Her isteme türün "bible" paragrafının *değişmez özelliklerini* kelimesi kelimesine kopyala. Cümleyi değiştirme; yalnızca evre ve görünüş satırı değişir.
- **Kademeli üretim:** Evre 3'ü anchor'dan al, sonra 4, 5 (daha çok ekleme), sonra 2 ve 1 (daha çok indirgeme). Her adımda önceki evreyi referans ver.
- **Tek değişken:** Bir seferde yalnızca bir şeyi değiştir (evre veya görünüş veya ifade veya varyant).
- **Seed:** Aracın seed değerini kaydet (Midjourney: `--seed 12345`; Ideogram: "magic prompt" kapalı, seed sabit; GPT image seed vermez, bunun yerine referans görsel yükleyip aynı kalıp cümleyi kullan).
- **Kayıt:** Her onaylanan görsel için bir tablo satırı tut: tür, evre, varyant, istem, seed, referans dosyası, tarih, araç sürümü, puan.

**Midjourney**
- Karakter referansı: `--cref <görsel URL> --cw 100` (yüz + giysi + gövde) veya `--cw 0-50` (yalnızca yüz/kafa). Yeni sürümlerde bu özellik adı ve parametresi değişebilir (örn. omni reference `--oref`, `--ow`); kullandığın sürümün güncel dokümanına bak.
- Stil referansı: `--sref <URL>` ile ortak stil anchor'ı kullan (tüm türler için aynı sref, türler arası stil tutarlılığı sağlar).
- Düzenli parametreler: `--ar 1:1` (tekil), `--ar 3:2` (turnaround/ifade), `--stylize 100-200` (düşük tut, sade kalsın), `--v` sabit sürüm.
- Varyasyon: "Vary (Subtle)" ile ufak oynama, "Vary (Strong)" ile yeni fikir. Zoom/Pan kullanma.

**GPT image**
- Aynı sohbet içinde kal; önce anchor'ı yükle: "Use this exact character as reference. Keep identical face, colors and proportions. Only change: ...".
- İfade/turnaround için: "Same character, same design, [what changes]."
- Düzenleme (edit) modunda arka planı ve detayı değiştir, karakteri değil.

**Ideogram**
- "Character reference" özelliğini aç, anchor'ı yükle; stil için "Style reference" ayrı yüklenir.
- "Magic Prompt" kapalı tut; istem sen ne yazdıysan o olsun.
- Çoklu görünüş sayfası için "Aspect ratio 3:2" ve "design/illustration" stili.

**Tutarlılık hataları ve çözümü**
| Sorun | Çözüm |
|---|---|
| Her görselde farklı göz | Gözü bible'da kelimeleriyle sabitle: "two large glossy round eyes, dark pupil, two white highlights" |
| Evre 5 bambaşka görünüyor | `--cw` artır, evre 4'ten türet, "same design as reference, bigger and more majestic" |
| Arka plan karakteri bozuyor | Arka plan hep "plain light neutral background (#F3EFE6)"; sahneyi ayrı üret |
| Gölge/outline geliyor | Olumsuzlara "outline" ekle, "no outlines, flat color shapes" cümlesini artır |
| Aşırı gerçekçilik | "flat vector illustration" ve "2-tone cel shading" öne al; stylize düşür |
| Benzer franchise karakteri çıktı | O görseli reddet; bible'daki ayırt edici öğeyi güçlendir (stil-rehberi bölüm 15, bilinen riskler) |

## 6. Türler

> Her tür için: **Bible paragrafı** (kopyalanacak sabit tanım), **5 evre × (ön + 3/4)**, **ifade sayfası**, **turnaround**.

İstem şablonu:

```
{STYLE_BLOCK}, {BIBLE}, {STAGE_LINE}, {VIEW_LINE}, {VARIANT_BLOCK}
```

`VIEW_LINE` seçenekleri:
- Ön: `front view, symmetrical neutral standing pose, facing camera`
- 3/4: `three-quarter view, slightly turned to the left, friendly head tilt`

Midjourney eklentisi: `--ar 1:1 --stylize 150 --v 7` (+ `--cref/--oref`).

---

### 6.1 Kıvılcım (ateş yaratığı)

**Konsept (TR):** Tepesinde alev tüyü olan, sıcak, cesur ve meraklı küçük yaratık. Yumurtası közde pişmiş çatlak taş gibi; büyüdükçe boynuz, kanat ve alev tacı kazanır. (Ejderha benzeri ama ejderha klişesinden ayrışmak için tepesinde alev tüyü, membranlı alev kanadı ve damga deseni imza öğedir; kuyruk ucunda alev bilinçli olarak tek ve küçük tutulur.)

**BIBLE:**

```
KIVILCIM_BIBLE:
an original small ember-spirit creature, round pebble-shaped body in warm coral-orange (#FF7A3D) with a lighter peach belly patch (#FFD08A), a single soft flame-feather tuft growing from the top of its head (golden #FFC247 with pale inner #FFEBB0), two short ivory horns that grow with age, rounded paws, a short tail, two large glossy round eyes with dark plum pupils (#3B1F4A) and two white highlights, small pink cheek blush, gentle confident smile; later stages gain flame-membrane wings with vein lines, back flame ridge and a glowing ruby-pink chest crystal; signature features: the head flame tuft and ember-colored vein patterns; no spikes, no sharp teeth, no claws, personality: brave, warm, curious
```

**Evre satırları:**

```
K_STAGE1: a rounded egg shaped like a glowing ember stone, warm coral-orange with darker spots and one hairline zigzag crack, a tiny golden flame tuft on top, no face, subtle warmth glow
```
*TR: Evre 1: Közde yanan taş gibi yumurta, çatlak, tepede minik alev.*

```
K_STAGE2: baby stage, almost one single round chubby body, very big eyes, tiny horn nubs, tiny flame tuft, stubby paws, tiny tail with a small spark, cute and cheerful
```
*TR: Evre 2: Yuvarlak yavru, çok büyük gözler, minik alev ve boynuz tomurcukları.*

```
K_STAGE3: young stage, head and body now distinct, small ivory horns, small flame-membrane wings with vein lines, small flame tuft, little arms, short tail ending in a small flame, bright and energetic
```
*TR: Evre 3: Genç, küçük kanatlar ve boynuzlar, baş ve gövde ayrışmış, enerjik.*

```
K_STAGE4: master stage, taller upright confident stance, longer curved horns, large flame-membrane wings with vein lines, a ridge of small flames along the back, bigger flame tuft, stronger tail, calm confident expression
```
*TR: Evre 4: Usta, dik duruş, büyük kanatlar, sırtta alev sırası, kendinden emin.*

```
K_STAGE5: legendary stage, majestic but still friendly, large glowing flame-membrane wings, crown-like cluster of flames on the head, long curved horns, glowing ruby-pink chest crystal, soft warm aura ring and floating ember sparkles (aura as separate soft circle), proud calm smile
```
*TR: Evre 5: Efsane, alev tacı, ışıldayan göğüs kristali, aura, gururlu ve sevimli kalır.*

**İfade sayfası:**

```
{STYLE_BLOCK}, character expression sheet of the same character, {KIVILCIM_BIBLE}, {STAGE_LINE of chosen stage}, 8 head-and-shoulders expressions arranged in a 4x2 grid on plain background: neutral, happy (squinting joyful eyes), celebrating (mouth open, arms up), focused (calm narrowed eyes, flat mouth), peacefully sleeping (closed eyes curved lines, small sparkle bubbles instead of text), curious (wide eyes raised brow), proud (chest out, eyes half closed smile), encouraging (head tilted, small warm smile), consistent design across all expressions, no text --ar 3:2
```
*TR: 8 ifadelik sayfa: nötr, mutlu, kutlama, odak, uyku, merak, gurur, cesaret.*

**Turnaround:**

```
{STYLE_BLOCK}, character turnaround sheet of the same character, {KIVILCIM_BIBLE}, {STAGE_LINE of chosen stage}, five full-body views in a row on plain background: front, front three-quarter, side, back three-quarter, back, identical proportions and colors, same height alignment line, no text --ar 3:2
```
*TR: Beş açılı dönüş sayfası: ön, 3/4 ön, yan, 3/4 arka, arka.*

---

### 6.2 Dinamo (küçük robot)

**Konsept (TR):** Koyu ekran yüzlü, parlak dikdörtgen gözlü, antenli, meraklı yardımcı robot. Yumurtası enerji kapsülü; büyüdükçe kollar, sırtında dişli, omuz plakaları ve yörünge halkaları kazanır.

**BIBLE:**

```
DINAMO_BIBLE:
an original small friendly helper robot, soft rounded-squircle body in teal (#2EC4B6) with deeper teal shading (#1E9C91), a dark navy screen face (#26324D) with two glowing rectangular aqua eyes (#8CF2E8) and a small curved smile, a short antenna on top ending in a glowing golden bulb (#FFD166), off-white chest panel (#F4F7FB), small golden joint accents, simple stubby limbs, a small gear on the back that grows with age; signature features: the dark screen face with rectangular glowing eyes and the antenna with a glowing bulb; matte painted plastic look but drawn as flat vector, no mechanical realism, no cables, no weapons, personality: curious, helpful, quietly clever
```

**Evre satırları:**

```
D_STAGE1: a small rounded capsule-shaped energy pod in teal with a horizontal off-white seam, one glowing golden round light window on the front, a tiny antenna with a bulb, no face, two tiny rivets
```
*TR: Evre 1: Enerji kapsülü, tek ışıklı pencere, minik anten.*

```
D_STAGE2: baby stage, one round soft squircle body-head with a dark screen face and two glowing rectangular eyes, small antenna with bulb, tiny golden hands, tiny feet, very cute
```
*TR: Evre 2: Yuvarlak gövde-kafa, ekran yüz, minik eller.*

```
D_STAGE3: young stage, separate rounded head and small body, arms and legs, off-white chest panel with a golden button, antenna, small golden gear on the back, energetic posture
```
*TR: Evre 3: Genç, baş ve gövde ayrı, kollar, sırtta küçük dişli.*

```
D_STAGE4: master stage, wider shoulders with dark shoulder plates, two antennas with coral-red bulbs (#FF6B6B), side fin ears, larger gear backpack, chest panel with a glowing golden indicator, confident upright posture
```
*TR: Evre 4: Usta, omuz plakaları, iki anten, büyük sırt dişlisi.*

```
D_STAGE5: legendary stage, still friendly, large halo gear floating above head, two thin glowing orbit rings around the body (separate soft layer), glowing aqua crystal core on the chest, golden shoulder armor, crest above the visor, floating sparkles, calm proud expression
```
*TR: Evre 5: Efsane, başın üstünde halka dişli, yörünge halkaları, çekirdek kristal.*

**İfade sayfası:**

```
{STYLE_BLOCK}, character expression sheet of the same robot, {DINAMO_BIBLE}, {STAGE_LINE of chosen stage}, 8 head-and-shoulders expressions in a 4x2 grid on plain background; expressions are shown on the dark screen face using eye shapes and a simple mouth line: neutral rectangles, happy (curved ^ ^ eyes), celebrating (wide smile, antenna bulb bright), focused (narrow flat eyes), peacefully sleeping (horizontal sleeping lines, dimmed bulb), curious (one taller eye), proud, encouraging (soft smile), consistent design, no text --ar 3:2
```
*TR: 8 ifade ekran yüzünde: nötr, mutlu, kutlama, odak, uyku, merak, gurur, cesaret.*

**Turnaround:**

```
{STYLE_BLOCK}, character turnaround sheet of the same robot, {DINAMO_BIBLE}, {STAGE_LINE of chosen stage}, five full-body views in a row on plain background: front, front three-quarter, side, back three-quarter, back, identical proportions and colors, same height line, no text --ar 3:2
```
*TR: Beş açılı dönüş sayfası.*

---

### 6.3 Sedir (orman ruhu)

**Konsept (TR):** Başında filiz, sonra dallı yapraklı boynuzlar taşıyan, tilki-geyik karışımı yumuşak orman ruhu. Yumurtası bir tohum; tek ve büyük yapraklı bir kuyruğu vardır.

**BIBLE:**

```
SEDIR_BIBLE:
an original small forest-spirit creature, a blend of a young fox and a deer, soft cream body (#F6E7C8) with a lighter belly, slightly rounded-tip pointed ears with pale pink inside, a small leafy sprout on the head that later becomes branching wooden antlers (#8A5A3C) with fresh green leaves (#5BAE6A), one single large leafy tail (only one tail, no multiple tails), brown rounded paws, a leaf collar around the neck, two large glossy round eyes with dark green pupils (#2B3A2E) and two white highlights, small button nose, soft peach cheek blush, gentle calm smile; signature features: the head sprout turning into leaf antlers and the single leaf tail; no fur strands, no masks, no human features, personality: gentle, wise, playful
```

**Evre satırları:**

```
S_STAGE1: an acorn-like seed shaped body in warm tan with a deep green cap with leaf veins, a thin sprout with two leaves growing from the top, two tiny dot eyes, soft glow
```
*TR: Evre 1: Tohum, filizli, iki minik göz.*

```
S_STAGE2: baby stage, round chubby cream body-head, large pointed ears with green insides, a tiny two-leaf sprout on the head, small leaf-shaped tail, tiny brown paws, very cute
```
*TR: Evre 2: Yuvarlak yavru, yaprak kuyruk, iki yapraklı filiz.*

```
S_STAGE3: young stage, slimmer body, two small antler twigs with a couple of leaves, longer leafy tail, leaf collar, bright curious look
```
*TR: Evre 3: Genç, küçük dal boynuzlar, uzun yaprak kuyruk.*

```
S_STAGE4: master stage, taller graceful stance, branching antlers with several leaves, large leafy tail, leaf collar with a small flower gem, calm wise expression
```
*TR: Evre 4: Usta, dallı boynuz, çiçekli yaka, bilge ifade.*

```
S_STAGE5: legendary stage, majestic but friendly, large glowing branching antlers with luminous lime-green leaves (#C8FF9E), a glowing leaf-shaped gem on the forehead, grand leafy tail, floating petals and leaves, soft green aura as a separate soft circle, proud calm smile
```
*TR: Evre 5: Efsane, ışıldayan boynuz yaprakları, alın taşı, aura, uçuşan yapraklar.*

**İfade sayfası:**

```
{STYLE_BLOCK}, character expression sheet of the same character, {SEDIR_BIBLE}, {STAGE_LINE of chosen stage}, 8 head-and-shoulders expressions in a 4x2 grid on plain background: neutral, happy (joyful squint), celebrating (mouth open, ears up), focused (calm narrowed eyes), peacefully sleeping (closed curved eyes, small sparkle bubbles), curious (wide eyes, ears forward), proud, encouraging (head tilt, soft smile), consistent design, no text --ar 3:2
```
*TR: 8 ifadelik sayfa.*

**Turnaround:**

```
{STYLE_BLOCK}, character turnaround sheet of the same character, {SEDIR_BIBLE}, {STAGE_LINE of chosen stage}, five full-body views in a row on plain background: front, front three-quarter, side, back three-quarter, back, identical proportions and colors, one single tail visible, no text --ar 3:2
```
*TR: Beş açılı dönüş sayfası.*

---

## 7. Ek istemler (opsiyonel)

**Beceri özellikleri (aynı karakter üzerinde):**
```
{STYLE_BLOCK}, {BIBLE}, {STAGE_LINE}, the same character with an added blue geometric pattern accent and faint hexagon particles (Sayisal skill trait), keep body design unchanged --ar 1:1
```
Aynı satır Sözel (mor kıvrım), Fen (turkuaz orbit noktaları), Sosyal (turuncu pusula izi), Dil (pembe çift kıvrım) için tekrarlanır (renk/şekil tablosu: stil-rehberi bölüm 11).

**Kozmetik testi:** `the same character wearing a small knitted beanie hat that leaves the head signature feature visible, no other changes`

**Uykulu hal:** `the same character curled up peacefully asleep, closed eyes, tiny sparkle bubbles, relaxed and cozy, evening-tinted soft light, never sad`

**Sahne arka planı (karakter yok):** `empty circular scene backdrop, [theme], 3 layered flat shapes, muted low-saturation colors, soft light, no characters, no text`

## 8. Seçim rubriği

Her aday görsel 1-5 puan alır (5 = en iyi). Aynı kişiler değil, mümkünse farklı yaş grubundan değerlendiriciler: en az 3 ortaokul öğrencisi + 3 lise öğrencisi + 1 tasarımcı.

| Kriter | 1 | 3 | 5 |
|---|---|---|---|
| A. 11 yaş çekiciliği | "Sıkıcı/korkutucu" | "Fena değil" | "Bunu isterim!" |
| B. 17 yaş çekiciliği | "Çok bebeksi" | "Sorun yok" | "Havalı, paylaşırım" |
| C. Özgünlük | Bilinen karaktere çok benzer | Benzerlik var ama ayırt edilebilir | Hiçbir şeye benzemiyor |
| D. Küçük boyutta okunurluk | 48 px'te karışık | Silüet kısmen okunur | 48 px'te net, 2 imza öğe görünür |
| E. Animasyona uygunluk | Parçalanması zor/bütün | Orta | Ayrı parçalara net bölünür, loop kolay |

**Toplam:** Maksimum 25. **Eşikler:**
- Özgünlük (C) puanı **3 altındaysa** toplam puandan bağımsız elenir.
- Toplam 20+ ve her kriter ≥3: finale.
- 17-19: revize ederek tekrar üret.
- <17: ele.

**Puan tablosu (şablon):**

| Aday | Tür | Evre | Varyant | A | B | C | D | E | Toplam | Not/seed |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

**Ek kontrol:** Kazanan aday için stil-rehberi bölüm 15 özgünlük kontrol listesi tamamlanır ve kayıt altına alınır.

## 9. Üretim takvimi (öneri)

| Adım | Çıktı | Süre |
|---|---|---|
| 1 | 3 tür × 20-40 anchor adayı | 1 gün |
| 2 | Rubrik + özgünlük kontrolü, 3 anchor seçimi | 1-2 gün |
| 3 | Her türde evre 1-5, ortaokul | 1 gün |
| 4 | Lise varyantları | 1 gün |
| 5 | İfade + turnaround | 1 gün |
| 6 | Paket: seçilen görseller, istemler, seed, rubrik tablosu → illüstratöre | 0.5 gün |
