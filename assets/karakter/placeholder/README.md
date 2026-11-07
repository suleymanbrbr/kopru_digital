# Yol Arkadaşı: Yer Tutucu SVG'ler

Geliştirici yer tutucularıdır. Nihai sanat ve Rive rig'i illüstratör/animatör tarafından yapılacaktır (bkz. `docs/karakter/brief-illustrator.md`). Bu dosyalar uygulamada karakter ekranlarını, evre mantığını ve hareket azaltma yedeğini şimdiden geliştirmek içindir.

## Dosyalar

15 dosya: `<tur>-<asama>.svg`

| Tür | Dosyalar | Konsept |
|---|---|---|
| `kivilcim` | `kivilcim-1.svg` ... `kivilcim-5.svg` | Ateş yaratığı: yumurta, yavru, kanat tomurcuklu genç, kanatlı usta, alev taçlı efsane |
| `dinamo` | `dinamo-1.svg` ... `dinamo-5.svg` | Robot: kapsül, yuvarlak bot, kollu bot, omuz plakalı usta, halka/çekirdekli efsane |
| `sedir` | `sedir-1.svg` ... `sedir-5.svg` | Orman ruhu: tohum, filizli yavru, boynuz tomurcuklu genç, dallı usta, ışıklı efsane |

Evre eşlemesi: 1 = tohum/yumurta (seviye 1), 2 = yavru (5), 3 = genç (12), 4 = usta (25), 5 = efsane (40).

Ek dosyalar: `onizleme.html` (15'in etiketli ızgarası + 48 px küçük boyut satırı), `onizleme.png` (aynı ızgaranın görüntüsü), `uret.py` (SVG'leri üreten betik; `python3 uret.py <cikti_klasoru>`).

## Teknik

- `viewBox="0 0 256 256"`, şeffaf zemin, düz renk, sınırlı gölge, görsel içinde metin yok.
- Harici bağlantı yok (font, görsel, `href` yok); yalnızca yerel `radialGradient` (efsane evre aurası).
- Her dosya 8 KB altında; XML olarak ayrıştırıldı (doğrulandı).
- Palet ortaokul varyantına yakındır (stil-rehberi bölüm 7). Lise varyantı yer tutucuda yoktur (`variant` yalnızca Rive'da).

## Kullanım notları

- Evre görseli: `assets/karakter/placeholder/${tur}-${asama}.svg`.
- Hareket azaltma yedeği olarak bu dosyalar şimdilik statik görsel görevi görür; nihai statik görseller `<tur>-<asama>-v<varyant>.webp` olarak gelecektir.
- Açık zeminde krem Sedir ve açık sarı alevler zayıf kontrast verir; karakterin altında zemin plakası kullanın (stil-rehberi bölüm 7.4).
- Evre 4-5 görselleri, kanat/boynuz/aura sığsın diye grup dönüşümüyle %76-92 ölçeklenmiştir; bu yüzden gövde boyutları evreler arasında birebir artmaz.
- Bu çizimler nihai tasarım değildir; üç türün bazı öğeleri (özellikle Kıvılcım'ın turuncu kanatlı gövdesi ve Sedir'in yeşil yapraklı tilki formu) bilinen karakterlere yakınlık riski taşıyabilir; nihai tasarımda `stil-rehberi.md` bölüm 15 uygulanır.
