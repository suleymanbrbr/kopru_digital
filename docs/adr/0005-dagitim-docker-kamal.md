# 0005. Dağıtım: Docker, Kamal ve Türkiye'de barındırma

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Kullanıcı verisi (öğrenci, veli, öğretmen kişisel verileri; KVKK kapsamı) Türkiye'de barındırılır. Ekip küçüktür, nöbet yükü düşük tutulmalıdır. Dört servis, PostgreSQL, NATS JetStream ve nesne depolaması işletilir. İlk yıl yük, birkaç yüz kurum ve onbinlerce öğrenci ölçeğindedir.

## Karar

### Barındırma

- Tüm üretim bileşenleri (uygulama sanal makineleri, PostgreSQL, NATS, nesne depolama, yedekler) Türkiye'deki veri merkezlerinde çalışır. Yedekler de Türkiye içinde, farklı bir veri merkezine yazılır.
- Sağlayıcı seçimi bu ADR'nin kapsamı dışındadır, ama şu koşulları sağlamalıdır: Türkiye veri merkezi, özel ağ (VLAN), S3 uyumlu nesne depolama, anlık görüntü (snapshot), ISO 27001 belgesi.
- TLS, Türkiye içindeki uç noktada sonlandırılır. Yurt dışı CDN/WAF kullanılmaz (KVKK yurt dışına aktarım riski). Statik web varlıkları kendi sunucularımızdan verilir.
- Üçüncü taraf yurt dışı işleyiciler (APNs/FCM/Expo push, Apple/Google giriş) kaçınılmazdır. Bildirim içeriği en az kişisel veri taşır (isim, not, ödev metni yok; yalnızca genel metin ve derin bağlantı). Bu liste KVKK envanterinde ve aydınlatma metninde yer alır.

### Paketleme ve dağıtım

- Her servis (`api`, `motivasyon`, `bildirim`, `medya`) ve her web uygulaması (`web`) bir Docker imajıdır. Node.js 24, çok aşamalı derleme, root olmayan kullanıcı.
- Dağıtım aracı Kamal'dır. `config/deploy.<servis>.yml` her servis için tanımlıdır. Kamal Proxy (`kamal-proxy`) sağlık denetimi (`/saglik/hazir`) geçene kadar trafiği eski sürümde tutar (sıfır kesinti).
- İmajlar özel (Türkiye'de) bir kayıt defterine itilir. Etiket: `git sha`. Geri alma: `kamal rollback <sha>`.
- Sırlar: Kamal sırları, ortam değişkeni olarak ve sağlayıcıdan bağımsız bir sır deposundan. Depoda sır tutulmaz.
- Ortamlar: `staging` ve `production`. `production` en az iki uygulama VM'i çalıştırır, `staging` bir VM.

### Topoloji (başlangıç)

| Bileşen | Üretim |
| --- | --- |
| Uygulama VM'leri | 2 adet. Her birinde `api`, `motivasyon`, `bildirim`, `medya` ve `web` konteynerleri (Kamal rolleri: `web`, `worker`). |
| PostgreSQL | Ayrı VM'lerde birincil + akış replikası. Tek kümede 4 veritabanı (`api`, `motivasyon`, `bildirim`, `medya`), her biri kendi kullanıcılarıyla. Sürekli arşivleme ve PITR (`pgBackRest`), günlük tam yedek, 14 gün saklama. |
| NATS JetStream | Başlangıçta tek düğüm, dosya depolamalı. Hedef: 3 düğüm. Geçiş, `replicas=3` ayarıyla yapılır. |
| Nesne depolama | S3 uyumlu, Türkiye içinde. Kovalar: `medya-ozel` (tüm kullanıcı dosyaları, herkese kapalı). |
| Giriş | Her VM'de `kamal-proxy`, önünde sağlayıcı yük dengeleyicisi. |

Arka plan işleri `pg-boss` ile ilgili servisin kendi veritabanında çalışır; ayrı kuyruk altyapısı yoktur. `worker` rolü HTTP almaz.

### Veritabanı migrasyonları

Drizzle migrasyonları `{servis}_owner` rolüyle, dağıtım adımında (`kamal` pre-deploy hook) çalışır. Genişlet-daralt (expand/contract) kuralı zorunludur: sütun ekleme ve yeni kod önce, eski sütunu kaldırma bir sonraki sürümde. Uzun kilit tutan migrasyon (`ALTER TABLE ... TYPE`, kilitleyen indeks) yasaktır; `CREATE INDEX CONCURRENTLY` kullanılır.

### Gözlemlenebilirlik

OpenTelemetry izleri ve yapılandırılmış JSON günlükleri, `korelasyon_id` ile. Metrik ve günlükler Türkiye'de barındırılan bir yığına (Prometheus, Loki, Grafana) akar. Alarm: p95 gecikme, 5xx oranı, DLQ boyutu, outbox gecikmesi (`now() - min(olusma_zamani)` bekleyenler için), disk ve WAL, yedek yaşı.

### Kubernetes'e geçiş ölçütleri

Aşağıdaki ölçütlerden **en az ikisi** iki ardışık çeyrekte sağlanırsa Kubernetes geçişi değerlendirilir:

1. Uygulama VM sayısı 6'yı aşar veya servis sayısı 8'i aşar.
2. Servislerden birinin yatay ölçeklemesi otomatik (yük bazlı) olmak zorundadır ve Kamal ile elle ölçekleme operasyonel yük yaratıyordur (ayda 2'den fazla ölçekleme müdahalesi).
3. Birden fazla bölge/veri merkezinde etkin-etkin çalışma gereksinimi doğar (SLA %99,95 üzeri).
4. Sağlayıcı yönetilen Kubernetes sunar ve işletim yükünü ekip içinde taşımak yerine devretmek daha ucuzdur.
5. Müşteri sözleşmeleri (kurumsal) izole ortam/ağ politikası ister, VM düzeyinde karşılanamaz.

Geçiş yolu: imajlar zaten konteynerdir, sağlık uç noktaları ve ortam değişkeni yapılandırması aynı kalır. Veri katmanı (PostgreSQL, NATS, nesne depolama) küme dışında kalır; yalnızca uygulama katmanı taşınır.

## Sonuçlar

Olumlu:

- Basit, tekrarlanabilir dağıtım. Sıfır kesintili sürüm ve tek komutla geri alma.
- Veri konumu net: her bileşen Türkiye'de.
- Konteynerleştirme, ileride Kubernetes'e geçişi ucuz tutar.

Olumsuz:

- Otomatik ölçekleme yoktur. Kapasite elle planlanır.
- PostgreSQL ve NATS'ı biz işletiriz (yedek, yükseltme, replikasyon sınaması). Başlangıçta tek NATS düğümü, düğüm kaybında kısa süreli olay gecikmesi/kaybı riski taşır. Outbox sayesinde yayımlanmamış olaylar kaybolmaz, yayımlanıp stream'de duran olaylar disk yedeğine bağlıdır.
- Yurt dışı bağımlılıklar (push, sosyal giriş) tam veri yerelliğini engeller. Bu durum hukuki olarak belgelenmelidir.
- Kamal ile çok VM'li rolling güncelleme sırasında, farklı sürümler aynı anda çalışır. Olay şeması ve veritabanı geriye uyumlu olmak zorundadır.

## Değerlendirilen alternatifler

**Baştan Kubernetes.** Esnek, ama küme işletimi ve YAML yükü bu ekip için orantısız. Reddedildi (geçiş ölçütleri yukarıda).

**Yönetilen PaaS (yurt dışı).** Hızlı, ama veri yerelliğini bozar. Reddedildi.

**Docker Compose / elle SSH dağıtımı.** Sıfır kesinti ve geri alma yoktur. Reddedildi. Kamal bu boşluğu küçük bir araçla kapatır.

**Docker Swarm / Nomad.** Kamal'dan daha fazla kümeleme yükü getirir, daha az ekosistem desteği vardır. Reddedildi.

**Yönetilen PostgreSQL.** Türkiye'de uygun sağlayıcı bulunursa tercih edilir. Karar sağlayıcı seçimine bağlıdır ve bu ADR'yi bozmaz. Bağlantı bilgisi ortam değişkeni olduğu için geçiş bir yapılandırma işidir.

## Uygulama notu: medya yönlendirmesi

Canlıda istemciler medya servisine ayrı bir alan adı yerine **aynı alan adında yol tabanlı yönlendirmeyle** ulaşır: kök proxy `/v1/dosyalar*` yollarını `medya`ya, diğer `/v1/*` yollarını `api`ye gönderir (`/ic/*` hiçbir zaman dışarı açılmaz). Böylece web (aynı origin) ve mobil için tek taban adres yeterlidir; yükleme baytları ise presigned adresle doğrudan nesne depolamaya gider (`medya-ozel` kovası, kovada tarayıcı PUT için CORS kuralı). Geliştirmede proxy yoktur: medya ayrı portta (4003) çalışır ve istemci medya taban adresini ayrıca bilir; presigned adreslerin ana makinesi `MEDYA_S3_GENEL_ENDPOINT` ile (simülatör/tarayıcı için `localhost:9000`) ayarlanır.
