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
| MinIO         | S3 `9000`, konsol `http://localhost:9001`   | `medya` bucket'ı otomatik oluşur                                                |
| Mailpit       | SMTP `1025`, arayüz `http://localhost:8025` | Giden e-postalar burada görünür                                                 |
| Grafana       | `http://localhost:3030`                     | Loki, Tempo, Prometheus + OTLP `4317` / `4318`                                  |

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

## Outbox ve olay akışı

- Tablo şablonu: `packages/service-kit/migrations/outbox.sql` (`renderOutboxMigration(schema)` ile şema adı doldurulur). Her servis bunu kendi migration'larına dahil eder.
- Worker süreci (`src/worker.ts`) `DATABASE_URL` ve `NATS_URL` tanımlıysa `EVENTS` stream'ini (`evt.>`) oluşturur ve `startOutboxRelay` ile bekleyen olayları `FOR UPDATE SKIP LOCKED` kullanarak JetStream'e yayınlar. `Nats-Msg-Id` olay id'sidir; tekrar gönderimler JetStream'in duplicate penceresinde elenir.
- Outbox tablosu migration ile oluşturulmadan worker çalıştırılırsa relay her saniye hata loglar; önce migration'ı uygulayın.

## CI

`.github/workflows/ci.yml`: PR ve `main` push'larında Node 24 + pnpm ile `format:check`, `lint`, `typecheck`, `test` (postgres:17 service container, `DATABASE_URL` ile) ve `build` çalışır.
