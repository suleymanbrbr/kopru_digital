# Devir notu

Tarih: 8 Kasım 2026. Bu not PR #13'ün birleşmesinden sonra güncellendi. Yeni bir oturum önce `CLAUDE.md`'yi, sonra bu notu okur.

## Şu an ne var

`main` şunları içerir. Her PR birleşmeden önce `pnpm format:check`, `lint`, `typecheck`, `test`, `build` ve `pnpm --filter @kopru/api-client generate:check` kontrollerinden ve CI'dan (`verify`, `web-e2e`, `mobil`) geçti.

| Parça                    | Durum                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo temeli          | pnpm 10 + Turborepo, katalog sürümleri, Docker Compose (postgres, nats, S3 için RustFS, mailpit, otel-lgtm), `pnpm run doctor`, CI                                                                                                                                                                                                                                                     |
| `packages/service-kit`   | Fastify 5 + Zod, OpenAPI, pino, Drizzle/postgres.js, düz SQL göç koşucusu, `withTenant`/`withSistem`, outbox + NATS JetStream, idempotent tüketici, pg-boss, `sid` iptal listesi (NATS KV)                                                                                                                                                                                             |
| `packages/contracts`     | Olay ve API şemaları, izin sözlüğü (sürüm 2), `MODUL_KODLARI` tek kaynak (`hesap/moduller.ts`)                                                                                                                                                                                                                                                                                         |
| `services/api` → `hesap` | Telefon OTP, e-posta/parola, e-posta doğrulama, EdDSA erişim JWT'si + JWKS, çıkışta anında token iptali, KVKK onayı (hesap düzeyinde), kurum, üyelik, modül ayarları, gruplar, öğretmen atamaları, davetler (tekil ve toplu; sms, e-posta, bağlantı), sınıf katılım kodu ve öğretmen onayı, oturum listesi ve tüm cihazlardan çıkış, toplu modül durumu, kapsam süzgeci, RLS. 114 test |
| Diğer servisler          | `motivasyon`, `bildirim`, `medya` yalnız iskelet (sağlık ucu + worker + `sid` iptal kontrolü). İş mantığı yok                                                                                                                                                                                                                                                                          |
| `apps/web`               | Next.js 16: gerçek api'ye bağlı (`@kopru/api-client`) giriş → KVKK → kurum seçimi → rol bazlı kabuk ve "Bugün". KVKK metni biçimli. 47 birim testi, mock e2e 28, gerçek api e2e (`pnpm --filter @kopru/web e2e:gercek`, CI'a girmez). Ekranlar `apps/web/docs/ekranlar/gercek-api/`                                                                                                    |
| `apps/mobile`            | Expo SDK 58: gerçek api adaptörü (token yenileme, hata eşleme), rol sekmeleri, odak sayacı, çevrimdışı kuyruk, karakter bileşeni (SVG yer tutucu, Rive'a hazır), KVKK metni biçimli. 83 test. iPhone 17 simülatöründe gerçek api'ye karşı doğrulandı. Ekranlar `apps/mobile/docs/ekranlar/`                                                                                            |
| Paylaşılan paketler      | `ui-tokens` (WCAG kontrast testi), `i18n` (tek `tr.ts`, modül adları `modul.<kod>`), `api-client` (OpenAPI anlıkları + üretilmiş tipler)                                                                                                                                                                                                                                               |
| Dokümanlar               | `docs/adr/0001–0008`, `docs/schema/*`, `docs/karakter/*`, `docs/urun/*`, `docs/gelistirme.md`                                                                                                                                                                                                                                                                                          |

Tekrar çalıştırılabilir uçtan uca betikler: `services/api/scripts/davet-akisi.sh` (davet → kabul → grup → atama), `services/api/scripts/guvenlik-akisi.sh` (çıkışta iptal, Mailpit ile e-posta doğrulama), `services/api/scripts/oturum-akisi.sh` (oturumlar, toplu davet, toplu modül), `services/api/scripts/sinif-kodu-akisi.sh` (kod → katılım → onay). curl tarifi `docs/gelistirme.md` içinde.

## Hemen yapılacaklar (sırayla)

1. **Yeni uçların ekranları.** Web ve mobil henüz bunları kullanmıyor: `GET /v1/hesap/modul-ayarlari/etkin-tumu` (şu an kurum başına 11 istek), oturum listesi ve tüm cihazlardan çıkış, davet oluşturma ve `/davet/<belirtec>` kabul sayfası, sınıf kodu ve öğretmen onay ekranları. Şartnamedeki derin bağlantı (kurulumdan sonra davetin hatırlanması) da bu işin parçası.
2. **E-posta doğrulama sayfası.** `GET /auth/eposta/dogrula` JSON döndürüyor; bağlantı web'de kullanıcıya görünen bir sayfaya gitmeli (`API_WEB_URL` hazır).
3. **Android doğrulaması.** Emülatörde hiç denenmedi; `10.0.2.2` çevirisi yalnız birim testinde. iOS'ta en büyük yazı boyutu ve VoiceOver da denenmedi.
4. **Mobil tema.** Simülatörde sistem açık temadayken uygulama koyu kaldı (`TemaSaglayici`, nativewind `setColorScheme`). Tema tercihini ve sistem değişikliğini kontrol et.
5. **Küçük düzeltmeler.** Mobilde OTP gönderim sınırı (429) "yanlış deneme" mesajına düşüyor. `gorunen_ad` boş kullanıcıda selamlama adsız. `content-type: application/json` ile boş gövdeli POST 400 alıyor (istemciler `{}` yollamalı ya da service-kit düzeltilmeli). Markdown ayrıştırıcı web ve mobilde kopya (`lib/markdown/ayristir.ts`); ortak pakete taşınabilir. `apps/web/AGENTS.md` `next dev` tarafından üretiliyor ve izlenmiyor.
6. **Platform yönetimi ve taklit.** Plan hafta 35–37 bloğunda.
7. **Staging.** Barındırma sağlayıcısı henüz seçilmedi (Türkiye'de VM; Kamal ile dağıtım). Staging kurulurken iptal listesi uyarısına ("kontrol atlandı", fail-open) Grafana alarmı bağlanmalı. Sınıf kodu başarısız deneme sayacı bellek içi ve süreç başına; birden çok api kopyası çalışacaksa kalıcı sayaca geçilmeli.

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
