# Dağıtım ve işletim: Docker imajları ve Kamal

Karar kaydı: [ADR 0005](../adr/0005-dagitim-docker-kamal.md) (topoloji, sağlayıcı koşulları, değişiklik notu), [ADR 0009](../adr/0009-guvenilir-proxy-istemci-ip.md) (güvenilir proxy). Barındırma sağlayıcısı **henüz seçilmedi**; sunucu adresleri, kayıt defteri ve alan adları yapılandırmada `<YER_TUTUCU>` olarak durur ve ilk dağıtımdan önce doldurulur.

## Özet

| Parça                 | Nerede                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Altı imaj             | `services/{api,motivasyon,bildirim,medya}/Dockerfile`, `apps/{web,admin}/Dockerfile` (bağlam: repo kökü) |
| Kamal yapılandırması  | `config/deploy.yml` (ortak) + `config/deploy.staging.yml` / `config/deploy.production.yml` (hedefe özel) |
| Servis seçimi         | `KOPRU_SERVIS=api\|motivasyon\|bildirim\|medya\|web\|admin` (her uygulama ayrı bir Kamal service'i)      |
| Sırlar                | `.kamal/secrets-common`, `.kamal/secrets.<hedef>` (git'e girmez; örnek: `.kamal/secrets.example`)        |
| Göç                   | `.kamal/hooks/pre-deploy` (owner rolü, yeni imajdan)                                                     |
| Sıralı dağıtım        | `infra/scripts/dagit.sh <hedef> [servis...]`                                                             |
| Yerel üretim denemesi | `infra/docker/compose.prod-yerel.yaml` + `infra/scripts/duman-testi.sh`                                  |

Roller: her servis uygulamasında `web` (HTTP, kamal-proxy önünde) ve `worker` (aynı imaj, `node dist/worker.js`, HTTP yok). `web` ve `admin` yalnız `web` rolü çalıştırır.

## İmajlar

- Çok aşamalı: `manifestler` (yalnız `package.json` + kilit dosyası; bağımlılık katmanı kaynak değişince yeniden kurulmaz) → `build` (`pnpm install --frozen-lockfile --filter '<paket>...'`, `pnpm run build` bağımlılık sırasıyla) → `runtime` (`node:24-slim`, kullanıcı `node`).
- Servisler: `pnpm deploy --prod --legacy` yalnız üretim bağımlılıklarını ve derlenmiş çıktıyı (`dist`, `migrations`) çıkarır. Kilit dosyası, `better-auth` gibi paketlerin isteğe bağlı eş bağımlılıklarını (next, playwright, vitest...) çözdüğü için bunlar deploy'a girer; Dockerfile sunucuda hiç yüklenmeyen bu paketleri siler ve yalnız glibc ikililerini kurar (`supportedArchitectures`). `sharp` (medya) önceden derlenmiş glibc ikilisiyle gelir; derleme araçları gerekmez.
- Web ve admin: Next.js `output: 'standalone'`, yalnız `NEXT_STANDALONE=1` ile (imaj derlemesi). Yerel geliştirme, e2e ve `next start` akışı değişmez. `NEXT_PUBLIC_*` değerleri **derleme zamanında** gömülür; üretim imajında `NEXT_PUBLIC_API_MOCK` verilmez. `API_URL`, `MEDYA_URL`, `BILDIRIM_URL`, `MOTIVASYON_URL` çalışma zamanında okunur.
- Aynı imaj üç iş yapar (komutla seçilir):

  ```sh
  docker run kopru/api                                      # HTTP: node dist/main.js
  docker run kopru/api node dist/worker.js                  # worker
  docker run kopru/api node dist/db/migrate-cli.js migrate  # göç (DATABASE_OWNER_URL ile)
  ```

  Diğer yönetim komutları da imajdadır: `node dist/platform-yonetici-ekle-cli.js`, `node dist/olaylari-yeniden-yayimla-cli.js`, `node dist/abonelik-kurumsal-cli.js` (api; `kamal app exec --reuse` ile).

- `HEALTHCHECK` (`infra/docker/saglik.mjs`, kabuk/curl gerekmez): HTTP süreçlerinde `GET /health` (web/admin: `/api/saglik`), worker'da `WORKER_SAGLIK_DOSYASI` dosyasının son 60 saniyede güncellenmiş olması.
- Build: `docker build -f services/api/Dockerfile -t kopru/api .` (repo kökünden). `.dockerignore` sırları (`.env*`, `.kamal/secrets*`), testleri, dokümanları ve mobil uygulamayı bağlamdan çıkarır.

## Sağlık uçları

| Uç                | Anlam                                                      | Kim kullanır                                |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `GET /health`     | Canlılık; bağımlılık denetlemez                            | Docker `HEALTHCHECK`                        |
| `GET /ready`      | Hazırlık: DB ve NATS (tanımlıysa); 200 ya da 503           | kamal-proxy dağıtım kapısı, yük dengeleyici |
| `GET /api/saglik` | web/admin canlılığı                                        | Docker `HEALTHCHECK`, kamal-proxy           |
| worker dosyası    | `WORKER_SAGLIK_DOSYASI` (`/tmp/worker-canli`) 10 sn'de bir | Docker `HEALTHCHECK` (worker rolünde)       |

kamal-proxy yeni sürümü `/ready` 200 verene kadar trafiğe almaz; eski sürüm sürerken yenisi yoksa dağıtım başarısız olur ve eskisi kalır.

## İlk kurulum (bir kez)

1. **Sanal makineler** (staging 1, production 2; ADR 0005): Ubuntu LTS, özel ağda. `deploy` kullanıcısı, `docker` grubunda, SSH anahtarıyla; parola girişi kapalı; yalnız yük dengeleyiciden 80/443 ve yönetim ağından 22 açık. Docker Engine kurulumu `kamal setup` ile otomatik yapılır (root ya da sudo gerekir); elle kurarsanız `docker` grubuna `deploy`'u ekleyin.
2. **Veri katmanı** (uygulama VM'lerinde değil): PostgreSQL (birincil + replika, pgBackRest), NATS JetStream (`-js`, dosya depolamalı), S3 uyumlu depolama (`medya-ozel` kovası; kovada tarayıcı PUT için CORS kuralı: izinli origin web alan adı, yöntemler `GET, PUT, HEAD`). Bu repoda altyapı kurulumu yoktur; gereksinimler ADR 0005'te.
3. **PostgreSQL rolleri ve veritabanları**: her servis için `<servis>` veritabanı ve `<servis>` (sahip, giriş yapabilen), `<servis>_owner` (girişsiz), `<servis>_app` (`NOBYPASSRLS`), `<servis>_sistem` (`BYPASSRLS`) rolleri; yerel örnek `infra/docker/postgres/init/01-roles-and-databases.sql`. Göç koşucusu rolleri `if not exists` oluşturmayı dener ama üretimde yetkiyi altyapı verir; şifreleri sır deposundan atayın (`ALTER ROLE ... PASSWORD`). `<servis>_APP_PASSWORD` göç değişkenleri yalnız geliştirme içindir, üretimde **verilmez**.
4. **Kayıt defteri** (Türkiye'de, özel): `config/deploy.yml` içindeki `registry.server`/`username` yer tutucularını doldurun, parolayı `KAMAL_REGISTRY_PASSWORD` sırrına koyun. Kayıt defterine yalnız CI/dağıtım makinesi yazar, sunucular okur.
5. **Alan adları ve TLS**: `deploy.<hedef>.yml` başındaki `api_alan`, `web_alan`, `admin_alan` ve `<ALAN_ADI>` yer tutucularını doldurun. Production'da TLS yük dengeleyicide sonlanır (`ssl: false`; iki sunucuda Kamal Let's Encrypt desteklemez). Staging tek sunucuda `ssl: true` ile Let's Encrypt kullanır; önünde yük dengeleyici varsa `false` yapın.
6. **Kamal**: dağıtım makinenize Kamal 2 kurun (`gem install kamal` ya da `docker run ghcr.io/basecamp/kamal`; sürüm 2.12 ile doğrulandı). `kamal config -d staging` komutuyla şema doğrulanır (hata yoksa yapı geçerlidir):

   ```sh
   KOPRU_SERVIS=api kamal config -d staging --version deneme
   ```

7. **Ağ ve güvenilir proxy** (ADR 0009): ilk dağıtımdan sonra `docker network inspect kamal` ile alt ağı öğrenin ve `deploy.<hedef>.yml` içindeki `<KAMAL_AG_ALT_AGI>` yerine yazın (örn. `172.18.0.0/16`). `*`, `true` ve `/0` kabul edilmez; servis açılışta durur. Servisler genel internete doğrudan açılmaz, yalnız kamal-proxy üzerinden.
8. **Sırlar**: `.kamal/secrets.example`'ı kopyalayıp `sir-oku` yer tutucularını sır yöneticinizin komutuyla değiştirin (aşağıdaki liste).
9. `kamal setup` her servis için bir kez (`KOPRU_SERVIS=<servis> kamal setup -d <hedef>`): Docker'ı, `kamal` ağını ve `kamal-proxy`'yi sunucuya kurar. kamal-proxy sunucu başına bir kez çalışır; sonraki servisler aynı proxy'ye kaydolur.

### Yönlendirme

Tek alan adında yol tabanlı yönlendirme (ADR 0005 uygulama notu): `api_alan` → `api`; `/v1/dosyalar` → `medya`; `/v1/bildirim` → `bildirim`; `/v1/motivasyon` → `motivasyon` (kamal-proxy `path_prefix`, en uzun önek kazanır). `/ic/*` yolları hiçbir önekle dışarı açılmaz; **api'de ise** kök önek tüm yolları kapsar; `/platform/*` yalnız `PLATFORM_IP_IZINLI` ile korunur. İsterseniz `/platform` yolunu yük dengeleyicide de engelleyin. Presigned yükleme adresi doğrudan S3'e gider (`S3_GENEL_ENDPOINT`). Web ve admin ayrı alt alan adlarındadır; **admin için kaynak IP kısıtını yük dengeleyicide uygulayın** (kamal-proxy IP filtresi sunmaz).

## İlk dağıtım ve sürümler

```sh
infra/scripts/dagit.sh staging                  # api -> motivasyon -> bildirim -> medya -> web -> admin
infra/scripts/dagit.sh production api web        # yalnız belirtilenler
KOPRU_SERVIS=api kamal deploy -d production      # tek servis
```

Her `kamal deploy`: imajı derler ve kayıt defterine iter (etiket: git sha; temiz ve işlenmiş ağaç ister) → `pre-deploy` hook'u göçü çalıştırır → yeni konteyner kalkar, `/ready` 200 verene kadar beklenir → trafik yeniye geçer, eskisi durur (sıfır kesinti) → `worker` rolü yenilenir. Çok sunuculu production'da Kamal sunucuları sırayla (rolling) günceller; kısa süre iki sürüm bir arada çalışır.

**Sıra kuralı:** olay üreticisi/şema sahibi önce (api), tüketiciler sonra. Olay sözleşmesi değişirse yeni alanlar önce tüketicide isteğe bağlı kabul edilir, sonra üretici yayınlar.

## Geri alma

```sh
KOPRU_SERVIS=api kamal rollback <git_sha> -d production   # son 5 sürüm konteyneri tutulur (retain_containers)
KOPRU_SERVIS=api kamal app details -d production          # çalışan sürümler
```

Geri alma yalnız uygulamayı döndürür, **göçü geri almaz**. Bu yüzden göçler genişlet-daralt kuralına uymalıdır: bir önceki sürüm, güncel şemayla çalışabilmelidir.

## Göç kuralları (genişlet-daralt)

- Göç `<servis>_owner` rolüyle, **yeni imajdan**, uygulama konteynerleri başlamadan önce çalışır; başarısızsa dağıtım durur ve eski sürüm kalır. Owner bağlantısı (`<SERVIS>_DATABASE_OWNER_URL`) uygulama ortamına girmez.
- **Genişlet:** yeni sütun/tablo/indeks eklenir (sütun `NULL` ya da varsayılanlı), yeni kod hem eski hem yeni şemayla çalışır. **Daralt:** eski sütunu kaldırma, bir sonraki sürümde (eski kod artık çalışmıyorken).
- Uzun kilit tutan göç yasak: `ALTER TABLE ... TYPE`, kilitleyen indeks. `CREATE INDEX CONCURRENTLY` kullanılır (göç koşucusu işlem dışı çalıştırmayı desteklemiyorsa ayrı, elle uygulanan bir adım olarak planlayın ve göçe not düşün).
- Göçü değiştirmeyin, yeni dosya ekleyin: uygulanmış dosyanın özeti denetlenir.
- Her tablo `kurum_id` + RLS + izolasyon testi taşır (ADR 0003).
- Çok sunuculu rolling güncellemede göç birincil sunucuda bir kez çalışır; iki sürüm aynı şemayla bir arada çalışabilmelidir.

## Sırlar ve ortam değişkenleri

Sır dosyasındaki ad `<SERVIS>_<DEĞİŞKEN>` biçimindedir, konteyner öneksiz görür. **Örnek değer yazılmaz.** "Z" zorunlu, "İ" isteğe bağlı. Tüm servislerde ortak (deploy yapılandırmasındaki düz değerler): `NODE_ENV=production`, `PORT`, `LOG_LEVEL`, `HOST`, `NATS_URL` (Z), `TRUST_PROXY` (Z, Kamal ağı alt ağı; boş bırakılırsa proxy'ye güvenilmez ve hız sınırları ortaklaşır), `AUTH_ENABLED` (motivasyon, bildirim ve medya için üretimde **zorunlu `true`**; `true` olmadan açılmazlar), `JWKS_URL` (Z, api dışı; `http://api:4000/.well-known/jwks.json`), `JWT_ISSUER` (api'nin `PUBLIC_URL`i ile aynı), `JWT_AUDIENCE`, `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `DATABASE_POOL_MAX`, `OPENAPI_ENABLED` (üretimde varsayılan kapalı), `OTEL_EXPORTER_OTLP_ENDPOINT` (İ; yoksa telemetri kapalı), `WORKER_SAGLIK_DOSYASI` (yalnız worker rolü).

| Servis     | Değişken (sır adı: `<SERVIS>_...`)                                                   | Tür     | Durum | Not                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ | ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| tümü       | `KAMAL_REGISTRY_PASSWORD`                                                            | sır     | Z     | Kayıt defteri parolası                                                                                                                              |
| tümü (göç) | `<SERVIS>_DATABASE_OWNER_URL`                                                        | sır     | Z     | Yalnız `pre-deploy` hook'u; owner rolüne geçebilen kullanıcı                                                                                        |
| api        | `DATABASE_URL`                                                                       | sır     | Z     | `api_app` (RLS'e tabi)                                                                                                                              |
| api        | `DATABASE_SISTEM_URL`                                                                | sır     | Z     | `api_sistem` (BYPASSRLS; worker, outbox relay)                                                                                                      |
| api        | `BETTER_AUTH_SECRET`                                                                 | sır     | Z     | >= 32 karakter; üretimde varsayılanla açılmaz                                                                                                       |
| api        | `KAYNAK_PAROLA_ANAHTARI`                                                             | sır     | Z\*   | 32 bayt base64; yoksa ders kaydı parolası uçları 503 (\*kayıt özelliği için)                                                                        |
| api        | `PUBLIC_URL`, `WEB_URL`                                                              | düz     | Z     | Herkese açık api adresi (JWT iss, Better Auth), web adresi (davet bağlantıları)                                                                     |
| api        | `MEDYA_URL`                                                                          | düz     | İ     | `http://medya:4003`; yoksa soru ekleri adressiz döner                                                                                               |
| api        | `MOTIVASYON_URL`, `BILDIRIM_URL`                                                     | düz     | Z     | KVKK veri dışa aktarma/silme için iç adresler (`http://motivasyon:4001`, `http://bildirim:4002`); `KVKK_SERVIS_ZAMAN_ASIMI_MS` (İ, varsayılan 3000) |
| api        | `API_KVKK_ARALIK_MS`                                                                 | düz     | İ     | KVKK işi aralığı (ms, worker); **önekli adla** okunur, varsayılan 3600000                                                                           |
| api        | `EPOSTA_SAGLAYICI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EPOSTA_GONDEREN`       | düz     | Z     | Üretimde `smtp`; `log` e-posta göndermez                                                                                                            |
| api        | `SMTP_USER`, `SMTP_PASS`                                                             | sır     | İ     | SMTP kimliği                                                                                                                                        |
| api        | `PLATFORM_IP_IZINLI`                                                                 | düz     | Z     | `/platform/*` için IP/CIDR; boşsa üretimde uçlar 403                                                                                                |
| api        | `ODEME_IYZICO`                                                                       | düz     | İ     | `kapali` \| `gercek` (`sahte` üretimde reddedilir)                                                                                                  |
| api        | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`                                                | sır     | İ     | `gercek` iken zorunlu                                                                                                                               |
| api        | `IYZICO_BASE_URL`, `IYZICO_PLAN_KODLARI`                                             | düz     | İ     | Üretim adresi; `{"<plan>:<aylik\|yillik>": "<referans>"}`                                                                                           |
| api        | `REVENUECAT_WEBHOOK_SIRRI`                                                           | sır     | İ     | Yoksa mağaza webhook'u kapalı (503)                                                                                                                 |
| api        | `GOOGLE_CLIENT_ID/_SECRET`, `APPLE_CLIENT_ID/_SECRET`                                | düz/sır | İ     | Her ikisi tanımlıysa sağlayıcı açılır                                                                                                               |
| api        | `EARSIV_SAGLAYICI`, `SMS_SAGLAYICI`                                                  | düz     | İ     | Şimdilik yalnız `log`                                                                                                                               |
| motivasyon | `DATABASE_URL`, `DATABASE_SISTEM_URL`                                                | sır     | Z     | `motivasyon_app`, `motivasyon_sistem`                                                                                                               |
| motivasyon | `PLATFORM_IP_IZINLI`                                                                 | düz     | İ     | Boşsa üretimde `/platform/*` kapalı                                                                                                                 |
| motivasyon | `HAFTALIK_ARALIK_MS`                                                                 | düz     | İ     | Varsayılan 600000                                                                                                                                   |
| bildirim   | `DATABASE_URL`, `DATABASE_SISTEM_URL`                                                | sır     | Z     | `bildirim_app`, `bildirim_sistem`                                                                                                                   |
| bildirim   | `PUSH_SAGLAYICI`                                                                     | düz     | Z     | Üretimde `expo` (`log` push göndermez)                                                                                                              |
| bildirim   | `EXPO_ERISIM_BELIRTECI`                                                              | sır     | İ     | Expo "enhanced security"                                                                                                                            |
| bildirim   | `EXPO_PUSH_URL`, `GONDERIM_ARALIK_MS`, `ZAMANLANMIS_ARALIK_MS`                       | düz     | İ     | Varsayılanlar yeterli                                                                                                                               |
| medya      | `DATABASE_URL`, `DATABASE_SISTEM_URL`                                                | sır     | Z     | `medya_app`, `medya_sistem`                                                                                                                         |
| medya      | `S3_ENDPOINT`                                                                        | düz     | Z     | Servis içi S3 adresi (üretimde zorunlu)                                                                                                             |
| medya      | `S3_GENEL_ENDPOINT`                                                                  | düz     | Z     | İstemciye verilen presigned adresin ana makinesi (genel erişilebilir olmalı)                                                                        |
| medya      | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                           | sır     | Z     |                                                                                                                                                     |
| medya      | `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`                                      | düz     | Z/İ   | Kova `medya-ozel`; kova ve CORS altyapıdan (`S3_KOVA_YAPILANDIR` üretimde kapalı)                                                                   |
| medya      | `VARSAYILAN_KOTA_BAYT`, `ISLEME_ESZAMANLILIK`, `ISLEME_ARALIK_MS`, `BAKIM_ARALIK_MS` | düz     | İ     | Varsayılanlar yeterli                                                                                                                               |
| web        | `API_URL`, `MEDYA_URL`, `BILDIRIM_URL`, `MOTIVASYON_URL`                             | düz     | Z     | Kamal ağı adları (`http://api:4000` ...)                                                                                                            |
| web        | `WEB_CSP_EK_KAYNAKLAR`                                                               | düz     | Z     | S3 uyumlu depolamanın **genel** adresi (CSP connect/img/media; presigned yükleme ve okuma için)                                                     |
| web        | `WEB_GUVENILEN_PROXY_SAYISI`                                                         | düz     | Z     | Önündeki güvenilen sıçrama sayısı (yük dengeleyici + kamal-proxy = 2); doğru değilse IP yanlış (ADR 0009)                                           |
| admin      | `WEB_CSP_EK_KAYNAKLAR`                                                               | düz     | Z     | web ile aynı değer (S3 genel adresi)                                                                                                                |
| admin      | `API_URL`, `MOTIVASYON_URL`, `ADMIN_GUVENILEN_PROXY_SAYISI`                          | düz     | Z     | Yukarıdakiyle aynı mantık                                                                                                                           |

Not: web ve admin `NEXT_PUBLIC_*` değişkenlerini derleme zamanında okur; çalışma zamanı sırrı taşımazlar. **`NEXT_PUBLIC_API_MOCK` üretimde asla tanımlanmaz** (BFF sahte kimliğe düşer): imaj derlemesi `--build-arg NEXT_PUBLIC_API_MOCK=...` ile hata verir, imaj başlatıcısı (`next-baslat.mjs`) ortamda tanımlıysa açılmayı reddeder. Denetim yalnız imajın içindedir; yerel `next start` ve e2e akışı etkilenmez.

## Ölçekleme notu

- Otomatik ölçekleme yoktur (ADR 0005). Yatay ölçek: sunucu eklemek için `deploy.<hedef>.yml` içindeki `makineler` listesine yeni IP eklenir, `kamal deploy` ya da `kamal app boot` çalıştırılır; yük dengeleyiciye eklenir. Tüm roller her makinede çalıştığı için `network-alias` yerel çözülür.
- **Worker çoğaltma güvenliği:** outbox relay satırları `for update skip locked` ile çeker; iki makinede iki worker güvenle çalışır (olay sırası aynı kurum içinde garanti değildir, tüketiciler idempotenttir ve olay kimliğiyle tekilleştirir). Zamanlanmış işler (`api`: ders serisi, abonelik geçişleri, ödeme işleri; `bildirim`: gönderim; `medya`: bakım) idempotent ve çoklu worker güvenli olacak şekilde yazılmıştır; yine de yeni bir zamanlanmış iş eklerken bu kuralı koruyun.
- Kubernetes geçiş ölçütleri ADR 0005'tedir; imajlar, sağlık uçları ve ortam değişkenleri aynen taşınır.

## Yerel üretim denemesi

```sh
docker compose -f infra/docker/compose.prod-yerel.yaml build
docker compose -f infra/docker/compose.prod-yerel.yaml up -d --wait
infra/scripts/duman-testi.sh
docker compose -f infra/docker/compose.prod-yerel.yaml down -v
```

Proje adı `kopru-prod-yerel`; 41800-41809 portları (api, motivasyon, bildirim, medya, web, admin, postgres, nats, S3, mailpit arayüzü). Geliştirme altyapısıyla (`kopru-*`) çakışmaz. Göçler imajdan, owner rolüyle `goc-*` işlerinde çalışır. İçindeki sırlar yalnız yerel deneme değerleridir.

CI: `.github/workflows/imajlar.yml` her PR ve `main` push'unda altı imajı derler (itmez), HTTP sürecinin `/health` ucunu, imajdaki `HEALTHCHECK` betiğini ve worker canlılığını dener.
