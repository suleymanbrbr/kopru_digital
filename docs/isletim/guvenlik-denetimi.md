# İç güvenlik denetimi (pentest öncesi, paket S1)

Tarih: 2026-11-19 · Dal: `fix/guvenlik-denetimi` · Kapsam: api, motivasyon, bildirim, medya, web, admin, webhook'lar, bağımlılıklar, sırlar. Günlükte kişisel veri (madde 9) D2 paketindedir; bu denetimde bakılmadı.

Önem: Yüksek (doğrudan veri/yetki kaybı), Orta (belirli koşulda istismar), Düşük (derinlemesine savunma), Bilgi (tasarım notu / kabul edilmiş risk).
Durum: **Düzeltildi** (kodda + testle kilitli), **Raporlandı** (tasarım kararı gerekir), **Kabul** (sebebiyle).

## Otomatik korumalar (yeni testler)

| Test | Ne yapar | Yeni açık nasıl yakalanır |
| --- | --- | --- |
| `services/*/src/rota-envanteri.test.ts` (4 servis) | Çalışma zamanında tüm Fastify rotalarını (`onRoute`) toplar. api: her rota `requirePermission`/platform kapısı/servis belirteci taşımalı ya da açık allowlist'te (herkese açık ve yalnız-kimlik ayrı listeler); kimliksiz istek her korumalı rotada 401. Diğer servisler: yalnız `/health`, `/ready`, `/openapi.json` herkese açık, geri kalan 401; bozuk/`alg=none` belirteç 401. | Yeni rota `public: true` ile açılırsa ya da kancasız eklenirse test kırılır; allowlist'e bilinçli ekleme gerekir. |
| `services/api/src/idor-tarama.test.ts` | İki kurum tohumlar (grup, öğrenci, ders, seri, paket satışı); B'nin tablolardaki tüm kayıt kimliklerini DB'den toplar. A sahip belirteciyle (1) tüm `/kurumlar/:kurum_id` rotalarında URL'e B kurumunu koyar (beklenen 403), (2) kendi kurumu + B'nin kimliklerini her yol parametresine dener: 5xx ya da B kimliği içeren 2xx gövde = hata; (3) başka kullanıcının oturumu silinemez. | Rota envanterinden üretildiği için yeni uçlar otomatik taranır. |
| `services/api/src/rol-yukseltme.test.ts` | Her rotanın yetki kancasını rol bazında doğrudan çalıştırır (gövde doğrulaması araya girmez): öğrenci personel yazma uçlarına, öğretmen abonelik/modül yazma/kurum ayarına giremez; taklit (`imp`) hiçbir yazma ucuna giremez; `/platform/*` kurum sahibi/öğretmen/öğrenci belirteciyle 403; öğrenci başkasının finans kartını, grup üyelerini göremez. | Öğrenciye açılan her yeni yazma ucu açık listeye bilinçli eklenmedikçe test kırılır. |
| `services/api/src/girdi-sinirlari.test.ts` | `limit` parametresi olan tüm kurum GET uçlarında aşırı değer reddi; 1 MB JSON gövde sınırı (413); webhook 256 KB sınırı (413); aşırı uzun alan 400; CORS izinsiz origin; Excel şablonunda formül kaçışı. | |
| `services/api/src/kimlik-guvenligi.test.ts` | OTP numaralandırma (aynı yanıt), telefon 5/saat ve IP 20/saat sınırı, 5 yanlış OTP sonrası kilit, e-posta giriş yanıt eşitliği, hesap kilidi, `alg=none`/HS256/yabancı anahtar/servis belirteci reddi, oturum sabitleme, çıkışta iptal. | |
| `apps/{web,admin}/src/sunucu/{csp,bff}.test.ts` | CSP/başlık üretimi, CSRF (Origin, Sec-Fetch-Site, Referer). | |
| `infra/scripts/sir-taramasi.sh` + CI | İzlenen dosyalarda özel anahtar, bulut/GitHub/Slack/Stripe anahtarı, JWT ve uzun gizli atama regex taraması; `.env.example`'da uzun değer denetimi. CI'da ayrıca `pnpm audit --prod --audit-level=high`. | |

## Bulgular

| No | Bulgu | Önem | Durum | Test / kanıt |
| --- | --- | --- | --- | --- |
| S1-01 | E-posta girişinde yalnız IP başına dakikada 10 deneme vardı; hesap başına sınır yoktu (dağıtık IP'lerle parola kaba kuvveti). Doğrulama: 12 yanlış denemeden sonra doğru parola 200 dönüyordu. | Orta | **Düzeltildi**: hesap başına 15 dakikada 10 başarısız deneme sonrası 429 (`hesap.otp_istekleri`, `eposta-giris:<adres>` anahtarı; göç gerekmedi). | `kimlik-guvenligi.test.ts` "hesabı kilitler"; `guvenlik-akisi-2.sh` |
| S1-02 | `AUTH_ENABLED` motivasyon/bildirim/medya'da varsayılan `false`; üretimde bayrak unutulursa kimlik doğrulama sessizce kapanırdı. | Orta | **Düzeltildi**: `NODE_ENV=production` iken `AUTH_ENABLED=true` olmayan süreç açılışta durur (`packages/service-kit/src/env.ts`). | `env.test.ts` |
| S1-03 | Web/admin'de CSP, HSTS ve Permissions-Policy yoktu (yalnız nosniff, Referrer-Policy, X-Frame-Options). | Düşük | **Düzeltildi**: web ve admin'e CSP (proxy'den, çalışma zamanı ortamına göre), HSTS (yalnız üretim), Permissions-Policy, COOP, `frame-ancestors 'none'`. | `csp.test.ts`; `curl -I` kanıtı |
| S1-04 | BFF CSRF denetimi `Origin` yoksa isteği kabul ediyordu; `Sec-Fetch-Site` ve `Referer` bakılmıyordu. | Düşük | **Düzeltildi**: `Sec-Fetch-Site` cross-site/same-site reddedilir; Origin yoksa Referer denetlenir (web + admin). Çerezler `SameSite` ile zaten ilk katmandı. | `bff.test.ts` |
| S1-05 | Oturum çerezinin `Secure` bayrağı yalnız `x-forwarded-proto`/https'e bağlıydı; proxy başlığı eksik gelirse üretimde `Secure` düşerdi. | Düşük | **Düzeltildi**: üretimde her zaman `Secure`. | kod; CSP testlerinin yanında `bff` |
| S1-06 | Deneme Excel şablonunda `ogrenci_no` ve bölüm adı/kodu hücreleri formül kaçışından geçmiyordu (`=HYPERLINK(...)`, CSV/XLSX enjeksiyonu). Rapor ve finans dışa aktarımları zaten kaçışlıydı. | Düşük | **Düzeltildi**: tüm kullanıcı kaynaklı hücreler `hucreMetni` ile (`=`, `+`, `-`, `@`, sekme, CR). | `girdi-sinirlari.test.ts` |
| S1-07 | Ders kaynağı bağlantısı: `new URL` sekme/satır sonunu sessizce siler; saklanan metin ile çözülen adres ayrışabilirdi. `javascript:`, `http:`, `data:` zaten reddediliyordu; sunucu bağlantıyı hiç çekmediği için SSRF yok. | Düşük | **Düzeltildi**: boşluk/denetim karakteri reddedilir. | `kaynak-url.test.ts` |
| S1-08 | `POST /auth/eposta/kayit` kayıtlı adres için 409 "Bu e-posta ile kayıtlı bir hesap var" döner (hesap numaralandırma). Giriş ve doğrulama-gönder yanıtları eşit; OTP kayıtlı/kayıtsız aynı. | Orta (tasarım) | **Raporlandı**: kayıt anında oturum verildiği için tek tip yanıt, "e-postayı doğrula" akışına geçmeyi (kayıt → her zaman 200 + doğrulama e-postası, oturum doğrulama sonrası) gerektirir. Mevcut sınır: IP başına dakikada 10. Faz 1'de e-posta girişi ikincil; karar proje sahibinde. | `kimlik-guvenligi.test.ts` (409 belgelenmiş) |
| S1-09 | Hesap kilidi (S1-01) saldırganın bilinen bir adresi 15 dakika kilitlemesine (hizmet engelleme) izin verir. Kabul edilen dengedir; OTP girişi etkilenmez. | Bilgi | **Kabul** | |
| S1-10 | iyzico webhook imzası (V3) yalnız olay türü + referans kodlarını kapsar, gövdenin tamamını ve zaman damgasını değil; imzalı alanlar dışında tekrar oynatma penceresi uygulanamaz. Tekrar oynatma `abonelik_olaylari (kaynak, dis_olay_id)` benzersizliğiyle idempotent; iyzico olayında ödeme ayrıntısı API'den doğrulanarak işlenir. İmza karşılaştırması `timingSafeEqual`; RevenueCat paylaşılan sır da sabit zamanlı. Gövde 256 KB. | Bilgi | **Kabul** (sağlayıcı protokolü); sandbox'ta zaman damgası alanı doğrulanınca pencere eklenebilir | `abonelik-odeme.test.ts`, `girdi-sinirlari.test.ts` |
| S1-11 | Oturum (yenileme) belirteci opak ve kayan 30 gün; yeniden kullanım (çalınma) tespiti yok. Çıkış ve toplu kapatma `sid` iptal listesine yazılır ve anında etkilidir. | Bilgi | **Raporlandı**: döndürülen (rotating) yenileme belirteci + aile iptali büyük tasarım değişikliği (ADR 0004/0008 revizyonu). | `guvenlik.test.ts` |
| S1-12 | CSP `script-src` Next.js satır içi önyükleme betikleri için `'unsafe-inline'` içerir (nonce, sayfaları dinamik çizmeyi gerektirir). Dış betik kaynağı, `eval` (üretimde), `object`, `base`, form hedefi ve çerçeveleme kapalı; betik yalnız kendi origin'i ve iyzico'dan. | Bilgi | **Raporlandı**: nonce'a geçiş ayrı iş (performans/önbellek etkisi). | `csp.test.ts` |
| S1-13 | `pnpm audit --prod`: 3 orta düzey, dolaylı (`exceljs>uuid` <11.1.1 yalnız `buf` argümanlı v3/v5/v6'da; `expo>@expo/cli>glob/minimatch` geliştirme aracı). Yüksek/kritik yok. | Bilgi | **Kabul**; CI `--audit-level=high` ile yeni yüksek açıkta kırılır. | CI |
| S1-14 | `hesap.otp_istekleri` hiç temizlenmiyor (OTP ve e-posta giriş sayaçları burada); tablo zamanla büyür (saatlik/15 dakikalık pencere dışındaki satırlar işe yaramaz). | Bilgi | **Raporlandı**: bakım işine "30 günden eski satırı sil" eklenmeli (D2/operasyon). | |
| S1-15 | `NEXT_PUBLIC_API_MOCK=1` build/çalışma ortamında bırakılırsa web/admin BFF tamamen mock'a düşer (sahte kimlik). Üretimde `next start` zaten `NODE_ENV=production` olduğundan koddan ayırt edilemez (e2e de aynı biçimde çalışır). | Orta (operasyonel) | **Raporlandı**: dağıtım (D1: Dockerfile/Kamal) bu değişkeni set etmemeli; imaj yapım adımına "mock bayrağı yok" denetimi eklenmeli. | |
| S1-16 | Şema doğrulaması yetki kancasından önce çalıştığı için bazı POST/PATCH'lerde yetkisiz istek önce 400 alır; veriye dokunulmaz, ifşa yok (rota envanteri ve IDOR taraması bunu bilerek kabul eder, yetki kancası ayrıca `rol-yukseltme.test.ts` ile doğrudan sınanır). | Bilgi | **Kabul** | |

## Temiz çıkan alanlar (bakıldı, açık yok)

- **JWT**: EdDSA JWKS; `iss`, `aud`, `exp` doğrulanır; `alg=none`, HS256 karışıklığı, yabancı anahtar, servis belirteci (kullanıcı ucunda) ve bozuk belirteç 401. `sid` iptali anında etkili.
- **Yol parametreleri**: BFF vekilleri parçayı `^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$` ile sınırlar ve izinli yol desenleri uygular; `..`, `%2e%2e`, `%2f`, çift eğik çizgi (308 ile normalize) hedefe ulaşmaz.
- **Açık yönlendirme**: `devamGecerliMi` yalnız uygulama içi yol (`//`, mutlak adres, ters eğik çizgi reddedilir); ödeme dönüşü `WEB_URL` ortam değişkeninden sabit.
- **XSS**: markdown (web/mobil) `marked.lexer` token ağacı + React öğeleri; HTML üretilmez, `dangerouslySetInnerHTML` yok; bağlantı yalnız http/https.
- **Medya**: depolama anahtarı sunucuda üretilir (`{kurum}/{tur}/{yyyy}/{mm}/{id}`), özgün dosya adı kullanılmaz; yol enjeksiyonu yok.
- **CORS**: api yalnız `CORS_ORIGINS` listesine izin verir (boş = kapalı), credentials yok.
- **Sırlar**: `.env.example`'da gerçek değer yok (yalnız belirgin geliştirme yer tutucuları); `ODEME_IYZICO=sahte` ve varsayılan `BETTER_AUTH_SECRET` üretimde açılışta reddedilir. Sır taraması temiz.
- **Platform**: 2FA, IP izin listesi, taklit yazma yasağı, rol (`destek`/`yonetici`) testleri zaten vardı; bu denetimde kurum rolleriyle tüm `/platform/*` uçlarının 403'ü eklendi.
