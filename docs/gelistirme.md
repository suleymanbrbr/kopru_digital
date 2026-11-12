# Geliştirme Rehberi

Bu doküman `kopru_digital` monorepo'sunu yerelde kurmayı, çalıştırmayı ve genişletmeyi anlatır.

## Mimari özeti

- **Monorepo:** pnpm workspace + Turborepo. Çalışma alanları: `apps/*` (web/mobil, sonra gelecek), `services/*`, `packages/*`, `tools/*`.
- **Servisler:** `api` (çekirdek, modüler: `hesap`, `ders`, `finans`, `ogrenme`, `abonelik`), `motivasyon`, `bildirim`, `medya`. Her servisin kendi PostgreSQL veritabanı ve kullanıcısı vardır.
- **İletişim:** NATS JetStream olayları + transactional outbox. Servisler birbirini import edemez.
- **Çok kiracılık:** `kurum_id` + PostgreSQL RLS. `withTenant` her işlemde `app.kurum_id`, `app.kullanici_id`, `app.roller` oturum değişkenlerini ayarlar.
- **Paketler:** `@kopru/config` (tsconfig, ESLint, Prettier, Vitest), `@kopru/contracts` (Zod sözleşmeleri, olay zarfı), `@kopru/service-kit` (Fastify servis temeli).
- **Adlandırma:** alan terimleri Türkçe ASCII (`kurum`, `uyelik`, `yoklama`, `kurum_id`), teknik tanımlayıcılar İngilizce (`createService`, `healthCheck`). Kullanıcıya görünen metinler Türkçe.

## Mac kurulumu

1. Homebrew: <https://brew.sh>
2. Node 24 (LTS) ve pnpm 10:
   ```sh
   brew install nvm
   nvm install 24 && nvm use        # .nvmrc = 24
   corepack enable                  # packageManager alanındaki pnpm sürümünü kullanır
   ```
3. Docker Desktop: `brew install --cask docker`, ardından uygulamayı açın.
4. Mobil geliştirme için (uygulamalar geldiğinde): `brew install watchman cocoapods`, JDK 17 (`brew install --cask zulu@17`, `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`), Xcode (App Store) ve Android Studio (`ANDROID_HOME=$HOME/Library/Android/sdk`).
5. Bağımlılıklar ve ortam değişkenleri:
   ```sh
   pnpm install
   cp .env.example .env
   pnpm run doctor                  # eksikleri Türkçe tablo ve çözüm komutlarıyla listeler
   ```

> `pnpm doctor` pnpm'in kendi (yerleşik) komutunu çalıştırır; projenin kontrolü için **`pnpm run doctor`** kullanın. macOS'a özgü kontroller Linux'ta "atlandı" olarak gösterilir.

## Altyapıyı çalıştırma

```sh
pnpm infra:up      # postgres, nats, minio, mailpit, grafana otel-lgtm
pnpm infra:down
docker compose -f infra/docker/compose.yaml ps   # sağlık durumu
```

| Servis        | Adres                                       | Not                                                                             |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| PostgreSQL 17 | `localhost:5432`                            | `api`, `motivasyon`, `bildirim`, `medya` db + kullanıcı (şifre = kullanıcı adı) |
| NATS          | `localhost:4222` (izleme: `8222`)           | JetStream açık, kalıcı volume                                                   |
| S3 (RustFS)   | S3 `9000`, konsol `http://localhost:9001`   | `medya` bucket'ı otomatik oluşur (MinIO imajları Docker Hub'dan kalktı)         |
| Mailpit       | SMTP `1025`, arayüz `http://localhost:8025` | Giden e-postalar burada görünür                                                 |
| Grafana       | `http://localhost:3030`                     | Loki, Tempo, Prometheus + OTLP `4317` / `4318`                                  |

5432 başka bir yerel Postgres tarafından kullanılıyorsa `KOPRU_PG_PORT=5433 pnpm infra:up` çalıştırın ve `.env` içindeki `localhost:5432` adreslerini `5433` yapın.

Postgres init betiği (`infra/docker/postgres/init/`) yalnızca veri dizini ilk oluşturulurken çalışır. Sıfırlamak için `pnpm infra:down` ve ardından `docker volume rm kopru_postgres_data`.

## Servisleri çalıştırma

```sh
pnpm dev                                   # tüm paketler/servisler (turbo, izleme modu)
pnpm --filter @kopru/api dev               # tek servis (tsx watch)
pnpm --filter @kopru/api dev:worker        # aynı servisin worker süreci
```

- Her servis kök `.env` dosyasını okur. `API_PORT`, `API_DATABASE_URL` gibi `<SERVİS>_<ANAHTAR>` değişkenleri `PORT`, `DATABASE_URL` değişkenlerinden önce okunur; üretimde konteyner yalnızca önekli olmayanları alır.
- Portlar: api `4000`, motivasyon `4001`, bildirim `4002`, medya `4003`.
- Uç noktalar: `GET /health` (liveness, bağımlılık kontrol etmez), `GET /ready` (DB ve NATS tanımlıysa kontrol eder, aksi halde 503), `GET /openapi.json` (production dışında). Kimlik doğrulama `AUTH_ENABLED=true` ile açılır; `/health`, `/ready`, `/openapi.json` her zaman açıktır.
- `TRUST_PROXY` (güvenilen proxy IP/CIDR listesi, [ADR 0009](adr/0009-guvenilir-proxy-istemci-ip.md)) yerelde **boş** bırakılır; doğrudan bağlanan istemcinin IP'si kullanılır. Üretimde yalnız özel ağdaki proxy/web adresleri verilir; `*`/`true` reddedilir.
- Geçersiz ortam değişkeni → servis açık bir hata mesajıyla hemen durur.
- Docker imajı: `docker build -f services/api/Dockerfile -t kopru/api .` (kök dizinden). Aynı imaj worker olarak `docker run kopru/api node dist/worker.js` ile çalışır.

## Test, lint, tip kontrolü, build

```sh
pnpm lint          # ESLint (tip-bilgili) + bağımlılık sınırları
pnpm typecheck
pnpm test
pnpm build
pnpm format        # Prettier (CI'da format:check)
```

Veritabanı gerektiren testler `DATABASE_URL` tanımlıysa çalışır, değilse uyarı basıp atlanır. Yerelde örnek:

```sh
pnpm infra:up
docker compose -f infra/docker/compose.yaml exec postgres psql -U postgres -c 'create database kopru_test'
DATABASE_URL=postgres://postgres:postgres@localhost:5432/kopru_test pnpm test
```

Turbo, `DATABASE_URL` ve `NATS_URL` değerlerini test önbellek anahtarına katar. `lint`, `typecheck` ve `test`, bağımlı paketlerin derlenmiş çıktısına (`dist`) ihtiyaç duyduğu için önce `^build` çalışır.

## Bağımlılık sınırları (ESLint ile zorlanır)

1. Bir servis başka bir servisi import edemez (`@kopru/<servis>` veya göreli yol). İletişim NATS olayları (`@kopru/contracts`) ve HTTP üzerindendir.
2. `packages/*` hiçbir servise bağımlı olamaz.
3. `services/api` içinde bir modül başka modülün yalnızca `index.ts` dosyasını import edebilir; iç dosyalarına erişemez.

Kurallar `packages/config/eslint.js` içindeki `boundaryConfigs` ile `services/*` ve `services/api/src/modules/*` dizinlerinden otomatik üretilir; yeni servis/modül için kural dosyasını değiştirmek gerekmez.

## Yeni api modülü ekleme

1. `services/api/src/modules/<modul>/index.ts` oluşturun:
   ```ts
   import { defineModule } from '../define-module.js';

   export const <modul>Module = defineModule('<modul>'); // rotalar için ikinci argüman: ServicePlugin
   ```
2. `services/api/src/modules/index.ts` içindeki `modules` listesine ekleyin. Rotalar `/v1/<modul>` altında kaydolur.
3. Modül kendi PostgreSQL şemasını kullanır (`<modul>` şeması). Dışarıya açılacak her şey `index.ts`'ten export edilir.
4. Tenant verisi yazan/okuyan kod `withTenant(app.db, { kurumId, kullaniciId, roller }, async (tx) => ...)` içinde çalışır. Tablolarda RLS politikası `current_setting('app.kurum_id', true)::uuid` ile yazılır; uygulama kullanıcısı tablo sahibiyse `alter table ... force row level security` gerekir.
5. Bir olay yayınlanacaksa `publishInTx(tx, event)` aynı transaction içinde outbox'a yazar. Olay tanımları `packages/contracts` içinde `defineEvent` ile yapılır.

## Yeni servis ekleme

Şimdilik mevcut bir servisin (örn. `services/motivasyon`) dizinini kopyalayarak başlayın (generator sonra gelecek):

1. `services/<ad>/` dizinini kopyalayın; `package.json` adını `@kopru/<ad>`, `src/config.ts` içindeki `serviceName` ve varsayılan portu, `Dockerfile` içindeki filtre ve port değerlerini güncelleyin.
2. `.env.example` dosyasına `<AD>_PORT` ve `<AD>_DATABASE_URL` ekleyin; `infra/docker/postgres/init/01-roles-and-databases.sql` içine veritabanı ve kullanıcıyı ekleyin.
3. `pnpm install`, ardından `pnpm lint typecheck test build`. Sınır kuralları yeni servisi otomatik tanır.
4. Gerekirse `src/app.ts` içinde `createService({ plugins: [...] })` ile rotaları, `src/worker.ts` içinde `runWorker({ setup })` ile arka plan işlerini ekleyin.

## api: veritabanı, migration ve yerel giriş

`api` üç veritabanı rolüyle çalışır ([ADR 0003](adr/0003-kiraci-izolasyonu-rls.md)): `api_owner` (tabloların sahibi, yalnızca migration), `api_app` (uygulama, `NOBYPASSRLS`) ve `api_sistem` (`BYPASSRLS`, yalnızca `withSistem()`). Docker Postgres init betiği bu rolleri oluşturur; `.env.example` üç bağlantıyı da içerir (`API_DATABASE_URL`, `API_DATABASE_SISTEM_URL`, `API_DATABASE_OWNER_URL`).

```sh
pnpm infra:up
pnpm --filter @kopru/api db:migrate          # bekleyen SQL migration'ları (services/api/migrations) uygular
pnpm --filter @kopru/api db:generate yeni_ad # siradaki numarayla bos migration dosyasi
pnpm --filter @kopru/api dev                 # API http://localhost:4000
```

- Migration'lar düz SQL'dir (RLS, roller ve yetkiler drizzle-kit ile üretilemediği için). Runner `SET ROLE api_owner` ile çalışır, uygulanmış dosyanın özetini (`ortak.migrasyonlar`) denetler ve rol/izin sözlüğünü `@kopru/contracts` sabitiyle eşitler. Drizzle tabloları `src/db/schema.ts` içindedir; `schema.test.ts` sütunların migration sonucuyla aynı olduğunu doğrular. Migration'ı değiştirmek yerine yeni dosya ekleyin.
- Tablo sahibi RLS'i atladığı için kiracı tablolarında `ortak.kiraci_tablosu_koru('sema', 'tablo')` çağrılır (RLS ENABLE + FORCE, politika, tetikleyiciler).
- `ortak.outbox` olayları iş verisiyle aynı işlemde yazılır; worker (`dev:worker`) `api_sistem` bağlantısıyla relay'i çalıştırır.

### Yerelde giriş ve kurum oluşturma (curl)

OTP kodu `API_SMS_SAGLAYICI=log` iken API loguna `[DEV SMS]` satırı olarak düşer. Gerçek Netgsm gönderimi `bildirim` servisiyle gelecek (`SmsGonderici` arayüzü).

```sh
B=localhost:4000; H='content-type: application/json'
curl -s -XPOST $B/auth/otp/gonder -H "$H" -d '{"telefon":"0532 111 22 33"}'
# loglardaki 6 haneli kodu alin
curl -s -XPOST $B/auth/otp/dogrula -H "$H" -d '{"telefon":"05321112233","kod":"123456"}'   # -> oturum_belirteci
curl -s -XPOST $B/auth/token -H "authorization: Bearer <oturum_belirteci>" -H "$H" -d '{}' # -> access_token (15 dk)
curl -s $B/v1/hesap/rizalar/guncel -H "authorization: Bearer <access_token>"                # KVKK metni
curl -s -XPOST $B/v1/hesap/rizalar -H "authorization: Bearer <access_token>" -H "$H" -d '{"riza_metni_id":"<id>"}'
curl -s -XPOST $B/v1/hesap/kurumlar -H "authorization: Bearer <access_token>" -H "$H" -d '{"ad":"Deneme","tur":"kurum"}'
curl -s -XPOST $B/auth/token -H "authorization: Bearer <oturum_belirteci>" -H "$H" -d '{"kurum_id":"<kurum_id>"}' # kuruma bagli token
```

- Rıza verilmeden `riza_gerekli` (403) döner; muaf uç noktalar: `/auth/*`, `/.well-known/*`, `/v1/hesap/ben`, `/v1/hesap/rizalar*`.
- Diğer servisler `JWKS_URL=http://localhost:4000/.well-known/jwks.json`, `JWT_ISSUER`, `JWT_AUDIENCE=kopru` ile `AUTH_ENABLED=true` çalıştırır.
- Yetki kapısı: rotada `preHandler: requirePermission('izin.kodu', { scope })` ([ADR 0004](adr/0004-kimlik-dogrulama-ve-yetkilendirme.md) kontrol sırası). Rol -> izin -> kapsam sözlüğü `packages/contracts/src/hesap/izinler.ts` içindedir.
- Testler: `DATABASE_URL` (superuser) verildiğinde `vitest` global kurulumu sıfırdan migrate edilmiş geçici bir veritabanı oluşturur ve sonunda siler; verilmezse DB testleri atlanır.

## medya: dosya yükleme, işleme ve depolama

`services/medya`: dosya kayıtları, presigned yükleme, doğrulama/işleme (görsel yeniden kodlama, küçük resimler, ses süresi), saklama/silme, kota ve api için iç okuma ucu. Şema ve kurallar: [docs/schema/medya.md](schema/medya.md).

```sh
# veritabani (ilk kez): yeni cluster'da roller init betigiyle gelir; var olan cluster'da migrator rolleri olusturur
pnpm --filter @kopru/medya db:migrate     # MEDYA_DATABASE_OWNER_URL (db sahibi) ile; MEDYA_APP_PASSWORD/MEDYA_SISTEM_PASSWORD istege bagli
pnpm --filter @kopru/medya dev            # API (4003)
pnpm --filter @kopru/medya dev:worker     # isleme, silme, zamanlanmis isler, olay tuketicileri, outbox relay
```

- **Roller:** `medya_owner` (tablo sahibi, nologin), `medya_app` (NOBYPASSRLS; API ve olay tüketicileri), `medya_sistem` (BYPASSRLS; worker işleri ve outbox relay). Her kiracı tablosunda `kurum_id` + RLS; izolasyon testleri `medya_app` ile bağlanır.
- **Ortam:** `MEDYA_DATABASE_URL`/`MEDYA_DATABASE_SISTEM_URL`, `MEDYA_S3_ENDPOINT` (servis içi), `MEDYA_S3_GENEL_ENDPOINT` (istemciye verilen presigned adresin ana makinesi), `MEDYA_S3_ACCESS_KEY_ID/SECRET_ACCESS_KEY`, `S3_BUCKET` (varsayılan `medya`), `MEDYA_AUTH_ENABLED=true` + `JWKS_URL` (api'nin JWKS'i), `MEDYA_VARSAYILAN_KOTA_BAYT` (varsayılan 5 GiB). Geliştirmede açılışta kova ve CORS (`CORS_ORIGINS`) idempotent ayarlanır (RustFS `PutBucketCors` destekler; üretimde varsayılan kapalı).
- **İstemci akışı:** (1) `POST /v1/dosyalar` `{tur, mime_tipi, boyut_bayt, sha256, istemci_anahtari}` → `yukleme.url` + `yukleme.basliklar`; (2) `PUT yukleme.url` gövde = ham bayt, başlıklar **aynen** (`Content-Type`; `Content-Length` istemci kitaplığı koyar, ikisi de imzalıdır, farklı değer 403 `SignatureDoesNotMatch`); (3) `POST /v1/dosyalar/{id}/tamam` (PUT bitince; 409 `yukleme_bulunamadi` ise kısa süre sonra tekrar); (4) `GET /v1/dosyalar/{id}` ile `durum=hazir` olana kadar 1–2 sn aralıkla yokla (`islenemedi` ise `hata_kodu`). Zayıf bağlantıda aynı `istemci_anahtari` ile (UUID, istemci üretir) `POST` tekrarlanabilir: aynı kayıt ve yeni PUT adresi döner; 15 dk geçtiyse 409 `yukleme_suresi_doldu` → yeni anahtarla yeniden başla. HEIC kabul edilmez: istemci JPEG'e çevirir. Ses azami 180 sn / 5 MB; süre bilgisi içermeyen kayıtlar (ör. başlıksız MediaRecorder webm) süresi doğrulanamadığı için reddedilir.
- **Görsel kodlama (ölçüm):** fotoğraf türleri EXIF/ICC silinerek ve yön düzeltilerek uzun kenar 2000 px, JPEG kalite 78 (mozjpeg, 4:2:0) ile yeniden kodlanır; çizim PNG kalır (256 renk palet); logo uzun kenar 1024, avatar 1024 JPEG q80; küçük resimler WebP 256 px (q72) ve 1024 px (q78). `pnpm --filter @kopru/medya olc:gorsel` 12 MP (4032x3024) sentetik defter sayfası ve (`--dosya`) verilen gerçek fotoğraf için boyut/süre/ortalama piksel farkı tablosu basar. Ölçülen: sentetik sayfa q78 → 1600 px 97 KB, **2000 px 137 KB**, 2400 px 189 KB; 4K manzara fotoğrafı (yüksek ayrıntı) 2000 px q78 → 203 KB (q85: 262 KB). Yüksek gürültülü 3000x2000 sentetik JPEG (3,4 MB) uçtan uca denemede 391 KB'a (2000 px, q78) indi. Gerçek telefon fotoğrafları sensör gürültüsü ve ayrıntı nedeniyle daha ağırdır; 2000 px/q78 hedef bandı (250–400 KB) için seçildi, metin 2000 px'te okunur kalır (sayfa görseli incelendi). Gerçek defter fotoğraflarıyla yeniden ölçülmeli; ortalama 250 KB altında kalırsa kalite 85'e çıkarılabilir (`gorsel.ts` `FOTOGRAF_PROFILI`).
- **Testler:** `DATABASE_URL` (superuser) verilirse veritabanı testleri, ayrıca `S3_ENDPOINT`+`S3_ACCESS_KEY_ID`+`S3_SECRET_ACCESS_KEY` ile yükleme/silme/iç uç testleri (rastgele adlı geçici kova açılır ve silinir), `NATS_URL` ile olay tüketicisi testleri çalışır; yoksa uyarıyla atlanır. Dosyalar sırayla koşar (silme işi kiracılar arası çalışır).
  ```sh
  DATABASE_URL=postgres://postgres:postgres@localhost:5433/kopru_test NATS_URL=nats://localhost:4222 \
  S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY_ID=kopru S3_SECRET_ACCESS_KEY=kopru-dev-secret \
  pnpm --filter @kopru/medya test
  ```
- **Uçtan uca deneme:** `services/medya/scripts/yukleme-akisi.sh` (api 4267 + medya 4263 + worker; ayrıntı betiğin başında).
- **Docker:** `docker build -f services/medya/Dockerfile -t kopru/medya .`; aynı imaj worker olarak `node dist/worker.js` çalıştırır. `sharp` platforma uygun yerel ikilisini (`@img/sharp-linux-*`) kurulumda alır.

## Outbox ve olay akışı

- Tablo şablonu: `packages/service-kit/migrations/outbox.sql` (api'de `ortak.outbox`, migration içinde `-- @outbox-sablonu ortak` satırıyla eklenir) (`renderOutboxMigration(schema)` ile şema adı doldurulur). Her servis bunu kendi migration'larına dahil eder.
- Worker süreci (`src/worker.ts`) `DATABASE_URL` ve `NATS_URL` tanımlıysa `EVENTS` stream'ini (`evt.>`) oluşturur ve `startOutboxRelay` ile bekleyen olayları `FOR UPDATE SKIP LOCKED` kullanarak JetStream'e yayınlar. `Nats-Msg-Id` olay id'sidir; tekrar gönderimler JetStream'in duplicate penceresinde elenir.
- Outbox tablosu migration ile oluşturulmadan worker çalıştırılırsa relay her saniye hata loglar; önce migration'ı uygulayın.
- **Hesap olaylarını yeniden yayımlama.** Tüketici servislerin (`motivasyon`, `medya`, `bildirim`) `hesap` kopyaları boşsa ya da bozulduysa mevcut durumu olay olarak yeniden yazın ([ADR 0002](adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md) "yeniden yayımlama"):
  ```sh
  export API_DATABASE_SISTEM_URL=postgres://api_sistem:...@localhost:5432/kopru   # BYPASSRLS rolü
  pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap --kuru                 # yalnız sayar
  pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap                        # tüm kurumlar
  pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap --kurum <uuid> --parca 200
  ```
  Olaylar outbox'a yazılır; api worker'ının relay'i yayımlar. Olaylar `actor.id = 'olay-yeniden-yayimla'` ve `correlationId = 'yeniden-yayimla:<id>'` ile ayırt edilir. Komut tekrar çalıştırılabilir; hata alan kurum raporlanır ve çıkış kodu 1 olur.

## CI

`.github/workflows/ci.yml`: PR ve `main` push'larında Node 24 + pnpm ile `format:check`, `lint`, `typecheck`, `test` (postgres:17 service container, `DATABASE_URL` ile) ve `build` çalışır.

## Mobil uygulama (`apps/mobile`)

Expo SDK 58 (React Native 0.88, Expo Router, NativeWind 4, Reanimated 4, MMKV, TanStack Query), iOS + Android tek kod tabanı. Yerel modüller (MMKV, Rive, Nitro) nedeniyle **Expo Go değil, geliştirme derlemesi (development build)** gerekir. Faz 1 rolleri: sahip, yönetici, öğretmen, öğrenci (veli arayüzü yok).

### Çalıştırma (Mac: Xcode + iOS simülatörü / Android emülatörü)

```sh
pnpm install
cp apps/mobile/.env.example apps/mobile/.env      # EXPO_PUBLIC_API_MOCK=1 -> backend gerekmez
cd apps/mobile
pnpm ios          # ilk seferde: prebuild + pod install + Xcode derlemesi + simülatörde açar (npx expo run:ios)
pnpm android      # Android emülatörü açıkken (npx expo run:android)
pnpm start        # sonraki günlerde yalnızca Metro (dev client'a bağlanır)
```

- `pnpm ios` "Resolve Package Graph" aşamasında donuyorsa Swift paket yöneticisi Keychain erişim izni bekliyordur (ör. `gh auth login` sonrası `github.com` kaydı; Rive binary paketi indirilirken sorulur). Çözüm: Keychain penceresine izin verin ya da komut satırından `cd apps/mobile/ios && xcodebuild -workspace Kopru.xcworkspace -scheme Kopru -sdk iphonesimulator -packageAuthorizationProvider netrc build` ile derleyin.
- `ios/` ve `android/` dizinleri git'e girmez; `app.config.ts` + config plugin'lerden üretilir (`pnpm prebuild:native`, kimlik/plugin değişince `--clean`).
- `pnpm ios/android/start` önce `@kopru/ui-tokens` ve `@kopru/i18n` paketlerini derler (Metro `dist` çıktısını okur). `packages/i18n` ya da `ui-tokens` değişince Metro'yu yeniden başlatın.
- Uygulama kimliği `app.config.ts` içinde ortamdan okunur: `APP_BUNDLE_ID` (varsayılan `com.koprudigital.app`, yer tutucu), `APP_ADI`, `APP_SCHEME`.
- Hızlı UI denemesi için tarayıcıda: `pnpm --filter @kopru/mobile web` (Rive/MMKV/SecureStore web karşılıklarıyla çalışır; yalnızca geliştirme amaçlı).

### Mock modu

`EXPO_PUBLIC_API_MOCK=1` iken `AuthAdapter`/`VeriAdapter` sahte uygulamaları devrede (`src/api/mock.ts`). Giriş kodu her zaman `123456`. Telefonun **son hanesi** rolü seçer: `...1` öğretmen, `...2` öğrenci, `...3` yönetici, `...4` sahip (+ öğretmen üyeliği), `...5` çok kurumlu (öğretmen/öğrenci/veli; "Atlas" kurumunda vurgu rengi yeşil ve "Soru sor" modülü kapalı). `...6` üyeliksiz kullanıcı (sınıf koduyla katılma akışı). Mock sınıf kodları: `MATEM234` (başarılı), `ZATEN234` (zaten üye), `BEKLE234` (429). Davet derin bağlantısı `kopru://davet/<belirtec>`. Mock kapalıyken gerçek `packages/api-client` bağlanana kadar adaptörler `yapilandirma` hatası verir (`src/api/index.ts`, `TODO(orkestrator)`).

### Mimari notları

- **Yönlendirme:** Expo Router; oturum durumuna göre `Stack.Protected` ile korunan gruplar: `(auth)` -> KVKK onayı (kabul edilmeden uygulamaya geçilemez) -> kurum seçimi -> `(uygulama)`. Sunucu `403 riza_gerekli` dönerse oturum yöneticisi KVKK ekranına geri alır, `401` oturumu kapatır.
- **Rol -> sekme:** tek yapılandırma `src/nav/yapilandirma.ts`; her sekmenin bir modül anahtarı vardır (`hesap.modul_ayarlari` kodları). Kapalı ya da bilinmeyen modülün sekmesi gizlenir.
- **Tema:** `tailwind.config.js` renkleri `@kopru/ui-tokens` anahtarlarından CSS değişkenine (`--renk-*`) bağlar; değerleri `TemaSaglayici` çalışma anında (açık/koyu + kurum `vurgu` rengi) atar. Vurgu üzerindeki metin rengi kontrasta göre seçilir.
- **Oturum:** belirteçler `expo-secure-store` (Keychain/Keystore); TanStack Query önbelleği MMKV'de kalıcı (çıkışta ve kurum değişiminde temizlenir).
- **Çevrimdışı kuyruk:** `src/offline/kuyruk.ts` kalıcı, sıralı bir mutasyon kuyruğudur. Her iş istemcide üretilen `istek_id` (UUIDv7) taşır ve her denemede aynı gönderilir (sunucu idempotent işler). Bağlantı gelince NetInfo ile boşaltılır; ağ/5xx hatalarında üstel geri çekilme, 4xx'te `basarisiz` listesi. Yoklama gibi akışlar `kuyruk.kaydet('yoklama.kaydet', isleyici)` + `kuyruk.ekle(...)` ile kullanır.
- **Yol arkadaşı (`Companion`):** Rive kaynağı verilmediği sürece `assets/karakter/placeholder/*.svg` statik yer tutucuları kullanılır; harita `pnpm --filter @kopru/mobile karakter:uret` ile üretilir (elle çoğaltma yok). Hareket azaltma (işletim sistemi ya da Profil > Animasyonlar) açıkken Rive hiç çalışmaz. Geliştirmede Profil > "Geliştirici: Bileşenler" ekranı 15 yer tutucuyu gösterir.

### Soru sor (mobil)

Modül `soru_sor`; kapalıysa öğrenci "Soru sor", öğretmen "Sorular" sekmesi ve Bugün kartları gizlenir. Giriş noktaları: öğrenci Bugün ("Soru sor" düğmesi, "Cevaplanan sorularım"), "Soru sor" sekmesi → `soru-yeni`, `sorularim`, `soru/[id]`; öğretmen Bugün ("Cevap bekleyen sorular (N)"), "Sorular" sekmesi (kuyruk, cevapladıklarım, "Bugün cevap veremiyorum") → `soru/[id]` → `soru-cevap/[id]`.

- **Ortam:** `EXPO_PUBLIC_MEDYA_URL` medya servisinin adresidir (boşsa `EXPO_PUBLIC_API_URL`; canlıda iki servis aynı alan adındadır). Yerelde medya 4272'de çalışırsa `EXPO_PUBLIC_MEDYA_URL=http://localhost:4272`; presigned PUT adresi `MEDYA_S3_GENEL_ENDPOINT` ile simülatörün ulaşabileceği bir ana makine olmalıdır.
- **Yeni yerel modüller:** `@shopify/react-native-skia` (çizim ve düzleştirme), `expo-audio`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`. Kurulumdan sonra yeni geliştirme derlemesi gerekir (`pnpm ios` ya da `docs/gelistirme.md` Mobil'deki xcodebuild yolu; `pod install` için süreçte `LANG=en_US.UTF-8`).
- **Yükleme hattı** (`src/yukleme/`): her dosya kalıcı bir kayıttır (`bekliyor → izin_alindi → yukleniyor → tamam → hazir | hata`); `istemci_anahtari` dosyanın ömrü boyunca sabittir. PUT `expo-file-system/legacy` `uploadAsync` ile **iOS arka plan oturumunda** (`FileSystemSessionType.BACKGROUND`) yapılır: uygulama arka plandayken sürer, sunucu/bağlantı kesikse sistem yeniden dener. Uygulama öldürülürse Promise kaybolur; açılışta `yukleniyor` kayıtlar için önce `tamam` sorulur (nesne varsa PUT tekrarlanmaz, yoksa 409 `yukleme_bulunamadi` ile yeni izinle bastan yüklenir). Tek PUT bayt düzeyinde sürdürülemez (S3 tek PUT); "kaldığı yerden" = tamamlanmış adımlar tekrarlanmaz. Soru/cevap/takip, tüm dosyalar `hazir` olunca `soru.gonder` işi olarak `OfflineKuyruk`a `istek_id` ile girer; `409 dosya_hazir_degil` kısa aralıkla yeniden denenir, kalıcı hata (`kota_asildi` dahil) `OfflineKuyruk.basarisiz` listesine düşmez, gönderim "hata" olur.
- **Çizim verisi** (`cizim_verisi`, en çok 256 KB; ayrıntı `src/cizim/model.ts`): `{ v:1, oran, zamanli, sure_ms?, cizgiler:[{ a:"kirmizi|mavi|siyah|silgi", k, n:[x,y(,t)…] }] }`; x,y 0..10000 izgara, `t` mini anlatımda ses kaydının başlangıcına göre ms. Düzleştirilmiş JPEG (`soru_cizim`) asıl gösterimdir; vektör veri yalnız mini anlatım oynatıcısı içindir.
- **Kamera/kırpma:** sistem kamerası (`expo-image-picker`) + kendi kırp/döndür ekranı. Otomatik kenar algılama yoktur (VisionKit tabanlı belge tarayıcı modülü simülatörde denenemediği ve yeni mimariyle uyumu doğrulanmadığı için eklenmedi).

### Doğrulama

```sh
pnpm --filter @kopru/mobile typecheck
pnpm --filter @kopru/mobile lint
pnpm --filter @kopru/mobile test
cd apps/mobile && npx expo-doctor
EXPO_PUBLIC_API_MOCK=1 npx expo export --platform ios     # paket derlenir mi
npx expo prebuild --no-install --clean                    # native yapılandırma üretilir mi
```

Ekran görüntüleri: `apps/mobile/docs/ekranlar/`.

## api: güvenlik (oturum iptali, `withSistem`, e-posta doğrulama)

- **Oturum iptali.** `POST /auth/cikis` aynı `sid`'li erişim belirteçlerini NATS KV `iptal` kovasına yazar; `@kopru/service-kit` her serviste istek başına kontrol eder ([ADR 0008](adr/0008-erisim-belirteci-iptali-sid-listesi.md)). `NATS_URL` yoksa süreç içi depo kullanılır (yalnızca tek süreç). NATS erişilemezse okuma fail-open'dır.
- **`withSistem()`** yalnızca `services/<servis>/src/sistem/**` altında çağrılır (ESLint `kopru/sistem-siniri`, test dosyaları muaf). Modül kodu, `src/sistem/` altındaki adlandırılmış bir fonksiyonu (örn. `kurumOlusturSistem`) iş gövdesiyle çağırır; eylem adı ve neden orada sabittir.
- **E-posta.** `API_EPOSTA_SAGLAYICI=smtp` ile doğrulama ve davet e-postaları SMTP'ye (yerelde Mailpit `localhost:1025`, arayüz `http://localhost:8025`) gider; varsayılan `log` hiçbir şey göndermez. Doğrulama bağlantısı `${API_WEB_URL}/eposta-dogrula?belirtec=...`; yeniden gönderme `POST /auth/eposta/dogrulama-gonder`. Doğrulama durumu `GET /v1/hesap/ben` yanıtında `kullanici.eposta_dogrulandi`. Giriş doğrulamaya bağlı değildir.
- **Web adresi.** `API_WEB_URL` (varsayılan `http://localhost:3000`) davet bağlantılarının tabanıdır: `${API_WEB_URL}/davet/<belirtec>`. E-posta doğrulama bağlantısı şimdilik `API_PUBLIC_URL` (api) üzerinden gider.
- **Oturum yönetimi.** `GET /v1/hesap/oturumlar`, `DELETE /v1/hesap/oturumlar/:id`, `POST /v1/hesap/oturumlar/tumunu-kapat`: sonlandırılan oturumun satırı silinir ve `sid` iptal listesine yazılır (erişim belirteci anında 401); denetim kaydı `hesap.denetim_kayitlari`na yazılır.
- Oturum, toplu davet ve toplu modül akışı: `services/api/scripts/oturum-akisi.sh` (başındaki açıklamaya bak; ayrı `api_g` veritabanı, port 4300).
- Uçtan uca deneme: `services/api/scripts/guvenlik-akisi.sh` (başındaki açıklamaya bak; ayrı `api_d` veritabanı, port 4200).
