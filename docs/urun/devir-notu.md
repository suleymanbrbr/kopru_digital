# Devir notu

Tarih: 7 Kasım 2026. Bu not, Cowork oturumunda yapılan ilk iki dalganın sonunda Claude Code'a devir için yazıldı. Yeni bir oturum önce `CLAUDE.md`'yi, sonra bu notu okur.

## Şu an ne var

`main` (`e3eb3f3` ve sonrası) şunları içerir. Hepsi `pnpm format:check`, `lint`, `typecheck`, `test`, `build` ve `pnpm --filter @kopru/api-client generate:check` kontrollerinden geçti.

| Parça                    | Durum                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo temeli          | pnpm 10 + Turborepo, katalog sürümleri, Docker Compose (postgres, nats, minio, mailpit, otel-lgtm), `pnpm run doctor`, CI (`verify`, `web-e2e`, `mobil` işleri)                   |
| `packages/service-kit`   | Fastify 5 + Zod, OpenAPI, pino, Drizzle/postgres.js, düz SQL göç koşucusu, `withTenant`/`withSistem`, outbox + NATS JetStream, idempotent tüketici, pg-boss                       |
| `services/api` → `hesap` | Telefon OTP, e-posta/parola, EdDSA erişim JWT'si + JWKS, KVKK onayı (hesap düzeyinde), kurum oluşturma (sahip + 9 kademe), üyelikler, modül ayarları, RLS. 16 uç, 58 test         |
| Diğer servisler          | `motivasyon`, `bildirim`, `medya` yalnız iskelet (sağlık ucu + worker). İş mantığı yok                                                                                            |
| `apps/web`               | Next.js 16: giriş → KVKK → kurum seçimi → rol bazlı kabuk ve "Bugün" ekranı. Mock API ile Playwright e2e. Ekran görüntüleri `apps/web/docs/ekranlar/`                             |
| `apps/mobile`            | Expo SDK 58: aynı akış, rol sekmeleri, odak sayacı, çevrimdışı mutasyon kuyruğu, karakter bileşeni (SVG yer tutucu, Rive'a hazır). 42 test. Ekranlar `apps/mobile/docs/ekranlar/` |
| Paylaşılan paketler      | `ui-tokens` (WCAG kontrast testi), `i18n` (tek `tr.ts`), `api-client` (OpenAPI anlıkları + üretilmiş tipler)                                                                      |
| Dokümanlar               | `docs/adr/0001–0007`, `docs/schema/*`, `docs/karakter/*`, `docs/urun/*`, `docs/gelistirme.md`                                                                                     |

Uçtan uca yerelde doğrulanan akış: OTP gönder → doğrula → token → `riza_gerekli` (403) → onay → kurum oluştur → kurum token'ı → üyelik listesi. Tarif `docs/gelistirme.md` içinde.

## Hemen yapılacaklar (sırayla)

1. **Web gerçek adaptörünü gerçek uçlara bağla.** `apps/web/src/sunucu/kimlik/api.ts` tahmini yollar kullanıyor. Elle `fetch` yerine `@kopru/api-client` kullanılmalı:

   | Web'de şu an                      | Gerçek uç                            |
   | --------------------------------- | ------------------------------------ |
   | `/api/auth/phone-number/send-otp` | `POST /auth/otp/gonder`              |
   | `/api/auth/phone-number/verify`   | `POST /auth/otp/dogrula`             |
   | `/v1/hesap/moduller`              | `GET /v1/hesap/modul-ayarlari/etkin` |
   | `/v1/hesap/riza/guncel`           | `GET /v1/hesap/rizalar/guncel`       |
   | `/v1/hesap/riza`                  | `POST /v1/hesap/rizalar`             |
   | `/api/auth/sign-out`              | `POST /auth/cikis`                   |

   `/auth/token` ve `/v1/hesap/uyeliklerim` için gövde ve yanıt şeklini OpenAPI anlığından (`packages/api-client/openapi/api.json`) kontrol et.

2. **Mobil gerçek adaptörü yaz.** `apps/mobile/src/api/index.ts` → `adaptorleriOlustur` içindeki `TODO(orkestrator)`. Sözleşme `Adaptorler` arayüzüdür. `ortam.apiUrl` doluyken `@kopru/api-client` ile oluşturulmuş adaptörleri döndür. Belirteçler `expo-secure-store` üzerinden zaten saklanıyor.

3. **Modül anahtarlarını tek yerde topla.** Şu an üç farklı liste var:
   - web: `ders, odev, plan, deneme, soru, kayit, finans, motivasyon`
   - mobil: `takvim, yoklama, geri_bildirim, kayitlar, finans, odev, haftalik_plan, deneme, soru_sor, oyunlastirma, duyuru`
   - hesap modülü: `services/api/src/modules/hesap` içindeki modül kataloğu

   Doğru kaynak hesap modülünün kataloğudur. Onu `packages/contracts` içine bir sabit + tip olarak taşı. Web ve mobil buradan okusun, i18n anahtarları da aynı adları kullansın.

4. **Alt sekme etiketleri kesik görünüyor (mobil).** Ekran görüntülerinde sekme yazılarının altı kırpılmış. Büyük olasılıkla `useSafeAreaInsets` alt boşluğu sekme çubuğu yüksekliğine eklenmiyor. Gerçek cihazda/simülatörde kontrol et.

5. **Staging.** Barındırma sağlayıcısı henüz seçilmedi (Türkiye'de VM; Kamal ile dağıtım). Plan hafta 4–9 bloğunda staging var.

Bunlardan sonra plana göre sıradaki blok **hafta 10–14: takvim, yoklama, finans**. Yoklama ve kredi düşümü aynı işlemde (`api` içinde `ders` + `finans`).

## Bilinen açıklar ve kararlar

- **KVKK onayı hesap düzeyinde, kurumdan önce.** ADR 0004'e değişiklik notu olarak işlendi (7 Kasım 2026).
- **Rive sözleşmesi.** `@rive-app/react-native` 0.5.x'te girdiler (inputs) kullanımdan kalkıyor, View Model veri bağlama öneriliyor. `docs/karakter/rive-yapisi.md`'yi `Companion_VM` View Model'ine göre güncelle (özellikler: `asama`, `ruh_hali`, tetikleyiciler). Ya da eski runtime'da kal. Karar verilmeli; illüstratöre brief gitmeden önce netleşmeli.
- **Kıvılcım yer tutucusu** bilinen bir ejderha karakterine fazla benziyor. Bu yalnızca yer tutucu. Nihai çizimde özgün bir siluet şart (`docs/karakter/brief-illustrator.md`).
- **Hesap modülünde eksik uçlar:** davetler, gruplar, öğretmen–öğrenci atamaları, platform yönetimi/impersonation, e-posta doğrulama.
- **Güvenlik:** JWT `sid` iptal listesi yok (çıkışta erişim token'ı 15 dk geçerli kalıyor). `withSistem()` kullanımını `src/sistem/**` ile sınırlayan lint kuralı yok.
- **Abonelik:** 402 yanıtı ve plan hakkı (`modul_acik_mi` içinde plan kontrolü) henüz yok; şu an yalnız kurum modül ayarına bakılıyor.
- **Marka:** "Köprü" adı ve logo geçici.
- `pnpm doctor` değil, **`pnpm run doctor`** (pnpm'in kendi `doctor` komutuyla çakışıyor).
- gh CLI token'ı Cowork ortamında geçersizdi, PR açılamadı. Dallar doğrudan `main`'e birleştirildi. Claude Code'da PR akışına geçilebilir.

## Mac kurulumu (devralmadan önce)

`pnpm run doctor` eksikleri listeler. Son kontrolde eksik olanlar:

- Node 24 LTS (`.nvmrc`), şu an 22.22.2. `nvm install && nvm use`
- pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`), şu an 9.15.4
- watchman (`brew install watchman`)
- JDK 17 (`brew install --cask zulu@17`). Java 22 React Native Android derlemesinde sorun çıkarır
- `ANDROID_HOME` ayarı (`export ANDROID_HOME=$HOME/Library/Android/sdk`, PATH'e `platform-tools` ve `emulator`)
- conda `(base)` otomatik etkinleşmesini kapat (`conda config --set auto_activate_base false`). Yoksa Ruby/CocoaPods ve Python yolları karışabilir

## Senin (iş tarafı) açık işlerin

Şirket kuruluşu, D-U-N-S + Apple Developer, Google Play hesabı, iyzico başvurusu, Netgsm, KVKK avukatı (aydınlatma metni + VERBİS), karakter illüstratörü/Rive animatörü. Ayrıntılar `docs/urun/plan.md`.
