# kopru_digital — Ürün ve teknik plan (özet)

> claude.ai'deki "kopru_digital (v2) — Uçtan Uca Ürün ve Teknik Plan" dokümanının özeti (7 Kasım 2026). Ayrıntılı gerekçeler ADR'lerde.

## Ürün

Türkiye için eğitim operasyon platformu. Müşteriler: solo özel ders hocası (birebir ve grup), koçluk ekipleri, kurumlar (kurs, etüt merkezi, okul: kademe ve sınıflarla). Web + tek mobil uygulama (iOS/Android). İlham: takiphocam.com; fark: native uygulama, öğrenci motivasyon sistemi (evrilen karakter, XP, seri), ders/para takibi, sınıf/kurum desteği. "TakipHocam" adı kullanılamaz; çalışma adı `kopru_digital`.

**Faz 1 rolleri:** sahip, yönetici, öğretmen, öğrenci. **Veli Faz 1'de yok** (veri modelinde var, arayüz Faz 2).

**Faz 1 kapsamı:** hesap ve kurum (OTP/Apple/Google giriş, ilk girişte KVKK onayı, grup/sınıf/kademe, atamalar, davetler, rol/izin, modül aç-kapa), takvim ve yoklama (çevrimdışı), ders sonu geri bildirimi, ders kayıtları ve materyaller (link tabanlı), paket/kredi/tahsilat, müfredat kütüphanesi, ödev, haftalık plan, deneme analizi, soru sor (fotoğraf; metin/fotoğraf/çizim/ses cevap), motivasyon (yol arkadaşı karakter + Rive, XP, seviye, seri, rozet, odak sayacı), bildirimler ve duyurular, öğretmen/öğrenci ana ekranları, yönetici paneli, abonelik (web iyzico, mağaza içi RevenueCat), platform yönetim paneli. Ayrıntı: [ozellik-sartnamesi.md](ozellik-sartnamesi.md).

**Kapsam dışı (kararla):** erken uyarı, sınav geri sayımı, veli ödül sözleşmesi, QR yoklama, takvim aboneliği, sınav haftası modu, mezun vitrini.

**Varsayılan ayarlar kurum ayarıdır:** soru kotası, öğrencinin kendi deneme girişi, öğretmenin grup kurması, öğrencinin kalan ders sayısını görmesi.

## Mimari (ADR 0001)

4 servis + 2 uygulama, tek monorepo:

| Servis                            | İçerik                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `api` (çekirdek, içeride modüler) | hesap, ders, finans, ogrenme, abonelik modülleri; modül başına PostgreSQL şeması. Yoklama + kredi düşümü aynı işlemde |
| `motivasyon`                      | XP, seviye, seri, rozet, karakter, odak; yalnız olaylarla beslenir                                                    |
| `bildirim`                        | push, e-posta, SMS, bildirim kutusu, duyurular                                                                        |
| `medya`                           | yükleme izni, işleme, yaşam döngüsü silme                                                                             |

Servisler arası iletişim NATS JetStream + outbox (ADR 0002). Kiracı izolasyonu `kurum_id` + RLS (ADR 0003). Kimlik: Better Auth (api) + JWT/JWKS (ADR 0004). Dağıtım: Docker + Kamal, Türkiye'de sanal sunucular (ADR 0005).

## Teknoloji

TypeScript her yerde; Node.js 24 LTS, Fastify 5, Zod 4, OpenAPI; Drizzle + PostgreSQL 17; NATS JetStream; pg-boss; Better Auth; Next.js 16 + Tailwind v4 + shadcn/ui; Expo (güncel SDK) + Expo Router + NativeWind + Rive; TanStack Query; RevenueCat; iyzico; Netgsm; S3 uyumlu depolama (yerelde MinIO); OpenTelemetry + Grafana; GlitchTip; GitHub Actions. Önbellek (Valkey) ihtiyaç ölçülünce eklenecek; Kubernetes ihtiyaç olunca.

## Takvim (9 Kasım 2026 başlangıç, 45 hafta)

| Hafta | Tarih                | Blok                                                                                    |
| ----- | -------------------- | --------------------------------------------------------------------------------------- |
| 1–3   | 9–29 Kas 2026        | Keşif ve temel: repo, ADR, wireframe, karakter konsepti, Rive prototipi                 |
| 4–9   | 30 Kas – 10 Oca 2027 | Platform temeli: service-kit, hesap modülü, NATS+outbox, web/mobil iskelet, CI, staging |
| 10–14 | 11 Oca – 14 Şub      | Operasyon: takvim, yoklama, finans                                                      |
| 15–20 | 15 Şub – 28 Mar      | Öğrenme: müfredat, ödev, plan, deneme                                                   |
| 21–25 | 29 Mar – 2 May       | Soru sor, ders kayıtları, geri bildirim                                                 |
| 26    | 3 May                | Erken beta (10–15 hoca)                                                                 |
| 26–31 | 3 May – 13 Haz       | Motivasyon servisi                                                                      |
| 32–34 | 14 Haz – 4 Tem       | Ana ekranlar, bildirimler, duyurular, yönetici paneli                                   |
| 35–37 | 5–25 Tem             | Abonelik, platform yönetim paneli                                                       |
| 38–40 | 26 Tem – 15 Ağu      | Production hazırlığı, pentest, mağaza                                                   |
| 41–44 | 16 Ağu – 12 Eyl      | Genel beta                                                                              |
| 45    | 13–19 Eyl 2027       | Lansman                                                                                 |

## Kullanıcının tarafındaki açık işler

Şirket kurulumu; D-U-N-S + Apple Developer; Google Play; iyzico; Netgsm; KVKK avukatı (18 yaş altı onay metni); Türkiye'de bulut sağlayıcı seçimi; karakter konseptleri için görsel üretim aracı ve çizer/Rive animatörü.
