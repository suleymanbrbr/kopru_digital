# Devir notu

Tarih: 8 Kasım 2026. Bu not PR #13'ün birleşmesinden sonra güncellendi. Yeni bir oturum önce `CLAUDE.md`'yi, sonra bu notu okur.

## Şu an ne var

`main` şunları içerir. Her PR birleşmeden önce `pnpm format:check`, `lint`, `typecheck`, `test`, `build` ve `pnpm --filter @kopru/api-client generate:check` kontrollerinden ve CI'dan (`verify`, `web-e2e`, `mobil`) geçti.

| Parça                    | Durum                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo temeli          | pnpm 10 + Turborepo, katalog sürümleri, Docker Compose (postgres, nats, S3 için RustFS, mailpit, otel-lgtm), `pnpm run doctor`, CI                                                                                                                                                                                                                                                                       |
| `packages/service-kit`   | Fastify 5 + Zod, OpenAPI, pino, Drizzle/postgres.js, düz SQL göç koşucusu, `withTenant`/`withSistem`, outbox + NATS JetStream, idempotent tüketici, pg-boss, `sid` iptal listesi (NATS KV), `TRUST_PROXY` ile gerçek istemci IP'si                                                                                                                                                                       |
| `packages/contracts`     | Olay ve API şemaları, izin sözlüğü (sürüm 2), `MODUL_KODLARI` tek kaynak (`hesap/moduller.ts`)                                                                                                                                                                                                                                                                                                           |
| `services/api` → `hesap` | Telefon OTP, e-posta/parola, e-posta doğrulama, EdDSA erişim JWT'si + JWKS, çıkışta anında token iptali, KVKK onayı (hesap düzeyinde), kurum, üyelik, modül ayarları, gruplar, öğretmen atamaları, davetler (tekil ve toplu; sms, e-posta, bağlantı), sınıf katılım kodu ve öğretmen onayı, oturum listesi ve tüm cihazlardan çıkış, toplu modül durumu, kapsam süzgeci, RLS. 117 test                   |
| Diğer servisler          | `motivasyon`, `bildirim`, `medya` yalnız iskelet (sağlık ucu + worker + `sid` iptal kontrolü). İş mantığı yok                                                                                                                                                                                                                                                                                            |
| `apps/web`               | Next.js 16: gerçek api'ye bağlı (`@kopru/api-client`) giriş → KVKK → kurum seçimi → rol bazlı kabuk ve "Bugün". KVKK metni biçimli, gruplar, sınıf kodu ve onay, davetler (toplu dahil), davet kabul, e-posta doğrulama sayfası, oturumlarım. 60 birim testi, mock e2e 40, gerçek api e2e 10 senaryo (`pnpm --filter @kopru/web e2e:gercek`, CI'a girmez). Ekranlar `apps/web/docs/ekranlar/gercek-api/` |
| `apps/mobile`            | Expo SDK 58: gerçek api adaptörü (token yenileme, hata eşleme), rol sekmeleri, odak sayacı, çevrimdışı kuyruk, karakter bileşeni (SVG yer tutucu, Rive'a hazır), KVKK metni biçimli, sınıf koduyla katılma ve öğretmen onayı, `kopru://davet` derin bağlantısı, oturumlarım. 152 test. iPhone 17 simülatöründe gerçek api'ye karşı doğrulandı. Ekranlar `apps/mobile/docs/ekranlar/`                     |
| Paylaşılan paketler      | `ui-tokens` (WCAG kontrast testi), `i18n` (tek `tr.ts`, modül adları `modul.<kod>`), `api-client` (OpenAPI anlıkları + üretilmiş tipler)                                                                                                                                                                                                                                                                 |
| Dokümanlar               | `docs/adr/0001–0009`, `docs/schema/*`, `docs/karakter/*`, `docs/urun/*`, `docs/gelistirme.md`                                                                                                                                                                                                                                                                                                            |

Tekrar çalıştırılabilir uçtan uca betikler: `services/api/scripts/davet-akisi.sh` (davet → kabul → grup → atama), `services/api/scripts/guvenlik-akisi.sh` (çıkışta iptal, Mailpit ile e-posta doğrulama), `services/api/scripts/oturum-akisi.sh` (oturumlar, toplu davet, toplu modül), `services/api/scripts/sinif-kodu-akisi.sh` (kod → katılım → onay). curl tarifi `docs/gelistirme.md` içinde.

## Hemen yapılacaklar (sırayla)

1. **Kalan cihaz denemeleri.** Android'de gerçek api ile giriş, kurum seçimi, sekmeler ve derin bağlantı (`Pixel_2_API_33`) doğrulandı; sınıf kodu, onay ve oturumlar ekranları Android'de elle denenmedi. iOS ve Android'de en büyük yazı boyutu, ekran okuyucu ve uygulama kapalıyken derin bağlantı denenmedi. Bu Mac'te `expo run:android` emülatörde `adb shell` bellek hatasıyla düşüyor; `cd apps/mobile/android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` ve `adb install` kullanın.
2. **Mobil davet bağlantısı.** Yalnız `kopru://davet/<belirtec>` çalışıyor. Web bağlantısının telefonda uygulamayı açması için evrensel bağlantı gerekiyor (associated domains, app links, alan adı, yeni geliştirme derlemesi).
3. **Küçük düzeltmeler.** Oturumlarım'da cihaz adı ham user agent; web oturumları `node` görünüyor (BFF, kullanıcının user agent'ını iletmiyor). Mobilde OTP gönderim sınırı (429) "yanlış deneme" mesajına düşüyor. `gorunen_ad` boş kullanıcıda ad alanı boş. Branş listesi web'de statik (`ortak.bransler` için uç yok). Markdown ayrıştırıcı web ve mobilde kopya; ortak pakete taşınabilir. Service-kit boş JSON gövdeyi 400 ile reddediyor (istemciler `{}` yolluyor).
4. **Platform yönetimi ve taklit.** Plan hafta 35–37 bloğunda.
5. **Staging.** Barındırma sağlayıcısı henüz seçilmedi (Türkiye'de VM; Kamal ile dağıtım). Canlıda `API_TRUST_PROXY` yalnız özel ağdaki proxy ve web adresleriyle, `WEB_GUVENILEN_PROXY_SAYISI=1` ile verilmeli; api'ye doğrudan genel erişim kalmamalı (ADR 0009). İptal listesi uyarısına ("kontrol atlandı", fail-open) Grafana alarmı bağlanmalı. Sınıf kodu başarısız deneme sayacı bellek içi ve süreç başına; birden çok api kopyasında kalıcı sayaca geçilmeli.

Bunlardan sonra plana göre sıradaki blok **hafta 10–14: takvim, yoklama, finans**. Yoklama ve kredi düşümü aynı işlemde (`api` içinde `ders` + `finans`).

## Karar bekleyenler (proje sahibi)

- **Davet hedefi eşleşmesi.** SMS veya e-postayla giden daveti, bağlantıya sahip ve giriş yapmış herkes kabul edebiliyor (şartnamedeki WhatsApp ile paylaşım modeli). Hedef telefon/e-postayla eşleştirme istenirse Paket D'deki doğrulama altyapısı kullanılabilir.
- **Solo hoca atama akışı.** Bireysel kurumda öğrenci daveti kabul edilince birebir grup otomatik açılıyor, ama branş bilinmediği için öğretmen ataması yapılmıyor. Solo hoca öğretmen rolüyle kendi birebir grubunu görmez; öğrenci ekleme arayüzü branşı sorup `POST .../atamalar` çağırmalı.
- **Sınıf kodu sınırları.** Kod kapatılsa ya da yenilense bile önceden açılmış bekleyen istek onaylanabiliyor; reddedilen öğrenci hız sınırı dışında hemen yeniden istek açabiliyor. İstenirse onayda kodun etkin olması ve yeniden istek için bekleme eklenir.
- **Rive sözleşmesi.** `@rive-app/react-native` 0.5.x'te girdiler (inputs) kullanımdan kalkıyor, View Model veri bağlama öneriliyor. `docs/karakter/rive-yapisi.md`'yi `Companion_VM` View Model'ine göre güncelle (özellikler: `asama`, `ruh_hali`, tetikleyiciler) ya da eski runtime'da kal. İllüstratöre brief gitmeden önce netleşmeli.

## Bilinen açıklar ve kararlar

- **KVKK onayı hesap düzeyinde, kurumdan önce** (ADR 0004 değişiklik notu). KVKK metni hâlâ yer tutucu; avukat metni yeni sürüm olarak yayınlanacak.
- **Sınıf katılım kodu 8 karakter ve öğretmen onaylı** (proje sahibi kararı; `docs/schema/api.md`).
- **Olaylarda kişisel veri yok:** `packages/contracts/src/hesap/olaylar.test.ts` hesap olaylarını yasak alanlara karşı denetler.
- **Token iptali fail-open** (ADR 0008, proje sahibi onayladı). NATS 300 ms içinde yanıt vermezse istek iptal kontrolü yapılmadan geçer; bu pencerede çıkış yapılmış token en çok 15 dk çalışabilir. Anında kesilmesi gereken uçlara (hesap askıya alma gibi) ileride fail-closed eklenebilir.
- **Abonelik:** 402 yanıtı ve plan hakkı (`modul_acik_mi` içinde plan kontrolü) henüz yok; şu an yalnız kurum modül ayarına bakılıyor.
- **E-posta gönderimi** şimdilik `api` içinde SMTP ile (`API_EPOSTA_SAGLAYICI=smtp`, varsayılan `log`). Gerçek gönderim `bildirim` servisine taşınacak. Giriş e-posta doğrulamaya zorlanmıyor.
- **Kıvılcım yer tutucusu** bilinen bir ejderha karakterine fazla benziyor. Bu yalnızca yer tutucu. Nihai çizimde özgün bir siluet şart (`docs/karakter/brief-illustrator.md`).
- **Marka:** "Köprü" adı ve logo geçici.
- `pnpm doctor` değil, **`pnpm run doctor`** (pnpm'in kendi `doctor` komutuyla çakışıyor).
- İşler artık PR ile birleşiyor. Depoda GitHub otomatik birleştirme kapalı.

## Mac geliştirme ortamı

`pnpm run doctor` eksikleri listeler. Son kontrolde tek eksik **Node 24 LTS** (`.nvmrc`), makinede 22.22.2 var: `nvm install 24 && nvm use`. Kontrollerin hepsi Node 22 ile geçti.

Bu makineye özgü durumlar:

- Port 5432 başka bir projenin Postgres'inde. kopru Postgres'i `KOPRU_PG_PORT=5433 pnpm infra:up` ile 5433'te çalışıyor; yerel `.env` buna göre ayarlı. Testler: `DATABASE_URL=postgres://postgres:postgres@localhost:5433/kopru_test`. `NATS_URL=nats://localhost:4222` verilirse service-kit'in NATS testleri de çalışır.
- Playwright'ın tarayıcısı kurulu değil. e2e'ler `PLAYWRIGHT_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` ile çalışıyor.
- `pnpm ios` Swift paket çözümlemesinde donarsa çözüm `docs/gelistirme.md` Mobil bölümünde (Keychain izni / `-packageAuthorizationProvider netrc`).
- OTP'de IP başına saatte 20 istek sınırı var. Yerelde tekrar tekrar deneme yaparken sınıra takılırsanız yerel veritabanında `delete from hesap.otp_istekleri` çalıştırın.

## Senin (iş tarafı) açık işlerin

Şirket kuruluşu, D-U-N-S + Apple Developer, Google Play hesabı, iyzico başvurusu, Netgsm, KVKK avukatı (aydınlatma metni + VERBİS), karakter illüstratörü/Rive animatörü. Ayrıntılar `docs/urun/plan.md`.
